/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Unverlinkte Erwähnungen / Unlinked Mentions – plain-text mentions of other
// note titles without [[wikilinks]]; optional link after confirm.
// Abgrenzung: wikilink-map = existing [[links]]; orphan-notes = no links;
// related-by-tags = #tags. Scan-gate: notes.list/read never onActivate.
// notes:write ONLY after confirm Link.

const SETTINGS_KEY = 'settings'
const PANEL_ID = 'mentions'
const STATUS_ID = 'mentions'
const DEFAULT_MAX_NOTES = 300
const DEFAULT_MIN_TITLE_LEN = 3
const LIST_CAP = 80
const SAMPLE_RADIUS = 28
const MD_EXT_RE = /\.(md|markdown)$/iu
const WIKILINK_RE = /\[\[[\s\S]*?\]\]/gu

/**
 * @typedef {'active' | 'vault'} Scope
 */

/**
 * @typedef {{
 *   scope: Scope,
 *   maxNotes: number,
 *   minTitleLen: number,
 *   showStatus: boolean,
 * }} Settings
 */

/**
 * @typedef {{
 *   path: string,
 *   title: string,
 * }} TitleEntry
 */

/**
 * @typedef {{
 *   path: string,
 *   title: string,
 *   count: number,
 *   sample: string,
 *   ambiguous: boolean,
 * }} Hit
 */

/**
 * @typedef {{
 *   scope: Scope,
 *   scanned: number,
 *   titleCount: number,
 *   ambiguousTitles: number,
 *   hits: Hit[],
 *   builtAt: number,
 * }} View
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  scope: 'active',
  maxNotes: DEFAULT_MAX_NOTES,
  minTitleLen: DEFAULT_MIN_TITLE_LEN,
  showStatus: false,
}

/** @type {Settings} */
let settings = { ...DEFAULT_SETTINGS }

/** @type {FaNotes.Panel | null} */
let panel = null

/** @type {View | null} */
let view = null

/** Selected hit list id (path + \\0 + title). */
let selectedHitKey = ''

/** True after at least one successful scan this session. */
let scannedOnce = false

let scanning = false
let scanQueued = false

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
 * Basename without `.md` / `.markdown`.
 * @param {string} path
 */
function basenameNoExt(path) {
  const base = String(path).split('/').pop() || String(path)
  return base.replace(/\.(md|markdown)$/iu, '')
}

/**
 * Normalize title key: trim, lowercase, collapse whitespace.
 * @param {unknown} raw
 */
function normTitle(raw) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/**
 * @param {unknown} raw
 * @returns {Scope}
 */
function normalizeScope(raw) {
  return raw === 'vault' ? 'vault' : 'active'
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
 * Clamp minTitleLen to integer 2–50.
 * @param {unknown} raw
 */
function clampMinTitleLen(raw) {
  let n = Number(raw)
  if (!Number.isFinite(n)) n = DEFAULT_MIN_TITLE_LEN
  n = Math.floor(n)
  if (n < 2) n = 2
  if (n > 50) n = 50
  return n
}

/**
 * @param {unknown} raw
 * @returns {Settings}
 */
function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const obj = /** @type {Record<string, unknown>} */ (raw)
  return {
    scope: normalizeScope(obj.scope),
    maxNotes: clampMaxNotes(obj.maxNotes),
    minTitleLen: clampMinTitleLen(obj.minTitleLen),
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
}

/**
 * Persist settings; on failure restore `rollback` when provided.
 * @param {Settings} [rollback]
 * @returns {Promise<boolean>}
 */
async function saveSettings(rollback) {
  try {
    await fanotes.storage.set(SETTINGS_KEY, {
      scope: settings.scope,
      maxNotes: settings.maxNotes,
      minTitleLen: settings.minTitleLen,
      showStatus: settings.showStatus,
    })
    return true
  } catch (error) {
    if (rollback) settings = { ...rollback }
    await fanotes.ui.toast(
      t(`Speichern fehlgeschlagen: ${errMessage(error)}`, `Save failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
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
 * Escape a string for use inside a RegExp.
 * @param {string} s
 */
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Build a boolean mask: true = searchable prose (not fenced, not inside [[...]]).
 * Fenced lines (``` / ~~~) and existing wikilinks are excluded.
 * @param {string} text
 * @returns {boolean[]}
 */
function buildEligibleMask(text) {
  const normalised = String(text ?? '').replace(/\r\n|\r/g, '\n')
  const n = normalised.length
  /** @type {boolean[]} */
  const eligible = new Array(n).fill(true)

  // Mark fenced code lines (and fence markers) ineligible.
  let inFence = false
  let lineStart = 0
  for (let i = 0; i <= n; i += 1) {
    if (i === n || normalised[i] === '\n') {
      const line = normalised.slice(lineStart, i)
      const trimmed = line.trimStart()
      const isFence = trimmed.startsWith('```') || trimmed.startsWith('~~~')
      if (isFence) {
        for (let j = lineStart; j < i; j += 1) eligible[j] = false
        inFence = !inFence
      } else if (inFence) {
        for (let j = lineStart; j < i; j += 1) eligible[j] = false
      }
      if (i < n) eligible[i] = false // newline stays "free" but we mark it false for safety
      lineStart = i + 1
    }
  }

  // Mark existing [[wikilinks]] ineligible (scan original; only mark where still eligible-ish).
  WIKILINK_RE.lastIndex = 0
  let m
  while ((m = WIKILINK_RE.exec(normalised)) !== null) {
    const start = m.index
    const end = start + m[0].length
    for (let j = start; j < end; j += 1) eligible[j] = false
  }

  return eligible
}

/**
 * Whole-word case-insensitive matches of `title` in eligible ranges.
 * Prefer calling with longer titles first; mark matches used so shorter titles
 * do not overlap.
 * @param {string} text
 * @param {boolean[]} eligible
 * @param {string} title
 * @returns {Array<{ start: number, end: number, matched: string }>}
 */
function findTitleMatches(text, eligible, title) {
  const needle = String(title ?? '')
  if (!needle) return []
  const re = new RegExp(
    `(?<![\\p{L}\\p{N}_])${escapeRegExp(needle)}(?![\\p{L}\\p{N}_])`,
    'giu',
  )
  /** @type {Array<{ start: number, end: number, matched: string }>} */
  const out = []
  let match
  re.lastIndex = 0
  while ((match = re.exec(text)) !== null) {
    const start = match.index
    const matched = match[0]
    const end = start + matched.length
    let ok = true
    for (let j = start; j < end; j += 1) {
      if (!eligible[j]) {
        ok = false
        break
      }
    }
    if (!ok) continue
    out.push({ start, end, matched })
    // Mark used so overlapping shorter titles are skipped.
    for (let j = start; j < end; j += 1) eligible[j] = false
  }
  return out
}

/**
 * Sample excerpt around the first match.
 * @param {string} text
 * @param {number} start
 * @param {number} end
 */
function makeSample(text, start, end) {
  const from = Math.max(0, start - SAMPLE_RADIUS)
  const to = Math.min(text.length, end + SAMPLE_RADIUS)
  let sample = text.slice(from, to).replace(/\s+/g, ' ').trim()
  if (from > 0) sample = `…${sample}`
  if (to < text.length) sample = `${sample}…`
  if (sample.length > 120) sample = `${sample.slice(0, 117)}…`
  return sample
}

/**
 * Hit list key.
 * @param {Hit} hit
 */
function hitKey(hit) {
  return `${hit.path}\0${hit.title}`
}

/**
 * Build title index from note list. Ambiguous (duplicate) norm titles are
 * collected but flagged — shown carefully, never auto-linked.
 * @param {FaNotes.NoteSummary[]} notes
 * @returns {{
 *   entries: Array<TitleEntry & { key: string, ambiguous: boolean }>,
 *   ambiguousCount: number,
 * }}
 */
function buildTitleIndex(notes) {
  /** @type {Map<string, TitleEntry[]>} */
  const buckets = new Map()
  for (const note of notes) {
    if (!MD_EXT_RE.test(note.path)) continue
    const title = (note.title && String(note.title).trim()) || basenameNoExt(note.path)
    const key = normTitle(title)
    if (!key) continue
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = []
      buckets.set(key, bucket)
    }
    bucket.push({ path: note.path, title })
  }

  /** @type {Array<TitleEntry & { key: string, ambiguous: boolean }>} */
  const entries = []
  let ambiguousCount = 0
  for (const [key, members] of buckets) {
    const ambiguous = members.length > 1
    if (ambiguous) ambiguousCount += 1
    // Prefer the first member's display title; all share the same key.
    for (const m of members) {
      entries.push({ path: m.path, title: m.title, key, ambiguous })
    }
  }

  // Longer titles first for matching preference.
  entries.sort((a, b) => {
    if (b.title.length !== a.title.length) return b.title.length - a.title.length
    return a.title.localeCompare(b.title)
  })

  return { entries, ambiguousCount }
}

/**
 * Scan one note body for plain mentions of indexed titles.
 * @param {string} notePath
 * @param {string} text
 * @param {Array<TitleEntry & { key: string, ambiguous: boolean }>} entries
 * @param {number} minTitleLen
 * @returns {Hit[]}
 */
function scanNoteText(notePath, text, entries, minTitleLen) {
  const normalised = String(text ?? '').replace(/\r\n|\r/g, '\n')
  const eligible = buildEligibleMask(normalised)
  /** @type {Map<string, Hit>} */
  const byKey = new Map()

  // Norm keys belonging to this note (also covers ambiguous same-title siblings).
  const selfKeys = new Set()
  for (const e of entries) {
    if (e.path === notePath) selfKeys.add(e.key)
  }

  // Unique by norm key for matching (one entry per key; keep first = longest sort already).
  /** @type {Map<string, TitleEntry & { key: string, ambiguous: boolean }>} */
  const unique = new Map()
  for (const e of entries) {
    if (e.path === notePath) continue // never match a note's own title in itself
    if (selfKeys.has(e.key)) continue // skip ambiguous siblings of this note's title
    if (e.title.length < minTitleLen) continue
    if (!unique.has(e.key)) unique.set(e.key, e)
  }

  // Sort unique by title length DESC again.
  const ordered = Array.from(unique.values()).sort((a, b) => {
    if (b.title.length !== a.title.length) return b.title.length - a.title.length
    return a.title.localeCompare(b.title)
  })

  for (const entry of ordered) {
    const matches = findTitleMatches(normalised, eligible, entry.title)
    if (!matches.length) continue
    const first = matches[0]
    byKey.set(entry.key, {
      path: notePath,
      title: entry.title,
      count: matches.length,
      sample: makeSample(normalised, first.start, first.end),
      ambiguous: entry.ambiguous,
    })
  }

  return Array.from(byKey.values())
}

/**
 * Replace up to `maxCount` plain occurrences of `title` with `[[title]]`,
 * skipping fenced code and existing wikilinks. Preserves original casing of
 * the matched span only insofar as we wrap the canonical title.
 * @param {string} text
 * @param {string} title
 * @param {number} maxCount
 * @returns {{ text: string, replaced: number } | null} null if nothing to do
 */
function linkPlainMentions(text, title, maxCount) {
  const normalised = String(text ?? '').replace(/\r\n|\r/g, '\n')
  const needle = String(title ?? '')
  if (!needle || maxCount < 1) return null

  const eligible = buildEligibleMask(normalised)
  const matches = findTitleMatches(normalised, eligible, needle)
  if (!matches.length) return null

  const take = matches.slice(0, maxCount)
  // Replace from the end so indices stay valid.
  take.sort((a, b) => b.start - a.start)
  let out = normalised
  for (const m of take) {
    out = `${out.slice(0, m.start)}[[${needle}]]${out.slice(m.end)}`
  }
  return { text: out, replaced: take.length }
}

/**
 * Stale-safe write: mutate from a baseline, re-read immediately before write,
 * and re-apply the mutator on the fresh text if the note changed.
 * @param {string} path
 * @param {(text: string) => string | null} mutator returns null to abort
 * @returns {Promise<boolean>}
 */
async function writeStaleSafe(path, mutator) {
  let baseline
  try {
    baseline = await fanotes.notes.read(path)
  } catch (error) {
    await fanotes.ui.toast(
      t(`Lesen fehlgeschlagen: ${errMessage(error)}`, `Read failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }

  let planned = mutator(baseline)
  if (planned === null) return false

  let fresh
  try {
    fresh = await fanotes.notes.read(path)
  } catch (error) {
    await fanotes.ui.toast(
      t(`Erneutes Lesen fehlgeschlagen: ${errMessage(error)}`, `Re-read failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }

  if (fresh !== baseline) {
    planned = mutator(fresh)
    if (planned === null) return false
  }

  try {
    await fanotes.notes.write(path, planned)
    return true
  } catch (error) {
    await fanotes.ui.toast(
      t(`Schreiben fehlgeschlagen: ${errMessage(error)}`, `Write failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

/**
 * Status `🔗 N` only when showStatus && scannedOnce (N = hit count).
 */
async function updateStatus() {
  try {
    if (!settings.showStatus || !scannedOnce) {
      await fanotes.ui.status.remove(STATUS_ID)
      return
    }
    const n = view ? view.hits.length : 0
    await fanotes.ui.status.set({
      id: STATUS_ID,
      text: `🔗 ${n}`,
      title: t('Unverlinkte Erwähnungen öffnen', 'Open Unlinked Mentions'),
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

/**
 * Scan active note or vault cap for plain-text title mentions (SCAN GATE).
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

    const mdNotes = notes.filter((n) => MD_EXT_RE.test(n.path))
    const { entries, ambiguousCount } = buildTitleIndex(mdNotes)

    /** @type {Hit[]} */
    let hits = []
    let scanned = 0

    if (settings.scope === 'active') {
      let active = null
      try {
        active = await fanotes.notes.active()
      } catch (error) {
        await fanotes.ui.toast(
          t(`Aktive Notiz fehlgeschlagen: ${errMessage(error)}`, `Active note failed: ${errMessage(error)}`),
          'error',
        )
        return
      }
      if (!active || !MD_EXT_RE.test(active.path)) {
        view = {
          scope: settings.scope,
          scanned: 0,
          titleCount: entries.length,
          ambiguousTitles: ambiguousCount,
          hits: [],
          builtAt: Date.now(),
        }
        scannedOnce = true
        if (!opts.silent) {
          await fanotes.ui.toast(
            t('Keine aktive Markdown-Notiz.', 'No active Markdown note.'),
            'info',
          )
        }
        return
      }
      let text = ''
      try {
        text = await fanotes.notes.read(active.path)
      } catch (error) {
        await fanotes.ui.toast(
          t(`Lesen fehlgeschlagen: ${errMessage(error)}`, `Read failed: ${errMessage(error)}`),
          'error',
        )
        return
      }
      scanned = 1
      hits = scanNoteText(active.path, text, entries, settings.minTitleLen)
    } else {
      // Vault scope: newest first, then path; slice maxNotes.
      const sorted = mdNotes.slice().sort((a, b) => {
        const byDate = compareModifiedDesc(a.modifiedAt, b.modifiedAt)
        if (byDate !== 0) return byDate
        return a.path.localeCompare(b.path)
      })
      const capped = sorted.slice(0, settings.maxNotes)
      scanned = capped.length
      for (const note of capped) {
        let text = ''
        try {
          text = await fanotes.notes.read(note.path)
        } catch (error) {
          fanotes.log('read failed', note.path, errMessage(error))
          continue
        }
        const noteHits = scanNoteText(note.path, text, entries, settings.minTitleLen)
        for (const h of noteHits) hits.push(h)
      }
    }

    // Sort hits: count DESC, then title, then path.
    hits.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      const byTitle = a.title.localeCompare(b.title)
      if (byTitle !== 0) return byTitle
      return a.path.localeCompare(b.path)
    })

    const limited = hits.slice(0, LIST_CAP)

    view = {
      scope: settings.scope,
      scanned,
      titleCount: entries.length,
      ambiguousTitles: ambiguousCount,
      hits: limited,
      builtAt: Date.now(),
    }
    scannedOnce = true

    // Keep selection if still present.
    if (selectedHitKey) {
      const still = limited.some((h) => hitKey(h) === selectedHitKey)
      if (!still) selectedHitKey = ''
    }

    if (!opts.silent) {
      await fanotes.ui.toast(
        t(
          `Scan: ${limited.length} Treffer (${scanned} Notiz(en), ${entries.length} Titel).`,
          `Scan: ${limited.length} hit(s) (${scanned} note(s), ${entries.length} title(s)).`,
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
 * Resolve selected hit or first non-ambiguous / any hit for link-one.
 * @returns {Hit | null}
 */
function resolveLinkTarget() {
  if (!view || !view.hits.length) return null
  if (selectedHitKey) {
    const found = view.hits.find((h) => hitKey(h) === selectedHitKey)
    if (found) return found
  }
  return view.hits[0] || null
}

/**
 * Confirm + stale-safe link of plain mentions in the hit's note.
 * @param {Hit} [hit]
 */
async function linkOne(hit) {
  const target = hit || resolveLinkTarget()
  if (!target) {
    await fanotes.ui.toast(
      t('Kein Treffer zum Verlinken.', 'No hit to link.'),
      'info',
    )
    return
  }
  if (target.ambiguous) {
    await fanotes.ui.toast(
      t(
        `Titel „${target.title}“ ist mehrdeutig – Auto-Link übersprungen.`,
        `Title “${target.title}” is ambiguous – auto-link skipped.`,
      ),
      'info',
    )
    return
  }

  const ok = await fanotes.ui.confirm(
    t(
      `${target.count} Klartext-Erwähnung(en) von „${target.title}“ in „${target.path}“ zu [[${target.title}]] verlinken?`,
      `Link ${target.count} plain-text mention(s) of “${target.title}” in “${target.path}” to [[${target.title}]]?`,
    ),
    {
      title: t('Zu Wikilink verlinken', 'Link to wikilink'),
      confirmLabel: t('Verlinken', 'Link'),
    },
  )
  if (!ok) return

  const countWanted = target.count
  const title = target.title
  let replaced = 0

  const written = await writeStaleSafe(target.path, (text) => {
    const result = linkPlainMentions(text, title, countWanted)
    if (!result || result.replaced < 1) return null
    replaced = result.replaced
    return result.text
  })

  if (!written) {
    if (replaced < 1) {
      await fanotes.ui.toast(
        t(
          'Keine Klartext-Erwähnung mehr gefunden (bereits verlinkt oder geändert).',
          'No plain-text mention left (already linked or changed).',
        ),
        'info',
      )
    }
    return
  }

  await fanotes.ui.toast(
    t(
      `${replaced}× zu [[${title}]] verlinkt.`,
      `Linked ${replaced}× to [[${title}]].`,
    ),
    'success',
  )
  await rescan({ silent: true })
}

function renderBlocks() {
  const hitLabel = view
    ? String(view.hits.length)
    : scanning
      ? '…'
      : scannedOnce
        ? '0'
        : '–'

  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Unverlinkte Erwähnungen', 'Unlinked Mentions'), level: 2 },
    {
      type: 'callout',
      tone: 'info',
      text: t(
        'Abgrenzung: wikilink-map = bestehende [[Links]] · orphan-notes = keine Links · related-by-tags = #Tags · hier = Klartext-Titel ohne [[ ]].',
        'Distinction: wikilink-map = existing [[links]] · orphan-notes = no links · related-by-tags = #tags · here = plain-text titles without [[ ]].',
      ),
    },
    {
      type: 'keyvalue',
      items: [
        { key: t('Treffer', 'Hits'), value: hitLabel },
        {
          key: t('Gescannt', 'Scanned'),
          value: view ? String(view.scanned) : scanning ? '…' : '–',
        },
        {
          key: t('Titel-Index', 'Title index'),
          value: view ? String(view.titleCount) : '–',
        },
      ],
    },
    {
      type: 'select',
      id: 'scope',
      label: t('Bereich', 'Scope'),
      value: settings.scope,
      options: [
        { value: 'active', label: t('Aktive Notiz', 'Active note') },
        { value: 'vault', label: t('Vault (Cap)', 'Vault (cap)') },
      ],
    },
    {
      type: 'input',
      id: 'maxNotes',
      label: t('Max. Notizen im Vault-Scan (50–1000)', 'Max notes in vault scan (50–1000)'),
      value: String(settings.maxNotes),
      placeholder: String(DEFAULT_MAX_NOTES),
    },
    {
      type: 'input',
      id: 'minTitleLen',
      label: t('Min. Titellänge (2–50)', 'Min. title length (2–50)'),
      value: String(settings.minTitleLen),
      placeholder: String(DEFAULT_MIN_TITLE_LEN),
    },
    {
      type: 'checkbox',
      id: 'showStatus',
      label: t('Statusleiste 🔗 N anzeigen', 'Show status bar 🔗 N'),
      checked: settings.showStatus === true,
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
  } else if (view && view.hits.length === 0) {
    blocks.push({
      type: 'text',
      muted: true,
      text: t(
        'Keine unverlinkten Erwähnungen unter diesen Einstellungen.',
        'No unlinked mentions under these settings.',
      ),
    })
  } else if (view) {
    const selected = selectedHitKey
      ? view.hits.find((h) => hitKey(h) === selectedHitKey)
      : null

    blocks.push({
      type: 'list',
      id: 'hits',
      empty: t('Keine Treffer.', 'No hits.'),
      items: view.hits.map((h) => {
        const key = hitKey(h)
        const amb = h.ambiguous ? t(' · mehrdeutig', ' · ambiguous') : ''
        const sel = selectedHitKey === key ? ' ★' : ''
        return {
          id: key,
          title: `${h.title}${sel}`,
          detail: `${h.count}× · ${h.path}${amb} · ${h.sample}`,
        }
      }),
    })

    const linkLabel = selected
      ? t(`Zu [[${selected.title}]] verlinken`, `Link to [[${selected.title}]]`)
      : t('Zu [[Titel]] verlinken', 'Link to [[Title]]')

    blocks.push({
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'link-one',
          label: linkLabel,
          disabled: scanning || !selected || selected.ambiguous,
        },
      ],
    })

    if (selected && selected.ambiguous) {
      blocks.push({
        type: 'text',
        muted: true,
        text: t(
          'Mehrdeutiger Titel – Auto-Link deaktiviert (mehrere Notizen gleichen Titels).',
          'Ambiguous title – auto-link disabled (several notes share this title).',
        ),
      })
    } else if (!selected) {
      blocks.push({
        type: 'text',
        muted: true,
        text: t(
          'Treffer antippen (öffnet Notiz und wählt ihn) → dann verlinken.',
          'Tap a hit (opens the note and selects it) → then link.',
        ),
      })
    }
  }

  blocks.push({ type: 'divider' })
  blocks.push({
    type: 'text',
    muted: true,
    text: t(
      `Nur .md/.markdown · Scope ${settings.scope} · Cap ${settings.maxNotes} · minTitleLen ${settings.minTitleLen} · fenced \`\`\` und bestehende [[Links]] übersprungen · notes:write nur nach Bestätigung · kurze Titel → False Positives.`,
      `Only .md/.markdown · scope ${settings.scope} · cap ${settings.maxNotes} · minTitleLen ${settings.minTitleLen} · fenced \`\`\` and existing [[links]] skipped · notes:write only after confirm · short titles → false positives.`,
    ),
  })

  return blocks
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Unverlinkte Erwähnungen', 'Unlinked Mentions'))
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
        `${view.hits.length} Treffer (${view.scanned} gescannt).`,
        `${view.hits.length} hit(s) (${view.scanned} scanned).`,
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

    panel = fanotes.ui.panel({
      id: PANEL_ID,
      title: t('Unverlinkte Erwähnungen', 'Unlinked Mentions'),
      icon: '🔗',
      blocks: renderBlocks(),
      focus: true,
    })

    panel.onAction(async (action) => {
      try {
        if (
          action.id === 'refresh' ||
          action.id === 'submit:maxNotes' ||
          action.id === 'submit:minTitleLen'
        ) {
          const values = action.values || {}
          const rollback = { ...settings }
          if (values.scope != null) settings.scope = normalizeScope(values.scope)
          if (values.maxNotes != null) settings.maxNotes = clampMaxNotes(values.maxNotes)
          if (values.minTitleLen != null) {
            settings.minTitleLen = clampMinTitleLen(values.minTitleLen)
          }
          if (values.showStatus != null) settings.showStatus = values.showStatus === true
          const ok = await saveSettings(rollback)
          if (!ok) {
            await refreshPanel()
            return
          }
          await rescan({ silent: false })
          return
        }
        if (action.id === 'link-one') {
          const target = resolveLinkTarget()
          if (!target || target.ambiguous) {
            await fanotes.ui.toast(
              t(
                'Bitte einen eindeutigen Treffer wählen.',
                'Please select a non-ambiguous hit.',
              ),
              'info',
            )
            return
          }
          await linkOne(target)
          return
        }
        if (action.id === 'hits' && action.itemId) {
          const key = String(action.itemId)
          selectedHitKey = key
          const hit = view && view.hits.find((h) => hitKey(h) === key)
          await refreshPanel()
          if (hit) {
            try {
              await fanotes.notes.open(hit.path)
            } catch (error) {
              await fanotes.ui.toast(
                t(`Öffnen fehlgeschlagen: ${errMessage(error)}`, `Open failed: ${errMessage(error)}`),
                'error',
              )
            }
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
        if (input.id === 'scope') {
          const rollback = { ...settings }
          settings.scope = normalizeScope(input.value)
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
        if (input.id === 'minTitleLen') {
          const rollback = { ...settings }
          settings.minTitleLen = clampMinTitleLen(input.value)
          const ok = await saveSettings(rollback)
          if (!ok) {
            await refreshPanel()
            return
          }
          return
        }
        if (input.id === 'showStatus') {
          const rollback = { ...settings }
          settings.showStatus = input.value === true
          const ok = await saveSettings(rollback)
          if (!ok) {
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

// --- Commands ---------------------------------------------------------------

fanotes.commands.register({
  id: 'open',
  title: t('Unverlinkte Erwähnungen öffnen', 'Open Unlinked Mentions'),
  detail: t(
    'Panel mit Klartext-Erwähnungen anderer Notiztitel ohne [[Wikilink]]',
    'Panel of plain-text mentions of other note titles without [[wikilinks]]',
  ),
  keywords: 'unlinked erwähnt mention wikilink plaintext verlinken notizen notes öffnen open',
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
  title: t('Unverlinkte-Erwähnungen-Scan aktualisieren', 'Refresh unlinked-mentions scan'),
  detail: t(
    'Aktive Notiz oder Vault erneut auf Klartext-Titel scannen',
    'Re-scan active note or vault for plain-text titles',
  ),
  keywords: 'unlinked erwähnt rescan aktualisieren refresh scan mention plaintext',
  run: async () => {
    try {
      await rescan({ silent: false })
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'link-one',
  title: t('Erste Erwähnung verlinken', 'Link one mention'),
  detail: t(
    'Gewählten oder ersten Treffer nach Bestätigung zu [[Titel]] verlinken',
    'Link selected or first hit to [[Title]] after confirm',
  ),
  keywords: 'unlinked verlinken link mention wikilink confirm bestätigen',
  run: async () => {
    try {
      if (!view || !view.hits.length) {
        await rescan({ silent: true })
      }
      await linkOne()
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
    selectedHitKey = ''
    try {
      await fanotes.ui.status.remove(STATUS_ID)
    } catch {
      // Cold status may not exist.
    }
    fanotes.log(
      'unlinked-mentions activated',
      fanotes.app.appVersion,
      settings.scope,
      settings.maxNotes,
      settings.minTitleLen,
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
  selectedHitKey = ''
  try {
    await fanotes.ui.status.remove(STATUS_ID)
  } catch {
    // Host tears down UI; ignore.
  }
  panel = null
  view = null
})
