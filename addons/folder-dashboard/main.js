/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Ordner-Dashboard / Folder Dashboard – folder-scoped note overview,
// optional open-task scan (− [ ]), panel + optional status 📁 N.
// Scan-gate: notes.list / notes.read only on panel open / refresh /
// refresh-tasks (never onActivate).

const SETTINGS_KEY = 'settings'
const PANEL_ID = 'folder'
const STATUS_ID = 'folder'
const DEFAULT_MAX_LIST = 40
const DEFAULT_MAX_TASK_SCAN = 80
const OPEN_TASK_RE = /^- \[ \]/
const MD_EXT_RE = /\.(md|markdown)$/iu

/**
 * @typedef {{
 *   folder: string,
 *   maxList: number,
 *   countTasks: boolean,
 *   maxTaskScan: number,
 *   showStatus: boolean,
 * }} Settings
 */

/**
 * @typedef {{
 *   path: string,
 *   title: string,
 *   modifiedAt: string | null,
 *   ext: string,
 * }} RecentItem
 */

/**
 * @typedef {{
 *   total: number,
 *   mdCount: number,
 *   openTasks: number | null,
 *   scannedNotes: number,
 *   recent: RecentItem[],
 *   builtAt: number,
 * }} Snapshot
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  folder: '',
  maxList: DEFAULT_MAX_LIST,
  countTasks: true,
  maxTaskScan: DEFAULT_MAX_TASK_SCAN,
  showStatus: true,
}

/** @type {Settings} */
let settings = { ...DEFAULT_SETTINGS }

/** @type {FaNotes.Panel | null} */
let panel = null

/** @type {Snapshot | null} */
let snapshot = null

/** Draft folder path shown in the panel input (may differ until Apply). */
let folderDraft = ''

let building = false
let buildQueued = false

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
 * Vault-relative folder prefix: no leading/trailing `/`, no `..`.
 * Empty string = vault root (all notes). Returns null if invalid.
 * @param {unknown} raw
 * @returns {string | null}
 */
function normalizeFolder(raw) {
  let folder = String(raw ?? '').trim().replace(/\\/g, '/')
  while (folder.startsWith('/')) folder = folder.slice(1)
  while (folder.endsWith('/')) folder = folder.slice(0, -1)
  if (!folder) return ''
  const parts = folder.split('/').filter(Boolean)
  if (!parts.length || parts.some((p) => p === '.' || p === '..')) return null
  return parts.join('/')
}

/**
 * Parent folder of a vault-relative note path (dirname).
 * @param {string} path
 */
function dirnameOf(path) {
  const p = String(path || '').replace(/\\/g, '/')
  const i = p.lastIndexOf('/')
  return i <= 0 ? '' : p.slice(0, i)
}

/**
 * File extension badge (e.g. `.md`, `.pdf`) – max 24 chars for list badge.
 * @param {string} path
 */
function extBadge(path) {
  const base = String(path || '').replace(/\\/g, '/').split('/').pop() || ''
  const i = base.lastIndexOf('.')
  if (i <= 0 || i === base.length - 1) return ''
  return ('.' + base.slice(i + 1)).slice(0, 24)
}

/**
 * Local short timestamp for list detail.
 * @param {string | null | undefined} iso
 */
function formatModifiedShort(iso) {
  if (!iso) return t('unbekannt', 'unknown')
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return String(iso).slice(0, 32)
  try {
    const locale = fanotes.app.language === 'en' ? 'en-US' : 'de-DE'
    return new Date(ms).toLocaleString(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return new Date(ms).toISOString().slice(0, 16).replace('T', ' ')
  }
}

/**
 * @param {unknown} raw
 * @returns {Settings}
 */
function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const obj = /** @type {Record<string, unknown>} */ (raw)

  const folderNorm = normalizeFolder(obj.folder != null ? String(obj.folder) : '')
  const folder = folderNorm === null ? '' : folderNorm

  let maxList = Number(obj.maxList)
  if (!Number.isFinite(maxList) || maxList < 1) maxList = DEFAULT_MAX_LIST
  maxList = Math.min(500, Math.floor(maxList))

  let maxTaskScan = Number(obj.maxTaskScan)
  if (!Number.isFinite(maxTaskScan) || maxTaskScan < 1) maxTaskScan = DEFAULT_MAX_TASK_SCAN
  maxTaskScan = Math.min(500, Math.floor(maxTaskScan))

  return {
    folder,
    maxList,
    countTasks: obj.countTasks !== false,
    maxTaskScan,
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
  folderDraft = settings.folder
}

/**
 * Persist settings; on failure restore `rollback` when provided.
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
 * @param {string} notePath
 * @param {string} folder
 */
function inFolder(notePath, folder) {
  if (folder === '') return true
  const path = String(notePath).replace(/\\/g, '/')
  return path === folder || path.startsWith(`${folder}/`)
}

/**
 * Count open checklist tasks: lines matching /^- \[ \]/
 * PDFs / non-text: skip via notes.read errors.
 * @param {string} text
 */
function countOpenTasks(text) {
  let n = 0
  const lines = String(text ?? '').split('\n')
  for (const line of lines) {
    if (OPEN_TASK_RE.test(line)) n += 1
  }
  return n
}

/**
 * Build dashboard snapshot (SCAN GATE — never call from onActivate).
 * @param {{ silent?: boolean }} [opts]
 */
async function buildData(opts = {}) {
  if (building) {
    buildQueued = true
    return snapshot
  }
  building = true
  try {
    if (panel) await refreshPanel()

    let notes = []
    try {
      notes = await fanotes.notes.list()
    } catch (error) {
      await fanotes.ui.toast(
        t(`Notizenliste fehlgeschlagen: ${errMessage(error)}`, `Note list failed: ${errMessage(error)}`),
        'error',
      )
      return snapshot
    }

    const folder = settings.folder
    const filtered = notes
      .filter((n) => inFolder(n.path, folder))
      .sort((a, b) => String(b.modifiedAt ?? '').localeCompare(String(a.modifiedAt ?? '')))

    const total = filtered.length
    const mdCount = filtered.filter((n) => MD_EXT_RE.test(n.path)).length

    /** @type {RecentItem[]} */
    const recent = filtered.slice(0, settings.maxList).map((n) => ({
      path: n.path,
      title: n.title || n.path.split('/').pop() || n.path,
      modifiedAt: n.modifiedAt ?? null,
      ext: extBadge(n.path),
    }))

    let openTasks = /** @type {number | null} */ (null)
    let scannedNotes = 0

    if (settings.countTasks) {
      const toScan = filtered.slice(0, settings.maxTaskScan)
      let tasks = 0
      for (const note of toScan) {
        // Skip obvious non-markdown (e.g. PDF) — no task syntax there.
        if (!MD_EXT_RE.test(note.path)) continue
        let text = ''
        try {
          text = await fanotes.notes.read(note.path)
        } catch (error) {
          fanotes.log('read failed', note.path, errMessage(error))
          continue
        }
        scannedNotes += 1
        tasks += countOpenTasks(text)
      }
      openTasks = tasks
    }

    snapshot = {
      total,
      mdCount,
      openTasks,
      scannedNotes,
      recent,
      builtAt: Date.now(),
    }

    if (!opts.silent) {
      await fanotes.ui.toast(
        t(
          `Aktualisiert: ${total} Notiz(en), ${mdCount} Markdown.`,
          `Refreshed: ${total} note(s), ${mdCount} Markdown.`,
        ),
        'success',
      )
    }
  } catch (error) {
    try {
      await fanotes.ui.toast(
        t(`Aktualisierung fehlgeschlagen: ${errMessage(error)}`, `Refresh failed: ${errMessage(error)}`),
        'error',
      )
    } catch {
      fanotes.log('buildData failed', errMessage(error))
    }
  } finally {
    building = false
    await updateStatus()
    await refreshPanel()
    if (buildQueued) {
      buildQueued = false
      void buildData({ silent: true })
    }
  }
  return snapshot
}

/**
 * Status: `📁 N` with N=mdCount when folder set and showStatus; else remove.
 * Uses cached snapshot only — never lists/reads here.
 */
async function updateStatus() {
  try {
    if (!settings.showStatus || !settings.folder || !snapshot) {
      await fanotes.ui.status.remove(STATUS_ID)
      return
    }
    const n = snapshot.mdCount
    await fanotes.ui.status.set({
      id: STATUS_ID,
      text: `📁 ${n}`,
      title: t(
        `${n} Markdown-Notiz(en) in „${settings.folder}“ – Klick öffnet das Panel`,
        `${n} Markdown note(s) in “${settings.folder}” – click opens the panel`,
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

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Ordner-Dashboard', 'Folder Dashboard'))
  } catch (error) {
    if (isNoPanel(error)) {
      panel = null
      return
    }
    fanotes.log('refreshPanel', errMessage(error))
  }
}

function renderBlocks() {
  const folderLabel = settings.folder
    ? settings.folder
    : t('(Vault-Wurzel / alle Notizen)', '(vault root / all notes)')

  const tasksValue =
    !settings.countTasks
      ? '–'
      : snapshot && snapshot.openTasks != null
        ? String(snapshot.openTasks)
        : building
          ? t('scannt…', 'scanning…')
          : t('noch nicht', 'not yet')

  /** @type {FaNotes.Block[]} */
  const blocks = [
    {
      type: 'keyvalue',
      items: [
        { key: t('Ordner', 'Folder'), value: folderLabel },
        {
          key: t('Notizen', 'Notes'),
          value: snapshot ? String(snapshot.total) : building ? '…' : '–',
        },
        { key: t('Offene Aufgaben', 'Open tasks'), value: tasksValue },
      ],
    },
    {
      type: 'input',
      id: 'folder',
      label: t('Ordnerpfad (vault-relativ, ohne Slash am Ende)', 'Folder path (vault-relative, no trailing slash)'),
      value: folderDraft,
      placeholder: t('leer = Vault-Wurzel', 'empty = vault root'),
    },
    {
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'apply-folder',
          label: t('Übernehmen', 'Apply'),
        },
        {
          type: 'button',
          id: 'use-active-folder',
          label: t('Aktiver Ordner', 'Active folder'),
        },
      ],
    },
    {
      type: 'checkbox',
      id: 'countTasks',
      label: t(
        `Offene Aufgaben zählen (− [ ], Näherung, Cap ${settings.maxTaskScan})`,
        `Count open tasks (− [ ], approximation, Cap ${settings.maxTaskScan})`,
      ),
      checked: settings.countTasks === true,
    },
    {
      type: 'checkbox',
      id: 'showStatus',
      label: t(
        'Statusleiste „📁 N“ (nur wenn Ordner gesetzt; N = Markdown-Anzahl)',
        'Status bar “📁 N” (only when a folder is set; N = Markdown count)',
      ),
      checked: settings.showStatus === true,
    },
    { type: 'divider' },
    {
      type: 'list',
      id: 'recent',
      empty: t('Keine Notizen in diesem Ordner.', 'No notes in this folder.'),
      items: (snapshot ? snapshot.recent : []).map((item) => {
        /** @type {{ id: string, title: string, detail?: string, badge?: string }} */
        const row = {
          id: item.path,
          title: item.title,
          detail: formatModifiedShort(item.modifiedAt),
        }
        if (item.ext) row.badge = item.ext
        return row
      }),
    },
    {
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'refresh',
          label: building
            ? t('Aktualisiere…', 'Refreshing…')
            : t('Aktualisieren', 'Refresh'),
          primary: true,
          disabled: building,
        },
      ],
    },
    {
      type: 'text',
      muted: true,
      text: t(
        `Aufgabenzahl ist eine Näherung: nur die ${settings.maxTaskScan} zuletzt geänderten Notizen im Ordner, nur .md/.markdown (PDFs ohne Aufgaben). Scan-Gate: kein notes.list/read beim Aktivieren.`,
        `Task count is an approximation: only the ${settings.maxTaskScan} most recently modified notes in the folder, .md/.markdown only (PDFs have no tasks). Scan gate: no notes.list/read on activate.`,
      ),
    },
  ]

  return blocks
}

/**
 * Apply folder string (already normalized or raw); persist + rebuild.
 * @param {string} raw
 * @param {{ silent?: boolean }} [opts]
 */
async function applyFolder(raw, opts = {}) {
  const norm = normalizeFolder(raw)
  if (norm === null) {
    await fanotes.ui.toast(
      t('Ungültiger Ordnerpfad (kein „..“ erlaubt).', 'Invalid folder path (".." is not allowed).'),
      'error',
    )
    return false
  }
  const rollback = { ...settings }
  settings.folder = norm
  folderDraft = norm
  const ok = await saveSettings(rollback)
  if (!ok) {
    folderDraft = settings.folder
    await refreshPanel()
    return false
  }
  if (!opts.silent) {
    await fanotes.ui.toast(
      norm
        ? t(`Ordner gesetzt: ${norm}`, `Folder set: ${norm}`)
        : t('Ordner = Vault-Wurzel (alle Notizen).', 'Folder = vault root (all notes).'),
      'success',
    )
  }
  // User-initiated: rebuild for panel/status (not onActivate).
  await buildData({ silent: true })
  return true
}

async function setFolderPrompt() {
  try {
    const raw = await fanotes.ui.prompt(
      t(
        'Ordnerpfad (vault-relativ, ohne Slash am Ende; leer = Vault-Wurzel)',
        'Folder path (vault-relative, no trailing slash; empty = vault root)',
      ),
      {
        title: t('Ordner setzen', 'Set folder'),
        placeholder: 'Mathe/Klasse7',
        value: settings.folder,
      },
    )
    if (raw == null) return
    await applyFolder(raw)
  } catch (error) {
    await fanotes.ui.toast(
      t(`Ordner setzen fehlgeschlagen: ${errMessage(error)}`, `Set folder failed: ${errMessage(error)}`),
      'error',
    )
  }
}

async function useActiveFolder() {
  try {
    let active = null
    try {
      active = await fanotes.notes.active()
    } catch (error) {
      fanotes.log('notes.active failed', errMessage(error))
      await fanotes.ui.toast(
        t(`Aktive Notiz nicht lesbar: ${errMessage(error)}`, `Could not read active note: ${errMessage(error)}`),
        'error',
      )
      return
    }
    if (!active || !active.path) {
      await fanotes.ui.toast(
        t('Keine aktive Notiz.', 'No active note.'),
        'info',
      )
      return
    }
    const folder = dirnameOf(active.path)
    await applyFolder(folder)
  } catch (error) {
    await fanotes.ui.toast(
      t(`Aktiver Ordner fehlgeschlagen: ${errMessage(error)}`, `Active folder failed: ${errMessage(error)}`),
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
      // Panel already open: refresh data (scan-gate trigger).
      void buildData({ silent: true })
      return
    }

    folderDraft = settings.folder
    panel = fanotes.ui.panel({
      id: PANEL_ID,
      title: t('Ordner-Dashboard', 'Folder Dashboard'),
      icon: '📁',
      blocks: renderBlocks(),
    })

    panel.onAction(async (action) => {
      try {
        if (action.id === 'recent' && action.itemId) {
          const path = String(action.itemId)
          try {
            await fanotes.notes.open(path)
          } catch (error) {
            await fanotes.ui.toast(
              t(`Öffnen fehlgeschlagen: ${errMessage(error)}`, `Open failed: ${errMessage(error)}`),
              'error',
            )
          }
          return
        }
        if (action.id === 'apply-folder' || action.id === 'submit:folder') {
          const values = action.values || {}
          const raw = values.folder != null ? String(values.folder) : folderDraft
          folderDraft = raw
          await applyFolder(raw)
          return
        }
        if (action.id === 'use-active-folder') {
          await useActiveFolder()
          return
        }
        if (action.id === 'refresh') {
          await buildData({ silent: false })
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
        if (input.id === 'folder') {
          folderDraft = String(input.value ?? '')
          return
        }
        if (input.id === 'countTasks') {
          const prev = settings.countTasks
          const rollback = { ...settings }
          settings.countTasks = input.value === true
          const ok = await saveSettings(rollback)
          if (!ok) {
            settings.countTasks = prev
            await refreshPanel()
            return
          }
          // Rebuild so open-task count matches the new preference.
          await buildData({ silent: true })
          return
        }
        if (input.id === 'showStatus') {
          const prev = settings.showStatus
          const rollback = { ...settings }
          settings.showStatus = input.value === true
          const ok = await saveSettings(rollback)
          if (!ok) {
            settings.showStatus = prev
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

    // First open: build data (scan-gate).
    void buildData({ silent: true })
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
// Fixed bilingual keywords (stable DE+EN tokens for palette search).

fanotes.commands.register({
  id: 'open',
  title: t('Ordner-Dashboard öffnen', 'Open Folder Dashboard'),
  detail: t(
    'Panel mit Ordner-Übersicht, Notizen und optionalen Aufgaben',
    'Panel with folder overview, notes, and optional tasks',
  ),
  keywords: 'ordner folder dashboard übersicht overview aufgaben tasks notes notizen öffnen open panel',
  run: () => {
    try {
      openPanel()
    } catch (error) {
      void fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'set-folder',
  title: t('Ordner setzen', 'Set folder'),
  detail: t(
    'Vault-relativen Ordnerpfad per Prompt setzen (leer = Wurzel)',
    'Set vault-relative folder path via prompt (empty = root)',
  ),
  keywords: 'ordner folder setzen set pfad path dashboard übersicht overview',
  run: async () => {
    try {
      await setFolderPrompt()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'use-active-folder',
  title: t('Aktiven Ordner verwenden', 'Use active folder'),
  detail: t(
    'Ordner = Verzeichnis der aktiven Notiz (dirname)',
    'Folder = directory of the active note (dirname)',
  ),
  keywords: 'ordner folder aktiv active dirname notiz note dashboard verwenden use',
  run: async () => {
    try {
      await useActiveFolder()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'refresh-tasks',
  title: t('Ordner-Dashboard aktualisieren', 'Refresh Folder Dashboard'),
  detail: t(
    'Notizenliste und optionale Aufgabenzahl neu aufbauen',
    'Rebuild note list and optional task count',
  ),
  keywords: 'aktualisieren refresh tasks aufgaben ordner folder dashboard scan',
  run: async () => {
    try {
      await buildData({ silent: false })
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.onActivate(async () => {
  try {
    // Light work only: load storage + status from cache (none yet → remove).
    // NO notes.list / notes.read (scan-gate).
    await loadSettings()
    await updateStatus()
    fanotes.log(
      'folder-dashboard activated',
      fanotes.app.appVersion,
      settings.folder || '(root)',
      settings.maxList,
      settings.countTasks,
    )
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(async () => {
  building = false
  buildQueued = false
  try {
    await fanotes.ui.status.remove(STATUS_ID)
  } catch {
    // Host tears down UI; ignore.
  }
  panel = null
  snapshot = null
})
