/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Lange Notizen / Long Notes – ranks Markdown notes by character or word
// length as split candidates. Abgrenzung: empty-notes = short; word-counter =
// live count; note-splitter = splits; hot-notes = opens. Scan-gate: notes.list
// / notes.read never onActivate. v1: no write, no vault, no network, no editor.

const SETTINGS_KEY = 'settings'
const PANEL_ID = 'long'
const DEFAULT_MAX_NOTES = 400
const DEFAULT_MIN_CHARS = 5000
const DEFAULT_TOP_N = 50
const DEFAULT_METRIC = 'chars'
const MD_EXT_RE = /\.(md|markdown)$/iu

/**
 * @typedef {'chars' | 'words'} Metric
 */

/**
 * @typedef {{
 *   maxNotes: number,
 *   minChars: number,
 *   folder: string,
 *   topN: number,
 *   metric: Metric,
 * }} Settings
 */

/**
 * @typedef {{
 *   path: string,
 *   title: string,
 *   chars: number,
 *   words: number,
 *   value: number,
 * }} LongItem
 */

/**
 * @typedef {{
 *   scanned: number,
 *   hitCount: number,
 *   items: LongItem[],
 *   metric: Metric,
 *   builtAt: number,
 * }} View
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  maxNotes: DEFAULT_MAX_NOTES,
  minChars: DEFAULT_MIN_CHARS,
  folder: '',
  topN: DEFAULT_TOP_N,
  metric: DEFAULT_METRIC,
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
let minCharsDraft = String(DEFAULT_MIN_CHARS)
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
 * Clamp minChars to integer 100–1_000_000.
 * @param {unknown} raw
 */
function clampMinChars(raw) {
  let n = Number(raw)
  if (!Number.isFinite(n)) n = DEFAULT_MIN_CHARS
  n = Math.floor(n)
  if (n < 100) n = 100
  if (n > 1_000_000) n = 1_000_000
  return n
}

/**
 * @param {unknown} raw
 * @returns {Metric}
 */
function normalizeMetric(raw) {
  const s = String(raw ?? '')
  if (s === 'words' || s === 'chars') return s
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
 * Soft chars: full note body length after notes.read (text.length).
 * @param {string} text
 */
function countChars(text) {
  return String(text ?? '').length
}

/**
 * Soft words: trim, split /\s+/, filter Boolean, .length.
 * @param {string} text
 */
function countWords(text) {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).filter(Boolean).length
}

/**
 * @param {Metric} metric
 */
function metricLabel(metric) {
  if (metric === 'words') return t('Wörter', 'Words')
  return t('Zeichen', 'Chars')
}

/**
 * List detail: `chars/words · path` Soft (both counts always shown).
 * @param {LongItem} item
 */
function formatDetail(item) {
  return t(
    `${item.chars} Z. / ${item.words} W. · ${item.path}`,
    `${item.chars} chars / ${item.words} words · ${item.path}`,
  )
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
    minChars: clampMinChars(obj.minChars),
    folder,
    topN: clampTopN(obj.topN),
    metric: normalizeMetric(obj.metric),
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
  minCharsDraft = String(settings.minChars)
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
      minChars: settings.minChars,
      folder: settings.folder,
      topN: settings.topN,
      metric: settings.metric,
    })
    return true
  } catch (error) {
    if (rollback) settings = { ...rollback }
    minCharsDraft = String(settings.minChars)
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
 * Apply minChars + metric + folder from panel values / drafts; persist with rollback.
 * @param {Record<string, unknown>} [values]
 * @param {{ silent?: boolean }} [opts]
 * @returns {Promise<boolean>}
 */
async function applySettingsFromValues(values, opts = {}) {
  const rawMinChars = values && values.minChars != null ? values.minChars : minCharsDraft
  const rawMetric = values && values.metric != null ? values.metric : metricDraft
  const rawFolder = values && values.folder != null ? values.folder : folderDraft

  const minChars = clampMinChars(rawMinChars)
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
  settings.minChars = minChars
  settings.metric = metric
  settings.folder = folderNorm
  minCharsDraft = String(minChars)
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
        `Einstellungen übernommen (≥ ${settings.minChars} Z., ${metricLabel(settings.metric)}${settings.folder ? `, Ordner: ${settings.folder}` : ''}).`,
        `Settings applied (≥ ${settings.minChars} chars, ${metricLabel(settings.metric)}${settings.folder ? `, folder: ${settings.folder}` : ''}).`,
      ),
      'success',
    )
  }
  return true
}

/**
 * Scan Markdown notes for long bodies (SCAN GATE — never from onActivate).
 * Gate keep: chars >= minChars always; then sort by selected metric DESC.
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
    const minChars = settings.minChars
    const metric = settings.metric

    const mdNotes = notes
      .filter((n) => MD_EXT_RE.test(n.path))
      .filter((n) => inFolder(n.path, folder))
      .sort((a, b) => {
        const aMis = a.modifiedAt == null || a.modifiedAt === ''
        const bMis = b.modifiedAt == null || b.modifiedAt === ''
        if (aMis && !bMis) return 1
        if (!aMis && bMis) return -1
        if (aMis && bMis) return String(a.path).localeCompare(String(b.path))
        // modifiedAt DESC
        const byDate = String(b.modifiedAt).localeCompare(String(a.modifiedAt))
        if (byDate !== 0) return byDate
        return String(a.path).localeCompare(String(b.path))
      })
      .slice(0, settings.maxNotes)

    /** @type {LongItem[]} */
    const hits = []
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

      const chars = countChars(text)
      // Soft: character threshold always (even when metric is words)
      if (chars < minChars) continue

      const words = countWords(text)
      const value = metric === 'words' ? words : chars
      hits.push({
        path: note.path,
        title: note.title || basenameNoExt(note.path),
        chars,
        words,
        value,
      })
    }

    // Metric DESC, then path tiebreak
    hits.sort((a, b) => {
      if (b.value !== a.value) return b.value - a.value
      return a.path.localeCompare(b.path)
    })

    const items = hits.slice(0, settings.topN)
    view = {
      scanned,
      hitCount: hits.length,
      items,
      metric,
      builtAt: Date.now(),
    }
    scannedOnce = true

    if (!opts.silent) {
      await fanotes.ui.toast(
        t(
          `Scan: ${hits.length} lang (≥ ${minChars} Z., ${scanned} geprüft, Top ${items.length}).`,
          `Scan: ${hits.length} long (≥ ${minChars} chars, ${scanned} checked, top ${items.length}).`,
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
  const thresholdLabel = t(`≥ ${settings.minChars} Zeichen`, `≥ ${settings.minChars} chars`)
  const countLabel = view
    ? String(view.hitCount)
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
  const topLabel = view
    ? String(view.items.length)
    : scanning
      ? '…'
      : scannedOnce
        ? '0'
        : '–'

  const listItems = view
    ? view.items.map((item) => ({
        id: item.path,
        title: item.title,
        detail: formatDetail(item),
      }))
    : []

  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Lange Notizen', 'Long Notes'), level: 2 },
    {
      type: 'keyvalue',
      items: [
        { key: t('Schwelle', 'Threshold'), value: thresholdLabel },
        { key: t('Treffer', 'Hits'), value: countLabel },
        { key: t('gescannt', 'scanned'), value: scannedLabel },
        { key: t('Top', 'Top'), value: topLabel },
      ],
    },
    {
      type: 'input',
      id: 'minChars',
      label: t('Min. Zeichen (100–1000000)', 'Min chars (100–1000000)'),
      value: minCharsDraft,
      placeholder: String(DEFAULT_MIN_CHARS),
    },
    {
      type: 'select',
      id: 'metric',
      label: t('Sortier-Metrik', 'Sort metric'),
      value: metricDraft,
      options: [
        { value: 'chars', label: metricLabel('chars') },
        { value: 'words', label: metricLabel('words') },
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
      id: 'long',
      empty: scannedOnce
        ? t('Keine langen Notizen unter dieser Schwelle.', 'No long notes under this threshold.')
        : t('Noch nicht gescannt – „Aktualisieren“ tippen.', 'Not scanned yet – tap “Refresh”.'),
      items: listItems,
    },
    { type: 'divider' },
    {
      type: 'text',
      muted: true,
      text: t(
        `Zum Teilen: Addon „Notiz teilen / Note Splitter“. Cap maxNotes=${settings.maxNotes} · topN=${settings.topN} · Gate immer Zeichen ≥ minChars · Sort Metrik DESC · Nur .md/.markdown · Abgrenzung: empty-notes = kurz; word-counter = aktive Zählung; note-splitter = teilt; hot-notes = Öffnungen.`,
        `To split: add-on “Note Splitter”. Cap maxNotes=${settings.maxNotes} · topN=${settings.topN} · gate always chars ≥ minChars · sort metric DESC · .md/.markdown only · vs empty-notes = short; word-counter = live count; note-splitter = splits; hot-notes = opens.`,
      ),
    },
  ]

  return blocks
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Lange Notizen', 'Long Notes'))
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
        `${view.hitCount} lange Notiz(en) (≥ ${settings.minChars} Z.).`,
        `${view.hitCount} long note(s) (≥ ${settings.minChars} chars).`,
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

    minCharsDraft = String(settings.minChars)
    folderDraft = settings.folder
    metricDraft = settings.metric

    panel = fanotes.ui.panel({
      id: PANEL_ID,
      title: t('Lange Notizen', 'Long Notes'),
      icon: '📜',
      blocks: renderBlocks(),
      focus: true,
    })

    panel.onAction(async (action) => {
      try {
        if (
          action.id === 'refresh' ||
          action.id === 'submit:minChars' ||
          action.id === 'submit:folder'
        ) {
          const values = action.values || {}
          if (values.minChars != null) minCharsDraft = String(values.minChars)
          if (values.metric != null) metricDraft = normalizeMetric(values.metric)
          if (values.folder != null) folderDraft = String(values.folder)
          const ok = await applySettingsFromValues(values, {
            silent: action.id !== 'refresh',
          })
          if (!ok) return
          await rescan({ silent: action.id !== 'refresh' })
          return
        }
        if (action.id === 'long' && action.itemId) {
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
        if (input.id === 'minChars') {
          minCharsDraft = String(input.value ?? '')
          return
        }
        if (input.id === 'metric') {
          metricDraft = normalizeMetric(input.value)
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
 * Command: open the longest note for the current metric.
 */
async function openLongest() {
  try {
    await rescan({ silent: true })

    if (!view || !view.items.length) {
      await fanotes.ui.toast(
        t('Keine langen Notizen gefunden.', 'No long notes found.'),
        'info',
      )
      return
    }

    const first = view.items[0]
    try {
      await fanotes.notes.open(first.path)
      await fanotes.ui.toast(
        t(
          `Geöffnet: ${first.title} (${first.chars} Z. / ${first.words} W.)`,
          `Opened: ${first.title} (${first.chars} chars / ${first.words} words)`,
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
  title: t('Lange Notizen öffnen', 'Open Long Notes'),
  detail: t(
    'Panel mit sehr langen Markdown-Notizen (Teil-Kandidaten)',
    'Panel of very long Markdown notes (split candidates)',
  ),
  keywords: 'long lang size chars words bulky split-candidate öffnen open',
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
  title: t('Lang-Scan aktualisieren', 'Refresh long scan'),
  detail: t(
    'Markdown-Notizen erneut lesen und nach Länge ranken',
    'Re-read Markdown notes and rank by length',
  ),
  keywords: 'long lang rescan aktualisieren refresh scan chars words bulky',
  run: async () => {
    try {
      await rescan({ silent: false })
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'open-longest',
  title: t('Längste Notiz öffnen', 'Open longest note'),
  detail: t(
    'Längste Notiz der aktuellen Metrik öffnen',
    'Open the longest note for the current metric',
  ),
  keywords: 'long lang longest längste öffnen open chars words bulky',
  run: async () => {
    try {
      await openLongest()
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
      'long-notes activated',
      fanotes.app.appVersion,
      settings.minChars,
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
  panel = null
  view = null
})
