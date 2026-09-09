/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Stunden-Heatmap / Hour Heatmap – aggregates page-stats opensByHour /
// dwellByHour into a 24h profile. Abgrenzung: writing-streak = Serie;
// hot-notes = Ranking Notizen; weekly-digest = Woche; hier = 24h-Profil.
// Scan-gate: notes.list / stats.read never onActivate.
// Soft focusProxy: no focusByHour in API → ≡ dwellByHour Soft.

const SETTINGS_KEY = 'settings'
const PANEL_ID = 'heat'
const DEFAULT_MAX_NOTES = 300
const DEFAULT_METRIC = 'dwellByHour'
const MD_EXT_RE = /\.(md|markdown)$/iu
const BAR_WIDTH = 20
const HOURS = 24

/**
 * @typedef {'dwellByHour' | 'opensByHour' | 'focusProxy'} Metric
 */

/**
 * @typedef {{
 *   maxNotes: number,
 *   metric: Metric,
 *   folder: string,
 * }} Settings
 */

/**
 * @typedef {{
 *   buckets: number[],
 *   scanned: number,
 *   skipped: number,
 *   peakHour: number,
 *   peakValue: number,
 *   metric: Metric,
 *   builtAt: number,
 * }} View
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  maxNotes: DEFAULT_MAX_NOTES,
  metric: DEFAULT_METRIC,
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

/** Draft inputs shown in the panel (may differ until Refresh). */
let folderDraft = ''
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
 * Clamp maxNotes to integer 50–1000 (Soft).
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
 * @param {unknown} raw
 * @returns {Metric}
 */
function normalizeMetric(raw) {
  const s = String(raw ?? '')
  if (s === 'opensByHour' || s === 'focusProxy' || s === 'dwellByHour') return s
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
 * Non-negative finite number; Soft missing → 0.
 * @param {unknown} raw
 */
function numOrZero(raw) {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

/**
 * Soft: missing / non-array / short / non-finite → zeros for hours 0–23.
 * Mirrors hot-notes / writing-streak Soft for stats.read fields.
 * @param {unknown} raw
 * @returns {number[]}
 */
function hourArrayOrZeros(raw) {
  /** @type {number[]} */
  const out = new Array(HOURS).fill(0)
  if (!Array.isArray(raw)) return out
  const len = Math.min(HOURS, raw.length)
  for (let i = 0; i < len; i++) {
    out[i] = numOrZero(raw[i])
  }
  return out
}

/**
 * Extract 24h buckets from fanotes.stats.read payload.
 * Soft: missing fields → zeros.
 * Soft focusProxy: API has no focusByHour → ≡ dwellByHour Soft.
 * @param {unknown} stats
 * @param {Metric} metric
 * @returns {number[]}
 */
function extractHourBuckets(stats, metric) {
  if (!stats || typeof stats !== 'object') {
    return new Array(HOURS).fill(0)
  }
  const obj = /** @type {Record<string, unknown>} */ (stats)

  if (metric === 'opensByHour') {
    return hourArrayOrZeros(obj.opensByHour)
  }

  // dwellByHour and focusProxy Soft both use dwellByHour.
  // Soft: no separate focusByHour in API → focusProxy ≡ dwellByHour Soft.
  return hourArrayOrZeros(obj.dwellByHour)
}

/**
 * @param {Metric} metric
 */
function metricLabel(metric) {
  if (metric === 'opensByHour') return t('Öffnungen (opensByHour)', 'Opens (opensByHour)')
  if (metric === 'focusProxy') {
    return t(
      'Fokus-Proxy (≡ dwellByHour Soft)',
      'Focus proxy (≡ dwellByHour Soft)',
    )
  }
  return t('Verweilzeit (dwellByHour)', 'Dwell time (dwellByHour)')
}

/**
 * Scale value to a Soft bar of block chars ░▒▓█ (ascii # Soft fallback unused).
 * @param {number} value
 * @param {number} max
 * @param {number} width
 */
function renderBar(value, max, width) {
  const w = Math.max(1, Math.floor(width))
  if (!(max > 0) || !(value > 0)) {
    return '░'.repeat(w)
  }
  const ratio = Math.max(0, Math.min(1, value / max))
  const filled = Math.round(ratio * w)
  if (filled <= 0) return '░'.repeat(w)
  // Soft intensity: full █ for filled span; light ░ for remainder.
  // Mid cells use ▒/▓ when partial fill would help readability on tiny ratios.
  if (filled >= w) return '█'.repeat(w)
  const empty = w - filled
  // Prefer solid filled + empty Soft (matches Soft line `00 | ███ …`).
  return `${'█'.repeat(filled)}${'░'.repeat(empty)}`
}

/**
 * Soft lines for hours 0–23, scaled to max.
 * @param {number[]} buckets
 * @returns {string}
 */
function renderHeatmapText(buckets) {
  let max = 0
  for (let i = 0; i < HOURS; i++) {
    const v = buckets[i] || 0
    if (v > max) max = v
  }
  /** @type {string[]} */
  const lines = []
  for (let h = 0; h < HOURS; h++) {
    const label = String(h).padStart(2, '0')
    const bar = renderBar(buckets[h] || 0, max, BAR_WIDTH)
    lines.push(`${label} | ${bar}`)
  }
  return lines.join('\n')
}

/**
 * Peak hour index (0–23). Ties → lowest hour. All-zero → 0 with peakValue 0.
 * @param {number[]} buckets
 * @returns {{ hour: number, value: number }}
 */
function findPeak(buckets) {
  let hour = 0
  let value = 0
  for (let h = 0; h < HOURS; h++) {
    const v = buckets[h] || 0
    if (v > value) {
      value = v
      hour = h
    }
  }
  return { hour, value }
}

/**
 * Format peak for keyvalue Soft.
 * @param {number} hour
 * @param {number} value
 * @param {Metric} metric
 */
function formatPeak(hour, value, metric) {
  if (!(value > 0)) return t('– (keine Daten)', '– (no data)')
  const label = `${String(hour).padStart(2, '0')}:00`
  if (metric === 'opensByHour') {
    const n = Math.round(value)
    return t(`${label} (${n}×)`, `${label} (${n}×)`)
  }
  // dwell / focusProxy Soft: milliseconds → minutes Soft
  const minutes = Math.round(value / 60000)
  return t(`${label} (${minutes} min)`, `${label} (${minutes} min)`)
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
      folder: settings.folder,
    })
    return true
  } catch (error) {
    if (rollback) settings = { ...rollback }
    folderDraft = settings.folder
    metricDraft = settings.metric
    await fanotes.ui.toast(
      t(`Speichern fehlgeschlagen: ${errMessage(error)}`, `Save failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

/**
 * Apply metric + folder from panel values / drafts; persist with rollback.
 * @param {Record<string, unknown>} [values]
 * @param {{ silent?: boolean }} [opts]
 * @returns {Promise<boolean>}
 */
async function applySettingsFromValues(values, opts = {}) {
  const rawMetric = values && values.metric != null ? values.metric : metricDraft
  const rawFolder = values && values.folder != null ? values.folder : folderDraft

  const metric = normalizeMetric(rawMetric)
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
  settings.folder = folderNorm
  metricDraft = metric
  folderDraft = folderNorm

  const ok = await saveSettings(rollback)
  if (!ok) {
    await refreshPanel()
    return false
  }

  if (!opts.silent) {
    await fanotes.ui.toast(
      t(
        `Einstellungen übernommen (${metricLabel(settings.metric)}${settings.folder ? `, Ordner: ${settings.folder}` : ''}).`,
        `Settings applied (${metricLabel(settings.metric)}${settings.folder ? `, folder: ${settings.folder}` : ''}).`,
      ),
      'success',
    )
  }
  return true
}

/**
 * Aggregate 24h buckets from page stats (SCAN GATE — never from onActivate).
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

    // Soft scan Soft: md|markdown, folder prefix Soft, modifiedAt DESC localeCompare, slice maxNotes.
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

    /** @type {number[]} */
    const buckets = new Array(HOURS).fill(0)
    let skipped = 0

    for (const note of mdNotes) {
      let stats = null
      try {
        stats = await fanotes.stats.read(note.path)
      } catch (error) {
        // Soft: mirror hot-notes / writing-streak — skip on stats.read failure.
        fanotes.log('stats.read failed', note.path, errMessage(error))
        skipped += 1
        continue
      }

      const hours = extractHourBuckets(stats, metric)
      for (let h = 0; h < HOURS; h++) {
        buckets[h] += hours[h]
      }
    }

    const peak = findPeak(buckets)
    view = {
      buckets,
      scanned: mdNotes.length,
      skipped,
      peakHour: peak.hour,
      peakValue: peak.value,
      metric,
      builtAt: Date.now(),
    }
    scannedOnce = true

    if (!opts.silent) {
      await fanotes.ui.toast(
        t(
          `Heatmap: Peak ${String(peak.hour).padStart(2, '0')}:00 · ${mdNotes.length} Notizen (${metric}${skipped ? `, ${skipped} übersprungen` : ''}).`,
          `Heatmap: peak ${String(peak.hour).padStart(2, '0')}:00 · ${mdNotes.length} notes (${metric}${skipped ? `, ${skipped} skipped` : ''}).`,
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
  const scannedLabel = view
    ? String(view.scanned)
    : scanning
      ? '…'
      : scannedOnce
        ? '0'
        : '–'

  const peakLabel = view
    ? formatPeak(view.peakHour, view.peakValue, view.metric)
    : scanning
      ? '…'
      : scannedOnce
        ? t('– (keine Daten)', '– (no data)')
        : '–'

  const heatText = view
    ? renderHeatmapText(view.buckets)
    : scanning
      ? t('Scan läuft …', 'Scanning …')
      : scannedOnce
        ? t('Keine Daten in diesem Ausschnitt.', 'No data in this slice.')
        : t(
            'Noch nicht gescannt – „Aktualisieren“ tippen.',
            'Not scanned yet – tap “Refresh”.',
          )

  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Stunden-Heatmap', 'Hour Heatmap'), level: 2 },
    {
      type: 'keyvalue',
      items: [
        { key: t('Peak-Stunde', 'Peak hour'), value: peakLabel },
        { key: t('Sample-Notizen', 'Sample notes'), value: scannedLabel },
      ],
    },
    {
      type: 'select',
      id: 'metric',
      label: t('Metrik', 'Metric'),
      value: metricDraft,
      options: [
        { value: 'dwellByHour', label: metricLabel('dwellByHour') },
        { value: 'opensByHour', label: metricLabel('opensByHour') },
        { value: 'focusProxy', label: metricLabel('focusProxy') },
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
      type: 'markdown',
      text: '```\n' + heatText + '\n```',
    },
    { type: 'divider' },
    {
      type: 'text',
      muted: true,
      text: t(
        `Cap maxNotes=${settings.maxNotes} · Soft: fehlende Felder → 0 · focusProxy ≡ dwellByHour Soft (kein focusByHour in API) · Abgrenzung: writing-streak = Serie; hot-notes = Ranking; weekly-digest = Woche; hier = 24h-Profil. Kein Schreiben/Netzwerk.`,
        `Cap maxNotes=${settings.maxNotes} · Soft: missing fields → 0 · focusProxy ≡ dwellByHour Soft (no focusByHour in API) · vs writing-streak = streak; hot-notes = ranking; weekly-digest = week; here = 24h profile. No write/network.`,
      ),
    },
  ]

  return blocks
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Stunden-Heatmap', 'Hour Heatmap'))
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
        `Heatmap bereit (Peak ${String(view.peakHour).padStart(2, '0')}:00 · ${view.scanned} Notizen).`,
        `Heatmap ready (peak ${String(view.peakHour).padStart(2, '0')}:00 · ${view.scanned} notes).`,
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
    metricDraft = settings.metric

    panel = fanotes.ui.panel({
      id: PANEL_ID,
      title: t('Stunden-Heatmap', 'Hour Heatmap'),
      icon: '⏱',
      blocks: renderBlocks(),
      focus: true,
    })

    panel.onAction(async (action) => {
      try {
        if (action.id === 'refresh' || action.id === 'submit:folder') {
          const values = action.values || {}
          if (values.metric != null) metricDraft = normalizeMetric(values.metric)
          if (values.folder != null) folderDraft = String(values.folder)
          const ok = await applySettingsFromValues(values, { silent: true })
          if (!ok) return
          await rescan({ silent: false })
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
        if (input.id === 'metric') {
          metricDraft = normalizeMetric(input.value)
          return
        }
        if (input.id === 'folder') {
          folderDraft = String(input.value ?? '')
          return
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
  title: t('Stunden-Heatmap öffnen', 'Open Hour Heatmap'),
  detail: t(
    'Panel: 24h-Profil aus opensByHour / dwellByHour',
    'Panel: 24h profile from opensByHour / dwellByHour',
  ),
  keywords: 'heatmap stunden hours focus dwell opensByHour chronotype öffnen open',
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
  title: t('Heatmap-Scan aktualisieren', 'Refresh heatmap scan'),
  detail: t(
    'Markdown-Notizen listen und Stunden-Buckets neu aggregieren',
    'List Markdown notes and re-aggregate hour buckets',
  ),
  keywords: 'heatmap stunden rescan aktualisieren refresh scan dwell opensByHour chronotype',
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
    // Light work only: settings. NO notes.list / stats.read (scan-gate).
    await loadSettings()
    scannedOnce = false
    view = null
    fanotes.log(
      'hour-heatmap activated',
      fanotes.app.appVersion,
      settings.metric,
      settings.maxNotes,
      settings.folder || '(root)',
    )
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(() => {
  panel = null
  view = null
  scannedOnce = false
  scanning = false
  scanQueued = false
})
