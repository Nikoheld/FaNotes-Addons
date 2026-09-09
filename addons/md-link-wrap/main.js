/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Markdown-Link / Markdown Link Wrap – wrap the editor selection as [text](url).
// Abgrenzung: wikilink-wrap=[[ ]]; url-collector=URLs sammeln; path-copier=Pfad;
// hier=[text](url) Wrap. Soft: no vault / notes / network.
// Mirror Soft: wikilink-wrap / path-copier clipboard Soft.
// Activate = load settings only.

const SETTINGS_KEY = 'settings'
const PANEL_ID = 'mdl'

/** @typedef {'prompt' | 'clipboard'} UrlSource */

/**
 * @typedef {{
 *   urlSource: UrlSource,
 *   openPromptAlways: boolean,
 * }} Settings
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  urlSource: 'prompt',
  openPromptAlways: true,
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
 * Soft urlSource enum.
 * @param {unknown} raw
 * @returns {UrlSource}
 */
function normalizeUrlSource(raw) {
  const s = String(raw ?? '').trim().toLowerCase()
  if (s === 'clipboard' || s === 'prompt') return s
  return DEFAULT_SETTINGS.urlSource
}

/**
 * @param {unknown} raw
 * @returns {Settings}
 */
function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const obj = /** @type {Record<string, unknown>} */ (raw)
  return {
    urlSource: normalizeUrlSource(obj.urlSource),
    openPromptAlways: obj.openPromptAlways !== false,
  }
}

/**
 * @returns {Settings}
 */
function cloneSettings() {
  return {
    urlSource: settings.urlSource,
    openPromptAlways: settings.openPromptAlways === true,
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
      urlSource: settings.urlSource,
      openPromptAlways: settings.openPromptAlways === true,
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
 * Soft: trimmed text looks like http(s) URL.
 * @param {string} raw
 * @returns {string | null} trimmed URL or null
 */
function asHttpUrl(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const lower = s.toLowerCase()
  if (lower.startsWith('https://') || lower.startsWith('http://')) return s
  return null
}

/**
 * Soft clipboard read: prefer readText when host provides it; else null.
 * (Documented SDK is write-only Soft; clip Soft path degrades to prompt.)
 * @returns {Promise<string | null>}
 */
async function readClipboardText() {
  try {
    const clip = /** @type {{ readText?: () => Promise<string>, writeText: (t: string) => Promise<boolean> }} */ (
      fanotes.clipboard
    )
    if (typeof clip.readText !== 'function') {
      fanotes.log('clipboard.readText unavailable Soft – fall back to prompt')
      return null
    }
    const text = await clip.readText()
    return typeof text === 'string' ? text : null
  } catch (error) {
    fanotes.log('clipboard.readText failed', errMessage(error))
    return null
  }
}

/**
 * Soft prompt for URL. Empty / cancel → null.
 * @param {string} [prefill]
 * @returns {Promise<string | null>}
 */
async function promptForUrl(prefill) {
  try {
    const value = await fanotes.ui.prompt(
      t('URL für den Markdown-Link:', 'URL for the Markdown link:'),
      {
        title: t('Markdown-Link', 'Markdown Link'),
        placeholder: 'https://',
        value: typeof prefill === 'string' ? prefill : '',
      },
    )
    if (value == null) return null
    const trimmed = String(value).trim()
    if (!trimmed) return null
    return trimmed
  } catch (error) {
    await fanotes.ui.toast(
      t(`Prompt fehlgeschlagen: ${errMessage(error)}`, `Prompt failed: ${errMessage(error)}`),
      'error',
    )
    return null
  }
}

/**
 * Resolve Soft URL: clipboard path when source Soft is clipboard (or forced),
 * else / on miss / when openPromptAlways → prompt.
 * Soft empty/cancel → null (caller returns).
 * @param {{ forceClipboard?: boolean }} [opts]
 * @returns {Promise<string | null>}
 */
async function resolveUrl(opts) {
  const forceClipboard = Boolean(opts && opts.forceClipboard)
  const useClipboard = forceClipboard || settings.urlSource === 'clipboard'
  const alwaysPrompt = settings.openPromptAlways === true

  if (useClipboard) {
    const raw = await readClipboardText()
    const fromClip = asHttpUrl(raw ?? '')
    if (fromClip) {
      if (alwaysPrompt) {
        return promptForUrl(fromClip)
      }
      return fromClip
    }
    // Soft clipboard empty / not http(s) → prompt Soft
    return promptForUrl('')
  }

  return promptForUrl('')
}

/**
 * Core wrap Soft.
 * Soft forceClipboard: force clipboard Soft path once (wrap-clipboard).
 * @param {{ forceClipboard?: boolean }} [opts]
 */
async function runWrap(opts) {
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
    const text = selRaw.trim()
    if (!text || !sel || sel.from === sel.to) {
      await fanotes.ui.toast(
        t('Bitte Text markieren', 'Please select text'),
        'info',
      )
      return false
    }

    const url = await resolveUrl(opts)
    if (url == null || !String(url).trim()) {
      // Soft empty / cancel → return (no toast Soft for cancel)
      return false
    }

    const out = `[${text}](${String(url).trim()})`

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

    await fanotes.ui.toast(
      t('Auswahl als Markdown-Link umhüllt.', 'Selection wrapped as Markdown link.'),
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
 * Apply panel values into settings before wrap.
 * @param {Record<string, unknown>} values
 */
async function applyPanelValues(values) {
  if (!values || typeof values !== 'object') return true
  const prev = cloneSettings()

  if (values.urlSource != null) {
    settings.urlSource = normalizeUrlSource(values.urlSource)
  }
  if (values.openPromptAlways !== undefined) {
    settings.openPromptAlways =
      values.openPromptAlways === true || values.openPromptAlways === 'true'
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
    { type: 'heading', text: t('Markdown-Link', 'Markdown Link Wrap'), level: 2 },
    {
      type: 'text',
      muted: true,
      text: t(
        'Macht aus der Editor-Auswahl einen Markdown-Link [Text](URL).',
        'Turns the editor selection into a Markdown link [text](url).',
      ),
    },
    {
      type: 'select',
      id: 'urlSource',
      label: t('URL-Quelle', 'URL source'),
      value: settings.urlSource,
      options: [
        { value: 'prompt', label: t('Prompt', 'Prompt') },
        { value: 'clipboard', label: t('Zwischenablage', 'Clipboard') },
      ],
    },
    {
      type: 'checkbox',
      id: 'openPromptAlways',
      label: t('Prompt immer öffnen', 'Always open prompt'),
      checked: settings.openPromptAlways === true,
    },
    {
      type: 'callout',
      tone: 'info',
      text: t(
        'Zwischenablage: nur nicht-leere http/https-URLs. Sonst Prompt (Platzhalter https://). Abgrenzung: wikilink-wrap = [[…]]; url-collector = URLs sammeln; path-copier = Pfad.',
        'Clipboard: only non-empty http/https URLs. Otherwise prompt (placeholder https://). Distinction: wikilink-wrap = [[…]]; url-collector = collect URLs; path-copier = path.',
      ),
    },
    {
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'wrap',
          label: t('Link erzeugen', 'Create link'),
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
    await panel.setTitle(t('Markdown-Link', 'Markdown Link Wrap'))
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
      title: t('Markdown-Link', 'Markdown Link Wrap'),
      icon: '🔗',
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
        if (action.id === 'submit:urlSource') {
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
        if (input.id === 'urlSource') {
          const prev = cloneSettings()
          settings.urlSource = normalizeUrlSource(input.value)
          const ok = await saveSettings(prev)
          if (!ok) {
            settings = prev
            await refreshPanel()
            return
          }
          await refreshPanel()
          return
        }
        if (input.id === 'openPromptAlways') {
          const prev = cloneSettings()
          settings.openPromptAlways = input.value === true
          const ok = await saveSettings(prev)
          if (!ok) {
            settings = prev
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
  title: t('Auswahl als Markdown-Link umhüllen', 'Wrap selection as Markdown link'),
  detail: t(
    'Auswahl als [Text](URL) umhüllen (URL aus Einstellungen)',
    'Wrap selection as [text](url) (URL from settings)',
  ),
  keywords: 'wrap markdown link url href hyperlink verlinken umhüllen',
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
  id: 'wrap-clipboard',
  title: t(
    'Auswahl als Markdown-Link (Zwischenablage)',
    'Wrap selection as Markdown link (clipboard)',
  ),
  detail: t(
    'Erzwingt Zwischenablage-URL für diesen Aufruf',
    'Forces clipboard URL for this call',
  ),
  keywords: 'wrap clipboard zwischenablage markdown link url href',
  run: async () => {
    try {
      await runWrap({ forceClipboard: true })
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
  title: t('Markdown-Link öffnen', 'Open Markdown Link Wrap'),
  detail: t(
    'Panel mit URL-Quelle und Prompt-Option',
    'Panel with URL source and prompt option',
  ),
  keywords: 'panel open öffnen settings markdown link wrap',
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
      'md-link-wrap activated',
      fanotes.app.appVersion,
      fanotes.app.language,
      settings.urlSource,
      settings.openPromptAlways,
    )
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(() => {
  panel = null
})
