/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Lesewarteschlange / Reading Queue – personal unread/read note queue
// (default max 80), optional due dates, panel + status from storage only
// (no vault scan on activate; missing flags via explicit rescan-missing).

const STORAGE_KEY = 'data'
const PANEL_ID = 'queue'
const STATUS_ID = 'rq'
const DEFAULT_MAX_ITEMS = 80
const MAX_TITLE = 200

/**
 * @typedef {{
 *   id: string,
 *   path: string,
 *   title: string,
 *   status: 'unread' | 'read',
 *   addedAt: string,
 *   due: string | null,
 *   missing?: boolean,
 * }} QueueItem
 */

/**
 * @typedef {{ showStatus: boolean, maxItems: number }} Settings
 */

/**
 * @typedef {{ items: QueueItem[], settings: Settings }} Store
 */

/** @type {Store} */
let store = {
  items: [],
  settings: { showStatus: true, maxItems: DEFAULT_MAX_ITEMS },
}

/** @type {string | null} */
let selectedId = null

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

/** IDs: `q-` + Date.now() + `-` + 4 random base36 chars. */
function newId() {
  const rand4 = Math.random().toString(36).slice(2, 6).padEnd(4, '0')
  return `q-${Date.now()}-${rand4}`
}

function nowIso() {
  return new Date().toISOString()
}

/**
 * Normalize vault-relative path: forward slashes, no `..`.
 * @param {unknown} raw
 * @returns {string}
 */
function normalizePath(raw) {
  let path = String(raw ?? '').trim().replace(/\\/g, '/')
  while (path.startsWith('/')) path = path.slice(1)
  if (!path || path.includes('..')) return ''
  return path
}

/**
 * Calendar date YYYY-MM-DD, or null if empty/invalid.
 * @param {unknown} raw
 * @returns {string | null}
 */
function normalizeDue(raw) {
  if (raw == null) return null
  const s = String(raw).trim()
  if (!s) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const dt = new Date(y, mo - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null
  return `${m[1]}-${m[2]}-${m[3]}`
}

/**
 * addedAt as ISO string (accept legacy number ms).
 * @param {unknown} raw
 */
function normalizeAddedAt(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return new Date(raw).toISOString()
  }
  if (typeof raw === 'string' && raw.trim()) {
    const tms = Date.parse(raw)
    if (Number.isFinite(tms)) return new Date(tms).toISOString()
  }
  return nowIso()
}

/**
 * @param {unknown} raw
 * @returns {QueueItem | null}
 */
function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null
  const obj = /** @type {Record<string, unknown>} */ (raw)
  const id = obj.id != null ? String(obj.id).trim() : ''
  const path = normalizePath(obj.path)
  const title = obj.title != null ? String(obj.title).trim() : ''
  const status = obj.status === 'read' ? 'read' : obj.status === 'unread' ? 'unread' : null
  if (!id || !path || !title || !status) return null

  /** @type {QueueItem} */
  const item = {
    id,
    path,
    title: title.slice(0, MAX_TITLE),
    status,
    addedAt: normalizeAddedAt(obj.addedAt),
    due: normalizeDue(obj.due),
  }
  if (obj.missing === true) item.missing = true
  return item
}

/**
 * @param {unknown} raw
 * @returns {Settings}
 */
function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') {
    return { showStatus: true, maxItems: DEFAULT_MAX_ITEMS }
  }
  const obj = /** @type {Record<string, unknown>} */ (raw)
  let maxItems = Number(obj.maxItems)
  if (!Number.isFinite(maxItems) || maxItems < 1) maxItems = DEFAULT_MAX_ITEMS
  maxItems = Math.min(500, Math.floor(maxItems))
  return {
    showStatus: obj.showStatus !== false,
    maxItems,
  }
}

async function loadStore() {
  try {
    const raw = await fanotes.storage.get(STORAGE_KEY)
    if (raw && typeof raw === 'object') {
      const obj = /** @type {Record<string, unknown>} */ (raw)
      // Accept legacy `queue` key as alias for `items`.
      const list = Array.isArray(obj.items)
        ? obj.items
        : Array.isArray(obj.queue)
          ? obj.queue
          : []
      const settings = normalizeSettings(obj.settings)
      /** @type {QueueItem[]} */
      const items = []
      let truncated = false
      for (const entry of list) {
        const n = normalizeItem(entry)
        if (!n) continue
        if (items.length >= settings.maxItems) {
          truncated = true
          break
        }
        items.push(n)
      }
      store = { items, settings }
      if (truncated) {
        try {
          await fanotes.storage.set(STORAGE_KEY, store)
        } catch (persistError) {
          fanotes.log('loadStore truncate persist failed', errMessage(persistError))
        }
      }
    } else {
      store = {
        items: [],
        settings: { showStatus: true, maxItems: DEFAULT_MAX_ITEMS },
      }
    }
  } catch (error) {
    fanotes.log('loadStore failed', errMessage(error))
    store = {
      items: [],
      settings: { showStatus: true, maxItems: DEFAULT_MAX_ITEMS },
    }
  }

  if (selectedId && !store.items.some((q) => q.id === selectedId)) {
    selectedId = null
  }
}

/** Persist whole store after every mutation. */
async function saveStore() {
  try {
    await fanotes.storage.set(STORAGE_KEY, store)
    return true
  } catch (error) {
    await fanotes.ui.toast(
      t(`Speichern fehlgeschlagen: ${errMessage(error)}`, `Save failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

/** @returns {QueueItem[]} */
function cloneItems() {
  return store.items.map((item) => ({ ...item }))
}

/**
 * @param {string} id
 * @returns {QueueItem | null}
 */
function findItem(id) {
  return store.items.find((q) => q.id === id) ?? null
}

function unreadCount() {
  return store.items.filter((q) => q.status === 'unread').length
}

/**
 * Sort unread: due asc (nulls last), then addedAt asc.
 * @param {QueueItem[]} list
 */
function sortUnread(list) {
  return list.slice().sort((a, b) => {
    const da = a.due || '\uffff'
    const db = b.due || '\uffff'
    if (da !== db) return da.localeCompare(db)
    if (a.addedAt !== b.addedAt) return a.addedAt.localeCompare(b.addedAt)
    return a.id.localeCompare(b.id)
  })
}

/**
 * Read section: newest addedAt first.
 * @param {QueueItem[]} list
 */
function sortRead(list) {
  return list.slice().sort((a, b) => {
    if (a.addedAt !== b.addedAt) return b.addedAt.localeCompare(a.addedAt)
    return a.id.localeCompare(b.id)
  })
}

function unreadSorted() {
  return sortUnread(store.items.filter((q) => q.status === 'unread'))
}

function readSorted() {
  return sortRead(store.items.filter((q) => q.status === 'read'))
}

/**
 * Badge ≤24 chars: missing / overdue / today / due / status glyph.
 * @param {QueueItem} item
 */
function itemBadge(item) {
  if (item.missing) return t('fehlt', 'missing').slice(0, 24)
  if (item.due) {
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const d = String(today.getDate()).padStart(2, '0')
    const todayIso = `${y}-${m}-${d}`
    if (item.due < todayIso) return t('überfällig', 'overdue').slice(0, 24)
    if (item.due === todayIso) return t('heute', 'today')
    return item.due.slice(0, 24)
  }
  return item.status === 'unread' ? '○' : '✓'
}

async function updateStatus() {
  try {
    if (!store.settings.showStatus) {
      await fanotes.ui.status.remove(STATUS_ID)
      return
    }
    const n = unreadCount()
    if (n <= 0) {
      await fanotes.ui.status.remove(STATUS_ID)
      return
    }
    await fanotes.ui.status.set({
      id: STATUS_ID,
      text: t(`Ungelesen: ${n}`, `Unread: ${n}`),
      title: t('Lesewarteschlange öffnen', 'Open reading queue'),
      onClick: () => {
        try {
          openPanel()
        } catch (error) {
          fanotes.log('status onClick', errMessage(error))
        }
      },
    })
  } catch (error) {
    fanotes.log('updateStatus failed', errMessage(error))
  }
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Lesewarteschlange', 'Reading Queue'))
  } catch (error) {
    if (isNoPanel(error)) {
      panel = null
      return
    }
    fanotes.log('refreshPanel', errMessage(error))
  }
}

async function refreshUi() {
  await updateStatus()
  await refreshPanel()
}

/**
 * Open note; toast if missing. Does NOT auto-mark as read.
 * @param {QueueItem} item
 */
async function openItem(item) {
  try {
    let exists = true
    try {
      exists = await fanotes.notes.exists(item.path)
    } catch (error) {
      fanotes.log('exists failed', item.path, errMessage(error))
      // Proceed to open; host may still succeed.
      exists = true
    }

    if (!exists) {
      if (!item.missing) {
        const prev = cloneItems()
        item.missing = true
        const saved = await saveStore()
        if (!saved) {
          store.items = prev
        }
      }
      await refreshPanel()
      await fanotes.ui.toast(
        t(`Notiz fehlt: ${item.path}`, `Note missing: ${item.path}`),
        'error',
      )
      return
    }

    if (item.missing) {
      const prev = cloneItems()
      delete item.missing
      const saved = await saveStore()
      if (!saved) store.items = prev
      else await refreshPanel()
    }

    await fanotes.notes.open(item.path)
  } catch (error) {
    await fanotes.ui.toast(
      t(`Öffnen fehlgeschlagen: ${errMessage(error)}`, `Open failed: ${errMessage(error)}`),
      'error',
    )
  }
}

async function addActiveNote() {
  try {
    let active = null
    try {
      active = await fanotes.notes.active()
    } catch (error) {
      await fanotes.ui.toast(
        t(`Aktive Notiz nicht lesbar: ${errMessage(error)}`, `Could not read active note: ${errMessage(error)}`),
        'error',
      )
      return
    }

    if (!active || !active.path || active.kind === 'none') {
      await fanotes.ui.toast(
        t('Keine aktive Notiz zum Merken.', 'No active note to add.'),
        'info',
      )
      return
    }

    const path = normalizePath(active.path)
    if (!path) {
      await fanotes.ui.toast(t('Ungültiger Notizpfad.', 'Invalid note path.'), 'error')
      return
    }

    const existingUnread = store.items.find((q) => q.path === path && q.status === 'unread')
    if (existingUnread) {
      selectedId = existingUnread.id
      await refreshPanel()
      await fanotes.ui.toast(
        t('Notiz ist bereits ungelesen in der Warteschlange.', 'Note is already unread in the queue.'),
        'info',
      )
      return
    }

    const existingRead = store.items.find((q) => q.path === path && q.status === 'read')
    if (existingRead) {
      selectedId = existingRead.id
      const prev = cloneItems()
      existingRead.status = 'unread'
      delete existingRead.missing
      const saved = await saveStore()
      if (!saved) {
        store.items = prev
        await refreshUi()
        return
      }
      await fanotes.ui.toast(
        t('Wieder als ungelesen gesetzt.', 'Set back to unread.'),
        'success',
      )
      await refreshUi()
      return
    }

    if (store.items.length >= store.settings.maxItems) {
      await fanotes.ui.toast(
        t(
          `Maximal ${store.settings.maxItems} Einträge.`,
          `Maximum ${store.settings.maxItems} entries.`,
        ),
        'error',
      )
      return
    }

    const title = (active.title && String(active.title).trim()) || path
    /** @type {QueueItem} */
    const item = {
      id: newId(),
      path,
      title: title.slice(0, MAX_TITLE),
      status: 'unread',
      addedAt: nowIso(),
      due: null,
    }

    const prev = cloneItems()
    const prevSelected = selectedId
    store.items.unshift(item)
    selectedId = item.id
    const saved = await saveStore()
    if (!saved) {
      store.items = prev
      selectedId = prevSelected
      return
    }
    await fanotes.ui.toast(
      t(`Zur Warteschlange: ${item.title}`, `Added to queue: ${item.title}`),
      'success',
    )
    await refreshUi()
  } catch (error) {
    await fanotes.ui.toast(
      t(`Hinzufügen fehlgeschlagen: ${errMessage(error)}`, `Add failed: ${errMessage(error)}`),
      'error',
    )
  }
}

async function openNext() {
  try {
    const next = unreadSorted()[0]
    if (!next) {
      await fanotes.ui.toast(
        t('Keine ungelesene Notiz in der Warteschlange.', 'No unread note in the queue.'),
        'info',
      )
      return
    }
    selectedId = next.id
    await refreshPanel()
    await openItem(next)
  } catch (error) {
    await fanotes.ui.toast(
      t(`Weiter fehlgeschlagen: ${errMessage(error)}`, `Next failed: ${errMessage(error)}`),
      'error',
    )
  }
}

/**
 * Mark the active note as read if it is in the queue unread.
 */
async function markDoneActive() {
  try {
    let active = null
    try {
      active = await fanotes.notes.active()
    } catch (error) {
      await fanotes.ui.toast(
        t(`Aktive Notiz nicht lesbar: ${errMessage(error)}`, `Could not read active note: ${errMessage(error)}`),
        'error',
      )
      return
    }

    if (!active || !active.path || active.kind === 'none') {
      await fanotes.ui.toast(t('Keine aktive Notiz.', 'No active note.'), 'info')
      return
    }

    const path = normalizePath(active.path)
    const item = store.items.find((q) => q.path === path)
    if (!item) {
      await fanotes.ui.toast(
        t('Aktive Notiz ist nicht in der Warteschlange.', 'Active note is not in the queue.'),
        'info',
      )
      return
    }
    if (item.status === 'read') {
      await fanotes.ui.toast(t('Bereits als gelesen markiert.', 'Already marked as read.'), 'info')
      return
    }

    selectedId = item.id
    await markDone(item)
  } catch (error) {
    await fanotes.ui.toast(
      t(`Markieren fehlgeschlagen: ${errMessage(error)}`, `Mark failed: ${errMessage(error)}`),
      'error',
    )
  }
}

/**
 * @param {QueueItem} item
 */
async function markDone(item) {
  if (item.status === 'read') {
    await fanotes.ui.toast(t('Bereits als gelesen markiert.', 'Already marked as read.'), 'info')
    return
  }
  const prev = cloneItems()
  item.status = 'read'
  const saved = await saveStore()
  if (!saved) {
    store.items = prev
    await refreshUi()
    return
  }
  await fanotes.ui.toast(t('Als gelesen markiert.', 'Marked as read.'), 'success')
  await refreshUi()
}

async function markDoneSelected() {
  try {
    const item = selectedId ? findItem(selectedId) : null
    if (!item) {
      await fanotes.ui.toast(t('Kein Eintrag ausgewählt.', 'No entry selected.'), 'info')
      return
    }
    await markDone(item)
  } catch (error) {
    await fanotes.ui.toast(
      t(`Markieren fehlgeschlagen: ${errMessage(error)}`, `Mark failed: ${errMessage(error)}`),
      'error',
    )
  }
}

async function removeSelected() {
  try {
    const item = selectedId ? findItem(selectedId) : null
    if (!item) {
      await fanotes.ui.toast(t('Kein Eintrag ausgewählt.', 'No entry selected.'), 'info')
      return
    }
    const ok = await fanotes.ui.confirm(
      t(
        `„${item.title}“ wirklich entfernen?`,
        `Really remove “${item.title}”?`,
      ),
      {
        title: t('Eintrag entfernen', 'Remove entry'),
        confirmLabel: t('Entfernen', 'Remove'),
      },
    )
    if (!ok) return
    const prev = cloneItems()
    const prevSelected = selectedId
    store.items = store.items.filter((q) => q.id !== item.id)
    selectedId = store.items[0]?.id ?? null
    const saved = await saveStore()
    if (!saved) {
      store.items = prev
      selectedId = prevSelected
      await refreshUi()
      return
    }
    await fanotes.ui.toast(t('Eintrag entfernt.', 'Entry removed.'), 'success')
    await refreshUi()
  } catch (error) {
    await fanotes.ui.toast(
      t(`Entfernen fehlgeschlagen: ${errMessage(error)}`, `Remove failed: ${errMessage(error)}`),
      'error',
    )
  }
}

/**
 * Reorder within unread only: swap addedAt with neighbor that shares the same
 * due bucket (nulls together). Different dues → info toast.
 * @param {'up' | 'down'} dir
 */
async function moveUnreadSelected(dir) {
  try {
    if (!selectedId) {
      await fanotes.ui.toast(t('Kein Eintrag ausgewählt.', 'No entry selected.'), 'info')
      return
    }
    const item = findItem(selectedId)
    if (!item || item.status !== 'unread') {
      await fanotes.ui.toast(
        t('Hoch/Runter nur in Ungelesen.', 'Up/Down only within Unread.'),
        'info',
      )
      return
    }

    const list = unreadSorted()
    const idx = list.findIndex((q) => q.id === selectedId)
    if (idx < 0) return
    const target = dir === 'up' ? idx - 1 : idx + 1
    if (target < 0 || target >= list.length) {
      await fanotes.ui.toast(
        t('Bereits am Rand der Liste.', 'Already at the edge of the list.'),
        'info',
      )
      return
    }

    const other = list[target]
    if ((item.due || '') !== (other.due || '')) {
      await fanotes.ui.toast(
        t(
          'Reihenfolge folgt der Fälligkeit – Datum ändern oder entfernen.',
          'Order follows due date – change or clear the due date.',
        ),
        'info',
      )
      return
    }

    const prev = cloneItems()
    const a = findItem(item.id)
    const b = findItem(other.id)
    if (!a || !b) return
    const tmp = a.addedAt
    a.addedAt = b.addedAt
    b.addedAt = tmp

    const saved = await saveStore()
    if (!saved) {
      store.items = prev
      await refreshPanel()
      return
    }
    await refreshPanel()
  } catch (error) {
    await fanotes.ui.toast(
      t(`Verschieben fehlgeschlagen: ${errMessage(error)}`, `Move failed: ${errMessage(error)}`),
      'error',
    )
  }
}

async function setDueSelected() {
  try {
    const item = selectedId ? findItem(selectedId) : null
    if (!item) {
      await fanotes.ui.toast(t('Kein Eintrag ausgewählt.', 'No entry selected.'), 'info')
      return
    }
    const raw = await fanotes.ui.prompt(
      t('Fälligkeit YYYY-MM-DD (leer = entfernen)', 'Due date YYYY-MM-DD (empty = remove)'),
      {
        title: t('Fälligkeit setzen', 'Set due date'),
        placeholder: '2026-09-15',
        value: item.due || '',
      },
    )
    if (raw === null) return
    const trimmed = String(raw).trim()
    let due = null
    if (trimmed) {
      due = normalizeDue(trimmed)
      if (!due) {
        await fanotes.ui.toast(
          t('Ungültiges Datum – bitte YYYY-MM-DD.', 'Invalid date – use YYYY-MM-DD.'),
          'error',
        )
        return
      }
    }
    const prev = cloneItems()
    item.due = due
    const saved = await saveStore()
    if (!saved) {
      store.items = prev
      await refreshPanel()
      return
    }
    await fanotes.ui.toast(
      due
        ? t(`Fälligkeit: ${due}`, `Due: ${due}`)
        : t('Fälligkeit entfernt.', 'Due date removed.'),
      'success',
    )
    await refreshPanel()
  } catch (error) {
    await fanotes.ui.toast(
      t(`Fälligkeit fehlgeschlagen: ${errMessage(error)}`, `Due date failed: ${errMessage(error)}`),
      'error',
    )
  }
}

/** Check every item path with notes.exists and persist missing flags. */
async function rescanMissing() {
  try {
    if (!store.items.length) {
      await fanotes.ui.toast(t('Warteschlange ist leer.', 'Queue is empty.'), 'info')
      return
    }
    const prev = cloneItems()
    let missingCount = 0
    let checked = 0
    for (const item of store.items) {
      checked += 1
      try {
        const exists = await fanotes.notes.exists(item.path)
        if (exists) {
          if (item.missing) delete item.missing
        } else {
          item.missing = true
          missingCount += 1
        }
      } catch (error) {
        fanotes.log('rescan exists failed', item.path, errMessage(error))
      }
    }
    const saved = await saveStore()
    if (!saved) {
      store.items = prev
      await refreshPanel()
      return
    }
    await fanotes.ui.toast(
      t(
        `Pfade geprüft: ${checked}, fehlend: ${missingCount}.`,
        `Paths checked: ${checked}, missing: ${missingCount}.`,
      ),
      missingCount > 0 ? 'info' : 'success',
    )
    await refreshPanel()
  } catch (error) {
    await fanotes.ui.toast(
      t(`Prüfung fehlgeschlagen: ${errMessage(error)}`, `Rescan failed: ${errMessage(error)}`),
      'error',
    )
  }
}

/**
 * @param {QueueItem[]} list
 */
function listItems(list) {
  return list.map((item) => {
    const parts = []
    if (item.due) parts.push(item.due)
    parts.push(item.path)
    return {
      id: item.id,
      title: item.title,
      detail: parts.join(' · '),
      badge: itemBadge(item),
    }
  })
}

function renderBlocks() {
  const unread = unreadSorted()
  const read = readSorted()
  const selected = selectedId ? findItem(selectedId) : null
  const selectedUnread = Boolean(selected && selected.status === 'unread')

  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Lesewarteschlange', 'Reading Queue'), level: 2 },
    {
      type: 'text',
      muted: true,
      text: t(
        'Notizen zum späteren Lesen merken – ungelesen, Fälligkeit, nächste öffnen. Öffnen markiert nicht automatisch als gelesen.',
        'Save notes to read later – unread, due dates, open next. Opening does not auto-mark as read.',
      ),
    },
    {
      type: 'keyvalue',
      items: [
        { key: t('Ungelesen', 'Unread'), value: String(unread.length) },
        { key: t('Gelesen', 'Read'), value: String(read.length) },
        { key: t('Gesamt', 'Total'), value: String(store.items.length) },
        { key: t('Limit', 'Limit'), value: String(store.settings.maxItems) },
      ],
    },
    {
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'add-active',
          label: t('Aktive Notiz', 'Active note'),
        },
        {
          type: 'button',
          id: 'next',
          label: t('Nächste', 'Next'),
          disabled: unread.length === 0,
        },
        {
          type: 'button',
          id: 'rescan-missing',
          label: t('Pfade prüfen', 'Rescan paths'),
        },
      ],
    },
    { type: 'divider' },
    { type: 'heading', text: t('Ungelesen', 'Unread'), level: 3 },
    {
      type: 'list',
      id: 'unread',
      empty: t(
        'Noch nichts Ungelesenes – aktive Notiz hinzufügen.',
        'Nothing unread yet – add the active note.',
      ),
      items: listItems(unread),
    },
    { type: 'heading', text: t('Gelesen', 'Read'), level: 3 },
    {
      type: 'list',
      id: 'read',
      empty: t('Noch nichts Gelesenes.', 'Nothing marked read yet.'),
      items: listItems(read),
    },
  ]

  if (selected) {
    blocks.push({ type: 'divider' })
    blocks.push({
      type: 'heading',
      text: t('Auswahl', 'Selected'),
      level: 3,
    })
    blocks.push({
      type: 'keyvalue',
      items: [
        { key: t('Titel', 'Title'), value: selected.title },
        { key: t('Pfad', 'Path'), value: selected.path },
        {
          key: t('Status', 'Status'),
          value:
            selected.status === 'unread'
              ? t('Ungelesen', 'Unread')
              : t('Gelesen', 'Read'),
        },
        {
          key: t('Fällig', 'Due'),
          value: selected.due || t('—', '—'),
        },
        {
          key: t('Vorhanden', 'Exists'),
          value: selected.missing
            ? t('fehlt', 'missing')
            : t('ok / ungeprüft', 'ok / unchecked'),
        },
      ],
    })
  }

  blocks.push({ type: 'divider' })
  blocks.push({
    type: 'checkbox',
    id: 'showStatus',
    label: t(
      '„Ungelesen: N“ in der Statusleiste (nur bei Ungelesen > 0)',
      'Show “Unread: N” in the status bar (only when unread > 0)',
    ),
    checked: store.settings.showStatus,
  })
  blocks.push({
    type: 'callout',
    tone: 'info',
    text: t(
      'Klick öffnet die Notiz (ohne Auto-Erledigt). Ungelesen: Fälligkeit ↑, dann Hinzufügezeit ↑. Fehlende Pfade: Badge „fehlt“ + Toast; „Pfade prüfen“ setzt missing per notes.exists. Max. Einträge laut Einstellung (Standard 80). Kein Vault-Scan beim Aktivieren.',
      'Click opens the note (no auto-done). Unread: due ↑, then addedAt ↑. Missing paths: “missing” badge + toast; “Rescan paths” sets missing via notes.exists. Max items from settings (default 80). No vault scan on activate.',
    ),
  })

  blocks.push({
    type: 'row',
    children: [
      {
        type: 'button',
        id: 'done',
        label: t('Erledigt', 'Done'),
        primary: true,
        disabled: !selectedUnread,
      },
      {
        type: 'button',
        id: 'due',
        label: t('Fällig', 'Due'),
        disabled: !selected,
      },
      {
        type: 'button',
        id: 'move-up',
        label: t('Hoch', 'Up'),
        disabled: !selectedUnread,
      },
      {
        type: 'button',
        id: 'move-down',
        label: t('Runter', 'Down'),
        disabled: !selectedUnread,
      },
    ],
  })
  blocks.push({
    type: 'row',
    children: [
      {
        type: 'button',
        id: 'remove',
        label: t('Entfernen', 'Remove'),
        danger: true,
        disabled: !selected,
      },
    ],
  })

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
      title: t('Lesewarteschlange', 'Reading Queue'),
      icon: '📖',
      blocks: renderBlocks(),
    })

    panel.onAction(async (action) => {
      try {
        if ((action.id === 'unread' || action.id === 'read') && action.itemId) {
          selectedId = String(action.itemId)
          const item = findItem(selectedId)
          await refreshPanel()
          if (item) await openItem(item)
          return
        }
        if (action.id === 'add-active') {
          await addActiveNote()
          return
        }
        if (action.id === 'next') {
          await openNext()
          return
        }
        if (action.id === 'rescan-missing') {
          await rescanMissing()
          return
        }
        if (action.id === 'done') {
          await markDoneSelected()
          return
        }
        if (action.id === 'due') {
          await setDueSelected()
          return
        }
        if (action.id === 'move-up') {
          await moveUnreadSelected('up')
          return
        }
        if (action.id === 'move-down') {
          await moveUnreadSelected('down')
          return
        }
        if (action.id === 'remove') {
          await removeSelected()
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
          const prev = store.settings.showStatus
          store.settings.showStatus = input.value === true
          const ok = await saveStore()
          if (!ok) {
            store.settings.showStatus = prev
            await refreshUi()
            return
          }
          await refreshUi()
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
  title: t('Lesewarteschlange öffnen', 'Open reading queue'),
  detail: t(
    'Panel mit Ungelesen und Gelesen',
    'Panel with Unread and Read',
  ),
  keywords: 'lesen reading warteschlange queue öffnen open panel ungelesen unread',
  run: () => {
    try {
      openPanel()
    } catch (error) {
      void fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'add-active',
  title: t('Aktive Notiz zur Lesewarteschlange', 'Add active note to reading queue'),
  detail: t(
    'Aktuelle Notiz als ungelesen merken (Duplikat → Hinweis)',
    'Save the current note as unread (duplicate → info)',
  ),
  keywords: 'lesen reading warteschlange queue hinzufügen add aktiv active notiz note ungelesen unread',
  run: async () => {
    try {
      await addActiveNote()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'next',
  title: t('Nächste ungelesene öffnen', 'Open next unread'),
  detail: t(
    'Erste ungelesene Notiz (Fälligkeit, dann Datum) öffnen',
    'Open the first unread note (due, then addedAt)',
  ),
  keywords: 'nächste next ungelesen unread öffnen open lesen reading warteschlange queue',
  run: async () => {
    try {
      await openNext()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'mark-done-active',
  title: t('Aktive Notiz als gelesen', 'Mark active note as read'),
  detail: t(
    'Aktive Notiz in der Warteschlange als gelesen markieren',
    'Mark the active note in the queue as read',
  ),
  keywords: 'gelesen read erledigt done aktiv active markieren mark warteschlange queue lesen reading',
  run: async () => {
    try {
      await markDoneActive()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.onActivate(async () => {
  try {
    // Light work only: load storage + optional status. No vault scan (scan-gate N/A).
    await loadStore()
    await updateStatus()
    fanotes.log(
      'reading-queue activated',
      fanotes.app.appVersion,
      store.items.length,
      unreadCount(),
    )
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(async () => {
  try {
    await fanotes.ui.status.remove(STATUS_ID)
  } catch {
    // Host tears down UI; ignore.
  }
  panel = null
})
