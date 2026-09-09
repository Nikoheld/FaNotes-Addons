/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Wochenrückblick / Weekly Digest – ISO-week markdown note with edited
// notes + optional focus-minute sample. Scan-gate: preview only on panel
// open / refresh / write (never onActivate). Create-or-confirm overwrite.

const STORAGE_KEY = 'settings'
const PANEL_ID = 'digest'
const DEFAULT_FOLDER = 'Digests'
const DEFAULT_MAX_NOTES = 50
const DEFAULT_MAX_STATS_NOTES = 200

/**
 * @typedef {{
 *   folder: string,
 *   includeStats: boolean,
 *   maxNotes: number,
 *   maxStatsNotes: number,
 *   useWikilinks: boolean,
 *   lastWeekKey: string | null,
 * }} Settings
 */

/**
 * @typedef {{
 *   weekKey: string,
 *   rangeStart: Date,
 *   rangeEndExclusive: Date,
 *   notesInRange: FaNotes.NoteSummary[],
 *   focusMinutes: number | null,
 *   statsSampled: number,
 *   statsSkipped: number,
 *   builtAt: number,
 * }} Preview
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  folder: DEFAULT_FOLDER,
  includeStats: true,
  maxNotes: DEFAULT_MAX_NOTES,
  maxStatsNotes: DEFAULT_MAX_STATS_NOTES,
  useWikilinks: false,
  lastWeekKey: null,
}

/** @type {Settings} */
let settings = { ...DEFAULT_SETTINGS }

/** @type {FaNotes.Panel | null} */
let panel = null

/** @type {Preview | null} */
let preview = null

let building = false

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
 * ISO week key YYYY-Www (local Monday-start; week-year from Thursday).
 * @param {Date} [date]
 */
function weekKeyFor(date = new Date()) {
  const monday = startOfWeekMonday(date)
  const thursday = addDays(monday, 3)
  const weekYear = thursday.getFullYear()
  const jan4 = new Date(weekYear, 0, 4)
  const week1Monday = startOfWeekMonday(jan4)
  const week = Math.round((monday.getTime() - week1Monday.getTime()) / 604800000) + 1
  return `${weekYear}-W${pad2(week)}`
}

/** Normalize vault-relative folder: trim, strip `/`, reject `..`. */
function normalizeFolder(raw) {
  let folder = String(raw ?? '').trim().replace(/\\/g, '/')
  while (folder.startsWith('/')) folder = folder.slice(1)
  while (folder.endsWith('/')) folder = folder.slice(0, -1)
  if (!folder) return DEFAULT_FOLDER
  const parts = folder.split('/').filter(Boolean)
  if (parts.some((p) => p === '.' || p === '..')) return null
  return parts.join('/')
}

function digestPath(weekKey = weekKeyFor(), folder = settings.folder) {
  const f = normalizeFolder(folder) || DEFAULT_FOLDER
  return `${f}/${weekKey}.md`
}

/**
 * @param {unknown} raw
 * @returns {Settings}
 */
function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const obj = /** @type {Record<string, unknown>} */ (raw)

  const folderNorm = normalizeFolder(obj.folder != null ? String(obj.folder) : DEFAULT_FOLDER)
  const folder = folderNorm === null ? DEFAULT_FOLDER : folderNorm || DEFAULT_FOLDER

  let maxNotes = Number(obj.maxNotes)
  if (!Number.isFinite(maxNotes) || maxNotes < 1) maxNotes = DEFAULT_MAX_NOTES
  maxNotes = Math.min(500, Math.floor(maxNotes))

  let maxStatsNotes = Number(obj.maxStatsNotes)
  if (!Number.isFinite(maxStatsNotes) || maxStatsNotes < 1) maxStatsNotes = DEFAULT_MAX_STATS_NOTES
  maxStatsNotes = Math.min(2000, Math.floor(maxStatsNotes))

  let lastWeekKey = null
  if (typeof obj.lastWeekKey === 'string' && /^\d{4}-W\d{2}$/.test(obj.lastWeekKey)) {
    lastWeekKey = obj.lastWeekKey
  }

  return {
    folder,
    includeStats: obj.includeStats !== false,
    maxNotes,
    maxStatsNotes,
    useWikilinks: obj.useWikilinks === true,
    lastWeekKey,
  }
}

async function loadSettings() {
  try {
    const stored = await fanotes.storage.get(STORAGE_KEY)
    settings = normalizeSettings(stored)
  } catch (error) {
    fanotes.log('loadSettings failed', errMessage(error))
    settings = { ...DEFAULT_SETTINGS }
  }
}

/**
 * Persist settings; on failure restore `rollback` snapshot when provided.
 * @param {Settings} [rollback]
 * @returns {Promise<boolean>}
 */
async function saveSettings(rollback) {
  try {
    await fanotes.storage.set(STORAGE_KEY, settings)
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
 * Ensure every segment of `folderPath` exists (vault.createFolder).
 * @param {string} folderPath
 * @returns {Promise<boolean>}
 */
async function ensureFolder(folderPath) {
  const folder = normalizeFolder(folderPath)
  if (folder === null) {
    await fanotes.ui.toast(
      t('Ungültiger Ordnerpfad (kein „..“ erlaubt).', 'Invalid folder path (".." is not allowed).'),
      'error',
    )
    return false
  }
  if (!folder) return true

  let tree
  try {
    tree = await fanotes.notes.tree()
  } catch (error) {
    await fanotes.ui.toast(
      t(`Ordnerbaum konnte nicht gelesen werden: ${errMessage(error)}`, `Could not read folder tree: ${errMessage(error)}`),
      'error',
    )
    return false
  }

  const parts = folder.split('/')
  let parent = ''
  /** @type {FaNotes.TreeEntry[] | null} */
  let siblings = tree

  for (const name of parts) {
    const existing = siblings && siblings.find((e) => e.kind === 'folder' && e.name === name)
    if (existing) {
      parent = parent ? `${parent}/${name}` : name
      siblings = existing.children || []
      continue
    }

    if (!fanotes.hasPermission('vault:write')) {
      await fanotes.ui.toast(
        t(
          `Ordner „${folder}“ fehlt und darf nicht angelegt werden (Berechtigung vault:write fehlt).`,
          `Folder “${folder}” is missing and cannot be created (vault:write permission missing).`,
        ),
        'error',
      )
      return false
    }

    try {
      await fanotes.vault.createFolder(parent || '', name)
      fanotes.log('created folder', parent ? `${parent}/${name}` : name)
      parent = parent ? `${parent}/${name}` : name
      siblings = []
    } catch (error) {
      await fanotes.ui.toast(
        t(
          `Ordner „${name}“ konnte nicht angelegt werden: ${errMessage(error)}`,
          `Could not create folder “${name}”: ${errMessage(error)}`,
        ),
        'error',
      )
      return false
    }
  }

  return true
}

/**
 * @param {unknown} stats
 * @returns {number}
 */
function focusMsFromStats(stats) {
  if (!stats || typeof stats !== 'object') return 0
  const obj = /** @type {Record<string, unknown>} */ (stats)
  let focusMs = Number(obj.focusMs)
  if (!Number.isFinite(focusMs) || focusMs < 0) focusMs = 0
  return focusMs
}

/**
 * Build preview (SCAN GATE: call only from panel open / refresh / write).
 * @param {{ silent?: boolean }} [opts]
 */
async function buildPreview(opts = {}) {
  if (building) return preview
  building = true
  try {
    const weekKey = weekKeyFor()
    const rangeStart = startOfWeekMonday()
    const rangeEndExclusive = addDays(rangeStart, 7)
    const t0 = rangeStart.getTime()
    const t1 = rangeEndExclusive.getTime()

    let notes = []
    try {
      notes = await fanotes.notes.list()
    } catch (error) {
      await fanotes.ui.toast(
        t(`Notizenliste fehlgeschlagen: ${errMessage(error)}`, `Note list failed: ${errMessage(error)}`),
        'error',
      )
      return preview
    }

    const mdAll = notes
      .filter((n) => /\.(md|markdown)$/iu.test(n.path))
      .sort((a, b) => String(b.modifiedAt ?? '').localeCompare(String(a.modifiedAt ?? '')))

    const inRange = mdAll.filter((n) => {
      if (!n.modifiedAt) return false
      const ts = Date.parse(n.modifiedAt)
      return Number.isFinite(ts) && ts >= t0 && ts < t1
    })

    // Re-sort in-range explicitly (localeCompare), then slice maxNotes.
    const notesInRange = inRange
      .slice()
      .sort((a, b) => String(b.modifiedAt ?? '').localeCompare(String(a.modifiedAt ?? '')))
      .slice(0, settings.maxNotes)

    let focusMinutes = null
    let statsSampled = 0
    let statsSkipped = 0

    if (settings.includeStats && fanotes.hasPermission('stats:read')) {
      const sample = mdAll.slice(0, settings.maxStatsNotes)
      let sumMs = 0
      for (const note of sample) {
        try {
          const stats = await fanotes.stats.read(note.path)
          sumMs += focusMsFromStats(stats)
          statsSampled += 1
        } catch (error) {
          fanotes.log('stats.read failed', note.path, errMessage(error))
          statsSkipped += 1
        }
      }
      focusMinutes = Math.round(sumMs / 60000)
    } else if (settings.includeStats) {
      focusMinutes = null
    }

    preview = {
      weekKey,
      rangeStart,
      rangeEndExclusive,
      notesInRange,
      focusMinutes,
      statsSampled,
      statsSkipped,
      builtAt: Date.now(),
    }

    if (!opts.silent) {
      await fanotes.ui.toast(
        t(
          `Vorschau: ${notesInRange.length} Notiz(en) in ${weekKey}.`,
          `Preview: ${notesInRange.length} note(s) in ${weekKey}.`,
        ),
        'info',
      )
    }

    return preview
  } catch (error) {
    try {
      await fanotes.ui.toast(
        t(`Vorschau fehlgeschlagen: ${errMessage(error)}`, `Preview failed: ${errMessage(error)}`),
        'error',
      )
    } catch {
      fanotes.log('buildPreview failed', errMessage(error))
    }
    return preview
  } finally {
    building = false
  }
}

/**
 * Markdown body (bilingual section headers; activity lines via t).
 * @param {Preview} data
 */
function buildMarkdown(data) {
  const { weekKey, notesInRange, focusMinutes } = data
  const lines = []
  lines.push(`# Wochenrückblick ${weekKey} / Weekly Digest`)
  lines.push('')
  lines.push('## Aktivität / Activity')
  lines.push(
    `- ${t(`Geänderte Notizen: ${notesInRange.length}`, `Notes changed: ${notesInRange.length}`)}`,
  )
  if (settings.includeStats) {
    const mins = focusMinutes == null ? '—' : String(focusMinutes)
    lines.push(
      `- ${t(
        `Fokusminuten (Stichprobe, Cap ${settings.maxStatsNotes}): ${mins}`,
        `Focus minutes (sample, Cap ${settings.maxStatsNotes}): ${mins}`,
      )}`,
    )
  }
  lines.push('')
  lines.push('## Geänderte Notizen / Edited notes')
  if (!notesInRange.length) {
    lines.push(`- ${t('(keine in dieser Woche)', '(none this week)')}`)
  } else if (settings.useWikilinks) {
    for (const n of notesInRange) {
      const title = (n.title && String(n.title).trim()) || n.path
      lines.push(`- [[${title}]]`)
    }
  } else {
    for (const n of notesInRange) {
      const title = (n.title && String(n.title).trim()) || n.path
      lines.push(`- ${title} — ${n.path}`)
    }
  }
  lines.push('')
  return lines.join('\n')
}

/**
 * Create-or-confirm write for the current week digest.
 * @param {{ fromPanel?: boolean }} [opts]
 */
async function writeDigest(opts = {}) {
  try {
    const data = (await buildPreview({ silent: true })) || preview
    if (!data) {
      await fanotes.ui.toast(
        t('Vorschau fehlt – bitte aktualisieren.', 'Preview missing – please refresh.'),
        'error',
      )
      return
    }

    const folder = normalizeFolder(settings.folder)
    if (folder === null) {
      await fanotes.ui.toast(
        t('Ungültiger Ordnerpfad in den Einstellungen.', 'Invalid folder path in settings.'),
        'error',
      )
      return
    }
    const folderSafe = folder || DEFAULT_FOLDER
    const path = digestPath(data.weekKey, folderSafe)
    const content = buildMarkdown(data)

    let exists = false
    try {
      exists = await fanotes.notes.exists(path)
    } catch (error) {
      await fanotes.ui.toast(
        t(`Prüfung fehlgeschlagen: ${errMessage(error)}`, `Existence check failed: ${errMessage(error)}`),
        'error',
      )
      return
    }

    if (exists) {
      const ok = await fanotes.ui.confirm(
        t(
          `Digest „${path}“ existiert bereits. Überschreiben?`,
          `Digest “${path}” already exists. Overwrite?`,
        ),
        {
          title: t('Digest überschreiben?', 'Overwrite digest?'),
          confirmLabel: t('Überschreiben', 'Overwrite'),
        },
      )
      if (!ok) {
        await fanotes.ui.toast(t('Schreiben abgebrochen.', 'Write cancelled.'), 'info')
        return
      }
      try {
        await fanotes.notes.write(path, content)
      } catch (error) {
        await fanotes.ui.toast(
          t(`Schreiben fehlgeschlagen: ${errMessage(error)}`, `Write failed: ${errMessage(error)}`),
          'error',
        )
        return
      }
    } else {
      const okFolder = await ensureFolder(folderSafe)
      if (!okFolder) return

      try {
        const created = await fanotes.notes.create({
          folder: folderSafe,
          name: data.weekKey,
          content,
        })
        fanotes.log('created digest', created)
      } catch (error) {
        // Folder may have raced; retry once after ensureFolder.
        const retryFolder = await ensureFolder(folderSafe)
        if (!retryFolder) return
        try {
          await fanotes.notes.create({
            folder: folderSafe,
            name: data.weekKey,
            content,
          })
        } catch (error2) {
          // If create still fails because it now exists, confirm + write.
          let nowExists = false
          try {
            nowExists = await fanotes.notes.exists(path)
          } catch {
            nowExists = false
          }
          if (nowExists) {
            const ok = await fanotes.ui.confirm(
              t(
                `Digest „${path}“ existiert bereits. Überschreiben?`,
                `Digest “${path}” already exists. Overwrite?`,
              ),
              {
                title: t('Digest überschreiben?', 'Overwrite digest?'),
                confirmLabel: t('Überschreiben', 'Overwrite'),
              },
            )
            if (!ok) {
              await fanotes.ui.toast(t('Schreiben abgebrochen.', 'Write cancelled.'), 'info')
              return
            }
            try {
              await fanotes.notes.write(path, content)
            } catch (error3) {
              await fanotes.ui.toast(
                t(`Schreiben fehlgeschlagen: ${errMessage(error3)}`, `Write failed: ${errMessage(error3)}`),
                'error',
              )
              return
            }
          } else {
            await fanotes.ui.toast(
              t(
                `Digest konnte nicht angelegt werden: ${errMessage(error2)}`,
                `Could not create digest: ${errMessage(error2)}`,
              ),
              'error',
            )
            return
          }
        }
      }
    }

    // Digest file already written — keep lastWeekKey in memory even if storage fails.
    settings.lastWeekKey = data.weekKey
    const saved = await saveSettings()
    if (!saved) {
      fanotes.log('lastWeekKey storage persist failed; in-memory weekKey kept')
    }

    await fanotes.ui.toast(
      t(`Digest geschrieben: ${path}`, `Digest written: ${path}`),
      'success',
    )

    if (opts.fromPanel || panel) await refreshPanel()
  } catch (error) {
    try {
      await fanotes.ui.toast(
        t(`Unerwarteter Fehler: ${errMessage(error)}`, `Unexpected error: ${errMessage(error)}`),
        'error',
      )
    } catch {
      fanotes.log('writeDigest failed', errMessage(error))
    }
  }
}

async function openDigest() {
  try {
    const weekKey = weekKeyFor()
    const folder = normalizeFolder(settings.folder) || DEFAULT_FOLDER
    const path = digestPath(weekKey, folder)

    let exists = false
    try {
      exists = await fanotes.notes.exists(path)
    } catch (error) {
      await fanotes.ui.toast(
        t(`Prüfung fehlgeschlagen: ${errMessage(error)}`, `Existence check failed: ${errMessage(error)}`),
        'error',
      )
      return
    }

    if (!exists) {
      await fanotes.ui.toast(
        t(
          `Kein Digest für ${weekKey} (${path}).`,
          `No digest for ${weekKey} (${path}).`,
        ),
        'info',
      )
      return
    }

    try {
      await fanotes.notes.open(path)
      await fanotes.ui.toast(
        t(`Digest geöffnet: ${weekKey}`, `Digest opened: ${weekKey}`),
        'info',
      )
    } catch (error) {
      await fanotes.ui.toast(
        t(`Öffnen fehlgeschlagen: ${errMessage(error)}`, `Open failed: ${errMessage(error)}`),
        'error',
      )
    }
  } catch (error) {
    await fanotes.ui.toast(
      t(`Unerwarteter Fehler: ${errMessage(error)}`, `Unexpected error: ${errMessage(error)}`),
      'error',
    )
  }
}

function renderBlocks() {
  const weekKey = preview ? preview.weekKey : weekKeyFor()
  const notesCount = preview ? preview.notesInRange.length : '—'
  const focusVal =
    !preview || !settings.includeStats
      ? '—'
      : preview.focusMinutes == null
        ? '—'
        : String(preview.focusMinutes)

  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Wochenrückblick', 'Weekly Digest'), level: 2 },
    {
      type: 'keyvalue',
      items: [
        { key: t('Woche', 'Week'), value: weekKey },
        { key: t('Notizen', 'Notes'), value: notesCount },
        { key: t('Fokus (min)', 'Focus (min)'), value: focusVal },
      ],
    },
    {
      type: 'list',
      id: 'preview-notes',
      items: (preview ? preview.notesInRange : []).slice(0, 20).map((n, i) => ({
        id: `note-${i}`,
        title: (n.title && String(n.title).trim()) || n.path,
        detail: n.path,
      })),
      empty: t('Noch keine Vorschau – aktualisieren.', 'No preview yet – refresh.'),
    },
    {
      type: 'checkbox',
      id: 'includeStats',
      label: t('Fokusminuten einbeziehen (stats)', 'Include focus minutes (stats)'),
      checked: settings.includeStats,
    },
    {
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'write',
          label: t('Digest schreiben', 'Write digest'),
          primary: true,
          disabled: building,
        },
      ],
    },
    {
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'refresh',
          label: t('Vorschau aktualisieren', 'Refresh preview'),
          disabled: building,
        },
        {
          type: 'button',
          id: 'open',
          label: t('Öffnen', 'Open'),
        },
      ],
    },
    {
      type: 'text',
      muted: true,
      text: t(
        `Cap Notizen ${settings.maxNotes}, Cap Stats ${settings.maxStatsNotes}; Sortierung modifiedAt absteigend (localeCompare). Kein Auto-Scan beim Aktivieren.`,
        `Cap notes ${settings.maxNotes}, Cap stats ${settings.maxStatsNotes}; sort modifiedAt descending (localeCompare). No auto-scan on activate.`,
      ),
    },
  ]

  return blocks
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Wochenrückblick', 'Weekly Digest'))
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
      void (async () => {
        await buildPreview({ silent: true })
        await refreshPanel()
      })()
      return
    }

    panel = fanotes.ui.panel({
      id: PANEL_ID,
      title: t('Wochenrückblick', 'Weekly Digest'),
      icon: '📆',
      blocks: renderBlocks(),
      focus: true,
    })

    panel.onAction(async (action) => {
      try {
        if (action.id === 'write') {
          await writeDigest({ fromPanel: true })
          return
        }
        if (action.id === 'refresh') {
          await buildPreview({ silent: false })
          await refreshPanel()
          return
        }
        if (action.id === 'open') {
          await openDigest()
          return
        }
        if (action.id === 'preview-notes' && action.itemId) {
          const idx = Number(String(action.itemId).replace(/^note-/, ''))
          if (preview && Number.isFinite(idx) && preview.notesInRange[idx]) {
            try {
              await fanotes.notes.open(preview.notesInRange[idx].path)
            } catch (error) {
              await fanotes.ui.toast(
                t(`Öffnen fehlgeschlagen: ${errMessage(error)}`, `Open failed: ${errMessage(error)}`),
                'error',
              )
            }
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
        if (input.id === 'includeStats') {
          const prev = { ...settings }
          settings.includeStats = input.value === true
          const ok = await saveSettings(prev)
          if (!ok) {
            await refreshPanel()
            return
          }
          // Stats toggle: rebuild preview (scan gate: user-driven).
          await buildPreview({ silent: true })
          await refreshPanel()
        }
      } catch (error) {
        fanotes.log('onInput', errMessage(error))
      }
    })

    void (async () => {
      try {
        await buildPreview({ silent: true })
        await refreshPanel()
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
  title: t('Wochenrückblick öffnen', 'Open Weekly Digest'),
  detail: t(
    'Panel mit Vorschau der aktuellen ISO-Woche',
    'Panel with preview of the current ISO week',
  ),
  keywords: 'digest woche weekly review rückblick fokus stats week vorschau preview panel',
  run: () => {
    try {
      openPanel()
    } catch (error) {
      void fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'write-digest',
  title: t('Wochenrückblick schreiben', 'Write weekly digest'),
  detail: t(
    'Digest anlegen oder nach Bestätigung überschreiben',
    'Create digest or overwrite after confirmation',
  ),
  keywords: 'digest woche weekly review rückblick fokus stats week schreiben write',
  run: async () => {
    try {
      await writeDigest()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'open-digest',
  title: t('Wochenrückblick-Notiz öffnen', 'Open weekly digest note'),
  detail: t(
    'Bestehende Digest-Notiz der aktuellen Woche öffnen',
    'Open the current week’s existing digest note',
  ),
  keywords: 'digest woche weekly review rückblick fokus stats week öffnen open',
  run: async () => {
    try {
      await openDigest()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.onActivate(async () => {
  try {
    await loadSettings()
    // SCAN GATE: no vault/stats scan on activate – only storage load.
    fanotes.log(
      'weekly-digest activated',
      fanotes.app.appVersion,
      settings.folder,
      settings.lastWeekKey,
    )
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(async () => {
  building = false
  preview = null
  panel = null
})
