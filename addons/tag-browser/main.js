/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Tag-Browser / Tag Browser – list all #hashtags with counts and notes per tag.
// Tag-parse mirrors related-by-tags. Scan-gate: notes.list / notes.read never onActivate.
// Abgrenzung: related-by-tags = overlap for active note; tag-browser = vault-wide tag cloud.

const SETTINGS_KEY = 'settings'
const CACHE_KEY = 'cache'
const PANEL_ID = 'tags'
const STATUS_ID = 'tags'
const DEFAULT_MAX_NOTES = 400
const DEFAULT_MIN_COUNT = 1
const DEFAULT_SORT = 'count'
const DEFAULT_CACHE_TTL_MS = 120000
const DEBOUNCE_MS = 1500
/** Same hashtag regex as related-by-tags. */
const TAG_RE = /(^|[^\p{L}\p{N}_])#([\p{L}\p{N}_\-/]{1,32})/gu
const MD_EXT_RE = /\.(md|markdown)$/iu

/**
 * @typedef {'count' | 'name'} SortMode
 */

/**
 * @typedef {{
 *   maxNotes: number,
 *   minCount: number,
 *   sort: SortMode,
 *   showStatus: boolean,
 * }} Settings
 */

/**
 * @typedef {{
 *   updatedAt: number,
 *   tagToPaths: Record<string, string[]>,
 *   titles: Record<string, string>,
 * }} Cache
 */

/**
 * @typedef {{
 *   tag: string,
 *   count: number,
 *   paths: string[],
 * }} TagRow
 */

/**
 * @typedef {{
 *   scanned: number,
 *   tagCount: number,
 *   noteCount: number,
 *   rows: TagRow[],
 *   builtAt: number,
 * }} View
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  maxNotes: DEFAULT_MAX_NOTES,
  minCount: DEFAULT_MIN_COUNT,
  sort: DEFAULT_SORT,
  showStatus: false,
}

/** @type {Settings} */
let settings = { ...DEFAULT_SETTINGS }

/** @type {Cache} */
let cache = { updatedAt: 0, tagToPaths: {}, titles: {} }

/** @type {FaNotes.Panel | null} */
let panel = null

/** @type {View | null} */
let view = null

/** Drill-down: null = tag list; string = notes for that tag. */
let selectedTag = /** @type {string | null} */ (null)

/** True after at least one successful scan this session. */
let scannedOnce = false

let scanning = false
let scanQueued = false

/** @type {ReturnType<typeof setTimeout> | 0} */
let debounceTimer = 0

/** Draft minCount shown in the panel (applied on Refresh). */
let minCountDraft = String(DEFAULT_MIN_COUNT)

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
 * Clamp minCount to integer 1–100.
 * @param {unknown} raw
 */
function clampMinCount(raw) {
  let n = Number(raw)
  if (!Number.isFinite(n)) n = DEFAULT_MIN_COUNT
  n = Math.floor(n)
  if (n < 1) n = 1
  if (n > 100) n = 100
  return n
}

/**
 * @param {unknown} raw
 * @returns {SortMode}
 */
function normalizeSort(raw) {
  return raw === 'name' ? 'name' : 'count'
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
    minCount: clampMinCount(obj.minCount),
    sort: normalizeSort(obj.sort),
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
  minCountDraft = String(settings.minCount)
}

/**
 * @param {Settings} [rollback]
 * @returns {Promise<boolean>}
 */
async function saveSettings(rollback) {
  try {
    await fanotes.storage.set(SETTINGS_KEY, {
      maxNotes: settings.maxNotes,
      minCount: settings.minCount,
      sort: settings.sort,
      showStatus: settings.showStatus,
    })
    return true
  } catch (error) {
    if (rollback) settings = { ...rollback }
    minCountDraft = String(settings.minCount)
    await fanotes.ui.toast(
      t(`Speichern fehlgeschlagen: ${errMessage(error)}`, `Save failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

async function loadCache() {
  try {
    const stored = await fanotes.storage.get(CACHE_KEY)
    if (stored && typeof stored === 'object') {
      const obj = /** @type {Record<string, unknown>} */ (stored)
      const tagToPaths =
        obj.tagToPaths && typeof obj.tagToPaths === 'object'
          ? /** @type {Record<string, string[]>} */ (obj.tagToPaths)
          : {}
      const titles =
        obj.titles && typeof obj.titles === 'object'
          ? /** @type {Record<string, string>} */ (obj.titles)
          : {}
      cache = {
        updatedAt: typeof obj.updatedAt === 'number' ? obj.updatedAt : 0,
        tagToPaths,
        titles,
      }
    } else {
      cache = { updatedAt: 0, tagToPaths: {}, titles: {} }
    }
  } catch (error) {
    fanotes.log('loadCache failed', errMessage(error))
    cache = { updatedAt: 0, tagToPaths: {}, titles: {} }
  }
}

async function saveCache() {
  try {
    await fanotes.storage.set(CACHE_KEY, {
      updatedAt: cache.updatedAt,
      tagToPaths: cache.tagToPaths,
      titles: cache.titles,
    })
  } catch (error) {
    fanotes.log('saveCache failed', errMessage(error))
  }
}

/**
 * Ignore fenced ``` / ~~~ blocks via line-state toggle (same as related-by-tags).
 * @param {string} text
 */
function stripCodeFences(text) {
  const normalised = String(text ?? '').replace(/\r\n|\r/g, '\n')
  const lines = normalised.split('\n')
  let inFence = false
  /** @type {string[]} */
  const out = []
  for (const line of lines) {
    const trimmed = line.trimStart()
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    out.push(line)
  }
  return out.join('\n')
}

/**
 * Extract unique lowercase hashtags from prose (fenced code ignored).
 * Regex mirrors related-by-tags.
 * @param {string} text
 * @returns {string[]}
 */
function extractTags(text) {
  const body = stripCodeFences(text)
  const seen = new Set()
  /** @type {string[]} */
  const out = []
  TAG_RE.lastIndex = 0
  let match
  while ((match = TAG_RE.exec(body)) !== null) {
    const tag = String(match[2] ?? '').toLowerCase()
    if (!tag || tag.length < 1) continue
    if (seen.has(tag)) continue
    seen.add(tag)
    out.push(tag)
  }
  return out
}

/**
 * @returns {boolean}
 */
function cacheIsFresh() {
  if (!cache.updatedAt) return false
  const age = Date.now() - cache.updatedAt
  return age >= 0 && age < DEFAULT_CACHE_TTL_MS
}

/**
 * Build filtered/sorted rows from cache + settings.minCount / settings.sort.
 * @param {number} scanned
 * @returns {View}
 */
function buildViewFromCache(scanned) {
  /** @type {TagRow[]} */
  const rows = []
  let notePaths = new Set()
  for (const [tag, paths] of Object.entries(cache.tagToPaths)) {
    const list = Array.isArray(paths) ? paths : []
    if (list.length < settings.minCount) continue
    for (const p of list) notePaths.add(p)
    rows.push({
      tag,
      count: list.length,
      paths: list.slice(),
    })
  }

  if (settings.sort === 'name') {
    rows.sort((a, b) => a.tag.localeCompare(b.tag))
  } else {
    rows.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return a.tag.localeCompare(b.tag)
    })
  }

  return {
    scanned,
    tagCount: rows.length,
    noteCount: notePaths.size,
    rows,
    builtAt: Date.now(),
  }
}

/**
 * Recompute view from cache without re-reading notes (filter/sort change).
 */
function recomputeView() {
  if (!scannedOnce && !cache.updatedAt) {
    view = null
    return
  }
  const scanned = Object.keys(cache.titles).length
  view = buildViewFromCache(scanned)
  // Keep drill-down only if tag still in filtered rows.
  if (selectedTag) {
    const still = view.rows.some((r) => r.tag === selectedTag)
    if (!still) selectedTag = null
  }
}

/**
 * Full tag-index rebuild (md/markdown only, capped by maxNotes, newest first).
 * SCAN GATE — never from onActivate.
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

    const mdNotes = notes
      .filter((n) => MD_EXT_RE.test(n.path))
      .sort((a, b) => String(b.modifiedAt ?? '').localeCompare(String(a.modifiedAt ?? '')))
      .slice(0, settings.maxNotes)

    /** @type {Record<string, string>} */
    const titles = {}
    /** @type {Record<string, Set<string>>} */
    const tagSets = {}

    for (const note of mdNotes) {
      titles[note.path] = note.title || basenameNoExt(note.path)
      let text = ''
      try {
        text = await fanotes.notes.read(note.path)
      } catch (error) {
        fanotes.log('read failed', note.path, errMessage(error))
        continue
      }
      const tags = extractTags(text)
      for (const tag of tags) {
        let set = tagSets[tag]
        if (!set) {
          set = new Set()
          tagSets[tag] = set
        }
        set.add(note.path)
      }
    }

    /** @type {Record<string, string[]>} */
    const tagToPaths = {}
    for (const [tag, set] of Object.entries(tagSets)) {
      tagToPaths[tag] = Array.from(set).sort((a, b) => a.localeCompare(b))
    }

    cache = {
      updatedAt: Date.now(),
      tagToPaths,
      titles,
    }
    await saveCache()
    scannedOnce = true
    view = buildViewFromCache(mdNotes.length)
    if (selectedTag) {
      const still = view.rows.some((r) => r.tag === selectedTag)
      if (!still) selectedTag = null
    }

    if (!opts.silent) {
      await fanotes.ui.toast(
        t(
          `Tag-Index: ${view.tagCount} Tag(s), ${mdNotes.length} Notizen.`,
          `Tag index: ${view.tagCount} tag(s), ${mdNotes.length} notes.`,
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
 * Ensure tag index: rebuild if forced, missing, or older than TTL.
 * @param {{ force?: boolean, silent?: boolean }} [opts]
 */
async function ensureIndex(opts = {}) {
  const force = opts.force === true
  if (!force && cacheIsFresh() && Object.keys(cache.tagToPaths).length > 0) {
    scannedOnce = true
    recomputeView()
    return
  }
  await rescan({ silent: opts.silent !== false })
}

function scheduleInvalidate() {
  if (!panel) return
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = 0
    void rescan({ silent: true })
  }, DEBOUNCE_MS)
}

/**
 * Status `🏷 Ntags` only when showStatus && scannedOnce.
 */
async function updateStatus() {
  try {
    if (!settings.showStatus || !scannedOnce) {
      await fanotes.ui.status.remove(STATUS_ID)
      return
    }
    const n = view ? view.tagCount : 0
    await fanotes.ui.status.set({
      id: STATUS_ID,
      text: `🏷 ${n}tags`,
      title: t('Tag-Browser öffnen', 'Open Tag Browser'),
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

function formatUpdatedAt(ts) {
  if (!ts) return t('nie', 'never')
  try {
    const locale = fanotes.app.language === 'en' ? 'en-US' : 'de-DE'
    return new Date(ts).toLocaleString(locale)
  } catch {
    return new Date(ts).toISOString()
  }
}

/**
 * Apply minCount (+ optional sort) from panel values / drafts.
 * @param {Record<string, unknown>} [values]
 * @param {{ silent?: boolean }} [opts]
 * @returns {Promise<boolean>}
 */
async function applySettingsFromValues(values, opts = {}) {
  const rawMin =
    values && values.minCount != null ? values.minCount : minCountDraft
  const rawSort =
    values && values.sort != null ? values.sort : settings.sort

  const rollback = { ...settings }
  settings.minCount = clampMinCount(rawMin)
  settings.sort = normalizeSort(rawSort)
  minCountDraft = String(settings.minCount)

  const ok = await saveSettings(rollback)
  if (!ok) {
    await refreshPanel()
    return false
  }

  if (!opts.silent) {
    await fanotes.ui.toast(
      t(
        `Einstellungen übernommen (min ${settings.minCount}, Sort ${settings.sort}).`,
        `Settings applied (min ${settings.minCount}, sort ${settings.sort}).`,
      ),
      'success',
    )
  }
  return true
}

function renderBlocks() {
  const tagLabel = view
    ? String(view.tagCount)
    : scanning
      ? '…'
      : scannedOnce
        ? '0'
        : '–'
  const noteLabel = view
    ? String(view.scanned)
    : scanning
      ? '…'
      : scannedOnce
        ? '0'
        : '–'

  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Tag-Browser', 'Tag Browser'), level: 2 },
  ]

  // Drill-down: notes for one tag
  if (selectedTag) {
    const row = view ? view.rows.find((r) => r.tag === selectedTag) : null
    blocks.push({
      type: 'keyvalue',
      items: [
        { key: t('Tag', 'Tag'), value: `#${selectedTag}` },
        { key: t('Notizen', 'Notes'), value: row ? String(row.count) : '0' },
      ],
    })
    blocks.push({
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'back',
          label: t('← Tags', '← Tags'),
        },
      ],
    })
    const noteItems = row
      ? row.paths.map((path) => ({
          id: path,
          title: (cache.titles && cache.titles[path]) || basenameNoExt(path),
          detail: path,
        }))
      : []
    blocks.push({
      type: 'list',
      id: 'notes',
      empty: t('Keine Notizen für diesen Tag.', 'No notes for this tag.'),
      items: noteItems,
    })
    blocks.push({ type: 'divider' })
    blocks.push({
      type: 'text',
      muted: true,
      text: t(
        'Klick öffnet die Notiz. „← Tags“ zurück zur Übersicht.',
        'Click opens the note. “← Tags” returns to the overview.',
      ),
    })
    return blocks
  }

  // Overview
  blocks.push({
    type: 'keyvalue',
    items: [
      { key: t('Tags', 'Tags'), value: tagLabel },
      { key: t('Notizen im Index', 'Notes in index'), value: noteLabel },
    ],
  })
  blocks.push({
    type: 'input',
    id: 'minCount',
    label: t('Min. Häufigkeit (1–100)', 'Min. count (1–100)'),
    value: minCountDraft,
    placeholder: String(DEFAULT_MIN_COUNT),
  })
  blocks.push({
    type: 'select',
    id: 'sort',
    label: t('Sortierung', 'Sort'),
    value: settings.sort,
    options: [
      { value: 'count', label: t('Häufigkeit (absteigend)', 'Count (descending)') },
      { value: 'name', label: t('Name (A–Z)', 'Name (A–Z)') },
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
        id: row.tag,
        title: `#${row.tag}`,
        badge: String(row.count),
      }))
    : []

  blocks.push({
    type: 'list',
    id: 'tags',
    empty: scannedOnce
      ? t('Keine Tags unter dieser Min-Häufigkeit.', 'No tags under this min count.')
      : t('Noch nicht gescannt – „Aktualisieren“ tippen.', 'Not scanned yet – tap “Refresh”.'),
    items: listItems,
  })

  blocks.push({ type: 'divider' })
  blocks.push({
    type: 'checkbox',
    id: 'showStatus',
    label: t('Statusleiste 🏷 Ntags anzeigen', 'Show status bar 🏷 Ntags'),
    checked: settings.showStatus === true,
  })
  blocks.push({
    type: 'text',
    muted: true,
    text: t(
      `Caps: Index ≤ ${settings.maxNotes} · minCount ${settings.minCount} · Sort ${settings.sort} · Cache-TTL ${Math.round(DEFAULT_CACHE_TTL_MS / 1000)} s · Zuletzt ${formatUpdatedAt(cache.updatedAt)} · nur Prosa-#Tags (kein YAML) · Abgrenzung: related-by-tags = Überlappung zur aktiven Notiz; hier = Vault-weite Tag-Wolke.`,
      `Caps: index ≤ ${settings.maxNotes} · minCount ${settings.minCount} · sort ${settings.sort} · cache TTL ${Math.round(DEFAULT_CACHE_TTL_MS / 1000)} s · updated ${formatUpdatedAt(cache.updatedAt)} · prose #tags only (no YAML) · vs related-by-tags = overlap with active note; here = vault-wide tag cloud.`,
    ),
  })

  return blocks
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    const title = selectedTag
      ? t(`Tag: #${selectedTag}`, `Tag: #${selectedTag}`)
      : t('Tag-Browser', 'Tag Browser')
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
 * Open panel + ensure index (scan-gate entry).
 * @param {{ silent?: boolean }} [opts]
 */
async function openAndScan(opts = {}) {
  const silent = opts.silent !== false
  await ensureIndex({ silent: true })
  await refreshPanel()
  await updateStatus()
  if (!silent && view) {
    await fanotes.ui.toast(
      t(
        `${view.tagCount} Tag(s) (${view.scanned} Notizen im Index).`,
        `${view.tagCount} tag(s) (${view.scanned} notes in index).`,
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

    minCountDraft = String(settings.minCount)
    selectedTag = null

    panel = fanotes.ui.panel({
      id: PANEL_ID,
      title: t('Tag-Browser', 'Tag Browser'),
      icon: '🏷',
      blocks: renderBlocks(),
      focus: true,
    })

    panel.onAction(async (action) => {
      try {
        if (action.id === 'back') {
          selectedTag = null
          await refreshPanel()
          return
        }
        if (action.id === 'refresh' || action.id === 'submit:minCount') {
          const values = action.values || {}
          if (values.minCount != null) minCountDraft = String(values.minCount)
          const ok = await applySettingsFromValues(values, { silent: true })
          if (!ok) return
          selectedTag = null
          await rescan({ silent: false })
          return
        }
        if (action.id === 'tags' && action.itemId) {
          selectedTag = String(action.itemId)
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
        if (input.id === 'minCount') {
          minCountDraft = String(input.value ?? '')
          return
        }
        if (input.id === 'sort') {
          const rollback = { ...settings }
          settings.sort = normalizeSort(input.value)
          const ok = await saveSettings(rollback)
          if (!ok) {
            await refreshPanel()
            return
          }
          if (scannedOnce) {
            recomputeView()
          }
          await refreshPanel()
          await updateStatus()
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

// --- Commands ---------------------------------------------------------------

fanotes.commands.register({
  id: 'open',
  title: t('Tag-Browser öffnen', 'Open Tag Browser'),
  detail: t(
    'Panel mit allen #Hashtags, Häufigkeit und Notizen pro Tag',
    'Panel of all #hashtags with counts and notes per tag',
  ),
  keywords: 'tags hashtag browser themen cloud filter # öffnen open',
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
  title: t('Tag-Index neu aufbauen', 'Rebuild tag index'),
  detail: t(
    'Markdown-Notizen (bis maxNotes) erneut lesen und Tags indexieren',
    'Re-read Markdown notes (up to maxNotes) and index tags',
  ),
  keywords: 'tags rescan neu einlesen index rebuild scan hashtag browser',
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
    // Light work only: settings (+ optional cache load). NO notes.list / notes.read.
    await loadSettings()
    await loadCache()
    scannedOnce = false
    view = null
    selectedTag = null
    await fanotes.ui.status.remove(STATUS_ID)
    fanotes.log(
      'tag-browser activated',
      fanotes.app.appVersion,
      settings.maxNotes,
      settings.minCount,
      settings.sort,
    )

    if (fanotes.hasPermission('notes:read')) {
      fanotes.events.on('note:saved', () => {
        scheduleInvalidate()
      })
      fanotes.events.on('note:created', () => {
        scheduleInvalidate()
      })
      fanotes.events.on('note:deleted', () => {
        scheduleInvalidate()
      })
    }

    fanotes.events.on('vault:changed', () => {
      scheduleInvalidate()
    })
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(async () => {
  clearTimeout(debounceTimer)
  debounceTimer = 0
  scanning = false
  scanQueued = false
  scannedOnce = false
  selectedTag = null
  try {
    await fanotes.ui.status.remove(STATUS_ID)
  } catch {
    // Host tears down UI; ignore.
  }
  panel = null
  view = null
})
