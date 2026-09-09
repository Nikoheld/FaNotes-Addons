/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Meist geöffnet / Hot Notes – ranks Markdown notes by page-stats
// openCount, dwellMs, or focusMs. Abgrenzung: writing-streak = streak/focus
// aggregate; weekly-digest = week summary; note-statistics = broader stats UI.
// Scan-gate: notes.list / stats.read never onActivate.

const SETTINGS_KEY = 'settings'
const PANEL_ID = 'hot'
const STATUS_ID = 'hot'
const DEFAULT_MAX_NOTES = 300
const DEFAULT_TOP_N = 40
const DEFAULT_METRIC = 'openCount'
const MD_EXT_RE = /\.(md|markdown)$/iu

/**
 * @typedef {'openCount' | 'dwellMs' | 'focusMs'} Metric
 */

/**
 * @typedef {{
 *   maxNotes: number,
 *   metric: Metric,
 *   topN: number,
 *   folder: string,
 *   showStatus: boolean,
 * }} Settings
 */

/**
 * @typedef {{
 *   path: string,
 *   title: string,
 *   value: number,
 *   openCount: number,
 *   dwellMs: number,
 *   focusMs: number,
 * }} HotRow
 */

/**
 * @typedef {{
 *   scanned: number,
 *   topCount: number,
 *   items: HotRow[],
 *   metric: Metric,
 *   builtAt: number,
 * }} View
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  maxNotes: DEFAULT_MAX_NOTES,
  metric: DEFAULT_METRIC,
  topN: DEFAULT_TOP_N,
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

/** Draft inputs shown in the panel (may differ until Refresh). */
let folderDraft = ''
let topNDraft = String(DEFAULT_TOP_N)
/** @type {Metric} */
let metricDraft = DEFAULT_METRIC

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
 * Clamp maxNotes to integer 50–1000.
 * @param {unknown} raw
 */
function clampMaxNotes(raw) {
  let n = Number(raw)
  if (!Number.isFinite(n)) n = DEFAULT_MAX_NOTES
  n = Math.floor(n)
  if (n < 50) n = 50
  if (n > 1000) n = 1000
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
 * @param {unknown} raw
 * @returns {Metric}
 */
function normalizeMetric(raw) {
  const s = String(raw ?? '')
  if (s === 'dwellMs' || s === 'focusMs' || s === 'openCount') return s
  return DEFAULT_METRIC
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
 * Non-negative finite number from a stats field; default 0.
 * @param {unknown} raw
 */
function numOrZero(raw) {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

/**
 * Extract openCount / dwellMs / focusMs from fanotes.stats.read payload.
 * Top-level fields per API.md / pageStats; focusMs also used by writing-streak.
 * Soft: missing / nested-only → 0 (zeros sort last on DESC).
 * @param {unknown} stats
 * @returns {{ openCount: number, dwellMs: number, focusMs: number }}
 */
function extractHotStats(stats) {
  if (!stats || typeof stats !== 'object') {
    return { openCount: 0, dwellMs: 0, focusMs: 0 }
  }
  const obj = /** @type {Record<string, unknown>} */ (stats)

  let openCount = numOrZero(obj.openCount)
  if (openCount === 0 && obj.opens != null) openCount = numOrZero(obj.opens)

  let dwellMs = numOrZero(obj.dwellMs)
  if (dwellMs === 0 && obj.dwell != null) dwellMs = numOrZero(obj.dwell)

  let focusMs = numOrZero(obj.focusMs)
  // writing-streak also reads focusMs top-level; keep soft nested fallbacks.
  if (focusMs === 0 && obj.focus && typeof obj.focus === 'object') {
    const focusObj = /** @type {Record<string, unknown>} */ (obj.focus)
    focusMs = numOrZero(focusObj.ms)
  }

  return { openCount, dwellMs, focusMs }
}

/**
 * Metric value for ranking.
 * @param {{ openCount: number, dwellMs: number, focusMs: number }} extracted
 * @param {Metric} metric
 */
function metricValue(extracted, metric) {
  if (metric === 'dwellMs') return extracted.dwellMs
  if (metric === 'focusMs') return extracted.focusMs
  return extracted.openCount
}

/**
 * Format list detail: opens as count, dwell/focus as minutes.
 * @param {Metric} metric
 * @param {number} value
 */
function formatMetricDetail(metric, value) {
  if (metric === 'openCount') {
    const n = Math.round(value)
    return t(`${n}× geöffnet`, `${n} opens`)
  }
  const minutes = Math.round(value / 60000)
  if (metric === 'dwellMs') {
    return t(`${minutes} min Verweil`, `${minutes} min dwell`)
  }
  return t(`${minutes} min Fokus`, `${minutes} min focus`)
}

/**
 * @param {Metric} metric
 */
function metricLabel(metric) {
  if (metric === 'dwellMs') return t('Verweildauer (dwellMs)', 'Dwell time (dwellMs)')
  if (metric === 'focusMs') return t('Fokuszeit (focusMs)', 'Focus time (focusMs)')
  return t('Öffnungen (openCount)', 'Opens (openCount)')
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
    metric: normalizeMetric(obj.metric),
    topN: clampTopN(obj.topN),
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
  topNDraft = String(settings.topN)
  metricDraft = settings.metric
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
      metric: settings.metric,
      topN: settings.topN,
      folder: settings.folder,
      showStatus: settings.showStatus,
    })
    return true
  } catch (error) {
    if (rollback) settings = { ...rollback }
    folderDraft = settings.folder
    topNDraft = String(settings.topN)
    metricDraft = settings.metric
    await fanotes.ui.toast(
      t(`Speichern fehlgeschlagen: ${errMessage(error)}`, `Save failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

/**
 * Apply metric + folder + topN from panel values / drafts; persist with rollback.
 * @param {Record<string, unknown>} [values]
 * @param {{ silent?: boolean }} [opts]
 * @returns {Promise<boolean>}
 */
async function applySettingsFromValues(values, opts = {}) {
  const rawMetric = values && values.metric != null ? values.metric : metricDraft
  const rawFolder = values && values.folder != null ? values.folder : folderDraft
  const rawTopN = values && values.topN != null ? values.topN : topNDraft

  const metric = normalizeMetric(rawMetric)
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
  settings.metric = metric
  settings.topN = topN
  settings.folder = folderNorm
  metricDraft = metric
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
        `Einstellungen übernommen (${metricLabel(settings.metric)}, Top ${settings.topN}${settings.folder ? `, Ordner: ${settings.folder}` : ''}).`,
        `Settings applied (${metricLabel(settings.metric)}, top ${settings.topN}${settings.folder ? `, folder: ${settings.folder}` : ''}).`,
      ),
      'success',
    )
  }
  return true
}

/**
 * Scan Markdown notes and rank by page stats (SCAN GATE — never from onActivate).
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
    const metric = settings.metric

    const mdNotes = notes
      .filter((n) => MD_EXT_RE.test(n.path) && inFolder(n.path, folder))
      .sort((a, b) => {
        const aMissing = a.modifiedAt == null || a.modifiedAt === ''
        const bMissing = b.modifiedAt == null || b.modifiedAt === ''
        if (aMissing && !bMissing) return 1
        if (!aMissing && bMissing) return -1
        if (aMissing && bMissing) return String(a.path).localeCompare(String(b.path))
        // modifiedAt DESC
        const byDate = String(b.modifiedAt).localeCompare(String(a.modifiedAt))
        if (byDate !== 0) return byDate
        return String(a.path).localeCompare(String(b.path))
      })
      .slice(0, settings.maxNotes)

    /** @type {HotRow[]} */
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

      const extracted = extractHotStats(stats)
      const value = metricValue(extracted, metric)
      rows.push({
        path: note.path,
        title: note.title || basenameNoExt(note.path),
        value,
        openCount: extracted.openCount,
        dwellMs: extracted.dwellMs,
        focusMs: extracted.focusMs,
      })
    }

    // Soft: zeros included and sort last on DESC; tiebreak path.
    rows.sort((a, b) => {
      if (b.value !== a.value) return b.value - a.value
      return a.path.localeCompare(b.path)
    })

    const items = rows.slice(0, settings.topN)
    view = {
      scanned: mdNotes.length,
      topCount: items.length,
      items,
      metric,
      builtAt: Date.now(),
    }
    scannedOnce = true

    if (!opts.silent) {
      await fanotes.ui.toast(
        t(
          `Hot-Scan: Top ${items.length} von ${mdNotes.length} (Metrik: ${metric}${skipped ? `, ${skipped} übersprungen` : ''}).`,
          `Hot scan: top ${items.length} of ${mdNotes.length} (metric: ${metric}${skipped ? `, ${skipped} skipped` : ''}).`,
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
 * Status `🔥 N` only when showStatus && scannedOnce (N = list length).
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
      text: `🔥 ${n}`,
      title: t('Hot Notes öffnen', 'Open Hot Notes'),
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
        detail: formatMetricDetail(view.metric, item.value),
        badge: String(index + 1),
      }))
    : []

  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Meist geöffnet', 'Hot Notes'), level: 2 },
    {
      type: 'keyvalue',
      items: [
        { key: t('Gescannt', 'Scanned'), value: scannedLabel },
        { key: t('Top', 'Top'), value: topLabel },
      ],
    },
    {
      type: 'select',
      id: 'metric',
      label: t('Metrik', 'Metric'),
      value: metricDraft,
      options: [
        { value: 'openCount', label: metricLabel('openCount') },
        { value: 'dwellMs', label: metricLabel('dwellMs') },
        { value: 'focusMs', label: metricLabel('focusMs') },
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
      id: 'hot',
      empty: scannedOnce
        ? t('Keine Notizen in diesem Ausschnitt.', 'No notes in this slice.')
        : t('Noch nicht gescannt – „Aktualisieren“ tippen.', 'Not scanned yet – tap “Refresh”.'),
      items: listItems,
    },
    { type: 'divider' },
    {
      type: 'checkbox',
      id: 'showStatus',
      label: t('Statusleiste 🔥 N anzeigen', 'Show status bar 🔥 N'),
      checked: settings.showStatus === true,
    },
    {
      type: 'text',
      muted: true,
      text: t(
        `Cap maxNotes=${settings.maxNotes} · Sort Wert DESC dann Pfad · dwell/focus als Minuten · Soft: 0 am Ende · Abgrenzung: writing-streak = Serie/Fokus-Aggregat; weekly-digest = Wochenübersicht; note-statistics = breitere Statistik-UI. Kein Schreiben/Netzwerk.`,
        `Cap maxNotes=${settings.maxNotes} · sort value DESC then path · dwell/focus as minutes · Soft: zeros last · vs writing-streak = streak/focus aggregate; weekly-digest = week overview; note-statistics = broader stats UI. No write/network.`,
      ),
    },
  ]

  return blocks
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Meist geöffnet', 'Hot Notes'))
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
        `Top ${view.topCount} Hot Notes (${view.metric}).`,
        `Top ${view.topCount} hot notes (${view.metric}).`,
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
    metricDraft = settings.metric

    panel = fanotes.ui.panel({
      id: PANEL_ID,
      title: t('Meist geöffnet', 'Hot Notes'),
      icon: '🔥',
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
          if (values.metric != null) metricDraft = normalizeMetric(values.metric)
          if (values.folder != null) folderDraft = String(values.folder)
          if (values.topN != null) topNDraft = String(values.topN)
          const ok = await applySettingsFromValues(values, { silent: true })
          if (!ok) return
          await rescan({ silent: false })
          return
        }
        if (action.id === 'hot' && action.itemId) {
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
        if (input.id === 'metric') {
          metricDraft = normalizeMetric(input.value)
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
 * Command: open the #1 hot note for the current metric.
 */
async function openTop() {
  try {
    await rescan({ silent: true })

    if (!view || !view.items.length) {
      await fanotes.ui.toast(
        t('Keine Hot Notes gefunden.', 'No hot notes found.'),
        'info',
      )
      return
    }

    const first = view.items[0]
    try {
      await fanotes.notes.open(first.path)
      await fanotes.ui.toast(
        t(
          `Geöffnet: ${first.title} (#1 · ${formatMetricDetail(view.metric, first.value)})`,
          `Opened: ${first.title} (#1 · ${formatMetricDetail(view.metric, first.value)})`,
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
  title: t('Hot Notes öffnen', 'Open Hot Notes'),
  detail: t(
    'Panel: Ranking nach openCount, dwellMs oder focusMs',
    'Panel: ranking by openCount, dwellMs, or focusMs',
  ),
  keywords: 'hot meist opened openCount dwell ranking frequently öffnen open',
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
  title: t('Hot-Scan aktualisieren', 'Refresh hot scan'),
  detail: t(
    'Markdown-Notizen listen und Seitenstatistik neu ranken',
    'List Markdown notes and re-rank page stats',
  ),
  keywords: 'hot meist rescan aktualisieren refresh scan openCount dwell ranking',
  run: async () => {
    try {
      await rescan({ silent: false })
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'open-top',
  title: t('Top Hot Note öffnen', 'Open top hot note'),
  detail: t(
    'Rang-1-Notiz der aktuellen Metrik öffnen',
    'Open the rank-1 note for the current metric',
  ),
  keywords: 'hot meist top öffnen open ranking first erste',
  run: async () => {
    try {
      await openTop()
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
      'hot-notes activated',
      fanotes.app.appVersion,
      settings.metric,
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
