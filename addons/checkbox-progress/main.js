/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Aufgaben-Fortschritt / Checkbox Progress – count Markdown checkboxes
// in the open editor only (no vault scan); progress bar, status, panel.

const SETTINGS_KEY = 'settings'
const PANEL_ID = 'progress'
const STATUS_ID = 'cb'
const DEBOUNCE_MS = 300
const MAX_OPEN_LIST = 30
const BAR_MIN = 5
const BAR_MAX = 40

/** Line: optional indent, dash/star/plus, [ ] or [x]/[X], then task text. */
const CHECKBOX_LINE_RE = /^\s*[-*+]\s+\[( |x|X)\](?:\s+(.*))?$/u

/**
 * @typedef {{
 *   showStatus: boolean,
 *   barWidth: number,
 * }} Settings
 */

/**
 * @typedef {{
 *   available: boolean,
 *   open: number,
 *   done: number,
 *   total: number,
 *   percent: number,
 *   openTasks: string[],
 * }} Snapshot
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  showStatus: true,
  barWidth: 10,
}

/** @type {Settings} */
let settings = { ...DEFAULT_SETTINGS }

/** @type {FaNotes.Panel | null} */
let panel = null

/** @type {Snapshot} */
let snapshot = {
  available: false,
  open: 0,
  done: 0,
  total: 0,
  percent: 0,
  openTasks: [],
}

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

/**
 * @param {unknown} raw
 * @returns {Settings}
 */
function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const obj = /** @type {Record<string, unknown>} */ (raw)
  let barWidth = Number(obj.barWidth)
  if (!Number.isFinite(barWidth)) barWidth = DEFAULT_SETTINGS.barWidth
  barWidth = Math.min(BAR_MAX, Math.max(BAR_MIN, Math.floor(barWidth)))
  return {
    showStatus: obj.showStatus !== false,
    barWidth,
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
 * Persist settings; on failure restore `rollback` when provided.
 * @param {Settings} [rollback]
 * @returns {Promise<boolean>}
 */
async function saveSettings(rollback) {
  try {
    await fanotes.storage.set(SETTINGS_KEY, {
      showStatus: settings.showStatus,
      barWidth: settings.barWidth,
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
 * Parse checkbox lines from editor text. open = space; done = x|X.
 * @param {string} text
 * @returns {{ open: number, done: number, total: number, percent: number, openTasks: string[] }}
 */
function parseCheckboxes(text) {
  const normalised = String(text ?? '').replace(/\r\n|\r/g, '\n')
  const lines = normalised.split('\n')
  let open = 0
  let done = 0
  /** @type {string[]} */
  const openTasks = []

  for (const line of lines) {
    const m = CHECKBOX_LINE_RE.exec(line)
    if (!m) continue
    const mark = m[1]
    const taskText = String(m[2] ?? '').trim()
    if (mark === ' ') {
      open += 1
      if (openTasks.length < MAX_OPEN_LIST) {
        openTasks.push(taskText || t('(ohne Text)', '(no text)'))
      }
    } else {
      // x or X
      done += 1
    }
  }

  const total = open + done
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)
  return { open, done, total, percent, openTasks }
}

/**
 * Text progress bar: `████░░░░░░ 40%`
 * @param {number} percent 0–100
 * @param {number} width
 */
function buildBar(percent, width) {
  const w = Math.min(BAR_MAX, Math.max(BAR_MIN, Math.floor(width)))
  const pct = Math.min(100, Math.max(0, Math.round(percent)))
  const filled = Math.round((pct / 100) * w)
  const empty = Math.max(0, w - filled)
  return `${'█'.repeat(filled)}${'░'.repeat(empty)} ${pct}%`
}

function emptySnapshot() {
  return {
    available: false,
    open: 0,
    done: 0,
    total: 0,
    percent: 0,
    openTasks: /** @type {string[]} */ ([]),
  }
}

/**
 * Read editor.getText(); null → empty state.
 * @returns {Promise<Snapshot>}
 */
async function compute() {
  let fullText = null
  try {
    fullText = await fanotes.editor.getText()
  } catch (error) {
    fanotes.log('editor.getText failed', errMessage(error))
    return emptySnapshot()
  }

  if (fullText === null) {
    return emptySnapshot()
  }

  const parsed = parseCheckboxes(fullText)
  return {
    available: true,
    open: parsed.open,
    done: parsed.done,
    total: parsed.total,
    percent: parsed.percent,
    openTasks: parsed.openTasks,
  }
}

/**
 * One-line summary for toast (copy-summary) – no clipboard.
 */
function formatSummary() {
  if (!snapshot.available) {
    return t(
      'Kein Markdown-Editor – keine Checkboxen.',
      'No Markdown editor – no checkboxes.',
    )
  }
  return t(
    `Offen: ${snapshot.open} | Erledigt: ${snapshot.done} | Gesamt: ${snapshot.total} | ${snapshot.percent}%`,
    `Open: ${snapshot.open} | Done: ${snapshot.done} | Total: ${snapshot.total} | ${snapshot.percent}%`,
  )
}

function renderBlocks() {
  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Aufgaben-Fortschritt', 'Checkbox Progress') },
  ]

  if (!snapshot.available) {
    blocks.push({
      type: 'callout',
      tone: 'info',
      text: t(
        'Kein Markdown-Editor geöffnet. Öffne eine Notiz im Schreibmodus, um Checkboxen zu zählen. Kein Vault-Scan.',
        'No Markdown editor is open. Open a note in writing mode to count checkboxes. No vault scan.',
      ),
    })
    blocks.push({
      type: 'checkbox',
      id: 'showStatus',
      label: t('Statusleiste anzeigen', 'Show status bar'),
      checked: settings.showStatus === true,
    })
    blocks.push({
      type: 'select',
      id: 'barWidth',
      label: t('Balkenbreite', 'Bar width'),
      value: String(settings.barWidth),
      options: [
        { value: '5', label: '5' },
        { value: '10', label: '10' },
        { value: '15', label: '15' },
        { value: '20', label: '20' },
        { value: '25', label: '25' },
        { value: '30', label: '30' },
        { value: '35', label: '35' },
        { value: '40', label: '40' },
      ],
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
    return blocks
  }

  blocks.push({
    type: 'keyvalue',
    items: [
      { key: t('Offen', 'Open'), value: String(snapshot.open) },
      { key: t('Erledigt', 'Done'), value: String(snapshot.done) },
      { key: t('Gesamt', 'Total'), value: String(snapshot.total) },
      { key: t('Prozent', 'Percent'), value: `${snapshot.percent}%` },
    ],
  })

  blocks.push({
    type: 'text',
    text: buildBar(snapshot.percent, settings.barWidth),
  })

  blocks.push({
    type: 'text',
    muted: true,
    text: t(
      'Offene Aufgaben (nur Anzeige – kein Umschalten per Klick):',
      'Open tasks (display only – no click-to-toggle):',
    ),
  })

  blocks.push({
    type: 'list',
    id: 'openTasks',
    empty: t('Keine offenen Checkboxen.', 'No open checkboxes.'),
    items: snapshot.openTasks.map((title, i) => ({
      id: `open-${i}`,
      title: title.slice(0, 200),
    })),
  })

  blocks.push({ type: 'divider' })

  blocks.push({
    type: 'checkbox',
    id: 'showStatus',
    label: t('Statusleiste anzeigen', 'Show status bar'),
    checked: settings.showStatus === true,
  })

  blocks.push({
    type: 'select',
    id: 'barWidth',
    label: t('Balkenbreite', 'Bar width'),
    value: String(settings.barWidth),
    options: [
      { value: '5', label: '5' },
      { value: '10', label: '10' },
      { value: '15', label: '15' },
      { value: '20', label: '20' },
      { value: '25', label: '25' },
      { value: '30', label: '30' },
      { value: '35', label: '35' },
      { value: '40', label: '40' },
    ],
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
      'Nur die offene Notiz (Editor). Kein Vault-Scan. Checkboxen hier nicht umschaltbar.',
      'Open note (editor) only. No vault scan. Checkboxes are not toggled here.',
    ),
  })

  return blocks
}

async function updateStatus() {
  try {
    if (!settings.showStatus) {
      await fanotes.ui.status.remove(STATUS_ID)
      return
    }
    const text = snapshot.available
      ? `☑ ${snapshot.done}/${snapshot.total}`
      : '☑ —'
    await fanotes.ui.status.set({
      id: STATUS_ID,
      text: text.slice(0, 60),
      title: t(
        'Aufgaben-Fortschritt öffnen',
        'Open Checkbox Progress',
      ),
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
    await panel.setTitle(t('Aufgaben-Fortschritt', 'Checkbox Progress'))
  } catch (error) {
    if (isNoPanel(error)) {
      panel = null
      return
    }
    fanotes.log('panel update failed', errMessage(error))
  }
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
 * @param {number} [delay]
 */
function scheduleRefresh(delay = DEBOUNCE_MS) {
  clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = 0
    void refresh()
  }, delay)
}

/** Whether panel is open or status bar is active (live refresh gate). */
function wantsLiveRefresh() {
  return Boolean(panel) || settings.showStatus === true
}

function clearToEmpty() {
  snapshot = emptySnapshot()
  void updateStatus()
  void updatePanel()
}

async function copySummary() {
  try {
    // Ensure snapshot is current when possible.
    if (wantsLiveRefresh() || !snapshot.available) {
      snapshot = await compute()
      await updateStatus()
      await updatePanel()
    }
    const summary = formatSummary()
    await fanotes.ui.toast(summary, 'info')
  } catch (error) {
    await fanotes.ui.toast(
      t(`Zusammenfassung fehlgeschlagen: ${errMessage(error)}`, `Summary failed: ${errMessage(error)}`),
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
      title: t('Aufgaben-Fortschritt', 'Checkbox Progress'),
      icon: '☑',
      blocks: renderBlocks(),
      focus: true,
    })

    panel.onAction(async (action) => {
      try {
        if (action.id === 'refresh') {
          await refresh()
          return
        }
        // list openTasks: display only – ignore clicks (no toggle)
        if (action.id === 'openTasks') return
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
        if (input.id === 'barWidth') {
          const rollback = { ...settings }
          let n = Number(input.value)
          if (!Number.isFinite(n)) n = DEFAULT_SETTINGS.barWidth
          settings.barWidth = Math.min(BAR_MAX, Math.max(BAR_MIN, Math.floor(n)))
          const ok = await saveSettings(rollback)
          if (!ok) {
            await updatePanel()
            return
          }
          await updatePanel()
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

// --- Commands: titles via t(); keywords fixed bilingual (not t()) -----------

fanotes.commands.register({
  id: 'open',
  title: t('Aufgaben-Fortschritt öffnen', 'Open Checkbox Progress'),
  detail: t(
    'Panel mit Offen/Erledigt, Balken und offenen Aufgaben der Notiz',
    'Panel with open/done counts, bar, and open tasks of the note',
  ),
  keywords:
    'checkbox fortschritt progress aufgaben todo checklist erledigt done panel öffnen open',
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
  title: t('Fortschritt aktualisieren', 'Refresh progress'),
  detail: t(
    'Checkboxen der offenen Notiz neu zählen',
    'Re-count checkboxes of the open note',
  ),
  keywords:
    'checkbox fortschritt progress aktualisieren refresh aufgaben todo checklist erledigt done',
  run: async () => {
    try {
      await refresh()
      await fanotes.ui.toast(
        snapshot.available
          ? t(
              `Aktualisiert: ${snapshot.done}/${snapshot.total} (${snapshot.percent}%)`,
              `Updated: ${snapshot.done}/${snapshot.total} (${snapshot.percent}%)`,
            )
          : t('Kein Markdown-Editor geöffnet.', 'No Markdown editor is open.'),
        snapshot.available ? 'success' : 'info',
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
    'Fortschritts-Zusammenfassung als Toast (keine Zwischenablage)',
    'Progress summary as toast (no clipboard)',
  ),
  keywords:
    'checkbox fortschritt progress zusammenfassung summary toast aufgaben todo checklist anzeigen show',
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
      'checkbox-progress activated',
      fanotes.app.appVersion,
      fanotes.app.language,
      settings.showStatus,
      settings.barWidth,
    )

    fanotes.events.on('note:opened', () => {
      if (!wantsLiveRefresh()) return
      scheduleRefresh(200)
    })

    // Clear / empty when leaving keyboard Markdown editor (e.g. ink).
    fanotes.events.on('mode:changed', (ev) => {
      if (!ev || ev.mode !== 'keyboard') {
        clearToEmpty()
        return
      }
      if (!wantsLiveRefresh()) return
      scheduleRefresh(200)
    })

    // note:changed needs notes:read per SDK; Vollspec omits it – gate safely.
    if (fanotes.hasPermission('notes:read')) {
      fanotes.events.on('note:changed', () => {
        if (!wantsLiveRefresh()) return
        scheduleRefresh(DEBOUNCE_MS)
      })
    }

    // Activate: if showStatus, one light refresh from editor (no vault).
    if (settings.showStatus) {
      await refresh()
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
