/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Tagesnotiz / Daily Note – open or create YYYY-MM-DD.md in a configurable folder.

const STORAGE_KEY = 'settings'
const DEFAULT_FOLDER = 'Daily'
const PANEL_ID = 'daily'
const STATUS_ID = 'daily'

/** @type {{ folder: string, showStatusBar: boolean }} */
const DEFAULTS = { folder: DEFAULT_FOLDER, showStatusBar: true }

/** @type {{ folder: string, showStatusBar: boolean }} */
let settings = { ...DEFAULTS }

/** @type {FaNotes.Panel | null} */
let panel = null

/** Bilingual UI helper: German default, English when app language is `en`. */
function t(de, en) {
  return fanotes.app.language === 'en' ? en : de
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

/** Local calendar date as YYYY-MM-DD. */
function formatIso(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function todayDate() {
  return new Date()
}

function yesterdayDate() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d
}

/** Normalize vault-relative folder: trim, strip leading/trailing `/`, reject `..`. */
function normalizeFolder(raw) {
  let folder = String(raw ?? '').trim().replace(/\\/g, '/')
  while (folder.startsWith('/')) folder = folder.slice(1)
  while (folder.endsWith('/')) folder = folder.slice(0, -1)
  if (!folder) return DEFAULT_FOLDER
  const parts = folder.split('/').filter(Boolean)
  if (parts.some((p) => p === '.' || p === '..')) return null
  return parts.join('/')
}

function notePathFor(date, folder = settings.folder) {
  const f = normalizeFolder(folder) || DEFAULT_FOLDER
  return f ? `${f}/${formatIso(date)}.md` : `${formatIso(date)}.md`
}

/** Light markdown template when creating a new daily note. */
function templateFor(date) {
  const iso = formatIso(date)
  const locale = fanotes.app.language === 'en' ? 'en-US' : 'de-DE'
  let long = ''
  try {
    long = date.toLocaleDateString(locale, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    long = iso
  }
  return `# ${iso}\n\n${long}\n\n`
}

function errMessage(error) {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return String(error ?? 'unknown')
}

/**
 * Ensure every segment of `folderPath` exists. Uses vault.createFolder when needed.
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
 * Open today's or yesterday's daily note; create with template if missing.
 * @param {'today' | 'yesterday'} which
 */
async function openDaily(which) {
  try {
    const date = which === 'yesterday' ? yesterdayDate() : todayDate()
    const folder = normalizeFolder(settings.folder)
    if (folder === null) {
      await fanotes.ui.toast(
        t('Ungültiger Ordnerpfad in den Einstellungen.', 'Invalid folder path in settings.'),
        'error',
      )
      return
    }

    const path = notePathFor(date, folder || DEFAULT_FOLDER)
    const iso = formatIso(date)

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
      const okFolder = await ensureFolder(folder || DEFAULT_FOLDER)
      if (!okFolder) return

      try {
        const created = await fanotes.notes.create({
          folder: folder || DEFAULT_FOLDER,
          name: iso,
          content: templateFor(date),
        })
        fanotes.log('created daily note', created)
        await fanotes.notes.open(created)
        await fanotes.ui.toast(
          t(`Tagesnotiz ${iso} angelegt.`, `Daily note ${iso} created.`),
          'success',
        )
      } catch (error) {
        await fanotes.ui.toast(
          t(
            `Tagesnotiz konnte nicht angelegt werden: ${errMessage(error)}`,
            `Could not create daily note: ${errMessage(error)}`,
          ),
          'error',
        )
      }
      await refreshUi()
      return
    }

    try {
      await fanotes.notes.open(path)
      await fanotes.ui.toast(
        which === 'yesterday'
          ? t(`Gestern geöffnet: ${iso}`, `Opened yesterday: ${iso}`)
          : t(`Heute geöffnet: ${iso}`, `Opened today: ${iso}`),
        'info',
      )
    } catch (error) {
      await fanotes.ui.toast(
        t(`Öffnen fehlgeschlagen: ${errMessage(error)}`, `Open failed: ${errMessage(error)}`),
        'error',
      )
    }
    await refreshUi()
  } catch (error) {
    try {
      await fanotes.ui.toast(
        t(`Unerwarteter Fehler: ${errMessage(error)}`, `Unexpected error: ${errMessage(error)}`),
        'error',
      )
    } catch {
      fanotes.log('openDaily failed', errMessage(error))
    }
  }
}

async function loadSettings() {
  try {
    const stored = await fanotes.storage.get(STORAGE_KEY)
    if (stored && typeof stored === 'object') {
      const obj = /** @type {Record<string, unknown>} */ (stored)
      const folder = normalizeFolder(obj.folder != null ? String(obj.folder) : DEFAULT_FOLDER)
      settings = {
        folder: folder === null ? DEFAULT_FOLDER : folder || DEFAULT_FOLDER,
        showStatusBar: obj.showStatusBar !== false,
      }
    } else {
      settings = { ...DEFAULTS }
    }
  } catch (error) {
    fanotes.log('loadSettings failed', errMessage(error))
    settings = { ...DEFAULTS }
  }
}

async function saveSettings(next) {
  const folder = normalizeFolder(next.folder)
  if (folder === null) {
    await fanotes.ui.toast(
      t('Ungültiger Ordnerpfad (kein „..“ erlaubt).', 'Invalid folder path (".." is not allowed).'),
      'error',
    )
    return false
  }
  settings = {
    folder: folder || DEFAULT_FOLDER,
    showStatusBar: next.showStatusBar !== false,
  }
  try {
    await fanotes.storage.set(STORAGE_KEY, settings)
    return true
  } catch (error) {
    await fanotes.ui.toast(
      t(`Speichern fehlgeschlagen: ${errMessage(error)}`, `Save failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

async function updateStatus() {
  try {
    if (!settings.showStatusBar) {
      await fanotes.ui.status.remove(STATUS_ID)
      return
    }
    const iso = formatIso(todayDate())
    await fanotes.ui.status.set({
      id: STATUS_ID,
      text: `📅 ${iso}`,
      title: t('Tagesnotiz von heute öffnen', 'Open today’s daily note'),
      onClick: () => {
        void openDaily('today')
      },
    })
  } catch (error) {
    fanotes.log('updateStatus failed', errMessage(error))
  }
}

function renderBlocks() {
  const today = todayDate()
  const yesterday = yesterdayDate()
  const todayPath = notePathFor(today)
  const yesterdayPath = notePathFor(yesterday)

  return [
    { type: 'heading', text: t('Tagesnotiz', 'Daily Note'), level: 2 },
    {
      type: 'text',
      text: t(
        'Öffnet oder erstellt die Notiz für heute bzw. gestern im gewählten Ordner.',
        'Opens or creates today’s or yesterday’s note in the chosen folder.',
      ),
      muted: true,
    },
    {
      type: 'keyvalue',
      items: [
        { key: t('Heute', 'Today'), value: todayPath },
        { key: t('Gestern', 'Yesterday'), value: yesterdayPath },
      ],
    },
    {
      type: 'row',
      children: [
        { type: 'button', id: 'open-today', label: t('Heute öffnen', 'Open today'), primary: true },
        { type: 'button', id: 'open-yesterday', label: t('Gestern öffnen', 'Open yesterday') },
      ],
    },
    { type: 'divider' },
    { type: 'heading', text: t('Einstellungen', 'Settings'), level: 3 },
    {
      type: 'input',
      id: 'folder',
      label: t('Ordner (relativ zum Vault)', 'Folder (vault-relative)'),
      value: settings.folder,
      placeholder: DEFAULT_FOLDER,
    },
    {
      type: 'checkbox',
      id: 'showStatusBar',
      label: t('Datum in der Statusleiste anzeigen', 'Show date in the status bar'),
      checked: settings.showStatusBar,
    },
    {
      type: 'callout',
      tone: 'info',
      text: t(
        `Standardordner: „${DEFAULT_FOLDER}“. Fehlende Ordner werden mit vault:write angelegt.`,
        `Default folder: “${DEFAULT_FOLDER}”. Missing folders are created when vault:write is granted.`,
      ),
    },
    {
      type: 'row',
      children: [
        { type: 'button', id: 'save-settings', label: t('Einstellungen speichern', 'Save settings') },
      ],
    },
  ]
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
  } catch (error) {
    // Panel may have been closed by the user (E_NO_PANEL).
    fanotes.log('refreshPanel', errMessage(error))
    panel = null
  }
}

async function refreshUi() {
  await updateStatus()
  await refreshPanel()
}

function openPanel() {
  try {
    if (panel) {
      void panel.show().catch((error) => fanotes.log('panel.show', errMessage(error)))
      void refreshPanel()
      return
    }

    panel = fanotes.ui.panel({
      id: PANEL_ID,
      title: t('Tagesnotiz', 'Daily Note'),
      icon: '📅',
      blocks: renderBlocks(),
    })

    panel.onAction(async (action) => {
      try {
        if (action.id === 'open-today') {
          await openDaily('today')
          return
        }
        if (action.id === 'open-yesterday') {
          await openDaily('yesterday')
          return
        }
        if (action.id === 'save-settings' || action.id === 'submit:folder') {
          const values = action.values || {}
          const folderRaw = values.folder != null ? String(values.folder) : settings.folder
          const show = values.showStatusBar !== false && values.showStatusBar !== 'false'
          const ok = await saveSettings({ folder: folderRaw, showStatusBar: show })
          if (ok) {
            await fanotes.ui.toast(t('Einstellungen gespeichert.', 'Settings saved.'), 'success')
            await refreshUi()
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
        if (input.id === 'showStatusBar') {
          const checked = input.value === true
          await saveSettings({ folder: settings.folder, showStatusBar: checked })
          await refreshUi()
        }
        // Folder is applied on Save / Enter (submit:folder) to avoid partial paths.
      } catch (error) {
        fanotes.log('onInput', errMessage(error))
      }
    })
  } catch (error) {
    void fanotes.ui.toast(
      t(`Panel konnte nicht geöffnet werden: ${errMessage(error)}`, `Could not open panel: ${errMessage(error)}`),
      'error',
    )
  }
}

// --- Commands ---------------------------------------------------------------

fanotes.commands.register({
  id: 'open-today',
  title: t('Tagesnotiz von heute öffnen', 'Open today’s daily note'),
  detail: t('YYYY-MM-DD.md im konfigurierten Ordner', 'YYYY-MM-DD.md in the configured folder'),
  keywords: 'tagesnotiz daily today heute journal tagebuch',
  run: async () => {
    try {
      await openDaily('today')
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'open-yesterday',
  title: t('Tagesnotiz von gestern öffnen', 'Open yesterday’s daily note'),
  detail: t('Notiz des Vortags öffnen oder anlegen', 'Open or create the previous day’s note'),
  keywords: 'tagesnotiz daily yesterday gestern journal',
  run: async () => {
    try {
      await openDaily('yesterday')
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'open-panel',
  title: t('Tagesnotiz-Einstellungen öffnen', 'Open Daily Note settings'),
  detail: t('Panel mit Pfadvorschau und Ordner-Einstellung', 'Panel with path preview and folder setting'),
  keywords: 'tagesnotiz daily settings einstellungen panel',
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
    await loadSettings()
    await updateStatus()
    fanotes.log('daily-note activated', fanotes.app.appVersion, settings.folder)
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(async () => {
  try {
    await fanotes.ui.status.remove(STATUS_ID)
  } catch {
    // Host tears down UI; ignore.
  }
  panel = null
})
