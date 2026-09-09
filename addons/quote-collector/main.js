/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Zitatesammler / Quote Collector – capture editor selections as quotes
// with source, export dated sections to Quotes.md, copy last quote.

const STORAGE_KEY = 'data'
const PANEL_ID = 'quotes'
const STATUS_ID = 'qc'
const DEFAULT_EXPORT = 'Quotes.md'
const DEFAULT_MAX_QUOTES = 200
const MAX_TEXT = 4000
const MAX_TITLE = 200
const LIST_TITLE_LEN = 60

/**
 * @typedef {{
 *   id: string,
 *   text: string,
 *   path: string | null,
 *   title: string,
 *   createdAt: string,
 *   tags: string,
 * }} Quote
 */

/**
 * @typedef {{
 *   exportPath: string,
 *   maxQuotes: number,
 *   showStatus: boolean,
 * }} Settings
 */

/**
 * @typedef {{ quotes: Quote[], settings: Settings }} Store
 */

/** @type {Store} */
let store = {
  quotes: [],
  settings: {
    exportPath: DEFAULT_EXPORT,
    maxQuotes: DEFAULT_MAX_QUOTES,
    showStatus: true,
  },
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

function pad2(n) {
  return String(n).padStart(2, '0')
}

/** Local timestamp as `YYYY-MM-DD HH:mm`. */
function formatStamp(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/** IDs: `qt-` + Date.now() + `-` + 4 random base36 chars. */
function newId() {
  const rand4 = Math.random().toString(36).slice(2, 6).padEnd(4, '0')
  return `qt-${Date.now()}-${rand4}`
}

function nowIso() {
  return new Date().toISOString()
}

/**
 * Normalize vault-relative export path to a `.md` or `.markdown` file.
 * Rejects `..`, absolute paths, and non-markdown extensions.
 * @returns {{ path: string, folder: string, name: string, ext: string } | null}
 */
function normalizeExportPath(raw) {
  let path = String(raw ?? '').trim().replace(/\\/g, '/')
  while (path.startsWith('/')) path = path.slice(1)
  while (path.endsWith('/')) path = path.slice(0, -1)
  if (!path) path = DEFAULT_EXPORT

  const parts = path.split('/').filter(Boolean)
  if (!parts.length || parts.some((p) => p === '.' || p === '..')) return null

  let file = parts[parts.length - 1]
  const lower = file.toLowerCase()
  let ext = '.md'
  if (lower.endsWith('.markdown')) {
    ext = '.markdown'
  } else if (lower.endsWith('.md')) {
    ext = '.md'
  } else if (lower.includes('.')) {
    return null
  } else {
    file = `${file}.md`
    parts[parts.length - 1] = file
    ext = '.md'
  }

  const name = file.slice(0, -ext.length)
  if (!name) return null
  const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
  return { path: parts.join('/'), folder, name, ext }
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
function normalizePathOrNull(raw) {
  if (raw == null || raw === '') return ''
  let path = String(raw).trim().replace(/\\/g, '/')
  while (path.startsWith('/')) path = path.slice(1)
  if (!path || path.includes('..')) return ''
  return path
}

/**
 * createdAt as ISO string (accept legacy number ms).
 * @param {unknown} raw
 */
function normalizeCreatedAt(raw) {
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
 * @returns {Quote | null}
 */
function normalizeQuote(raw) {
  if (!raw || typeof raw !== 'object') return null
  const obj = /** @type {Record<string, unknown>} */ (raw)
  const id = obj.id != null ? String(obj.id).trim() : ''
  let text = obj.text != null ? String(obj.text) : ''
  if (!id || !text) return null
  if (text.length > MAX_TEXT) text = `${text.slice(0, MAX_TEXT - 1)}…`

  const pathRaw = normalizePathOrNull(obj.path)
  const titleRaw = obj.title != null ? String(obj.title).trim() : ''
  const tags = obj.tags != null ? String(obj.tags).trim() : ''

  return {
    id,
    text,
    path: pathRaw || null,
    title: (titleRaw || t('Ohne Titel', 'Untitled')).slice(0, MAX_TITLE),
    createdAt: normalizeCreatedAt(obj.createdAt),
    tags,
  }
}

/**
 * @param {unknown} raw
 * @returns {Settings}
 */
function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      exportPath: DEFAULT_EXPORT,
      maxQuotes: DEFAULT_MAX_QUOTES,
      showStatus: true,
    }
  }
  const obj = /** @type {Record<string, unknown>} */ (raw)
  const parsed = normalizeExportPath(
    obj.exportPath != null ? String(obj.exportPath) : DEFAULT_EXPORT,
  )
  let maxQuotes = Number(obj.maxQuotes)
  if (!Number.isFinite(maxQuotes) || maxQuotes < 1) maxQuotes = DEFAULT_MAX_QUOTES
  maxQuotes = Math.min(500, Math.floor(maxQuotes))
  return {
    exportPath: parsed ? parsed.path : DEFAULT_EXPORT,
    maxQuotes,
    showStatus: obj.showStatus !== false,
  }
}

/** Snapshot for rollback after failed persist. */
function cloneStore() {
  return {
    quotes: store.quotes.map((q) => ({ ...q })),
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
      quotes: store.quotes,
      settings: store.settings,
    })
    return true
  } catch (error) {
    if (rollback) {
      store = {
        quotes: rollback.quotes.map((q) => ({ ...q })),
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
      const settings = normalizeSettings(obj.settings)
      const list = Array.isArray(obj.quotes) ? obj.quotes : []
      /** @type {Quote[]} */
      const quotes = []
      let truncated = false
      for (const entry of list) {
        const n = normalizeQuote(entry)
        if (!n) continue
        if (quotes.length >= settings.maxQuotes) {
          truncated = true
          break
        }
        quotes.push(n)
      }
      store = { quotes, settings }
      if (truncated) {
        try {
          await fanotes.storage.set(STORAGE_KEY, {
            quotes: store.quotes,
            settings: store.settings,
          })
        } catch (persistError) {
          fanotes.log('loadStore truncate persist failed', errMessage(persistError))
        }
      }
    } else {
      store = {
        quotes: [],
        settings: {
          exportPath: DEFAULT_EXPORT,
          maxQuotes: DEFAULT_MAX_QUOTES,
          showStatus: true,
        },
      }
    }
  } catch (error) {
    fanotes.log('loadStore failed', errMessage(error))
    store = {
      quotes: [],
      settings: {
        exportPath: DEFAULT_EXPORT,
        maxQuotes: DEFAULT_MAX_QUOTES,
        showStatus: true,
      },
    }
  }

  if (selectedId && !store.quotes.some((q) => q.id === selectedId)) {
    selectedId = null
  }
}

/**
 * @param {string} id
 * @returns {Quote | null}
 */
function findQuote(id) {
  return store.quotes.find((q) => q.id === id) ?? null
}

/**
 * Truncate for list title (60 chars + …).
 * @param {string} text
 */
function listTitle(text) {
  const one = String(text ?? '').replace(/\s+/gu, ' ').trim()
  if (!one) return t('(leer)', '(empty)')
  if (one.length <= LIST_TITLE_LEN) return one
  return `${one.slice(0, LIST_TITLE_LEN - 1)}…`
}

/**
 * Persist exportPath when create/fallback resolves to a different path.
 * @param {string} path
 */
async function persistExportPath(path) {
  if (!path || path === store.settings.exportPath) return
  const prev = cloneStore()
  store.settings = { ...store.settings, exportPath: path }
  const ok = await persistStore(prev)
  if (ok) {
    fanotes.log('persisted exportPath after create/fallback', path)
  } else {
    fanotes.log('could not persist exportPath', path)
  }
}

/** Heading used when creating a missing export note. */
function exportHeading() {
  return '# Zitate / Quotes\n'
}

/**
 * Ensure the export note exists; create if missing.
 * Without vault:write, a missing parent folder falls back to FaNotes’ default folder
 * and settings.exportPath is updated to the real path (like quick-inbox).
 * @returns {Promise<string | null>} resolved vault path to append to
 */
async function ensureExportFile() {
  const parsed = normalizeExportPath(store.settings.exportPath)
  if (!parsed) {
    await fanotes.ui.toast(
      t(
        'Ungültiger Export-Pfad (nur .md/.markdown, kein „..“).',
        'Invalid export path (only .md/.markdown, no “..”).',
      ),
      'error',
    )
    return null
  }

  let exists = false
  try {
    exists = await fanotes.notes.exists(parsed.path)
  } catch (error) {
    await fanotes.ui.toast(
      t(`Prüfung fehlgeschlagen: ${errMessage(error)}`, `Existence check failed: ${errMessage(error)}`),
      'error',
    )
    return null
  }

  if (exists) return parsed.path

  const content = exportHeading()

  try {
    const opts = /** @type {{ folder?: string, name: string, content: string }} */ ({
      name: parsed.name,
      content,
    })
    if (parsed.folder) opts.folder = parsed.folder
    const created = await fanotes.notes.create(opts)
    const path = created || parsed.path
    fanotes.log('created export file', path)
    await persistExportPath(path)
    await fanotes.ui.toast(
      t(`Export-Datei angelegt: ${path}`, `Export file created: ${path}`),
      'info',
    )
    return path
  } catch (error) {
    fanotes.log('create with folder failed, trying default folder', errMessage(error))
    try {
      const bare = `${parsed.name}${parsed.ext}`
      try {
        if (await fanotes.notes.exists(bare)) {
          await persistExportPath(bare)
          await fanotes.ui.toast(
            t(
              `Ordner fehlte – vorhandene Datei „${bare}“ übernommen (Einstellungen aktualisiert).`,
              `Folder missing – reused existing file "${bare}" (settings updated).`,
            ),
            'info',
          )
          return bare
        }
      } catch {
        // ignore exists probe errors and continue to create
      }
      const created = await fanotes.notes.create({
        name: parsed.name,
        content,
      })
      const path = created || `${parsed.name}${parsed.ext}`
      fanotes.log('created export file in default folder', path)
      await persistExportPath(path)
      await fanotes.ui.toast(
        t(
          `Ordner fehlte – Datei woanders angelegt. Einstellungen auf „${path}“ aktualisiert.`,
          `Folder missing – file created elsewhere. Settings updated to "${path}".`,
        ),
        'info',
      )
      return path
    } catch (error2) {
      await fanotes.ui.toast(
        t(
          `Export-Datei konnte nicht angelegt werden: ${errMessage(error2)}`,
          `Could not create export file: ${errMessage(error2)}`,
        ),
        'error',
      )
      return null
    }
  }
}

/**
 * Build one export block for a quote.
 * @param {Quote} q
 */
function formatQuoteBlock(q) {
  const attr =
    q.path != null && q.path
      ? `— ${q.title} (${q.path})`
      : `— ${q.title}`
  return `> ${q.text.replace(/\r?\n/g, '\n> ')}\n${attr}`
}

async function updateStatus() {
  try {
    if (!store.settings.showStatus) {
      await fanotes.ui.status.remove(STATUS_ID)
      return
    }
    const n = store.quotes.length
    if (n <= 0) {
      await fanotes.ui.status.remove(STATUS_ID)
      return
    }
    await fanotes.ui.status.set({
      id: STATUS_ID,
      text: t(`Zitate: ${n}`, `Quotes: ${n}`),
      title: t('Zitatesammler öffnen', 'Open Quote Collector'),
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
    await panel.setTitle(t('Zitatesammler', 'Quote Collector'))
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

async function captureSelection() {
  try {
    let sel = null
    try {
      sel = await fanotes.editor.getSelection()
    } catch (error) {
      await fanotes.ui.toast(
        t(`Auswahl nicht lesbar: ${errMessage(error)}`, `Could not read selection: ${errMessage(error)}`),
        'error',
      )
      return
    }

    let text = sel && typeof sel.text === 'string' ? sel.text : ''
    if (!text.trim()) {
      await fanotes.ui.toast(
        t('Keine Textauswahl – nichts erfasst.', 'No text selection – nothing captured.'),
        'error',
      )
      return
    }

    let truncated = false
    if (text.length > MAX_TEXT) {
      text = `${text.slice(0, MAX_TEXT - 1)}…`
      truncated = true
    }

    if (store.quotes.length >= store.settings.maxQuotes) {
      await fanotes.ui.toast(
        t(
          `Maximal ${store.settings.maxQuotes} Zitate. Bitte exportieren oder löschen.`,
          `Maximum ${store.settings.maxQuotes} quotes. Please export or remove some.`,
        ),
        'error',
      )
      return
    }

    let path = null
    let title = t('Ohne Titel', 'Untitled')
    try {
      const active = await fanotes.notes.active()
      if (active && active.path && active.kind !== 'none') {
        path = String(active.path).replace(/\\/g, '/')
        title =
          (active.title && String(active.title).trim()) ||
          path ||
          title
      }
    } catch (error) {
      fanotes.log('notes.active failed', errMessage(error))
    }
    title = title.slice(0, MAX_TITLE)

    /** @type {Quote} */
    const quote = {
      id: newId(),
      text,
      path,
      title,
      createdAt: nowIso(),
      tags: '',
    }

    const prev = cloneStore()
    const prevSelected = selectedId
    store.quotes.unshift(quote)
    selectedId = quote.id
    const ok = await persistStore(prev)
    if (!ok) {
      selectedId = prevSelected
      await refreshUi()
      return
    }

    if (truncated) {
      await fanotes.ui.toast(
        t(
          `Zitat auf ${MAX_TEXT} Zeichen gekürzt.`,
          `Quote truncated to ${MAX_TEXT} characters.`,
        ),
        'info',
      )
    }
    await fanotes.ui.toast(
      t('Zitat erfasst.', 'Quote captured.'),
      'success',
    )
    await refreshUi()
  } catch (error) {
    await fanotes.ui.toast(
      t(`Erfassen fehlgeschlagen: ${errMessage(error)}`, `Capture failed: ${errMessage(error)}`),
      'error',
    )
  }
}

async function exportQuotes() {
  try {
    if (!store.quotes.length) {
      await fanotes.ui.toast(
        t('Keine Zitate zum Exportieren.', 'No quotes to export.'),
        'info',
      )
      return
    }

    const path = await ensureExportFile()
    if (!path) return

    // Oldest first within the dated section (storage is newest-first).
    const ordered = store.quotes.slice().reverse()
    const stamp = formatStamp()
    const blocks = ordered.map(formatQuoteBlock).join('\n\n')
    const section = `\n## ${stamp}\n\n${blocks}\n`

    try {
      await fanotes.notes.append(path, section)
      await fanotes.ui.toast(
        t(
          `${ordered.length} Zitate nach „${path}“ exportiert.`,
          `Exported ${ordered.length} quotes to “${path}”.`,
        ),
        'success',
      )
    } catch (error) {
      await fanotes.ui.toast(
        t(`Export fehlgeschlagen: ${errMessage(error)}`, `Export failed: ${errMessage(error)}`),
        'error',
      )
    }
  } catch (error) {
    await fanotes.ui.toast(
      t(`Export fehlgeschlagen: ${errMessage(error)}`, `Export failed: ${errMessage(error)}`),
      'error',
    )
  }
}

async function copyLast() {
  try {
    if (!store.quotes.length) {
      await fanotes.ui.toast(
        t('Kein Zitat vorhanden.', 'No quote available.'),
        'info',
      )
      return
    }
    // Newest-first storage → index 0 is last captured.
    const last = store.quotes[0]
    await fanotes.clipboard.writeText(last.text)
    await fanotes.ui.toast(
      t('Letztes Zitat kopiert.', 'Last quote copied.'),
      'success',
    )
  } catch (error) {
    await fanotes.ui.toast(
      t(`Kopieren fehlgeschlagen: ${errMessage(error)}`, `Copy failed: ${errMessage(error)}`),
      'error',
    )
  }
}

/**
 * @param {Quote} quote
 */
async function copyQuote(quote) {
  try {
    await fanotes.clipboard.writeText(quote.text)
    await fanotes.ui.toast(t('Zitat kopiert.', 'Quote copied.'), 'success')
  } catch (error) {
    await fanotes.ui.toast(
      t(`Kopieren fehlgeschlagen: ${errMessage(error)}`, `Copy failed: ${errMessage(error)}`),
      'error',
    )
  }
}

/**
 * @param {Quote} quote
 */
async function insertQuote(quote) {
  try {
    const ok = await fanotes.editor.insert(quote.text, 'cursor')
    if (!ok) {
      await fanotes.ui.toast(
        t('Kein Markdown-Editor geöffnet.', 'No Markdown editor is open.'),
        'error',
      )
      return
    }
    await fanotes.ui.toast(
      t('Zitat am Cursor eingefügt.', 'Quote inserted at cursor.'),
      'success',
    )
  } catch (error) {
    await fanotes.ui.toast(
      t(`Einfügen fehlgeschlagen: ${errMessage(error)}`, `Insert failed: ${errMessage(error)}`),
      'error',
    )
  }
}

async function removeSelected() {
  try {
    const quote = selectedId ? findQuote(selectedId) : null
    if (!quote) {
      await fanotes.ui.toast(t('Kein Zitat ausgewählt.', 'No quote selected.'), 'info')
      return
    }
    const ok = await fanotes.ui.confirm(
      t(
        `Zitat wirklich entfernen?\n\n${listTitle(quote.text)}`,
        `Really remove this quote?\n\n${listTitle(quote.text)}`,
      ),
      {
        title: t('Zitat entfernen', 'Remove quote'),
        confirmLabel: t('Entfernen', 'Remove'),
      },
    )
    if (!ok) return

    const prev = cloneStore()
    const prevSelected = selectedId
    store.quotes = store.quotes.filter((q) => q.id !== quote.id)
    selectedId = store.quotes[0]?.id ?? null
    const saved = await persistStore(prev)
    if (!saved) {
      selectedId = prevSelected
      await refreshUi()
      return
    }
    await fanotes.ui.toast(t('Zitat entfernt.', 'Quote removed.'), 'success')
    await refreshUi()
  } catch (error) {
    await fanotes.ui.toast(
      t(`Entfernen fehlgeschlagen: ${errMessage(error)}`, `Remove failed: ${errMessage(error)}`),
      'error',
    )
  }
}

async function clearAllQuotes() {
  try {
    if (!store.quotes.length) {
      await fanotes.ui.toast(
        t('Liste ist bereits leer.', 'List is already empty.'),
        'info',
      )
      return
    }
    const ok = await fanotes.ui.confirm(
      t(
        `Alle ${store.quotes.length} Zitate wirklich löschen?`,
        `Really clear all ${store.quotes.length} quotes?`,
      ),
      {
        title: t('Alle löschen', 'Clear all'),
        confirmLabel: t('Alles löschen', 'Clear all'),
      },
    )
    if (!ok) return

    const prev = cloneStore()
    const prevSelected = selectedId
    store.quotes = []
    selectedId = null
    const saved = await persistStore(prev)
    if (!saved) {
      selectedId = prevSelected
      await refreshUi()
      return
    }
    await fanotes.ui.toast(t('Alle Zitate gelöscht.', 'All quotes cleared.'), 'success')
    await refreshUi()
  } catch (error) {
    await fanotes.ui.toast(
      t(`Leeren fehlgeschlagen: ${errMessage(error)}`, `Clear failed: ${errMessage(error)}`),
      'error',
    )
  }
}

/**
 * Save exportPath from panel values with rollback on fail.
 * @param {string} rawPath
 */
async function saveExportPath(rawPath) {
  const parsed = normalizeExportPath(rawPath)
  if (!parsed) {
    await fanotes.ui.toast(
      t(
        'Ungültiger Export-Pfad (nur .md/.markdown, kein „..“).',
        'Invalid export path (only .md/.markdown, no “..”).',
      ),
      'error',
    )
    await refreshPanel()
    return false
  }
  if (parsed.path === store.settings.exportPath) {
    await fanotes.ui.toast(t('Pfad unverändert.', 'Path unchanged.'), 'info')
    return true
  }
  const prev = cloneStore()
  store.settings = { ...store.settings, exportPath: parsed.path }
  const ok = await persistStore(prev)
  if (!ok) {
    await refreshPanel()
    return false
  }
  await fanotes.ui.toast(t('Export-Pfad gespeichert.', 'Export path saved.'), 'success')
  await refreshPanel()
  return true
}

function renderBlocks() {
  const selected = selectedId ? findQuote(selectedId) : null

  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Zitatesammler', 'Quote Collector'), level: 2 },
    {
      type: 'text',
      muted: true,
      text: t(
        'Editor-Auswahl als Zitat speichern, exportieren oder kopieren.',
        'Save editor selection as a quote, export or copy.',
      ),
    },
    {
      type: 'keyvalue',
      items: [
        { key: t('Zitate', 'Quotes'), value: String(store.quotes.length) },
        { key: t('Maximum', 'Maximum'), value: String(store.settings.maxQuotes) },
        { key: t('Export', 'Export'), value: store.settings.exportPath },
      ],
    },
    { type: 'divider' },
    { type: 'heading', text: t('Zitate', 'Quotes'), level: 3 },
    {
      type: 'list',
      id: 'quotes',
      empty: t(
        'Noch keine Zitate – Auswahl im Editor markieren und erfassen.',
        'No quotes yet – select text in the editor and capture.',
      ),
      items: store.quotes.map((q) => ({
        id: q.id,
        title: listTitle(q.text),
        detail: q.title || q.path || '—',
        badge: q.tags
          ? q.tags.slice(0, 24)
          : q.id === selectedId
            ? '✓'
            : undefined,
      })),
    },
  ]

  if (selected) {
    blocks.push({ type: 'divider' })
    blocks.push({
      type: 'heading',
      text: t('Ausgewähltes Zitat', 'Selected quote'),
      level: 3,
    })
    blocks.push({
      type: 'keyvalue',
      items: [
        { key: t('Quelle', 'Source'), value: selected.title },
        {
          key: t('Pfad', 'Path'),
          value: selected.path || t('—', '—'),
        },
        {
          key: t('Tag', 'Tag'),
          value: selected.tags || t('—', '—'),
        },
      ],
    })
    blocks.push({
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'copy-selected',
          label: t('Kopieren', 'Copy'),
        },
        {
          type: 'button',
          id: 'insert-selected',
          label: t('Einfügen Cursor', 'Insert at cursor'),
        },
        {
          type: 'button',
          id: 'remove-selected',
          label: t('Entfernen', 'Remove'),
          danger: true,
        },
      ],
    })
  }

  blocks.push({ type: 'divider' })
  blocks.push({
    type: 'row',
    children: [
      {
        type: 'button',
        id: 'capture',
        label: t('Auswahl erfassen', 'Capture selection'),
        primary: true,
      },
      {
        type: 'button',
        id: 'export',
        label: t('Exportieren', 'Export'),
      },
      {
        type: 'button',
        id: 'clear-all',
        label: t('Alles löschen', 'Clear all'),
        danger: true,
        disabled: store.quotes.length === 0,
      },
    ],
  })

  blocks.push({ type: 'divider' })
  blocks.push({ type: 'heading', text: t('Einstellungen', 'Settings'), level: 3 })
  blocks.push({
    type: 'input',
    id: 'exportPath',
    label: t('Export-Pfad (.md/.markdown, relativ zum Vault)', 'Export path (.md/.markdown, vault-relative)'),
    value: store.settings.exportPath,
    placeholder: DEFAULT_EXPORT,
  })
  blocks.push({
    type: 'row',
    children: [
      {
        type: 'button',
        id: 'save-path',
        label: t('Pfad speichern', 'Save path'),
      },
    ],
  })
  blocks.push({
    type: 'checkbox',
    id: 'showStatus',
    label: t(
      '„Zitate: N“ in der Statusleiste anzeigen (nur wenn N > 0)',
      'Show “Quotes: N” in the status bar (only when N > 0)',
    ),
    checked: store.settings.showStatus,
  })
  blocks.push({
    type: 'callout',
    tone: 'info',
    text: t(
      'Kein OCR. Zwischenablage nur schreiben. notes:write nur für die Export-Datei. Text max. 4000 Zeichen (Kürzung mit …). Export legt fehlende Datei mit „# Zitate / Quotes“ an.',
      'No OCR. Clipboard write-only. notes:write only for the export file. Text max 4000 characters (truncate with …). Export creates a missing file with “# Zitate / Quotes”.',
    ),
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
      title: t('Zitatesammler', 'Quote Collector'),
      icon: '❝',
      blocks: renderBlocks(),
    })

    panel.onAction(async (action) => {
      try {
        if (action.id === 'quotes' && action.itemId) {
          selectedId = String(action.itemId)
          await refreshPanel()
          return
        }
        if (action.id === 'capture') {
          await captureSelection()
          return
        }
        if (action.id === 'export') {
          await exportQuotes()
          return
        }
        if (action.id === 'clear-all') {
          await clearAllQuotes()
          return
        }
        if (action.id === 'copy-selected') {
          const quote = selectedId ? findQuote(selectedId) : null
          if (!quote) {
            await fanotes.ui.toast(t('Kein Zitat ausgewählt.', 'No quote selected.'), 'info')
            return
          }
          await copyQuote(quote)
          return
        }
        if (action.id === 'insert-selected') {
          const quote = selectedId ? findQuote(selectedId) : null
          if (!quote) {
            await fanotes.ui.toast(t('Kein Zitat ausgewählt.', 'No quote selected.'), 'info')
            return
          }
          await insertQuote(quote)
          return
        }
        if (action.id === 'remove-selected') {
          await removeSelected()
          return
        }
        if (action.id === 'save-path' || action.id === 'submit:exportPath') {
          const values = action.values || {}
          const raw =
            values.exportPath != null
              ? String(values.exportPath)
              : store.settings.exportPath
          await saveExportPath(raw)
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
          const prev = cloneStore()
          store.settings = {
            ...store.settings,
            showStatus: input.value === true,
          }
          const ok = await persistStore(prev)
          if (!ok) {
            await refreshUi()
            return
          }
          await refreshUi()
        }
        // exportPath applied on Save or Enter (submit:exportPath).
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
  title: t('Zitatesammler öffnen', 'Open Quote Collector'),
  detail: t(
    'Panel mit erfassten Zitaten und Export',
    'Panel with captured quotes and export',
  ),
  keywords: 'zitat quote citation sammeln öffnen open panel collector',
  run: () => {
    try {
      openPanel()
    } catch (error) {
      void fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'capture-selection',
  title: t('Auswahl als Zitat erfassen', 'Capture selection as quote'),
  detail: t(
    'Markierten Editor-Text mit Quelle speichern',
    'Save selected editor text with source',
  ),
  keywords: 'zitat quote auswahl selection erfassen capture citation quelle source',
  run: async () => {
    try {
      await captureSelection()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'export',
  title: t('Zitate exportieren', 'Export quotes'),
  detail: t(
    'Alle Zitate als datierten Abschnitt anhängen',
    'Append all quotes as a dated section',
  ),
  keywords: 'zitat quote export exportieren quotes.md abschnitt section',
  run: async () => {
    try {
      await exportQuotes()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'copy-last',
  title: t('Letztes Zitat kopieren', 'Copy last quote'),
  detail: t(
    'Zuletzt erfasstes Zitat in die Zwischenablage',
    'Copy the most recently captured quote to the clipboard',
  ),
  keywords: 'zitat quote kopieren copy letztes last zwischenablage clipboard',
  run: async () => {
    try {
      await copyLast()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.onActivate(async () => {
  try {
    // Light work only: load storage + optional status. No vault scan.
    await loadStore()
    await updateStatus()
    fanotes.log(
      'quote-collector activated',
      fanotes.app.appVersion,
      store.quotes.length,
      store.settings.exportPath,
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
