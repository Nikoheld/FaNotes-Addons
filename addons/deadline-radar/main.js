/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Frist-Radar / Deadline Radar – scan Markdown notes for DE/ISO calendar
// dates, classify by urgency, panel + optional status + “next deadline”.

const SETTINGS_KEY = 'settings'
const PANEL_ID = 'radar'
const STATUS_ID = 'radar'
const DEFAULT_LOOKAHEAD = 60
const DEFAULT_MAX_NOTES = 400
const EXCERPT_MAX = 80
const NEARBY = 40

const DE_DATE_RE = /\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g
const ISO_DATE_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/g
const HINT_RE = /\b(fällig|abgabe|frist|deadline|due|until|bis)\b/iu

/**
 * @typedef {{
 *   lookaheadDays: number,
 *   ignoreFolders: string[],
 *   maxNotes: number,
 *   showStatus: boolean,
 * }} Settings
 */

/**
 * @typedef {{
 *   path: string,
 *   noteTitle: string,
 *   iso: string,
 *   dateMs: number,
 *   confidence: 'high' | 'medium',
 *   excerpt: string,
 *   raw: string,
 * }} Hit
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  lookaheadDays: DEFAULT_LOOKAHEAD,
  ignoreFolders: [],
  maxNotes: DEFAULT_MAX_NOTES,
  showStatus: true,
}

/** @type {Settings} */
let settings = { ...DEFAULT_SETTINGS, ignoreFolders: [] }

/** @type {FaNotes.Panel | null} */
let panel = null

/** @type {Hit[]} */
let hits = []

let lastScanAt = 0
let scanning = false
let scanQueued = false

/** @type {ReturnType<typeof setTimeout> | 0} */
let debounceTimer = 0

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

function pad2(n) {
  return String(n).padStart(2, '0')
}

/** Local calendar midnight as Date. */
function startOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function formatIsoLocal(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/**
 * Build a local Date from Y-M-D parts; return null if invalid.
 * @param {number} y
 * @param {number} m 1-12
 * @param {number} d
 * @returns {Date | null}
 */
function makeValidDate(y, m, d) {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null
  if (y < 1970 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null
  const dt = new Date(y, m - 1, d)
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== m - 1 ||
    dt.getDate() !== d
  ) {
    return null
  }
  return startOfDay(dt)
}

/**
 * Normalize ignore-folder entries: vault-relative, no `..`, no leading `/`.
 * @param {unknown} raw
 * @returns {string[]}
 */
function normalizeIgnoreFolders(raw) {
  /** @type {string[]} */
  const out = []
  const seen = new Set()
  const list = Array.isArray(raw)
    ? raw
    : String(raw ?? '')
        .split(/[,;\n]/u)
        .map((s) => s.trim())
        .filter(Boolean)
  for (const entry of list) {
    let path = String(entry).trim().replace(/\\/g, '/')
    while (path.startsWith('/')) path = path.slice(1)
    while (path.endsWith('/')) path = path.slice(0, -1)
    if (!path) continue
    const parts = path.split('/').filter(Boolean)
    if (!parts.length || parts.some((p) => p === '.' || p === '..')) continue
    const norm = parts.join('/')
    const key = norm.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(norm)
  }
  return out
}

/**
 * @param {string} notePath
 * @param {string[]} folders
 */
function isIgnoredPath(notePath, folders) {
  if (!folders.length) return false
  const path = String(notePath).replace(/\\/g, '/')
  for (const folder of folders) {
    const f = folder.replace(/\\/g, '/')
    if (path === f || path.startsWith(`${f}/`)) return true
  }
  return false
}

/**
 * Mask ``` fenced regions (line-state toggle) with spaces so offsets stay stable.
 * @param {string} text
 */
function maskCodeFences(text) {
  const lines = text.split('\n')
  let inFence = false
  /** @type {string[]} */
  const out = []
  for (const line of lines) {
    const trimmed = line.trimStart()
    if (trimmed.startsWith('```')) {
      inFence = !inFence
      out.push(' '.repeat(line.length))
      continue
    }
    if (inFence) {
      out.push(' '.repeat(line.length))
    } else {
      out.push(line)
    }
  }
  return out.join('\n')
}

/**
 * Excerpt around [start, end) clipped to EXCERPT_MAX, single-line-ish.
 * @param {string} text
 * @param {number} start
 * @param {number} end
 */
function makeExcerpt(text, start, end) {
  const lo = Math.max(0, start - 24)
  const hi = Math.min(text.length, end + 40)
  let slice = text.slice(lo, hi).replace(/\s+/gu, ' ').trim()
  if (lo > 0) slice = `…${slice}`
  if (hi < text.length) slice = `${slice}…`
  if (slice.length > EXCERPT_MAX) {
    slice = `${slice.slice(0, EXCERPT_MAX - 1)}…`
  }
  return slice || text.slice(start, end)
}

/**
 * Confidence: high if a hint word appears within ±NEARBY chars of the match.
 * @param {string} text
 * @param {number} start
 * @param {number} end
 * @returns {'high' | 'medium'}
 */
function confidenceNear(text, start, end) {
  const from = Math.max(0, start - NEARBY)
  const to = Math.min(text.length, end + NEARBY)
  const window = text.slice(from, to)
  HINT_RE.lastIndex = 0
  return HINT_RE.test(window) ? 'high' : 'medium'
}

/**
 * Parse DE + ISO calendar dates from markdown (code fences ignored).
 * @param {string} text
 * @param {string} path
 * @param {string} noteTitle
 * @returns {Hit[]}
 */
function parseHits(text, path, noteTitle) {
  const masked = maskCodeFences(text)
  /** @type {Hit[]} */
  const found = []
  const seen = new Set()

  /**
   * @param {RegExp} re
   * @param {(m: RegExpExecArray) => Date | null} toDate
   */
  function collect(re, toDate) {
    re.lastIndex = 0
    let match
    while ((match = re.exec(masked)) !== null) {
      const dt = toDate(match)
      if (!dt) continue
      const start = match.index
      const end = start + match[0].length
      // Skip if the original was fenced (masked to spaces) – match would not find digits there.
      const iso = formatIsoLocal(dt)
      const key = `${iso}@${start}`
      if (seen.has(key)) continue
      seen.add(key)
      found.push({
        path,
        noteTitle,
        iso,
        dateMs: dt.getTime(),
        confidence: confidenceNear(masked, start, end),
        excerpt: makeExcerpt(text, start, end),
        raw: match[0],
      })
    }
  }

  collect(DE_DATE_RE, (m) => {
    const d = Number(m[1])
    const mo = Number(m[2])
    const y = Number(m[3])
    return makeValidDate(y, mo, d)
  })

  collect(ISO_DATE_RE, (m) => {
    const y = Number(m[1])
    const mo = Number(m[2])
    const d = Number(m[3])
    return makeValidDate(y, mo, d)
  })

  return found
}

/**
 * End of the current local calendar week (Sunday), as midnight Date.
 * Week treated as Monday–Sunday (common DE school week).
 * @param {Date} todayStart
 */
function endOfWeekSunday(todayStart) {
  // getDay(): 0=Sun … 6=Sat. Days until Sunday:
  const dow = todayStart.getDay()
  const add = dow === 0 ? 0 : 7 - dow
  const end = new Date(todayStart)
  end.setDate(end.getDate() + add)
  return startOfDay(end)
}

/**
 * Filter hits to overdue ∪ [today, today+lookahead], sort by date then confidence.
 * @param {Hit[]} all
 * @param {number} lookaheadDays
 * @returns {Hit[]}
 */
function filterAndSort(all, lookaheadDays) {
  const today = startOfDay()
  const horizon = new Date(today)
  horizon.setDate(horizon.getDate() + Math.max(0, lookaheadDays))
  const horizonMs = startOfDay(horizon).getTime()

  const filtered = all.filter((h) => h.dateMs <= horizonMs)
  // Keep overdue (dateMs < today) and future within lookahead.
  // (horizon already includes today+lookahead; overdue is always dateMs < today <= horizon for lookahead>=0)

  filtered.sort((a, b) => {
    if (a.dateMs !== b.dateMs) return a.dateMs - b.dateMs
    if (a.confidence !== b.confidence) return a.confidence === 'high' ? -1 : 1
    return a.path.localeCompare(b.path)
  })
  return filtered
}

/**
 * Bucket for panel sections.
 * @param {Hit} hit
 * @returns {'overdue' | 'today' | 'week' | 'later'}
 */
function bucketOf(hit) {
  const today = startOfDay()
  const todayMs = today.getTime()
  if (hit.dateMs < todayMs) return 'overdue'
  if (hit.dateMs === todayMs) return 'today'
  const weekEnd = endOfWeekSunday(today).getTime()
  if (hit.dateMs <= weekEnd) return 'week'
  return 'later'
}

/**
 * Relative badge (≤24 chars per UI blocks docs).
 * @param {Hit} hit
 */
function relativeBadge(hit) {
  const today = startOfDay()
  const todayMs = today.getTime()
  const days = Math.round((hit.dateMs - todayMs) / 86400000)
  if (days < 0) {
    const n = Math.abs(days)
    return t(`${n} T. überf.`, `${n}d overdue`).slice(0, 24)
  }
  if (days === 0) return t('heute', 'today')
  if (days === 1) return t('morgen', 'tomorrow')
  return t(`in ${days} T.`, `in ${days}d`).slice(0, 24)
}

/**
 * Short status label for the soonest hit.
 * @param {Hit} hit
 */
function statusLabel(hit) {
  const badge = relativeBadge(hit)
  const title = (hit.noteTitle || hit.path).slice(0, 28)
  let text = `${badge}: ${title}`
  if (text.length > 60) text = `${text.slice(0, 59)}…`
  return text
}

async function loadSettings() {
  try {
    const stored = await fanotes.storage.get(SETTINGS_KEY)
    if (stored && typeof stored === 'object') {
      const obj = /** @type {Record<string, unknown>} */ (stored)
      let lookaheadDays = Number(obj.lookaheadDays)
      if (!Number.isFinite(lookaheadDays) || lookaheadDays < 0) lookaheadDays = DEFAULT_LOOKAHEAD
      lookaheadDays = Math.min(3650, Math.floor(lookaheadDays))

      let maxNotes = Number(obj.maxNotes)
      if (!Number.isFinite(maxNotes) || maxNotes < 1) maxNotes = DEFAULT_MAX_NOTES
      maxNotes = Math.min(2000, Math.floor(maxNotes))

      settings = {
        lookaheadDays,
        ignoreFolders: normalizeIgnoreFolders(obj.ignoreFolders),
        maxNotes,
        showStatus: obj.showStatus !== false,
      }
    } else {
      settings = { ...DEFAULT_SETTINGS, ignoreFolders: [] }
    }
  } catch (error) {
    fanotes.log('loadSettings failed', errMessage(error))
    settings = { ...DEFAULT_SETTINGS, ignoreFolders: [] }
  }
}

async function saveSettings() {
  try {
    await fanotes.storage.set(SETTINGS_KEY, settings)
  } catch (error) {
    fanotes.log('saveSettings failed', errMessage(error))
  }
}

/**
 * Full vault scan (md/markdown only, capped, ignoreFolders applied).
 * @param {{ silent?: boolean }} [opts]
 */
async function rescan(opts = {}) {
  if (scanning) {
    scanQueued = true
    return
  }
  scanning = true
  try {
    await refreshPanel()

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

    const mdNotes = notes
      .filter((n) => /\.(md|markdown)$/iu.test(n.path))
      .filter((n) => !isIgnoredPath(n.path, settings.ignoreFolders))
      .sort((a, b) => String(b.modifiedAt ?? '').localeCompare(String(a.modifiedAt ?? '')))
      .slice(0, settings.maxNotes)

    /** @type {Hit[]} */
    const all = []
    for (const note of mdNotes) {
      let text = ''
      try {
        text = await fanotes.notes.read(note.path)
      } catch (error) {
        fanotes.log('read failed', note.path, errMessage(error))
        continue
      }
      const title = note.title || note.path.split('/').pop() || note.path
      all.push(...parseHits(text, note.path, title))
    }

    hits = filterAndSort(all, settings.lookaheadDays)
    lastScanAt = Date.now()

    if (!opts.silent) {
      await fanotes.ui.toast(
        t(
          `Scan fertig: ${hits.length} Frist(en) in ${mdNotes.length} Notizen.`,
          `Scan done: ${hits.length} deadline(s) in ${mdNotes.length} notes.`,
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
    await updateStatus()
    await refreshPanel()
    if (scanQueued) {
      scanQueued = false
      void rescan({ silent: true })
    }
  }
}

function scheduleRescan() {
  // Do not burn Worker time when nothing visible needs the index.
  if (!settings.showStatus && !panel) return
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = 0
    if (!settings.showStatus && !panel) return
    void rescan({ silent: true })
  }, 1500)
}

/** Soonest hit (already sorted). */
function nextHit() {
  return hits.length ? hits[0] : null
}

async function toastNext() {
  try {
    if (!lastScanAt) {
      await rescan({ silent: true })
    }
    const hit = nextHit()
    if (!hit) {
      await fanotes.ui.toast(
        t('Keine Frist im Radar.', 'No deadline in the radar.'),
        'info',
      )
      return
    }
    await fanotes.ui.toast(
      t(
        `Nächste Frist: ${hit.iso} (${relativeBadge(hit)}) – ${hit.noteTitle}`,
        `Next deadline: ${hit.iso} (${relativeBadge(hit)}) – ${hit.noteTitle}`,
      ),
      hit.dateMs < startOfDay().getTime() ? 'error' : 'info',
    )
  } catch (error) {
    await fanotes.ui.toast(
      t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`),
      'error',
    )
  }
}

async function updateStatus() {
  try {
    if (!settings.showStatus) {
      await fanotes.ui.status.remove(STATUS_ID)
      return
    }
    const hit = nextHit()
    if (!hit) {
      await fanotes.ui.status.remove(STATUS_ID)
      return
    }
    await fanotes.ui.status.set({
      id: STATUS_ID,
      text: statusLabel(hit),
      title: t(
        `Nächste Frist ${hit.iso} – Klick öffnet das Panel`,
        `Next deadline ${hit.iso} – click opens the panel`,
      ),
      onClick: () => {
        openPanel()
      },
    })
  } catch (error) {
    fanotes.log('updateStatus failed', errMessage(error))
  }
}

/**
 * @param {Hit[]} list
 */
function listItems(list) {
  return list.slice(0, 200).map((hit, index) => ({
    id: `${hit.path}::${hit.iso}::${index}`,
    title: hit.excerpt.slice(0, EXCERPT_MAX),
    detail: `${hit.noteTitle} · ${hit.iso}${hit.confidence === 'high' ? t(' · hoch', ' · high') : t(' · mittel', ' · medium')}`,
    badge: relativeBadge(hit),
  }))
}

function formatUpdatedAt(ts) {
  if (!ts) return t('nie', 'never')
  try {
    const locale = fanotes.app.language === 'en' ? 'en-US' : 'de-DE'
    return new Date(ts).toLocaleString(locale)
  } catch {
    return new Date(ts).toISOString()
  }
}

function renderBlocks() {
  const overdue = hits.filter((h) => bucketOf(h) === 'overdue')
  const today = hits.filter((h) => bucketOf(h) === 'today')
  const week = hits.filter((h) => bucketOf(h) === 'week')
  const later = hits.filter((h) => bucketOf(h) === 'later')

  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Frist-Radar', 'Deadline Radar'), level: 2 },
    {
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'rescan',
          label: scanning
            ? t('Scan …', 'Scanning …')
            : t('Neu einlesen', 'Rescan'),
          primary: true,
          disabled: scanning,
        },
      ],
    },
    {
      type: 'keyvalue',
      items: [
        { key: t('Treffer', 'Hits'), value: String(hits.length) },
        {
          key: t('Horizont', 'Horizon'),
          value: t(`${settings.lookaheadDays} Tage`, `${settings.lookaheadDays} days`),
        },
        { key: t('Zuletzt', 'Updated'), value: formatUpdatedAt(lastScanAt) },
      ],
    },
    { type: 'divider' },
    { type: 'heading', text: t('Überfällig', 'Overdue'), level: 3 },
    {
      type: 'list',
      id: 'overdue',
      empty: t('Keine überfälligen Fristen.', 'No overdue deadlines.'),
      items: listItems(overdue),
    },
    { type: 'heading', text: t('Heute', 'Today'), level: 3 },
    {
      type: 'list',
      id: 'today',
      empty: t('Nichts für heute.', 'Nothing for today.'),
      items: listItems(today),
    },
    { type: 'heading', text: t('Diese Woche', 'This week'), level: 3 },
    {
      type: 'list',
      id: 'week',
      empty: t('Nichts mehr diese Woche.', 'Nothing else this week.'),
      items: listItems(week),
    },
    { type: 'heading', text: t('Später', 'Later'), level: 3 },
    {
      type: 'list',
      id: 'later',
      empty: t('Nichts im Horizont.', 'Nothing in the horizon.'),
      items: listItems(later),
    },
    { type: 'divider' },
    {
      type: 'input',
      id: 'lookaheadDays',
      label: t('Vorausschau (Tage)', 'Lookahead (days)'),
      value: String(settings.lookaheadDays),
      placeholder: String(DEFAULT_LOOKAHEAD),
    },
    {
      type: 'input',
      id: 'maxNotes',
      label: t('Max. Notizen im Scan', 'Max notes to scan'),
      value: String(settings.maxNotes),
      placeholder: String(DEFAULT_MAX_NOTES),
    },
    {
      type: 'input',
      id: 'ignoreFolders',
      label: t(
        'Ordner ignorieren (Komma-getrennt)',
        'Ignore folders (comma-separated)',
      ),
      value: settings.ignoreFolders.join(', '),
      placeholder: t('z. B. Archiv, Templates', 'e.g. Archive, Templates'),
    },
    {
      type: 'checkbox',
      id: 'showStatus',
      label: t(
        'Nächste Frist in der Statusleiste',
        'Show next deadline in the status bar',
      ),
      checked: settings.showStatus,
    },
    {
      type: 'callout',
      tone: 'info',
      text: t(
        'Parser v1: DE (TT.MM.JJJJ) und ISO (YYYY-MM-DD). Hinweiswörter ±40 Zeichen → hohe Sicherheit. Daten in ```-Blöcken werden ignoriert. Keine relativen Wochentage („nächsten Montag“) in v1.',
        'Parser v1: DE (DD.MM.YYYY) and ISO (YYYY-MM-DD). Hint words ±40 chars → high confidence. Dates inside ``` fences are ignored. No relative weekdays (“next Monday”) in v1.',
      ),
    },
  ]

  return blocks
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Frist-Radar', 'Deadline Radar'))
  } catch (error) {
    if (isNoPanel(error)) {
      panel = null
      return
    }
    fanotes.log('refreshPanel', errMessage(error))
  }
}

/**
 * Apply lookahead / maxNotes / ignoreFolders from panel values.
 * @param {Record<string, unknown>} values
 */
async function applySettingsFromValues(values) {
  if (values.lookaheadDays != null) {
    let n = Number(String(values.lookaheadDays).trim())
    if (!Number.isFinite(n) || n < 0) n = DEFAULT_LOOKAHEAD
    settings.lookaheadDays = Math.min(3650, Math.floor(n))
  }
  if (values.maxNotes != null) {
    let n = Number(String(values.maxNotes).trim())
    if (!Number.isFinite(n) || n < 1) n = DEFAULT_MAX_NOTES
    settings.maxNotes = Math.min(2000, Math.floor(n))
  }
  if (values.ignoreFolders != null) {
    settings.ignoreFolders = normalizeIgnoreFolders(String(values.ignoreFolders))
  }
  if (values.showStatus != null) {
    settings.showStatus = values.showStatus !== false && values.showStatus !== 'false'
  }
  await saveSettings()
}

/**
 * @param {string} itemId
 */
async function openFromListItem(itemId) {
  const path = String(itemId).split('::')[0]
  if (!path) return
  try {
    await fanotes.notes.open(path)
  } catch (error) {
    await fanotes.ui.toast(
      t(`Öffnen fehlgeschlagen: ${errMessage(error)}`, `Open failed: ${errMessage(error)}`),
      'error',
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
      void (async () => {
        await refreshPanel()
        if (!lastScanAt) await rescan({ silent: true })
      })()
      return
    }

    panel = fanotes.ui.panel({
      id: PANEL_ID,
      title: t('Frist-Radar', 'Deadline Radar'),
      icon: '📡',
      blocks: renderBlocks(),
      focus: true,
    })

    panel.onAction(async (action) => {
      try {
        if (
          action.id === 'rescan' ||
          action.id === 'submit:lookaheadDays' ||
          action.id === 'submit:maxNotes' ||
          action.id === 'submit:ignoreFolders'
        ) {
          const values = action.values || {}
          await applySettingsFromValues(values)
          // Re-filter in memory when only lookahead changed without full read;
          // full rescan when button pressed or maxNotes/ignoreFolders may change set.
          if (action.id === 'rescan') {
            await rescan({ silent: false })
          } else if (
            action.id === 'submit:maxNotes' ||
            action.id === 'submit:ignoreFolders'
          ) {
            await rescan({ silent: true })
          } else {
            // lookaheadDays only – re-filter requires re-parse window; easiest: silent rescan
            await rescan({ silent: true })
          }
          return
        }
        if (
          (action.id === 'overdue' ||
            action.id === 'today' ||
            action.id === 'week' ||
            action.id === 'later') &&
          action.itemId
        ) {
          await openFromListItem(String(action.itemId))
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
        if (input.id === 'showStatus') {
          settings.showStatus = input.value === true
          await saveSettings()
          await updateStatus()
          await refreshPanel()
        }
      } catch (error) {
        fanotes.log('onInput', errMessage(error))
      }
    })

    void (async () => {
      try {
        await refreshPanel()
        if (!lastScanAt) await rescan({ silent: true })
      } catch (error) {
        fanotes.log('openPanel init', errMessage(error))
      }
    })()
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
  title: t('Frist-Radar öffnen', 'Open Deadline Radar'),
  detail: t(
    'Panel mit Überfällig, Heute, Diese Woche und Später',
    'Panel with Overdue, Today, This week and Later',
  ),
  keywords: 'frist deadline radar fällig due abgabe überfällig overdue datum date schule school',
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
  title: t('Fristen neu einlesen', 'Rescan deadlines'),
  detail: t(
    'Markdown-Notizen erneut auf DE-/ISO-Daten prüfen',
    'Re-check Markdown notes for DE/ISO dates',
  ),
  keywords: 'frist deadline rescan neu einlesen scan radar datum date',
  run: async () => {
    try {
      await rescan({ silent: false })
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'next',
  title: t('Nächste Frist anzeigen', 'Show next deadline'),
  detail: t(
    'Toast mit der frühesten Frist im Radar (oder keine)',
    'Toast with the earliest deadline in the radar (or none)',
  ),
  keywords: 'frist deadline next nächste fällig due toast radar',
  run: async () => {
    try {
      await toastNext()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.onActivate(async () => {
  try {
    await loadSettings()
    fanotes.log(
      'deadline-radar activated',
      fanotes.app.appVersion,
      settings.lookaheadDays,
      settings.maxNotes,
    )

    if (fanotes.hasPermission('notes:read')) {
      fanotes.events.on('note:saved', () => {
        scheduleRescan()
      })
      fanotes.events.on('note:created', () => {
        scheduleRescan()
      })
      fanotes.events.on('note:deleted', () => {
        scheduleRescan()
      })
    }

    fanotes.events.on('vault:changed', () => {
      scheduleRescan()
    })

    // Warm status bar only when it is shown (≤15s rule; non-blocking).
    if (settings.showStatus) void rescan({ silent: true })
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(async () => {
  clearTimeout(debounceTimer)
  debounceTimer = 0
  scanning = false
  scanQueued = false
  try {
    await fanotes.ui.status.remove(STATUS_ID)
  } catch {
    // Host tears down UI; ignore.
  }
  panel = null
  hits = []
})
