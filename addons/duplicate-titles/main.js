/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Doppelte Titel / Duplicate Titles – Markdown notes that share a normalized
// title or basename. Abgrenzung: orphan-notes = Wikilinks; stale-notes = Age;
// duplicate-titles = Title/Basename. Scan-gate: notes.list never onActivate.

const SETTINGS_KEY = 'settings'
const PANEL_ID = 'dupes'
const DEFAULT_MAX_NOTES = 500
const DEFAULT_MIN_GROUP = 2
const MD_EXT_RE = /\.(md|markdown)$/iu

/**
 * @typedef {'title' | 'basename'} Mode
 */

/**
 * @typedef {{
 *   mode: Mode,
 *   maxNotes: number,
 *   minGroup: number,
 *   folder: string,
 * }} Settings
 */

/**
 * @typedef {{
 *   path: string,
 *   title: string,
 *   modifiedAt: string | null,
 * }} NoteItem
 */

/**
 * @typedef {{
 *   key: string,
 *   notes: NoteItem[],
 *   total: number,
 * }} DupeGroup
 */

/**
 * @typedef {{
 *   scanned: number,
 *   groupCount: number,
 *   noteCount: number,
 *   groups: DupeGroup[],
 *   builtAt: number,
 * }} View
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  mode: 'title',
  maxNotes: DEFAULT_MAX_NOTES,
  minGroup: DEFAULT_MIN_GROUP,
  folder: '',
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

/** Draft folder shown in the panel (may differ until Refresh). */
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
 * Clamp minGroup to integer ≥2 (cap 100).
 * @param {unknown} raw
 */
function clampMinGroup(raw) {
  let n = Number(raw)
  if (!Number.isFinite(n)) n = DEFAULT_MIN_GROUP
  n = Math.floor(n)
  if (n < 2) n = 2
  if (n > 100) n = 100
  return n
}

/**
 * @param {unknown} raw
 * @returns {Mode}
 */
function normalizeMode(raw) {
  return raw === 'basename' ? 'basename' : 'title'
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
 * Normalize grouping key.
 * title: trim + lowercase + collapse whitespace on note.title (else basename).
 * basename: file name without extension, lowercase.
 * @param {{ path: string, title?: string | null }} note
 * @param {Mode} mode
 */
function normKey(note, mode) {
  if (mode === 'basename') {
    return basenameNoExt(note.path).toLowerCase()
  }
  const raw = (note.title && String(note.title).trim()) || basenameNoExt(note.path)
  return String(raw).trim().toLowerCase().replace(/\s+/g, ' ')
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
    mode: normalizeMode(obj.mode),
    maxNotes: clampMaxNotes(obj.maxNotes),
    minGroup: clampMinGroup(obj.minGroup),
    folder,
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
      mode: settings.mode,
      maxNotes: settings.maxNotes,
      minGroup: settings.minGroup,
      folder: settings.folder,
    })
    return true
  } catch (error) {
    if (rollback) settings = { ...rollback }
    folderDraft = settings.folder
    await fanotes.ui.toast(
      t(`Speichern fehlgeschlagen: ${errMessage(error)}`, `Save failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

/**
 * Apply mode + folder (+ optional maxNotes/minGroup) from panel values / drafts.
 * @param {Record<string, unknown>} [values]
 * @param {{ silent?: boolean }} [opts]
 * @returns {Promise<boolean>}
 */
async function applySettingsFromValues(values, opts = {}) {
  const rawFolder = values && values.folder != null ? values.folder : folderDraft
  const rawMode = values && values.mode != null ? values.mode : settings.mode
  const rawMax =
    values && values.maxNotes != null ? values.maxNotes : settings.maxNotes
  const rawMin =
    values && values.minGroup != null ? values.minGroup : settings.minGroup

  const folderNorm = normalizeFolder(rawFolder)
  if (folderNorm === null) {
    await fanotes.ui.toast(
      t('Ungültiger Ordnerpfad (kein „..“ erlaubt).', 'Invalid folder path (".." is not allowed).'),
      'error',
    )
    return false
  }

  const rollback = { ...settings }
  settings.mode = normalizeMode(rawMode)
  settings.maxNotes = clampMaxNotes(rawMax)
  settings.minGroup = clampMinGroup(rawMin)
  settings.folder = folderNorm
  folderDraft = folderNorm

  const ok = await saveSettings(rollback)
  if (!ok) {
    await refreshPanel()
    return false
  }

  if (!opts.silent) {
    await fanotes.ui.toast(
      t(
        `Einstellungen übernommen (${settings.mode}${settings.folder ? `, Ordner: ${settings.folder}` : ''}).`,
        `Settings applied (${settings.mode}${settings.folder ? `, folder: ${settings.folder}` : ''}).`,
      ),
      'success',
    )
  }
  return true
}

/**
 * Compare modifiedAt descending (ISO localeCompare); missing dates last.
 * @param {string | null | undefined} a
 * @param {string | null | undefined} b
 */
function compareModifiedDesc(a, b) {
  const aMissing = a == null || a === ''
  const bMissing = b == null || b === ''
  if (aMissing && !bMissing) return 1
  if (!aMissing && bMissing) return -1
  if (aMissing && bMissing) return 0
  return String(b).localeCompare(String(a))
}

/**
 * Scan Markdown notes for duplicate title/basename groups (SCAN GATE — never from onActivate).
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
    const mode = settings.mode

    /** @type {NoteItem[]} */
    const candidates = []
    for (const note of notes) {
      if (!MD_EXT_RE.test(note.path)) continue
      if (!inFolder(note.path, folder)) continue
      candidates.push({
        path: note.path,
        title: note.title || basenameNoExt(note.path),
        modifiedAt: note.modifiedAt ?? null,
      })
    }

    // Newest first; missing modifiedAt last. Then path as tiebreak.
    candidates.sort((a, b) => {
      const byDate = compareModifiedDesc(a.modifiedAt, b.modifiedAt)
      if (byDate !== 0) return byDate
      return a.path.localeCompare(b.path)
    })

    const sliced = candidates.slice(0, settings.maxNotes)
    const scanned = sliced.length

    /** @type {Map<string, NoteItem[]>} */
    const byKey = new Map()
    for (const item of sliced) {
      const key = normKey({ path: item.path, title: item.title }, mode)
      if (!key) continue
      let bucket = byKey.get(key)
      if (!bucket) {
        bucket = []
        byKey.set(key, bucket)
      }
      bucket.push(item)
    }

    /** @type {DupeGroup[]} */
    const groups = []
    for (const [key, members] of byKey) {
      if (members.length < settings.minGroup) continue
      // Within group: modifiedAt desc, then path.
      members.sort((a, b) => {
        const byDate = compareModifiedDesc(a.modifiedAt, b.modifiedAt)
        if (byDate !== 0) return byDate
        return a.path.localeCompare(b.path)
      })
      groups.push({
        key,
        notes: members,
        total: members.length,
      })
    }

    // Largest groups first, then key localeCompare.
    groups.sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total
      return a.key.localeCompare(b.key)
    })

    let noteCount = 0
    for (const g of groups) noteCount += g.total

    view = {
      scanned,
      groupCount: groups.length,
      noteCount,
      groups,
      builtAt: Date.now(),
    }
    scannedOnce = true

    if (!opts.silent) {
      await fanotes.ui.toast(
        t(
          `Scan: ${groups.length} Gruppe(n), ${noteCount} Notiz(en) (${scanned} geprüft).`,
          `Scan: ${groups.length} group(s), ${noteCount} note(s) (${scanned} checked).`,
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
  const groupLabel = view
    ? String(view.groupCount)
    : scanning
      ? '…'
      : scannedOnce
        ? '0'
        : '–'
  const noteLabel = view
    ? String(view.noteCount)
    : scanning
      ? '…'
      : scannedOnce
        ? '0'
        : '–'

  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Doppelte Titel', 'Duplicate Titles'), level: 2 },
    {
      type: 'callout',
      tone: 'info',
      text: t(
        'Abgrenzung: orphan-notes = Links · stale-notes = Alter · hier = Titel/Basename. Kein Auto-Rename in v1.',
        'Distinction: orphan-notes = links · stale-notes = age · here = title/basename. No auto-rename in v1.',
      ),
    },
    {
      type: 'keyvalue',
      items: [
        { key: t('Gruppen', 'Groups'), value: groupLabel },
        { key: t('Notizen in Gruppen', 'Notes in groups'), value: noteLabel },
      ],
    },
    {
      type: 'select',
      id: 'mode',
      label: t('Modus', 'Mode'),
      value: settings.mode,
      options: [
        { value: 'title', label: t('Titel (normalisiert)', 'Title (normalized)') },
        { value: 'basename', label: t('Dateiname ohne Endung', 'Basename (no extension)') },
      ],
    },
    {
      type: 'input',
      id: 'folder',
      label: t('Ordnerpfad (vault-relativ, ohne Slash am Ende)', 'Folder path (vault-relative, no trailing slash)'),
      value: folderDraft,
      placeholder: t('leer = Vault-Wurzel', 'empty = vault root'),
    },
    {
      type: 'input',
      id: 'maxNotes',
      label: t('Max. Notizen im Scan (50–2000)', 'Max notes in scan (50–2000)'),
      value: String(settings.maxNotes),
      placeholder: String(DEFAULT_MAX_NOTES),
    },
    {
      type: 'input',
      id: 'minGroup',
      label: t('Min. Gruppengröße (≥2)', 'Min group size (≥2)'),
      value: String(settings.minGroup),
      placeholder: String(DEFAULT_MIN_GROUP),
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
  ]

  if (!scannedOnce && !scanning) {
    blocks.push({
      type: 'text',
      muted: true,
      text: t(
        'Noch nicht gescannt – „Aktualisieren“ tippen.',
        'Not scanned yet – tap “Refresh”.',
      ),
    })
  } else if (view && view.groups.length === 0) {
    blocks.push({
      type: 'text',
      muted: true,
      text: t(
        'Keine Kollisionen unter diesen Einstellungen.',
        'No collisions under these settings.',
      ),
    })
  } else if (view) {
    for (let i = 0; i < view.groups.length; i += 1) {
      const g = view.groups[i]
      blocks.push({
        type: 'heading',
        text: `${g.total}× ${g.key}`,
        level: 3,
      })
      blocks.push({
        type: 'list',
        id: `group-${i}`,
        empty: t('Keine Notizen.', 'No notes.'),
        items: g.notes.map((item) => ({
          id: item.path,
          title: item.title,
          detail: item.path,
        })),
      })
    }
  }

  blocks.push({ type: 'divider' })
  blocks.push({
    type: 'text',
    muted: true,
    text: t(
      `Nur .md/.markdown · Cap ${settings.maxNotes} · minGroup ${settings.minGroup} · Sortierung modifiedAt DESC · kein Schreiben/Umbenennen · Abgrenzung: orphan = Links, stale = Alter, hier = Titel.`,
      `Only .md/.markdown · cap ${settings.maxNotes} · minGroup ${settings.minGroup} · sort modifiedAt DESC · no write/rename · vs orphan = links, stale = age, here = title.`,
    ),
  })

  return blocks
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Doppelte Titel', 'Duplicate Titles'))
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
        `${view.groupCount} Gruppe(n), ${view.noteCount} Notiz(en).`,
        `${view.groupCount} group(s), ${view.noteCount} note(s).`,
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

    folderDraft = settings.folder

    panel = fanotes.ui.panel({
      id: PANEL_ID,
      title: t('Doppelte Titel', 'Duplicate Titles'),
      icon: '📑',
      blocks: renderBlocks(),
      focus: true,
    })

    panel.onAction(async (action) => {
      try {
        if (action.id === 'refresh' || action.id === 'submit:folder' || action.id === 'submit:maxNotes' || action.id === 'submit:minGroup') {
          const values = action.values || {}
          if (values.folder != null) folderDraft = String(values.folder)
          const ok = await applySettingsFromValues(values, { silent: true })
          if (!ok) return
          await rescan({ silent: false })
          return
        }
        if (typeof action.id === 'string' && action.id.startsWith('group-') && action.itemId) {
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
        if (input.id === 'folder') {
          folderDraft = String(input.value ?? '')
          return
        }
        if (input.id === 'mode') {
          const rollback = { ...settings }
          settings.mode = normalizeMode(input.value)
          const ok = await saveSettings(rollback)
          if (!ok) {
            await refreshPanel()
            return
          }
          await refreshPanel()
          return
        }
        if (input.id === 'maxNotes') {
          const rollback = { ...settings }
          settings.maxNotes = clampMaxNotes(input.value)
          const ok = await saveSettings(rollback)
          if (!ok) {
            await refreshPanel()
            return
          }
          return
        }
        if (input.id === 'minGroup') {
          const rollback = { ...settings }
          settings.minGroup = clampMinGroup(input.value)
          const ok = await saveSettings(rollback)
          if (!ok) {
            await refreshPanel()
            return
          }
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
  title: t('Doppelte Titel öffnen', 'Open Duplicate Titles'),
  detail: t(
    'Panel mit Notizen, die denselben Titel oder Dateinamen teilen',
    'Panel of notes that share the same title or filename',
  ),
  keywords: 'duplicate doppelt titel title basename kollision hygiene notizen notes öffnen open',
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
  title: t('Doppelte-Titel-Scan aktualisieren', 'Refresh duplicate-titles scan'),
  detail: t(
    'Markdown-Notizen erneut listen und nach Titel/Basename gruppieren',
    'Re-list Markdown notes and group by title/basename',
  ),
  keywords: 'duplicate doppelt rescan aktualisieren refresh scan titel title basename',
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
    fanotes.log(
      'duplicate-titles activated',
      fanotes.app.appVersion,
      settings.mode,
      settings.folder || '(root)',
      settings.maxNotes,
      settings.minGroup,
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
