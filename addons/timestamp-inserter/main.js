/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Zeitstempel / Timestamp Inserter – insert configurable date/time stamps
// at the cursor. Abgrenzung: append-to-daily/session-log = Logik an Dateien;
// daily-note = Tagesdatei; hier = nur Insert-Strings. Kein Vault.
// Activate = load settings only. Soft: no notes / network / clipboard.

const STORAGE_KEY = 'settings'
const PANEL_ID = 'ts'
const MAX_FORMATS = 8
const MAX_PATTERN_LEN = 64

/** Default format patterns (local Date tokens). */
const DEFAULT_FORMATS = [
  'YYYY-MM-DD',
  'YYYY-MM-DD HH:mm',
  'DD.MM.YYYY',
  'HH:mm',
]

/**
 * @typedef {{
 *   formats: string[],
 *   lastId: number,
 * }} Settings
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  formats: [...DEFAULT_FORMATS],
  lastId: 0,
}

/** @type {Settings} */
let settings = {
  formats: [...DEFAULT_FORMATS],
  lastId: 0,
}

/** Soft: panel selection index for Entfernen (mirrors last used when inserting). */
/** @type {number} */
let selectedIndex = 0

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
 * @param {number} n
 */
function pad2(n) {
  return String(n).padStart(2, '0')
}

/**
 * Soft: replace YYYY, MM, DD, HH, mm from local Date with zero-pad (no libs).
 * Unknown tokens leave as-is Soft.
 * @param {string} pattern
 * @param {Date} [date]
 */
function formatTokens(pattern, date = new Date()) {
  const YYYY = String(date.getFullYear())
  const MM = pad2(date.getMonth() + 1)
  const DD = pad2(date.getDate())
  const HH = pad2(date.getHours())
  const mm = pad2(date.getMinutes())
  return String(pattern)
    .replace(/YYYY/g, YYYY)
    .replace(/MM/g, MM)
    .replace(/DD/g, DD)
    .replace(/HH/g, HH)
    .replace(/mm/g, mm)
}

/**
 * Soft: only tokens YYYY MM DD HH mm and separators [-/: .] (and spaces).
 * Must contain at least one known token.
 * @param {string} raw
 * @returns {string | null} trimmed pattern or null if invalid
 */
function normalizePattern(raw) {
  const s = String(raw ?? '').trim()
  if (!s || s.length > MAX_PATTERN_LEN) return null
  const stripped = s
    .replace(/YYYY/g, '\0')
    .replace(/MM/g, '\0')
    .replace(/DD/g, '\0')
    .replace(/HH/g, '\0')
    .replace(/mm/g, '\0')
  if (!stripped.includes('\0')) return null
  const rest = stripped.replace(/\0/g, '')
  if (!/^[-/:.\s]*$/.test(rest)) return null
  return s
}

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
function normalizeFormats(raw) {
  if (!Array.isArray(raw)) return [...DEFAULT_FORMATS]
  /** @type {string[]} */
  const out = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const p = normalizePattern(item)
    if (!p) continue
    if (out.includes(p)) continue
    out.push(p)
    if (out.length >= MAX_FORMATS) break
  }
  return out.length > 0 ? out : [...DEFAULT_FORMATS]
}

/**
 * @param {unknown} raw
 * @param {number} maxExclusive
 */
function normalizeLastId(raw, maxExclusive) {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n) || n < 0) return 0
  const i = Math.floor(n)
  if (maxExclusive <= 0) return 0
  if (i >= maxExclusive) return 0
  return i
}

/**
 * @param {unknown} raw
 * @returns {Settings}
 */
function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') {
    return { formats: [...DEFAULT_FORMATS], lastId: 0 }
  }
  const obj = /** @type {Record<string, unknown>} */ (raw)
  const formats = normalizeFormats(obj.formats)
  const lastId = normalizeLastId(obj.lastId, formats.length)
  return { formats, lastId }
}

/**
 * @returns {Settings}
 */
function cloneSettings() {
  return {
    formats: [...settings.formats],
    lastId: settings.lastId,
  }
}

async function loadSettings() {
  try {
    const raw = await fanotes.storage.get(STORAGE_KEY)
    settings = normalizeSettings(raw)
    selectedIndex = settings.lastId
  } catch (error) {
    fanotes.log('loadSettings failed', errMessage(error))
    settings = { formats: [...DEFAULT_FORMATS], lastId: 0 }
    selectedIndex = 0
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
      formats: [...settings.formats],
      lastId: settings.lastId,
    })
    return true
  } catch (error) {
    if (rollback) {
      settings = {
        formats: [...rollback.formats],
        lastId: rollback.lastId,
      }
      selectedIndex = settings.lastId
    }
    await fanotes.ui.toast(
      t(`Speichern fehlgeschlagen: ${errMessage(error)}`, `Save failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
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
 * Insert formats[index], update lastId Soft, toast success.
 * @param {number} index
 * @returns {Promise<boolean>}
 */
async function insertFormatAt(index) {
  const formats = settings.formats
  if (!formats.length) {
    await fanotes.ui.toast(
      t('Keine Formate konfiguriert.', 'No formats configured.'),
      'info',
    )
    return false
  }
  const i = index >= 0 && index < formats.length ? index : 0
  const pattern = formats[i]
  const text = formatTokens(pattern)
  const ok = await insertAtCursor(text)
  if (!ok) return false

  const prev = cloneSettings()
  settings.lastId = i
  selectedIndex = i
  const saved = await persistSettings(prev)
  if (!saved) {
    await refreshPanel()
    return false
  }
  await fanotes.ui.toast(
    t(`Zeitstempel eingefügt: ${text}`, `Timestamp inserted: ${text}`),
    'success',
  )
  await refreshPanel()
  return true
}

/** insert-last — formats[lastId] or formats[0] Soft. */
async function insertLast() {
  const formats = settings.formats
  if (!formats.length) {
    await fanotes.ui.toast(
      t('Keine Formate konfiguriert.', 'No formats configured.'),
      'info',
    )
    return
  }
  const i =
    settings.lastId >= 0 && settings.lastId < formats.length ? settings.lastId : 0
  await insertFormatAt(i)
}

/**
 * Soft: insert YYYY-MM-DD — use first matching pattern in list, else
 * literally format with those tokens.
 */
async function insertDate() {
  const pattern = 'YYYY-MM-DD'
  const idx = settings.formats.indexOf(pattern)
  if (idx >= 0) {
    await insertFormatAt(idx)
    return
  }
  const text = formatTokens(pattern)
  const ok = await insertAtCursor(text)
  if (!ok) return
  await fanotes.ui.toast(
    t(`Zeitstempel eingefügt: ${text}`, `Timestamp inserted: ${text}`),
    'success',
  )
}

/**
 * Soft: insert YYYY-MM-DD HH:mm — first matching or literal tokens.
 */
async function insertDateTime() {
  const pattern = 'YYYY-MM-DD HH:mm'
  const idx = settings.formats.indexOf(pattern)
  if (idx >= 0) {
    await insertFormatAt(idx)
    return
  }
  const text = formatTokens(pattern)
  const ok = await insertAtCursor(text)
  if (!ok) return
  await fanotes.ui.toast(
    t(`Zeitstempel eingefügt: ${text}`, `Timestamp inserted: ${text}`),
    'success',
  )
}

async function addFormat() {
  if (settings.formats.length >= MAX_FORMATS) {
    await fanotes.ui.toast(
      t(
        `Maximal ${MAX_FORMATS} Formate.`,
        `At most ${MAX_FORMATS} formats.`,
      ),
      'info',
    )
    return
  }
  const raw = await fanotes.ui.prompt(
    t(
      'Neues Format (Tokens: YYYY MM DD HH mm; Trenner: - / : . Leerzeichen)',
      'New format (tokens: YYYY MM DD HH mm; separators: - / : . space)',
    ),
    {
      title: t('Format hinzufügen', 'Add format'),
      placeholder: 'YYYY-MM-DD HH:mm',
      value: '',
    },
  )
  if (raw == null) return
  const pattern = normalizePattern(raw)
  if (!pattern) {
    await fanotes.ui.toast(
      t(
        'Ungültiges Format. Erlaubt: YYYY, MM, DD, HH, mm und Trenner - / : .',
        'Invalid format. Allowed: YYYY, MM, DD, HH, mm and separators - / : .',
      ),
      'error',
    )
    return
  }
  if (settings.formats.includes(pattern)) {
    await fanotes.ui.toast(
      t('Format existiert bereits.', 'Format already exists.'),
      'info',
    )
    return
  }
  const prev = cloneSettings()
  settings.formats = [...settings.formats, pattern]
  selectedIndex = settings.formats.length - 1
  const saved = await persistSettings(prev)
  if (!saved) {
    await refreshPanel()
    return
  }
  await fanotes.ui.toast(
    t(`Format hinzugefügt: ${pattern}`, `Format added: ${pattern}`),
    'success',
  )
  await refreshPanel()
}

async function removeSelected() {
  const formats = settings.formats
  if (formats.length <= 1) {
    await fanotes.ui.toast(
      t('Mindestens ein Format behalten.', 'Keep at least one format.'),
      'info',
    )
    return
  }
  let i = selectedIndex
  if (i < 0 || i >= formats.length) i = settings.lastId
  if (i < 0 || i >= formats.length) i = 0
  const removed = formats[i]
  const prev = cloneSettings()
  const next = formats.filter((_, idx) => idx !== i)
  settings.formats = next
  if (settings.lastId >= next.length) settings.lastId = Math.max(0, next.length - 1)
  else if (settings.lastId > i) settings.lastId -= 1
  selectedIndex = Math.min(selectedIndex, next.length - 1)
  if (selectedIndex < 0) selectedIndex = 0
  if (settings.lastId < 0) settings.lastId = 0
  const saved = await persistSettings(prev)
  if (!saved) {
    await refreshPanel()
    return
  }
  await fanotes.ui.toast(
    t(`Format entfernt: ${removed}`, `Format removed: ${removed}`),
    'success',
  )
  await refreshPanel()
}

function renderBlocks() {
  const formats = settings.formats
  const last = formats[settings.lastId] ?? formats[0] ?? '—'
  const preview = formats.length ? formatTokens(last) : '—'

  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Zeitstempel', 'Timestamp'), level: 2 },
    {
      type: 'text',
      muted: true,
      text: t(
        'Konfigurierbare Datums-/Zeitstempel an der Cursorposition einfügen. Klick auf eine Zeile fügt sofort ein.',
        'Insert configurable date/time stamps at the cursor. Click a row to insert immediately.',
      ),
    },
    {
      type: 'keyvalue',
      items: [
        { key: t('Zuletzt', 'Last used'), value: last },
        { key: t('Vorschau', 'Preview'), value: preview },
        { key: t('Anzahl', 'Count'), value: `${formats.length} / ${MAX_FORMATS}` },
      ],
    },
    { type: 'divider' },
    { type: 'heading', text: t('Formate', 'Formats'), level: 3 },
    {
      type: 'list',
      id: 'formats',
      empty: t('Keine Formate.', 'No formats.'),
      items: formats.map((pattern, idx) => ({
        id: String(idx),
        title: pattern,
        detail: formatTokens(pattern),
        badge:
          idx === settings.lastId
            ? t('zuletzt', 'last')
            : idx === selectedIndex
              ? '•'
              : undefined,
      })),
    },
    {
      type: 'text',
      muted: true,
      text: t(
        'Unterstützte Tokens: YYYY MM DD HH mm',
        'Supported tokens: YYYY MM DD HH mm',
      ),
    },
    {
      type: 'callout',
      tone: 'info',
      text: t(
        'Nur Insert-Strings an der Cursorposition — keine Tagesdatei (→ daily-note) und kein Anhängen an Log-Dateien (→ append-to-daily / session-log).',
        'Insert strings at the cursor only — not a daily file (→ daily-note) and not appending to log files (→ append-to-daily / session-log).',
      ),
    },
    { type: 'divider' },
    {
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'add',
          label: t('Neu', 'New'),
          disabled: formats.length >= MAX_FORMATS,
        },
        {
          type: 'button',
          id: 'remove',
          label: t('Entfernen', 'Remove'),
          danger: true,
          disabled: formats.length <= 1,
        },
        {
          type: 'button',
          id: 'insert-last',
          label: t('Einfügen (zuletzt)', 'Insert (last)'),
          primary: true,
          disabled: formats.length === 0,
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
    await panel.setTitle(t('Zeitstempel', 'Timestamp'))
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
      title: t('Zeitstempel', 'Timestamp'),
      icon: '🕒',
      blocks: renderBlocks(),
    })

    panel.onAction(async (action) => {
      try {
        if (action.id === 'formats' && action.itemId != null) {
          const idx = Number(action.itemId)
          if (!Number.isFinite(idx) || idx < 0 || idx >= settings.formats.length) {
            await fanotes.ui.toast(t('Unbekanntes Format.', 'Unknown format.'), 'error')
            return
          }
          selectedIndex = idx
          await insertFormatAt(idx)
          return
        }
        if (action.id === 'add') {
          await addFormat()
          return
        }
        if (action.id === 'remove') {
          await removeSelected()
          return
        }
        if (action.id === 'insert-last') {
          await insertLast()
          return
        }
      } catch (error) {
        await fanotes.ui.toast(
          t(`Aktion fehlgeschlagen: ${errMessage(error)}`, `Action failed: ${errMessage(error)}`),
          'error',
        )
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
  id: 'insert-last',
  title: t('Letzten Zeitstempel einfügen', 'Insert last timestamp'),
  detail: t(
    'Zuletzt genutztes Format an der Cursorposition einfügen',
    'Insert the last-used format at the cursor',
  ),
  keywords: 'timestamp zeitstempel zuletzt last insert einfügen jetzt now',
  run: async () => {
    try {
      await insertLast()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'insert-date',
  title: t('Datum einfügen', 'Insert date'),
  detail: t(
    'YYYY-MM-DD an der Cursorposition einfügen',
    'Insert YYYY-MM-DD at the cursor',
  ),
  keywords: 'timestamp zeitstempel date datum YYYY-MM-DD insert einfügen',
  run: async () => {
    try {
      await insertDate()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'insert-datetime',
  title: t('Datum und Uhrzeit einfügen', 'Insert date and time'),
  detail: t(
    'YYYY-MM-DD HH:mm an der Cursorposition einfügen',
    'Insert YYYY-MM-DD HH:mm at the cursor',
  ),
  keywords: 'timestamp zeitstempel datetime datum uhrzeit insert einfügen jetzt',
  run: async () => {
    try {
      await insertDateTime()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'open',
  title: t('Zeitstempel öffnen', 'Open Timestamp Inserter'),
  detail: t(
    'Panel mit Formaten und Einfügen',
    'Panel with formats and insert',
  ),
  keywords: 'timestamp zeitstempel öffnen open panel format datum date time',
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
      'timestamp-inserter activated',
      fanotes.app.appVersion,
      settings.formats.length,
      settings.lastId,
    )
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(() => {
  panel = null
})
