/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Gespeicherte Suchen / Saved Searches – save vault full-text queries
// (max 30), re-run with maxHits (1–200, default 50), panel hits list.
// Activate: load storage only — no notes.search on activate.

const STORAGE_KEY = 'data'
const PANEL_ID = 'searches'
const MAX_SEARCHES = 30
const DEFAULT_MAX_HITS = 50
const MAX_TITLE = 200
const MAX_QUERY = 500
const MAX_HITS_OPTIONS = [10, 25, 50, 100, 200]

/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   query: string,
 *   createdAt: string,
 * }} SavedSearch
 */

/**
 * @typedef {{ lastId: string | null, maxHits: number }} Settings
 */

/**
 * @typedef {{ searches: SavedSearch[], settings: Settings }} Store
 */

/** @type {Store} */
let store = {
  searches: [],
  settings: { lastId: null, maxHits: DEFAULT_MAX_HITS },
}

/** @type {string | null} */
let selectedId = null

/** @type {FaNotes.SearchHit[]} */
let hits = []

/** @type {string | null} */
let lastRunQuery = null

/** @type {FaNotes.Panel | null} */
let panel = null

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

/** IDs: `s-` + Date.now() + `-` + 4 random base36 chars. */
function newId() {
  const rand4 = Math.random().toString(36).slice(2, 6).padEnd(4, '0')
  return `s-${Date.now()}-${rand4}`
}

function nowIso() {
  return new Date().toISOString()
}

/**
 * Clamp maxHits to 1–200 integer.
 * @param {unknown} raw
 * @param {number} [fallback]
 */
function clampMaxHits(raw, fallback = DEFAULT_MAX_HITS) {
  let n = Number(raw)
  if (!Number.isFinite(n)) n = fallback
  n = Math.floor(n)
  if (n < 1) n = 1
  if (n > 200) n = 200
  return n
}

/**
 * @param {unknown} raw
 * @returns {SavedSearch | null}
 */
function normalizeSearch(raw) {
  if (!raw || typeof raw !== 'object') return null
  const obj = /** @type {Record<string, unknown>} */ (raw)
  const id = obj.id != null ? String(obj.id).trim() : ''
  const title = obj.title != null ? String(obj.title).trim() : ''
  const query = obj.query != null ? String(obj.query).trim() : ''
  if (!id || !title || !query) return null

  let createdAt = nowIso()
  if (typeof obj.createdAt === 'number' && Number.isFinite(obj.createdAt)) {
    createdAt = new Date(obj.createdAt).toISOString()
  } else if (typeof obj.createdAt === 'string' && obj.createdAt.trim()) {
    const tms = Date.parse(obj.createdAt)
    if (Number.isFinite(tms)) createdAt = new Date(tms).toISOString()
  }

  return {
    id,
    title: title.slice(0, MAX_TITLE),
    query: query.slice(0, MAX_QUERY),
    createdAt,
  }
}

/**
 * @param {unknown} raw
 * @returns {Settings}
 */
function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') {
    return { lastId: null, maxHits: DEFAULT_MAX_HITS }
  }
  const obj = /** @type {Record<string, unknown>} */ (raw)
  let lastId = null
  if (obj.lastId != null && String(obj.lastId).trim()) {
    lastId = String(obj.lastId).trim()
  }
  return {
    lastId,
    maxHits: clampMaxHits(obj.maxHits, DEFAULT_MAX_HITS),
  }
}

/** Snapshot for rollback after failed persist. */
function cloneStore() {
  return {
    searches: store.searches.map((s) => ({ ...s })),
    settings: { ...store.settings },
  }
}

/**
 * Persist whole store; on failure restore `rollback` when provided.
 * @param {Store} [rollback]
 * @returns {Promise<boolean>}
 */
async function persistStore(rollback) {
  try {
    await fanotes.storage.set(STORAGE_KEY, {
      searches: store.searches,
      settings: store.settings,
    })
    return true
  } catch (error) {
    if (rollback) {
      store = {
        searches: rollback.searches.map((s) => ({ ...s })),
        settings: { ...rollback.settings },
      }
    }
    await fanotes.ui.toast(
      t(`Speichern fehlgeschlagen: ${errMessage(error)}`, `Save failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

async function loadStore() {
  try {
    const raw = await fanotes.storage.get(STORAGE_KEY)
    if (raw && typeof raw === 'object') {
      const obj = /** @type {Record<string, unknown>} */ (raw)
      const list = Array.isArray(obj.searches) ? obj.searches : []
      /** @type {SavedSearch[]} */
      const searches = []
      for (const entry of list) {
        const n = normalizeSearch(entry)
        if (!n) continue
        searches.push(n)
        if (searches.length >= MAX_SEARCHES) break
      }
      const settings = normalizeSettings(obj.settings)
      if (settings.lastId && !searches.some((s) => s.id === settings.lastId)) {
        settings.lastId = null
      }
      store = { searches, settings }
    } else {
      store = {
        searches: [],
        settings: { lastId: null, maxHits: DEFAULT_MAX_HITS },
      }
    }
  } catch (error) {
    fanotes.log('loadStore failed', errMessage(error))
    store = {
      searches: [],
      settings: { lastId: null, maxHits: DEFAULT_MAX_HITS },
    }
  }

  if (selectedId && !store.searches.some((s) => s.id === selectedId)) {
    selectedId = null
  }
  if (!selectedId && store.settings.lastId) {
    selectedId = store.settings.lastId
  }
}

/**
 * @param {string} id
 * @returns {SavedSearch | null}
 */
function findSearch(id) {
  return store.searches.find((s) => s.id === id) ?? null
}

/** Newest createdAt first. */
function searchesSorted() {
  return store.searches.slice().sort((a, b) => {
    if (a.createdAt !== b.createdAt) return b.createdAt.localeCompare(a.createdAt)
    return b.id.localeCompare(a.id)
  })
}

/**
 * @param {string} text
 * @param {number} max
 */
function preview(text, max) {
  const one = String(text ?? '').replace(/\s+/gu, ' ').trim()
  if (!one) return ''
  if (one.length <= max) return one
  return `${one.slice(0, max - 1)}…`
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Gespeicherte Suchen', 'Saved Searches'))
  } catch (error) {
    if (isNoPanel(error)) {
      panel = null
      return
    }
    fanotes.log('refreshPanel', errMessage(error))
  }
}

/**
 * Run full-text search, update hits, refresh panel.
 * Optionally bind to a saved search id (sets lastId + selectedId).
 * @param {string} query
 * @param {{ searchId?: string | null, openPanel?: boolean }} [opts]
 */
async function runSearch(query, opts) {
  const q = String(query ?? '').trim()
  if (!q) {
    await fanotes.ui.toast(
      t('Leere Suchanfrage.', 'Empty search query.'),
      'info',
    )
    return false
  }

  const searchId = opts && opts.searchId != null ? opts.searchId : null
  const shouldOpen = !opts || opts.openPanel !== false

  if (shouldOpen) openPanel()

  try {
    const rawHits = await fanotes.notes.search(q)
    const list = Array.isArray(rawHits) ? rawHits : []
    const maxHits = clampMaxHits(store.settings.maxHits)
    hits = list.slice(0, maxHits)
    lastRunQuery = q

    if (searchId && findSearch(searchId)) {
      selectedId = searchId
      const prev = cloneStore()
      store.settings.lastId = searchId
      const ok = await persistStore(prev)
      if (!ok) {
        selectedId = prev.settings.lastId
        await refreshPanel()
        return false
      }
    }

    await refreshPanel()

    if (hits.length === 0) {
      await fanotes.ui.toast(
        t('Keine Treffer.', 'No hits.'),
        'info',
      )
    }
    return true
  } catch (error) {
    hits = []
    lastRunQuery = q
    await refreshPanel()
    await fanotes.ui.toast(
      t(`Suche fehlgeschlagen: ${errMessage(error)}`, `Search failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

async function runLast() {
  const id = store.settings.lastId
  if (!id) {
    await fanotes.ui.toast(
      t('Keine letzte Suche gespeichert.', 'No last search saved.'),
      'info',
    )
    return
  }
  const item = findSearch(id)
  if (!item) {
    const prev = cloneStore()
    store.settings.lastId = null
    await persistStore(prev)
    await fanotes.ui.toast(
      t('Letzte Suche nicht mehr vorhanden.', 'Last search no longer exists.'),
      'info',
    )
    await refreshPanel()
    return
  }
  selectedId = item.id
  await runSearch(item.query, { searchId: item.id })
}

async function runSelected() {
  const item = selectedId ? findSearch(selectedId) : null
  if (!item) {
    await fanotes.ui.toast(
      t('Keine Suche ausgewählt.', 'No search selected.'),
      'info',
    )
    return
  }
  await runSearch(item.query, { searchId: item.id })
}

/**
 * Prompt title + query, save (prepend), set lastId, run.
 */
async function savePrompt() {
  try {
    if (store.searches.length >= MAX_SEARCHES) {
      await fanotes.ui.toast(
        t(
          `Maximal ${MAX_SEARCHES} gespeicherte Suchen.`,
          `Maximum ${MAX_SEARCHES} saved searches.`,
        ),
        'error',
      )
      return
    }

    const titleRaw = await fanotes.ui.prompt(
      t('Titel der Suche', 'Search title'),
      {
        title: t('Neue Suche speichern', 'Save new search'),
        placeholder: t('z. B. Mathe Klausur', 'e.g. Math exam'),
        value: '',
      },
    )
    if (titleRaw == null) return
    const title = String(titleRaw).trim().slice(0, MAX_TITLE)
    if (!title) {
      await fanotes.ui.toast(t('Titel fehlt.', 'Title required.'), 'info')
      return
    }

    const queryRaw = await fanotes.ui.prompt(
      t('Suchanfrage (Volltext)', 'Search query (full-text)'),
      {
        title: t('Neue Suche speichern', 'Save new search'),
        placeholder: t('Begriff oder Phrase…', 'Term or phrase…'),
        value: lastRunQuery || '',
        multiline: true,
      },
    )
    if (queryRaw == null) return
    const query = String(queryRaw).trim().slice(0, MAX_QUERY)
    if (!query) {
      await fanotes.ui.toast(t('Suchanfrage fehlt.', 'Query required.'), 'info')
      return
    }

    /** @type {SavedSearch} */
    const item = {
      id: newId(),
      title,
      query,
      createdAt: nowIso(),
    }

    const prev = cloneStore()
    store.searches.unshift(item)
    if (store.searches.length > MAX_SEARCHES) {
      store.searches = store.searches.slice(0, MAX_SEARCHES)
    }
    store.settings.lastId = item.id
    selectedId = item.id

    const ok = await persistStore(prev)
    if (!ok) {
      selectedId = prev.settings.lastId
      await refreshPanel()
      return
    }

    await fanotes.ui.toast(
      t('Suche gespeichert.', 'Search saved.'),
      'success',
    )
    await runSearch(item.query, { searchId: item.id })
  } catch (error) {
    await fanotes.ui.toast(
      t(`Speichern fehlgeschlagen: ${errMessage(error)}`, `Save failed: ${errMessage(error)}`),
      'error',
    )
  }
}

async function renameSelected() {
  const item = selectedId ? findSearch(selectedId) : null
  if (!item) {
    await fanotes.ui.toast(
      t('Keine Suche ausgewählt.', 'No search selected.'),
      'info',
    )
    return
  }
  try {
    const titleRaw = await fanotes.ui.prompt(
      t('Neuer Titel', 'New title'),
      {
        title: t('Suche umbenennen', 'Rename search'),
        placeholder: t('Titel…', 'Title…'),
        value: item.title,
      },
    )
    if (titleRaw == null) return
    const title = String(titleRaw).trim().slice(0, MAX_TITLE)
    if (!title) {
      await fanotes.ui.toast(t('Titel fehlt.', 'Title required.'), 'info')
      return
    }

    const prev = cloneStore()
    const idx = store.searches.findIndex((s) => s.id === item.id)
    if (idx < 0) return
    store.searches[idx] = { ...store.searches[idx], title }

    const ok = await persistStore(prev)
    if (!ok) {
      await refreshPanel()
      return
    }
    await fanotes.ui.toast(t('Umbenannt.', 'Renamed.'), 'success')
    await refreshPanel()
  } catch (error) {
    await fanotes.ui.toast(
      t(`Umbenennen fehlgeschlagen: ${errMessage(error)}`, `Rename failed: ${errMessage(error)}`),
      'error',
    )
  }
}

async function deleteSelected() {
  const item = selectedId ? findSearch(selectedId) : null
  if (!item) {
    await fanotes.ui.toast(
      t('Keine Suche ausgewählt.', 'No search selected.'),
      'info',
    )
    return
  }
  try {
    const okConfirm = await fanotes.ui.confirm(
      t(
        `„${item.title}“ wirklich löschen?`,
        `Really delete “${item.title}”?`,
      ),
      {
        title: t('Suche löschen', 'Delete search'),
        confirmLabel: t('Löschen', 'Delete'),
      },
    )
    if (!okConfirm) return

    const prev = cloneStore()
    store.searches = store.searches.filter((s) => s.id !== item.id)
    if (store.settings.lastId === item.id) store.settings.lastId = null
    selectedId = store.searches.length ? store.searches[0].id : null

    const ok = await persistStore(prev)
    if (!ok) {
      selectedId = item.id
      await refreshPanel()
      return
    }
    await fanotes.ui.toast(t('Gelöscht.', 'Deleted.'), 'success')
    await refreshPanel()
  } catch (error) {
    await fanotes.ui.toast(
      t(`Löschen fehlgeschlagen: ${errMessage(error)}`, `Delete failed: ${errMessage(error)}`),
      'error',
    )
  }
}

/**
 * Persist maxHits from panel input/select with rollback.
 * @param {unknown} raw
 */
async function setMaxHits(raw) {
  const next = clampMaxHits(raw, store.settings.maxHits)
  if (next === store.settings.maxHits) {
    await refreshPanel()
    return
  }
  const prev = cloneStore()
  store.settings.maxHits = next
  const ok = await persistStore(prev)
  if (!ok) {
    await refreshPanel()
    return
  }
  // Re-slice current hits if we already have a run.
  if (lastRunQuery != null && hits.length) {
    // Keep already-fetched hits sliced to new cap (no re-search).
    // If raising the cap, user should re-run to fetch more.
    hits = hits.slice(0, next)
  }
  await refreshPanel()
}

function maxHitsSelectOptions() {
  const current = clampMaxHits(store.settings.maxHits)
  const set = new Set(MAX_HITS_OPTIONS)
  set.add(current)
  return [...set]
    .sort((a, b) => a - b)
    .map((n) => ({ value: String(n), label: String(n) }))
}

function renderBlocks() {
  const selected = selectedId ? findSearch(selectedId) : null
  const last = store.settings.lastId ? findSearch(store.settings.lastId) : null
  const list = searchesSorted()
  const maxHits = clampMaxHits(store.settings.maxHits)

  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Gespeicherte Suchen', 'Saved Searches'), level: 2 },
    {
      type: 'keyvalue',
      items: [
        { key: t('Gespeichert', 'Saved'), value: `${list.length} / ${MAX_SEARCHES}` },
        {
          key: t('Zuletzt', 'Last'),
          value: last ? last.title : t('—', '—'),
        },
        {
          key: t('Auswahl', 'Selected'),
          value: selected ? selected.title : t('—', '—'),
        },
      ],
    },
    {
      type: 'list',
      id: 'saved',
      empty: t(
        'Noch keine Suchen – „Neu“ oder Befehl „Suche speichern“.',
        'No searches yet – use “New” or the “Save search” command.',
      ),
      items: list.map((s) => ({
        id: s.id,
        title: s.title,
        detail: preview(s.query, 120),
        badge:
          s.id === selectedId
            ? '✓'
            : s.id === store.settings.lastId
              ? t('zuletzt', 'last')
              : undefined,
      })),
    },
    {
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'new',
          label: t('Neu', 'New'),
        },
        {
          type: 'button',
          id: 'rename',
          label: t('Umbenennen', 'Rename'),
          disabled: !selected,
        },
        {
          type: 'button',
          id: 'delete',
          label: t('Löschen', 'Delete'),
          danger: true,
          disabled: !selected,
        },
        {
          type: 'button',
          id: 'run',
          label: t('Ausführen', 'Run'),
          primary: true,
          disabled: !selected,
        },
      ],
    },
    { type: 'divider' },
    {
      type: 'select',
      id: 'maxHits',
      label: t('Max. Treffer', 'Max hits'),
      value: String(maxHits),
      options: maxHitsSelectOptions(),
    },
    {
      type: 'heading',
      text: lastRunQuery
        ? t(
            `Treffer (${hits.length}) – „${preview(lastRunQuery, 48)}“`,
            `Hits (${hits.length}) – “${preview(lastRunQuery, 48)}”`,
          )
        : t('Treffer', 'Hits'),
      level: 3,
    },
    {
      type: 'list',
      id: 'hits',
      empty: t(
        'Noch keine Treffer – Suche ausführen.',
        'No hits yet – run a search.',
      ),
      items: hits.map((h, i) => ({
        id: h.path || `hit-${i}`,
        title: h.title || h.path || t('(ohne Titel)', '(untitled)'),
        detail: preview(h.excerpt || h.path || '', 200),
        badge: h.kind === 'drawing' ? t('Zeichnung', 'drawing') : undefined,
      })),
    },
    {
      type: 'callout',
      tone: 'info',
      text: t(
        'Nutzt die FaNotes-Volltextsuche (notes.search). Die API kann Treffer auf ca. 200 begrenzen; maxHits schneidet zusätzlich. Kein notes:write. Beim Aktivieren wird nicht gesucht.',
        'Uses FaNotes full-text search (notes.search). The API may cap hits around 200; maxHits slices further. No notes:write. No search on activate.',
      ),
    },
  ]

  return blocks
}

function openPanel() {
  try {
    if (panel) {
      void panel.show().catch((error) => {
        if (isNoPanel(error)) panel = null
        else fanotes.log('panel.show', errMessage(error))
      })
      void refreshPanel()
      return
    }

    panel = fanotes.ui.panel({
      id: PANEL_ID,
      title: t('Gespeicherte Suchen', 'Saved Searches'),
      icon: '🔍',
      blocks: renderBlocks(),
    })

    panel.onAction(async (action) => {
      try {
        if (action.id === 'saved' && action.itemId) {
          selectedId = String(action.itemId)
          const item = findSearch(selectedId)
          await refreshPanel()
          if (item) await runSearch(item.query, { searchId: item.id })
          return
        }
        if (action.id === 'hits' && action.itemId) {
          const path = String(action.itemId)
          try {
            await fanotes.notes.open(path)
          } catch (error) {
            await fanotes.ui.toast(
              t(
                `Notiz konnte nicht geöffnet werden: ${errMessage(error)}`,
                `Could not open note: ${errMessage(error)}`,
              ),
              'error',
            )
          }
          return
        }
        if (action.id === 'new') {
          await savePrompt()
          return
        }
        if (action.id === 'rename') {
          await renameSelected()
          return
        }
        if (action.id === 'delete') {
          await deleteSelected()
          return
        }
        if (action.id === 'run') {
          await runSelected()
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
        if (input.id === 'maxHits') {
          await setMaxHits(input.value)
        }
      } catch (error) {
        fanotes.log('onInput', errMessage(error))
      }
    })
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
// Fixed bilingual keywords (stable DE+EN tokens for palette search).

fanotes.commands.register({
  id: 'open',
  title: t('Gespeicherte Suchen öffnen', 'Open saved searches'),
  detail: t(
    'Panel mit gespeicherten Suchen und Treffern',
    'Panel with saved searches and hits',
  ),
  keywords: 'suche search saved gespeichert öffnen open panel finden find filter',
  run: () => {
    try {
      openPanel()
    } catch (error) {
      void fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'run-last',
  title: t('Letzte Suche ausführen', 'Run last search'),
  detail: t(
    'Zuletzt ausgeführte gespeicherte Suche erneut starten',
    'Re-run the last executed saved search',
  ),
  keywords: 'suche search last zuletzt ausführen run saved gespeichert query find',
  run: async () => {
    try {
      await runLast()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'save-prompt',
  title: t('Suche speichern…', 'Save search…'),
  detail: t(
    'Titel und Suchanfrage eingeben, speichern und ausführen',
    'Enter title and query, save and run',
  ),
  keywords: 'suche search speichern save neu new query prompt gespeichert saved',
  run: async () => {
    try {
      await savePrompt()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.onActivate(async () => {
  try {
    // Light work only: load storage. No notes.search on activate.
    await loadStore()
    fanotes.log(
      'saved-searches activated',
      fanotes.app.appVersion,
      store.searches.length,
      store.settings.maxHits,
    )
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(async () => {
  panel = null
  hits = []
  lastRunQuery = null
  selectedId = null
})
