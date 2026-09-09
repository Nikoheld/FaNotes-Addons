/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Sitzungsprotokoll / Session Log – start/end sessions with bilingual stamps in a log note.

const SETTINGS_KEY = 'settings'
const SESSION_KEY = 'session'
const PANEL_ID = 'session'
const STATUS_ID = 'session'
const DEFAULT_LOG = 'Sessions.md'

/**
 * @typedef {{
 *   logPath: string,
 *   autoStamp: boolean,
 *   showStatus: boolean,
 * }} Settings
 */

/**
 * @typedef {{
 *   open: boolean,
 *   startedAt: string | null,
 * }} Session
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  logPath: DEFAULT_LOG,
  autoStamp: true,
  showStatus: true,
}

/** @type {Session} */
const DEFAULT_SESSION = {
  open: false,
  startedAt: null,
}

/** @type {Settings} */
let settings = { ...DEFAULT_SETTINGS }

/** @type {Session} */
let session = { ...DEFAULT_SESSION }

/** @type {FaNotes.Panel | null} */
let panel = null

/** @type {ReturnType<typeof setInterval> | 0} */
let durationTick = 0

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

/** Local timestamp as `YYYY-MM-DD HH:mm`. */
function formatStamp(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/**
 * Normalize a vault-relative log path to a `.md` or `.markdown` file.
 * Rejects `..`, absolute paths, and non-markdown extensions.
 * @returns {{ path: string, folder: string, name: string, ext: string } | null}
 */
function normalizeLogPath(raw) {
  let path = String(raw ?? '').trim().replace(/\\/g, '/')
  while (path.startsWith('/')) path = path.slice(1)
  while (path.endsWith('/')) path = path.slice(0, -1)
  if (!path) path = DEFAULT_LOG

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
 * @returns {Settings}
 */
function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const obj = /** @type {Record<string, unknown>} */ (raw)
  const parsed = normalizeLogPath(obj.logPath != null ? String(obj.logPath) : DEFAULT_LOG)
  return {
    logPath: parsed ? parsed.path : DEFAULT_LOG,
    autoStamp: obj.autoStamp !== false,
    showStatus: obj.showStatus !== false,
  }
}

/**
 * @param {unknown} raw
 * @returns {Session}
 */
function normalizeSession(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SESSION }
  const obj = /** @type {Record<string, unknown>} */ (raw)
  const open = obj.open === true
  let startedAt = null
  if (obj.startedAt != null && typeof obj.startedAt === 'string' && obj.startedAt) {
    const d = new Date(obj.startedAt)
    if (!Number.isNaN(d.getTime())) startedAt = d.toISOString()
  }
  if (open && !startedAt) {
    return { open: false, startedAt: null }
  }
  if (!open) {
    return { open: false, startedAt: null }
  }
  return { open: true, startedAt }
}

/** Duration in whole minutes from startedAt ISO to now (or end). */
function durationMinutes(startedAtIso, endDate = new Date()) {
  if (!startedAtIso) return 0
  const start = new Date(startedAtIso)
  if (Number.isNaN(start.getTime())) return 0
  const ms = Math.max(0, endDate.getTime() - start.getTime())
  return Math.max(0, Math.round(ms / 60000))
}

function formatDurationLabel(minutes) {
  return t(`Dauer: ${minutes}m`, `Duration: ${minutes}m`)
}

function startHeadingLine(date = new Date()) {
  return `## Sitzung / Session ${formatStamp(date)}`
}

function endLine(endDate, minutes) {
  return `- Ende / End: ${formatStamp(endDate)} (Dauer / Duration: ${minutes}m)`
}

function logHeading() {
  return t(
    '# Sitzungsprotokoll / Session Log\n\nStart- und Endemarkierungen für Lern- oder Arbeitssitzungen.\n\n',
    '# Session Log / Sitzungsprotokoll\n\nStart and end markers for study or work sessions.\n\n',
  )
}

/**
 * Persist logPath when create/fallback resolves to a different path.
 * @param {string} path
 */
async function persistLogPath(path) {
  if (!path || path === settings.logPath) return
  const rollback = { ...settings }
  settings = { ...settings, logPath: path }
  try {
    await fanotes.storage.set(SETTINGS_KEY, settings)
    fanotes.log('persisted logPath after create/fallback', path)
  } catch (error) {
    settings = rollback
    fanotes.log('could not persist logPath', errMessage(error))
  }
}

/**
 * Ensure the log note exists; create if missing.
 * Without vault:write, a missing parent folder is toasted and we fall back to
 * FaNotes’ default folder, then persist the real path (like quick-inbox).
 * @returns {Promise<string | null>} resolved vault path to append to
 */
async function ensureLog() {
  const parsed = normalizeLogPath(settings.logPath)
  if (!parsed) {
    await fanotes.ui.toast(
      t(
        'Ungültiger Log-Pfad (nur .md/.markdown, kein „..“).',
        'Invalid log path (only .md/.markdown, no “..”).',
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

  const content = logHeading()

  try {
    const opts = /** @type {{ folder?: string, name: string, content: string }} */ ({
      name: parsed.name,
      content,
    })
    if (parsed.folder) opts.folder = parsed.folder
    const created = await fanotes.notes.create(opts)
    const path = created || parsed.path
    fanotes.log('created session log', path)
    await persistLogPath(path)
    await fanotes.ui.toast(
      t(`Log-Notiz angelegt: ${path}`, `Log note created: ${path}`),
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
          await persistLogPath(bare)
          await fanotes.ui.toast(
            t(
              `Vorhandene Log-Notiz „${bare}“ übernommen (Einstellungen aktualisiert).`,
              `Reused existing log note "${bare}" (settings updated).`,
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
      fanotes.log('created session log in default folder', path)
      await persistLogPath(path)
      await fanotes.ui.toast(
        t(
          `Log woanders angelegt. Einstellungen auf „${path}“ aktualisiert.`,
          `Log created elsewhere. Settings updated to "${path}".`,
        ),
        'info',
      )
      return path
    } catch (error2) {
      await fanotes.ui.toast(
        t(
          `Log-Notiz konnte nicht angelegt werden: ${errMessage(error2)}`,
          `Could not create log note: ${errMessage(error2)}`,
        ),
        'error',
      )
      return null
    }
  }
}

async function loadState() {
  try {
    const stored = await fanotes.storage.get(SETTINGS_KEY)
    settings = normalizeSettings(stored)
  } catch (error) {
    fanotes.log('loadSettings failed', errMessage(error))
    settings = { ...DEFAULT_SETTINGS }
  }

  try {
    const storedSession = await fanotes.storage.get(SESSION_KEY)
    session = normalizeSession(storedSession)
  } catch (error) {
    fanotes.log('loadSession failed', errMessage(error))
    session = { ...DEFAULT_SESSION }
  }
}

/**
 * @param {Settings} [rollback]
 * @returns {Promise<boolean>}
 */
async function saveSettings(rollback) {
  try {
    await fanotes.storage.set(SETTINGS_KEY, settings)
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
 * @param {Session} [rollback]
 * @returns {Promise<boolean>}
 */
async function saveSession(rollback) {
  try {
    await fanotes.storage.set(SESSION_KEY, session)
    return true
  } catch (error) {
    if (rollback) session = { ...rollback }
    await fanotes.ui.toast(
      t(`Sitzung speichern fehlgeschlagen: ${errMessage(error)}`, `Saving session failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

function stopDurationTick() {
  clearInterval(durationTick)
  durationTick = 0
}

function startDurationTick() {
  stopDurationTick()
  if (!session.open) return
  durationTick = setInterval(() => {
    void (async () => {
      try {
        if (!session.open) {
          stopDurationTick()
          return
        }
        await refreshPanel()
      } catch (error) {
        fanotes.log('durationTick failed', errMessage(error))
      }
    })()
  }, 30000)
}

async function updateStatus() {
  try {
    if (!(settings.showStatus && session.open)) {
      await fanotes.ui.status.remove(STATUS_ID)
      return
    }
    await fanotes.ui.status.set({
      id: STATUS_ID,
      text: t('⏺ Sitzung', '⏺ Session'),
      title: t('Sitzungsprotokoll öffnen', 'Open session log panel'),
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
  const statusValue = session.open
    ? t('offen', 'open')
    : t('keine', 'none')
  const startValue = session.open && session.startedAt
    ? formatStamp(new Date(session.startedAt))
    : '—'
  const minutes = session.open ? durationMinutes(session.startedAt) : 0

  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Sitzungsprotokoll', 'Session Log'), level: 2 },
    {
      type: 'keyvalue',
      items: [
        { key: t('Status', 'Status'), value: statusValue },
        { key: t('Start', 'Start'), value: startValue },
        { key: t('Log-Pfad', 'Log path'), value: settings.logPath },
      ],
    },
  ]

  if (session.open) {
    blocks.push({
      type: 'text',
      muted: true,
      text: formatDurationLabel(minutes),
    })
  }

  blocks.push(
    { type: 'divider' },
    { type: 'heading', text: t('Einstellungen', 'Settings'), level: 3 },
    {
      type: 'input',
      id: 'logPath',
      label: t('Log-Pfad (.md/.markdown, relativ zum Vault)', 'Log path (.md/.markdown, vault-relative)'),
      value: settings.logPath,
      placeholder: DEFAULT_LOG,
    },
    {
      type: 'checkbox',
      id: 'autoStamp',
      label: t(
        'Beim Start automatisch Überschrift anhängen',
        'Append start heading automatically on start',
      ),
      checked: settings.autoStamp === true,
    },
    {
      type: 'checkbox',
      id: 'showStatus',
      label: t(
        'Status „⏺ Sitzung“ nur bei offener Sitzung',
        'Show “⏺ Session” status only while a session is open',
      ),
      checked: settings.showStatus === true,
    },
    {
      type: 'callout',
      tone: 'info',
      text: t(
        'Nur .md/.markdown. Ohne vault:write: fehlender Ordner → Hinweis + Fallback auf Standardordner; realer Pfad wird gespeichert. Kein Auto-Start beim Aktivieren.',
        'Only .md/.markdown. Without vault:write: missing folder → notice + fallback to default folder; real path is persisted. No auto-start on activate.',
      ),
    },
    {
      type: 'row',
      children: [
        session.open
          ? {
              type: 'button',
              id: 'end',
              label: t('Ende', 'End'),
              primary: true,
            }
          : {
              type: 'button',
              id: 'start',
              label: t('Start', 'Start'),
              primary: true,
            },
        {
          type: 'button',
          id: 'open-log',
          label: t('Log öffnen', 'Open log'),
        },
      ],
    },
  )

  return blocks
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Sitzungsprotokoll', 'Session Log'))
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
  if (session.open) startDurationTick()
  else stopDurationTick()
}

async function startSession() {
  if (session.open) {
    await fanotes.ui.toast(
      t('Sitzung läuft bereits.', 'A session is already open.'),
      'info',
    )
    return
  }

  const now = new Date()
  const rollback = { ...session }
  session = { open: true, startedAt: now.toISOString() }
  const ok = await saveSession(rollback)
  if (!ok) {
    await refreshUi()
    return
  }

  if (settings.autoStamp) {
    const path = await ensureLog()
    if (path) {
      try {
        await fanotes.notes.append(path, startHeadingLine(now))
      } catch (error) {
        await fanotes.ui.toast(
          t(`Startmarkierung fehlgeschlagen: ${errMessage(error)}`, `Start stamp failed: ${errMessage(error)}`),
          'error',
        )
        await refreshUi()
        return
      }
    } else {
      // Session stays open so the user can still end later; stamp skipped.
      await refreshUi()
      return
    }
  }

  await fanotes.ui.toast(
    t('Sitzung gestartet.', 'Session started.'),
    'success',
  )
  await refreshUi()
}

async function endSession() {
  if (!session.open || !session.startedAt) {
    await fanotes.ui.toast(
      t('Keine offene Sitzung.', 'No open session.'),
      'info',
    )
    return
  }

  const endDate = new Date()
  const minutes = durationMinutes(session.startedAt, endDate)
  const path = await ensureLog()
  if (!path) return

  try {
    await fanotes.notes.append(path, endLine(endDate, minutes))
  } catch (error) {
    await fanotes.ui.toast(
      t(`Endemarkierung fehlgeschlagen: ${errMessage(error)}`, `End stamp failed: ${errMessage(error)}`),
      'error',
    )
    return
  }

  const rollback = { ...session }
  session = { open: false, startedAt: null }
  const ok = await saveSession(rollback)
  if (!ok) {
    await refreshUi()
    return
  }

  await fanotes.ui.toast(
    t(`Sitzung beendet (${minutes}m).`, `Session ended (${minutes}m).`),
    'success',
  )
  await refreshUi()
}

async function openLog() {
  try {
    const parsed = normalizeLogPath(settings.logPath)
    if (!parsed) {
      await fanotes.ui.toast(
        t('Ungültiger Log-Pfad.', 'Invalid log path.'),
        'error',
      )
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
      const created = await ensureLog()
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
      fanotes.log('openLog failed', errMessage(error))
    }
  }
}

/**
 * Apply logPath from panel values with rollback on failure.
 * @param {unknown} raw
 * @returns {Promise<boolean>}
 */
async function applyLogPath(raw) {
  const parsed = normalizeLogPath(raw != null ? String(raw) : settings.logPath)
  if (!parsed) {
    await fanotes.ui.toast(
      t(
        'Ungültiger Log-Pfad (nur .md/.markdown, kein „..“).',
        'Invalid log path (only .md/.markdown, no “..”).',
      ),
      'error',
    )
    await refreshPanel()
    return false
  }
  if (parsed.path === settings.logPath) return true
  const rollback = { ...settings }
  settings = { ...settings, logPath: parsed.path }
  const ok = await saveSettings(rollback)
  if (!ok) await refreshPanel()
  else await refreshPanel()
  return ok
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
      title: t('Sitzungsprotokoll', 'Session Log'),
      icon: '⏺',
      blocks: renderBlocks(),
    })

    panel.onAction(async (action) => {
      try {
        if (action.id === 'start') {
          await startSession()
          return
        }
        if (action.id === 'end') {
          await endSession()
          return
        }
        if (action.id === 'open-log') {
          await openLog()
          return
        }
        if (action.id === 'submit:logPath') {
          const values = action.values || {}
          await applyLogPath(values.logPath)
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
        if (input.id === 'logPath') {
          await applyLogPath(input.value)
          return
        }
        if (input.id === 'autoStamp') {
          const rollback = { ...settings }
          settings.autoStamp = input.value === true
          const ok = await saveSettings(rollback)
          if (!ok) await refreshPanel()
          else await refreshPanel()
          return
        }
        if (input.id === 'showStatus') {
          const rollback = { ...settings }
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
  id: 'start',
  title: t('Sitzung starten', 'Start session'),
  detail: t(
    'Sitzung öffnen und optional Startüberschrift anhängen',
    'Open a session and optionally append a start heading',
  ),
  keywords: 'sitzung session start protokoll log beginn',
  run: async () => {
    try {
      await startSession()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'end',
  title: t('Sitzung beenden', 'End session'),
  detail: t(
    'Endemarkierung mit Dauer anhängen und Sitzung schließen',
    'Append end marker with duration and close the session',
  ),
  keywords: 'sitzung session ende end stop dauer duration',
  run: async () => {
    try {
      await endSession()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'open-log',
  title: t('Sitzungs-Log öffnen', 'Open session log'),
  detail: t(
    'Die konfigurierte Log-Notiz öffnen',
    'Open the configured log note',
  ),
  keywords: 'sitzung session log protokoll öffnen open notiz note',
  run: async () => {
    try {
      await openLog()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'open',
  title: t('Sitzungsprotokoll öffnen', 'Open session log panel'),
  detail: t(
    'Panel mit Status, Dauer und Einstellungen',
    'Panel with status, duration and settings',
  ),
  keywords: 'sitzung session panel öffnen open einstellungen settings',
  run: () => {
    try {
      openPanel()
    } catch (error) {
      void fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'open-settings',
  title: t('Sitzungsprotokoll-Einstellungen öffnen', 'Open session log settings'),
  detail: t(
    'Log-Pfad, Auto-Stempel und Statusleiste',
    'Log path, auto-stamp and status bar',
  ),
  keywords: 'sitzung session einstellungen settings panel pfad path',
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
    // Load settings + session only. NO auto-start.
    await loadState()
    await updateStatus()
    if (session.open) startDurationTick()
    fanotes.log(
      'session-log activated',
      fanotes.app.appVersion,
      fanotes.app.language,
      settings.logPath,
      settings.autoStamp,
      settings.showStatus,
      session.open,
      session.startedAt,
    )
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(() => {
  stopDurationTick()
  void fanotes.ui.status.remove(STATUS_ID).catch(() => {
    // Host tears down UI; ignore.
  })
  panel = null
})
