/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Zufallsnotiz / Random Note – uniform random note open, optional folder
// filter, avoid-recent ring buffer, panel + optional status 🎲.
// Scan-gate: notes.list only on surprise / panel surprise (never onActivate).

const SETTINGS_KEY = 'settings'
const RECENT_KEY = 'recent'
const PANEL_ID = 'random'
const STATUS_ID = 'random'
const DEFAULT_AVOID_RECENT = 15
const MD_EXT_RE = /\.(md|markdown)$/iu

/**
 * @typedef {{
 *   folder: string,
 *   avoidRecent: number,
 *   onlyMd: boolean,
 *   showStatus: boolean,
 * }} Settings
 */

/**
 * @typedef {{ path: string, title: string }} LastOpened
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  folder: '',
  avoidRecent: DEFAULT_AVOID_RECENT,
  onlyMd: true,
  showStatus: false,
}

/** @type {Settings} */
let settings = { ...DEFAULT_SETTINGS }

/** @type {string[]} ring buffer of recently opened paths (newest last) */
let recent = []

/** @type {LastOpened | null} */
let lastOpened = null

/** @type {FaNotes.Panel | null} */
let panel = null

/** Draft folder path shown in the panel input (may differ until Apply). */
let folderDraft = ''

let surprising = false

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
 * Clamp avoidRecent to integer 0–100.
 * @param {unknown} raw
 */
function clampAvoidRecent(raw) {
  let n = Number(raw)
  if (!Number.isFinite(n)) n = DEFAULT_AVOID_RECENT
  n = Math.floor(n)
  if (n < 0) n = 0
  if (n > 100) n = 100
  return n
}

/**
 * Select options for avoidRecent (0–100); always includes current value.
 * @returns {Array<{ value: string, label: string }>}
 */
function avoidRecentOptions() {
  const presets = [0, 5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100]
  const cur = settings.avoidRecent
  const vals = presets.includes(cur) ? presets : [...presets, cur].sort((a, b) => a - b)
  return vals.map((n) => ({ value: String(n), label: String(n) }))
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
 * @param {unknown} raw
 * @returns {Settings}
 */
function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const obj = /** @type {Record<string, unknown>} */ (raw)

  const folderNorm = normalizeFolder(obj.folder != null ? String(obj.folder) : '')
  const folder = folderNorm === null ? '' : folderNorm

  return {
    folder,
    avoidRecent: clampAvoidRecent(obj.avoidRecent),
    onlyMd: obj.onlyMd !== false,
    showStatus: obj.showStatus === true,
  }
}

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
function normalizeRecent(raw) {
  if (!Array.isArray(raw)) return []
  /** @type {string[]} */
  const out = []
  const seen = new Set()
  for (const item of raw) {
    const path = String(item ?? '')
      .trim()
      .replace(/\\/g, '/')
    if (!path || path.includes('..') || path.startsWith('/')) continue
    if (seen.has(path)) continue
    seen.add(path)
    out.push(path)
  }
  return out
}

/**
 * Trim ring to current avoidRecent max (newest last).
 * @param {string[]} list
 * @param {number} max
 */
function trimRecent(list, max) {
  if (max <= 0) return []
  if (list.length <= max) return list.slice()
  return list.slice(list.length - max)
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

  try {
    const storedRecent = await fanotes.storage.get(RECENT_KEY)
    recent = trimRecent(normalizeRecent(storedRecent), settings.avoidRecent)
  } catch (error) {
    fanotes.log('loadRecent failed', errMessage(error))
    recent = []
  }

  if (recent.length) {
    const lastPath = recent[recent.length - 1]
    lastOpened = { path: lastPath, title: lastPath.split('/').pop() || lastPath }
  }
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
 * Persist recent ring; on failure restore `rollback` when provided.
 * @param {string[]} [rollback]
 * @returns {Promise<boolean>}
 */
async function saveRecent(rollback) {
  try {
    await fanotes.storage.set(RECENT_KEY, recent)
    return true
  } catch (error) {
    if (rollback) recent = rollback.slice()
    await fanotes.ui.toast(
      t(`Speichern fehlgeschlagen: ${errMessage(error)}`, `Save failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

/**
 * Push path onto recent ring (newest last); dedupe then trim.
 * @param {string} path
 */
function pushRecent(path) {
  const p = String(path).replace(/\\/g, '/')
  const next = recent.filter((x) => x !== p)
  next.push(p)
  recent = trimRecent(next, settings.avoidRecent)
}

async function updateStatus() {
  try {
    if (!settings.showStatus) {
      await fanotes.ui.status.remove(STATUS_ID)
      return
    }
    await fanotes.ui.status.set({
      id: STATUS_ID,
      text: '🎲',
      title: t('Zufallsnotiz öffnen', 'Open a random note'),
      onClick: () => {
        try {
          void surprise({ silent: false })
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
    await panel.setTitle(t('Zufallsnotiz', 'Random Note'))
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

  const lastTitle = lastOpened ? lastOpened.title : '–'
  const lastPath = lastOpened ? lastOpened.path : '–'

  /** @type {FaNotes.Block[]} */
  const blocks = [
    {
      type: 'keyvalue',
      items: [
        { key: t('Ordner', 'Folder'), value: folderLabel },
        { key: t('Kürzlich meiden', 'Avoid recent'), value: String(settings.avoidRecent) },
        {
          key: t('Nur Markdown', 'Markdown only'),
          value: settings.onlyMd ? t('ja', 'yes') : t('nein', 'no'),
        },
        { key: t('Zuletzt geöffnet', 'Last opened'), value: lastTitle },
        { key: t('Pfad', 'Path'), value: lastPath },
      ],
    },
    {
      type: 'input',
      id: 'folder',
      label: t(
        'Ordnerpfad (vault-relativ, ohne Slash am Ende)',
        'Folder path (vault-relative, no trailing slash)',
      ),
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
      id: 'onlyMd',
      label: t('Nur .md / .markdown', 'Only .md / .markdown'),
      checked: settings.onlyMd === true,
    },
    {
      type: 'select',
      id: 'avoidRecent',
      label: t(
        'Kürzlich geöffnete meiden (0–100)',
        'Avoid recently opened (0–100)',
      ),
      value: String(settings.avoidRecent),
      options: avoidRecentOptions(),
    },
    {
      type: 'checkbox',
      id: 'showStatus',
      label: t(
        'Statusleiste „🎲“ (Klick = Überraschung)',
        'Status bar “🎲” (click = surprise)',
      ),
      checked: settings.showStatus === true,
    },
    { type: 'divider' },
    {
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'surprise',
          label: surprising
            ? t('Wähle…', 'Picking…')
            : t('Überraschung', 'Surprise'),
          primary: true,
          disabled: surprising,
        },
      ],
    },
    {
      type: 'text',
      muted: true,
      text: t(
        'Auswahl ist gleichmäßig zufällig (Math.random) – kein Bias nach modifiedAt. Scan-Gate: notes.list nur bei Überraschung, nicht beim Aktivieren.',
        'Pick is uniformly random (Math.random) – no modifiedAt bias. Scan gate: notes.list only on surprise, not on activate.',
      ),
    },
  ]
  return blocks
}

/**
 * Apply folder string; persist + refresh panel/status.
 * @param {unknown} raw
 * @returns {Promise<boolean>}
 */
async function applyFolder(raw) {
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
  }
  await refreshPanel()
  return ok
}

/**
 * Apply avoidRecent from draft/input; persist + trim recent ring.
 * @param {unknown} raw
 * @returns {Promise<boolean>}
 */
async function applyAvoidRecent(raw) {
  const n = clampAvoidRecent(raw)
  if (n === settings.avoidRecent) {
    await refreshPanel()
    return true
  }
  const rollbackSettings = { ...settings }
  const rollbackRecent = recent.slice()
  settings.avoidRecent = n
  recent = trimRecent(recent, n)
  const okSettings = await saveSettings(rollbackSettings)
  if (!okSettings) {
    recent = rollbackRecent
    await refreshPanel()
    return false
  }
  const okRecent = await saveRecent(rollbackRecent)
  if (!okRecent) {
    // settings already saved with new avoid; keep trimmed memory consistent
    recent = trimRecent(recent, settings.avoidRecent)
  }
  await refreshPanel()
  return true
}

async function useActiveFolder() {
  try {
    const active = await fanotes.notes.active()
    if (!active || !active.path) {
      await fanotes.ui.toast(t('Keine aktive Notiz.', 'No active note.'), 'info')
      return false
    }
    const folder = dirnameOf(active.path)
    return await applyFolder(folder)
  } catch (error) {
    await fanotes.ui.toast(
      t(`Aktiver Ordner fehlgeschlagen: ${errMessage(error)}`, `Active folder failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

/**
 * Build candidate pool from notes.list (SCAN GATE).
 * @param {string} folder
 * @returns {Promise<Array<{ path: string, title: string }>>}
 */
async function listCandidates(folder) {
  let notes = []
  try {
    notes = await fanotes.notes.list()
  } catch (error) {
    await fanotes.ui.toast(
      t(`Notizenliste fehlgeschlagen: ${errMessage(error)}`, `Note list failed: ${errMessage(error)}`),
      'error',
    )
    return []
  }

  /** @type {Array<{ path: string, title: string }>} */
  const pool = []
  for (const note of notes) {
    const path = String(note.path || '').replace(/\\/g, '/')
    if (!path) continue
    if (!inFolder(path, folder)) continue
    if (settings.onlyMd && !MD_EXT_RE.test(path)) continue
    const title =
      (note.title && String(note.title).trim()) ||
      path.split('/').pop() ||
      path
    pool.push({ path, title })
  }
  return pool
}

/**
 * Pick & open a random note. SCAN GATE — notes.list here.
 * @param {{ silent?: boolean, folderOverride?: string | null }} [opts]
 */
async function surprise(opts = {}) {
  if (surprising) return
  surprising = true
  await refreshPanel()
  try {
    const folder =
      opts.folderOverride != null
        ? opts.folderOverride
        : settings.folder

    const pool = await listCandidates(folder)
    if (!pool.length) {
      await fanotes.ui.toast(
        t(
          'Keine passende Notiz im Filter (Ordner / Markdown).',
          'No matching note for the filter (folder / Markdown).',
        ),
        'info',
      )
      return
    }

    const recentSet = new Set(recent)
    let candidates = pool.filter((n) => !recentSet.has(n.path))
    let ignoredRecent = false
    if (!candidates.length) {
      candidates = pool
      ignoredRecent = true
      await fanotes.ui.toast(
        t(
          'Alle Kandidaten waren kürzlich – meiden einmal ignoriert.',
          'All candidates were recent – avoid list ignored once.',
        ),
        'info',
      )
    }

    const idx = Math.floor(Math.random() * candidates.length)
    const pick = candidates[idx]
    if (!pick) {
      await fanotes.ui.toast(t('Auswahl fehlgeschlagen.', 'Pick failed.'), 'error')
      return
    }

    try {
      await fanotes.notes.open(pick.path)
    } catch (error) {
      await fanotes.ui.toast(
        t(`Öffnen fehlgeschlagen: ${errMessage(error)}`, `Open failed: ${errMessage(error)}`),
        'error',
      )
      return
    }

    lastOpened = { path: pick.path, title: pick.title }

    const rollbackRecent = recent.slice()
    pushRecent(pick.path)
    await saveRecent(rollbackRecent)

    if (!opts.silent) {
      await fanotes.ui.toast(
        t(`Geöffnet: ${pick.title}`, `Opened: ${pick.title}`),
        'success',
      )
    }

    await refreshPanel()
  } finally {
    surprising = false
    await refreshPanel()
  }
}

/**
 * surprise-folder: set folder from active note, then surprise.
 */
async function surpriseFolder() {
  try {
    const active = await fanotes.notes.active()
    if (!active || !active.path) {
      await fanotes.ui.toast(t('Keine aktive Notiz.', 'No active note.'), 'info')
      return
    }
    const folder = dirnameOf(active.path)
    const ok = await applyFolder(folder)
    if (!ok) return
    await surprise({ silent: false })
  } catch (error) {
    await fanotes.ui.toast(
      t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`),
      'error',
    )
  }
}

function openPanel() {
  if (panel) {
    void panel.show().catch((error) => {
      if (isNoPanel(error)) panel = null
      else fanotes.log('panel.show failed', errMessage(error))
    })
    void refreshPanel()
    return
  }

  panel = fanotes.ui.panel({
    id: PANEL_ID,
    title: t('Zufallsnotiz', 'Random Note'),
    icon: '🎲',
    blocks: renderBlocks(),
  })

  panel.onAction(async (action) => {
    try {
      const values = action.values || {}

      if (action.id === 'apply-folder' || action.id === 'submit:folder') {
        const raw = values.folder != null ? String(values.folder) : folderDraft
        folderDraft = raw
        await applyFolder(raw)
        return
      }

      if (action.id === 'use-active-folder') {
        await useActiveFolder()
        return
      }

      if (action.id === 'surprise') {
        // Persist folder draft before pick so filter matches what the user sees.
        if (values.folder != null) {
          const raw = String(values.folder)
          if (raw !== folderDraft || normalizeFolder(raw) !== settings.folder) {
            folderDraft = raw
            await applyFolder(raw)
          }
        }
        if (values.avoidRecent != null) {
          await applyAvoidRecent(values.avoidRecent)
        }
        await surprise({ silent: false })
      }
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  })

  panel.onInput(async (input) => {
    try {
      if (input.id === 'folder') {
        folderDraft = String(input.value ?? '')
        return
      }

      if (input.id === 'avoidRecent') {
        await applyAvoidRecent(input.value)
        return
      }

      if (input.id === 'onlyMd') {
        const rollback = { ...settings }
        settings.onlyMd = input.value === true
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
}

// --- Commands ---------------------------------------------------------------
// Fixed bilingual keywords (stable DE+EN tokens for palette search).

fanotes.commands.register({
  id: 'surprise',
  title: t('Zufallsnotiz öffnen', 'Open random note'),
  detail: t(
    'Gleichmäßig zufällige Notiz öffnen (Ordnerfilter, kürzlich meiden)',
    'Open a uniformly random note (folder filter, avoid recent)',
  ),
  keywords: 'zufall random surprise serendipity review entdecken note notiz öffnen open',
  run: async () => {
    try {
      await surprise({ silent: false })
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'open',
  title: t('Zufallsnotiz-Panel öffnen', 'Open Random Note panel'),
  detail: t(
    'Panel mit Einstellungen und Überraschungs-Button',
    'Panel with settings and surprise button',
  ),
  keywords: 'zufall random panel öffnen open einstellungen settings surprise überraschung',
  run: () => {
    try {
      openPanel()
    } catch (error) {
      void fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'surprise-folder',
  title: t('Zufall im Ordner der aktiven Notiz', 'Random in active note folder'),
  detail: t(
    'Ordner = Verzeichnis der aktiven Notiz, dann Überraschung',
    'Folder = directory of the active note, then surprise',
  ),
  keywords: 'zufall random ordner folder aktiv active surprise überraschung notiz note',
  run: async () => {
    try {
      await surpriseFolder()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.onActivate(async () => {
  try {
    // Light work only: load settings + recent + optional status.
    // NO notes.list (scan-gate).
    await loadSettings()
    await updateStatus()
    fanotes.log(
      'random-note activated',
      fanotes.app.appVersion,
      settings.folder || '(root)',
      settings.avoidRecent,
      settings.onlyMd,
      settings.showStatus,
      recent.length,
    )
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(async () => {
  surprising = false
  try {
    await fanotes.ui.status.remove(STATUS_ID)
  } catch {
    // Host tears down UI; ignore.
  }
  panel = null
})
