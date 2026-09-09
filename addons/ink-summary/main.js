/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Tinten-Übersicht / Ink Summary – pen/ink stats for the active note only
// (stats.ink.* + optional ink.read Soft cross-check). No vault scan.

const SETTINGS_KEY = 'settings'
const PANEL_ID = 'ink'
const STATUS_ID = 'ink'
const DEBOUNCE_MS = 400
const MAX_COLORS_SHOWN = 8

/**
 * @typedef {{
 *   showStatus: boolean,
 *   preferStats: boolean,
 * }} Settings
 */

/**
 * @typedef {{
 *   available: boolean,
 *   path: string | null,
 *   title: string | null,
 *   strokes: number,
 *   handwritingStrokes: number,
 *   artStrokes: number,
 *   points: number,
 *   lengthMm: number,
 *   penMs: number,
 *   timeLabel: string,
 *   colors: string[],
 *   inkReadStrokes: number | null,
 * }} Snapshot
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  showStatus: true,
  preferStats: true,
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
    strokes: 0,
    handwritingStrokes: 0,
    artStrokes: 0,
    points: 0,
    lengthMm: 0,
    penMs: 0,
    timeLabel: '0 min',
    colors: /** @type {string[]} */ ([]),
    inkReadStrokes: /** @type {number | null} */ (null),
  }
}

/**
 * Soft number: missing / NaN / negative → 0.
 * @param {unknown} v
 */
function softNum(v) {
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

/**
 * Soft: ink.ms or penDownMs (writing-streak pattern).
 * @param {Record<string, unknown>} inkObj
 */
function softPenMs(inkObj) {
  let n = Number(inkObj.ms)
  if (!Number.isFinite(n) || n < 0) n = Number(inkObj.penDownMs)
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

/**
 * Time label: Math.round(ms/60000) + ' min'
 * @param {number} ms
 */
function formatTimeMin(ms) {
  return `${Math.round(softNum(ms) / 60000)} min`
}

/**
 * Soft count strokes from ink.read document (strokes[] or pages[].strokes).
 * @param {unknown} inkDoc
 * @returns {number | null}
 */
function countInkReadStrokes(inkDoc) {
  if (!inkDoc || typeof inkDoc !== 'object') return null
  const doc = /** @type {Record<string, unknown>} */ (inkDoc)
  if (Array.isArray(doc.strokes)) return doc.strokes.length
  if (Array.isArray(doc.pages)) {
    let sum = 0
    let any = false
    for (const page of doc.pages) {
      if (!page || typeof page !== 'object') continue
      const strokes = /** @type {Record<string, unknown>} */ (page).strokes
      if (Array.isArray(strokes)) {
        any = true
        sum += strokes.length
      }
    }
    return any ? sum : null
  }
  return null
}

/**
 * @param {unknown} raw
 * @returns {Settings}
 */
function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const obj = /** @type {Record<string, unknown>} */ (raw)
  return {
    showStatus: obj.showStatus !== false,
    preferStats: obj.preferStats !== false,
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
      showStatus: settings.showStatus,
      preferStats: settings.preferStats,
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
 * Active note only – no vault list. Soft: nested stats.ink.*; missing → 0.
 * Optional ink.read Soft cross-check for stroke count.
 * @returns {Promise<Snapshot>}
 */
async function compute() {
  let active = null
  try {
    active = await fanotes.notes.active()
  } catch (error) {
    fanotes.log('notes.active failed', errMessage(error))
    return emptySnapshot()
  }

  if (!active || !active.path) {
    return emptySnapshot()
  }

  const path = String(active.path)
  const title = typeof active.title === 'string' ? active.title : path

  /** @type {Record<string, unknown>} */
  let inkObj = {}
  try {
    const stats = await fanotes.stats.read(path)
    if (stats && typeof stats === 'object') {
      const ink = /** @type {Record<string, unknown>} */ (stats).ink
      // Soft: nested stats.ink.*; missing object → treat as empty zeros
      if (ink && typeof ink === 'object') {
        inkObj = /** @type {Record<string, unknown>} */ (ink)
      }
    }
  } catch (error) {
    fanotes.log('stats.read failed', path, errMessage(error))
  }

  let statsStrokes = softNum(inkObj.strokes)
  const handwritingStrokes = softNum(inkObj.handwritingStrokes)
  const artStrokes = softNum(inkObj.artStrokes)
  const points = softNum(inkObj.points)
  const lengthMm = softNum(inkObj.lengthMm)
  const penMs = softPenMs(inkObj)

  /** @type {string[]} */
  let colors = []
  if (Array.isArray(inkObj.colors)) {
    for (const c of inkObj.colors) {
      if (typeof c === 'string' && c.trim()) colors.push(c.trim())
    }
  }

  let inkReadStrokes = /** @type {number | null} */ (null)
  if (fanotes.hasPermission('ink:read')) {
    try {
      const inkDoc = await fanotes.ink.read(path)
      // Soft: null → ignore
      inkReadStrokes = countInkReadStrokes(inkDoc)
    } catch (error) {
      fanotes.log('ink.read failed', path, errMessage(error))
      inkReadStrokes = null
    }
  }

  // Stroke count: preferStats → stats; else Soft prefer ink.read when available
  let strokes = statsStrokes
  if (!settings.preferStats && inkReadStrokes !== null) {
    strokes = inkReadStrokes
  } else if (settings.preferStats && inkReadStrokes !== null && statsStrokes === 0 && inkReadStrokes > 0) {
    // Soft cross-check: stats empty but live ink has strokes
    strokes = inkReadStrokes
  }

  return {
    available: true,
    path,
    title,
    strokes,
    handwritingStrokes,
    artStrokes,
    points,
    lengthMm,
    penMs,
    timeLabel: formatTimeMin(penMs),
    colors,
    inkReadStrokes,
  }
}

function formatSummary() {
  if (!snapshot.available) {
    return t(
      'Keine aktive Notiz – keine Tinten-Statistik.',
      'No active note – no ink stats.',
    )
  }
  const colorPart =
    snapshot.colors.length === 0
      ? t('keine Farben', 'no colors')
      : snapshot.colors.slice(0, MAX_COLORS_SHOWN).join(', ')
  return t(
    `Striche: ${snapshot.strokes} | Handschrift: ${snapshot.handwritingStrokes} | Kunst: ${snapshot.artStrokes} | Zeit: ${snapshot.timeLabel} | Länge: ${Math.round(snapshot.lengthMm)} mm | Farben (${snapshot.colors.length}): ${colorPart}`,
    `Strokes: ${snapshot.strokes} | Handwriting: ${snapshot.handwritingStrokes} | Art: ${snapshot.artStrokes} | Time: ${snapshot.timeLabel} | Length: ${Math.round(snapshot.lengthMm)} mm | Colors (${snapshot.colors.length}): ${colorPart}`,
  )
}

function renderBlocks() {
  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Tinten-Übersicht', 'Ink Summary') },
  ]

  if (!snapshot.available) {
    blocks.push({
      type: 'callout',
      tone: 'info',
      text: t(
        'Keine aktive Notiz. Öffne eine Notiz mit .famd-Statistik, um Stift-Daten zu sehen. Kein Vault-Scan. PDF ohne Tinte bleibt leer.',
        'No active note. Open a note with .famd stats to see pen data. No vault scan. PDFs without ink stay empty.',
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
        { key: t('Striche', 'Strokes'), value: String(snapshot.strokes) },
        {
          key: t('Handschrift', 'Handwriting'),
          value: String(snapshot.handwritingStrokes),
        },
        { key: t('Kunst', 'Art'), value: String(snapshot.artStrokes) },
        { key: t('Zeit', 'Time'), value: snapshot.timeLabel },
        {
          key: t('Länge', 'Length'),
          value: `${Math.round(snapshot.lengthMm)} mm`,
        },
        {
          key: t('Farben', 'Colors'),
          value: String(snapshot.colors.length),
        },
      ],
    })

    const shown = snapshot.colors.slice(0, MAX_COLORS_SHOWN)
    blocks.push({
      type: 'text',
      muted: true,
      text:
        shown.length > 0
          ? shown.join(', ') +
            (snapshot.colors.length > MAX_COLORS_SHOWN
              ? t(
                  ` … (+${snapshot.colors.length - MAX_COLORS_SHOWN})`,
                  ` … (+${snapshot.colors.length - MAX_COLORS_SHOWN})`,
                )
              : '')
          : t('Keine Farben erfasst.', 'No colors recorded.'),
    })
  }

  blocks.push({ type: 'divider' })

  blocks.push({
    type: 'checkbox',
    id: 'showStatus',
    label: t('Statusleiste anzeigen', 'Show status bar'),
    checked: settings.showStatus === true,
  })

  blocks.push({
    type: 'checkbox',
    id: 'preferStats',
    label: t(
      'Statistik bevorzugen (stats.ink)',
      'Prefer stats (stats.ink)',
    ),
    checked: settings.preferStats === true,
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
      'Nur die aktive Notiz (stats.ink.* / optional ink.read). Abgrenzung: note-statistics = allgemein; writing-streak = Vault-Serie; hier = Ink-Fokus aktive Notiz.',
      'Active note only (stats.ink.* / optional ink.read). Contrast: note-statistics = general; writing-streak = vault streak; here = ink focus on the active note.',
    ),
  })

  return blocks
}

async function updateStatus() {
  try {
    // Status: `✒️ Nm` only when showStatus && strokes > 0
    if (!settings.showStatus || !snapshot.available || !(snapshot.strokes > 0)) {
      await fanotes.ui.status.remove(STATUS_ID)
      return
    }
    const text = `✒️ ${Math.round(snapshot.penMs / 60000)}m`
    await fanotes.ui.status.set({
      id: STATUS_ID,
      text: text.slice(0, 60),
      title: t('Tinten-Übersicht öffnen', 'Open Ink Summary'),
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
    await panel.setTitle(t('Tinten-Übersicht', 'Ink Summary'))
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
  // Gate: only when showStatus or panel open (no list scan)
  if (!settings.showStatus && !panel) return
  clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = 0
    if (!settings.showStatus && !panel) return
    void refresh()
  }, delay)
}

async function copySummary() {
  try {
    if (settings.showStatus || panel || !snapshot.available) {
      snapshot = await compute()
      await updateStatus()
      await updatePanel()
    }
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
      title: t('Tinten-Übersicht', 'Ink Summary'),
      icon: '✒️',
      blocks: renderBlocks(),
      focus: true,
    })

    panel.onAction(async (action) => {
      try {
        if (action.id === 'refresh') {
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
        if (input.id === 'preferStats') {
          const rollback = { ...settings }
          settings.preferStats = input.value === true
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
  title: t('Tinten-Übersicht öffnen', 'Open Ink Summary'),
  detail: t(
    'Stift-Statistik der aktiven Notiz (Striche, Zeit, Farben)',
    'Pen stats for the active note (strokes, time, colors)',
  ),
  keywords:
    'ink tinte stift handwriting strokes pen zeichnen übersicht summary panel öffnen open',
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
  title: t('Tinte aktualisieren', 'Refresh ink stats'),
  detail: t(
    'Stift-Statistik der aktiven Notiz neu lesen',
    'Re-read pen stats of the active note',
  ),
  keywords:
    'ink tinte stift handwriting strokes pen zeichnen aktualisieren refresh',
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
          `Aktualisiert: ${snapshot.strokes} Striche, ${snapshot.timeLabel}`,
          `Updated: ${snapshot.strokes} strokes, ${snapshot.timeLabel}`,
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
    'Tinten-Zusammenfassung als Toast (keine Zwischenablage)',
    'Ink summary as toast (no clipboard)',
  ),
  keywords:
    'ink tinte stift handwriting strokes pen zusammenfassung summary toast anzeigen show',
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
      'ink-summary activated',
      fanotes.app.appVersion,
      fanotes.app.language,
      settings.showStatus,
      settings.preferStats,
    )

    // Debounced refresh on note:opened / note:saved only when showStatus|panel open
    fanotes.events.on('note:opened', () => {
      scheduleRefresh(200)
    })

    fanotes.events.on('note:saved', () => {
      scheduleRefresh(DEBOUNCE_MS)
    })

    // Activate: if showStatus and active → EIN stats.read (active-only). No vault list.
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
