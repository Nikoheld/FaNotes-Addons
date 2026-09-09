/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Zuletzt erstellt / Recently Created – ranks Markdown notes by page-stats
// createdAt or firstOpenedAt. Abgrenzung: hot-notes = openCount/dwell;
// stale-notes = old modifiedAt; weekly-digest = week modified; here =
// createdAt/firstOpenedAt ranking. Scan-gate: notes.list / stats.read
// never onActivate.

const SETTINGS_KEY = 'settings'
const PANEL_ID = 'created'
const STATUS_ID = 'created'
const DEFAULT_MAX_NOTES = 300
const DEFAULT_TOP_N = 40
const DEFAULT_FIELD = 'createdAt'
const MD_EXT_RE = /\.(md|markdown)$/iu

/**
 * @typedef {'createdAt' | 'firstOpenedAt'} DateField
 */

/**
 * @typedef {{
 *   maxNotes: number,
 *   topN: number,
 *   folder: string,
 *   field: DateField,
 *   showStatus: boolean,
 * }} Settings
 */

/**
 * @typedef {{
 *   path: string,
 *   title: string,
 *   date: string,
 *   source: string,
 * }} CreatedRow
 */

/**
 * @typedef {{
 *   scanned: number,
 *   topCount: number,
 *   skipped: number,
 *   items: CreatedRow[],
 *   field: DateField,
 *   builtAt: number,
 * }} View
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  maxNotes: DEFAULT_MAX_NOTES,
  topN: DEFAULT_TOP_N,
  folder: '',
  field: DEFAULT_FIELD,
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

/** Draft inputs shown in the panel (may differ until Refresh). */
let folderDraft = ''
let topNDraft = String(DEFAULT_TOP_N)
/** @type {DateField} */
let fieldDraft = DEFAULT_FIELD

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
 * Clamp maxNotes to integer 50–2000 Soft.
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
 * Clamp topN to integer 5–200 Soft.
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
 * @param {unknown} raw
 * @returns {DateField}
 */
function normalizeField(raw) {
  const s = String(raw ?? '')
  if (s === 'firstOpenedAt' || s === 'createdAt') return s
  return DEFAULT_FIELD
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
 * Soft date string from a stats field (ISO string or legacy number ms).
 * Empty / invalid → null.
 * @param {unknown} raw
 * @returns {string | null}
 */
function coerceDateString(raw) {
  if (raw == null || raw === '') return null
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    try {
      return new Date(raw).toISOString()
    } catch {
      return null
    }
  }
  const s = String(raw).trim()
  if (!s) return null
  const ms = Date.parse(s)
  if (!Number.isFinite(ms)) return null
  return s
}

/**
 * Soft field fallback: take preferred field; when missing continue chain.
 * createdAt → firstOpenedAt → modifiedAt (or firstOpenedAt → modifiedAt).
 * Skip row Soft if none.
 * @param {unknown} stats
 * @param {DateField} preferred
 * @returns {{ date: string, source: string } | null}
 */
function pickDate(stats, preferred) {
  if (!stats || typeof stats !== 'object') return null
  const obj = /** @type {Record<string, unknown>} */ (stats)

  /** @type {string[]} */
  const chain =
    preferred === 'firstOpenedAt'
      ? ['firstOpenedAt', 'modifiedAt']
      : ['createdAt', 'firstOpenedAt', 'modifiedAt']

  for (const key of chain) {
    const date = coerceDateString(obj[key])
    if (date) return { date, source: key }
  }
  return null
}

/**
 * Locale date Soft for list detail.
 * @param {string} iso
 */
function formatLocaleDate(iso) {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return String(iso).slice(0, 32)
  try {
    const loc = fanotes.app.language === 'en' ? 'en-US' : 'de-DE'
    return new Date(ms).toLocaleDateString(loc, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return new Date(ms).toISOString().slice(0, 10)
  }
}

/**
 * List detail: locale date · path Soft.
 * @param {CreatedRow} item
 */
function formatDetail(item) {
  return `${formatLocaleDate(item.date)} · ${item.path}`
}

/**
 * @param {DateField} field
 */
function fieldLabel(field) {
  if (field === 'firstOpenedAt') {
    return t('Erstmals geöffnet (firstOpenedAt)', 'First opened (firstOpenedAt)')
  }
  return t('Erstellt (createdAt)', 'Created (createdAt)')
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
    topN: clampTopN(obj.topN),
    folder,
    field: normalizeField(obj.field),
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
  topNDraft = String(settings.topN)
  fieldDraft = settings.field
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
      topN: settings.topN,
      folder: settings.folder,
      field: settings.field,
      showStatus: settings.showStatus,
    })
    return true
  } catch (error) {
    if (rollback) settings = { ...rollback }
    folderDraft = settings.folder
    topNDraft = String(settings.topN)
    fieldDraft = settings.field
    await fanotes.ui.toast(
      t(`Speichern fehlgeschlagen: ${errMessage(error)}`, `Save failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

/**
 * Apply field + folder + topN from panel values / drafts; persist with rollback.
 * @param {Record<string, unknown>} [values]
 * @param {{ silent?: boolean }} [opts]
 * @returns {Promise<boolean>}
 */
async function applySettingsFromValues(values, opts = {}) {
  const rawField = values && values.field != null ? values.field : fieldDraft
  const rawFolder = values && values.folder != null ? values.folder : folderDraft
  const rawTopN = values && values.topN != null ? values.topN : topNDraft

  const field = normalizeField(rawField)
  const topN = clampTopN(rawTopN)
  const folderNorm = normalizeFolder(rawFolder)
  if (folderNorm === null) {
    await fanotes.ui.toast(
      t('Ungültiger Ordnerpfad (kein „..“ erlaubt).', 'Invalid folder path (".." is not allowed).'),
      'error',
    )
    return false
  }

  const rollback = { ...settings }
  settings.field = field
  settings.topN = topN
  settings.folder = folderNorm
  fieldDraft = field
  topNDraft = String(topN)
  folderDraft = folderNorm

  const ok = await saveSettings(rollback)
  if (!ok) {
    await refreshPanel()
    return false
  }

  if (!opts.silent) {
    await fanotes.ui.toast(
      t(
        `Einstellungen übernommen (${fieldLabel(settings.field)}, Top ${settings.topN}${settings.folder ? `, Ordner: ${settings.folder}` : ''}).`,
        `Settings applied (${fieldLabel(settings.field)}, top ${settings.topN}${settings.folder ? `, folder: ${settings.folder}` : ''}).`,
      ),
      'success',
    )
  }
  return true
}

/**
 * Scan Markdown notes and rank by creation / first-open date
 * (SCAN GATE — never from onActivate).
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
    const field = settings.field

    // Soft Cap: filter md|markdown + folder; sort modifiedAt DESC localeCompare; slice maxNotes
    const mdNotes = notes
      .filter((n) => MD_EXT_RE.test(n.path) && inFolder(n.path, folder))
      .sort((a, b) => {
        const aMissing = a.modifiedAt == null || a.modifiedAt === ''
        const bMissing = b.modifiedAt == null || b.modifiedAt === ''
        if (aMissing && !bMissing) return 1
        if (!aMissing && bMissing) return -1
        if (aMissing && bMissing) return String(a.path).localeCompare(String(b.path))
        const byDate = String(b.modifiedAt).localeCompare(String(a.modifiedAt))
        if (byDate !== 0) return byDate
        return String(a.path).localeCompare(String(b.path))
      })
      .slice(0, settings.maxNotes)

    /** @type {CreatedRow[]} */
    const rows = []
    let skipped = 0

    for (const note of mdNotes) {
      let stats = null
      try {
        stats = await fanotes.stats.read(note.path)
      } catch (error) {
        fanotes.log('stats.read failed', note.path, errMessage(error))
        skipped += 1
        continue
      }

      const picked = pickDate(stats, field)
      if (!picked) {
        // Soft: no createdAt / firstOpenedAt / modifiedAt → skip row for ranking
        skipped += 1
        continue
      }

      rows.push({
        path: note.path,
        title: note.title || basenameNoExt(note.path),
        date: picked.date,
        source: picked.source,
      })
    }

    // Sort by date field DESC Soft (newest first), path tiebreak
    rows.sort((a, b) => {
      const byDate = String(b.date).localeCompare(String(a.date))
      if (byDate !== 0) return byDate
      return a.path.localeCompare(b.path)
    })

    const items = rows.slice(0, settings.topN)
    view = {
      scanned: mdNotes.length,
      topCount: items.length,
      skipped,
      items,
      field,
      builtAt: Date.now(),
    }
    scannedOnce = true

    if (!opts.silent) {
      await fanotes.ui.toast(
        t(
          `Erstellt-Scan: Top ${items.length} von ${mdNotes.length} (Feld: ${field}${skipped ? `, ${skipped} übersprungen` : ''}).`,
          `Created scan: top ${items.length} of ${mdNotes.length} (field: ${field}${skipped ? `, ${skipped} skipped` : ''}).`,
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
 * Soft light status `✨ N` after scan when showStatus (N = list length).
 */
async function updateStatus() {
  try {
    if (!settings.showStatus || !scannedOnce) {
      await fanotes.ui.status.remove(STATUS_ID)
      return
    }
    const n = view ? view.topCount : 0
    await fanotes.ui.status.set({
      id: STATUS_ID,
      text: `✨ ${n}`,
      title: t('Zuletzt erstellt öffnen', 'Open Recently Created'),
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
  const topLabel = view
    ? String(view.topCount)
    : scanning
      ? '…'
      : scannedOnce
        ? '0'
        : '–'

  const listItems = view
    ? view.items.map((item, index) => ({
        id: item.path,
        title: item.title,
        detail: formatDetail(item),
        badge: String(index + 1),
      }))
    : []

  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Zuletzt erstellt', 'Recently Created'), level: 2 },
    {
      type: 'keyvalue',
      items: [
        { key: t('Gescannt', 'Scanned'), value: scannedLabel },
        { key: t('Top', 'Top'), value: topLabel },
      ],
    },
    {
      type: 'select',
      id: 'field',
      label: t('Datumsfeld', 'Date field'),
      value: fieldDraft,
      options: [
        { value: 'createdAt', label: fieldLabel('createdAt') },
        { value: 'firstOpenedAt', label: fieldLabel('firstOpenedAt') },
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
      id: 'topN',
      label: t('Top N (5–200)', 'Top N (5–200)'),
      value: topNDraft,
      placeholder: String(DEFAULT_TOP_N),
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
      id: 'created',
      empty: scannedOnce
        ? t('Keine Notizen in diesem Ausschnitt.', 'No notes in this slice.')
        : t('Noch nicht gescannt – „Aktualisieren“ tippen.', 'Not scanned yet – tap “Refresh”.'),
      items: listItems,
    },
    { type: 'divider' },
    {
      type: 'checkbox',
      id: 'showStatus',
      label: t('Statusleiste ✨ N anzeigen', 'Show status bar ✨ N'),
      checked: settings.showStatus === true,
    },
    {
      type: 'text',
      muted: true,
      text: t(
        `Cap maxNotes=${settings.maxNotes} · Sort Datum DESC · Soft-Fallback createdAt→firstOpenedAt→modifiedAt · ältere .famd ohne createdAt Soft · Abgrenzung: hot-notes = openCount/dwell; stale-notes = altes modifiedAt; weekly-digest = Woche modified. Kein Schreiben/Netzwerk.`,
        `Cap maxNotes=${settings.maxNotes} · sort date DESC · Soft fallback createdAt→firstOpenedAt→modifiedAt · older .famd without createdAt Soft · vs hot-notes = openCount/dwell; stale-notes = old modifiedAt; weekly-digest = week modified. No write/network.`,
      ),
    },
  ]

  return blocks
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Zuletzt erstellt', 'Recently Created'))
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
        `Top ${view.topCount} zuletzt erstellt (${view.field}).`,
        `Top ${view.topCount} recently created (${view.field}).`,
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
    topNDraft = String(settings.topN)
    fieldDraft = settings.field

    panel = fanotes.ui.panel({
      id: PANEL_ID,
      title: t('Zuletzt erstellt', 'Recently Created'),
      icon: '✨',
      blocks: renderBlocks(),
      focus: true,
    })

    panel.onAction(async (action) => {
      try {
        if (
          action.id === 'refresh' ||
          action.id === 'submit:folder' ||
          action.id === 'submit:topN'
        ) {
          const values = action.values || {}
          if (values.field != null) fieldDraft = normalizeField(values.field)
          if (values.folder != null) folderDraft = String(values.folder)
          if (values.topN != null) topNDraft = String(values.topN)
          const ok = await applySettingsFromValues(values, { silent: true })
          if (!ok) return
          await rescan({ silent: false })
          return
        }
        if (action.id === 'created' && action.itemId) {
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
        if (input.id === 'field') {
          fieldDraft = normalizeField(input.value)
          return
        }
        if (input.id === 'folder') {
          folderDraft = String(input.value ?? '')
          return
        }
        if (input.id === 'topN') {
          topNDraft = String(input.value ?? '')
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
 * Command open-newest Soft: after scan (or use last cache Soft),
 * open first item Soft via notes.open.
 */
async function openNewest() {
  try {
    // Soft: prefer last cache when present; else scan
    if (!view || !view.items.length) {
      await rescan({ silent: true })
    }

    if (!view || !view.items.length) {
      await fanotes.ui.toast(
        t('Keine neu erstellten Notizen gefunden.', 'No recently created notes found.'),
        'info',
      )
      return
    }

    const first = view.items[0]
    try {
      await fanotes.notes.open(first.path)
      await fanotes.ui.toast(
        t(
          `Geöffnet: ${first.title} (#1 · ${formatLocaleDate(first.date)})`,
          `Opened: ${first.title} (#1 · ${formatLocaleDate(first.date)})`,
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
  title: t('Zuletzt erstellt öffnen', 'Open Recently Created'),
  detail: t(
    'Panel: Ranking nach createdAt oder firstOpenedAt',
    'Panel: ranking by createdAt or firstOpenedAt',
  ),
  keywords: 'created erstellt neu recent createdAt ranking firstOpenedAt newest zuletzt öffnen open',
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
  title: t('Erstellt-Scan aktualisieren', 'Refresh created scan'),
  detail: t(
    'Markdown-Notizen listen und Erstelldatum neu ranken',
    'List Markdown notes and re-rank by creation date',
  ),
  keywords: 'created erstellt rescan aktualisieren refresh scan createdAt ranking neu recent',
  run: async () => {
    try {
      await rescan({ silent: false })
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'open-newest',
  title: t('Neueste Notiz öffnen', 'Open newest note'),
  detail: t(
    'Rang-1-Notiz des aktuellen Datumsfelds öffnen',
    'Open the rank-1 note for the current date field',
  ),
  keywords: 'created erstellt newest neueste öffnen open ranking first erste recent',
  run: async () => {
    try {
      await openNewest()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.onActivate(async () => {
  try {
    // Light work only: settings. NO notes.list / stats.read (scan-gate).
    await loadSettings()
    scannedOnce = false
    view = null
    await fanotes.ui.status.remove(STATUS_ID)
    fanotes.log(
      'recently-created activated',
      fanotes.app.appVersion,
      settings.field,
      settings.maxNotes,
      settings.topN,
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
  try {
    await fanotes.ui.status.remove(STATUS_ID)
  } catch {
    // Host tears down UI; ignore.
  }
  panel = null
  view = null
})
