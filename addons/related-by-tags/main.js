/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Verwandte per Tag / Related by Tags – find related Markdown notes by
// shared #hashtags (prose only; no YAML frontmatter tags in v1).
// Scan-gate: notes.list / notes.read never onActivate (settings + cold status remove only).

const SETTINGS_KEY = 'settings'
const CACHE_KEY = 'cache'
const PANEL_ID = 'related'
const STATUS_ID = 'related'
const DEFAULT_MAX_NOTES = 400
const DEFAULT_MIN_OVERLAP = 1
const DEFAULT_CACHE_TTL_MS = 120000
const LIST_CAP = 50
const DEBOUNCE_MS = 1500
const TAG_RE = /(^|[^\p{L}\p{N}_])#([\p{L}\p{N}_\-/]{1,32})/gu
const MD_EXT_RE = /\.(md|markdown)$/iu

/**
 * @typedef {{
 *   maxNotes: number,
 *   minOverlap: number,
 *   excludeSelf: boolean,
 *   cacheTtlMs: number,
 *   showStatus: boolean,
 * }} Settings
 */

/**
 * @typedef {{
 *   updatedAt: number,
 *   tagsByPath: Record<string, string[]>,
 * }} Cache
 */

/**
 * @typedef {{
 *   path: string,
 *   title: string,
 *   modifiedAt: string | null,
 *   overlap: number,
 *   shared: string[],
 * }} RelatedItem
 */

/**
 * @typedef {{
 *   activePath: string,
 *   activeTitle: string,
 *   tagsA: string[],
 *   hits: RelatedItem[],
 * }} View
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  maxNotes: DEFAULT_MAX_NOTES,
  minOverlap: DEFAULT_MIN_OVERLAP,
  excludeSelf: true,
  cacheTtlMs: DEFAULT_CACHE_TTL_MS,
  showStatus: false,
}

/** @type {Settings} */
let settings = { ...DEFAULT_SETTINGS }

/** @type {Cache} */
let cache = { updatedAt: 0, tagsByPath: {} }

/** In-memory meta from last list (not persisted). @type {Record<string, { title: string, modifiedAt: string | null }>} */
let metaByPath = {}

/** @type {FaNotes.Panel | null} */
let panel = null

/** @type {View | null} */
let view = null

/** True after at least one successful index build this session (or loaded cache with tags). */
let scannedOnce = false

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

/**
 * Basename without `.md` / `.markdown`.
 * @param {string} path
 */
function basenameNoExt(path) {
  const base = String(path).split('/').pop() || String(path)
  return base.replace(/\.(md|markdown)$/iu, '')
}

/**
 * @param {unknown} raw
 * @returns {Settings}
 */
function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const obj = /** @type {Record<string, unknown>} */ (raw)

  let maxNotes = Number(obj.maxNotes)
  if (!Number.isFinite(maxNotes) || maxNotes < 1) maxNotes = DEFAULT_MAX_NOTES
  maxNotes = Math.min(2000, Math.floor(maxNotes))

  let minOverlap = Number(obj.minOverlap)
  if (!Number.isFinite(minOverlap) || minOverlap < 1) minOverlap = DEFAULT_MIN_OVERLAP
  minOverlap = Math.min(5, Math.max(1, Math.floor(minOverlap)))

  let cacheTtlMs = Number(obj.cacheTtlMs)
  if (!Number.isFinite(cacheTtlMs) || cacheTtlMs < 0) cacheTtlMs = DEFAULT_CACHE_TTL_MS
  cacheTtlMs = Math.min(3600000, Math.floor(cacheTtlMs))

  return {
    maxNotes,
    minOverlap,
    excludeSelf: obj.excludeSelf !== false,
    cacheTtlMs,
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
 * @param {Settings} [rollback]
 * @returns {Promise<boolean>}
 */
async function saveSettings(rollback) {
  try {
    await fanotes.storage.set(SETTINGS_KEY, settings)
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

async function loadCache() {
  try {
    const stored = await fanotes.storage.get(CACHE_KEY)
    if (stored && typeof stored === 'object') {
      const obj = /** @type {Record<string, unknown>} */ (stored)
      const tagsByPath =
        obj.tagsByPath && typeof obj.tagsByPath === 'object'
          ? /** @type {Record<string, string[]>} */ (obj.tagsByPath)
          : {}
      cache = {
        updatedAt: typeof obj.updatedAt === 'number' ? obj.updatedAt : 0,
        tagsByPath,
      }
      if (cache.updatedAt && Object.keys(cache.tagsByPath).length) {
        // Loaded cache does not count as “scanned once” for status (scan-gate).
        // Status stays cold until a user-triggered ensure/rescan this session.
      }
    } else {
      cache = { updatedAt: 0, tagsByPath: {} }
    }
  } catch (error) {
    fanotes.log('loadCache failed', errMessage(error))
    cache = { updatedAt: 0, tagsByPath: {} }
  }
}

async function saveCache() {
  try {
    await fanotes.storage.set(CACHE_KEY, {
      updatedAt: cache.updatedAt,
      tagsByPath: cache.tagsByPath,
    })
  } catch (error) {
    fanotes.log('saveCache failed', errMessage(error))
  }
}

/**
 * Ignore fenced ``` / ~~~ blocks via line-state toggle (like heading-outline).
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
 * Regex: /(^|[^\p{L}\p{N}_])#([\p{L}\p{N}_\-/]{1,32})/gu
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
  return age >= 0 && age < settings.cacheTtlMs
}

/**
 * Refresh title/modifiedAt maps via notes.list (no body reads).
 */
async function refreshMetaFromList() {
  let notes = []
  try {
    notes = await fanotes.notes.list()
  } catch (error) {
    fanotes.log('refreshMetaFromList failed', errMessage(error))
    return
  }
  /** @type {Record<string, { title: string, modifiedAt: string | null }>} */
  const next = {}
  for (const note of notes) {
    if (!MD_EXT_RE.test(note.path)) continue
    next[note.path] = {
      title: note.title || basenameNoExt(note.path),
      modifiedAt: note.modifiedAt ?? null,
    }
  }
  metaByPath = next
}

/**
 * Full tag-index rebuild (md/markdown only, capped by maxNotes, newest first).
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

    /** @type {Record<string, { title: string, modifiedAt: string | null }>} */
    const meta = {}
    /** @type {Record<string, string[]>} */
    const tagsByPath = {}

    for (const note of mdNotes) {
      meta[note.path] = {
        title: note.title || basenameNoExt(note.path),
        modifiedAt: note.modifiedAt ?? null,
      }
      let text = ''
      try {
        text = await fanotes.notes.read(note.path)
      } catch (error) {
        fanotes.log('read failed', note.path, errMessage(error))
        tagsByPath[note.path] = []
        continue
      }
      tagsByPath[note.path] = extractTags(text)
    }

    metaByPath = meta
    cache = {
      updatedAt: Date.now(),
      tagsByPath,
    }
    await saveCache()
    scannedOnce = true

    if (!opts.silent) {
      await fanotes.ui.toast(
        t(
          `Tag-Index aktualisiert (${mdNotes.length} Notizen).`,
          `Tag index updated (${mdNotes.length} notes).`,
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
    view = await computeView()
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
  if (!force && cacheIsFresh() && Object.keys(cache.tagsByPath).length > 0) {
    await refreshMetaFromList()
    scannedOnce = true
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
 * @returns {Promise<View | null>}
 */
async function computeView() {
  let active = null
  try {
    active = await fanotes.notes.active()
  } catch (error) {
    fanotes.log('notes.active failed', errMessage(error))
    return null
  }
  if (!active || !active.path || active.kind === 'none' || active.kind === 'pdf') {
    return null
  }
  if (!MD_EXT_RE.test(active.path)) {
    return null
  }

  const activePath = active.path
  const activeTitle = active.title || basenameNoExt(activePath)

  let tagsA = cache.tagsByPath[activePath]
  if (!tagsA) {
    let text = ''
    try {
      text = await fanotes.notes.read(activePath)
    } catch (error) {
      fanotes.log('read active failed', errMessage(error))
      return {
        activePath,
        activeTitle,
        tagsA: [],
        hits: [],
      }
    }
    tagsA = extractTags(text)
  }

  if (!tagsA.length) {
    return { activePath, activeTitle, tagsA: [], hits: [] }
  }

  const setA = new Set(tagsA)
  /** @type {RelatedItem[]} */
  const hits = []

  for (const [path, tagsB] of Object.entries(cache.tagsByPath)) {
    if (settings.excludeSelf && path === activePath) continue
    /** @type {string[]} */
    const shared = []
    for (const tag of tagsB) {
      if (setA.has(tag)) shared.push(tag)
    }
    const overlap = shared.length
    if (overlap < settings.minOverlap) continue
    const meta = metaByPath[path]
    hits.push({
      path,
      title: (meta && meta.title) || basenameNoExt(path),
      modifiedAt: (meta && meta.modifiedAt) || null,
      overlap,
      shared,
    })
  }

  hits.sort((a, b) => {
    if (b.overlap !== a.overlap) return b.overlap - a.overlap
    return String(b.modifiedAt ?? '').localeCompare(String(a.modifiedAt ?? ''))
  })

  return {
    activePath,
    activeTitle,
    tagsA,
    hits: hits.slice(0, LIST_CAP),
  }
}

/**
 * Status `🏷 N` only when showStatus && scannedOnce (N = related hits for active).
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
      text: `🏷 ${n}`,
      title: t('Verwandte per Tag öffnen', 'Open Related by Tags'),
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

function renderBlocks() {
  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Verwandte per Tag', 'Related by Tags'), level: 2 },
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
      type: 'select',
      id: 'minOverlap',
      label: t('Min. Überlappung', 'Min. overlap'),
      value: String(settings.minOverlap),
      options: [
        { value: '1', label: '1' },
        { value: '2', label: '2' },
        { value: '3', label: '3' },
        { value: '4', label: '4' },
        { value: '5', label: '5' },
      ],
    },
  ]

  if (!view) {
    blocks.push({
      type: 'keyvalue',
      items: [
        { key: t('Tags', 'Tags'), value: '–' },
        { key: t('Treffer', 'Hits'), value: '–' },
        {
          key: t('Index', 'Index'),
          value: String(Object.keys(cache.tagsByPath).length),
        },
        { key: t('Zuletzt', 'Updated'), value: formatUpdatedAt(cache.updatedAt) },
      ],
    })
    blocks.push({
      type: 'callout',
      tone: 'info',
      text: t(
        'Keine aktive Markdown-Notiz. Öffne eine .md-Notiz, dann „Aktualisieren“.',
        'No active Markdown note. Open a .md note, then “Refresh”.',
      ),
    })
  } else if (!view.tagsA.length) {
    blocks.push({
      type: 'keyvalue',
      items: [
        { key: t('Tags', 'Tags'), value: t('(keine)', '(none)') },
        { key: t('Treffer', 'Hits'), value: '0' },
        {
          key: t('Index', 'Index'),
          value: `${Object.keys(cache.tagsByPath).length} / ${settings.maxNotes}`,
        },
        { key: t('Zuletzt', 'Updated'), value: formatUpdatedAt(cache.updatedAt) },
      ],
    })
    blocks.push({
      type: 'text',
      muted: true,
      text: t(`Aktiv: ${view.activeTitle}`, `Active: ${view.activeTitle}`),
    })
    blocks.push({
      type: 'callout',
      tone: 'info',
      text: t(
        'Keine #Hashtags in der aktiven Notiz (Prosa; fenced ``` wird ignoriert). Beispiel: #mathe #klausur',
        'No #hashtags in the active note (prose; fenced ``` ignored). Example: #math #exam',
      ),
    })
    blocks.push({
      type: 'list',
      id: 'related',
      empty: t('Keine verwandten Notizen.', 'No related notes.'),
      items: [],
    })
  } else {
    const tagsJoined = view.tagsA.join(', ')
    blocks.push({
      type: 'keyvalue',
      items: [
        { key: t('Tags', 'Tags'), value: tagsJoined },
        { key: t('Treffer', 'Hits'), value: String(view.hits.length) },
        {
          key: t('Index', 'Index'),
          value: `${Object.keys(cache.tagsByPath).length} / ${settings.maxNotes}`,
        },
        { key: t('Zuletzt', 'Updated'), value: formatUpdatedAt(cache.updatedAt) },
      ],
    })
    blocks.push({
      type: 'text',
      muted: true,
      text: t(`Aktiv: ${view.activeTitle}`, `Active: ${view.activeTitle}`),
    })
    blocks.push({
      type: 'list',
      id: 'related',
      empty: t('Keine verwandten Notizen mit genug Überlappung.', 'No related notes with enough overlap.'),
      items: view.hits.map((item) => ({
        id: item.path,
        title: item.title,
        detail: `${item.overlap} · ${item.shared.join(', ')}`,
        badge: String(item.overlap),
      })),
    })
  }

  blocks.push({ type: 'divider' })
  blocks.push({
    type: 'checkbox',
    id: 'excludeSelf',
    label: t('Aktive Notiz ausschließen', 'Exclude active note'),
    checked: settings.excludeSelf,
  })
  blocks.push({
    type: 'checkbox',
    id: 'showStatus',
    label: t('Statusleiste 🏷 N anzeigen', 'Show status bar 🏷 N'),
    checked: settings.showStatus === true,
  })
  blocks.push({
    type: 'text',
    muted: true,
    text: t(
      `Caps: Index ≤ ${settings.maxNotes} Notizen · Liste ≤ ${LIST_CAP} · Cache-TTL ${Math.round(settings.cacheTtlMs / 1000)} s · nur Prosa-#Tags (kein YAML-Frontmatter v1).`,
      `Caps: index ≤ ${settings.maxNotes} notes · list ≤ ${LIST_CAP} · cache TTL ${Math.round(settings.cacheTtlMs / 1000)} s · prose #tags only (no YAML frontmatter in v1).`,
    ),
  })

  return blocks
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Verwandte per Tag', 'Related by Tags'))
  } catch (error) {
    if (isNoPanel(error)) {
      panel = null
      return
    }
    fanotes.log('refreshPanel', errMessage(error))
  }
}

/**
 * Open panel + ensure index + compute related (scan-gate entry).
 */
async function openAndRefresh(opts = {}) {
  const silent = opts.silent !== false
  await ensureIndex({ silent: true })
  view = await computeView()
  await refreshPanel()
  await updateStatus()
  if (!silent && view) {
    await fanotes.ui.toast(
      t(
        `${view.hits.length} verwandte Notiz(en).`,
        `${view.hits.length} related note(s).`,
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
      void openAndRefresh({ silent: true })
      return
    }

    panel = fanotes.ui.panel({
      id: PANEL_ID,
      title: t('Verwandte per Tag', 'Related by Tags'),
      icon: '🏷',
      blocks: renderBlocks(),
      focus: true,
    })

    panel.onAction(async (action) => {
      try {
        if (action.id === 'refresh') {
          await rescan({ silent: false })
          return
        }
        if (action.id === 'related' && action.itemId) {
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
        if (input.id === 'minOverlap') {
          const prev = settings.minOverlap
          const rollback = { ...settings }
          let n = Number(String(input.value ?? ''))
          if (!Number.isFinite(n) || n < 1) n = DEFAULT_MIN_OVERLAP
          settings.minOverlap = Math.min(5, Math.max(1, Math.floor(n)))
          const ok = await saveSettings(rollback)
          if (!ok) {
            settings.minOverlap = prev
            await refreshPanel()
            return
          }
          view = await computeView()
          await refreshPanel()
          await updateStatus()
          return
        }
        if (input.id === 'excludeSelf') {
          const prev = settings.excludeSelf
          const rollback = { ...settings }
          settings.excludeSelf = input.value === true
          const ok = await saveSettings(rollback)
          if (!ok) {
            settings.excludeSelf = prev
            await refreshPanel()
            return
          }
          view = await computeView()
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

    void openAndRefresh({ silent: true })
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
 * Command: open the best-related note (highest overlap, then newest).
 */
async function openTopRelated() {
  try {
    await ensureIndex({ silent: true })
    view = await computeView()
    await refreshPanel()
    await updateStatus()

    if (!view) {
      await fanotes.ui.toast(
        t('Keine aktive Markdown-Notiz.', 'No active Markdown note.'),
        'info',
      )
      return
    }
    if (!view.tagsA.length) {
      await fanotes.ui.toast(
        t('Keine #Hashtags in der aktiven Notiz.', 'No #hashtags in the active note.'),
        'info',
      )
      return
    }
    if (!view.hits.length) {
      await fanotes.ui.toast(
        t('Keine verwandten Notizen gefunden.', 'No related notes found.'),
        'info',
      )
      return
    }

    const best = view.hits[0]
    try {
      await fanotes.notes.open(best.path)
      await fanotes.ui.toast(
        t(
          `Geöffnet: ${best.title} (${best.overlap} gemeinsam)`,
          `Opened: ${best.title} (${best.overlap} shared)`,
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
  title: t('Verwandte per Tag öffnen', 'Open Related by Tags'),
  detail: t(
    'Panel mit Notizen, die #Hashtags mit der aktiven teilen',
    'Panel of notes that share #hashtags with the active note',
  ),
  keywords: 'tags verwandt related hashtag # links ähnlich similar overlap panel öffnen open',
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
    'Markdown-Notizen (bis maxNotes) erneut lesen und Tags cachen',
    'Re-read Markdown notes (up to maxNotes) and cache tags',
  ),
  keywords: 'tags rescan neu einlesen index rebuild scan hashtag verwandt related',
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
  title: t('Beste verwandte Notiz öffnen', 'Open top related note'),
  detail: t(
    'Notiz mit höchster Tag-Überlappung öffnen',
    'Open the note with the highest tag overlap',
  ),
  keywords: 'tags verwandt related top best öffnen open hashtag overlap',
  run: async () => {
    try {
      await openTopRelated()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.onActivate(async () => {
  try {
    // Light work only: settings (+ optional cache load). NO notes.list / notes.read.
    // Remove cold status (scan-gate).
    await loadSettings()
    await loadCache()
    scannedOnce = false
    await fanotes.ui.status.remove(STATUS_ID)
    fanotes.log(
      'related-by-tags activated',
      fanotes.app.appVersion,
      settings.maxNotes,
      settings.minOverlap,
      settings.cacheTtlMs,
    )

    fanotes.events.on('note:opened', () => {
      if (!panel) return
      void (async () => {
        try {
          view = await computeView()
          await refreshPanel()
          await updateStatus()
        } catch (error) {
          fanotes.log('note:opened', errMessage(error))
        }
      })()
    })

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
  try {
    await fanotes.ui.status.remove(STATUS_ID)
  } catch {
    // Host tears down UI; ignore.
  }
  panel = null
  view = null
})
