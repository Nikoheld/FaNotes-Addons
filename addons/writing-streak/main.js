/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Schreib-Serie / Writing Streak – aggregate silent page stats into a
// typing/pen streak, weekly focus goal, panel + optional status bar.

const SETTINGS_KEY = 'settings'
const PANEL_ID = 'streak'
const STATUS_ID = 'streak'
const DEFAULT_WEEKLY_GOAL = 120
const DEFAULT_MAX_NOTES = 400
const BAR_WIDTH = 10

/**
 * @typedef {{
 *   weeklyGoalMinutes: number,
 *   countInk: boolean,
 *   showStatus: boolean,
 *   maxNotes: number,
 * }} Settings
 */

/**
 * @typedef {{
 *   currentStreak: number,
 *   longestStreak: number,
 *   weekMinutes: number,
 *   notesScanned: number,
 *   notesSkipped: number,
 *   activeDayCount: number,
 * }} Aggregate
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  weeklyGoalMinutes: DEFAULT_WEEKLY_GOAL,
  countInk: true,
  showStatus: true,
  maxNotes: DEFAULT_MAX_NOTES,
}

/** @type {Settings} */
let settings = { ...DEFAULT_SETTINGS }

/** @type {FaNotes.Panel | null} */
let panel = null

/** @type {Aggregate} */
let aggregate = {
  currentStreak: 0,
  longestStreak: 0,
  weekMinutes: 0,
  notesScanned: 0,
  notesSkipped: 0,
  activeDayCount: 0,
}

let lastScanAt = 0
let scanning = false
let scanQueued = false

/** @type {ReturnType<typeof setTimeout> | 0} */
let debounceTimer = 0

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

function pad2(n) {
  return String(n).padStart(2, '0')
}

/** Local calendar YYYY-MM-DD. */
function formatDay(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function startOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date, delta) {
  const d = startOfDay(date)
  d.setDate(d.getDate() + delta)
  return d
}

/** Monday 00:00 local of the week containing `date` (Mon–Sun). */
function startOfWeekMonday(date = new Date()) {
  const d = startOfDay(date)
  const day = d.getDay() // 0 Sun … 6 Sat
  const offset = day === 0 ? -6 : 1 - day
  return addDays(d, offset)
}

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
function normalizeActiveDays(raw) {
  if (!Array.isArray(raw)) return []
  /** @type {string[]} */
  const out = []
  const seen = new Set()
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const day = item.slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue
    if (seen.has(day)) continue
    seen.add(day)
    out.push(day)
  }
  return out
}

/**
 * Current streak: consecutive days ending today, or yesterday if today is still empty.
 * @param {Set<string>} days
 */
function computeCurrentStreak(days) {
  if (!days.size) return 0
  const today = startOfDay()
  const todayKey = formatDay(today)
  let cursor = today
  if (!days.has(todayKey)) {
    const yesterday = addDays(today, -1)
    if (!days.has(formatDay(yesterday))) return 0
    cursor = yesterday
  }
  let streak = 0
  while (days.has(formatDay(cursor))) {
    streak += 1
    cursor = addDays(cursor, -1)
  }
  return streak
}

/**
 * Longest consecutive run in a set of YYYY-MM-DD days.
 * @param {Set<string>} days
 */
function computeLongestStreak(days) {
  if (!days.size) return 0
  const sorted = [...days].sort((a, b) => a.localeCompare(b))
  let best = 1
  let run = 1
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const cur = sorted[i]
    const prevDate = new Date(`${prev}T12:00:00`)
    const curDate = new Date(`${cur}T12:00:00`)
    const diffDays = Math.round((curDate.getTime() - prevDate.getTime()) / 86400000)
    if (diffDays === 1) {
      run += 1
      if (run > best) best = run
    } else {
      run = 1
    }
  }
  return best
}

/**
 * Minutes attributed to the current Mon–Sun week.
 * FaNotes stores lifetime focusMs/ink.ms per note — we attribute
 * proportionally by (active days this week / total active days).
 * @param {Array<{ activeDays: string[], focusMs: number, inkMs: number }>} notes
 * @param {boolean} countInk
 */
function computeWeekMinutes(notes, countInk) {
  const weekStart = startOfWeekMonday()
  const weekEnd = addDays(weekStart, 6)
  const startKey = formatDay(weekStart)
  const endKey = formatDay(weekEnd)
  let ms = 0
  for (const note of notes) {
    const days = note.activeDays
    if (!days.length) continue
    let inWeek = 0
    for (const day of days) {
      if (day >= startKey && day <= endKey) inWeek += 1
    }
    if (!inWeek) continue
    const total = note.focusMs + (countInk ? note.inkMs : 0)
    if (!(total > 0)) continue
    ms += total * (inWeek / days.length)
  }
  return Math.round(ms / 60000)
}

/**
 * Unicode text progress bar (no custom widget).
 * @param {number} ratio 0–1+
 */
function textProgressBar(ratio) {
  const r = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0))
  const filled = Math.round(r * BAR_WIDTH)
  const bar = `${'█'.repeat(filled)}${'░'.repeat(BAR_WIDTH - filled)}`
  return `${bar} ${Math.round(r * 100)}%`
}

/**
 * @param {unknown} stats
 * @returns {{ activeDays: string[], focusMs: number, inkMs: number } | null}
 */
function extractFromStats(stats) {
  if (!stats || typeof stats !== 'object') return null
  const obj = /** @type {Record<string, unknown>} */ (stats)
  const activeDays = normalizeActiveDays(obj.activeDays)
  let focusMs = Number(obj.focusMs)
  if (!Number.isFinite(focusMs) || focusMs < 0) focusMs = 0
  let inkMs = 0
  const ink = obj.ink
  if (ink && typeof ink === 'object') {
    const inkObj = /** @type {Record<string, unknown>} */ (ink)
    let n = Number(inkObj.ms)
    if (!Number.isFinite(n) || n < 0) n = Number(inkObj.penDownMs)
    if (Number.isFinite(n) && n > 0) inkMs = n
  }
  return { activeDays, focusMs, inkMs }
}

async function loadSettings() {
  try {
    const stored = await fanotes.storage.get(SETTINGS_KEY)
    if (stored && typeof stored === 'object') {
      const obj = /** @type {Record<string, unknown>} */ (stored)

      let weeklyGoalMinutes = Number(obj.weeklyGoalMinutes)
      if (!Number.isFinite(weeklyGoalMinutes) || weeklyGoalMinutes < 1) {
        weeklyGoalMinutes = DEFAULT_WEEKLY_GOAL
      }
      weeklyGoalMinutes = Math.min(10080, Math.floor(weeklyGoalMinutes))

      let maxNotes = Number(obj.maxNotes)
      if (!Number.isFinite(maxNotes) || maxNotes < 1) maxNotes = DEFAULT_MAX_NOTES
      maxNotes = Math.min(2000, Math.floor(maxNotes))

      settings = {
        weeklyGoalMinutes,
        countInk: obj.countInk !== false,
        showStatus: obj.showStatus !== false,
        maxNotes,
      }
    } else {
      settings = { ...DEFAULT_SETTINGS }
    }
  } catch (error) {
    fanotes.log('loadSettings failed', errMessage(error))
    settings = { ...DEFAULT_SETTINGS }
  }
}

async function saveSettings() {
  try {
    await fanotes.storage.set(SETTINGS_KEY, settings)
  } catch (error) {
    fanotes.log('saveSettings failed', errMessage(error))
  }
}

/**
 * Full vault stats aggregation (md/markdown only, capped).
 * @param {{ silent?: boolean }} [opts]
 */
async function rescan(opts = {}) {
  if (scanning) {
    scanQueued = true
    return
  }
  scanning = true
  try {
    await refreshPanel()

    let notes = []
    try {
      notes = await fanotes.notes.list()
    } catch (error) {
      await fanotes.ui.toast(
        t(`Notizenliste fehlgeschlagen: ${errMessage(error)}`, `Note list failed: ${errMessage(error)}`),
        'error',
      )
      return
    }

    const mdNotes = notes
      .filter((n) => /\.(md|markdown)$/iu.test(n.path))
      .sort((a, b) => String(b.modifiedAt ?? '').localeCompare(String(a.modifiedAt ?? '')))
      .slice(0, settings.maxNotes)

    /** @type {Array<{ activeDays: string[], focusMs: number, inkMs: number }>} */
    const collected = []
    /** @type {Set<string>} */
    const unionDays = new Set()
    let skipped = 0

    for (const note of mdNotes) {
      let stats = null
      try {
        stats = await fanotes.stats.read(note.path)
      } catch (error) {
        fanotes.log('stats.read failed', note.path, errMessage(error))
        skipped += 1
        continue
      }
      const extracted = extractFromStats(stats)
      if (!extracted) {
        skipped += 1
        continue
      }
      // Pen duration from stats.ink.* (no ink:read permission).
      for (const day of extracted.activeDays) unionDays.add(day)
      collected.push(extracted)
    }

    aggregate = {
      currentStreak: computeCurrentStreak(unionDays),
      longestStreak: computeLongestStreak(unionDays),
      weekMinutes: computeWeekMinutes(collected, settings.countInk),
      notesScanned: mdNotes.length,
      notesSkipped: skipped,
      activeDayCount: unionDays.size,
    }
    lastScanAt = Date.now()

    if (!opts.silent) {
      await fanotes.ui.toast(
        t(
          `Serie aktualisiert: ${aggregate.currentStreak} Tag(e), ${aggregate.weekMinutes} min diese Woche (${mdNotes.length} Notizen).`,
          `Streak updated: ${aggregate.currentStreak} day(s), ${aggregate.weekMinutes} min this week (${mdNotes.length} notes).`,
        ),
        'success',
      )
    }
  } catch (error) {
    try {
      await fanotes.ui.toast(
        t(`Scan fehlgeschlagen: ${errMessage(error)}`, `Scan failed: ${errMessage(error)}`),
        'error',
      )
    } catch {
      fanotes.log('rescan failed', errMessage(error))
    }
  } finally {
    scanning = false
    await updateStatus()
    await refreshPanel()
    if (scanQueued) {
      scanQueued = false
      void rescan({ silent: true })
    }
  }
}

function scheduleRescan() {
  // Do not burn Worker time when nothing visible needs the index.
  if (!settings.showStatus && !panel) return
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = 0
    if (!settings.showStatus && !panel) return
    void rescan({ silent: true })
  }, 1500)
}

async function updateStatus() {
  try {
    if (!settings.showStatus) {
      await fanotes.ui.status.remove(STATUS_ID)
      return
    }
    if (!lastScanAt) {
      await fanotes.ui.status.remove(STATUS_ID)
      return
    }
    const n = aggregate.currentStreak
    const goal = settings.weeklyGoalMinutes
    const week = aggregate.weekMinutes
    const pct = goal > 0 ? Math.min(100, Math.round((week / goal) * 100)) : 0
    await fanotes.ui.status.set({
      id: STATUS_ID,
      text: `🔥 ${n}d`,
      title: t(
        `Serie ${n} Tag(e) · Woche ${week}/${goal} min (${pct} %) – Klick öffnet das Panel`,
        `Streak ${n} day(s) · week ${week}/${goal} min (${pct} %) – click opens the panel`,
      ),
      onClick: () => {
        openPanel()
      },
    })
  } catch (error) {
    fanotes.log('updateStatus failed', errMessage(error))
  }
}

function formatUpdatedAt(ts) {
  if (!ts) return t('nie', 'never')
  try {
    const locale = fanotes.app.language === 'en' ? 'en-US' : 'de-DE'
    return new Date(ts).toLocaleString(locale)
  } catch {
    return new Date(ts).toISOString()
  }
}

function renderBlocks() {
  const goal = settings.weeklyGoalMinutes
  const week = aggregate.weekMinutes
  const ratio = goal > 0 ? week / goal : 0
  const bar = textProgressBar(ratio)

  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Schreib-Serie', 'Writing Streak'), level: 2 },
    {
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'rescan',
          label: scanning
            ? t('Scan …', 'Scanning …')
            : t('Neu einlesen', 'Rescan'),
          primary: true,
          disabled: scanning,
        },
      ],
    },
    {
      type: 'keyvalue',
      items: [
        {
          key: t('Aktuelle Serie', 'Current streak'),
          value: t(`${aggregate.currentStreak} Tag(e)`, `${aggregate.currentStreak} day(s)`),
        },
        {
          key: t('Längste Serie', 'Longest streak'),
          value: t(`${aggregate.longestStreak} Tag(e)`, `${aggregate.longestStreak} day(s)`),
        },
        {
          key: t('Diese Woche', 'This week'),
          value: t(`${week} min`, `${week} min`),
        },
        {
          key: t('Wochenziel', 'Weekly goal'),
          value: t(`${goal} min`, `${goal} min`),
        },
        { key: t('Zuletzt', 'Updated'), value: formatUpdatedAt(lastScanAt) },
      ],
    },
    {
      type: 'text',
      text: `${t('Fortschritt', 'Progress')}: ${bar}`,
    },
    {
      type: 'progress',
      value: Math.max(0, Math.min(1, ratio)),
      label: t(`${week} / ${goal} min`, `${week} / ${goal} min`),
    },
    { type: 'divider' },
    {
      type: 'input',
      id: 'weeklyGoalMinutes',
      label: t('Wochenziel (Minuten)', 'Weekly goal (minutes)'),
      value: String(settings.weeklyGoalMinutes),
      placeholder: String(DEFAULT_WEEKLY_GOAL),
    },
    {
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'saveGoal',
          label: t('Ziel speichern', 'Save goal'),
        },
      ],
    },
    {
      type: 'checkbox',
      id: 'countInk',
      label: t(
        'Stiftzeit (ink.ms) zur Fokuszeit zählen',
        'Count pen time (ink.ms) toward focus',
      ),
      checked: settings.countInk,
    },
    {
      type: 'checkbox',
      id: 'showStatus',
      label: t(
        'Serie in der Statusleiste anzeigen',
        'Show streak in the status bar',
      ),
      checked: settings.showStatus,
    },
    {
      type: 'text',
      muted: true,
      text: t(
        `Basiert auf FaNotes-Seitenstatistik; max. ${settings.maxNotes} zuletzt geänderte Notizen.`,
        `Based on FaNotes page stats; max ${settings.maxNotes} most recently modified notes.`,
      ),
    },
  ]

  return blocks
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Schreib-Serie', 'Writing Streak'))
  } catch (error) {
    if (isNoPanel(error)) {
      panel = null
      return
    }
    fanotes.log('refreshPanel', errMessage(error))
  }
}

/**
 * @param {Record<string, unknown>} values
 */
async function applyGoalFromValues(values) {
  if (values.weeklyGoalMinutes != null) {
    let n = Number(String(values.weeklyGoalMinutes).trim())
    if (!Number.isFinite(n) || n < 1) n = DEFAULT_WEEKLY_GOAL
    settings.weeklyGoalMinutes = Math.min(10080, Math.floor(n))
  }
  await saveSettings()
}

async function promptSetGoal() {
  try {
    const raw = await fanotes.ui.prompt(
      t('Wochenziel in Minuten', 'Weekly goal in minutes'),
      {
        title: t('Wochenziel setzen', 'Set weekly goal'),
        placeholder: String(DEFAULT_WEEKLY_GOAL),
        value: String(settings.weeklyGoalMinutes),
      },
    )
    if (raw == null) return
    let n = Number(String(raw).trim())
    if (!Number.isFinite(n) || n < 1) {
      await fanotes.ui.toast(
        t('Bitte eine positive Zahl eingeben.', 'Please enter a positive number.'),
        'error',
      )
      return
    }
    settings.weeklyGoalMinutes = Math.min(10080, Math.floor(n))
    await saveSettings()
    await updateStatus()
    await refreshPanel()
    await fanotes.ui.toast(
      t(
        `Wochenziel: ${settings.weeklyGoalMinutes} min.`,
        `Weekly goal: ${settings.weeklyGoalMinutes} min.`,
      ),
      'success',
    )
  } catch (error) {
    await fanotes.ui.toast(
      t(`Ziel setzen fehlgeschlagen: ${errMessage(error)}`, `Set goal failed: ${errMessage(error)}`),
      'error',
    )
  }
}

function openPanel() {
  try {
    if (panel) {
      void panel.show().catch((error) => {
        if (isNoPanel(error)) panel = null
        else fanotes.log('panel.show', errMessage(error))
      })
      void (async () => {
        await refreshPanel()
        if (!lastScanAt) await rescan({ silent: true })
      })()
      return
    }

    panel = fanotes.ui.panel({
      id: PANEL_ID,
      title: t('Schreib-Serie', 'Writing Streak'),
      icon: '🔥',
      blocks: renderBlocks(),
      focus: true,
    })

    panel.onAction(async (action) => {
      try {
        if (action.id === 'rescan') {
          await rescan({ silent: false })
          return
        }
        if (action.id === 'saveGoal' || action.id === 'submit:weeklyGoalMinutes') {
          const values = action.values || {}
          await applyGoalFromValues(values)
          await updateStatus()
          await refreshPanel()
          await fanotes.ui.toast(
            t(
              `Wochenziel gespeichert: ${settings.weeklyGoalMinutes} min.`,
              `Weekly goal saved: ${settings.weeklyGoalMinutes} min.`,
            ),
            'success',
          )
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
        if (input.id === 'countInk') {
          settings.countInk = input.value === true
          await saveSettings()
          if (lastScanAt) await rescan({ silent: true })
          else await refreshPanel()
          return
        }
        if (input.id === 'showStatus') {
          settings.showStatus = input.value === true
          await saveSettings()
          await updateStatus()
          await refreshPanel()
          if (settings.showStatus && !lastScanAt) void rescan({ silent: true })
        }
      } catch (error) {
        fanotes.log('onInput', errMessage(error))
      }
    })

    void (async () => {
      try {
        await refreshPanel()
        if (!lastScanAt) await rescan({ silent: true })
      } catch (error) {
        fanotes.log('openPanel init', errMessage(error))
      }
    })()
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
  title: t('Schreib-Serie öffnen', 'Open Writing Streak'),
  detail: t(
    'Panel mit Serie, Wochenziel und Fortschritt',
    'Panel with streak, weekly goal and progress',
  ),
  keywords: 'streak serie fokus focus schreiben writing stift ink ziel goal handschrift handwriting',
  run: () => {
    try {
      openPanel()
    } catch (error) {
      void fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'rescan',
  title: t('Serie neu berechnen', 'Rescan streak'),
  detail: t(
    'Seitenstatistiken der zuletzt geänderten Notizen erneut lesen',
    'Re-read page stats of the most recently modified notes',
  ),
  keywords: 'streak serie rescan neu einlesen scan fokus focus writing',
  run: async () => {
    try {
      await rescan({ silent: false })
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'set-goal',
  title: t('Wochenziel setzen', 'Set weekly goal'),
  detail: t(
    'Wochenziel in Minuten per Dialog setzen',
    'Set the weekly goal in minutes via dialog',
  ),
  keywords: 'ziel goal woche week minuten minutes streak serie fokus focus',
  run: async () => {
    try {
      await promptSetGoal()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.onActivate(async () => {
  try {
    await loadSettings()
    fanotes.log(
      'writing-streak activated',
      fanotes.app.appVersion,
      settings.weeklyGoalMinutes,
      settings.maxNotes,
    )

    if (fanotes.hasPermission('notes:read')) {
      fanotes.events.on('note:saved', () => {
        scheduleRescan()
      })
      fanotes.events.on('note:created', () => {
        scheduleRescan()
      })
      fanotes.events.on('note:deleted', () => {
        scheduleRescan()
      })
    }

    fanotes.events.on('vault:changed', () => {
      scheduleRescan()
    })

    // Warm status bar only when it is shown (≤15s rule; non-blocking).
    if (settings.showStatus) void rescan({ silent: true })
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(async () => {
  clearTimeout(debounceTimer)
  debounceTimer = 0
  scanning = false
  scanQueued = false
  try {
    await fanotes.ui.status.remove(STATUS_ID)
  } catch {
    // Host tears down UI; ignore.
  }
  panel = null
  aggregate = {
    currentStreak: 0,
    longestStreak: 0,
    weekMinutes: 0,
    notesScanned: 0,
    notesSkipped: 0,
    activeDayCount: 0,
  }
  lastScanAt = 0
})
