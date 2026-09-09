/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Habit-Checkliste / Habit Checklist – dated checkbox habits in one note;
// toggle today, panel list, optional status. No vault:write, no network.

const SETTINGS_KEY = 'settings'
const PANEL_ID = 'habits'
const STATUS_ID = 'habits'
const DEFAULT_PATH = 'Habits.md'
const LOOKBACK_DAYS = 30

/** Strict line format: indent, bullet, [ ]/[x]/[X], YYYY-MM-DD, name. */
const HABIT_LINE_RE = /^(\s*)[-*+]\s+\[( |x|X)\]\s+(\d{4}-\d{2}-\d{2})\s+(.+?)\s*$/

/**
 * @typedef {{
 *   habitPath: string,
 *   habits: string[],
 *   showStatus: boolean,
 * }} Settings
 */

/**
 * @typedef {{
 *   name: string,
 *   done: boolean,
 *   lineIndex: number,
 * }} TodayHabit
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  habitPath: DEFAULT_PATH,
  habits: ['Lesen', 'Sport', 'Inbox zero'],
  showStatus: true,
}

/** @type {Settings} */
let settings = {
  habitPath: DEFAULT_SETTINGS.habitPath,
  habits: [...DEFAULT_SETTINGS.habits],
  showStatus: DEFAULT_SETTINGS.showStatus,
}

/** @type {FaNotes.Panel | null} */
let panel = null

/** Last known today snapshot for panel/status (lazy; no activate scan). */
/** @type {{ path: string, today: string, items: TodayHabit[], done: number, total: number } | null} */
let view = null

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
function todayIso(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/**
 * @param {string} iso YYYY-MM-DD
 * @returns {Date | null}
 */
function parseIsoDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''))
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const dt = new Date(y, mo - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null
  return dt
}

/**
 * Normalize a vault-relative habit path to a `.md` or `.markdown` file.
 * Rejects `..`, absolute paths, and non-markdown extensions.
 * @returns {{ path: string, folder: string, name: string, ext: string } | null}
 */
function normalizeHabitPath(raw) {
  let path = String(raw ?? '').trim().replace(/\\/g, '/')
  while (path.startsWith('/')) path = path.slice(1)
  while (path.endsWith('/')) path = path.slice(0, -1)
  if (!path) path = DEFAULT_PATH

  const parts = path.split('/').filter(Boolean)
  if (!parts.length || parts.some((p) => p === '.' || p === '..')) return null

  let file = parts[parts.length - 1]
  const lower = file.toLowerCase()
  let ext = '.md'
  if (lower.endsWith('.markdown')) {
    ext = '.markdown'
  } else if (lower.endsWith('.md')) {
    ext = '.md'
  } else if (lower.includes('.')) {
    return null
  } else {
    file = `${file}.md`
    parts[parts.length - 1] = file
    ext = '.md'
  }

  const name = file.slice(0, -ext.length)
  if (!name) return null
  const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
  return { path: parts.join('/'), folder, name, ext }
}

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
function normalizeHabitsList(raw) {
  if (!Array.isArray(raw)) return [...DEFAULT_SETTINGS.habits]
  /** @type {string[]} */
  const out = []
  const seen = new Set()
  for (const item of raw) {
    const name = String(item ?? '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out
}

/**
 * @param {unknown} raw
 * @returns {Settings}
 */
function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      habitPath: DEFAULT_SETTINGS.habitPath,
      habits: [...DEFAULT_SETTINGS.habits],
      showStatus: DEFAULT_SETTINGS.showStatus,
    }
  }
  const obj = /** @type {Record<string, unknown>} */ (raw)
  const parsed = normalizeHabitPath(obj.habitPath != null ? String(obj.habitPath) : DEFAULT_PATH)
  // Seed defaults only when `habits` key is absent; empty array is respected.
  const habits =
    !('habits' in obj) ? [...DEFAULT_SETTINGS.habits] : normalizeHabitsList(obj.habits)
  return {
    habitPath: parsed ? parsed.path : DEFAULT_PATH,
    habits,
    showStatus: obj.showStatus !== false,
  }
}

function habitHeading() {
  return t(
    '# Habit-Checkliste / Habit Checklist\n\nTägliche Habits als Datums-Checkboxen. Format: `- [ ] YYYY-MM-DD Name`\n\n',
    '# Habit Checklist / Habit-Checkliste\n\nDaily habits as dated checkboxes. Format: `- [ ] YYYY-MM-DD Name`\n\n',
  )
}

/**
 * @param {string} dateIso
 * @param {string} habitName
 * @param {boolean} [done]
 */
function formatHabitLine(dateIso, habitName, done = false) {
  const mark = done ? 'x' : ' '
  return `- [${mark}] ${dateIso} ${habitName}`
}

/**
 * Persist habitPath when create/fallback resolves to a different path.
 * @param {string} path
 */
async function persistHabitPath(path) {
  if (!path || path === settings.habitPath) return
  const rollback = {
    habitPath: settings.habitPath,
    habits: [...settings.habits],
    showStatus: settings.showStatus,
  }
  settings = { ...settings, habitPath: path }
  try {
    await fanotes.storage.set(SETTINGS_KEY, settings)
    fanotes.log('persisted habitPath after create/fallback', path)
  } catch (error) {
    settings = rollback
    fanotes.log('could not persist habitPath', errMessage(error))
  }
}

/**
 * Ensure the habit note exists; create if missing.
 * Without vault:write, a missing parent folder is toasted and we fall back to
 * FaNotes’ default folder, then persist the real path (like quick-inbox / session-log).
 * @returns {Promise<string | null>} resolved vault path
 */
async function ensureHabitFile() {
  const parsed = normalizeHabitPath(settings.habitPath)
  if (!parsed) {
    await fanotes.ui.toast(
      t(
        'Ungültiger Habit-Pfad (nur .md/.markdown, kein „..“).',
        'Invalid habit path (only .md/.markdown, no “..”).',
      ),
      'error',
    )
    return null
  }

  let exists = false
  try {
    exists = await fanotes.notes.exists(parsed.path)
  } catch (error) {
    await fanotes.ui.toast(
      t(`Prüfung fehlgeschlagen: ${errMessage(error)}`, `Existence check failed: ${errMessage(error)}`),
      'error',
    )
    return null
  }

  if (exists) return parsed.path

  const day = todayIso()
  const lines = settings.habits.length
    ? settings.habits.map((name) => formatHabitLine(day, name, false))
    : []
  const content = habitHeading() + (lines.length ? `${lines.join('\n')}\n` : '')

  try {
    const opts = /** @type {{ folder?: string, name: string, content: string }} */ ({
      name: parsed.name,
      content,
    })
    if (parsed.folder) opts.folder = parsed.folder
    const created = await fanotes.notes.create(opts)
    const path = created || parsed.path
    fanotes.log('created habit note', path)
    await persistHabitPath(path)
    await fanotes.ui.toast(
      t(`Habit-Notiz angelegt: ${path}`, `Habit note created: ${path}`),
      'info',
    )
    return path
  } catch (error) {
    fanotes.log('create with folder failed, trying default folder', errMessage(error))
    if (parsed.folder) {
      await fanotes.ui.toast(
        t(
          `Ordner „${parsed.folder}“ fehlt – bitte manuell anlegen (kein vault:write). Fallback auf Standardordner.`,
          `Folder "${parsed.folder}" missing – please create it manually (no vault:write). Falling back to the default folder.`,
        ),
        'info',
      )
    }
    try {
      const bare = `${parsed.name}${parsed.ext}`
      try {
        if (await fanotes.notes.exists(bare)) {
          await persistHabitPath(bare)
          await fanotes.ui.toast(
            t(
              `Vorhandene Habit-Notiz „${bare}“ übernommen (Einstellungen aktualisiert).`,
              `Reused existing habit note "${bare}" (settings updated).`,
            ),
            'info',
          )
          return bare
        }
      } catch {
        // ignore exists probe errors and continue to create
      }
      const created = await fanotes.notes.create({
        name: parsed.name,
        content,
      })
      const path = created || `${parsed.name}${parsed.ext}`
      fanotes.log('created habit note in default folder', path)
      await persistHabitPath(path)
      await fanotes.ui.toast(
        t(
          `Habit-Notiz woanders angelegt. Einstellungen auf „${path}“ aktualisiert.`,
          `Habit note created elsewhere. Settings updated to "${path}".`,
        ),
        'info',
      )
      return path
    } catch (error2) {
      await fanotes.ui.toast(
        t(
          `Habit-Notiz konnte nicht angelegt werden: ${errMessage(error2)}`,
          `Could not create habit note: ${errMessage(error2)}`,
        ),
        'error',
      )
      return null
    }
  }
}

async function loadSettings() {
  try {
    const stored = await fanotes.storage.get(SETTINGS_KEY)
    settings = normalizeSettings(stored)
  } catch (error) {
    fanotes.log('loadSettings failed', errMessage(error))
    settings = {
      habitPath: DEFAULT_SETTINGS.habitPath,
      habits: [...DEFAULT_SETTINGS.habits],
      showStatus: DEFAULT_SETTINGS.showStatus,
    }
  }
}

/**
 * @param {Settings} [rollback]
 * @returns {Promise<boolean>}
 */
async function saveSettings(rollback) {
  try {
    await fanotes.storage.set(SETTINGS_KEY, {
      habitPath: settings.habitPath,
      habits: [...settings.habits],
      showStatus: settings.showStatus,
    })
    return true
  } catch (error) {
    if (rollback) {
      settings = {
        habitPath: rollback.habitPath,
        habits: [...rollback.habits],
        showStatus: rollback.showStatus,
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
 * Collect habit names seen on lines within the last LOOKBACK_DAYS (inclusive).
 * @param {string} text
 * @param {string} today
 * @returns {string[]}
 */
function namesSeenInLookback(text, today) {
  const todayDate = parseIsoDay(today)
  if (!todayDate) return []
  const cutoff = new Date(todayDate)
  cutoff.setDate(cutoff.getDate() - (LOOKBACK_DAYS - 1))
  const cutoffIso = todayIso(cutoff)

  /** @type {string[]} */
  const names = []
  const seen = new Set()
  const normalised = String(text ?? '').replace(/\r\n|\r/g, '\n')
  for (const line of normalised.split('\n')) {
    const m = HABIT_LINE_RE.exec(line)
    if (!m) continue
    const date = m[3]
    const name = String(m[4] ?? '').trim()
    if (!name) continue
    if (date < cutoffIso || date > today) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    names.push(name)
  }
  return names
}

/**
 * Union of configured habits + names seen in file (last 30 days), order-stable.
 * @param {string} text
 * @param {string} today
 * @returns {string[]}
 */
function unionHabitNames(text, today) {
  /** @type {string[]} */
  const out = []
  const seen = new Set()
  const push = (name) => {
    const n = String(name ?? '').trim()
    if (!n) return
    const key = n.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push(n)
  }
  for (const h of settings.habits) push(h)
  for (const h of namesSeenInLookback(text, today)) push(h)
  return out
}

/**
 * Find line index for today + habit name (exact trim match on group4).
 * @param {string[]} lines
 * @param {string} today
 * @param {string} habitName
 * @returns {number} index or -1
 */
function findTodayLineIndex(lines, today, habitName) {
  const target = habitName.trim()
  for (let i = 0; i < lines.length; i++) {
    const m = HABIT_LINE_RE.exec(lines[i])
    if (!m) continue
    if (m[3] !== today) continue
    if (String(m[4] ?? '').trim() !== target) continue
    return i
  }
  return -1
}

/**
 * @param {string} mark
 */
function isDoneMark(mark) {
  return mark === 'x' || mark === 'X'
}

/**
 * Build today's habit rows from note text (does not mutate).
 * @param {string} text
 * @param {string} today
 * @returns {TodayHabit[]}
 */
function parseTodayHabits(text, today) {
  const names = unionHabitNames(text, today)
  const lines = String(text ?? '').replace(/\r\n|\r/g, '\n').split('\n')
  /** @type {TodayHabit[]} */
  const items = []
  for (const name of names) {
    const idx = findTodayLineIndex(lines, today, name)
    if (idx < 0) {
      items.push({ name, done: false, lineIndex: -1 })
      continue
    }
    const m = HABIT_LINE_RE.exec(lines[idx])
    items.push({
      name,
      done: m ? isDoneMark(m[2]) : false,
      lineIndex: idx,
    })
  }
  return items
}

/**
 * Stale-safe write: mutate from a baseline, re-read immediately before write,
 * and re-apply the mutator on the fresh text if the note changed.
 * @param {string} path
 * @param {(text: string) => string | null} mutator returns null to abort
 * @returns {Promise<boolean>}
 */
async function writeStaleSafe(path, mutator) {
  let baseline
  try {
    baseline = await fanotes.notes.read(path)
  } catch (error) {
    await fanotes.ui.toast(
      t(`Lesen fehlgeschlagen: ${errMessage(error)}`, `Read failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }

  let planned = mutator(baseline)
  if (planned === null) return false

  let fresh
  try {
    fresh = await fanotes.notes.read(path)
  } catch (error) {
    await fanotes.ui.toast(
      t(`Erneutes Lesen fehlgeschlagen: ${errMessage(error)}`, `Re-read failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }

  if (fresh !== baseline) {
    planned = mutator(fresh)
    if (planned === null) return false
  }

  try {
    await fanotes.notes.write(path, planned)
    return true
  } catch (error) {
    await fanotes.ui.toast(
      t(`Schreiben fehlgeschlagen: ${errMessage(error)}`, `Write failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

/**
 * Ensure today's lines exist for the given names; optionally toggle one or all.
 * @param {{
 *   path: string,
 *   names: string[],
 *   mode: 'ensure' | 'toggle-one' | 'toggle-all',
 *   toggleName?: string,
 * }} opts
 * @returns {Promise<boolean>}
 */
async function applyTodayLines(opts) {
  const today = todayIso()
  const { path, names, mode } = opts
  const toggleName = opts.toggleName != null ? String(opts.toggleName).trim() : ''

  return writeStaleSafe(path, (text) => {
    const normalised = String(text ?? '').replace(/\r\n|\r/g, '\n')
    /** @type {string[]} */
    let lines = normalised.length ? normalised.split('\n') : []
    // Drop a single trailing empty line for cleaner appends; restore later if needed.
    let trailingEmpty = false
    if (lines.length && lines[lines.length - 1] === '') {
      trailingEmpty = true
      lines = lines.slice(0, -1)
    }

    const ensureName = (name) => {
      const n = name.trim()
      if (!n) return -1
      let idx = findTodayLineIndex(lines, today, n)
      if (idx < 0) {
        lines.push(formatHabitLine(today, n, false))
        idx = lines.length - 1
      }
      return idx
    }

    const toggleAt = (idx) => {
      if (idx < 0 || idx >= lines.length) return
      const m = HABIT_LINE_RE.exec(lines[idx])
      if (!m) return
      const done = isDoneMark(m[2])
      const nextMark = done ? ' ' : 'x'
      lines[idx] = `${m[1]}- [${nextMark}] ${m[3]} ${String(m[4]).trim()}`
    }

    if (mode === 'ensure') {
      for (const name of names) ensureName(name)
    } else if (mode === 'toggle-one') {
      if (!toggleName) return null
      const idx = ensureName(toggleName)
      toggleAt(idx)
    } else if (mode === 'toggle-all') {
      for (const name of names) {
        const idx = ensureName(name)
        toggleAt(idx)
      }
    }

    let out = lines.join('\n')
    if (trailingEmpty || out.length) out += '\n'
    return out
  })
}

/**
 * Refresh view from disk (ensure file, read, parse today).
 * @returns {Promise<boolean>}
 */
async function refreshView() {
  const path = await ensureHabitFile()
  if (!path) {
    view = null
    return false
  }

  let text
  try {
    text = await fanotes.notes.read(path)
  } catch (error) {
    await fanotes.ui.toast(
      t(`Lesen fehlgeschlagen: ${errMessage(error)}`, `Read failed: ${errMessage(error)}`),
      'error',
    )
    view = null
    return false
  }

  const today = todayIso()
  const items = parseTodayHabits(text, today)
  const done = items.filter((i) => i.done).length
  view = {
    path,
    today,
    items,
    done,
    total: items.length,
  }
  return true
}

async function updateStatus() {
  try {
    if (!settings.showStatus) {
      await fanotes.ui.status.remove(STATUS_ID)
      return
    }
    // Lazy: only show a/b after a successful read (command/panel/toggle).
    if (!view) {
      await fanotes.ui.status.remove(STATUS_ID)
      return
    }
    const text = `Habits ${view.done}/${view.total}`
    await fanotes.ui.status.set({
      id: STATUS_ID,
      text: text.slice(0, 60),
      title: t('Habit-Checkliste öffnen', 'Open Habit Checklist'),
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

function renderBlocks() {
  const items = view ? view.items : []
  const day = view ? view.today : todayIso()

  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Habit-Checkliste', 'Habit Checklist'), level: 2 },
    {
      type: 'keyvalue',
      items: [
        { key: t('Heute', 'Today'), value: day },
        {
          key: t('Fortschritt', 'Progress'),
          value: view ? `${view.done}/${view.total}` : '—',
        },
        { key: t('Pfad', 'Path'), value: settings.habitPath },
      ],
    },
    {
      type: 'list',
      id: 'todayHabits',
      empty: t(
        'Keine Habits für heute. Mit „Alle heutigen anlegen“ oder „Habit hinzufügen“ starten.',
        'No habits for today. Start with “Ensure all today” or “Add habit”.',
      ),
      items: items.map((h, i) => ({
        id: `h-${i}`,
        title: h.name,
        detail: h.done
          ? t('Erledigt – tippen zum Umschalten', 'Done – tap to toggle')
          : t('Offen – tippen zum Umschalten', 'Open – tap to toggle'),
        badge: h.done ? '✓' : '○',
      })),
    },
    {
      type: 'text',
      muted: true,
      text: t(
        'Klick auf eine Zeile schaltet das Habit für heute um (Hauptaktion).',
        'Click a row to toggle that habit for today (main interaction).',
      ),
    },
    { type: 'divider' },
    { type: 'heading', text: t('Einstellungen', 'Settings'), level: 3 },
    {
      type: 'input',
      id: 'habitPath',
      label: t('Habit-Pfad (.md/.markdown, relativ zum Vault)', 'Habit path (.md/.markdown, vault-relative)'),
      value: settings.habitPath,
      placeholder: DEFAULT_PATH,
    },
    {
      type: 'checkbox',
      id: 'showStatus',
      label: t(
        'Status „Habits a/b“ in der Statusleiste (nach erstem Lesen)',
        'Show “Habits a/b” in the status bar (after first read)',
      ),
      checked: settings.showStatus === true,
    },
    {
      type: 'callout',
      tone: 'info',
      text: t(
        'Zeilenformat: `- [ ] YYYY-MM-DD Name`. Ohne vault:write: fehlender Ordner → Hinweis + Fallback; realer Pfad wird gespeichert. Kein Vault-Scan beim Aktivieren.',
        'Line format: `- [ ] YYYY-MM-DD Name`. Without vault:write: missing folder → notice + fallback; real path is persisted. No vault scan on activate.',
      ),
    },
    {
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'ensure-today',
          label: t('Alle heutigen anlegen', 'Ensure all today'),
        },
        {
          type: 'button',
          id: 'open-note',
          label: t('Notiz öffnen', 'Open note'),
        },
        {
          type: 'button',
          id: 'refresh',
          label: t('Aktualisieren', 'Refresh'),
          primary: true,
        },
      ],
    },
    {
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'add-habit',
          label: t('Habit hinzufügen', 'Add habit'),
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
    await panel.setTitle(t('Habit-Checkliste', 'Habit Checklist'))
  } catch (error) {
    if (isNoPanel(error)) {
      panel = null
      return
    }
    fanotes.log('refreshPanel', errMessage(error))
  }
}

async function refreshUi() {
  await updateStatus()
  await refreshPanel()
}

/**
 * Ensure missing today lines for union habits (no toggle).
 */
async function ensureAllToday() {
  const path = await ensureHabitFile()
  if (!path) return

  let text
  try {
    text = await fanotes.notes.read(path)
  } catch (error) {
    await fanotes.ui.toast(
      t(`Lesen fehlgeschlagen: ${errMessage(error)}`, `Read failed: ${errMessage(error)}`),
      'error',
    )
    return
  }

  const today = todayIso()
  const names = unionHabitNames(text, today)
  const ok = await applyTodayLines({ path, names, mode: 'ensure' })
  if (!ok) return

  await refreshView()
  await refreshUi()
  await fanotes.ui.toast(
    t('Heutige Habit-Zeilen angelegt.', 'Today’s habit lines ensured.'),
    'success',
  )
}

/**
 * Toggle one habit today (create line if missing).
 * @param {string} habitName
 */
async function toggleOne(habitName) {
  const name = String(habitName ?? '').trim()
  if (!name) {
    await fanotes.ui.toast(t('Kein Habit-Name.', 'No habit name.'), 'info')
    return
  }

  const path = await ensureHabitFile()
  if (!path) return

  // Include this name even if not yet in settings / lookback.
  let text
  try {
    text = await fanotes.notes.read(path)
  } catch (error) {
    await fanotes.ui.toast(
      t(`Lesen fehlgeschlagen: ${errMessage(error)}`, `Read failed: ${errMessage(error)}`),
      'error',
    )
    return
  }
  const today = todayIso()
  const names = unionHabitNames(text, today)
  if (!names.some((n) => n.toLowerCase() === name.toLowerCase())) {
    names.push(name)
  }

  const ok = await applyTodayLines({
    path,
    names,
    mode: 'toggle-one',
    toggleName: name,
  })
  if (!ok) return

  await refreshView()
  await refreshUi()
  const item = view && view.items.find((i) => i.name.toLowerCase() === name.toLowerCase())
  const state = item && item.done ? '✓' : '○'
  await fanotes.ui.toast(
    t(`„${name}“ → ${state}`, `"${name}" → ${state}`),
    'success',
  )
}

/**
 * Toggle all union habits for today (missing → create then toggle).
 */
async function toggleAllToday() {
  const path = await ensureHabitFile()
  if (!path) return

  let text
  try {
    text = await fanotes.notes.read(path)
  } catch (error) {
    await fanotes.ui.toast(
      t(`Lesen fehlgeschlagen: ${errMessage(error)}`, `Read failed: ${errMessage(error)}`),
      'error',
    )
    return
  }

  const today = todayIso()
  const names = unionHabitNames(text, today)
  if (!names.length) {
    await fanotes.ui.toast(
      t('Keine Habits konfiguriert oder gefunden.', 'No habits configured or found.'),
      'info',
    )
    await refreshView()
    await refreshUi()
    return
  }

  const ok = await applyTodayLines({ path, names, mode: 'toggle-all' })
  if (!ok) return

  await refreshView()
  await refreshUi()
  await fanotes.ui.toast(
    t(
      view ? `Alle heutigen umgeschaltet (${view.done}/${view.total}).` : 'Alle heutigen umgeschaltet.',
      view ? `Toggled all today (${view.done}/${view.total}).` : 'Toggled all today.',
    ),
    'success',
  )
}

/**
 * Command: prompt habit name; empty → toggle all today.
 */
async function toggleCommand() {
  const raw = await fanotes.ui.prompt(
    t(
      'Habit-Name (leer = alle heutigen umschalten)',
      'Habit name (empty = toggle all today)',
    ),
    {
      title: t('Habit umschalten', 'Toggle habit'),
      placeholder: t('z. B. Lesen', 'e.g. Lesen'),
      value: '',
    },
  )
  if (raw === null) return
  const name = raw.trim()
  if (!name) {
    await toggleAllToday()
    return
  }
  await toggleOne(name)
}

async function openHabitNote() {
  try {
    const parsed = normalizeHabitPath(settings.habitPath)
    if (!parsed) {
      await fanotes.ui.toast(t('Ungültiger Habit-Pfad.', 'Invalid habit path.'), 'error')
      return
    }

    let exists = false
    try {
      exists = await fanotes.notes.exists(parsed.path)
    } catch (error) {
      await fanotes.ui.toast(
        t(`Prüfung fehlgeschlagen: ${errMessage(error)}`, `Existence check failed: ${errMessage(error)}`),
        'error',
      )
      return
    }

    let path = parsed.path
    if (!exists) {
      const created = await ensureHabitFile()
      if (!created) return
      path = created
    }

    try {
      await fanotes.notes.open(path)
    } catch (error) {
      await fanotes.ui.toast(
        t(`Öffnen fehlgeschlagen: ${errMessage(error)}`, `Open failed: ${errMessage(error)}`),
        'error',
      )
    }
  } catch (error) {
    try {
      await fanotes.ui.toast(
        t(`Unerwarteter Fehler: ${errMessage(error)}`, `Unexpected error: ${errMessage(error)}`),
        'error',
      )
    } catch {
      fanotes.log('openHabitNote failed', errMessage(error))
    }
  }
}

async function addHabit() {
  const raw = await fanotes.ui.prompt(
    t('Neuer Habit-Name', 'New habit name'),
    {
      title: t('Habit hinzufügen', 'Add habit'),
      placeholder: t('z. B. Meditation', 'e.g. Meditation'),
      value: '',
    },
  )
  if (raw === null) return
  const name = raw.trim()
  if (!name) return

  const exists = settings.habits.some((h) => h.toLowerCase() === name.toLowerCase())
  if (!exists) {
    const rollback = {
      habitPath: settings.habitPath,
      habits: [...settings.habits],
      showStatus: settings.showStatus,
    }
    settings = { ...settings, habits: [...settings.habits, name] }
    const saved = await saveSettings(rollback)
    if (!saved) {
      await refreshPanel()
      return
    }
  }

  const path = await ensureHabitFile()
  if (!path) return

  const ok = await applyTodayLines({
    path,
    names: [name],
    mode: 'ensure',
  })
  if (!ok) return

  await refreshView()
  await refreshUi()
  await fanotes.ui.toast(
    t(`Habit „${name}“ hinzugefügt.`, `Habit "${name}" added.`),
    'success',
  )
}

/**
 * @param {unknown} raw
 * @returns {Promise<boolean>}
 */
async function applyHabitPath(raw) {
  const parsed = normalizeHabitPath(raw != null ? String(raw) : settings.habitPath)
  if (!parsed) {
    await fanotes.ui.toast(
      t(
        'Ungültiger Habit-Pfad (nur .md/.markdown, kein „..“).',
        'Invalid habit path (only .md/.markdown, no “..”).',
      ),
      'error',
    )
    await refreshPanel()
    return false
  }
  if (parsed.path === settings.habitPath) return true
  const rollback = {
    habitPath: settings.habitPath,
    habits: [...settings.habits],
    showStatus: settings.showStatus,
  }
  settings = { ...settings, habitPath: parsed.path }
  view = null
  const ok = await saveSettings(rollback)
  await refreshPanel()
  return ok
}

async function openPanelFlow() {
  // First panel open: light read of habit note (lazy status).
  await refreshView()
  await refreshUi()
}

function openPanel() {
  try {
    if (panel) {
      void panel.show().catch((error) => {
        if (isNoPanel(error)) panel = null
        else fanotes.log('panel.show', errMessage(error))
      })
      void openPanelFlow()
      return
    }

    panel = fanotes.ui.panel({
      id: PANEL_ID,
      title: t('Habit-Checkliste', 'Habit Checklist'),
      icon: '☑',
      blocks: renderBlocks(),
    })

    panel.onAction(async (action) => {
      try {
        if (action.id === 'todayHabits' && action.itemId) {
          const id = String(action.itemId)
          const m = /^h-(\d+)$/.exec(id)
          if (!m || !view) return
          const idx = Number(m[1])
          const item = view.items[idx]
          if (!item) return
          await toggleOne(item.name)
          return
        }
        if (action.id === 'ensure-today') {
          await ensureAllToday()
          return
        }
        if (action.id === 'open-note') {
          await openHabitNote()
          return
        }
        if (action.id === 'refresh') {
          const ok = await refreshView()
          await refreshUi()
          if (ok) {
            await fanotes.ui.toast(
              t(
                view ? `Aktualisiert: ${view.done}/${view.total}` : 'Aktualisiert.',
                view ? `Refreshed: ${view.done}/${view.total}` : 'Refreshed.',
              ),
              'success',
            )
          }
          return
        }
        if (action.id === 'add-habit') {
          await addHabit()
          return
        }
        if (action.id === 'submit:habitPath') {
          const values = action.values || {}
          await applyHabitPath(values.habitPath)
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
        if (input.id === 'habitPath') {
          await applyHabitPath(input.value)
          return
        }
        if (input.id === 'showStatus') {
          const rollback = {
            habitPath: settings.habitPath,
            habits: [...settings.habits],
            showStatus: settings.showStatus,
          }
          settings.showStatus = input.value === true
          const ok = await saveSettings(rollback)
          if (!ok) {
            await refreshPanel()
            return
          }
          await updateStatus()
          await refreshPanel()
        }
      } catch (error) {
        fanotes.log('onInput', errMessage(error))
      }
    })

    void openPanelFlow()
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
  title: t('Habit-Checkliste öffnen', 'Open Habit Checklist'),
  detail: t(
    'Panel mit heutigen Habits, Badges und Umschalten per Klick',
    'Panel with today’s habits, badges and click-to-toggle',
  ),
  keywords: 'habit gewohnheit checklist täglich daily checkbox streak panel öffnen open',
  run: () => {
    try {
      openPanel()
    } catch (error) {
      void fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'toggle',
  title: t('Habit heute umschalten', 'Toggle habit today'),
  detail: t(
    'Habit-Name abfragen oder leer = alle heutigen umschalten',
    'Prompt for habit name, or empty = toggle all today',
  ),
  keywords: 'habit gewohnheit toggle umschalten heute today checkbox checklist streak',
  run: async () => {
    try {
      await toggleCommand()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'open-note',
  title: t('Habit-Notiz öffnen', 'Open habit note'),
  detail: t(
    'Die konfigurierte Habit-Notiz öffnen',
    'Open the configured habit note',
  ),
  keywords: 'habit gewohnheit notiz note öffnen open checklist Habits',
  run: async () => {
    try {
      await openHabitNote()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.onActivate(async () => {
  try {
    // Load settings only. No notes.read / ensure on activate (scan-gate / lazy status).
    await loadSettings()
    view = null
    if (!settings.showStatus) {
      try {
        await fanotes.ui.status.remove(STATUS_ID)
      } catch {
        // ignore
      }
    }
    // Prefer lazy status: do not read habitPath on activate even if showStatus.
    fanotes.log(
      'habit-checklist activated',
      fanotes.app.appVersion,
      fanotes.app.language,
      settings.habitPath,
      settings.habits.length,
      settings.showStatus,
    )
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(() => {
  void fanotes.ui.status.remove(STATUS_ID).catch(() => {
    // Host tears down UI; ignore.
  })
  panel = null
  view = null
})
