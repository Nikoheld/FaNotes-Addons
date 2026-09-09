/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Leere Notizen / Empty Notes – Markdown notes whose trim(content) length
// is 0 or ≤ maxChars. Abgrenzung: orphan = wikilinks; stale = modifiedAt age;
// duplicate-titles = same title. Scan-gate: notes.list/read never onActivate.
// v1: no write, no trash, no vault, no network. skipCodeOnly ignored (raw trim).

const SETTINGS_KEY = 'settings'
const PANEL_ID = 'empty'
const DEFAULT_MAX_NOTES = 400
const DEFAULT_MAX_CHARS = 20
const DEFAULT_MAX_LIST = 80
const MD_EXT_RE = /\.(md|markdown)$/iu

/**
 * @typedef {{
 *   maxNotes: number,
 *   maxChars: number,
 *   ignoreWhitespaceOnly: boolean,
 *   folder: string,
 *   skipCodeOnly: boolean,
 * }} Settings
 */

/**
 * @typedef {{
 *   path: string,
 *   title: string,
 *   chars: number,
 *   modifiedAt: string | null,
 * }} EmptyItem
 */

/**
 * @typedef {{
 *   scanned: number,
 *   emptyCount: number,
 *   items: EmptyItem[],
 *   builtAt: number,
 * }} View
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  maxNotes: DEFAULT_MAX_NOTES,
  maxChars: DEFAULT_MAX_CHARS,
  ignoreWhitespaceOnly: true,
  folder: '',
  skipCodeOnly: false,
}

/** @type {Settings} */
let settings = { ...DEFAULT_SETTINGS }

/** @type {FaNotes.Panel | null} */
let panel = null

/** @type {View | null} */
let view = null

/** True after at least one successful scan this session. */
let scannedOnce = false

let scanning = false
let scanQueued = false

/** Draft inputs shown in the panel (may differ until Refresh). */
let maxCharsDraft = String(DEFAULT_MAX_CHARS)
let folderDraft = ''

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
 * Vault-relative folder prefix: no leading/trailing `/`, no `..`.
 * Empty string = vault root (all notes). Returns null if invalid.
 * @param {unknown} raw
 * @returns {string | null}
 */
function normalizeFolder(raw) {
  let folder = String(raw ?? '').trim().replace(/\\/g, '/')
  while (folder.startsWith('/')) folder = folder.slice(1)
  while (folder.endsWith('/')) folder = folder.slice(0, -1)
  if (!folder) return ''
  const parts = folder.split('/').filter(Boolean)
  if (!parts.length || parts.some((p) => p === '.' || p === '..')) return null
  return parts.join('/')
}

/**
 * Clamp maxNotes to integer 50–2000.
 * @param {unknown} raw
 */
function clampMaxNotes(raw) {
  let n = Number(raw)
  if (!Number.isFinite(n)) n = DEFAULT_MAX_NOTES
  n = Math.floor(n)
  if (n < 50) n = 50
  if (n > 2000) n = 2000
  return n
}

/**
 * Clamp maxChars to integer 0–500.
 * @param {unknown} raw
 */
function clampMaxChars(raw) {
  let n = Number(raw)
  if (!Number.isFinite(n)) n = DEFAULT_MAX_CHARS
  n = Math.floor(n)
  if (n < 0) n = 0
  if (n > 500) n = 500
  return n
}

/**
 * @param {string} notePath
 * @param {string} folder
 */
function inFolder(notePath, folder) {
  if (folder === '') return true
  const path = String(notePath).replace(/\\/g, '/')
  return path === folder || path.startsWith(`${folder}/`)
}

/**
 * Basename without `.md` / `.markdown`.
 * @param {string} path
 */
function basenameNoExt(path) {
  const base = String(path).split('/').pop() || String(path)
  return base.replace(/\.(md|markdown)$/iu, '')
}

/**
 * Empty / very short after BOM strip + trim.
 * Whitespace-only always counts (ignoreWhitespaceOnly documented; always on in isEmpty).
 * skipCodeOnly is ignored in v1 — raw trim length only.
 * @param {string} text
 * @param {number} maxChars
 */
function isEmpty(text, maxChars) {
  const trimmed = String(text ?? '').replace(/\uFEFF/g, '').trim()
  if (trimmed.length === 0) return true
  return trimmed.length <= maxChars
}

/**
 * Trim length used for display / sort (BOM stripped).
 * @param {string} text
 */
function trimLength(text) {
  return String(text ?? '').replace(/\uFEFF/g, '').trim().length
}

/**
 * @param {unknown} raw
 * @returns {Settings}
 */
function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const obj = /** @type {Record<string, unknown>} */ (raw)

  const folderNorm = normalizeFolder(obj.folder != null ? String(obj.folder) : '')
  const folder = folderNorm === null ? '' : folderNorm

  return {
    maxNotes: clampMaxNotes(obj.maxNotes),
    maxChars: clampMaxChars(obj.maxChars),
    ignoreWhitespaceOnly: obj.ignoreWhitespaceOnly !== false,
    folder,
    skipCodeOnly: obj.skipCodeOnly === true,
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
  maxCharsDraft = String(settings.maxChars)
  folderDraft = settings.folder
}

/**
 * Persist settings; on failure restore `rollback` when provided.
 * @param {Settings} [rollback]
 * @returns {Promise<boolean>}
 */
async function saveSettings(rollback) {
  try {
    await fanotes.storage.set(SETTINGS_KEY, {
      maxNotes: settings.maxNotes,
      maxChars: settings.maxChars,
      ignoreWhitespaceOnly: settings.ignoreWhitespaceOnly,
      folder: settings.folder,
      skipCodeOnly: settings.skipCodeOnly,
    })
    return true
  } catch (error) {
    if (rollback) settings = { ...rollback }
    maxCharsDraft = String(settings.maxChars)
    folderDraft = settings.folder
    await fanotes.ui.toast(
      t(`Speichern fehlgeschlagen: ${errMessage(error)}`, `Save failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

/**
 * Apply maxChars + folder from panel values / drafts; persist with rollback.
 * @param {Record<string, unknown>} [values]
 * @param {{ silent?: boolean }} [opts]
 * @returns {Promise<boolean>}
 */
async function applySettingsFromValues(values, opts = {}) {
  const rawMaxChars = values && values.maxChars != null ? values.maxChars : maxCharsDraft
  const rawFolder = values && values.folder != null ? values.folder : folderDraft

  const maxChars = clampMaxChars(rawMaxChars)
  const folderNorm = normalizeFolder(rawFolder)
  if (folderNorm === null) {
    await fanotes.ui.toast(
      t('Ungültiger Ordnerpfad (kein „..“ erlaubt).', 'Invalid folder path (".." is not allowed).'),
      'error',
    )
    return false
  }

  const rollback = { ...settings }
  settings.maxChars = maxChars
  settings.folder = folderNorm
  maxCharsDraft = String(maxChars)
  folderDraft = folderNorm

  const ok = await saveSettings(rollback)
  if (!ok) {
    await refreshPanel()
    return false
  }

  if (!opts.silent) {
    await fanotes.ui.toast(
      t(
        `Einstellungen übernommen (≤ ${settings.maxChars} Zeichen${settings.folder ? `, Ordner: ${settings.folder}` : ''}).`,
        `Settings applied (≤ ${settings.maxChars} chars${settings.folder ? `, folder: ${settings.folder}` : ''}).`,
      ),
      'success',
    )
  }
  return true
}

/**
 * Scan Markdown notes for empty / very short bodies (SCAN GATE — never from onActivate).
 * @param {{ silent?: boolean }} [opts]
 */
async function rescan(opts = {}) {
  if (scanning) {
    scanQueued = true
    return
  }
  scanning = true
  try {
    if (panel) await refreshPanel()

    let notes = []
    try {
      notes = await fanotes.notes.list()
    } catch (error) {
      await fanotes.ui.toast(
        t(`Notizenliste fehlgeschlagen: ${errMessage(error)}`, `Note list failed: ${errMessage(error)}`),
        'error',
      )
      return
    }

    const folder = settings.folder
    const maxChars = settings.maxChars

    const mdNotes = notes
      .filter((n) => MD_EXT_RE.test(n.path))
      .filter((n) => inFolder(n.path, folder))
      .sort((a, b) => {
        const aMis = a.modifiedAt == null || a.modifiedAt === ''
        const bMis = b.modifiedAt == null || b.modifiedAt === ''
        if (aMis && !bMis) return 1
        if (!aMis && bMis) return -1
        if (aMis && bMis) return String(a.path).localeCompare(String(b.path))
        return String(b.modifiedAt).localeCompare(String(a.modifiedAt))
      })
      .slice(0, settings.maxNotes)

    /** @type {EmptyItem[]} */
    const empty = []
    let scanned = 0

    for (const note of mdNotes) {
      scanned += 1
      let text = ''
      try {
        text = await fanotes.notes.read(note.path)
      } catch (error) {
        fanotes.log('read failed', note.path, errMessage(error))
        continue
      }

      const chars = trimLength(text)
      if (!isEmpty(text, maxChars)) continue

      empty.push({
        path: note.path,
        title: note.title || basenameNoExt(note.path),
        chars,
        modifiedAt: note.modifiedAt ?? null,
      })
    }

    // Shortest first, then modifiedAt ASC (localeCompare), then path.
    empty.sort((a, b) => {
      if (a.chars !== b.chars) return a.chars - b.chars
      const aMis = a.modifiedAt == null || a.modifiedAt === ''
      const bMis = b.modifiedAt == null || b.modifiedAt === ''
      if (aMis && !bMis) return -1
      if (!aMis && bMis) return 1
      if (!aMis && !bMis) {
        const byDate = String(a.modifiedAt).localeCompare(String(b.modifiedAt))
        if (byDate !== 0) return byDate
      }
      return a.path.localeCompare(b.path)
    })

    const emptyCount = empty.length
    view = {
      scanned,
      emptyCount,
      items: empty.slice(0, DEFAULT_MAX_LIST),
      builtAt: Date.now(),
    }
    scannedOnce = true

    if (!opts.silent) {
      await fanotes.ui.toast(
        t(
          `Scan: ${emptyCount} leer/kurz (≤ ${maxChars} Z., ${scanned} geprüft).`,
          `Scan: ${emptyCount} empty/short (≤ ${maxChars} chars, ${scanned} checked).`,
        ),
        'success',
      )
    }
  } catch (error) {
    try {
      await fanotes.ui.toast(
        t(`Scan fehlgeschlagen: ${errMessage(error)}`, `Scan failed: ${errMessage(error)}`),
        'error',
      )
    } catch {
      fanotes.log('rescan failed', errMessage(error))
    }
  } finally {
    scanning = false
    await refreshPanel()
    if (scanQueued) {
      scanQueued = false
      void rescan({ silent: true })
    }
  }
}

function renderBlocks() {
  const thresholdLabel =
    settings.maxChars === 0
      ? t('nur leer (0 Z.)', 'empty only (0 chars)')
      : t(`≤ ${settings.maxChars} Zeichen`, `≤ ${settings.maxChars} chars`)
  const countLabel = view
    ? String(view.emptyCount)
    : scanning
      ? '…'
      : scannedOnce
        ? '0'
        : '–'
  const scannedLabel = view
    ? String(view.scanned)
    : scanning
      ? '…'
      : scannedOnce
        ? '0'
        : '–'

  const listItems = view
    ? view.items.map((item) => ({
        id: item.path,
        title: item.title,
        detail: t(`${item.chars} Z. · ${item.path}`, `${item.chars} chars · ${item.path}`),
      }))
    : []

  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Leere Notizen', 'Empty Notes'), level: 2 },
    {
      type: 'keyvalue',
      items: [
        { key: t('Schwelle', 'Threshold'), value: thresholdLabel },
        { key: t('Treffer', 'Hits'), value: countLabel },
        { key: t('gescannt', 'scanned'), value: scannedLabel },
      ],
    },
    {
      type: 'input',
      id: 'maxChars',
      label: t('Max. Zeichen (0 = nur leer, 0–500)', 'Max chars (0 = empty only, 0–500)'),
      value: maxCharsDraft,
      placeholder: String(DEFAULT_MAX_CHARS),
    },
    {
      type: 'input',
      id: 'folder',
      label: t('Ordnerpfad (vault-relativ, ohne Slash am Ende)', 'Folder path (vault-relative, no trailing slash)'),
      value: folderDraft,
      placeholder: t('leer = Vault-Wurzel', 'empty = vault root'),
    },
    {
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'refresh',
          label: scanning
            ? t('Scan …', 'Scanning …')
            : t('Aktualisieren', 'Refresh'),
          primary: true,
          disabled: scanning,
        },
      ],
    },
    {
      type: 'list',
      id: 'empty',
      empty: scannedOnce
        ? t('Keine leeren/kurzen Notizen unter dieser Schwelle.', 'No empty/short notes under this threshold.')
        : t('Noch nicht gescannt – „Aktualisieren“ tippen.', 'Not scanned yet – tap “Refresh”.'),
      items: listItems,
    },
    { type: 'divider' },
    {
      type: 'text',
      muted: true,
      text: t(
        `Nur .md/.markdown · Ordner-Präfix · Index ≤ ${settings.maxNotes} · Liste ≤ ${DEFAULT_MAX_LIST} · trim+BOM · kein Papierkorb v1 · Abgrenzung: orphan = Wikilinks, stale = Alter, duplicate-titles = Titel.`,
        `Only .md/.markdown · folder prefix · index ≤ ${settings.maxNotes} · list ≤ ${DEFAULT_MAX_LIST} · trim+BOM · no trash v1 · vs orphan = wikilinks, stale = age, duplicate-titles = titles.`,
      ),
    },
  ]

  return blocks
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Leere Notizen', 'Empty Notes'))
  } catch (error) {
    if (isNoPanel(error)) {
      panel = null
      return
    }
    fanotes.log('refreshPanel', errMessage(error))
  }
}

/**
 * Open panel + scan (scan-gate entry).
 * @param {{ silent?: boolean }} [opts]
 */
async function openAndScan(opts = {}) {
  const silent = opts.silent !== false
  await rescan({ silent: true })
  if (!silent && view) {
    await fanotes.ui.toast(
      t(
        `${view.emptyCount} leere/kurze Notiz(en) (≤ ${settings.maxChars} Z.).`,
        `${view.emptyCount} empty/short note(s) (≤ ${settings.maxChars} chars).`,
      ),
      'info',
    )
  }
}

function openPanel() {
  try {
    if (panel) {
      void panel.show().catch((error) => {
        if (isNoPanel(error)) panel = null
        else fanotes.log('panel.show', errMessage(error))
      })
      void openAndScan({ silent: true })
      return
    }

    maxCharsDraft = String(settings.maxChars)
    folderDraft = settings.folder

    panel = fanotes.ui.panel({
      id: PANEL_ID,
      title: t('Leere Notizen', 'Empty Notes'),
      icon: '🗒️',
      blocks: renderBlocks(),
      focus: true,
    })

    panel.onAction(async (action) => {
      try {
        if (action.id === 'refresh' || action.id === 'submit:maxChars' || action.id === 'submit:folder') {
          const values = action.values || {}
          if (values.maxChars != null) maxCharsDraft = String(values.maxChars)
          if (values.folder != null) folderDraft = String(values.folder)
          const ok = await applySettingsFromValues(values, {
            silent: action.id !== 'refresh',
          })
          if (!ok) return
          await rescan({ silent: action.id !== 'refresh' })
          return
        }
        if (action.id === 'empty' && action.itemId) {
          try {
            await fanotes.notes.open(String(action.itemId))
          } catch (error) {
            await fanotes.ui.toast(
              t(`Öffnen fehlgeschlagen: ${errMessage(error)}`, `Open failed: ${errMessage(error)}`),
              'error',
            )
          }
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
        if (input.id === 'maxChars') {
          maxCharsDraft = String(input.value ?? '')
          return
        }
        if (input.id === 'folder') {
          folderDraft = String(input.value ?? '')
        }
      } catch (error) {
        fanotes.log('onInput', errMessage(error))
      }
    })

    void openAndScan({ silent: true })
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

/**
 * Command: open the first empty/short note (shortest first).
 */
async function openFirst() {
  try {
    await rescan({ silent: true })

    if (!view || !view.items.length) {
      await fanotes.ui.toast(
        t('Keine leeren/kurzen Notizen gefunden.', 'No empty/short notes found.'),
        'info',
      )
      return
    }

    const first = view.items[0]
    try {
      await fanotes.notes.open(first.path)
      await fanotes.ui.toast(
        t(`Geöffnet: ${first.title} (${first.chars} Z.)`, `Opened: ${first.title} (${first.chars} chars)`),
        'success',
      )
    } catch (error) {
      await fanotes.ui.toast(
        t(`Öffnen fehlgeschlagen: ${errMessage(error)}`, `Open failed: ${errMessage(error)}`),
        'error',
      )
    }
  } catch (error) {
    await fanotes.ui.toast(
      t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`),
      'error',
    )
  }
}

// --- Commands ---------------------------------------------------------------

fanotes.commands.register({
  id: 'open',
  title: t('Leere Notizen öffnen', 'Open Empty Notes'),
  detail: t(
    'Panel mit leeren oder sehr kurzen Markdown-Notizen',
    'Panel of empty or very short Markdown notes',
  ),
  keywords: 'empty leer blank short aufräumen cleanup placeholder notizen notes öffnen open',
  run: () => {
    try {
      openPanel()
    } catch (error) {
      void fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'rescan',
  title: t('Leer-Scan aktualisieren', 'Refresh empty scan'),
  detail: t(
    'Markdown-Notizen erneut lesen und nach Länge filtern',
    'Re-read Markdown notes and filter by length',
  ),
  keywords: 'empty leer rescan aktualisieren refresh scan short blank cleanup',
  run: async () => {
    try {
      await rescan({ silent: false })
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'open-first',
  title: t('Erste leere Notiz öffnen', 'Open first empty note'),
  detail: t(
    'Kürzeste leere/kurze Notiz öffnen',
    'Open the shortest empty/short note',
  ),
  keywords: 'empty leer first erste öffnen open short blank shortest',
  run: async () => {
    try {
      await openFirst()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.onActivate(async () => {
  try {
    // Light work only: settings. NO notes.list / notes.read (scan-gate).
    await loadSettings()
    scannedOnce = false
    view = null
    fanotes.log(
      'empty-notes activated',
      fanotes.app.appVersion,
      settings.maxChars,
      settings.maxNotes,
      settings.folder || '(root)',
    )
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(async () => {
  scanning = false
  scanQueued = false
  scannedOnce = false
  panel = null
  view = null
})
