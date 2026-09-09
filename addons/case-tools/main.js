/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Groß-/Kleinschreibung / Case Tools – upper, lower, title or toggle selection case.
// Abgrenzung: line-tools = Zeilen sortieren/dedupen; hier = Zeichen-Case der Selection.
// Soft: no notes / vault / network / clipboard. Activate = load settings only.

const STORAGE_KEY = 'settings'
const PANEL_ID = 'case'

/**
 * @typedef {{
 *   titleLocale: 'auto' | 'de' | 'en',
 * }} Settings
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  titleLocale: 'auto',
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
 * @param {unknown} raw
 * @returns {Settings}
 */
function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const obj = /** @type {Record<string, unknown>} */ (raw)
  const localeRaw = typeof obj.titleLocale === 'string' ? obj.titleLocale.trim().toLowerCase() : 'auto'
  /** @type {'auto' | 'de' | 'en'} */
  let titleLocale = 'auto'
  if (localeRaw === 'de' || localeRaw === 'en' || localeRaw === 'auto') titleLocale = localeRaw
  return { titleLocale }
}

async function loadSettings() {
  try {
    const raw = await fanotes.storage.get(STORAGE_KEY)
    settings = normalizeSettings(raw)
  } catch (error) {
    fanotes.log('loadSettings failed', errMessage(error))
    settings = { ...DEFAULT_SETTINGS }
  }
}

/**
 * Persist settings; on failure restore `rollback` when provided.
 * @param {Settings} [rollback]
 * @returns {Promise<boolean>}
 */
async function persistSettings(rollback) {
  try {
    await fanotes.storage.set(STORAGE_KEY, {
      titleLocale: settings.titleLocale,
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
 * Locale for toLocaleUpperCase / toLocaleLowerCase.
 * Soft: titleLocale auto → fanotes.app.language de→'de' en→'en' else undefined.
 * @returns {string | undefined}
 */
function getCaseLocale() {
  let lang = settings.titleLocale
  if (lang === 'auto') {
    const appLang = String(fanotes.app.language || '').toLowerCase()
    if (appLang === 'de') lang = 'de'
    else if (appLang === 'en') lang = 'en'
    else return undefined
  }
  if (lang === 'de' || lang === 'en') return lang
  return undefined
}

/**
 * Soft title: split on /[^\p{L}\p{N}']+/u keeping separators;
 * capitalize first letter of each word (toLocaleUpperCase first char + rest lower Soft).
 * @param {string} text
 * @param {string | undefined} lang
 */
function toTitleCase(text, lang) {
  const parts = String(text).split(/([^\p{L}\p{N}']+)/u)
  return parts
    .map((part) => {
      if (!part) return part
      if (/^[^\p{L}\p{N}']+$/u.test(part)) return part
      const first = part.charAt(0)
      const rest = part.slice(1)
      return first.toLocaleUpperCase(lang) + rest.toLocaleLowerCase(lang)
    })
    .join('')
}

/**
 * Soft toggle: if sel === upper(sel) then lower else upper.
 * @param {string} text
 * @param {string | undefined} lang
 */
function toggleCase(text, lang) {
  const upper = text.toLocaleUpperCase(lang)
  if (text === upper) return text.toLocaleLowerCase(lang)
  return upper
}

/**
 * @param {'upper' | 'lower' | 'title' | 'toggle'} mode
 * @param {string} text
 * @param {string | undefined} lang
 */
function transform(mode, text, lang) {
  if (mode === 'upper') return text.toLocaleUpperCase(lang)
  if (mode === 'lower') return text.toLocaleLowerCase(lang)
  if (mode === 'title') return toTitleCase(text, lang)
  return toggleCase(text, lang)
}

/**
 * Soft: getSelection; empty → toast; replaceSelection(transformed); toast success.
 * Mirrors editor Soft from line-tools.
 * @param {'upper' | 'lower' | 'title' | 'toggle'} mode
 */
async function runCase(mode) {
  /** @type {FaNotes.Selection | null} */
  let sel = null
  try {
    sel = await fanotes.editor.getSelection()
  } catch (error) {
    await fanotes.ui.toast(
      t(`Auswahl lesen fehlgeschlagen: ${errMessage(error)}`, `Could not read selection: ${errMessage(error)}`),
      'error',
    )
    return
  }

  if (!sel || typeof sel.text !== 'string' || !sel.text) {
    await fanotes.ui.toast(
      t('Braucht Auswahl', 'Needs a selection'),
      'info',
    )
    return
  }

  const lang = getCaseLocale()
  const next = transform(mode, sel.text, lang)

  try {
    const ok = await fanotes.editor.replaceSelection(next)
    if (!ok) {
      await fanotes.ui.toast(
        t('Kein Markdown-Editor geöffnet.', 'No Markdown editor is open.'),
        'error',
      )
      return
    }
  } catch (error) {
    await fanotes.ui.toast(
      t(`Ersetzen fehlgeschlagen: ${errMessage(error)}`, `Replace failed: ${errMessage(error)}`),
      'error',
    )
    return
  }

  /** @type {Record<'upper' | 'lower' | 'title' | 'toggle', [string, string]>} */
  const msgs = {
    upper: ['In Großbuchstaben umgewandelt', 'Converted to upper case'],
    lower: ['In Kleinbuchstaben umgewandelt', 'Converted to lower case'],
    title: ['In Titelschreibweise umgewandelt', 'Converted to title case'],
    toggle: ['Groß-/Kleinschreibung umgeschaltet', 'Toggled letter case'],
  }
  const [de, en] = msgs[mode]
  await fanotes.ui.toast(t(de, en), 'success')
}

function renderBlocks() {
  /** @type {FaNotes.Block[]} */
  return [
    { type: 'heading', text: t('Groß-/Kleinschreibung', 'Case Tools'), level: 2 },
    {
      type: 'text',
      muted: true,
      text: t(
        'Braucht Auswahl – wirkt nur auf die markierte Editorstelle.',
        'Needs a selection — acts only on the marked editor text.',
      ),
    },
    { type: 'divider' },
    {
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'upper',
          label: 'GROSS',
        },
        {
          type: 'button',
          id: 'lower',
          label: 'klein',
        },
        {
          type: 'button',
          id: 'title',
          label: t('Titel', 'Title'),
          primary: true,
        },
        {
          type: 'button',
          id: 'toggle',
          label: t('Umschalten', 'Toggle'),
        },
      ],
    },
    { type: 'divider' },
    {
      type: 'select',
      id: 'titleLocale',
      label: t('Sprache für Umwandlung', 'Locale for case transform'),
      value: settings.titleLocale,
      options: [
        { value: 'auto', label: t('Auto (App-Sprache)', 'Auto (app language)') },
        { value: 'de', label: 'de' },
        { value: 'en', label: 'en' },
      ],
    },
    {
      type: 'callout',
      tone: 'info',
      text: t(
        'Zeichen-Case der Selection – keine Zeilen-Operationen (→ line-tools). Kein Vault-Zugriff.',
        'Character case of the selection — not line operations (→ line-tools). No vault access.',
      ),
    },
  ]
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Groß-/Kleinschreibung', 'Case Tools'))
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
      title: t('Groß-/Kleinschreibung', 'Case Tools'),
      icon: 'Aa',
      blocks: renderBlocks(),
    })

    panel.onAction(async (action) => {
      try {
        if (action.id === 'upper') {
          await runCase('upper')
          return
        }
        if (action.id === 'lower') {
          await runCase('lower')
          return
        }
        if (action.id === 'title') {
          await runCase('title')
          return
        }
        if (action.id === 'toggle') {
          await runCase('toggle')
          return
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
        if (input.id === 'titleLocale') {
          const prev = { ...settings }
          const v = String(input.value ?? '').trim().toLowerCase()
          if (v === 'de' || v === 'en' || v === 'auto') {
            settings.titleLocale = v
            const ok = await persistSettings(prev)
            await refreshPanel()
            if (!ok) return
          }
        }
      } catch (error) {
        fanotes.log('onInput', errMessage(error))
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
  id: 'open',
  title: t('Groß-/Kleinschreibung öffnen', 'Open Case Tools'),
  detail: t(
    'Panel: GROSS, klein, Titel, Umschalten',
    'Panel: UPPER, lower, Title, Toggle',
  ),
  keywords: 'case groß klein upper lower title toggle panel öffnen open',
  run: () => {
    try {
      openPanel()
    } catch (error) {
      void fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'upper',
  title: t('Auswahl in GROSSBUCHSTABEN', 'Selection to UPPER CASE'),
  detail: t(
    'Markierten Text in Großbuchstaben umwandeln',
    'Convert the selected text to upper case',
  ),
  keywords: 'upper groß gross uppercase case',
  run: async () => {
    try {
      await runCase('upper')
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'lower',
  title: t('Auswahl in kleinbuchstaben', 'Selection to lower case'),
  detail: t(
    'Markierten Text in Kleinbuchstaben umwandeln',
    'Convert the selected text to lower case',
  ),
  keywords: 'lower klein lowercase case',
  run: async () => {
    try {
      await runCase('lower')
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'title',
  title: t('Auswahl in Titelschreibweise', 'Selection to Title Case'),
  detail: t(
    'Jeden Wortanfang groß, Rest klein',
    'Capitalize the first letter of each word',
  ),
  keywords: 'title titel capital case',
  run: async () => {
    try {
      await runCase('title')
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'toggle',
  title: t('Groß-/Kleinschreibung umschalten', 'Toggle letter case'),
  detail: t(
    'Wenn alles groß → klein, sonst → groß',
    'If all upper → lower, otherwise → upper',
  ),
  keywords: 'toggle umschalten case switch',
  run: async () => {
    try {
      await runCase('toggle')
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.onActivate(async () => {
  try {
    await loadSettings()
    fanotes.log('case-tools activated', fanotes.app.appVersion, settings)
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(() => {
  panel = null
})
