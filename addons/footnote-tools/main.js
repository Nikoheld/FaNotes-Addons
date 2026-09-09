/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Fußnoten-Werkzeuge / Footnote Tools – insert Markdown [^id] markers and
// list [^id]: definitions in the active note.
// Abgrenzung: quote-collector = Zitate; math/callout = andere Inserts;
// hier = Markdown [^id] + [^id]: defs.
// Soft: no vault scan / never notes.list / no notes:write.
// Activate = load settings only.

const STORAGE_KEY = 'settings'
const PANEL_ID = 'fn'
const LIST_DETAIL_LEN = 80
const MAX_PREFIX_LEN = 24
const MAX_ID_LEN = 64
const DEF_LINE_RE = /^\[\^([^\]]+)\]:\s*(.*)$/
const MARKER_RE = /\[\^([^\]]+)\](?!:)/g

/**
 * @typedef {'auto' | 'prompt'} IdMode
 */

/**
 * @typedef {{
 *   idMode: IdMode,
 *   prefix: string,
 *   copyOnInsert: boolean,
 * }} Settings
 */

/**
 * @typedef {{
 *   id: string,
 *   text: string,
 *   hasDef: boolean,
 *   hasMarker: boolean,
 *   orphan: boolean,
 * }} FootnoteEntry
 */

/**
 * @typedef {{
 *   available: boolean,
 *   path: string | null,
 *   title: string | null,
 *   markers: number,
 *   defs: number,
 *   orphans: number,
 *   entries: FootnoteEntry[],
 * }} Snapshot
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  idMode: 'auto',
  prefix: 'fn',
  copyOnInsert: false,
}

/** @type {Settings} */
let settings = { ...DEFAULT_SETTINGS }

/** @type {FaNotes.Panel | null} */
let panel = null

/** @type {Snapshot} */
let snapshot = emptySnapshot()

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

/** @returns {Snapshot} */
function emptySnapshot() {
  return {
    available: false,
    path: null,
    title: null,
    markers: 0,
    defs: 0,
    orphans: 0,
    entries: [],
  }
}

/**
 * @param {unknown} raw
 * @returns {IdMode}
 */
function normalizeIdMode(raw) {
  return raw === 'prompt' ? 'prompt' : 'auto'
}

/**
 * Soft prefix: trim, keep [A-Za-z0-9_-], max length; empty → 'fn'.
 * @param {unknown} raw
 */
function normalizePrefix(raw) {
  let s = String(raw ?? '')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '')
  if (s.length > MAX_PREFIX_LEN) s = s.slice(0, MAX_PREFIX_LEN)
  return s || 'fn'
}

/**
 * Soft footnote id: trim, no `]` / newlines; allow letters, digits, _ - .
 * @param {unknown} raw
 * @returns {string | null}
 */
function normalizeFootnoteId(raw) {
  let s = String(raw ?? '').trim()
  if (!s || s.length > MAX_ID_LEN) return null
  if (/[\[\]\r\n]/.test(s)) return null
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(s)) return null
  return s
}

/**
 * @param {unknown} raw
 * @returns {Settings}
 */
function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const obj = /** @type {Record<string, unknown>} */ (raw)
  return {
    idMode: normalizeIdMode(obj.idMode),
    prefix: normalizePrefix(obj.prefix),
    copyOnInsert: obj.copyOnInsert === true,
  }
}

/** @returns {Settings} */
function cloneSettings() {
  return {
    idMode: settings.idMode,
    prefix: settings.prefix,
    copyOnInsert: settings.copyOnInsert,
  }
}

async function loadSettings() {
  try {
    const raw = await fanotes.storage.get(STORAGE_KEY)
    settings = normalizeSettings(raw)
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
async function persistSettings(rollback) {
  try {
    await fanotes.storage.set(STORAGE_KEY, {
      idMode: settings.idMode,
      prefix: settings.prefix,
      copyOnInsert: settings.copyOnInsert === true,
    })
    return true
  } catch (error) {
    if (rollback) {
      settings = {
        idMode: rollback.idMode,
        prefix: rollback.prefix,
        copyOnInsert: rollback.copyOnInsert,
      }
    }
    await fanotes.ui.toast(
      t(`Speichern fehlgeschlagen: ${errMessage(error)}`, `Save failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

/**
 * Truncate display string to maxLen (append … when cut).
 * @param {string} s
 * @param {number} maxLen
 */
function truncate(s, maxLen) {
  const str = String(s ?? '')
  if (str.length <= maxLen) return str
  if (maxLen <= 1) return '…'
  return `${str.slice(0, maxLen - 1)}…`
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
 * Text: editor.getText() || notes.read(active). Active only.
 * @returns {Promise<{ available: boolean, text: string, path: string | null, title: string | null, viaEditor: boolean }>}
 */
async function readActiveText() {
  /** @type {FaNotes.ActiveNote | null} */
  let active = null
  try {
    active = await fanotes.notes.active()
  } catch (error) {
    fanotes.log('notes.active failed', errMessage(error))
  }

  const path = active && typeof active.path === 'string' ? active.path : null
  const titleRaw = active && typeof active.title === 'string' ? active.title.trim() : ''
  const title = path ? titleRaw || basenameNoExt(path) || path : null

  try {
    const editorText = await fanotes.editor.getText()
    if (editorText !== null && editorText !== undefined) {
      return {
        available: true,
        text: String(editorText),
        path,
        title,
        viaEditor: true,
      }
    }
  } catch (error) {
    fanotes.log('editor.getText failed', errMessage(error))
  }

  if (!path) {
    return { available: false, text: '', path: null, title: null, viaEditor: false }
  }

  if (active && active.kind && active.kind !== 'markdown' && active.kind !== 'none') {
    return { available: false, text: '', path, title, viaEditor: false }
  }

  try {
    const text = await fanotes.notes.read(path)
    return {
      available: true,
      text: String(text ?? ''),
      path,
      title,
      viaEditor: false,
    }
  } catch (error) {
    fanotes.log('notes.read failed', errMessage(error))
    return { available: false, text: '', path, title, viaEditor: false }
  }
}

/**
 * Append / replace full text — prefer editor.setText (no notes:write).
 * @param {string} content
 * @returns {Promise<boolean>}
 */
async function writeActiveText(content) {
  try {
    const ok = await fanotes.editor.setText(content)
    if (ok) return true
  } catch (error) {
    fanotes.log('editor.setText failed', errMessage(error))
  }
  await fanotes.ui.toast(
    t(
      'Schreiben fehlgeschlagen (Markdown-Editor nötig).',
      'Write failed (Markdown editor required).',
    ),
    'error',
  )
  return false
}

/**
 * Parse defs and markers from note text.
 * defs: /^\[\^([^\]]+)\]:\s*(.*)$/ per line
 * markers: \[\^([^\]]+)\](?!:)
 * @param {string} text
 * @returns {{ defMap: Map<string, string>, markerIds: Set<string>, markerCount: number }}
 */
function parseFootnotes(text) {
  const normalised = String(text ?? '').replace(/\r\n|\r/g, '\n')
  /** @type {Map<string, string>} */
  const defMap = new Map()
  const lines = normalised.split('\n')
  for (const line of lines) {
    const m = DEF_LINE_RE.exec(line)
    if (!m) continue
    const id = m[1]
    const body = m[2] ?? ''
    if (!defMap.has(id)) defMap.set(id, body)
  }

  /** @type {Set<string>} */
  const markerIds = new Set()
  let markerCount = 0
  MARKER_RE.lastIndex = 0
  let match
  while ((match = MARKER_RE.exec(normalised)) !== null) {
    markerIds.add(match[1])
    markerCount += 1
  }

  return { defMap, markerIds, markerCount }
}

/**
 * Build list entries: defs first, then marker-only orphans.
 * @param {string} text
 * @returns {{ markers: number, defs: number, orphans: number, entries: FootnoteEntry[] }}
 */
function buildEntries(text) {
  const { defMap, markerIds, markerCount } = parseFootnotes(text)
  /** @type {FootnoteEntry[]} */
  const entries = []

  for (const [id, body] of defMap) {
    const hasMarker = markerIds.has(id)
    entries.push({
      id,
      text: body,
      hasDef: true,
      hasMarker,
      orphan: !hasMarker,
    })
  }

  for (const id of markerIds) {
    if (defMap.has(id)) continue
    entries.push({
      id,
      text: '',
      hasDef: false,
      hasMarker: true,
      orphan: true,
    })
  }

  entries.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))

  let orphans = 0
  for (const e of entries) {
    if (e.orphan) orphans += 1
  }

  return {
    markers: markerCount,
    defs: defMap.size,
    orphans,
    entries,
  }
}

/**
 * Soft auto id: next free `${prefix}${n}` n=1.. checking markers + defs.
 * @param {string} text
 * @param {string} prefix
 */
function nextAutoId(text, prefix) {
  const { defMap, markerIds } = parseFootnotes(text)
  /** @type {Set<string>} */
  const used = new Set([...defMap.keys(), ...markerIds])
  let n = 1
  while (n < 100000) {
    const id = `${prefix}${n}`
    if (!used.has(id)) return id
    n += 1
  }
  return `${prefix}${Date.now()}`
}

/**
 * True if a def line for id already exists.
 * @param {string} text
 * @param {string} id
 */
function hasDef(text, id) {
  const { defMap } = parseFootnotes(text)
  return defMap.has(id)
}

/**
 * Ensure `[^id]: ` definition line at end (trailing space for typing).
 * @param {string} id
 * @returns {Promise<boolean>}
 */
async function ensureDef(id) {
  const read = await readActiveText()
  if (!read.available) {
    await fanotes.ui.toast(
      t('Keine aktive Notiz.', 'No active note.'),
      'error',
    )
    return false
  }
  if (hasDef(read.text, id)) return true

  if (!read.viaEditor) {
    await fanotes.ui.toast(
      t(
        'Definition anhängen braucht den Markdown-Editor.',
        'Appending a definition requires the Markdown editor.',
      ),
      'error',
    )
    return false
  }

  let base = String(read.text)
  // Soft: avoid more than two trailing newlines before append
  base = base.replace(/\n*$/, '')
  const next = `${base}\n\n[^${id}]: `
  return writeActiveText(next)
}

/**
 * Insert `[^id]` at cursor via editor.insert.
 * @param {string} id
 * @returns {Promise<boolean>}
 */
async function insertMarker(id) {
  const marker = `[^${id}]`
  try {
    const ok = await fanotes.editor.insert(marker, 'cursor')
    if (!ok) {
      await fanotes.ui.toast(
        t('Kein Markdown-Editor geöffnet.', 'No Markdown editor is open.'),
        'error',
      )
      return false
    }
    return true
  } catch (error) {
    await fanotes.ui.toast(
      t(`Einfügen fehlgeschlagen: ${errMessage(error)}`, `Insert failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

/**
 * Soft clipboard: write `[^id]` when copyOnInsert.
 * @param {string} id
 */
async function maybeCopyMarker(id) {
  if (!settings.copyOnInsert) return
  const marker = `[^${id}]`
  try {
    const ok = await fanotes.clipboard.writeText(marker)
    if (ok === false) {
      await fanotes.ui.toast(
        t('Kopieren fehlgeschlagen.', 'Copy failed.'),
        'error',
      )
    }
  } catch (error) {
    await fanotes.ui.toast(
      t(`Kopieren fehlgeschlagen: ${errMessage(error)}`, `Copy failed: ${errMessage(error)}`),
      'error',
    )
  }
}

/**
 * Resolve id from mode (auto / prompt), insert marker, ensureDef, optional copy.
 * @returns {Promise<boolean>}
 */
async function insertFootnote() {
  try {
    const read = await readActiveText()
    if (!read.available && settings.idMode === 'auto') {
      // Soft: still allow insert if editor open even when read failed? Prefer fail clear.
      await fanotes.ui.toast(
        t(
          'Keine aktive Notiz / kein Editortext.',
          'No active note / no editor text.',
        ),
        'error',
      )
      return false
    }

    /** @type {string | null} */
    let id = null

    if (settings.idMode === 'prompt') {
      let value = null
      try {
        value = await fanotes.ui.prompt(
          t('Fußnoten-ID:', 'Footnote id:'),
          {
            title: t('Fußnote einfügen', 'Insert footnote'),
            placeholder: t('z. B. fn1 oder quelle', 'e.g. fn1 or source'),
            value: settings.prefix,
          },
        )
      } catch (error) {
        await fanotes.ui.toast(
          t(`Eingabe fehlgeschlagen: ${errMessage(error)}`, `Prompt failed: ${errMessage(error)}`),
          'error',
        )
        return false
      }
      if (value == null) return false
      id = normalizeFootnoteId(value)
      if (!id) {
        await fanotes.ui.toast(
          t(
            'Ungültige ID (Buchstaben, Ziffern, _.-; kein ]).',
            'Invalid id (letters, digits, _.-; no ]).',
          ),
          'info',
        )
        return false
      }
    } else {
      id = nextAutoId(read.text || '', settings.prefix)
    }

    const inserted = await insertMarker(id)
    if (!inserted) return false

    const ensured = await ensureDef(id)
    if (!ensured) {
      // Marker may already be in; still report partial success
      await fanotes.ui.toast(
        t(
          `Marker [^${id}] eingefügt, Definition fehlt.`,
          `Marker [^${id}] inserted; definition missing.`,
        ),
        'info',
      )
      await maybeCopyMarker(id)
      await refreshSnapshot({ silent: true })
      await refreshPanel()
      return true
    }

    await maybeCopyMarker(id)
    await fanotes.ui.toast(
      t(`Fußnote eingefügt: [^${id}]`, `Footnote inserted: [^${id}]`),
      'success',
    )
    await refreshSnapshot({ silent: true })
    await refreshPanel()
    return true
  } catch (error) {
    await fanotes.ui.toast(
      t(`Einfügen fehlgeschlagen: ${errMessage(error)}`, `Insert failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

/**
 * Refresh snapshot from active note.
 * @param {{ silent?: boolean }} [opts]
 * @returns {Promise<boolean>}
 */
async function refreshSnapshot(opts) {
  try {
    const read = await readActiveText()
    if (!read.available) {
      snapshot = emptySnapshot()
      snapshot.path = read.path
      snapshot.title = read.title
      if (!opts?.silent) {
        await fanotes.ui.toast(
          t('Keine aktive Notiz.', 'No active note.'),
          'info',
        )
      }
      return false
    }
    const built = buildEntries(read.text)
    snapshot = {
      available: true,
      path: read.path,
      title: read.title,
      markers: built.markers,
      defs: built.defs,
      orphans: built.orphans,
      entries: built.entries,
    }
    return true
  } catch (error) {
    fanotes.log('refreshSnapshot failed', errMessage(error))
    if (!opts?.silent) {
      await fanotes.ui.toast(
        t(
          `Aktualisieren fehlgeschlagen: ${errMessage(error)}`,
          `Refresh failed: ${errMessage(error)}`,
        ),
        'error',
      )
    }
    return false
  }
}

/**
 * list command: refresh + open panel + toast summary.
 */
async function listFootnotes() {
  const ok = await refreshSnapshot({ silent: true })
  openPanel()
  if (!ok) {
    await fanotes.ui.toast(
      t('Keine aktive Notiz zum Auflisten.', 'No active note to list.'),
      'info',
    )
    return
  }
  await fanotes.ui.toast(
    t(
      `Fußnoten: ${snapshot.defs} Def., ${snapshot.markers} Marker, ${snapshot.orphans} Waise`,
      `Footnotes: ${snapshot.defs} defs, ${snapshot.markers} markers, ${snapshot.orphans} orphans`,
    ),
    'success',
  )
}

/**
 * Soft: apply panel values into settings (not persist alone).
 * @param {Record<string, unknown> | undefined} values
 */
function applyValues(values) {
  if (!values || typeof values !== 'object') return
  if ('idMode' in values) {
    settings.idMode = normalizeIdMode(values.idMode)
  }
  if ('prefix' in values) {
    settings.prefix = normalizePrefix(values.prefix)
  }
  if ('copyOnInsert' in values) {
    settings.copyOnInsert = values.copyOnInsert === true || values.copyOnInsert === 'true'
  }
}

function renderBlocks() {
  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Fußnoten-Werkzeuge', 'Footnote Tools'), level: 2 },
    {
      type: 'text',
      muted: true,
      text: t(
        'Markdown-Fußnoten `[^id]` einfügen und Definitionen `[^id]:` in der aktiven Notiz listen.',
        'Insert Markdown footnotes `[^id]` and list definitions `[^id]:` in the active note.',
      ),
    },
    {
      type: 'select',
      id: 'idMode',
      label: t('ID-Modus', 'Id mode'),
      value: settings.idMode,
      options: [
        { value: 'auto', label: t('Automatisch (prefix + n)', 'Auto (prefix + n)') },
        { value: 'prompt', label: t('Nachfragen', 'Prompt') },
      ],
    },
    {
      type: 'input',
      id: 'prefix',
      label: t('Präfix (auto)', 'Prefix (auto)'),
      value: settings.prefix,
      placeholder: 'fn',
    },
    {
      type: 'checkbox',
      id: 'copyOnInsert',
      label: t('Marker nach Einfügen kopieren', 'Copy marker after insert'),
      checked: settings.copyOnInsert === true,
    },
    {
      type: 'button',
      id: 'insert',
      label: t('Fußnote einfügen', 'Insert footnote'),
      primary: true,
    },
    { type: 'divider' },
  ]

  if (!snapshot.available) {
    blocks.push({
      type: 'callout',
      tone: 'info',
      text: t(
        'Keine aktive Notiz. Öffne eine Markdown-Notiz und tippe Aktualisieren.',
        'No active note. Open a Markdown note and tap Refresh.',
      ),
    })
  } else {
    blocks.push({
      type: 'text',
      muted: true,
      text: snapshot.title || snapshot.path || '',
    })
    blocks.push({
      type: 'keyvalue',
      items: [
        { key: t('Marker', 'Markers'), value: String(snapshot.markers) },
        { key: t('Definitionen', 'Definitions'), value: String(snapshot.defs) },
        { key: t('Waisen', 'Orphans'), value: String(snapshot.orphans) },
      ],
    })

    const defEntries = snapshot.entries.filter((e) => e.hasDef)
    const markerOnly = snapshot.entries.filter((e) => !e.hasDef && e.hasMarker)

    /** @type {Array<{ id: string, title: string, detail?: string, badge?: string }>} */
    const items = defEntries.map((e) => {
      /** @type {{ id: string, title: string, detail?: string, badge?: string }} */
      const item = {
        id: `def:${e.id}`,
        title: e.id,
        detail: truncate(e.text || t('(leer)', '(empty)'), LIST_DETAIL_LEN),
      }
      if (e.orphan) item.badge = t('Waise', 'orphan')
      return item
    })

    for (const e of markerOnly) {
      items.push({
        id: `mark:${e.id}`,
        title: e.id,
        detail: t('(keine Definition)', '(no definition)'),
        badge: t('Waise', 'orphan'),
      })
    }

    blocks.push({
      type: 'list',
      id: 'defs',
      empty: t('Keine Fußnoten in dieser Notiz.', 'No footnotes in this note.'),
      items,
    })
  }

  blocks.push({ type: 'divider' })
  blocks.push({
    type: 'button',
    id: 'refresh',
    label: t('Aktualisieren', 'Refresh'),
  })

  return blocks
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Fußnoten-Werkzeuge', 'Footnote Tools'))
  } catch (error) {
    if (isNoPanel(error)) {
      panel = null
      return
    }
    fanotes.log('refreshPanel', errMessage(error))
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
        await refreshSnapshot({ silent: true })
        await refreshPanel()
      })()
      return
    }

    panel = fanotes.ui.panel({
      id: PANEL_ID,
      title: t('Fußnoten-Werkzeuge', 'Footnote Tools'),
      icon: '※',
      blocks: renderBlocks(),
    })

    panel.onAction(async (action) => {
      try {
        if (typeof action.id === 'string' && action.id.startsWith('submit:')) {
          applyValues(action.values)
          const prev = cloneSettings()
          await persistSettings(prev)
          await refreshPanel()
          return
        }

        if (action.id === 'insert') {
          applyValues(action.values)
          const prev = cloneSettings()
          await persistSettings(prev)
          await insertFootnote()
          return
        }

        if (action.id === 'refresh') {
          applyValues(action.values)
          const prev = cloneSettings()
          await persistSettings(prev)
          await refreshSnapshot({ silent: false })
          await refreshPanel()
          return
        }

        if (action.id === 'defs' && action.itemId) {
          // Soft: copy [^id] on list click
          const raw = String(action.itemId)
          const id = raw.includes(':') ? raw.slice(raw.indexOf(':') + 1) : raw
          if (id) {
            try {
              await fanotes.clipboard.writeText(`[^${id}]`)
              await fanotes.ui.toast(
                t(`[^${id}] kopiert.`, `[^${id}] copied.`),
                'success',
              )
            } catch (error) {
              await fanotes.ui.toast(
                t(`Kopieren fehlgeschlagen: ${errMessage(error)}`, `Copy failed: ${errMessage(error)}`),
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
        const prev = cloneSettings()
        if (input.id === 'idMode') {
          settings.idMode = normalizeIdMode(input.value)
        } else if (input.id === 'prefix') {
          settings.prefix = normalizePrefix(input.value)
        } else if (input.id === 'copyOnInsert') {
          settings.copyOnInsert = input.value === true
        } else {
          return
        }
        applyValues(input.values)
        const ok = await persistSettings(prev)
        if (!ok) await refreshPanel()
        else await refreshPanel()
      } catch (error) {
        fanotes.log('onInput', errMessage(error))
      }
    })

    void (async () => {
      await refreshSnapshot({ silent: true })
      await refreshPanel()
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
  id: 'insert',
  title: t('Fußnote einfügen', 'Insert footnote'),
  detail: t(
    'Markdown-Marker [^id] an der Cursorposition; Definition am Ende ergänzen',
    'Insert Markdown marker [^id] at the cursor; append definition at the end',
  ),
  keywords: 'footnote fußnote reference referenz markdown cite endnote einfügen insert',
  run: async () => {
    try {
      await insertFootnote()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'list',
  title: t('Fußnoten auflisten', 'List footnotes'),
  detail: t(
    'Definitionen und Marker der aktiven Notiz anzeigen',
    'Show definitions and markers of the active note',
  ),
  keywords: 'footnote fußnote list liste definition marker orphan waise',
  run: async () => {
    try {
      await listFootnotes()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'open',
  title: t('Fußnoten-Werkzeuge öffnen', 'Open Footnote Tools'),
  detail: t(
    'Panel mit ID-Modus, Präfix und Definitionen',
    'Panel with id mode, prefix, and definitions',
  ),
  keywords: 'footnote fußnote öffnen open panel werkzeuge tools',
  run: () => {
    try {
      openPanel()
    } catch (error) {
      void fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.onActivate(async () => {
  try {
    await loadSettings()
    fanotes.log(
      'footnote-tools activated',
      fanotes.app.appVersion,
      settings.idMode,
      settings.prefix,
      settings.copyOnInsert,
    )
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(() => {
  panel = null
  snapshot = emptySnapshot()
})
