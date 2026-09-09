/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Pfad kopieren / Path Copier – copy path, title or wikilink of the active note
// to the clipboard. Abgrenzung: pinboard = merken; wikilink-wrap = Selection
// umhüllen; hier = Metadaten der aktiven Notiz → clipboard.writeText.
// Activate = load settings only. Soft: notes.active OK for resolve/panel;
// kein heavy vault scan (kein notes.list / tree / search).

const STORAGE_KEY = 'settings'
const PANEL_ID = 'copy'
const STATUS_ID = 'mode'
const TRUNCATE_LEN = 48

/**
 * @typedef {'path' | 'title' | 'wikilink'} CopyMode
 */

/**
 * @typedef {{
 *   defaultMode: CopyMode,
 *   showStatus: boolean,
 * }} Settings
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  defaultMode: 'path',
  showStatus: false,
}

/** @type {Settings} */
let settings = { ...DEFAULT_SETTINGS }

/** @type {FaNotes.Panel | null} */
let panel = null

/**
 * Soft cache for panel keyvalue (path/title). Refreshed on panel open / copy Soft.
 * @type {{ path: string, title: string } | null}
 */
let panelMeta = null

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
 * Soft basename without extension from a vault-relative path.
 * @param {string} path
 */
function basenameNoExt(path) {
  const raw = String(path ?? '')
  const slash = Math.max(raw.lastIndexOf('/'), raw.lastIndexOf('\\'))
  const base = slash >= 0 ? raw.slice(slash + 1) : raw
  const dot = base.lastIndexOf('.')
  if (dot > 0) return base.slice(0, dot)
  return base || raw
}

/**
 * Truncate Soft ~48 for keyvalue display.
 * @param {string} text
 * @param {number} [max]
 */
function truncateSoft(text, max = TRUNCATE_LEN) {
  const s = String(text ?? '')
  if (s.length <= max) return s
  if (max <= 1) return '…'
  return `${s.slice(0, Math.max(1, max - 1))}…`
}

/**
 * @param {unknown} raw
 * @returns {CopyMode}
 */
function normalizeMode(raw) {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (v === 'path' || v === 'title' || v === 'wikilink') return v
  return 'path'
}

/**
 * @param {unknown} raw
 * @returns {Settings}
 */
function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const obj = /** @type {Record<string, unknown>} */ (raw)
  return {
    defaultMode: normalizeMode(obj.defaultMode),
    showStatus: obj.showStatus === true,
  }
}

/**
 * @returns {Settings}
 */
function cloneSettings() {
  return {
    defaultMode: settings.defaultMode,
    showStatus: settings.showStatus === true,
  }
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
      defaultMode: settings.defaultMode,
      showStatus: settings.showStatus === true,
    })
    return true
  } catch (error) {
    if (rollback) {
      settings = {
        defaultMode: rollback.defaultMode,
        showStatus: rollback.showStatus === true,
      }
    }
    await fanotes.ui.toast(
      t(`Speichern fehlgeschlagen: ${errMessage(error)}`, `Save failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

/**
 * Soft resolve: notes.active(); missing → toast error; return null.
 * Title Soft: note.title || basename without ext.
 * @param {{ silent?: boolean }} [opts]
 * @returns {Promise<{ path: string, title: string } | null>}
 */
async function resolveActive(opts = {}) {
  const silent = opts.silent === true
  /** @type {FaNotes.ActiveNote | null} */
  let active = null
  try {
    active = await fanotes.notes.active()
  } catch (error) {
    fanotes.log('notes.active failed', errMessage(error))
    if (!silent) {
      await fanotes.ui.toast(
        t(`Aktive Notiz lesen fehlgeschlagen: ${errMessage(error)}`, `Could not read active note: ${errMessage(error)}`),
        'error',
      )
    }
    return null
  }

  if (!active || typeof active.path !== 'string' || !active.path) {
    if (!silent) {
      await fanotes.ui.toast(
        t('Keine aktive Notiz.', 'No active note.'),
        'error',
      )
    }
    return null
  }

  const titleRaw = typeof active.title === 'string' ? active.title.trim() : ''
  const title = titleRaw || basenameNoExt(active.path) || active.path
  return { path: active.path, title }
}

/**
 * Wikilink Soft: `[[${title}]]` (Titel, nicht Pfad).
 * @param {string} title
 */
function toWikilink(title) {
  return `[[${title}]]`
}

/**
 * @param {CopyMode} mode
 * @param {{ path: string, title: string }} meta
 */
function textForMode(mode, meta) {
  if (mode === 'title') return meta.title
  if (mode === 'wikilink') return toWikilink(meta.title)
  return meta.path
}

/**
 * Soft clipboard: writeText + toast success|error.
 * @param {CopyMode} mode
 */
async function copyMode(mode) {
  const meta = await resolveActive()
  if (!meta) return

  panelMeta = meta
  const text = textForMode(mode, meta)

  try {
    const ok = await fanotes.clipboard.writeText(text)
    if (ok === false) {
      await fanotes.ui.toast(
        t('Kopieren fehlgeschlagen.', 'Copy failed.'),
        'error',
      )
      return
    }
  } catch (error) {
    await fanotes.ui.toast(
      t(`Kopieren fehlgeschlagen: ${errMessage(error)}`, `Copy failed: ${errMessage(error)}`),
      'error',
    )
    return
  }

  /** @type {Record<CopyMode, [string, string]>} */
  const msgs = {
    path: ['Pfad kopiert.', 'Path copied.'],
    title: ['Titel kopiert.', 'Title copied.'],
    wikilink: ['Wikilink kopiert.', 'Wikilink copied.'],
  }
  const [de, en] = msgs[mode]
  await fanotes.ui.toast(t(de, en), 'success')

  if (panel) void refreshPanel({ silent: true })
}

/**
 * Short mode abbrev for status Soft.
 * @param {CopyMode} mode
 */
function modeAbbrev(mode) {
  if (mode === 'title') return t('Titel', 'Title')
  if (mode === 'wikilink') return 'Wiki'
  return t('Pfad', 'Path')
}

/**
 * Status Soft: if showStatus, short mode abbrev, onClick = copy default.
 * No vault scan — only settings.defaultMode.
 */
async function updateStatus() {
  try {
    if (!settings.showStatus) {
      await fanotes.ui.status.remove(STATUS_ID)
      return
    }
    const abbrev = modeAbbrev(settings.defaultMode)
    await fanotes.ui.status.set({
      id: STATUS_ID,
      text: `📋 ${abbrev}`.slice(0, 60),
      title: t(
        'Standardmodus in Zwischenablage kopieren',
        'Copy default mode to clipboard',
      ),
      onClick: () => {
        void copyMode(settings.defaultMode).catch((error) => {
          fanotes.log('status onClick failed', errMessage(error))
        })
      },
    })
  } catch (error) {
    fanotes.log('updateStatus failed', errMessage(error))
  }
}

function renderBlocks() {
  const pathDisp = panelMeta ? truncateSoft(panelMeta.path) : t('(keine Notiz)', '(no note)')
  const titleDisp = panelMeta ? truncateSoft(panelMeta.title) : t('(keine Notiz)', '(no note)')

  /** @type {FaNotes.Block[]} */
  return [
    { type: 'heading', text: t('Pfad kopieren', 'Path Copier'), level: 2 },
    {
      type: 'text',
      muted: true,
      text: t(
        'Metadaten der aktiven Notiz in die Zwischenablage – kein Vault-Scan.',
        'Active-note metadata to the clipboard — no vault scan.',
      ),
    },
    {
      type: 'keyvalue',
      items: [
        { key: t('Pfad', 'Path'), value: pathDisp },
        { key: t('Titel', 'Title'), value: titleDisp },
      ],
    },
    { type: 'divider' },
    {
      type: 'select',
      id: 'defaultMode',
      label: t('Standardmodus', 'Default mode'),
      value: settings.defaultMode,
      options: [
        { value: 'path', label: t('Pfad', 'Path') },
        { value: 'title', label: t('Titel', 'Title') },
        { value: 'wikilink', label: 'Wikilink' },
      ],
    },
    {
      type: 'button',
      id: 'copy-default',
      label: t('Kopieren', 'Copy'),
      primary: true,
    },
    {
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'copy-path',
          label: t('Pfad', 'Path'),
        },
        {
          type: 'button',
          id: 'copy-title',
          label: t('Titel', 'Title'),
        },
        {
          type: 'button',
          id: 'copy-wikilink',
          label: 'Wikilink',
        },
      ],
    },
    { type: 'divider' },
    {
      type: 'checkbox',
      id: 'showStatus',
      label: t('Statusleiste (Modus-Kürzel)', 'Status bar (mode abbrev)'),
      checked: settings.showStatus === true,
    },
    {
      type: 'callout',
      tone: 'info',
      text: t(
        'Wikilink nutzt den Titel ([[Titel]]), nicht den Pfad. Bei Titelkollisionen kann der Link mehrdeutig sein. Abgrenzung: pinboard = merken; wikilink-wrap = Selection umhüllen.',
        'Wikilink uses the title ([[title]]), not the path. Title collisions can make the link ambiguous. Distinction: pinboard = pin/remember; wikilink-wrap = wrap selection.',
      ),
    },
  ]
}

/**
 * @param {{ silent?: boolean }} [opts]
 */
async function refreshPanel(opts = {}) {
  if (!panel) return
  const silent = opts.silent === true
  try {
    // Soft: notes.active OK when opening/refreshing panel — no vault list.
    const meta = await resolveActive({ silent: true })
    panelMeta = meta
    await panel.update(renderBlocks())
    await panel.setTitle(t('Pfad kopieren', 'Path Copier'))
  } catch (error) {
    if (isNoPanel(error)) {
      panel = null
      return
    }
    fanotes.log('refreshPanel', errMessage(error))
    if (!silent) {
      await fanotes.ui.toast(
        t(`Panel-Aktualisierung fehlgeschlagen: ${errMessage(error)}`, `Panel refresh failed: ${errMessage(error)}`),
        'error',
      )
    }
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
      title: t('Pfad kopieren', 'Path Copier'),
      icon: '📋',
      blocks: renderBlocks(),
    })

    // Soft: load active note once when creating the panel.
    void refreshPanel()

    panel.onAction(async (action) => {
      try {
        if (action.id === 'copy-default') {
          await copyMode(settings.defaultMode)
          return
        }
        if (action.id === 'copy-path') {
          await copyMode('path')
          return
        }
        if (action.id === 'copy-title') {
          await copyMode('title')
          return
        }
        if (action.id === 'copy-wikilink') {
          await copyMode('wikilink')
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
        if (input.id === 'defaultMode') {
          const prev = cloneSettings()
          settings.defaultMode = normalizeMode(input.value)
          const ok = await persistSettings(prev)
          await updateStatus()
          await refreshPanel({ silent: true })
          if (!ok) return
          return
        }
        if (input.id === 'showStatus') {
          const prev = cloneSettings()
          settings.showStatus = input.value === true
          const ok = await persistSettings(prev)
          await updateStatus()
          await refreshPanel({ silent: true })
          if (!ok) return
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
  id: 'copy-path',
  title: t('Notiz-Pfad kopieren', 'Copy note path'),
  detail: t(
    'Pfad der aktiven Notiz in die Zwischenablage',
    'Copy the active note path to the clipboard',
  ),
  keywords: 'path pfad copy kopieren clipboard zwischenablage note notiz',
  run: async () => {
    try {
      await copyMode('path')
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'copy-title',
  title: t('Notiz-Titel kopieren', 'Copy note title'),
  detail: t(
    'Titel der aktiven Notiz in die Zwischenablage',
    'Copy the active note title to the clipboard',
  ),
  keywords: 'title titel copy kopieren clipboard zwischenablage note notiz',
  run: async () => {
    try {
      await copyMode('title')
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'copy-wikilink',
  title: t('Notiz-Wikilink kopieren', 'Copy note wikilink'),
  detail: t(
    '[[Titel]] der aktiven Notiz in die Zwischenablage',
    'Copy [[title]] of the active note to the clipboard',
  ),
  keywords: 'wikilink wiki link copy kopieren clipboard titel title',
  run: async () => {
    try {
      await copyMode('wikilink')
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'open',
  title: t('Pfad kopieren öffnen', 'Open Path Copier'),
  detail: t(
    'Panel: Pfad, Titel, Wikilink und Standardmodus',
    'Panel: path, title, wikilink and default mode',
  ),
  keywords: 'path pfad copy kopieren panel öffnen open clipboard',
  run: () => {
    try {
      openPanel()
    } catch (error) {
      void fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.onActivate(async () => {
  try {
    await loadSettings()
    // Soft: status uses only settings (mode abbrev) — no notes.active / vault scan.
    await updateStatus()
    fanotes.log('path-copier activated', fanotes.app.appVersion, settings)
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(() => {
  panel = null
  panelMeta = null
  void fanotes.ui.status.remove(STATUS_ID).catch((error) => {
    fanotes.log('status remove on deactivate', errMessage(error))
  })
})
