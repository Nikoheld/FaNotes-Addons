/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Einrücken / Indent Tools – indent or outdent selected lines by spaces (or tabs Soft).
// Abgrenzung: line-tools=sort/dedupe; list-convert=Listen-Prefix; heading-shift=#-Stufe;
// hier=Leading-Spaces ±N. Soft: no vault/network/notes. Activate = load settings only.
// Mirror Soft: line-tools / heading-shift / join-split-lines selection patterns.

const STORAGE_KEY = 'settings'
const PANEL_ID = 'indent'

/**
 * @typedef {{
 *   width: number,
 *   useTabs: boolean,
 * }} Settings
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  width: 2,
  useTabs: false,
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
  return {
    width: clampInt(obj.width, DEFAULT_SETTINGS.width, 1, 8),
    useTabs: obj.useTabs === true,
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
 * Persist settings Soft; on failure restore `rollback` when provided.
 * @param {Settings} [rollback]
 * @returns {Promise<boolean>}
 */
async function persistSettings(rollback) {
  try {
    await fanotes.storage.set(STORAGE_KEY, {
      width: settings.width,
      useTabs: settings.useTabs === true,
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
 * Soft indent unit: useTabs → one tab; else width spaces (width ignored for tab Soft).
 * @returns {string}
 */
function indentUnit() {
  if (settings.useTabs === true) return '\t'
  return ' '.repeat(settings.width)
}

/**
 * Soft indent: prefix each line with unit.
 * @param {string} line
 * @returns {string}
 */
function indentLine(line) {
  return indentUnit() + line
}

/**
 * Soft outdent: remove one leading tab, else up to width leading spaces.
 * @param {string} line
 * @returns {string}
 */
function outdentLine(line) {
  if (line.startsWith('\t')) return line.slice(1)
  const w = settings.width
  let i = 0
  while (i < w && i < line.length && line[i] === ' ') i += 1
  return line.slice(i)
}

/**
 * Soft: getSelection; empty/whitespace → toast error (v1 nicht whole-file);
 * read failure → toast error. Mirrors line-tools / heading-shift selection Soft.
 * @returns {Promise<string[] | null>}
 */
async function getTargetLines() {
  try {
    const sel = await fanotes.editor.getSelection()
    if (!sel || typeof sel.text !== 'string' || !sel.text.trim()) {
      await fanotes.ui.toast(
        t('Bitte Zeilen markieren', 'Please select lines'),
        'error',
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
 * Soft: replaceSelection joined; toast kein Editor / replace failure / success.
 * @param {string[]} lines
 * @param {string} successMsg
 * @returns {Promise<boolean>}
 */
async function apply(lines, successMsg) {
  try {
    const ok = await fanotes.editor.replaceSelection(lines.join('\n'))
    if (!ok) {
      await fanotes.ui.toast(
        t('Kein Markdown-Editor geöffnet.', 'No Markdown editor is open.'),
        'error',
      )
      return false
    }
    await fanotes.ui.toast(successMsg, 'success')
    return true
  } catch (error) {
    await fanotes.ui.toast(
      t(`Ersetzen fehlgeschlagen: ${errMessage(error)}`, `Replace failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

async function runIndent() {
  const lines = await getTargetLines()
  if (!lines) return
  const next = lines.map(indentLine)
  const n = lines.length
  await apply(
    next,
    t(
      n === 1 ? '1 Zeile eingerückt' : `${n} Zeilen eingerückt`,
      n === 1 ? 'Indented 1 line' : `Indented ${n} lines`,
    ),
  )
}

async function runOutdent() {
  const lines = await getTargetLines()
  if (!lines) return
  const next = lines.map(outdentLine)
  const n = lines.length
  await apply(
    next,
    t(
      n === 1 ? '1 Zeile ausgerückt' : `${n} Zeilen ausgerückt`,
      n === 1 ? 'Outdented 1 line' : `Outdented ${n} lines`,
    ),
  )
}

/**
 * Apply panel values into settings Soft before indent/outdent.
 * @param {Record<string, unknown>} values
 * @returns {Promise<boolean>}
 */
async function applyPanelValues(values) {
  if (!values || typeof values !== 'object') return true
  const prev = { ...settings }

  if (values.width != null) {
    settings.width = clampInt(values.width, settings.width, 1, 8)
  }
  if (values.useTabs !== undefined) {
    settings.useTabs = values.useTabs === true || values.useTabs === 'true'
  }

  const ok = await persistSettings(prev)
  if (!ok) {
    settings = prev
    return false
  }
  return true
}

function renderBlocks() {
  /** @type {FaNotes.Block[]} */
  return [
    { type: 'heading', text: t('Einrücken', 'Indent Tools'), level: 2 },
    {
      type: 'text',
      muted: true,
      text: t(
        'Rückt markierte Zeilen um Spaces (oder Tabs) ein oder aus. Wirkt nur auf die Auswahl – keine ganze Datei ohne Selection.',
        'Indents or outdents selected lines by spaces (or tabs). Acts only on the selection — not the whole file without a selection.',
      ),
    },
    { type: 'divider' },
    {
      type: 'input',
      id: 'width',
      label: t('Breite (Spaces, 1–8)', 'Width (spaces, 1–8)'),
      value: String(settings.width),
      placeholder: '2',
    },
    {
      type: 'checkbox',
      id: 'useTabs',
      label: t(
        'Tabs statt Spaces (Breite Soft ignoriert beim Einrücken)',
        'Use tabs instead of spaces (width Soft ignored when indenting)',
      ),
      checked: settings.useTabs === true,
    },
    { type: 'divider' },
    {
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'indent',
          label: t('Einrücken', 'Indent'),
          primary: true,
        },
        {
          type: 'button',
          id: 'outdent',
          label: t('Ausrücken', 'Outdent'),
        },
      ],
    },
    {
      type: 'callout',
      tone: 'info',
      text: t(
        'Leading-Spaces ±N – nicht Sortieren (→ line-tools), nicht Listen-Prefix (→ list-convert), nicht #-Stufe (→ heading-shift). Soft: useTabs → ein Tab; sonst width Spaces. Ausrücken: ein Tab oder bis zu width Spaces am Anfang. Kein Vault.',
        'Leading spaces ±N — not sorting (→ line-tools), not list prefixes (→ list-convert), not heading level (→ heading-shift). Soft: useTabs → one tab; else width spaces. Outdent: one tab or up to width spaces at the start. No vault.',
      ),
    },
  ]
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Einrücken', 'Indent Tools'))
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
      title: t('Einrücken', 'Indent Tools'),
      icon: '⇥',
      blocks: renderBlocks(),
      focus: true,
    })

    panel.onAction(async (action) => {
      try {
        const values = action.values || {}
        if (action.id === 'indent') {
          const ok = await applyPanelValues(values)
          if (!ok) {
            await refreshPanel()
            return
          }
          await runIndent()
          return
        }
        if (action.id === 'outdent') {
          const ok = await applyPanelValues(values)
          if (!ok) {
            await refreshPanel()
            return
          }
          await runOutdent()
          return
        }
        if (action.id === 'submit:width') {
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
        if (input.id === 'width') {
          const prev = { ...settings }
          settings.width = clampInt(input.value, settings.width, 1, 8)
          const ok = await persistSettings(prev)
          if (!ok) {
            await refreshPanel()
            return
          }
          return
        }
        if (input.id === 'useTabs') {
          const prev = { ...settings }
          settings.useTabs = input.value === true
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
  id: 'indent',
  title: t('Zeilen einrücken', 'Indent lines'),
  detail: t(
    'Markierte Zeilen um Spaces (oder Tab) einrücken',
    'Indent selected lines by spaces (or a tab)',
  ),
  keywords: 'indent einrücken tab spaces zeilen lines',
  run: async () => {
    try {
      await runIndent()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'outdent',
  title: t('Zeilen ausrücken', 'Outdent lines'),
  detail: t(
    'Leading Spaces/Tab von markierten Zeilen entfernen',
    'Remove leading spaces/tab from selected lines',
  ),
  keywords: 'outdent ausrücken tab spaces zeilen lines',
  run: async () => {
    try {
      await runOutdent()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'open',
  title: t('Einrücken öffnen', 'Open Indent Tools'),
  detail: t(
    'Panel: Breite, Tabs, Einrücken / Ausrücken',
    'Panel: width, tabs, indent / outdent',
  ),
  keywords: 'indent outdent einrücken ausrücken panel öffnen open zeilen',
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
    fanotes.log('indent-tools activated', fanotes.app.appVersion, settings)
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(() => {
  panel = null
})
