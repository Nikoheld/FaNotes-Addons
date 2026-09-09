/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Wikilink-Karte / Wikilink Map – backlinks, outgoing links and missing
// targets for the active note (indexed wikilinks, no full graph viz).

const CACHE_KEY = 'cache'
const SETTINGS_KEY = 'settings'
const PANEL_ID = 'map'
const WIKILINK_RE = /\[\[([^\]|#]+?)(?:#[^\]|]*)?(?:\|[^\]]+)?\]\]/gu
const DEFAULT_MAX_NOTES = 400
const DEBOUNCE_MS = 1500

/**
 * @typedef {{
 *   maxNotes: number,
 *   autoRefresh: boolean,
 * }} Settings
 */

/**
 * @typedef {{
 *   updatedAt: number,
 *   byNote: Record<string, string[]>,
 *   titles: Record<string, string>,
 * }} Cache
 */

/**
 * @typedef {{
 *   path: string,
 *   title: string,
 *   backlinks: Array<{ path: string, title: string }>,
 *   outgoing: Array<{ target: string, path: string, title: string }>,
 *   missing: string[],
 * }} View
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  maxNotes: DEFAULT_MAX_NOTES,
  autoRefresh: true,
}

/** @type {Settings} */
let settings = { ...DEFAULT_SETTINGS }

/** @type {Cache} */
let cache = { updatedAt: 0, byNote: {}, titles: {} }

/** @type {FaNotes.Panel | null} */
let panel = null

/** @type {View | null} */
let view = null

let scanning = false
/** @type {ReturnType<typeof setTimeout> | 0} */
let debounceTimer = 0
/** Queue another full scan if note:saved arrived while busy. */
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

/** Lowercase trim key for title / basename maps. */
function normKey(raw) {
  return String(raw ?? '').trim().toLowerCase()
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
 * Extract unique trimmed wikilink targets from markdown text.
 * @param {string} text
 * @returns {string[]}
 */
function extractTargets(text) {
  const seen = new Set()
  /** @type {string[]} */
  const out = []
  WIKILINK_RE.lastIndex = 0
  let match
  while ((match = WIKILINK_RE.exec(text)) !== null) {
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
 * Resolve a wikilink target to a note path via the titles map.
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
 * Safe display name for create: last path segment, no extension / `..`.
 * @param {string} target
 * @returns {string | null}
 */
function createNameFromTarget(target) {
  let name = String(target ?? '').trim().replace(/\\/g, '/')
  if (!name) return null
  const parts = name.split('/').filter(Boolean)
  if (!parts.length || parts.some((p) => p === '.' || p === '..')) return null
  name = parts[parts.length - 1]
  name = name.replace(/\.(md|markdown)$/iu, '')
  if (!name) return null
  return name
}

async function loadSettings() {
  try {
    const stored = await fanotes.storage.get(SETTINGS_KEY)
    if (stored && typeof stored === 'object') {
      const obj = /** @type {Record<string, unknown>} */ (stored)
      let maxNotes = Number(obj.maxNotes)
      if (!Number.isFinite(maxNotes) || maxNotes < 1) maxNotes = DEFAULT_MAX_NOTES
      maxNotes = Math.min(2000, Math.floor(maxNotes))
      settings = {
        maxNotes,
        autoRefresh: obj.autoRefresh !== false,
      }
    } else {
      settings = { ...DEFAULT_SETTINGS }
    }
  } catch (error) {
    fanotes.log('loadSettings failed', errMessage(error))
    settings = { ...DEFAULT_SETTINGS }
  }
}

async function saveSettings() {
  try {
    await fanotes.storage.set(SETTINGS_KEY, settings)
  } catch (error) {
    fanotes.log('saveSettings failed', errMessage(error))
  }
}

async function loadCache() {
  try {
    const stored = await fanotes.storage.get(CACHE_KEY)
    if (stored && typeof stored === 'object') {
      const obj = /** @type {Record<string, unknown>} */ (stored)
      const byNote =
        obj.byNote && typeof obj.byNote === 'object'
          ? /** @type {Record<string, string[]>} */ (obj.byNote)
          : {}
      const titles =
        obj.titles && typeof obj.titles === 'object'
          ? /** @type {Record<string, string>} */ (obj.titles)
          : {}
      cache = {
        updatedAt: typeof obj.updatedAt === 'number' ? obj.updatedAt : 0,
        byNote,
        titles,
      }
    } else {
      cache = { updatedAt: 0, byNote: {}, titles: {} }
    }
  } catch (error) {
    fanotes.log('loadCache failed', errMessage(error))
    cache = { updatedAt: 0, byNote: {}, titles: {} }
  }
}

async function saveCache() {
  try {
    await fanotes.storage.set(CACHE_KEY, cache)
  } catch (error) {
    fanotes.log('saveCache failed', errMessage(error))
  }
}

/**
 * Build panel view for the active note from the current cache.
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

  const path = active.path
  const title = active.title || basenameNoExt(path)
  const outgoingRaw = cache.byNote[path] || []
  /** @type {Array<{ target: string, path: string, title: string }>} */
  const outgoing = []
  /** @type {string[]} */
  const missing = []
  const missingSeen = new Set()

  for (const target of outgoingRaw) {
    const resolved = resolveTarget(target)
    if (resolved) {
      outgoing.push({
        target,
        path: resolved,
        title: basenameNoExt(resolved),
      })
    } else {
      const key = normKey(target)
      if (!missingSeen.has(key)) {
        missingSeen.add(key)
        missing.push(target)
      }
    }
  }

  // Prefer display titles from the titles map inverse when possible.
  for (const item of outgoing) {
    // Keep basename as fallback; title map keys are normalised so we cannot
    // recover original casing easily – basename is honest enough.
    item.title = basenameNoExt(item.path)
  }

  /** @type {Array<{ path: string, title: string }>} */
  const backlinks = []
  const selfKeys = new Set([normKey(title), normKey(basenameNoExt(path))])
  // Also treat any titles map entry pointing at this path as “self”.
  for (const [key, p] of Object.entries(cache.titles)) {
    if (p === path) selfKeys.add(key)
  }

  for (const [fromPath, targets] of Object.entries(cache.byNote)) {
    if (fromPath === path) continue
    let linksHere = false
    for (const target of targets) {
      const resolved = resolveTarget(target)
      if (resolved === path) {
        linksHere = true
        break
      }
      // Fallback: target normalises to one of our self keys (title/basename).
      if (!resolved && selfKeys.has(normKey(target))) {
        linksHere = true
        break
      }
    }
    if (linksHere) {
      backlinks.push({ path: fromPath, title: basenameNoExt(fromPath) })
    }
  }

  backlinks.sort((a, b) => a.title.localeCompare(b.title))
  outgoing.sort((a, b) => a.target.localeCompare(b.target))
  missing.sort((a, b) => a.localeCompare(b))

  return { path, title, backlinks, outgoing, missing }
}

/**
 * Full vault index rebuild (md/markdown only, capped by maxNotes).
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
      .slice(0, settings.maxNotes)

    /** @type {Record<string, string>} */
    const titles = {}
    for (const note of mdNotes) {
      const titleKey = normKey(note.title)
      if (titleKey) titles[titleKey] = note.path
      const baseKey = normKey(basenameNoExt(note.path))
      if (baseKey) titles[baseKey] = note.path
    }

    /** @type {Record<string, string[]>} */
    const byNote = {}
    for (const note of mdNotes) {
      let text = ''
      try {
        text = await fanotes.notes.read(note.path)
      } catch (error) {
        fanotes.log('read failed', note.path, errMessage(error))
        byNote[note.path] = []
        continue
      }
      byNote[note.path] = extractTargets(text)
    }

    cache = {
      updatedAt: Date.now(),
      byNote,
      titles,
    }
    await saveCache()

    view = await computeView()
    if (!opts.silent) {
      await fanotes.ui.toast(
        t(
          `Index aktualisiert (${mdNotes.length} Notizen).`,
          `Index updated (${mdNotes.length} notes).`,
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

function scheduleRescan() {
  if (!settings.autoRefresh) return
  if (!panel) return
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = 0
    void rescan({ silent: true })
  }, DEBOUNCE_MS)
}

/**
 * Stale-safe create: re-check resolution / existence, confirm, create, open, rescan.
 * @param {string} target
 */
async function createMissingNote(target) {
  const trimmed = String(target ?? '').trim()
  if (!trimmed) return

  const name = createNameFromTarget(trimmed)
  if (!name) {
    await fanotes.ui.toast(
      t(
        'Ungültiger Zielname (kein „..“, kein leerer Name).',
        'Invalid target name (no “..”, no empty name).',
      ),
      'error',
    )
    return
  }

  // Stale-Schutz: resolve again against a fresh titles snapshot.
  try {
    const notes = await fanotes.notes.list()
    const mdNotes = notes.filter((n) => /\.(md|markdown)$/iu.test(n.path))
    /** @type {Record<string, string>} */
    const freshTitles = {}
    for (const note of mdNotes) {
      const titleKey = normKey(note.title)
      if (titleKey) freshTitles[titleKey] = note.path
      const baseKey = normKey(basenameNoExt(note.path))
      if (baseKey) freshTitles[baseKey] = note.path
    }
    const existing = resolveTarget(trimmed, freshTitles)
    if (existing) {
      await fanotes.ui.toast(
        t(
          `Ziel existiert bereits: ${existing}`,
          `Target already exists: ${existing}`,
        ),
        'info',
      )
      try {
        await fanotes.notes.open(existing)
      } catch (error) {
        await fanotes.ui.toast(
          t(`Öffnen fehlgeschlagen: ${errMessage(error)}`, `Open failed: ${errMessage(error)}`),
          'error',
        )
      }
      await rescan({ silent: true })
      return
    }
  } catch (error) {
    await fanotes.ui.toast(
      t(`Prüfung fehlgeschlagen: ${errMessage(error)}`, `Existence check failed: ${errMessage(error)}`),
      'error',
    )
    return
  }

  const ok = await fanotes.ui.confirm(
    t(
      `Notiz „${name}“ für fehlendes Wikilink-Ziel „${trimmed}“ anlegen und öffnen?`,
      `Create and open note “${name}” for missing wikilink target “${trimmed}”?`,
    ),
    {
      title: t('Fehlende Notiz anlegen', 'Create missing note'),
      confirmLabel: t('Anlegen', 'Create'),
    },
  )
  if (!ok) return

  try {
    const created = await fanotes.notes.create({
      name,
      content: t(
        `# ${name}\n\nAngelegt über Wikilink-Karte.\n`,
        `# ${name}\n\nCreated via Wikilink Map.\n`,
      ),
    })
    fanotes.log('created missing note', created)
    await fanotes.ui.toast(
      t(`Notiz angelegt: ${created}`, `Note created: ${created}`),
      'success',
    )
    try {
      await fanotes.notes.open(created)
    } catch (error) {
      await fanotes.ui.toast(
        t(`Öffnen fehlgeschlagen: ${errMessage(error)}`, `Open failed: ${errMessage(error)}`),
        'error',
      )
    }
    await rescan({ silent: true })
  } catch (error) {
    await fanotes.ui.toast(
      t(`Anlegen fehlgeschlagen: ${errMessage(error)}`, `Create failed: ${errMessage(error)}`),
      'error',
    )
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
    { type: 'heading', text: t('Wikilink-Karte', 'Wikilink Map'), level: 2 },
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
  ]

  if (!view) {
    blocks.push({
      type: 'keyvalue',
      items: [
        { key: t('Backlinks', 'Backlinks'), value: '–' },
        { key: t('Ausgehend', 'Outgoing'), value: '–' },
        { key: t('Fehlend', 'Missing'), value: '–' },
        {
          key: t('Index', 'Index'),
          value: String(Object.keys(cache.byNote).length),
        },
        { key: t('Zuletzt', 'Updated'), value: formatUpdatedAt(cache.updatedAt) },
      ],
    })
    blocks.push({
      type: 'callout',
      tone: 'info',
      text: t(
        'Keine aktive Markdown-Notiz. Öffne eine Notiz, dann „Neu einlesen“.',
        'No active Markdown note. Open a note, then “Rescan”.',
      ),
    })
  } else {
    blocks.push({
      type: 'text',
      muted: true,
      text: t(`Aktiv: ${view.title}`, `Active: ${view.title}`),
    })
    blocks.push({
      type: 'keyvalue',
      items: [
        { key: t('Backlinks', 'Backlinks'), value: view.backlinks.length },
        { key: t('Ausgehend', 'Outgoing'), value: view.outgoing.length },
        { key: t('Fehlend', 'Missing'), value: view.missing.length },
        {
          key: t('Index', 'Index'),
          value: `${Object.keys(cache.byNote).length} / ${settings.maxNotes}`,
        },
        { key: t('Zuletzt', 'Updated'), value: formatUpdatedAt(cache.updatedAt) },
      ],
    })
    blocks.push({ type: 'divider' })
    blocks.push({
      type: 'heading',
      text: t('Backlinks', 'Backlinks'),
      level: 3,
    })
    blocks.push({
      type: 'list',
      id: 'backlinks',
      empty: t('Keine Backlinks.', 'No backlinks.'),
      items: view.backlinks.slice(0, 200).map((item) => ({
        id: item.path,
        title: item.title,
        detail: item.path,
      })),
    })
    blocks.push({
      type: 'heading',
      text: t('Ausgehende Links', 'Outgoing links'),
      level: 3,
    })
    blocks.push({
      type: 'list',
      id: 'outgoing',
      empty: t('Keine aufgelösten ausgehenden Links.', 'No resolved outgoing links.'),
      items: view.outgoing.slice(0, 200).map((item) => ({
        id: item.path,
        title: item.target,
        detail: item.path,
        badge: '→',
      })),
    })
    blocks.push({
      type: 'heading',
      text: t('Fehlende Ziele', 'Missing targets'),
      level: 3,
    })
    blocks.push({
      type: 'list',
      id: 'missing',
      empty: t('Keine fehlenden Ziele.', 'No missing targets.'),
      items: view.missing.slice(0, 200).map((target) => ({
        id: target,
        title: target,
        detail: t('Klick → anlegen', 'Click → create'),
        badge: '?',
      })),
    })
  }

  blocks.push({ type: 'divider' })
  blocks.push({
    type: 'input',
    id: 'maxNotes',
    label: t('Max. Notizen im Index', 'Max notes in index'),
    value: String(settings.maxNotes),
    placeholder: String(DEFAULT_MAX_NOTES),
  })
  blocks.push({
    type: 'checkbox',
    id: 'autoRefresh',
    label: t(
      'Bei Speichern automatisch neu einlesen (Panel offen)',
      'Auto-rescan on save (while panel open)',
    ),
    checked: settings.autoRefresh,
  })
  blocks.push({
    type: 'callout',
    tone: 'info',
    text: t(
      `Index höchstens ${settings.maxNotes} Markdown-Notizen. Keine Graph-Visualisierung – nur Listen für die aktive Notiz. notes:write nur zum Anlegen fehlender Ziele nach Bestätigung.`,
      `Index caps at ${settings.maxNotes} Markdown notes. No graph visualization – lists for the active note only. notes:write is used only to create missing targets after confirm.`,
    ),
  })

  return blocks
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Wikilink-Karte', 'Wikilink Map'))
  } catch (error) {
    if (isNoPanel(error)) {
      panel = null
      return
    }
    fanotes.log('refreshPanel', errMessage(error))
  }
}

async function refreshViewFromCache() {
  try {
    view = await computeView()
    await refreshPanel()
  } catch (error) {
    fanotes.log('refreshViewFromCache', errMessage(error))
  }
}

async function openNotePath(path) {
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
        view = await computeView()
        await refreshPanel()
        if (!cache.updatedAt) await rescan({ silent: true })
      })()
      return
    }

    panel = fanotes.ui.panel({
      id: PANEL_ID,
      title: t('Wikilink-Karte', 'Wikilink Map'),
      icon: '🔗',
      blocks: renderBlocks(),
      focus: true,
    })

    panel.onAction(async (action) => {
      try {
        if (action.id === 'rescan' || action.id === 'submit:maxNotes') {
          const values = action.values || {}
          if (values.maxNotes != null) {
            let n = Number(String(values.maxNotes).trim())
            if (!Number.isFinite(n) || n < 1) n = DEFAULT_MAX_NOTES
            settings.maxNotes = Math.min(2000, Math.floor(n))
            await saveSettings()
          }
          if (action.id === 'rescan') await rescan({ silent: false })
          else await refreshPanel()
          return
        }
        if (action.id === 'backlinks' && action.itemId) {
          await openNotePath(String(action.itemId))
          return
        }
        if (action.id === 'outgoing' && action.itemId) {
          await openNotePath(String(action.itemId))
          return
        }
        if (action.id === 'missing' && action.itemId) {
          await createMissingNote(String(action.itemId))
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
        if (input.id === 'autoRefresh') {
          settings.autoRefresh = input.value === true
          await saveSettings()
          await refreshPanel()
        }
      } catch (error) {
        fanotes.log('onInput', errMessage(error))
      }
    })

    void (async () => {
      try {
        view = await computeView()
        await refreshPanel()
        if (!cache.updatedAt) await rescan({ silent: true })
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

/**
 * Command: confirm + create a missing target for the active note.
 */
async function createMissingCommand() {
  try {
    if (!cache.updatedAt) {
      await rescan({ silent: true })
    } else {
      view = await computeView()
    }
    if (!view) {
      await fanotes.ui.toast(
        t('Keine aktive Markdown-Notiz.', 'No active Markdown note.'),
        'info',
      )
      return
    }
    if (!view.missing.length) {
      await fanotes.ui.toast(
        t('Keine fehlenden Wikilink-Ziele.', 'No missing wikilink targets.'),
        'info',
      )
      return
    }

    let target = view.missing[0]
    if (view.missing.length > 1) {
      const preview = view.missing.slice(0, 12).join('\n')
      const picked = await fanotes.ui.prompt(
        t(
          `Mehrere fehlende Ziele – welches anlegen?\n\n${preview}`,
          `Several missing targets – which one to create?\n\n${preview}`,
        ),
        {
          title: t('Fehlende Notiz anlegen', 'Create missing note'),
          placeholder: t('Zielname', 'Target name'),
          value: view.missing[0],
        },
      )
      if (picked === null) return
      const trimmed = picked.trim()
      if (!trimmed) return
      const found = view.missing.find((m) => normKey(m) === normKey(trimmed))
      if (!found) {
        await fanotes.ui.toast(
          t(
            'Name steht nicht in der Fehlend-Liste der aktiven Notiz.',
            'Name is not in the active note’s missing list.',
          ),
          'error',
        )
        return
      }
      target = found
    }

    await createMissingNote(target)
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
  title: t('Wikilink-Karte öffnen', 'Open Wikilink Map'),
  detail: t(
    'Backlinks, ausgehende Links und fehlende Ziele der aktiven Notiz',
    'Backlinks, outgoing links and missing targets for the active note',
  ),
  keywords: 'wikilink backlink rücklink karte map links fehlend missing notizen notes index outgoing',
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
  title: t('Wikilink-Index neu aufbauen', 'Rebuild wikilink index'),
  detail: t(
    'Alle Markdown-Notizen (bis maxNotes) erneut einlesen',
    'Re-read all Markdown notes (up to maxNotes)',
  ),
  keywords: 'wikilink rescan neu einlesen index rebuild scan map links',
  run: async () => {
    try {
      await rescan({ silent: false })
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'create-missing',
  title: t('Fehlende Wikilink-Notiz anlegen', 'Create missing wikilink note'),
  detail: t(
    'Fehlendes Ziel der aktiven Notiz nach Bestätigung anlegen und öffnen',
    'Create and open a missing target of the active note after confirm',
  ),
  keywords: 'wikilink fehlend missing anlegen create notiz note target',
  run: async () => {
    try {
      await createMissingCommand()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.onActivate(async () => {
  try {
    await loadSettings()
    await loadCache()
    fanotes.log(
      'wikilink-map activated',
      fanotes.app.appVersion,
      settings.maxNotes,
      cache.updatedAt,
    )

    fanotes.events.on('note:opened', () => {
      if (!panel) return
      void refreshViewFromCache()
    })

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
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(async () => {
  clearTimeout(debounceTimer)
  debounceTimer = 0
  scanning = false
  scanQueued = false
  panel = null
  view = null
  // No status bar item is used; nothing to remove.
})
