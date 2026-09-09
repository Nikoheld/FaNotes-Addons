/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Zeilen nummerieren / Number Lines – prefix selected lines with a running
// counter (1. 2. 3. or 1) 2) 3)).
// Abgrenzung: list-convert=Bullet/Task/Numbered-Listenstil mit Strip;
// line-tools=sort; hier=einfache Zähler-Präfixe ohne Listen-Strip-Logik
// (optional skip empty). Soft: no vault/network/notes.
// Activate = load settings only.
// Mirror Soft: list-convert / line-tools / join-split-lines selection Soft.

const STORAGE_KEY = 'settings'
const PANEL_ID = 'num'

/**
 * @typedef {'dot' | 'paren'} FormatMode
 * @typedef {{
 *   start: number,
 *   skipEmpty: boolean,
 *   format: FormatMode,
 * }} Settings
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  start: 1,
  skipEmpty: true,
  format: 'dot',
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
 * Soft clamp integer into [lo, hi].
 * @param {unknown} raw
 * @param {number} fallback
 * @param {number} lo
 * @param {number} hi
 */
function clampInt(raw, fallback, lo, hi) {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.max(lo, Math.min(hi, Math.round(n)))
}

/**
 * @param {unknown} raw
 * @returns {Settings}
 */
function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const obj = /** @type {Record<string, unknown>} */ (raw)
  const formatRaw = typeof obj.format === 'string' ? obj.format.trim().toLowerCase() : 'dot'
  /** @type {FormatMode} */
  let format = 'dot'
  if (formatRaw === 'dot' || formatRaw === 'paren') format = formatRaw
  return {
    start: clampInt(obj.start, DEFAULT_SETTINGS.start, 0, 9999),
    skipEmpty: obj.skipEmpty !== false,
    format,
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
      start: settings.start,
      skipEmpty: settings.skipEmpty === true,
      format: settings.format,
    })
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

/**
 * Soft prefix for format: dot → `N. `, paren → `N) `.
 * @param {number} n
 * @param {FormatMode} format
 */
function prefixFor(n, format) {
  if (format === 'paren') return `${n}) `
  return `${n}. `
}

/**
 * Soft: is line empty for skipEmpty (trim whitespace → empty).
 * @param {string} line
 */
function isEmptyLine(line) {
  return line.trim().length === 0
}

/**
 * Number lines Soft: non-empty (or all if !skipEmpty) get running prefix
 * from start; empty stay empty when skipEmpty.
 * @param {string[]} lines
 * @param {number} start
 * @param {boolean} skipEmpty
 * @param {FormatMode} format
 * @returns {string[]}
 */
function numberLines(lines, start, skipEmpty, format) {
  let n = start
  /** @type {string[]} */
  const out = []
  for (const line of lines) {
    if (skipEmpty && isEmptyLine(line)) {
      out.push(line)
      continue
    }
    out.push(prefixFor(n, format) + line)
    n += 1
  }
  return out
}

/**
 * Soft: getSelection; empty/whitespace → toast info; read failure → toast error.
 * Mirrors list-convert / line-tools / join-split-lines selection Soft.
 * @returns {Promise<string[] | null>}
 */
async function getTargetLines() {
  try {
    const sel = await fanotes.editor.getSelection()
    if (!sel || typeof sel.text !== 'string' || !sel.text.trim()) {
      await fanotes.ui.toast(
        t('Bitte Zeilen markieren', 'Please select lines'),
        'info',
      )
      return null
    }
    return sel.text.split('\n')
  } catch (error) {
    await fanotes.ui.toast(
      t(`Auswahl lesen fehlgeschlagen: ${errMessage(error)}`, `Could not read selection: ${errMessage(error)}`),
      'error',
    )
    return null
  }
}

/**
 * Apply panel values into settings Soft before numbering.
 * @param {Record<string, unknown>} values
 * @returns {Promise<boolean>}
 */
async function applyPanelValues(values) {
  if (!values || typeof values !== 'object') return true
  const prev = { ...settings }

  if (values.start != null && values.start !== '') {
    settings.start = clampInt(values.start, settings.start, 0, 9999)
  }
  if (values.format != null) {
    const v = String(values.format).trim().toLowerCase()
    if (v === 'dot' || v === 'paren') settings.format = v
  }
  if (values.skipEmpty !== undefined) {
    settings.skipEmpty = values.skipEmpty === true || values.skipEmpty === 'true'
  }

  const ok = await persistSettings(prev)
  if (!ok) {
    settings = prev
    return false
  }
  return true
}

async function runNumber() {
  const lines = await getTargetLines()
  if (!lines) return

  const start = clampInt(settings.start, 1, 0, 9999)
  const skipEmpty = settings.skipEmpty === true
  const format = settings.format === 'paren' ? 'paren' : 'dot'
  const next = numberLines(lines, start, skipEmpty, format)

  const numbered = next.filter((line, i) => {
    if (skipEmpty && isEmptyLine(lines[i])) return false
    return true
  }).length

  try {
    const ok = await fanotes.editor.replaceSelection(next.join('\n'))
    if (!ok) {
      await fanotes.ui.toast(
        t('Kein Markdown-Editor geöffnet.', 'No Markdown editor is open.'),
        'error',
      )
      return
    }
  } catch (error) {
    await fanotes.ui.toast(
      t(`Ersetzen fehlgeschlagen: ${errMessage(error)}`, `Replace failed: ${errMessage(error)}`),
      'error',
    )
    return
  }

  await fanotes.ui.toast(
    t(
      numbered === 1
        ? '1 Zeile nummeriert'
        : `${numbered} Zeilen nummeriert`,
      numbered === 1
        ? 'Numbered 1 line'
        : `Numbered ${numbered} lines`,
    ),
    'success',
  )
}

function renderBlocks() {
  /** @type {FaNotes.Block[]} */
  return [
    { type: 'heading', text: t('Zeilen nummerieren', 'Number Lines'), level: 2 },
    {
      type: 'text',
      muted: true,
      text: t(
        'Nummeriert markierte Zeilen mit laufendem Präfix (1. 2. 3. oder 1) 2) 3)).',
        'Numbers selected lines with a running prefix (1. 2. 3. or 1) 2) 3)).',
      ),
    },
    { type: 'divider' },
    {
      type: 'input',
      id: 'start',
      label: t('Startnummer', 'Start number'),
      value: String(settings.start),
      placeholder: '1',
    },
    {
      type: 'select',
      id: 'format',
      label: t('Format', 'Format'),
      value: settings.format,
      options: [
        { value: 'dot', label: t('Punkt (1. )', 'Dot (1. )') },
        { value: 'paren', label: t('Klammer (1) )', 'Paren (1) )') },
      ],
    },
    {
      type: 'checkbox',
      id: 'skipEmpty',
      label: t('Leere Zeilen überspringen', 'Skip empty lines'),
      checked: settings.skipEmpty === true,
    },
    { type: 'divider' },
    {
      type: 'button',
      id: 'number',
      label: t('Nummerieren', 'Number'),
      primary: true,
    },
    {
      type: 'callout',
      tone: 'info',
      text: t(
        'Einfache Zähler-Präfixe auf der Selection – nicht Listenstil mit Strip (→ list-convert), nicht Sortieren (→ line-tools). Kein Vault.',
        'Simple counter prefixes on the selection — not list style with strip (→ list-convert), not sorting (→ line-tools). No vault.',
      ),
    },
  ]
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Zeilen nummerieren', 'Number Lines'))
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
      title: t('Zeilen nummerieren', 'Number Lines'),
      icon: '🔢',
      blocks: renderBlocks(),
      focus: true,
    })

    panel.onAction(async (action) => {
      try {
        const values = action.values || {}
        if (action.id === 'number') {
          const ok = await applyPanelValues(values)
          if (!ok) {
            await refreshPanel()
            return
          }
          await runNumber()
          await refreshPanel()
          return
        }
        if (action.id === 'submit:start') {
          const ok = await applyPanelValues(values)
          if (!ok) {
            await refreshPanel()
            return
          }
          await fanotes.ui.toast(t('Einstellungen gespeichert.', 'Settings saved.'), 'success')
          await refreshPanel()
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
        if (input.id === 'start') {
          const prev = { ...settings }
          settings.start = clampInt(input.value, settings.start, 0, 9999)
          const ok = await persistSettings(prev)
          if (!ok) {
            await refreshPanel()
            return
          }
          return
        }
        if (input.id === 'format') {
          const prev = { ...settings }
          const v = String(input.value ?? '').trim().toLowerCase()
          if (v === 'dot' || v === 'paren') {
            settings.format = v
            const ok = await persistSettings(prev)
            await refreshPanel()
            if (!ok) return
          }
          return
        }
        if (input.id === 'skipEmpty') {
          const prev = { ...settings }
          settings.skipEmpty = input.value === true
          const ok = await persistSettings(prev)
          await refreshPanel()
          if (!ok) return
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

fanotes.commands.register({
  id: 'number',
  title: t('Zeilen nummerieren', 'Number lines'),
  detail: t(
    'Markierte Zeilen mit laufendem Präfix versehen',
    'Prefix selected lines with a running counter',
  ),
  keywords: 'number nummerieren nummern zeilen lines prefix präfix',
  run: async () => {
    try {
      await runNumber()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'open',
  title: t('Zeilen nummerieren öffnen', 'Open Number Lines'),
  detail: t(
    'Panel: Startnummer, Format, leere Zeilen',
    'Panel: start number, format, skip empty',
  ),
  keywords: 'number nummerieren nummern panel öffnen open zeilen lines',
  run: () => {
    try {
      openPanel()
    } catch (error) {
      void fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

// --- Lifecycle --------------------------------------------------------------

fanotes.onActivate(async () => {
  try {
    await loadSettings()
    fanotes.log('number-lines activated', fanotes.app.appVersion, settings)
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(() => {
  panel = null
})
