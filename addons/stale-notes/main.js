/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Veraltete Notizen / Stale Notes – Markdown notes whose modifiedAt is older
// than a day threshold (or missing). Abgrenzung: orphan-notes = wikilinks;
// stale = modifiedAt age. Scan-gate: notes.list never onActivate.

const SETTINGS_KEY = 'settings'
const PANEL_ID = 'stale'
const STATUS_ID = 'stale'
const DEFAULT_DAYS = 30
const DEFAULT_MAX_LIST = 80
const MD_EXT_RE = /\.(md|markdown)$/iu
const MS_PER_DAY = 86400000

/**
 * @typedef {{
 *   days: number,
 *   folder: string,
 *   maxList: number,
 *   showStatus: boolean,
 * }} Settings
 */

/**
 * @typedef {{
 *   path: string,
 *   title: string,
 *   modifiedAt: string | null,
 *   ageMs: number | null,
 * }} StaleItem
 */

/**
 * @typedef {{
 *   scanned: number,
 *   staleCount: number,
 *   items: StaleItem[],
 *   builtAt: number,
 * }} View
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  days: DEFAULT_DAYS,
  folder: '',
  maxList: DEFAULT_MAX_LIST,
  showStatus: false,
}

/** @type {Settings} */
let settings = { ...DEFAULT_SETTINGS }

/** @type {FaNotes.Panel | null} */
let panel = null

/** @type {View | null} */
let view = null

/** True after at least one successful scan this session. */
let scannedOnce = false

let scanning = false
let scanQueued = false

/** Draft inputs shown in the panel (may differ until Apply). */
let daysDraft = String(DEFAULT_DAYS)
let folderDraft = ''

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
 * Clamp days to integer 1–3650.
 * @param {unknown} raw
 */
function clampDays(raw) {
  let n = Number(raw)
  if (!Number.isFinite(n)) n = DEFAULT_DAYS
  n = Math.floor(n)
  if (n < 1) n = 1
  if (n > 3650) n = 3650
  return n
}

/**
 * Clamp maxList to integer 1–200.
 * @param {unknown} raw
 */
function clampMaxList(raw) {
  let n = Number(raw)
  if (!Number.isFinite(n)) n = DEFAULT_MAX_LIST
  n = Math.floor(n)
  if (n < 1) n = 1
  if (n > 200) n = 200
  return n
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
 * Basename without `.md` / `.markdown`.
 * @param {string} path
 */
function basenameNoExt(path) {
  const base = String(path).split('/').pop() || String(path)
  return base.replace(/\.(md|markdown)$/iu, '')
}

/**
 * Relative age for list detail: "vor 45d" / "45d ago".
 * @param {string | null | undefined} iso
 */
function formatRelativeAge(iso) {
  if (!iso) return t('ohne Datum', 'no date')
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return String(iso).slice(0, 32)
  const days = Math.floor((Date.now() - ms) / MS_PER_DAY)
  if (days < 0) return t('zukünftig', 'in the future')
  if (days === 0) return t('heute', 'today')
  if (days === 1) return t('vor 1d', '1d ago')
  return t(`vor ${days}d`, `${days}d ago`)
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
    days: clampDays(obj.days),
    folder,
    maxList: clampMaxList(obj.maxList),
    showStatus: obj.showStatus === true,
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
  daysDraft = String(settings.days)
  folderDraft = settings.folder
}

/**
 * Persist settings; on failure restore `rollback` when provided.
 * @param {Settings} [rollback]
 * @returns {Promise<boolean>}
 */
async function saveSettings(rollback) {
  try {
    await fanotes.storage.set(SETTINGS_KEY, {
      days: settings.days,
      folder: settings.folder,
      maxList: settings.maxList,
      showStatus: settings.showStatus,
    })
    return true
  } catch (error) {
    if (rollback) settings = { ...rollback }
    daysDraft = String(settings.days)
    folderDraft = settings.folder
    await fanotes.ui.toast(
      t(`Speichern fehlgeschlagen: ${errMessage(error)}`, `Save failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

/**
 * Apply days + folder from panel values / drafts; persist with rollback.
 * @param {Record<string, unknown>} [values]
 * @param {{ silent?: boolean }} [opts]
 * @returns {Promise<boolean>}
 */
async function applySettingsFromValues(values, opts = {}) {
  const rawDays = values && values.days != null ? values.days : daysDraft
  const rawFolder = values && values.folder != null ? values.folder : folderDraft

  const days = clampDays(rawDays)
  const folderNorm = normalizeFolder(rawFolder)
  if (folderNorm === null) {
    await fanotes.ui.toast(
      t('Ungültiger Ordnerpfad (kein „..“ erlaubt).', 'Invalid folder path (".." is not allowed).'),
      'error',
    )
    return false
  }

  const rollback = { ...settings }
  settings.days = days
  settings.folder = folderNorm
  daysDraft = String(days)
  folderDraft = folderNorm

  const ok = await saveSettings(rollback)
  if (!ok) {
    await refreshPanel()
    return false
  }

  if (!opts.silent) {
    await fanotes.ui.toast(
      t(
        `Einstellungen übernommen (${settings.days} Tage${settings.folder ? `, Ordner: ${settings.folder}` : ''}).`,
        `Settings applied (${settings.days} days${settings.folder ? `, folder: ${settings.folder}` : ''}).`,
      ),
      'success',
    )
  }
  return true
}

/**
 * Scan Markdown notes for stale modifiedAt (SCAN GATE — never from onActivate).
 * @param {{ silent?: boolean }} [opts]
 */
async function rescan(opts = {}) {
  if (scanning) {
    scanQueued = true
    return
  }
  scanning = true
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
      return
    }

    const thresholdMs = Date.now() - settings.days * MS_PER_DAY
    const folder = settings.folder

    /** @type {StaleItem[]} */
    const stale = []
    let scanned = 0

    for (const note of notes) {
      if (!MD_EXT_RE.test(note.path)) continue
      if (!inFolder(note.path, folder)) continue
      scanned += 1

      const modifiedAt = note.modifiedAt ?? null
      let ageMs = /** @type {number | null} */ (null)
      let isStale = false

      if (!modifiedAt) {
        isStale = true
        ageMs = null
      } else {
        const ms = Date.parse(modifiedAt)
        if (!Number.isFinite(ms)) {
          isStale = true
          ageMs = null
        } else if (ms < thresholdMs) {
          isStale = true
          ageMs = Date.now() - ms
        }
      }

      if (!isStale) continue

      stale.push({
        path: note.path,
        title: note.title || basenameNoExt(note.path),
        modifiedAt,
        ageMs,
      })
    }

    // Oldest first; missing / unparseable dates first.
    // House-rule: sort by modifiedAt ISO via localeCompare (ascending), then path.
    stale.sort((a, b) => {
      const aMissing = a.ageMs == null
      const bMissing = b.ageMs == null
      if (aMissing && !bMissing) return -1
      if (!aMissing && bMissing) return 1
      if (aMissing && bMissing) {
        const byTitle = a.title.localeCompare(b.title)
        if (byTitle !== 0) return byTitle
        return a.path.localeCompare(b.path)
      }
      const byDate = String(a.modifiedAt).localeCompare(String(b.modifiedAt))
      if (byDate !== 0) return byDate
      return a.path.localeCompare(b.path)
    })

    const staleCount = stale.length
    view = {
      scanned,
      staleCount,
      items: stale.slice(0, settings.maxList),
      builtAt: Date.now(),
    }
    scannedOnce = true

    if (!opts.silent) {
      await fanotes.ui.toast(
        t(
          `Scan: ${staleCount} veraltet (≥ ${settings.days}d, ${scanned} geprüft).`,
          `Scan: ${staleCount} stale (≥ ${settings.days}d, ${scanned} checked).`,
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
    await refreshPanel()
    await updateStatus()
    if (scanQueued) {
      scanQueued = false
      void rescan({ silent: true })
    }
  }
}

/**
 * Status `⏳ N` only when showStatus && scannedOnce (N = stale count).
 */
async function updateStatus() {
  try {
    if (!settings.showStatus || !scannedOnce) {
      await fanotes.ui.status.remove(STATUS_ID)
      return
    }
    const n = view ? view.staleCount : 0
    await fanotes.ui.status.set({
      id: STATUS_ID,
      text: `⏳ ${n}`,
      title: t('Veraltete Notizen öffnen', 'Open Stale Notes'),
      priority: 40,
      onClick: () => {
        try {
          openPanel()
        } catch (error) {
          fanotes.log('status onClick failed', errMessage(error))
        }
      },
    })
  } catch (error) {
    fanotes.log('updateStatus failed', errMessage(error))
  }
}

function renderBlocks() {
  const thresholdLabel = t(`${settings.days} Tage`, `${settings.days} days`)
  const countLabel = view
    ? String(view.staleCount)
    : scanning
      ? '…'
      : scannedOnce
        ? '0'
        : '–'

  const listItems = view
    ? view.items.map((item) => ({
        id: item.path,
        title: item.title,
        detail: formatRelativeAge(item.modifiedAt),
      }))
    : []

  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Veraltete Notizen', 'Stale Notes'), level: 2 },
    {
      type: 'keyvalue',
      items: [
        { key: t('Schwelle', 'Threshold'), value: thresholdLabel },
        { key: t('Anzahl', 'Count'), value: countLabel },
      ],
    },
    {
      type: 'input',
      id: 'days',
      label: t('Tage ohne Änderung (1–3650)', 'Days without change (1–3650)'),
      value: daysDraft,
      placeholder: String(DEFAULT_DAYS),
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
          id: 'apply',
          label: t('Übernehmen', 'Apply'),
          disabled: scanning,
        },
        {
          type: 'button',
          id: 'refresh',
          label: scanning
            ? t('Scan …', 'Scanning …')
            : t('Aktualisieren', 'Refresh'),
          primary: true,
          disabled: scanning,
        },
      ],
    },
    {
      type: 'list',
      id: 'stale',
      empty: scannedOnce
        ? t('Keine veralteten Notizen unter dieser Schwelle.', 'No stale notes under this threshold.')
        : t('Noch nicht gescannt – „Aktualisieren“ tippen.', 'Not scanned yet – tap “Refresh”.'),
      items: listItems,
    },
    { type: 'divider' },
    {
      type: 'checkbox',
      id: 'showStatus',
      label: t('Statusleiste ⏳ N anzeigen', 'Show status bar ⏳ N'),
      checked: settings.showStatus === true,
    },
    {
      type: 'text',
      muted: true,
      text: t(
        `Nur .md/.markdown · Ordner-Präfix · Liste ≤ ${settings.maxList} · fehlendes modifiedAt = veraltet · kein Schreiben/Löschen · Abgrenzung: orphan-notes = Wikilinks, stale = Alter.`,
        `Only .md/.markdown · folder prefix · list ≤ ${settings.maxList} · missing modifiedAt = stale · no write/trash · vs orphan-notes = wikilinks, stale = age.`,
      ),
    },
  ]

  return blocks
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Veraltete Notizen', 'Stale Notes'))
  } catch (error) {
    if (isNoPanel(error)) {
      panel = null
      return
    }
    fanotes.log('refreshPanel', errMessage(error))
  }
}

/**
 * Open panel + scan (scan-gate entry).
 * @param {{ silent?: boolean }} [opts]
 */
async function openAndScan(opts = {}) {
  const silent = opts.silent !== false
  await rescan({ silent: true })
  if (!silent && view) {
    await fanotes.ui.toast(
      t(
        `${view.staleCount} veraltete Notiz(en) (≥ ${settings.days}d).`,
        `${view.staleCount} stale note(s) (≥ ${settings.days}d).`,
      ),
      'info',
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
      void openAndScan({ silent: true })
      return
    }

    daysDraft = String(settings.days)
    folderDraft = settings.folder

    panel = fanotes.ui.panel({
      id: PANEL_ID,
      title: t('Veraltete Notizen', 'Stale Notes'),
      icon: '⏳',
      blocks: renderBlocks(),
      focus: true,
    })

    panel.onAction(async (action) => {
      try {
        if (action.id === 'apply' || action.id === 'submit:days' || action.id === 'submit:folder') {
          const values = action.values || {}
          if (values.days != null) daysDraft = String(values.days)
          if (values.folder != null) folderDraft = String(values.folder)
          const ok = await applySettingsFromValues(values, { silent: false })
          if (!ok) return
          await rescan({ silent: true })
          return
        }
        if (action.id === 'refresh') {
          const values = action.values || {}
          if (values.days != null) daysDraft = String(values.days)
          if (values.folder != null) folderDraft = String(values.folder)
          // Sync drafts into settings before scan (same as Apply, quieter).
          const ok = await applySettingsFromValues(values, { silent: true })
          if (!ok) return
          await rescan({ silent: false })
          return
        }
        if (action.id === 'stale' && action.itemId) {
          try {
            await fanotes.notes.open(String(action.itemId))
          } catch (error) {
            await fanotes.ui.toast(
              t(`Öffnen fehlgeschlagen: ${errMessage(error)}`, `Open failed: ${errMessage(error)}`),
              'error',
            )
          }
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
        if (input.id === 'days') {
          daysDraft = String(input.value ?? '')
          return
        }
        if (input.id === 'folder') {
          folderDraft = String(input.value ?? '')
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

    void openAndScan({ silent: true })
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

/**
 * Command: open the oldest stale note (missing dates first, then oldest modifiedAt).
 */
async function openOldest() {
  try {
    await rescan({ silent: true })

    if (!view || !view.items.length) {
      await fanotes.ui.toast(
        t('Keine veralteten Notizen gefunden.', 'No stale notes found.'),
        'info',
      )
      return
    }

    const first = view.items[0]
    try {
      await fanotes.notes.open(first.path)
      await fanotes.ui.toast(
        t(`Geöffnet: ${first.title} (${formatRelativeAge(first.modifiedAt)})`, `Opened: ${first.title} (${formatRelativeAge(first.modifiedAt)})`),
        'success',
      )
    } catch (error) {
      await fanotes.ui.toast(
        t(`Öffnen fehlgeschlagen: ${errMessage(error)}`, `Open failed: ${errMessage(error)}`),
        'error',
      )
    }
  } catch (error) {
    await fanotes.ui.toast(
      t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`),
      'error',
    )
  }
}

// --- Commands ---------------------------------------------------------------

fanotes.commands.register({
  id: 'open',
  title: t('Veraltete Notizen öffnen', 'Open Stale Notes'),
  detail: t(
    'Panel mit Notizen älter als die Tagesschwelle (modifiedAt)',
    'Panel of notes older than the day threshold (modifiedAt)',
  ),
  keywords: 'stale veraltet idle untouched review alt aging notizen notes öffnen open',
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
  title: t('Veraltet-Scan aktualisieren', 'Refresh stale scan'),
  detail: t(
    'Markdown-Notizen erneut listen und nach modifiedAt-Alter filtern',
    'Re-list Markdown notes and filter by modifiedAt age',
  ),
  keywords: 'stale veraltet rescan aktualisieren refresh scan age modified',
  run: async () => {
    try {
      await rescan({ silent: false })
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'open-oldest',
  title: t('Älteste veraltete Notiz öffnen', 'Open oldest stale note'),
  detail: t(
    'Älteste veraltete Notiz öffnen (fehlendes Datum zuerst)',
    'Open the oldest stale note (missing date first)',
  ),
  keywords: 'stale veraltet oldest älteste öffnen open idle untouched',
  run: async () => {
    try {
      await openOldest()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.onActivate(async () => {
  try {
    // Light work only: settings. NO notes.list (scan-gate).
    // Remove cold status.
    await loadSettings()
    scannedOnce = false
    view = null
    await fanotes.ui.status.remove(STATUS_ID)
    fanotes.log(
      'stale-notes activated',
      fanotes.app.appVersion,
      settings.days,
      settings.folder || '(root)',
      settings.maxList,
    )
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(async () => {
  scanning = false
  scanQueued = false
  scannedOnce = false
  try {
    await fanotes.ui.status.remove(STATUS_ID)
  } catch {
    // Host tears down UI; ignore.
  }
  panel = null
  view = null
})
