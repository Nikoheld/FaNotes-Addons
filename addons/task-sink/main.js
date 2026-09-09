/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Erledigte nach unten / Task Sink – move completed task checkboxes to the
// bottom of the active note. Soft: no vault scan / never notes.list.
// Abgrenzung: checkbox-progress=Anzeige; list-convert=Prefix;
// task-collector=Vault; habit-checklist=Datums-Habits; hier=Reorder done
// tasks in aktiver Notiz.
// Mirror Soft: habit-checklist / list-convert Soft; find-replace-note Soft write.
// Activate = load settings only.

const STORAGE_KEY = 'settings'
const PANEL_ID = 'sink'

/** Soft task line: indent, bullet, [x]|[X]|[ ], rest. */
const TASK_LINE_RE = /^(\s*)[-*+]\s+\[(x|X| )\]\s+(.*)$/

/**
 * @typedef {{
 *   groupBlank: boolean,
 *   openEditorOnly: boolean,
 * }} Settings
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  groupBlank: true,
  openEditorOnly: false,
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
  return {
    groupBlank: obj.groupBlank !== false,
    openEditorOnly: obj.openEditorOnly === true,
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
      groupBlank: settings.groupBlank === true,
      openEditorOnly: settings.openEditorOnly === true,
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
 * Soft classify a line Soft.
 * @param {string} line
 * @returns {'open' | 'done' | 'other'}
 */
function classifyTaskLine(line) {
  const m = TASK_LINE_RE.exec(line)
  if (!m) return 'other'
  const mark = m[2]
  if (mark === 'x' || mark === 'X') return 'done'
  return 'open'
}

/**
 * Soft partition Soft:
 * - non-task lines keep relative order in "head"
 * - open tasks keep order
 * - done tasks keep order moved to end
 * Soft groupBlank: one blank line before done-block if head/open non-empty.
 * @param {string} text
 * @param {boolean} groupBlank
 * @returns {{ next: string, moved: number, open: number, other: number, changed: boolean }}
 */
function sinkDoneTasks(text, groupBlank) {
  const normalised = String(text ?? '').replace(/\r\n|\r/g, '\n')
  const lines = normalised.split('\n')

  /** @type {string[]} */
  const head = []
  /** @type {string[]} */
  const openLines = []
  /** @type {string[]} */
  const done = []

  for (const line of lines) {
    const kind = classifyTaskLine(line)
    if (kind === 'done') done.push(line)
    else if (kind === 'open') openLines.push(line)
    else head.push(line)
  }

  /** @type {string[]} */
  const top = head.concat(openLines)

  if (groupBlank === true && done.length > 0 && top.length > 0) {
    while (top.length > 0 && top[top.length - 1].trim() === '') {
      top.pop()
    }
    // Soft groupBlank: one blank before done-block if head/open non-empty Soft.
    if (top.length > 0) top.push('')
  }

  const next = top.concat(done).join('\n')
  return {
    next,
    moved: done.length,
    open: openLines.length,
    other: head.length,
    changed: next !== normalised,
  }
}

/**
 * Prefer editor.getText Soft; else notes.active + notes.read Soft.
 * Soft openEditorOnly true: require editor.getText Soft else toast Soft — no notes Soft.
 * Soft: no vault scan / never notes.list Soft.
 * @returns {Promise<{ available: boolean, text: string, path: string | null, viaEditor: boolean }>}
 */
async function readActiveText() {
  /** @type {FaNotes.ActiveNote | null} */
  let active = null
  try {
    active = await fanotes.notes.active()
  } catch (error) {
    fanotes.log('notes.active failed', errMessage(error))
  }

  try {
    const editorText = await fanotes.editor.getText()
    if (editorText !== null && editorText !== undefined) {
      return {
        available: true,
        text: String(editorText),
        path: active ? active.path : null,
        viaEditor: true,
      }
    }
  } catch (error) {
    fanotes.log('editor.getText failed', errMessage(error))
  }

  if (settings.openEditorOnly === true) {
    await fanotes.ui.toast(
      t(
        'Kein Markdown-Editor geöffnet (nur Editor).',
        'No Markdown editor is open (editor-only).',
      ),
      'error',
    )
    return { available: false, text: '', path: active ? active.path : null, viaEditor: false }
  }

  if (!active || !active.path) {
    return { available: false, text: '', path: null, viaEditor: false }
  }

  // Soft: skip non-markdown kinds when known Soft.
  if (active.kind && active.kind !== 'markdown' && active.kind !== 'none') {
    return {
      available: false,
      text: '',
      path: active.path,
      viaEditor: false,
    }
  }

  try {
    const text = await fanotes.notes.read(active.path)
    return {
      available: true,
      text: String(text ?? ''),
      path: active.path,
      viaEditor: false,
    }
  } catch (error) {
    fanotes.log('notes.read failed', errMessage(error))
    return {
      available: false,
      text: '',
      path: active.path,
      viaEditor: false,
    }
  }
}

/**
 * Soft write Soft: editor.setText if getText Soft else notes.write(active) Soft.
 * Prefer editor.setText Soft; else notes.write Soft when path known Soft.
 * Soft openEditorOnly: skip notes.write Soft.
 * @param {string} content
 * @param {string | null} path
 * @param {boolean} viaEditor
 * @returns {Promise<boolean>}
 */
async function writeActiveText(content, path, viaEditor) {
  if (viaEditor || settings.openEditorOnly !== true) {
    try {
      const ok = await fanotes.editor.setText(content)
      if (ok) return true
    } catch (error) {
      fanotes.log('editor.setText failed', errMessage(error))
    }
  }

  if (settings.openEditorOnly === true) {
    await fanotes.ui.toast(
      t(
        'Schreiben fehlgeschlagen (nur Editor).',
        'Write failed (editor-only).',
      ),
      'error',
    )
    return false
  }

  if (!path) {
    await fanotes.ui.toast(
      t(
        'Schreiben fehlgeschlagen (kein Editor und kein Pfad).',
        'Write failed (no editor and no path).',
      ),
      'error',
    )
    return false
  }

  try {
    await fanotes.notes.write(path, content)
    return true
  } catch (error) {
    await fanotes.ui.toast(
      t(
        `Schreiben fehlgeschlagen: ${errMessage(error)}`,
        `Write failed: ${errMessage(error)}`,
      ),
      'error',
    )
    return false
  }
}

/**
 * Soft: sync draft groupBlank from panel action.values Soft when present Soft.
 * @param {Record<string, unknown>} [values]
 */
function applyValues(values) {
  if (!values || typeof values !== 'object') return
  if (typeof values.groupBlank === 'boolean') {
    settings.groupBlank = values.groupBlank
  }
  if (typeof values.openEditorOnly === 'boolean') {
    settings.openEditorOnly = values.openEditorOnly
  }
}

async function runSink(values) {
  applyValues(values)

  const read = await readActiveText()
  if (!read.available) {
    // Soft openEditorOnly Soft already toasted Soft when true Soft.
    if (settings.openEditorOnly !== true) {
      await fanotes.ui.toast(
        t('Keine offene Notiz.', 'No open note.'),
        'error',
      )
    }
    return
  }

  const result = sinkDoneTasks(read.text, settings.groupBlank === true)

  if (result.moved === 0) {
    await persistSettings()
    await refreshPanel()
    await fanotes.ui.toast(
      t('Keine erledigten Aufgaben.', 'No completed tasks.'),
      'info',
    )
    return
  }

  if (!result.changed) {
    await persistSettings()
    await refreshPanel()
    await fanotes.ui.toast(
      t(
        'Erledigte sind bereits unten.',
        'Completed tasks are already at the bottom.',
      ),
      'info',
    )
    return
  }

  const ok = await writeActiveText(result.next, read.path, read.viaEditor)
  if (!ok) return

  await persistSettings()
  await refreshPanel()
  await fanotes.ui.toast(
    t(
      result.moved === 1
        ? '1 erledigte Aufgabe nach unten verschoben.'
        : `${result.moved} erledigte Aufgaben nach unten verschoben.`,
      result.moved === 1
        ? 'Moved 1 completed task to the bottom.'
        : `Moved ${result.moved} completed tasks to the bottom.`,
    ),
    'success',
  )
}

function renderBlocks() {
  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Erledigte nach unten', 'Task Sink'), level: 2 },
    {
      type: 'text',
      muted: true,
      text: t(
        'Nur Task-Zeilen; andere Zeilen bleiben oben-Block.',
        'Task lines only; other lines stay in the top block.',
      ),
    },
    {
      type: 'checkbox',
      id: 'groupBlank',
      label: t(
        'Leerzeile vor Erledigt-Block',
        'Blank line before done block',
      ),
      checked: settings.groupBlank === true,
    },
    {
      type: 'button',
      id: 'sink',
      label: t('Erledigte nach unten', 'Sink completed'),
      primary: true,
    },
    {
      type: 'callout',
      tone: 'info',
      text: t(
        'Nur aktive Notiz – kein Vault-Scan. Abgrenzung: checkbox-progress = Anzeige; list-convert = Prefix; task-collector = Vault; habit-checklist = Datums-Habits; hier = Reorder erledigter Tasks.',
        'Active note only — no vault scan. Boundaries: checkbox-progress = display; list-convert = prefix; task-collector = vault; habit-checklist = dated habits; this = reorder completed tasks.',
      ),
    },
  ]
  return blocks
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Erledigte nach unten', 'Task Sink'))
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
      title: t('Erledigte nach unten', 'Task Sink'),
      icon: '↓',
      blocks: renderBlocks(),
    })

    panel.onAction(async (action) => {
      try {
        const values = /** @type {Record<string, unknown>} */ (action.values || {})
        if (action.id === 'sink') {
          await runSink(values)
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
        if (input.id === 'groupBlank') {
          const prev = { ...settings }
          settings.groupBlank = input.value === true
          await persistSettings(prev)
          await refreshPanel()
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
  id: 'sink',
  title: t('Erledigte nach unten', 'Sink completed tasks'),
  detail: t(
    'Erledigte Aufgaben-Checkboxen in der aktiven Notiz nach unten verschieben',
    'Move completed task checkboxes to the bottom of the active note',
  ),
  keywords: 'task erledigt done sink checkbox sort unten checklist',
  run: async () => {
    try {
      await runSink()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'open',
  title: t('Task Sink öffnen', 'Open Task Sink'),
  detail: t(
    'Panel: Erledigte nach unten, Leerzeile vor Block',
    'Panel: sink completed, blank line before block',
  ),
  keywords: 'task erledigt done sink checkbox sort unten checklist panel öffnen open',
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
    // Soft: settings only Soft. Never notes.list Soft.
    fanotes.log('task-sink activated', fanotes.app.appVersion, {
      groupBlank: settings.groupBlank,
      openEditorOnly: settings.openEditorOnly,
    })
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(() => {
  panel = null
})
