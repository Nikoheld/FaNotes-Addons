/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Lesezeit / Reading Time – WPM estimate for the active note or selection.
// Abgrenzung: word-counter = count UI; note-statistics = .famd stats;
// here = words/wpm minutes estimate. Active only – no vault scan.
// copy-summary: toast only (no clipboard permission).

const SETTINGS_KEY = 'settings'
const PANEL_ID = 'rt'
const STATUS_ID = 'rt'
const DEBOUNCE_MS = 400
const DEFAULT_WPM = 200
const MIN_WPM = 50
const MAX_WPM = 600

/**
 * @typedef {{
 *   wpm: number,
 *   scope: 'note' | 'selection',
 *   showStatus: boolean,
 * }} Settings
 */

/**
 * @typedef {{
 *   available: boolean,
 *   path: string | null,
 *   title: string | null,
 *   usedScope: 'note' | 'selection' | null,
 *   words: number,
 *   minutes: number,
 *   wpm: number,
 * }} Snapshot
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  wpm: DEFAULT_WPM,
  scope: 'note',
  showStatus: true,
}

/** @type {Settings} */
let settings = { ...DEFAULT_SETTINGS }

/** @type {FaNotes.Panel | null} */
let panel = null

/** @type {Snapshot} */
let snapshot = emptySnapshot()

/** @type {ReturnType<typeof setTimeout> | 0} */
let refreshTimer = 0
let refreshBusy = false
let refreshQueued = false

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

function emptySnapshot() {
  return {
    available: false,
    path: null,
    title: null,
    usedScope: /** @type {'note' | 'selection' | null} */ (null),
    words: 0,
    minutes: 0,
    wpm: DEFAULT_WPM,
  }
}

/**
 * Clamp wpm Soft 50–600 (default 200).
 * @param {unknown} raw
 */
function clampWpm(raw) {
  let n = Number(raw)
  if (!Number.isFinite(n)) n = DEFAULT_WPM
  n = Math.round(n)
  if (n < MIN_WPM) n = MIN_WPM
  if (n > MAX_WPM) n = MAX_WPM
  return n
}

/**
 * @param {unknown} raw
 * @returns {'note' | 'selection'}
 */
function normalizeScope(raw) {
  return raw === 'selection' ? 'selection' : 'note'
}

/**
 * @param {unknown} raw
 * @returns {Settings}
 */
function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const obj = /** @type {Record<string, unknown>} */ (raw)
  return {
    wpm: clampWpm(obj.wpm),
    scope: normalizeScope(obj.scope),
    showStatus: obj.showStatus !== false,
  }
}

async function loadSettings() {
  try {
    const stored = await fanotes.storage.get(SETTINGS_KEY)
    settings = normalizeSettings(stored)
  } catch (error) {
    fanotes.log('loadSettings failed', errMessage(error))
    settings = { ...DEFAULT_SETTINGS }
  }
}

/**
 * @param {Settings} [rollback]
 * @returns {Promise<boolean>}
 */
async function saveSettings(rollback) {
  try {
    await fanotes.storage.set(SETTINGS_KEY, {
      wpm: settings.wpm,
      scope: settings.scope,
      showStatus: settings.showStatus === true,
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
 * Soft basename without extension.
 * @param {string} path
 */
function basenameNoExt(path) {
  const raw = String(path ?? '')
  const slash = Math.max(raw.lastIndexOf('/'), raw.lastIndexOf('\\'))
  const base = slash >= 0 ? raw.slice(slash + 1) : raw
  const dot = base.lastIndexOf('.')
  if (dot > 0) return base.slice(0, dot)
  return base || raw
}

/**
 * Wörter Soft: trim split /\s+/ filter Boolean.
 * @param {string} text
 */
function countWords(text) {
  return String(text ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}

/**
 * Minuten Soft: max(1, round(words/wpm)) wenn words>0 else 0.
 * @param {number} words
 * @param {number} wpm
 */
function estimateMinutes(words, wpm) {
  if (!(words > 0)) return 0
  const rate = wpm > 0 ? wpm : DEFAULT_WPM
  return Math.max(1, Math.round(words / rate))
}

/**
 * Note text Soft: editor.getText || notes.read(active).
 * @returns {Promise<{ available: boolean, text: string, path: string | null, title: string | null }>}
 */
async function readNoteText() {
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
      }
    }
  } catch (error) {
    fanotes.log('editor.getText failed', errMessage(error))
  }

  if (!path) {
    return { available: false, text: '', path: null, title: null }
  }

  if (active && active.kind && active.kind !== 'markdown' && active.kind !== 'none') {
    return { available: false, text: '', path, title }
  }

  try {
    const text = await fanotes.notes.read(path)
    return {
      available: true,
      text: String(text ?? ''),
      path,
      title,
    }
  } catch (error) {
    fanotes.log('notes.read failed', errMessage(error))
    return { available: false, text: '', path, title }
  }
}

/**
 * Selection Soft via getSelection when scope selection and non-empty.
 * @returns {Promise<string | null>}
 */
async function readSelectionText() {
  try {
    const selection = await fanotes.editor.getSelection()
    if (selection && typeof selection.text === 'string' && selection.text.trim()) {
      return selection.text
    }
  } catch (error) {
    fanotes.log('editor.getSelection failed', errMessage(error))
  }
  return null
}

/**
 * Active note / selection Soft — no vault list Soft.
 * @returns {Promise<Snapshot>}
 */
async function compute() {
  const wpm = clampWpm(settings.wpm)
  let usedScope = /** @type {'note' | 'selection'} */ ('note')
  /** @type {string | null} */
  let text = null
  /** @type {string | null} */
  let path = null
  /** @type {string | null} */
  let title = null

  if (settings.scope === 'selection') {
    const sel = await readSelectionText()
    if (sel !== null) {
      text = sel
      usedScope = 'selection'
      try {
        const active = await fanotes.notes.active()
        path = active && typeof active.path === 'string' ? active.path : null
        const titleRaw = active && typeof active.title === 'string' ? active.title.trim() : ''
        title = path ? titleRaw || basenameNoExt(path) || path : null
      } catch (error) {
        fanotes.log('notes.active (selection) failed', errMessage(error))
      }
    }
  }

  if (text === null) {
    const note = await readNoteText()
    if (!note.available) {
      return {
        ...emptySnapshot(),
        path: note.path,
        title: note.title,
        wpm,
      }
    }
    text = note.text
    path = note.path
    title = note.title
    usedScope = 'note'
  }

  const words = countWords(text)
  const minutes = estimateMinutes(words, wpm)

  return {
    available: true,
    path,
    title,
    usedScope,
    words,
    minutes,
    wpm,
  }
}

/**
 * Summary Soft for toast (no clipboard).
 */
function formatSummary() {
  if (!snapshot.available) {
    return t(
      'Keine aktive Notiz – keine Lesezeit.',
      'No active note – no reading time.',
    )
  }
  const scopeLabel =
    snapshot.usedScope === 'selection'
      ? t('Auswahl', 'Selection')
      : t('Notiz', 'Note')
  return t(
    `${scopeLabel}: ${snapshot.words} Wörter · ${snapshot.minutes} Min. · ${snapshot.wpm} WPM`,
    `${scopeLabel}: ${snapshot.words} words · ${snapshot.minutes} min · ${snapshot.wpm} WPM`,
  )
}

function renderBlocks() {
  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Lesezeit', 'Reading Time') },
  ]

  if (!snapshot.available) {
    blocks.push({
      type: 'callout',
      tone: 'info',
      text: t(
        'Keine aktive Notiz. Öffne eine Markdown-Notiz (oder markiere Text bei Bereich „Auswahl“), um die Lesezeit zu schätzen. Kein Vault-Scan.',
        'No active note. Open a Markdown note (or select text with scope “Selection”) to estimate reading time. No vault scan.',
      ),
    })
  } else {
    const scopeLabel =
      snapshot.usedScope === 'selection'
        ? t('Auswahl', 'Selection')
        : t('Ganze Notiz', 'Whole note')
    blocks.push({
      type: 'text',
      muted: true,
      text: `${snapshot.title || snapshot.path || ''} · ${scopeLabel}`,
    })
    blocks.push({
      type: 'keyvalue',
      items: [
        { key: t('Wörter', 'Words'), value: String(snapshot.words) },
        { key: t('Minuten', 'Minutes'), value: String(snapshot.minutes) },
        { key: 'WPM', value: String(snapshot.wpm) },
      ],
    })
  }

  blocks.push({ type: 'divider' })

  blocks.push({
    type: 'input',
    id: 'wpm',
    label: t('Wörter pro Minute (50–600)', 'Words per minute (50–600)'),
    value: String(settings.wpm),
    placeholder: String(DEFAULT_WPM),
  })

  blocks.push({
    type: 'select',
    id: 'scope',
    label: t('Bereich', 'Scope'),
    value: settings.scope,
    options: [
      { value: 'note', label: t('Ganze Notiz', 'Whole note') },
      { value: 'selection', label: t('Auswahl', 'Selection') },
    ],
  })

  blocks.push({
    type: 'checkbox',
    id: 'showStatus',
    label: t('Statusleiste anzeigen', 'Show status bar'),
    checked: settings.showStatus === true,
  })

  blocks.push({
    type: 'row',
    children: [
      {
        type: 'button',
        id: 'refresh',
        label: t('Aktualisieren', 'Refresh'),
        primary: true,
      },
    ],
  })

  blocks.push({
    type: 'text',
    muted: true,
    text: t(
      'Nur aktive Notiz oder Auswahl. Abgrenzung: word-counter = Zähl-UI; note-statistics = .famd-Stats; hier = WPM-Schätzung (Wörter/WPM).',
      'Active note or selection only. Distinction: word-counter = count UI; note-statistics = .famd stats; here = WPM estimate (words/WPM).',
    ),
  })

  return blocks
}

/**
 * Status Soft: `⏱ Xm` when showStatus.
 */
async function updateStatus() {
  try {
    if (!settings.showStatus || !snapshot.available) {
      await fanotes.ui.status.remove(STATUS_ID)
      return
    }
    const text = `⏱ ${snapshot.minutes}m`
    await fanotes.ui.status.set({
      id: STATUS_ID,
      text: text.slice(0, 60),
      title: t('Lesezeit öffnen', 'Open Reading Time'),
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

async function updatePanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Lesezeit', 'Reading Time'))
  } catch (error) {
    if (isNoPanel(error)) {
      panel = null
      return
    }
    fanotes.log('panel update failed', errMessage(error))
  }
}

/**
 * Apply panel form values Soft into settings (wpm / scope).
 * @param {Record<string, unknown>} [values]
 */
async function applyFormValues(values) {
  if (!values || typeof values !== 'object') return true
  const rollback = { ...settings }
  let changed = false
  if (values.wpm != null) {
    settings.wpm = clampWpm(values.wpm)
    changed = true
  }
  if (values.scope != null) {
    settings.scope = normalizeScope(values.scope)
    changed = true
  }
  if (!changed) return true
  return saveSettings(rollback)
}

async function refresh() {
  if (refreshBusy) {
    refreshQueued = true
    return
  }
  refreshBusy = true
  try {
    snapshot = await compute()
    await updateStatus()
    await updatePanel()
  } catch (error) {
    fanotes.log('refresh failed', errMessage(error))
    try {
      await fanotes.ui.toast(
        t(
          `Aktualisierung fehlgeschlagen: ${errMessage(error)}`,
          `Refresh failed: ${errMessage(error)}`,
        ),
        'error',
      )
    } catch {
      // ignore toast failures
    }
  } finally {
    refreshBusy = false
    if (refreshQueued) {
      refreshQueued = false
      void refresh()
    }
  }
}

/**
 * Soft debounce — active only Soft (no vault list Soft).
 * @param {number} [delay]
 */
function scheduleRefresh(delay = DEBOUNCE_MS) {
  if (!settings.showStatus && !panel) return
  clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = 0
    if (!settings.showStatus && !panel) return
    void refresh()
  }, delay)
}

/**
 * copy-summary Soft: toast summary Soft — no clipboard write Soft.
 */
async function copySummary() {
  try {
    snapshot = await compute()
    await updateStatus()
    await updatePanel()
    const summary = formatSummary()
    await fanotes.ui.toast(summary, 'info')
  } catch (error) {
    await fanotes.ui.toast(
      t(
        `Zusammenfassung fehlgeschlagen: ${errMessage(error)}`,
        `Summary failed: ${errMessage(error)}`,
      ),
      'error',
    )
  }
}

function openPanel() {
  try {
    if (panel) {
      void panel.show().catch((error) => {
        if (isNoPanel(error)) panel = null
        else fanotes.log('panel.show failed', errMessage(error))
      })
      void refresh()
      return
    }

    panel = fanotes.ui.panel({
      id: PANEL_ID,
      title: t('Lesezeit', 'Reading Time'),
      icon: '⏱',
      blocks: renderBlocks(),
      focus: true,
    })

    panel.onAction(async (action) => {
      try {
        if (
          action.id === 'refresh' ||
          action.id === 'submit:wpm' ||
          action.id === 'submit:scope'
        ) {
          const ok = await applyFormValues(action.values || {})
          if (!ok) {
            await updatePanel()
            return
          }
          await refresh()
          return
        }
      } catch (error) {
        fanotes.log('panel action failed', errMessage(error))
        await fanotes.ui.toast(
          t(
            `Aktion fehlgeschlagen: ${errMessage(error)}`,
            `Action failed: ${errMessage(error)}`,
          ),
          'error',
        )
      }
    })

    panel.onInput(async (input) => {
      try {
        if (input.id === 'showStatus') {
          const rollback = { ...settings }
          settings.showStatus = input.value === true
          const ok = await saveSettings(rollback)
          if (!ok) {
            await updatePanel()
            return
          }
          await updateStatus()
          await updatePanel()
          return
        }
        if (input.id === 'wpm') {
          const rollback = { ...settings }
          settings.wpm = clampWpm(input.value)
          const ok = await saveSettings(rollback)
          if (!ok) {
            await updatePanel()
            return
          }
          await refresh()
          return
        }
        if (input.id === 'scope') {
          const rollback = { ...settings }
          settings.scope = normalizeScope(input.value)
          const ok = await saveSettings(rollback)
          if (!ok) {
            await updatePanel()
            return
          }
          await refresh()
        }
      } catch (error) {
        fanotes.log('onInput failed', errMessage(error))
      }
    })

    void refresh()
  } catch (error) {
    fanotes.log('openPanel failed', errMessage(error))
    void fanotes.ui.toast(
      t(
        `Panel konnte nicht geöffnet werden: ${errMessage(error)}`,
        `Could not open panel: ${errMessage(error)}`,
      ),
      'error',
    )
  }
}

// --- Commands ----------------------------------------------------------------

fanotes.commands.register({
  id: 'open',
  title: t('Lesezeit öffnen', 'Open Reading Time'),
  detail: t(
    'Lesezeit der aktiven Notiz oder Auswahl schätzen',
    'Estimate reading time of the active note or selection',
  ),
  keywords:
    'lesezeit reading time wpm words minutes minuten wörter schätzen estimate zeit öffnen open panel',
  run: () => {
    try {
      openPanel()
    } catch (error) {
      void fanotes.ui.toast(
        t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`),
        'error',
      )
    }
  },
})

fanotes.commands.register({
  id: 'refresh',
  title: t('Lesezeit aktualisieren', 'Refresh Reading Time'),
  detail: t(
    'Lesezeit der aktiven Notiz oder Auswahl neu berechnen',
    'Recompute reading time for the active note or selection',
  ),
  keywords:
    'lesezeit reading time wpm words minutes aktualisieren refresh schätzen estimate',
  run: async () => {
    try {
      await refresh()
      if (!snapshot.available) {
        await fanotes.ui.toast(
          t('Keine aktive Notiz geöffnet.', 'No active note is open.'),
          'info',
        )
        return
      }
      await fanotes.ui.toast(
        t(
          `Aktualisiert: ${snapshot.words} Wörter · ${snapshot.minutes} Min.`,
          `Updated: ${snapshot.words} words · ${snapshot.minutes} min`,
        ),
        'success',
      )
    } catch (error) {
      await fanotes.ui.toast(
        t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`),
        'error',
      )
    }
  },
})

fanotes.commands.register({
  id: 'copy-summary',
  title: t('Zusammenfassung anzeigen', 'Show summary'),
  detail: t(
    'Lesezeit-Zusammenfassung als Toast (keine Zwischenablage)',
    'Reading-time summary as toast (no clipboard)',
  ),
  keywords:
    'lesezeit reading time summary zusammenfassung toast anzeigen show wpm minutes',
  run: async () => {
    try {
      await copySummary()
    } catch (error) {
      await fanotes.ui.toast(
        t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`),
        'error',
      )
    }
  },
})

fanotes.onActivate(async () => {
  try {
    await loadSettings()
    fanotes.log(
      'reading-time activated',
      fanotes.app.appVersion,
      fanotes.app.language,
      settings.wpm,
      settings.scope,
      settings.showStatus,
    )

    // Soft refresh on note:opened / note:saved debounce — active only Soft
    fanotes.events.on('note:opened', () => {
      scheduleRefresh(200)
    })

    fanotes.events.on('note:saved', () => {
      scheduleRefresh(DEBOUNCE_MS)
    })

    // Activate Soft: if showStatus one refresh Soft (active only Soft)
    if (settings.showStatus) {
      let active = null
      try {
        active = await fanotes.notes.active()
      } catch (error) {
        fanotes.log('activate notes.active failed', errMessage(error))
      }
      if (active && active.path) {
        await refresh()
      } else {
        snapshot = emptySnapshot()
        snapshot.wpm = clampWpm(settings.wpm)
        await updateStatus()
      }
    }
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(async () => {
  clearTimeout(refreshTimer)
  refreshTimer = 0
  refreshBusy = false
  refreshQueued = false
  try {
    await fanotes.ui.status.remove(STATUS_ID)
  } catch {
    // Host also clears status on deactivate.
  }
  panel = null
  snapshot = emptySnapshot()
})
