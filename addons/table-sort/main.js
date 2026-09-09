/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Tabellen sortieren / Table Sort – sort the Markdown pipe-table under the cursor
// by a chosen column (ascending/descending).
// Abgrenzung: table-inserter = leere Tabelle einfügen; line-tools = Zeilen;
// hier = Pipe-Tabelle body sortieren.
// Soft: no vault/network/notes/clipboard. Activate = load settings only.
// Mirror Soft: table-inserter / line-tools panel + storage patterns.

const STORAGE_KEY = 'settings'
const PANEL_ID = 'tsort'

/** Pipe-table line Soft: trimmed line matches /^\|.*\|$/ */
const TABLE_LINE_RE = /^\|.*\|$/

/**
 * GFM separator Soft: |---|:---:|---:|
 * Spec: /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?$/
 */
const SEPARATOR_RE = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?$/

/**
 * @typedef {{
 *   column: number,
 *   ascending: boolean,
 *   header: boolean,
 * }} Settings
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  column: 1,
  ascending: true,
  header: true,
}

/** @type {Settings} */
let settings = { ...DEFAULT_SETTINGS }

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

/**
 * Soft clamp integer to [min, max]; non-finite → fallback.
 * @param {unknown} raw
 * @param {number} min
 * @param {number} max
 * @param {number} fallback
 */
function clampInt(raw, min, max, fallback) {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return fallback
  const i = Math.floor(n)
  if (i < min) return min
  if (i > max) return max
  return i
}

/**
 * @param {unknown} raw
 * @returns {Settings}
 */
function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_SETTINGS }
  }
  const obj = /** @type {Record<string, unknown>} */ (raw)
  return {
    column: clampInt(obj.column, 1, 100, DEFAULT_SETTINGS.column),
    ascending: obj.ascending !== false,
    header: obj.header !== false,
  }
}

/**
 * @returns {Settings}
 */
function cloneSettings() {
  return {
    column: settings.column,
    ascending: settings.ascending,
    header: settings.header,
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
      column: settings.column,
      ascending: settings.ascending === true,
      header: settings.header === true,
    })
    return true
  } catch (error) {
    if (rollback) {
      settings = {
        column: rollback.column,
        ascending: rollback.ascending,
        header: rollback.header,
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
 * Locale for localeCompare Soft via app language.
 * @returns {string | undefined}
 */
function getCompareLocale() {
  const appLang = String(fanotes.app.language || '').toLowerCase()
  if (appLang === 'de') return 'de'
  if (appLang === 'en') return 'en'
  return undefined
}

/**
 * Character offset → 0-based line index.
 * @param {string} text
 * @param {number} offset
 */
function offsetToLineIndex(text, offset) {
  const safe = Math.max(0, Math.min(offset, text.length))
  let line = 0
  for (let i = 0; i < safe; i++) {
    if (text.charCodeAt(i) === 10) line++
  }
  return line
}

/**
 * Soft: prefer sel.line (1-based) when present; else derive from sel.from.
 * @param {string} text
 * @param {FaNotes.Selection | null} sel
 */
function cursorLineIndex(text, sel) {
  if (!sel) return 0
  if (typeof sel.line === 'number' && Number.isFinite(sel.line) && sel.line >= 1) {
    return Math.max(0, Math.floor(sel.line) - 1)
  }
  if (typeof sel.from === 'number' && Number.isFinite(sel.from)) {
    return offsetToLineIndex(text, sel.from)
  }
  return 0
}

/**
 * @param {string} line
 */
function isTableLine(line) {
  return TABLE_LINE_RE.test(String(line).trim())
}

/**
 * @param {string} line
 */
function isSeparatorLine(line) {
  return SEPARATOR_RE.test(String(line).trim())
}

/**
 * Parse pipe cells Soft; missing/empty Soft as ''.
 * @param {string} line
 * @returns {string[]}
 */
function parseCells(line) {
  let s = String(line).trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  return s.split('|').map((c) => c.trim())
}

/**
 * Rebuild a pipe row from cells Soft `| a | b |`.
 * @param {string[]} cells
 */
function formatRow(cells) {
  return '| ' + cells.map((c) => (c == null ? '' : String(c))).join(' | ') + ' |'
}

/**
 * Contiguous pipe-table Soft containing cursor line; need ≥2 rows.
 * @param {string[]} lines
 * @param {number} cursorIdx 0-based
 * @returns {{ start: number, end: number, rows: string[] } | null}
 */
function findTableBlock(lines, cursorIdx) {
  if (lines.length === 0) return null
  let idx = cursorIdx
  if (idx < 0) idx = 0
  if (idx >= lines.length) idx = lines.length - 1

  if (!isTableLine(lines[idx])) {
    // Soft: if cursor sits on blank between tables Soft, no match
    return null
  }

  let start = idx
  while (start > 0 && isTableLine(lines[start - 1])) start--
  let end = idx
  while (end + 1 < lines.length && isTableLine(lines[end + 1])) end++

  const rows = lines.slice(start, end + 1)
  if (rows.length < 2) return null
  return { start, end, rows }
}

/**
 * Column count Soft = max cells across rows.
 * @param {string[][]} cellRows
 */
function maxCols(cellRows) {
  let m = 0
  for (const row of cellRows) {
    if (row.length > m) m = row.length
  }
  return m
}

/**
 * Pad/truncate Soft to `cols`; missing Soft ''.
 * @param {string[]} cells
 * @param {number} cols
 */
function padCells(cells, cols) {
  /** @type {string[]} */
  const out = []
  for (let i = 0; i < cols; i++) {
    out.push(i < cells.length ? cells[i] : '')
  }
  return out
}

/**
 * Sort body Soft: localeCompare numeric via app language; stable enough.
 * @param {string[][]} body
 * @param {number} colIdx 0-based
 * @param {boolean} ascending
 */
function sortBody(body, colIdx, ascending) {
  const locale = getCompareLocale()
  const indexed = body.map((row, i) => ({
    row,
    i,
    key: colIdx < row.length ? row[colIdx] : '',
  }))
  indexed.sort((a, b) => {
    const cmp = String(a.key).localeCompare(String(b.key), locale, {
      numeric: true,
      sensitivity: 'base',
    })
    if (cmp !== 0) return ascending ? cmp : -cmp
    return a.i - b.i
  })
  return indexed.map((x) => x.row)
}

/**
 * Build sorted table lines Soft from detected block.
 * @param {string[]} rawRows
 * @param {{ column: number, ascending: boolean, header: boolean }} opts
 * @returns {{ lines: string[], column: number, bodyCount: number } | null}
 */
function sortTableRows(rawRows, opts) {
  if (!rawRows || rawRows.length < 2) return null

  const useHeader = opts.header === true
  /** @type {string | null} */
  let headerLine = null
  /** @type {string | null} */
  let separatorLine = null
  /** @type {string[]} */
  let bodyRaw = []

  if (useHeader) {
    // row0 header Soft; row1 must be separator Soft else treat all as body
    if (rawRows.length >= 2 && isSeparatorLine(rawRows[1])) {
      headerLine = rawRows[0]
      separatorLine = rawRows[1]
      bodyRaw = rawRows.slice(2)
    } else {
      bodyRaw = rawRows.slice()
    }
  } else {
    bodyRaw = rawRows.slice()
  }

  if (bodyRaw.length === 0) {
    // Only header+sep Soft — nothing to sort Soft but still "ok" rewrite
    /** @type {string[]} */
    const only = []
    if (headerLine != null) only.push(headerLine)
    if (separatorLine != null) only.push(separatorLine)
    if (only.length < 2 && rawRows.length >= 2) {
      // Fall through Soft: treat all as body if we somehow have no body
      bodyRaw = rawRows.slice()
      headerLine = null
      separatorLine = null
    } else if (only.length >= 1) {
      return { lines: only.length ? only : rawRows.slice(), column: 1, bodyCount: 0 }
    }
  }

  const headerCells = headerLine != null ? parseCells(headerLine) : []
  const bodyCells = bodyRaw.map(parseCells)
  const cols = Math.max(maxCols(bodyCells), headerCells.length, 1)
  const col = clampInt(opts.column, 1, cols, 1)
  const colIdx = col - 1

  const padded = bodyCells.map((c) => padCells(c, cols))
  const sorted = sortBody(padded, colIdx, opts.ascending === true)

  /** @type {string[]} */
  const out = []
  if (headerLine != null) {
    out.push(formatRow(padCells(headerCells, cols)))
  }
  if (separatorLine != null) {
    // Keep original separator Soft when present
    out.push(separatorLine.trim().startsWith('|') ? separatorLine.trim() : separatorLine)
  }
  for (const row of sorted) {
    out.push(formatRow(row))
  }

  return { lines: out, column: col, bodyCount: sorted.length }
}

/**
 * Soft write: replace only that table slice in full text via editor.setText.
 * @param {{ column?: number, ascending?: boolean, header?: boolean, persist?: boolean }} [override]
 * @returns {Promise<boolean>}
 */
async function runSort(override) {
  const column = override?.column != null ? override.column : settings.column
  const ascending = override?.ascending != null ? override.ascending : settings.ascending
  const header = override?.header != null ? override.header : settings.header
  const shouldPersist = override?.persist !== false

  try {
    let text = null
    try {
      text = await fanotes.editor.getText()
    } catch (error) {
      fanotes.log('getText failed', errMessage(error))
      text = null
    }

    if (text == null) {
      await fanotes.ui.toast(
        t('Kein Markdown-Editor geöffnet.', 'No Markdown editor is open.'),
        'error',
      )
      return false
    }

    let sel = null
    try {
      sel = await fanotes.editor.getSelection()
    } catch (error) {
      fanotes.log('getSelection failed', errMessage(error))
      sel = null
    }

    const lines = text.split('\n')
    const cursorIdx = cursorLineIndex(text, sel)
    const block = findTableBlock(lines, cursorIdx)

    if (!block) {
      await fanotes.ui.toast(
        t(
          'Keine Markdown-Tabelle unter dem Cursor gefunden.',
          'No Markdown table found under the cursor.',
        ),
        'error',
      )
      return false
    }

    const sorted = sortTableRows(block.rows, {
      column,
      ascending: ascending === true,
      header: header === true,
    })

    if (!sorted) {
      await fanotes.ui.toast(
        t(
          'Keine Markdown-Tabelle unter dem Cursor gefunden.',
          'No Markdown table found under the cursor.',
        ),
        'error',
      )
      return false
    }

    const newLines = [
      ...lines.slice(0, block.start),
      ...sorted.lines,
      ...lines.slice(block.end + 1),
    ]
    const newText = newLines.join('\n')

    let ok = false
    try {
      ok = await fanotes.editor.setText(newText)
    } catch (error) {
      fanotes.log('setText failed', errMessage(error))
      ok = false
    }

    if (!ok) {
      await fanotes.ui.toast(
        t('Tabelle konnte nicht geschrieben werden.', 'Could not write the table.'),
        'error',
      )
      return false
    }

    if (shouldPersist) {
      const prev = cloneSettings()
      settings.column = sorted.column
      settings.ascending = ascending === true
      settings.header = header === true
      const saved = await persistSettings(prev)
      if (!saved) {
        await refreshPanel()
        // Sort already applied Soft — still report success of sort
      } else {
        await refreshPanel()
      }
    } else {
      await refreshPanel()
    }

    const dir = ascending
      ? t('aufsteigend', 'ascending')
      : t('absteigend', 'descending')
    await fanotes.ui.toast(
      t(
        `Tabelle nach Spalte ${sorted.column} ${dir} sortiert (${sorted.bodyCount} Zeilen)`,
        `Table sorted by column ${sorted.column} ${dir} (${sorted.bodyCount} rows)`,
      ),
      'success',
    )
    return true
  } catch (error) {
    await fanotes.ui.toast(
      t(`Sortieren fehlgeschlagen: ${errMessage(error)}`, `Sort failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

/** sort Soft — current settings. */
async function runSortCurrent() {
  await runSort({
    column: settings.column,
    ascending: settings.ascending,
    header: settings.header,
    persist: true,
  })
}

/** sort-desc Soft: force ascending=false once Soft (do not persist the forced false). */
async function runSortDescOnce() {
  await runSort({
    column: settings.column,
    ascending: false,
    header: settings.header,
    persist: false,
  })
}

/**
 * Soft: apply values from panel action.values / onInput into settings
 * (clamped); does not persist by itself.
 * @param {Record<string, unknown> | undefined} values
 */
function applyValues(values) {
  if (!values || typeof values !== 'object') return
  if ('column' in values) {
    settings.column = clampInt(values.column, 1, 100, settings.column)
  }
  if ('ascending' in values) {
    settings.ascending = values.ascending === true || values.ascending === 'true'
  }
  if ('header' in values) {
    settings.header = values.header === true || values.header === 'true'
  }
}

function renderBlocks() {
  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Tabellen sortieren', 'Table Sort'), level: 2 },
    {
      type: 'text',
      muted: true,
      text: t(
        'Sortiert die Markdown-Pipe-Tabelle unter dem Cursor nach einer Spalte (Körperzeilen).',
        'Sorts the Markdown pipe-table under the cursor by a column (body rows).',
      ),
    },
    {
      type: 'keyvalue',
      items: [
        {
          key: t('Spalte', 'Column'),
          value: String(settings.column),
        },
        {
          key: t('Richtung', 'Direction'),
          value: settings.ascending
            ? t('aufsteigend', 'ascending')
            : t('absteigend', 'descending'),
        },
        {
          key: t('Kopfzeile', 'Header'),
          value: settings.header ? t('ja', 'yes') : t('nein', 'no'),
        },
      ],
    },
    { type: 'divider' },
    { type: 'heading', text: t('Optionen', 'Options'), level: 3 },
    {
      type: 'input',
      id: 'column',
      label: t('Spalte (1-basiert)', 'Column (1-based)'),
      value: String(settings.column),
      placeholder: '1',
    },
    {
      type: 'checkbox',
      id: 'ascending',
      label: t('Aufsteigend', 'Ascending'),
      checked: settings.ascending === true,
    },
    {
      type: 'checkbox',
      id: 'header',
      label: t('Erste Zeile ist Kopfzeile (+ Trenner)', 'First row is header (+ separator)'),
      checked: settings.header === true,
    },
    {
      type: 'callout',
      tone: 'info',
      text: t(
        'Pipe-Tabelle am Cursor sortieren — nicht leere Tabelle einfügen (→ table-inserter), nicht freie Zeilen (→ line-tools). Kein Vault.',
        'Sorts the pipe-table at the cursor — not inserting an empty table (→ table-inserter), not free lines (→ line-tools). No vault.',
      ),
    },
    { type: 'divider' },
    {
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'sort',
          label: t('Sortieren', 'Sort'),
          primary: true,
        },
      ],
    },
  ]

  return blocks
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Tabellen sortieren', 'Table Sort'))
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
      void refreshPanel()
      return
    }

    panel = fanotes.ui.panel({
      id: PANEL_ID,
      title: t('Tabellen sortieren', 'Table Sort'),
      icon: '⇅',
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

        if (action.id === 'sort') {
          applyValues(action.values)
          await runSort({
            column: settings.column,
            ascending: settings.ascending,
            header: settings.header,
            persist: true,
          })
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
        const prev = cloneSettings()
        if (input.id === 'column') {
          settings.column = clampInt(input.value, 1, 100, settings.column)
        } else if (input.id === 'ascending') {
          settings.ascending = input.value === true
        } else if (input.id === 'header') {
          settings.header = input.value === true
        } else {
          return
        }
        applyValues(input.values)
        const ok = await persistSettings(prev)
        await refreshPanel()
        if (!ok) return
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

fanotes.commands.register({
  id: 'sort',
  title: t('Tabelle sortieren', 'Sort table'),
  detail: t(
    'Markdown-Tabelle unter dem Cursor nach gespeicherter Spalte sortieren',
    'Sort the Markdown table under the cursor by the saved column',
  ),
  keywords: 'table tabelle sort sortieren markdown column spalte grid',
  run: async () => {
    try {
      await runSortCurrent()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'sort-desc',
  title: t('Tabelle absteigend sortieren', 'Sort table descending'),
  detail: t(
    'Einmal absteigend sortieren (ohne die Aufsteigend-Einstellung zu ändern)',
    'Sort descending once (without changing the ascending setting)',
  ),
  keywords: 'table tabelle sort desc absteigend markdown column spalte',
  run: async () => {
    try {
      await runSortDescOnce()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'open',
  title: t('Tabellen sortieren öffnen', 'Open Table Sort'),
  detail: t(
    'Panel mit Spalte, Richtung und Kopfzeile',
    'Panel with column, direction, and header',
  ),
  keywords: 'table tabelle sort sortieren öffnen open panel column spalte',
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
      'table-sort activated',
      fanotes.app.appVersion,
      settings.column,
      settings.ascending,
      settings.header,
    )
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(() => {
  panel = null
})
