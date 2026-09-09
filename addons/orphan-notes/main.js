/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Verwaiste Notizen / Orphan Notes – find Markdown notes with no outgoing
// wikilinks [[…]] (and optionally no incoming). Modes: outgoing | incoming | both.
// Scan-gate: notes.list / notes.read never onActivate (settings + cold status remove only).

const SETTINGS_KEY = 'settings'
const CACHE_KEY = 'cache'
const PANEL_ID = 'orphans'
const STATUS_ID = 'orphans'
const DEFAULT_MAX_NOTES = 400
const DEFAULT_CACHE_TTL_MS = 120000
const LIST_CAP = 50
const DEBOUNCE_MS = 1500
const WIKILINK_RE = /\[\[([^\]|#]+?)(?:#[^\]|]*)?(?:\|[^\]]+)?\]\]/gu
const MD_EXT_RE = /\.(md|markdown)$/iu
const MAX_NOTES_OPTIONS = [100, 200, 400, 800]

/**
 * @typedef {'outgoing' | 'incoming' | 'both'} Mode
 */

/**
 * @typedef {{
 *   maxNotes: number,
 *   mode: Mode,
 *   cacheTtlMs: number,
 *   showStatus: boolean,
 *   excludeFolders: string[],
 * }} Settings
 */

/**
 * @typedef {{
 *   updatedAt: number,
 *   outgoingByPath: Record<string, string[]>,
 *   titles: Record<string, string>,
 * }} Cache
 */

/**
 * @typedef {{
 *   path: string,
 *   title: string,
 *   modifiedAt: string | null,
 *   reason: string,
 * }} OrphanItem
 */

/**
 * @typedef {{
 *   scanned: number,
 *   orphans: OrphanItem[],
 *   orphanCount: number,
 * }} View
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  maxNotes: DEFAULT_MAX_NOTES,
  mode: 'outgoing',
  cacheTtlMs: DEFAULT_CACHE_TTL_MS,
  showStatus: false,
  excludeFolders: [],
}

/** @type {Settings} */
let settings = { ...DEFAULT_SETTINGS, excludeFolders: [] }

/** @type {Cache} */
let cache = { updatedAt: 0, outgoingByPath: {}, titles: {} }

/** In-memory meta from last list (not persisted). @type {Record<string, { title: string, modifiedAt: string | null }>} */
let metaByPath = {}

/** @type {FaNotes.Panel | null} */
let panel = null

/** @type {View | null} */
let view = null

/** True after at least one successful index build this session. */
let scannedOnce = false

let scanning = false
let scanQueued = false

/** @type {ReturnType<typeof setTimeout> | 0} */
let debounceTimer = 0

/** Draft excludeFolders string for panel input. */
let excludeFoldersDraft = ''

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

/** Lowercase trim key for title / basename maps. */
function normKey(raw) {
  return String(raw ?? '').trim().toLowerCase()
}

/**
 * Normalize one folder prefix (vault-relative, no leading/trailing `/`, no `..`).
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
 * @param {unknown} raw
 * @returns {string[]}
 */
function normalizeExcludeFolders(raw) {
  if (!Array.isArray(raw)) return []
  /** @type {string[]} */
  const out = []
  const seen = new Set()
  for (const item of raw) {
    const folder = normalizeFolder(item)
    if (folder === null || folder === '') continue
    const key = folder.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(folder)
  }
  return out
}

/**
 * Parse comma/newline-separated folder list from panel input.
 * @param {unknown} raw
 * @returns {string[]}
 */
function parseExcludeFoldersText(raw) {
  const text = String(raw ?? '')
  const parts = text.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean)
  return normalizeExcludeFolders(parts)
}

/**
 * @param {string[]} folders
 */
function formatExcludeFolders(folders) {
  return (folders || []).join(', ')
}

/**
 * @param {string} path
 * @param {string[]} folders
 */
function isExcludedPath(path, folders) {
  if (!folders || !folders.length) return false
  const p = String(path).replace(/\\/g, '/')
  for (const folder of folders) {
    const f = folder.replace(/\\/g, '/')
    if (p === f || p.startsWith(f + '/')) return true
  }
  return false
}

/**
 * @param {unknown} raw
 * @returns {Mode}
 */
function normalizeMode(raw) {
  const m = String(raw ?? '').trim().toLowerCase()
  if (m === 'incoming' || m === 'both' || m === 'outgoing') return /** @type {Mode} */ (m)
  return 'outgoing'
}

/**
 * @param {unknown} raw
 * @returns {number}
 */
function normalizeMaxNotes(raw) {
  let n = Number(raw)
  if (!Number.isFinite(n) || n < 1) n = DEFAULT_MAX_NOTES
  n = Math.floor(n)
  if (MAX_NOTES_OPTIONS.includes(n)) return n
  // Snap to nearest allowed option.
  let best = DEFAULT_MAX_NOTES
  let bestDist = Infinity
  for (const opt of MAX_NOTES_OPTIONS) {
    const d = Math.abs(opt - n)
    if (d < bestDist) {
      bestDist = d
      best = opt
    }
  }
  return best
}

/**
 * @param {unknown} raw
 * @returns {Settings}
 */
function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_SETTINGS, excludeFolders: [] }
  }
  const obj = /** @type {Record<string, unknown>} */ (raw)

  let cacheTtlMs = Number(obj.cacheTtlMs)
  if (!Number.isFinite(cacheTtlMs) || cacheTtlMs < 0) cacheTtlMs = DEFAULT_CACHE_TTL_MS
  cacheTtlMs = Math.min(3600000, Math.floor(cacheTtlMs))

  return {
    maxNotes: normalizeMaxNotes(obj.maxNotes),
    mode: normalizeMode(obj.mode),
    cacheTtlMs,
    showStatus: obj.showStatus === true,
    excludeFolders: normalizeExcludeFolders(obj.excludeFolders),
  }
}

async function loadSettings() {
  try {
    const stored = await fanotes.storage.get(SETTINGS_KEY)
    settings = normalizeSettings(stored)
    excludeFoldersDraft = formatExcludeFolders(settings.excludeFolders)
  } catch (error) {
    fanotes.log('loadSettings failed', errMessage(error))
    settings = { ...DEFAULT_SETTINGS, excludeFolders: [] }
    excludeFoldersDraft = ''
  }
}

/**
 * @param {Settings} [rollback]
 * @returns {Promise<boolean>}
 */
async function saveSettings(rollback) {
  try {
    await fanotes.storage.set(SETTINGS_KEY, {
      maxNotes: settings.maxNotes,
      mode: settings.mode,
      cacheTtlMs: settings.cacheTtlMs,
      showStatus: settings.showStatus,
      excludeFolders: settings.excludeFolders,
    })
    return true
  } catch (error) {
    if (rollback) {
      settings = { ...rollback, excludeFolders: [...(rollback.excludeFolders || [])] }
      excludeFoldersDraft = formatExcludeFolders(settings.excludeFolders)
    }
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
      const outgoingByPath =
        obj.outgoingByPath && typeof obj.outgoingByPath === 'object'
          ? /** @type {Record<string, string[]>} */ (obj.outgoingByPath)
          : {}
      const titles =
        obj.titles && typeof obj.titles === 'object'
          ? /** @type {Record<string, string>} */ (obj.titles)
          : {}
      cache = {
        updatedAt: typeof obj.updatedAt === 'number' ? obj.updatedAt : 0,
        outgoingByPath,
        titles,
      }
    } else {
      cache = { updatedAt: 0, outgoingByPath: {}, titles: {} }
    }
  } catch (error) {
    fanotes.log('loadCache failed', errMessage(error))
    cache = { updatedAt: 0, outgoingByPath: {}, titles: {} }
  }
}

async function saveCache() {
  try {
    await fanotes.storage.set(CACHE_KEY, {
      updatedAt: cache.updatedAt,
      outgoingByPath: cache.outgoingByPath,
      titles: cache.titles,
    })
  } catch (error) {
    fanotes.log('saveCache failed', errMessage(error))
  }
}

/**
 * Ignore fenced ``` / ~~~ blocks via line-state toggle.
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
 * Extract unique trimmed wikilink targets (fenced code ignored).
 * @param {string} text
 * @returns {string[]}
 */
function extractTargets(text) {
  const body = stripCodeFences(text)
  const seen = new Set()
  /** @type {string[]} */
  const out = []
  WIKILINK_RE.lastIndex = 0
  let match
  while ((match = WIKILINK_RE.exec(body)) !== null) {
    const target = String(match[1] ?? '').trim()
    if (!target) continue
    const key = normKey(target)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(target)
  }
  return out
}

/**
 * Resolve a wikilink target to a note path via the titles map (lowercase keys).
 * @param {string} target
 * @param {Record<string, string>} [titles]
 * @returns {string | null}
 */
function resolveTarget(target, titles = cache.titles) {
  const key = normKey(target)
  if (!key) return null
  return titles[key] || null
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
    if (isExcludedPath(note.path, settings.excludeFolders)) continue
    next[note.path] = {
      title: note.title || basenameNoExt(note.path),
      modifiedAt: note.modifiedAt ?? null,
    }
  }
  metaByPath = next
}

/**
 * Build orphan list from current cache + settings.mode.
 * @returns {View}
 */
function computeOrphans() {
  const paths = Object.keys(cache.outgoingByPath)
  const scanned = paths.length

  /** @type {Set<string>} */
  const hasIncoming = new Set()
  if (settings.mode === 'incoming' || settings.mode === 'both') {
    for (const targets of Object.values(cache.outgoingByPath)) {
      for (const target of targets) {
        const resolved = resolveTarget(target)
        if (resolved && cache.outgoingByPath[resolved] !== undefined) {
          hasIncoming.add(resolved)
        }
      }
    }
  }

  /** @type {OrphanItem[]} */
  const orphans = []
  for (const path of paths) {
    const outgoing = cache.outgoingByPath[path] || []
    const noOutgoing = outgoing.length === 0
    const noIncoming = !hasIncoming.has(path)

    let isOrphan = false
    let reason = ''
    if (settings.mode === 'outgoing') {
      isOrphan = noOutgoing
      reason = t('keine ausgehenden Links', 'no outgoing links')
    } else if (settings.mode === 'incoming') {
      isOrphan = noIncoming
      reason = t('keine eingehenden Links', 'no incoming links')
    } else {
      isOrphan = noOutgoing && noIncoming
      reason = t('keine aus-/eingehenden Links', 'no out-/incoming links')
    }
    if (!isOrphan) continue

    const meta = metaByPath[path]
    orphans.push({
      path,
      title: (meta && meta.title) || basenameNoExt(path),
      modifiedAt: (meta && meta.modifiedAt) || null,
      reason,
    })
  }

  orphans.sort((a, b) => {
    const byTitle = a.title.localeCompare(b.title)
    if (byTitle !== 0) return byTitle
    return a.path.localeCompare(b.path)
  })

  return {
    scanned,
    orphanCount: orphans.length,
    orphans: orphans.slice(0, LIST_CAP),
  }
}

/**
 * Full wikilink-index rebuild (md/markdown only, capped by maxNotes, newest first).
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
      .filter((n) => !isExcludedPath(n.path, settings.excludeFolders))
      .sort((a, b) => String(b.modifiedAt ?? '').localeCompare(String(a.modifiedAt ?? '')))
      .slice(0, settings.maxNotes)

    /** @type {Record<string, { title: string, modifiedAt: string | null }>} */
    const meta = {}
    /** @type {Record<string, string>} */
    const titles = {}
    /** @type {Record<string, string[]>} */
    const outgoingByPath = {}

    for (const note of mdNotes) {
      meta[note.path] = {
        title: note.title || basenameNoExt(note.path),
        modifiedAt: note.modifiedAt ?? null,
      }
      const titleKey = normKey(note.title)
      if (titleKey) titles[titleKey] = note.path
      const baseKey = normKey(basenameNoExt(note.path))
      if (baseKey) titles[baseKey] = note.path
    }

    for (const note of mdNotes) {
      let text = ''
      try {
        text = await fanotes.notes.read(note.path)
      } catch (error) {
        fanotes.log('read failed', note.path, errMessage(error))
        outgoingByPath[note.path] = []
        continue
      }
      outgoingByPath[note.path] = extractTargets(text)
    }

    metaByPath = meta
    cache = {
      updatedAt: Date.now(),
      outgoingByPath,
      titles,
    }
    await saveCache()
    scannedOnce = true

    if (!opts.silent) {
      await fanotes.ui.toast(
        t(
          `Scan aktualisiert (${mdNotes.length} Notizen).`,
          `Scan updated (${mdNotes.length} notes).`,
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
    view = computeOrphans()
    await refreshPanel()
    await updateStatus()
    if (scanQueued) {
      scanQueued = false
      void rescan({ silent: true })
    }
  }
}

/**
 * Ensure index: rebuild if forced, missing, or older than TTL.
 * @param {{ force?: boolean, silent?: boolean }} [opts]
 */
async function ensureIndex(opts = {}) {
  const force = opts.force === true
  if (!force && cacheIsFresh() && Object.keys(cache.outgoingByPath).length > 0) {
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
 * Status `📭 N` only when showStatus && scannedOnce (N = orphan count).
 */
async function updateStatus() {
  try {
    if (!settings.showStatus || !scannedOnce) {
      await fanotes.ui.status.remove(STATUS_ID)
      return
    }
    const n = view ? view.orphanCount : 0
    await fanotes.ui.status.set({
      id: STATUS_ID,
      text: `📭 ${n}`,
      title: t('Verwaiste Notizen öffnen', 'Open Orphan Notes'),
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

function modeLabel(mode) {
  if (mode === 'incoming') return t('Nur eingehend', 'Incoming only')
  if (mode === 'both') return t('Beides (echt verwaist)', 'Both (true orphans)')
  return t('Nur ausgehend', 'Outgoing only')
}

function renderBlocks() {
  const scanned = view ? view.scanned : Object.keys(cache.outgoingByPath).length
  const orphanCount = view ? view.orphanCount : 0
  const listItems = view
    ? view.orphans.map((item) => ({
        id: item.path,
        title: item.title,
        detail: `${item.reason} · ${item.path}`,
        badge: '📭',
      }))
    : []

  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Verwaiste Notizen', 'Orphan Notes'), level: 2 },
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
      type: 'keyvalue',
      items: [
        { key: t('Gescannt', 'Scanned'), value: String(scanned) },
        { key: t('Verwaist', 'Orphans'), value: String(orphanCount) },
        {
          key: t('Index', 'Index'),
          value: `${Object.keys(cache.outgoingByPath).length} / ${settings.maxNotes}`,
        },
        { key: t('Zuletzt', 'Updated'), value: formatUpdatedAt(cache.updatedAt) },
      ],
    },
    {
      type: 'select',
      id: 'mode',
      label: t('Modus', 'Mode'),
      value: settings.mode,
      options: [
        { value: 'outgoing', label: modeLabel('outgoing') },
        { value: 'incoming', label: modeLabel('incoming') },
        { value: 'both', label: modeLabel('both') },
      ],
    },
    {
      type: 'select',
      id: 'maxNotes',
      label: t('Max. Notizen', 'Max notes'),
      value: String(settings.maxNotes),
      options: MAX_NOTES_OPTIONS.map((n) => ({ value: String(n), label: String(n) })),
    },
    {
      type: 'list',
      id: 'orphans',
      empty: scannedOnce
        ? t('Keine verwaisten Notizen in diesem Modus.', 'No orphan notes in this mode.')
        : t('Noch nicht gescannt – „Aktualisieren“ tippen.', 'Not scanned yet – tap “Refresh”.'),
      items: listItems,
    },
    { type: 'divider' },
    {
      type: 'input',
      id: 'excludeFolders',
      label: t('Ordner ausschließen (Komma)', 'Exclude folders (comma)'),
      value: excludeFoldersDraft,
      placeholder: t('z. B. Archiv, Templates', 'e.g. Archive, Templates'),
    },
    {
      type: 'checkbox',
      id: 'showStatus',
      label: t('Statusleiste 📭 N anzeigen', 'Show status bar 📭 N'),
      checked: settings.showStatus === true,
    },
    {
      type: 'text',
      muted: true,
      text: t(
        `Caps: Index ≤ ${settings.maxNotes} · Liste ≤ ${LIST_CAP} · Cache-TTL ${Math.round(settings.cacheTtlMs / 1000)} s · fenced \`\`\`/\`~~~\` ignoriert · kein PDF.`,
        `Caps: index ≤ ${settings.maxNotes} · list ≤ ${LIST_CAP} · cache TTL ${Math.round(settings.cacheTtlMs / 1000)} s · fenced \`\`\`/\`~~~\` ignored · no PDF.`,
      ),
    },
  ]

  return blocks
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Verwaiste Notizen', 'Orphan Notes'))
  } catch (error) {
    if (isNoPanel(error)) {
      panel = null
      return
    }
    fanotes.log('refreshPanel', errMessage(error))
  }
}

/**
 * Open panel + ensure index + compute orphans (scan-gate entry).
 * @param {{ silent?: boolean }} [opts]
 */
async function openAndRefresh(opts = {}) {
  const silent = opts.silent !== false
  await ensureIndex({ silent: true })
  view = computeOrphans()
  await refreshPanel()
  await updateStatus()
  if (!silent && view) {
    await fanotes.ui.toast(
      t(
        `${view.orphanCount} verwaiste Notiz(en).`,
        `${view.orphanCount} orphan note(s).`,
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
      title: t('Verwaiste Notizen', 'Orphan Notes'),
      icon: '📭',
      blocks: renderBlocks(),
      focus: true,
    })

    panel.onAction(async (action) => {
      try {
        if (action.id === 'refresh' || action.id === 'submit:excludeFolders') {
          const values = action.values || {}
          if (values.excludeFolders != null) {
            excludeFoldersDraft = String(values.excludeFolders)
            const rollback = {
              ...settings,
              excludeFolders: [...settings.excludeFolders],
            }
            settings.excludeFolders = parseExcludeFoldersText(excludeFoldersDraft)
            excludeFoldersDraft = formatExcludeFolders(settings.excludeFolders)
            const ok = await saveSettings(rollback)
            if (!ok) {
              await refreshPanel()
              return
            }
          }
          if (action.id === 'refresh') {
            await rescan({ silent: false })
          } else {
            await rescan({ silent: true })
          }
          return
        }
        if (action.id === 'orphans' && action.itemId) {
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
        if (input.id === 'mode') {
          const prev = settings.mode
          const rollback = {
            ...settings,
            excludeFolders: [...settings.excludeFolders],
          }
          settings.mode = normalizeMode(input.value)
          const ok = await saveSettings(rollback)
          if (!ok) {
            settings.mode = prev
            await refreshPanel()
            return
          }
          view = computeOrphans()
          await refreshPanel()
          await updateStatus()
          return
        }
        if (input.id === 'maxNotes') {
          const prev = settings.maxNotes
          const rollback = {
            ...settings,
            excludeFolders: [...settings.excludeFolders],
          }
          settings.maxNotes = normalizeMaxNotes(input.value)
          const ok = await saveSettings(rollback)
          if (!ok) {
            settings.maxNotes = prev
            await refreshPanel()
            return
          }
          // Cap changed → force rebuild.
          await rescan({ silent: true })
          return
        }
        if (input.id === 'excludeFolders') {
          excludeFoldersDraft = String(input.value ?? '')
          return
        }
        if (input.id === 'showStatus') {
          const prev = settings.showStatus
          const rollback = {
            ...settings,
            excludeFolders: [...settings.excludeFolders],
          }
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
 * Command: open the first orphan (alphabetically by title).
 */
async function openFirstOrphan() {
  try {
    await ensureIndex({ silent: true })
    view = computeOrphans()
    await refreshPanel()
    await updateStatus()

    if (!view || !view.orphans.length) {
      await fanotes.ui.toast(
        t('Keine verwaisten Notizen gefunden.', 'No orphan notes found.'),
        'info',
      )
      return
    }

    const first = view.orphans[0]
    try {
      await fanotes.notes.open(first.path)
      await fanotes.ui.toast(
        t(`Geöffnet: ${first.title}`, `Opened: ${first.title}`),
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
  title: t('Verwaiste Notizen öffnen', 'Open Orphan Notes'),
  detail: t(
    'Panel mit Notizen ohne Wikilinks (ausgehend / eingehend / beides)',
    'Panel of notes without wikilinks (outgoing / incoming / both)',
  ),
  keywords: 'orphan verwaist unlinked wikilink panel öffnen open notizen notes einsam',
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
  title: t('Verwaist-Scan neu aufbauen', 'Rebuild orphan scan'),
  detail: t(
    'Markdown-Notizen (bis maxNotes) erneut lesen und Orphans berechnen',
    'Re-read Markdown notes (up to maxNotes) and compute orphans',
  ),
  keywords: 'orphan verwaist rescan neu einlesen rebuild scan wikilink unlinked',
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
  title: t('Erste verwaiste Notiz öffnen', 'Open first orphan'),
  detail: t(
    'Erste verwaiste Notiz der Liste öffnen (Titel A–Z)',
    'Open the first orphan in the list (title A–Z)',
  ),
  keywords: 'orphan verwaist first erste öffnen open unlinked wikilink',
  run: async () => {
    try {
      await openFirstOrphan()
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
      'orphan-notes activated',
      fanotes.app.appVersion,
      settings.maxNotes,
      settings.mode,
      settings.cacheTtlMs,
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
  try {
    await fanotes.ui.status.remove(STATUS_ID)
  } catch {
    // Host tears down UI; ignore.
  }
  panel = null
  view = null
})
