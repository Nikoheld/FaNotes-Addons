/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Ordner-Statistik / Folder Stats – counts notes per folder from notes.list
// only (no notes.read). Abgrenzung: folder-dashboard = Detail+Tasks eines
// Ordners; hier = Aggregation über notes.list. Scan-gate: notes.list never
// onActivate. v1: no write, no vault, no network, no editor, no stats.

const SETTINGS_KEY = 'settings'
const PANEL_ID = 'folders'
const STATUS_ID = 'folders'
const DEFAULT_MAX_NOTES = 2000
const DEFAULT_DEPTH = '1'
const DEFAULT_TOP_N = 40
const DEFAULT_SHOW_STATUS = false
const DRILL_MAX = 30
const MD_EXT_RE = /\.(md|markdown)$/iu

/**
 * @typedef {'1' | 'full'} Depth
 */

/**
 * @typedef {{
 *   maxNotes: number,
 *   depth: Depth,
 *   topN: number,
 *   showStatus: boolean,
 * }} Settings
 */

/**
 * @typedef {{
 *   path: string,
 *   title: string,
 * }} NoteRef
 */

/**
 * @typedef {{
 *   folder: string,
 *   count: number,
 * }} FolderRow
 */

/**
 * Soft session cache: folder key → note paths for drill-down.
 * @typedef {{
 *   scanned: number,
 *   folderCount: number,
 *   rows: FolderRow[],
 *   folderToNotes: Record<string, NoteRef[]>,
 *   builtAt: number,
 * }} View
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  maxNotes: DEFAULT_MAX_NOTES,
  depth: DEFAULT_DEPTH,
  topN: DEFAULT_TOP_N,
  showStatus: DEFAULT_SHOW_STATUS,
}

/** @type {Settings} */
let settings = { ...DEFAULT_SETTINGS }

/** @type {FaNotes.Panel | null} */
let panel = null

/** @type {View | null} */
let view = null

/** Drill-down: null = folder list; string = notes for that folder key. */
let selectedFolder = /** @type {string | null} */ (null)

/** True after at least one successful scan this session. */
let scannedOnce = false

let scanning = false
let scanQueued = false

/** Draft depth shown in the panel (applied on Refresh). */
/** @type {Depth} */
let depthDraft = DEFAULT_DEPTH

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
 * Clamp maxNotes to integer 100–5000 (Soft Cap).
 * @param {unknown} raw
 */
function clampMaxNotes(raw) {
  let n = Number(raw)
  if (!Number.isFinite(n)) n = DEFAULT_MAX_NOTES
  n = Math.floor(n)
  if (n < 100) n = 100
  if (n > 5000) n = 5000
  return n
}

/**
 * Clamp topN to integer 5–200.
 * @param {unknown} raw
 */
function clampTopN(raw) {
  let n = Number(raw)
  if (!Number.isFinite(n)) n = DEFAULT_TOP_N
  n = Math.floor(n)
  if (n < 5) n = 5
  if (n > 200) n = 200
  return n
}

/**
 * Soft: depth may arrive as number 1 — normalize to '1' | 'full'.
 * @param {unknown} raw
 * @returns {Depth}
 */
function normalizeDepth(raw) {
  if (raw === 1 || raw === '1' || Number(raw) === 1) return '1'
  if (raw === 'full' || raw === 'Full' || raw === 'FULL') return 'full'
  return DEFAULT_DEPTH
}

/**
 * Parent folder of a vault-relative note path (dirname Soft).
 * @param {string} path
 */
function dirnameOf(path) {
  const p = String(path || '').replace(/\\/g, '/')
  const i = p.lastIndexOf('/')
  return i <= 0 ? '' : p.slice(0, i)
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
 * Full folder path Soft: note.folder || dirname(path).
 * Empty string = vault root.
 * @param {{ path: string, folder?: string }} note
 */
function folderOf(note) {
  const fromField = note.folder != null ? String(note.folder).replace(/\\/g, '/') : ''
  const trimmed = fromField.replace(/^\/+|\/+$/g, '')
  if (trimmed) return trimmed
  // Soft: falsy / empty folder → dirname(path)
  return dirnameOf(note.path)
}

/**
 * Folder aggregation key for current depth Soft.
 * - '1': top-level segment only, or localized root label for empty
 * - 'full': full folder path, or localized root label for empty
 * @param {string} folder
 * @param {Depth} depth
 */
function folderKey(folder, depth) {
  const root = t('(Wurzel)', '(root)')
  if (!folder) return root
  if (depth === '1') {
    const seg = folder.split('/').filter(Boolean)[0]
    return seg || root
  }
  return folder
}

/**
 * @param {unknown} raw
 * @returns {Settings}
 */
function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const obj = /** @type {Record<string, unknown>} */ (raw)
  return {
    maxNotes: clampMaxNotes(obj.maxNotes),
    depth: normalizeDepth(obj.depth),
    topN: clampTopN(obj.topN),
    showStatus: obj.showStatus === true,
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
  depthDraft = settings.depth
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
      depth: settings.depth,
      topN: settings.topN,
      showStatus: settings.showStatus,
    })
    return true
  } catch (error) {
    if (rollback) settings = { ...rollback }
    depthDraft = settings.depth
    await fanotes.ui.toast(
      t(`Speichern fehlgeschlagen: ${errMessage(error)}`, `Save failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

/**
 * Apply depth from panel values / drafts; persist with rollback.
 * @param {Record<string, unknown>} [values]
 * @param {{ silent?: boolean }} [opts]
 * @returns {Promise<boolean>}
 */
async function applySettingsFromValues(values, opts = {}) {
  const rawDepth = values && values.depth != null ? values.depth : depthDraft
  const depth = normalizeDepth(rawDepth)

  const rollback = { ...settings }
  settings.depth = depth
  depthDraft = depth

  const ok = await saveSettings(rollback)
  if (!ok) {
    await refreshPanel()
    return false
  }

  if (!opts.silent) {
    await fanotes.ui.toast(
      t(
        `Einstellungen übernommen (Tiefe: ${depthLabel(settings.depth)}).`,
        `Settings applied (depth: ${depthLabel(settings.depth)}).`,
      ),
      'success',
    )
  }
  return true
}

/**
 * @param {Depth} depth
 */
function depthLabel(depth) {
  if (depth === 'full') return t('vollständig', 'full')
  return t('1. Ebene', 'top-level')
}

/**
 * Aggregate notes per folder from notes.list only (no notes.read).
 * SCAN GATE — never from onActivate.
 * Soft Cap: if length > maxNotes, sort modifiedAt DESC localeCompare, slice.
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

    // Soft: filter md|markdown; Cap document — sort modifiedAt DESC then slice
    let mdNotes = notes.filter((n) => MD_EXT_RE.test(n.path))
    if (mdNotes.length > settings.maxNotes) {
      mdNotes = mdNotes
        .slice()
        .sort((a, b) => {
          const aMis = a.modifiedAt == null || a.modifiedAt === ''
          const bMis = b.modifiedAt == null || b.modifiedAt === ''
          if (aMis && !bMis) return 1
          if (!aMis && bMis) return -1
          if (aMis && bMis) return String(a.path).localeCompare(String(b.path))
          // modifiedAt DESC Soft (localeCompare), path tiebreak
          const byDate = String(b.modifiedAt).localeCompare(String(a.modifiedAt))
          if (byDate !== 0) return byDate
          return String(a.path).localeCompare(String(b.path))
        })
        .slice(0, settings.maxNotes)
    }

    const depth = settings.depth
    /** @type {Record<string, NoteRef[]>} */
    const folderToNotes = {}
    /** @type {Record<string, number>} */
    const counts = {}

    for (const note of mdNotes) {
      const folder = folderOf(note)
      const key = folderKey(folder, depth)
      counts[key] = (counts[key] || 0) + 1
      let list = folderToNotes[key]
      if (!list) {
        list = []
        folderToNotes[key] = list
      }
      list.push({
        path: note.path,
        title: note.title || basenameNoExt(note.path),
      })
    }

    /** @type {FolderRow[]} */
    const rows = Object.keys(counts).map((folder) => ({
      folder,
      count: counts[folder],
    }))

    // Sort count DESC then name Soft
    rows.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return a.folder.localeCompare(b.folder)
    })

    const uniqueFolders = rows.length
    const topRows = rows.slice(0, settings.topN)

    view = {
      scanned: mdNotes.length,
      folderCount: uniqueFolders,
      rows: topRows,
      folderToNotes,
      builtAt: Date.now(),
    }
    scannedOnce = true

    // Soft: keep drill-down only if folder still present
    if (selectedFolder && !folderToNotes[selectedFolder]) {
      selectedFolder = null
    }

    if (!opts.silent) {
      await fanotes.ui.toast(
        t(
          `Scan: ${mdNotes.length} Notiz(en), ${uniqueFolders} Ordner (Top ${topRows.length}).`,
          `Scan: ${mdNotes.length} note(s), ${uniqueFolders} folder(s) (top ${topRows.length}).`,
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
    await updateStatus()
    if (scanQueued) {
      scanQueued = false
      void rescan({ silent: true })
    }
  }
}

/**
 * Soft light status `📁 N` after scan when showStatus (N = unique folder count).
 * Uses cached view only — never lists here.
 */
async function updateStatus() {
  try {
    if (!settings.showStatus || !scannedOnce || !view) {
      await fanotes.ui.status.remove(STATUS_ID)
      return
    }
    const n = view.folderCount
    await fanotes.ui.status.set({
      id: STATUS_ID,
      text: `📁 ${n}`,
      title: t(
        `${n} Ordner in der Statistik – Klick öffnet das Panel`,
        `${n} folders in stats – click opens the panel`,
      ),
      priority: 40,
      onClick: () => {
        try {
          openPanel()
        } catch (error) {
          fanotes.log('status onClick failed', errMessage(error))
        }
      },
    })
  } catch (error) {
    fanotes.log('updateStatus failed', errMessage(error))
  }
}

function renderBlocks() {
  const scannedLabel = view
    ? String(view.scanned)
    : scanning
      ? '…'
      : scannedOnce
        ? '0'
        : '–'
  const folderLabel = view
    ? String(view.folderCount)
    : scanning
      ? '…'
      : scannedOnce
        ? '0'
        : '–'

  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Ordner-Statistik', 'Folder Stats'), level: 2 },
  ]

  // Soft UX: drill-down note list + muted Zurück button
  if (selectedFolder) {
    const notes = view && view.folderToNotes ? view.folderToNotes[selectedFolder] || [] : []
    const shown = notes.slice(0, DRILL_MAX)
    blocks.push({
      type: 'keyvalue',
      items: [
        { key: t('Ordner', 'Folder'), value: selectedFolder },
        { key: t('Notizen', 'Notes'), value: String(notes.length) },
      ],
    })
    blocks.push({
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'back',
          label: t('← Zurück', '← Back'),
        },
      ],
    })
    blocks.push({
      type: 'list',
      id: 'notes',
      empty: t('Keine Notizen in diesem Ordner.', 'No notes in this folder.'),
      items: shown.map((n) => ({
        id: n.path,
        title: n.title,
        detail: n.path,
      })),
    })
    blocks.push({ type: 'divider' })
    blocks.push({
      type: 'text',
      muted: true,
      text: t(
        `Klick öffnet die Notiz (max. ${DRILL_MAX}). „← Zurück“ zur Ordnerliste. Kein Task-Count – nur Aggregation aus notes.list.`,
        `Click opens the note (max ${DRILL_MAX}). “← Back” returns to the folder list. No task count – list aggregation only.`,
      ),
    })
    return blocks
  }

  // Overview
  blocks.push({
    type: 'keyvalue',
    items: [
      { key: t('Notizen', 'Notes'), value: scannedLabel },
      { key: t('Ordner', 'Folders'), value: folderLabel },
    ],
  })
  blocks.push({
    type: 'select',
    id: 'depth',
    label: t('Tiefe', 'Depth'),
    value: depthDraft,
    options: [
      { value: '1', label: t('1. Ebene (Top-Segment)', 'Top-level (first segment)') },
      { value: 'full', label: t('Vollständig (voller Pfad)', 'Full path') },
    ],
  })
  blocks.push({
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
  })

  const listItems = view
    ? view.rows.map((row) => ({
        id: row.folder,
        title: row.folder,
        badge: String(row.count),
        detail: t(`${row.count} Notiz(en)`, `${row.count} note(s)`),
      }))
    : []

  blocks.push({
    type: 'list',
    id: 'folders',
    empty: scannedOnce
      ? t('Keine Ordner gefunden.', 'No folders found.')
      : t('Noch nicht gescannt – „Aktualisieren“ tippen.', 'Not scanned yet – tap “Refresh”.'),
    items: listItems,
  })
  blocks.push({ type: 'divider' })
  blocks.push({
    type: 'text',
    muted: true,
    text: t(
      `Nur .md/.markdown · Cap ≤ ${settings.maxNotes} · Top ${settings.topN} · kein notes.read · kein Task-Count · Abgrenzung: folder-dashboard = Detail+Tasks eines Ordners.`,
      `Only .md/.markdown · Cap ≤ ${settings.maxNotes} · Top ${settings.topN} · no notes.read · no task count · vs folder-dashboard = detail+tasks of one folder.`,
    ),
  })

  return blocks
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    const title = selectedFolder
      ? t(`Ordner: ${selectedFolder}`, `Folder: ${selectedFolder}`)
      : t('Ordner-Statistik', 'Folder Stats')
    await panel.setTitle(title)
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
        `${view.scanned} Notiz(en), ${view.folderCount} Ordner.`,
        `${view.scanned} note(s), ${view.folderCount} folder(s).`,
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

    depthDraft = settings.depth

    panel = fanotes.ui.panel({
      id: PANEL_ID,
      title: t('Ordner-Statistik', 'Folder Stats'),
      icon: '📁',
      blocks: renderBlocks(),
      focus: true,
    })

    panel.onAction(async (action) => {
      try {
        if (action.id === 'back') {
          selectedFolder = null
          await refreshPanel()
          return
        }
        if (action.id === 'refresh' || action.id === 'submit:depth') {
          const values = action.values || {}
          if (values.depth != null) depthDraft = normalizeDepth(values.depth)
          const ok = await applySettingsFromValues(values, {
            silent: action.id !== 'refresh',
          })
          if (!ok) return
          selectedFolder = null
          await rescan({ silent: action.id !== 'refresh' })
          return
        }
        if (action.id === 'folders' && action.itemId) {
          selectedFolder = String(action.itemId)
          await refreshPanel()
          return
        }
        if (action.id === 'notes' && action.itemId) {
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
        if (input.id === 'depth') {
          depthDraft = normalizeDepth(input.value)
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

// --- Commands ---------------------------------------------------------------

fanotes.commands.register({
  id: 'open',
  title: t('Ordner-Statistik öffnen', 'Open Folder Stats'),
  detail: t(
    'Panel: Notizen pro Ordner aus der Notizliste',
    'Panel: notes per folder from the note list',
  ),
  keywords: 'folder ordner stats statistik count overview vault tree übersicht',
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
  title: t('Ordner-Scan aktualisieren', 'Refresh folder scan'),
  detail: t(
    'Notizliste erneut laden und Ordner zählen',
    'Reload note list and count folders',
  ),
  keywords: 'folder ordner rescan aktualisieren refresh scan stats count',
  run: async () => {
    try {
      await rescan({ silent: false })
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.onActivate(async () => {
  try {
    // Light work only: settings. NO notes.list (scan-gate).
    await loadSettings()
    scannedOnce = false
    view = null
    selectedFolder = null
    fanotes.log(
      'folder-stats activated',
      fanotes.app.appVersion,
      settings.depth,
      settings.maxNotes,
      settings.topN,
      settings.showStatus,
    )
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(async () => {
  scanning = false
  scanQueued = false
  scannedOnce = false
  selectedFolder = null
  panel = null
  view = null
  try {
    await fanotes.ui.status.remove(STATUS_ID)
  } catch {
    // ignore
  }
})
