/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Codeblock-Umbruch / Fence Wrap – wrap the editor selection in a Markdown
// code fence (```lang … ```) with optional language Soft.
// Abgrenzung: math-snippets=Formeln; callout-inserter=Callouts;
// template-library=Vorlagen; hier=``` Fence um Selection.
// Soft: no notes / vault / network. Activate = load settings only.
// Mirror Soft: wikilink-wrap / callout-inserter selection wrap patterns.

const SETTINGS_KEY = 'settings'
const PANEL_ID = 'fence'
const LANG_RE = /^[a-zA-Z0-9_+#.-]{0,32}$/
const LANG_FILTER_RE = /[^a-zA-Z0-9_+#.-]/g
const LANG_MAX = 32

/**
 * @typedef {{
 *   language: string,
 *   defaultLanguage: string,
 *   trimEdges: boolean,
 * }} Settings
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  language: '',
  defaultLanguage: '',
  trimEdges: true,
}

/** @type {Settings} */
let settings = { ...DEFAULT_SETTINGS }

/** @type {FaNotes.Panel | null} */
let panel = null

/** Bilingual UI helper: German default, English when app language is `en`. */
function t(de, en) {
  return fanotes.app.language === 'en' ? en : de
}

function errMessage(error) {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return String(error ?? 'unknown')
}

function isNoPanel(error) {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'E_NO_PANEL',
  )
}

/**
 * Soft language sanitize: full match /^[a-zA-Z0-9_+#.-]{0,32}$/ keeps as-is;
 * else filter Soft to allowed chars (max 32) or empty.
 * @param {unknown} raw
 * @returns {string}
 */
function sanitizeLanguage(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  if (LANG_RE.test(s)) return s
  const filtered = s.replace(LANG_FILTER_RE, '').slice(0, LANG_MAX)
  return filtered
}

/**
 * @param {unknown} raw
 * @returns {Settings}
 */
function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const obj = /** @type {Record<string, unknown>} */ (raw)
  return {
    language: sanitizeLanguage(typeof obj.language === 'string' ? obj.language : ''),
    defaultLanguage: sanitizeLanguage(
      typeof obj.defaultLanguage === 'string' ? obj.defaultLanguage : '',
    ),
    trimEdges: obj.trimEdges !== false,
  }
}

async function loadSettings() {
  try {
    const stored = await fanotes.storage.get(SETTINGS_KEY)
    settings = normalizeSettings(stored)
  } catch (error) {
    fanotes.log('loadSettings failed', errMessage(error))
    settings = { ...DEFAULT_SETTINGS }
  }
}

/**
 * Persist settings; on failure restore `rollback` when provided.
 * Soft: returns false on failure after toast.
 * @param {Settings} [rollback]
 * @returns {Promise<boolean>}
 */
async function saveSettings(rollback) {
  try {
    await fanotes.storage.set(SETTINGS_KEY, {
      language: settings.language,
      defaultLanguage: settings.defaultLanguage,
      trimEdges: settings.trimEdges === true,
    })
    return true
  } catch (error) {
    if (rollback) settings = { ...rollback }
    await fanotes.ui.toast(
      t(`Speichern fehlgeschlagen: ${errMessage(error)}`, `Save failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

/**
 * Soft already-fenced: trimmed selection starts with ```.
 * @param {string} text
 */
function looksAlreadyFenced(text) {
  // Soft already-fenced: wenn trim startet mit ``` → kein Double-Wrap
  return String(text ?? '').trim().startsWith('```')
}

/**
 * Soft trimEdges: strip leading/trailing newlines only (not all whitespace).
 * @param {string} text
 */
function trimEdgeNewlines(text) {
  return String(text ?? '').replace(/^\n+/, '').replace(/\n+$/, '')
}

/**
 * Resolve Soft language for wrap: override → language → defaultLanguage → ''.
 * @param {string | undefined} override
 */
function resolveLanguage(override) {
  if (override !== undefined) return sanitizeLanguage(override)
  const fromPanel = sanitizeLanguage(settings.language)
  if (fromPanel) return fromPanel
  return sanitizeLanguage(settings.defaultLanguage)
}

/**
 * Output Soft: ```lang\nbody\n``` (lang empty → ```\nbody\n```).
 * @param {string} lang
 * @param {string} body
 */
function formatFence(lang, body) {
  const open = lang ? '```' + lang : '```'
  return `${open}\n${body}\n\`\`\``
}

/**
 * Core wrap flow.
 * Soft opts.languageOverride: use this Soft language for this call (wrap-lang).
 * Soft opts.skipPersistLang: do not write prompted language into settings.
 * @param {{ languageOverride?: string, skipPersistLang?: boolean }} [opts]
 */
async function runWrap(opts) {
  const languageOverride = opts && opts.languageOverride !== undefined ? opts.languageOverride : undefined

  try {
    /** @type {FaNotes.Selection | null} */
    let sel = null
    try {
      sel = await fanotes.editor.getSelection()
    } catch (error) {
      await fanotes.ui.toast(
        t(
          `Auswahl nicht lesbar: ${errMessage(error)}`,
          `Could not read selection: ${errMessage(error)}`,
        ),
        'error',
      )
      return false
    }

    const selRaw = sel && typeof sel.text === 'string' ? sel.text : ''
    if (!sel || sel.from === sel.to || !selRaw) {
      await fanotes.ui.toast(
        t('Bitte Text markieren', 'Please select text'),
        'info',
      )
      return false
    }

    // Soft already-fenced: trim startet mit ``` → toast info, kein Double-Wrap.
    if (looksAlreadyFenced(selRaw)) {
      await fanotes.ui.toast(
        t(
          'Auswahl ist bereits ein Codeblock – nichts geändert.',
          'Selection is already a code fence – nothing changed.',
        ),
        'info',
      )
      return false
    }

    let body = selRaw
    if (settings.trimEdges === true) {
      body = trimEdgeNewlines(body)
    }

    const lang = resolveLanguage(languageOverride)
    const out = formatFence(lang, body)

    try {
      const ok = await fanotes.editor.replaceSelection(out)
      if (!ok) {
        await fanotes.ui.toast(
          t('Kein Markdown-Editor geöffnet.', 'No Markdown editor is open.'),
          'error',
        )
        return false
      }
    } catch (error) {
      await fanotes.ui.toast(
        t(`Ersetzen fehlgeschlagen: ${errMessage(error)}`, `Replace failed: ${errMessage(error)}`),
        'error',
      )
      return false
    }

    // Soft: when wrap-lang provided an override, remember Soft language in settings.
    if (
      languageOverride !== undefined &&
      !(opts && opts.skipPersistLang) &&
      sanitizeLanguage(languageOverride) !== settings.language
    ) {
      const prev = { ...settings }
      settings.language = sanitizeLanguage(languageOverride)
      await saveSettings(prev)
    }

    await fanotes.ui.toast(
      lang
        ? t(`Auswahl als Codeblock (${lang}) umhüllt.`, `Selection wrapped as code fence (${lang}).`)
        : t('Auswahl als Codeblock umhüllt.', 'Selection wrapped as code fence.'),
      'success',
    )

    await refreshPanel()
    return true
  } catch (error) {
    await fanotes.ui.toast(
      t(`Umhüllen fehlgeschlagen: ${errMessage(error)}`, `Wrap failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

/**
 * wrap-lang Soft: prompt language Soft via ui.prompt, then wrap.
 */
async function runWrapLang() {
  let value = null
  try {
    value = await fanotes.ui.prompt(
      t('Sprache für den Codeblock:', 'Language for the code fence:'),
      {
        title: t('Codeblock mit Sprache', 'Code fence with language'),
        placeholder: t('z. B. js, python, ts…', 'e.g. js, python, ts…'),
        value: resolveLanguage(undefined),
      },
    )
  } catch (error) {
    await fanotes.ui.toast(
      t(`Prompt fehlgeschlagen: ${errMessage(error)}`, `Prompt failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
  if (value == null) return false
  const lang = sanitizeLanguage(value)
  return runWrap({ languageOverride: lang })
}

/**
 * Apply panel values into settings before wrap.
 * @param {Record<string, unknown>} values
 */
async function applyPanelValues(values) {
  if (!values || typeof values !== 'object') return true
  const prev = { ...settings }

  if (values.language != null) {
    settings.language = sanitizeLanguage(values.language)
  }
  if (values.trimEdges !== undefined) {
    settings.trimEdges = values.trimEdges === true || values.trimEdges === 'true'
  }

  const ok = await saveSettings(prev)
  if (!ok) {
    settings = prev
    return false
  }
  return true
}

function renderBlocks() {
  /** @type {FaNotes.Block[]} */
  return [
    { type: 'heading', text: t('Codeblock-Umbruch', 'Fence Wrap'), level: 2 },
    {
      type: 'text',
      muted: true,
      text: t(
        'Umhüllt die Editor-Auswahl mit einem Markdown-Codeblock (``` … ```) und optionaler Sprache.',
        'Wraps the editor selection in a Markdown code fence (``` … ```) with an optional language.',
      ),
    },
    {
      type: 'input',
      id: 'language',
      label: t('Sprache (leer = ohne Sprache)', 'Language (empty = plain fence)'),
      value: settings.language,
      placeholder: t('z. B. js, python, ts', 'e.g. js, python, ts'),
    },
    {
      type: 'checkbox',
      id: 'trimEdges',
      label: t('Rand-Zeilenumbrüche entfernen', 'Trim leading/trailing newlines'),
      checked: settings.trimEdges === true,
    },
    {
      type: 'callout',
      tone: 'info',
      text: t(
        'Bereits mit ``` beginnende Auswahl wird nicht doppelt umhüllt. Sprache: nur a-z A-Z 0-9 _ + # . - (max. 32). Abgrenzung: math-snippets = Formeln, callout-inserter = Callouts, template-library = Vorlagen.',
        'Selection already starting with ``` is not double-wrapped. Language: only a-z A-Z 0-9 _ + # . - (max 32). Boundaries: math-snippets = formulas, callout-inserter = callouts, template-library = templates.',
      ),
    },
    {
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'wrap',
          label: t('Umhüllen', 'Wrap'),
          primary: true,
        },
      ],
    },
  ]
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Codeblock-Umbruch', 'Fence Wrap'))
  } catch (error) {
    if (isNoPanel(error)) {
      panel = null
      return
    }
    fanotes.log('refreshPanel', errMessage(error))
  }
}

function openPanel() {
  try {
    if (panel) {
      void panel.show().catch((error) => {
        if (isNoPanel(error)) panel = null
        else fanotes.log('panel.show', errMessage(error))
      })
      void refreshPanel()
      return
    }

    panel = fanotes.ui.panel({
      id: PANEL_ID,
      title: t('Codeblock-Umbruch', 'Fence Wrap'),
      icon: '⌨️',
      blocks: renderBlocks(),
      focus: true,
    })

    panel.onAction(async (action) => {
      try {
        const values = action.values || {}
        if (action.id === 'wrap') {
          const ok = await applyPanelValues(values)
          if (!ok) {
            await refreshPanel()
            return
          }
          await runWrap()
          return
        }
        if (action.id === 'submit:language') {
          const ok = await applyPanelValues(values)
          if (!ok) {
            await refreshPanel()
            return
          }
          await fanotes.ui.toast(t('Einstellungen gespeichert.', 'Settings saved.'), 'success')
          await refreshPanel()
        }
      } catch (error) {
        await fanotes.ui.toast(
          t(`Aktion fehlgeschlagen: ${errMessage(error)}`, `Action failed: ${errMessage(error)}`),
          'error',
        )
      }
    })

    panel.onInput(async (input) => {
      try {
        if (input.id === 'language') {
          const prev = settings.language
          settings.language = sanitizeLanguage(input.value)
          const ok = await saveSettings({ ...settings, language: prev })
          if (!ok) {
            settings.language = prev
            await refreshPanel()
            return
          }
          await refreshPanel()
          return
        }
        if (input.id === 'trimEdges') {
          const prev = settings.trimEdges
          settings.trimEdges = input.value === true
          const ok = await saveSettings({ ...settings, trimEdges: prev })
          if (!ok) {
            settings.trimEdges = prev
            await refreshPanel()
            return
          }
          await refreshPanel()
        }
      } catch (error) {
        fanotes.log('onInput failed', errMessage(error))
      }
    })
  } catch (error) {
    void fanotes.ui.toast(
      t(
        `Panel konnte nicht geöffnet werden: ${errMessage(error)}`,
        `Could not open panel: ${errMessage(error)}`,
      ),
      'error',
    )
  }
}

// --- Commands ---------------------------------------------------------------

fanotes.commands.register({
  id: 'wrap',
  title: t('Auswahl als Codeblock umhüllen', 'Wrap selection as code fence'),
  detail: t(
    'Auswahl mit ``` … ``` umhüllen (Sprache aus Einstellungen)',
    'Wrap selection with ``` … ``` (language from settings)',
  ),
  keywords: 'wrap fence codeblock code markdown backticks umhüllen',
  run: async () => {
    try {
      await runWrap()
    } catch (error) {
      await fanotes.ui.toast(
        t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`),
        'error',
      )
    }
  },
})

fanotes.commands.register({
  id: 'wrap-lang',
  title: t('Auswahl als Codeblock mit Sprache', 'Wrap selection as code fence with language'),
  detail: t(
    'Sprache per Prompt abfragen und Auswahl umhüllen',
    'Prompt for a language, then wrap the selection',
  ),
  keywords: 'wrap fence language sprache codeblock prompt markdown',
  run: async () => {
    try {
      await runWrapLang()
    } catch (error) {
      await fanotes.ui.toast(
        t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`),
        'error',
      )
    }
  },
})

fanotes.commands.register({
  id: 'open',
  title: t('Codeblock-Umbruch öffnen', 'Open Fence Wrap'),
  detail: t(
    'Panel mit Sprache und trimEdges',
    'Panel with language and trimEdges',
  ),
  keywords: 'panel open öffnen settings fence wrap codeblock',
  run: () => {
    try {
      openPanel()
    } catch (error) {
      void fanotes.ui.toast(
        t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`),
        'error',
      )
    }
  },
})

// --- Lifecycle --------------------------------------------------------------

fanotes.onActivate(async () => {
  try {
    await loadSettings()
    fanotes.log(
      'fence-wrap activated',
      fanotes.app.appVersion,
      fanotes.app.language,
      settings.language,
      settings.trimEdges,
    )
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(() => {
  panel = null
})
