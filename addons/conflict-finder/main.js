/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Konflikt-Marker / Conflict Finder – Markdown notes that contain Git merge
// conflict markers (<<<<<<< / ======= / >>>>>>>). Soft: skip lines inside
// fenced ``` / ~~~ blocks (false positives in code docs). Abgrenzung:
// empty/stale/duplicate/orphan = other hygiene; find-replace = manual edit;
// here = detection only. Scan-gate: notes.list/read never onActivate.
// v1: no notes:write.

const SETTINGS_KEY = 'settings'
const PANEL_ID = 'cf'
const STATUS_ID = 'cf'
const DEFAULT_MAX_NOTES = 400
const MD_EXT_RE = /\.(md|markdown)$/iu

/** Soft marker prefixes after trim (startswith). */
const MARKER_PREFIXES = ['<<<<<<<', '=======', '>>>>>>>']

/**
 * @typedef {{
 *   maxNotes: number,
 *   folder: string,
 *   showStatus: boolean,
 * }} Settings
 */

/**
 * @typedef {{
 *   path: string,
 *   title: string,
 *   lines: number[],
 * }} ConflictItem
 */

/**
 * @typedef {{
 *   scanned: number,
 *   fileCount: number,
 *   markerLines: number,
 *   items: ConflictItem[],
 *   builtAt: number,
 * }} View
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  maxNotes: DEFAULT_MAX_NOTES,
  folder: '',
  showStatus: false,
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
 * Clamp maxNotes to integer 1–2000.
 * @param {unknown} raw
 */
function clampMaxNotes(raw) {
  let n = Number(raw)
  if (!Number.isFinite(n)) n = DEFAULT_MAX_NOTES
  n = Math.floor(n)
  if (n < 1) n = 1
  if (n > 2000) n = 2000
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
 * True if trimmed line starts with a Git conflict marker Soft.
 * @param {string} line
 */
function isConflictMarkerLine(line) {
  const trimmed = String(line ?? '').trimStart()
  for (const prefix of MARKER_PREFIXES) {
    if (trimmed.startsWith(prefix)) return true
  }
  return false
}

/**
 * Collect 1-based line numbers of conflict markers.
 * Soft: skip lines inside fenced ``` / ~~~ blocks (toggle on fence lines).
 * @param {string} text
 * @returns {number[]}
 */
function findConflictLines(text) {
  const normalised = String(text ?? '').replace(/\r\n|\r/g, '\n')
  const lines = normalised.split('\n')
  /** @type {number[]} */
  const hits = []
  let inFence = false
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const trimmed = line.trimStart()
    const isFence = trimmed.startsWith('```') || trimmed.startsWith('~~~')
    if (isFence) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    if (isConflictMarkerLine(line)) {
      hits.push(i + 1)
    }
  }
  return hits
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
    folder,
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
      folder: settings.folder,
      showStatus: settings.showStatus,
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
 * Apply folder (+ optional maxNotes) from panel values / drafts.
 * @param {Record<string, unknown>} [values]
 * @param {{ silent?: boolean }} [opts]
 * @returns {Promise<boolean>}
 */
async function applySettingsFromValues(values, opts = {}) {
  const rawFolder = values && values.folder != null ? values.folder : folderDraft
  const rawMax =
    values && values.maxNotes != null ? values.maxNotes : settings.maxNotes

  const folderNorm = normalizeFolder(rawFolder)
  if (folderNorm === null) {
    await fanotes.ui.toast(
      t('Ungültiger Ordnerpfad (kein „..“ erlaubt).', 'Invalid folder path (".." is not allowed).'),
      'error',
    )
    return false
  }

  const rollback = { ...settings }
  settings.maxNotes = clampMaxNotes(rawMax)
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
        `Einstellungen übernommen${settings.folder ? ` (Ordner: ${settings.folder})` : ''}.`,
        `Settings applied${settings.folder ? ` (folder: ${settings.folder})` : ''}.`,
      ),
      'success',
    )
  }
  return true
}

/**
 * Scan Markdown notes for Git conflict markers (SCAN GATE — never from onActivate).
 * 1. list → md → folder → modifiedAt desc → slice maxNotes
 * 2. read each; collect {path,title,lines} if any marker
 * 3. sort by path
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

    const mdNotes = notes
      .filter((n) => MD_EXT_RE.test(n.path))
      .filter((n) => inFolder(n.path, folder))
      .sort((a, b) => {
        const byDate = compareModifiedDesc(a.modifiedAt, b.modifiedAt)
        if (byDate !== 0) return byDate
        return String(a.path).localeCompare(String(b.path))
      })
      .slice(0, settings.maxNotes)

    /** @type {ConflictItem[]} */
    const hits = []
    let scanned = 0
    let markerLines = 0

    for (const note of mdNotes) {
      scanned += 1
      let text = ''
      try {
        text = await fanotes.notes.read(note.path)
      } catch (error) {
        fanotes.log('read failed', note.path, errMessage(error))
        continue
      }

      const lines = findConflictLines(text)
      if (!lines.length) continue

      markerLines += lines.length
      hits.push({
        path: note.path,
        title: note.title || basenameNoExt(note.path),
        lines,
      })
    }

    // Sort by path Soft.
    hits.sort((a, b) => a.path.localeCompare(b.path))

    view = {
      scanned,
      fileCount: hits.length,
      markerLines,
      items: hits,
      builtAt: Date.now(),
    }
    scannedOnce = true

    if (!opts.silent) {
      await fanotes.ui.toast(
        t(
          `Scan: ${hits.length} Datei(en), ${markerLines} Marker-Zeile(n) (${scanned} geprüft).`,
          `Scan: ${hits.length} file(s), ${markerLines} marker line(s) (${scanned} checked).`,
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
 * Status Soft: count after scan only when showStatus && scannedOnce.
 * Never from onActivate scan.
 */
async function updateStatus() {
  try {
    if (!settings.showStatus || !scannedOnce) {
      await fanotes.ui.status.remove(STATUS_ID)
      return
    }
    const n = view ? view.fileCount : 0
    await fanotes.ui.status.set({
      id: STATUS_ID,
      text: `⚡ ${n}`,
      title: t('Konflikt-Marker öffnen', 'Open Conflict Finder'),
      priority: 42,
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
  const filesLabel = view
    ? String(view.fileCount)
    : scanning
      ? '…'
      : scannedOnce
        ? '0'
        : '–'
  const markersLabel = view
    ? String(view.markerLines)
    : scanning
      ? '…'
      : scannedOnce
        ? '0'
        : '–'

  const listItems = view
    ? view.items.map((item) => ({
        id: item.path,
        title: item.title,
        detail: `L${item.lines.join(',')} · ${item.path}`,
      }))
    : []

  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Konflikt-Marker', 'Conflict Finder'), level: 2 },
    {
      type: 'keyvalue',
      items: [
        { key: t('Dateien', 'Files'), value: filesLabel },
        { key: t('Marker-Zeilen', 'Marker lines'), value: markersLabel },
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
      id: 'conflicts',
      empty: scannedOnce
        ? t('Keine Konfliktmarker gefunden.', 'No conflict markers found.')
        : t('Noch nicht gescannt – „Aktualisieren“ tippen.', 'Not scanned yet – tap “Refresh”.'),
      items: listItems,
    },
    { type: 'divider' },
    {
      type: 'checkbox',
      id: 'showStatus',
      label: t('Statusleiste ⚡ N anzeigen', 'Show status bar ⚡ N'),
      checked: settings.showStatus === true,
    },
    {
      type: 'text',
      muted: true,
      text: t(
        `Nur .md/.markdown · Cap ${settings.maxNotes} · Marker <<<<<<< / ======= / >>>>>>> · fenced \`\`\` Soft übersprungen · kein Schreiben · Abgrenzung: empty/stale/duplicate/orphan = andere Hygiene; find-replace = manuell; hier = Erkennung.`,
        `Only .md/.markdown · cap ${settings.maxNotes} · markers <<<<<<< / ======= / >>>>>>> · fenced \`\`\` Soft skipped · no write · vs empty/stale/duplicate/orphan = other hygiene; find-replace = manual; here = detection.`,
      ),
    },
  ]

  return blocks
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Konflikt-Marker', 'Conflict Finder'))
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
        `${view.fileCount} Datei(en) mit Konfliktmarkern (${view.markerLines} Zeilen).`,
        `${view.fileCount} file(s) with conflict markers (${view.markerLines} lines).`,
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
      title: t('Konflikt-Marker', 'Conflict Finder'),
      icon: '⚡',
      blocks: renderBlocks(),
      focus: true,
    })

    panel.onAction(async (action) => {
      try {
        if (action.id === 'refresh' || action.id === 'submit:folder') {
          const values = action.values || {}
          if (values.folder != null) folderDraft = String(values.folder)
          const ok = await applySettingsFromValues(values, {
            silent: action.id !== 'refresh',
          })
          if (!ok) return
          await rescan({ silent: action.id !== 'refresh' })
          return
        }
        if (action.id === 'conflicts' && action.itemId) {
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
        if (input.id === 'showStatus') {
          const prev = settings.showStatus
          const rollback = { ...settings }
          settings.showStatus = input.value === true
          const ok = await saveSettings(rollback)
          if (!ok) {
            settings.showStatus = prev
            await refreshPanel()
            return
          }
          await updateStatus()
          await refreshPanel()
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
 * Command: open the first conflicting note (path-sorted).
 */
async function openFirst() {
  try {
    await rescan({ silent: true })

    if (!view || !view.items.length) {
      await fanotes.ui.toast(
        t('Keine Konfliktmarker gefunden.', 'No conflict markers found.'),
        'info',
      )
      return
    }

    const first = view.items[0]
    try {
      await fanotes.notes.open(first.path)
      await fanotes.ui.toast(
        t(
          `Geöffnet: ${first.title} (L${first.lines.join(',')})`,
          `Opened: ${first.title} (L${first.lines.join(',')})`,
        ),
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
  title: t('Konflikt-Marker öffnen', 'Open Conflict Finder'),
  detail: t(
    'Panel mit Markdown-Notizen, die Git-Merge-Konfliktmarker enthalten',
    'Panel of Markdown notes that contain Git merge conflict markers',
  ),
  keywords: 'conflict konflikt git merge markers marker hygiene scannen scan öffnen open',
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
  title: t('Konflikt-Scan aktualisieren', 'Refresh conflict scan'),
  detail: t(
    'Markdown-Notizen erneut lesen und nach Konfliktmarkern scannen',
    'Re-read Markdown notes and scan for conflict markers',
  ),
  keywords: 'conflict konflikt rescan aktualisieren refresh scan git merge markers',
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
  title: t('Erste Konfliktnotiz öffnen', 'Open first conflict note'),
  detail: t(
    'Erste Notiz mit Konfliktmarkern öffnen (Pfad-Sortierung)',
    'Open the first note with conflict markers (path sort)',
  ),
  keywords: 'conflict konflikt first erste öffnen open git merge markers',
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
    // Remove cold status — never Activate-Scan for status count.
    await loadSettings()
    scannedOnce = false
    view = null
    await fanotes.ui.status.remove(STATUS_ID)
    fanotes.log(
      'conflict-finder activated',
      fanotes.app.appVersion,
      settings.maxNotes,
      settings.folder || '(root)',
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
  try {
    await fanotes.ui.status.remove(STATUS_ID)
  } catch {
    // Host tears down UI; ignore.
  }
  panel = null
  view = null
})
