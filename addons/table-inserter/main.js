/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Tabellen-Einfüger / Table Inserter – insert an empty Markdown (GFM) table
// with chosen rows/columns at the cursor.
// Abgrenzung: template-library = freie Vorlagen; math-snippets = Formeln;
// callout-inserter = Callouts; hier = generische Gitter-Tabelle.
// Activate = load settings only. Soft: no notes / vault / network / clipboard.

const STORAGE_KEY = 'settings'
const PANEL_ID = 'table'
const DEFAULT_MAX_ROWS = 20
const DEFAULT_MAX_COLS = 10

/**
 * @typedef {{
 *   rows: number,
 *   cols: number,
 *   header: boolean,
 *   maxRows: number,
 *   maxCols: number,
 * }} Settings
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  rows: 3,
  cols: 3,
  header: true,
  maxRows: DEFAULT_MAX_ROWS,
  maxCols: DEFAULT_MAX_COLS,
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
  const maxRows = clampInt(obj.maxRows, 1, 100, DEFAULT_MAX_ROWS)
  const maxCols = clampInt(obj.maxCols, 1, 50, DEFAULT_MAX_COLS)
  return {
    rows: clampInt(obj.rows, 1, maxRows, DEFAULT_SETTINGS.rows),
    cols: clampInt(obj.cols, 1, maxCols, DEFAULT_SETTINGS.cols),
    header: obj.header !== false,
    maxRows,
    maxCols,
  }
}

/**
 * @returns {Settings}
 */
function cloneSettings() {
  return {
    rows: settings.rows,
    cols: settings.cols,
    header: settings.header,
    maxRows: settings.maxRows,
    maxCols: settings.maxCols,
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
      rows: settings.rows,
      cols: settings.cols,
      header: settings.header === true,
      maxRows: settings.maxRows,
      maxCols: settings.maxCols,
    })
    return true
  } catch (error) {
    if (rollback) {
      settings = {
        rows: rollback.rows,
        cols: rollback.cols,
        header: rollback.header,
        maxRows: rollback.maxRows,
        maxCols: rollback.maxCols,
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
 * Soft: `rows` = body rows; header adds one header line + separator when true.
 * Clamp rows/cols to 1..maxRows/maxCols. Empty body cells Soft `   `.
 * Separator Soft `|---|---|` (standard GFM).
 * @param {number} rows
 * @param {number} cols
 * @param {boolean} header
 * @param {{ maxRows?: number, maxCols?: number }} [limits]
 * @returns {string}
 */
function buildTable(rows, cols, header, limits) {
  const maxR = limits?.maxRows ?? settings.maxRows ?? DEFAULT_MAX_ROWS
  const maxC = limits?.maxCols ?? settings.maxCols ?? DEFAULT_MAX_COLS
  const r = clampInt(rows, 1, maxR, 1)
  const c = clampInt(cols, 1, maxC, 1)
  const withHeader = header === true

  /** @type {string[]} */
  const lines = []

  if (withHeader) {
    const headers = []
    for (let i = 1; i <= c; i++) {
      headers.push(t(`Spalte ${i}`, `Column ${i}`))
    }
    lines.push('| ' + headers.join(' | ') + ' |')
    lines.push('|' + Array.from({ length: c }, () => '---').join('|') + '|')
  }

  for (let row = 0; row < r; row++) {
    lines.push('|' + Array.from({ length: c }, () => '   ').join('|') + '|')
  }

  return lines.join('\n')
}

/**
 * Soft: prefer editor.insert(text, 'cursor'); if API fails Soft try
 * replaceSelection when selection is empty. Prefer insert only per Spec.
 * Toast if no editor / insert fails.
 * @param {string} text
 * @returns {Promise<boolean>}
 */
async function insertAtCursor(text) {
  try {
    let ok = false
    try {
      ok = await fanotes.editor.insert(text, 'cursor')
    } catch (insertErr) {
      fanotes.log('editor.insert failed Soft', errMessage(insertErr))
      ok = false
    }

    if (!ok) {
      // Soft fallback: replaceSelection only if selection is empty
      try {
        const sel = await fanotes.editor.getSelection()
        if (sel && sel.from === sel.to) {
          ok = await fanotes.editor.replaceSelection(text)
        }
      } catch {
        // Prefer insert only Soft — ignore fallback errors
      }
    }

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
 * Build table from given dims, insert at cursor, toast success/error.
 * Soft: optionally persist dims into settings after successful insert.
 * @param {number} rows
 * @param {number} cols
 * @param {boolean} header
 * @param {{ persist?: boolean }} [opts]
 * @returns {Promise<boolean>}
 */
async function insertTable(rows, cols, header, opts) {
  const table = buildTable(rows, cols, header)
  const ok = await insertAtCursor(table)
  if (!ok) return false

  if (opts?.persist !== false) {
    const prev = cloneSettings()
    settings.rows = clampInt(rows, 1, settings.maxRows, settings.rows)
    settings.cols = clampInt(cols, 1, settings.maxCols, settings.cols)
    settings.header = header === true
    const saved = await persistSettings(prev)
    if (!saved) {
      await refreshPanel()
      return false
    }
  }

  await fanotes.ui.toast(
    t(
      `Tabelle eingefügt (${clampInt(rows, 1, settings.maxRows, 1)}×${clampInt(cols, 1, settings.maxCols, 1)})`,
      `Table inserted (${clampInt(rows, 1, settings.maxRows, 1)}×${clampInt(cols, 1, settings.maxCols, 1)})`,
    ),
    'success',
  )
  await refreshPanel()
  return true
}

/** insert — use current settings. */
async function insertCurrent() {
  await insertTable(settings.rows, settings.cols, settings.header, { persist: true })
}

/**
 * insert-default — Soft: use DEFAULT_SETTINGS dims without overwriting
 * the user's saved settings.
 */
async function insertDefault() {
  await insertTable(
    DEFAULT_SETTINGS.rows,
    DEFAULT_SETTINGS.cols,
    DEFAULT_SETTINGS.header,
    { persist: false },
  )
}

/**
 * Soft: apply values from panel action.values / onInput into settings
 * (clamped); does not persist by itself.
 * @param {Record<string, unknown> | undefined} values
 */
function applyValues(values) {
  if (!values || typeof values !== 'object') return
  if ('rows' in values) {
    settings.rows = clampInt(values.rows, 1, settings.maxRows, settings.rows)
  }
  if ('cols' in values) {
    settings.cols = clampInt(values.cols, 1, settings.maxCols, settings.cols)
  }
  if ('header' in values) {
    settings.header = values.header === true || values.header === 'true'
  }
}

/**
 * Preview: first 6 lines of built table (muted).
 * @returns {string}
 */
function previewText() {
  const full = buildTable(settings.rows, settings.cols, settings.header)
  const lines = full.split('\n')
  const shown = lines.slice(0, 6)
  const more = lines.length > 6 ? '\n…' : ''
  return shown.join('\n') + more
}

function renderBlocks() {
  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Tabellen-Einfüger', 'Table Inserter'), level: 2 },
    {
      type: 'text',
      muted: true,
      text: t(
        'Leere Markdown-Tabelle (GFM) mit wählbaren Zeilen/Spalten an der Cursorposition einfügen.',
        'Insert an empty Markdown table (GFM) with chosen rows and columns at the cursor.',
      ),
    },
    {
      type: 'keyvalue',
      items: [
        {
          key: t('Aktuell', 'Current'),
          value: `${settings.rows}×${settings.cols}${settings.header ? t(' · Kopfzeile', ' · header') : ''}`,
        },
        {
          key: t('Maximum', 'Maximum'),
          value: `${settings.maxRows}×${settings.maxCols}`,
        },
      ],
    },
    { type: 'divider' },
    { type: 'heading', text: t('Größe', 'Size'), level: 3 },
    {
      type: 'row',
      children: [
        {
          type: 'input',
          id: 'rows',
          label: t('Zeilen (Körper)', 'Rows (body)'),
          value: String(settings.rows),
          placeholder: '3',
        },
        {
          type: 'input',
          id: 'cols',
          label: t('Spalten', 'Columns'),
          value: String(settings.cols),
          placeholder: '3',
        },
      ],
    },
    {
      type: 'checkbox',
      id: 'header',
      label: t('Kopfzeile (Spalte 1 …)', 'Header row (Column 1 …)'),
      checked: settings.header === true,
    },
    { type: 'divider' },
    { type: 'heading', text: t('Vorschau', 'Preview'), level: 3 },
    {
      type: 'text',
      muted: true,
      text: previewText(),
    },
    {
      type: 'callout',
      tone: 'info',
      text: t(
        'Generische Gitter-Tabelle — keine freien Vorlagen (→ template-library), keine Formeln (→ math-snippets), keine Callouts (→ callout-inserter). Soft: Zeilen = Körperzeilen; Kopfzeile kommt zusätzlich.',
        'Generic grid table — not freeform templates (→ template-library), not formulas (→ math-snippets), not callouts (→ callout-inserter). Soft: rows = body rows; header is extra when enabled.',
      ),
    },
    { type: 'divider' },
    {
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'insert',
          label: t('Einfügen', 'Insert'),
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
    await panel.setTitle(t('Tabellen-Einfüger', 'Table Inserter'))
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
      title: t('Tabellen-Einfüger', 'Table Inserter'),
      icon: '▦',
      blocks: renderBlocks(),
    })

    panel.onAction(async (action) => {
      try {
        // Enter on input → Soft sync values + refresh preview
        if (typeof action.id === 'string' && action.id.startsWith('submit:')) {
          applyValues(action.values)
          const prev = cloneSettings()
          const saved = await persistSettings(prev)
          if (!saved) await refreshPanel()
          else await refreshPanel()
          return
        }

        if (action.id === 'insert') {
          applyValues(action.values)
          await insertTable(settings.rows, settings.cols, settings.header, { persist: true })
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
        if (input.id === 'rows') {
          settings.rows = clampInt(input.value, 1, settings.maxRows, settings.rows)
        } else if (input.id === 'cols') {
          settings.cols = clampInt(input.value, 1, settings.maxCols, settings.cols)
        } else if (input.id === 'header') {
          settings.header = input.value === true
        } else {
          return
        }
        // Soft: also apply sibling values if present
        applyValues(input.values)
        const ok = await persistSettings(prev)
        if (!ok) await refreshPanel()
        else await refreshPanel()
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
  id: 'insert',
  title: t('Tabelle einfügen', 'Insert table'),
  detail: t(
    'Aktuelle Zeilen/Spalten/Kopfzeile an der Cursorposition einfügen',
    'Insert current rows/columns/header at the cursor',
  ),
  keywords: 'table tabelle markdown grid rows columns insert einfügen',
  run: async () => {
    try {
      await insertCurrent()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'insert-default',
  title: t('Standard-Tabelle einfügen', 'Insert default table'),
  detail: t(
    '3×3 mit Kopfzeile an der Cursorposition einfügen (Standard)',
    'Insert 3×3 with header at the cursor (defaults)',
  ),
  keywords: 'table tabelle default standard markdown grid insert einfügen',
  run: async () => {
    try {
      await insertDefault()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'open',
  title: t('Tabellen-Einfüger öffnen', 'Open Table Inserter'),
  detail: t(
    'Panel mit Zeilen, Spalten, Kopfzeile und Vorschau',
    'Panel with rows, columns, header, and preview',
  ),
  keywords: 'table tabelle öffnen open panel markdown grid rows columns',
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
      'table-inserter activated',
      fanotes.app.appVersion,
      settings.rows,
      settings.cols,
      settings.header,
    )
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(() => {
  panel = null
})
