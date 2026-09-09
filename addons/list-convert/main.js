/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Listen-Umwandler / List Convert – convert selected lines to bullet, numbered or task list.
// Abgrenzung: line-tools=sort/dedupe; checkbox-progress=Anzeige; callout/table=Insert;
// hier=Prefix-Umwandlung der Selection-Zeilen. Soft: no vault/network/notes.
// Activate = load settings only. Soft numbering resets to 1 per call.

const STORAGE_KEY = 'settings'
const PANEL_ID = 'list'

/** Soft list-prefix strip: indent + bullet/task or numbered. */
const LIST_PREFIX_RE = /^(\s*)(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+\.\s+)/u

/**
 * @typedef {'bullet' | 'numbered' | 'task'} ListMode
 * @typedef {{
 *   mode: ListMode,
 *   keepIndent: boolean,
 * }} Settings
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  mode: 'bullet',
  keepIndent: true,
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
 * @param {unknown} raw
 * @returns {Settings}
 */
function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const obj = /** @type {Record<string, unknown>} */ (raw)
  const modeRaw = typeof obj.mode === 'string' ? obj.mode.trim().toLowerCase() : 'bullet'
  /** @type {ListMode} */
  let mode = 'bullet'
  if (modeRaw === 'bullet' || modeRaw === 'numbered' || modeRaw === 'task') mode = modeRaw
  return {
    mode,
    keepIndent: obj.keepIndent !== false,
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
      mode: settings.mode,
      keepIndent: settings.keepIndent === true,
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
 * Soft strip existing list prefix.
 * keepIndent → keep indent group; else strip indent Soft to empty for that part.
 * Non-match: Soft keep/strip leading whitespace the same way so prefix sits after indent.
 * @param {string} line
 * @param {boolean} keepIndent
 * @returns {{ indent: string, content: string }}
 */
function stripListPrefix(line, keepIndent) {
  const m = LIST_PREFIX_RE.exec(line)
  if (m) {
    const indent = keepIndent ? m[1] : ''
    return { indent, content: line.slice(m[0].length) }
  }
  const ws = /^(\s*)/.exec(line)
  const leading = ws ? ws[1] : ''
  if (keepIndent) {
    return { indent: leading, content: line.slice(leading.length) }
  }
  return { indent: '', content: line.slice(leading.length) }
}

/**
 * Soft prefix for mode. Numbered Soft: `i. ` 1-based.
 * @param {ListMode} mode
 * @param {number} i
 */
function prefixFor(mode, i) {
  if (mode === 'numbered') return `${i}. `
  if (mode === 'task') return '- [ ] '
  return '- '
}

/**
 * Convert lines Soft: split already done; empty lines keep empty;
 * numbered Soft resets to 1 per call (only non-empty lines count Soft).
 * @param {string[]} lines
 * @param {ListMode} mode
 * @param {boolean} keepIndent
 * @returns {string[]}
 */
function convertLines(lines, mode, keepIndent) {
  let n = 1
  /** @type {string[]} */
  const out = []
  for (const line of lines) {
    if (line === '') {
      out.push('')
      continue
    }
    const { indent, content } = stripListPrefix(line, keepIndent)
    out.push(indent + prefixFor(mode, n) + content)
    if (mode === 'numbered') n += 1
  }
  return out
}

/**
 * Soft: getSelection; empty/whitespace → toast info; no editor → toast error.
 * Mirrors editor Soft from line-tools / case-tools.
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
 * @param {ListMode} mode
 */
async function runConvert(mode) {
  const lines = await getTargetLines()
  if (!lines) return

  const keepIndent = settings.keepIndent === true
  const next = convertLines(lines, mode, keepIndent)

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

  /** @type {Record<ListMode, [string, string]>} */
  const msgs = {
    bullet: ['In Aufzählung umgewandelt', 'Converted to bullet list'],
    numbered: ['In Nummerierung umgewandelt', 'Converted to numbered list'],
    task: ['In Aufgabenliste umgewandelt', 'Converted to task list'],
  }
  const [de, en] = msgs[mode]
  await fanotes.ui.toast(t(de, en), 'success')
}

function renderBlocks() {
  /** @type {FaNotes.Block[]} */
  return [
    { type: 'heading', text: t('Listen-Umwandler', 'List Convert'), level: 2 },
    {
      type: 'text',
      muted: true,
      text: t(
        'Wandelt markierte Zeilen in Aufzählung, Nummerierung oder Aufgabenliste um. Nummerierung startet Soft je Aufruf bei 1.',
        'Converts selected lines into bullets, numbers or task lists. Soft numbering resets to 1 on each call.',
      ),
    },
    { type: 'divider' },
    {
      type: 'select',
      id: 'mode',
      label: t('Modus', 'Mode'),
      value: settings.mode,
      options: [
        { value: 'bullet', label: t('Aufzählung (- )', 'Bullets (- )') },
        { value: 'numbered', label: t('Nummerierung (1. )', 'Numbered (1. )') },
        { value: 'task', label: t('Aufgaben (- [ ])', 'Tasks (- [ ])') },
      ],
    },
    {
      type: 'checkbox',
      id: 'keepIndent',
      label: t('Einrückung behalten', 'Keep indentation'),
      checked: settings.keepIndent === true,
    },
    { type: 'divider' },
    {
      type: 'button',
      id: 'convert',
      label: t('Umwandeln', 'Convert'),
      primary: true,
    },
    {
      type: 'callout',
      tone: 'info',
      text: t(
        'Prefix-Umwandlung der Selection – nicht Sortieren (→ line-tools), nicht Fortschrittsanzeige (→ checkbox-progress), nicht Einfügen (→ callout-inserter / table-inserter). Kein Vault.',
        'Prefix conversion of the selection — not sorting (→ line-tools), not progress display (→ checkbox-progress), not insert (→ callout-inserter / table-inserter). No vault.',
      ),
    },
  ]
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Listen-Umwandler', 'List Convert'))
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
      title: t('Listen-Umwandler', 'List Convert'),
      icon: '☰',
      blocks: renderBlocks(),
    })

    panel.onAction(async (action) => {
      try {
        if (action.id === 'convert') {
          await runConvert(settings.mode)
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
        if (input.id === 'mode') {
          const prev = { ...settings }
          const v = String(input.value ?? '').trim().toLowerCase()
          if (v === 'bullet' || v === 'numbered' || v === 'task') {
            settings.mode = v
            const ok = await persistSettings(prev)
            await refreshPanel()
            if (!ok) return
          }
          return
        }
        if (input.id === 'keepIndent') {
          const prev = { ...settings }
          settings.keepIndent = input.value === true
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
  id: 'open',
  title: t('Listen-Umwandler öffnen', 'Open List Convert'),
  detail: t(
    'Panel: Aufzählung, Nummerierung, Aufgabenliste',
    'Panel: bullets, numbered, task list',
  ),
  keywords: 'list liste bullet numbered task checkbox convert umwandeln panel öffnen open',
  run: () => {
    try {
      openPanel()
    } catch (error) {
      void fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'to-bullet',
  title: t('Zeilen → Aufzählung', 'Lines → bullets'),
  detail: t(
    'Markierte Zeilen in Aufzählung (- ) umwandeln',
    'Convert selected lines to a bullet list (- )',
  ),
  keywords: 'bullet aufzählung liste list convert umwandeln',
  run: async () => {
    try {
      await runConvert('bullet')
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'to-numbered',
  title: t('Zeilen → Nummerierung', 'Lines → numbered'),
  detail: t(
    'Markierte Zeilen nummerieren (ab 1 je Aufruf)',
    'Number selected lines (from 1 each call)',
  ),
  keywords: 'numbered nummerierung liste list convert umwandeln',
  run: async () => {
    try {
      await runConvert('numbered')
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'to-task',
  title: t('Zeilen → Aufgabenliste', 'Lines → task list'),
  detail: t(
    'Markierte Zeilen in Aufgaben (- [ ]) umwandeln',
    'Convert selected lines to a task list (- [ ])',
  ),
  keywords: 'task checkbox aufgaben liste list convert umwandeln',
  run: async () => {
    try {
      await runConvert('task')
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.onActivate(async () => {
  try {
    await loadSettings()
    fanotes.log('list-convert activated', fanotes.app.appVersion, settings)
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(() => {
  panel = null
})
