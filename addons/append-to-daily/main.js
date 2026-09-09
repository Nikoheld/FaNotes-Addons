/// <reference path="../../sdk/fanotes-addon.d.ts" />

// An Tagesnotiz anhängen / Append to Daily – append selection or prompt text
// to today’s YYYY-MM-DD daily note. No vault:write, no network, no clipboard.

const STORAGE_KEY = 'settings'
const PANEL_ID = 'daily-append'
const DEFAULT_FOLDER = 'Daily'
const FILENAME_FORMAT = 'YYYY-MM-DD'

/**
 * @typedef {{
 *   folder: string,
 *   filenameFormat: string,
 *   heading: string,
 *   prefixTimestamp: boolean,
 *   showStatus: boolean,
 * }} Settings
 */

/** @type {Settings} */
const DEFAULTS = {
  folder: DEFAULT_FOLDER,
  filenameFormat: FILENAME_FORMAT,
  heading: '',
  prefixTimestamp: true,
  showStatus: false,
}

/** @type {Settings} */
let settings = { ...DEFAULTS }

/** @type {FaNotes.Panel | null} */
let panel = null

/** Cached exists flag for panel keyvalue (refreshed on panel open/update). */
/** @type {boolean | null} */
let panelExists = null

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

/** Local calendar date as YYYY-MM-DD. */
function todayLocalISO(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** Local clock as HH:mm. */
function localTimeHHMM(date = new Date()) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/**
 * Normalize vault-relative folder: trim, strip leading/trailing `/`, reject `..`.
 * Soft mirror of daily-note (no vault.createFolder here).
 * @returns {string | null} normalized folder, '' for vault root, or null if invalid
 */
function normalizeFolder(raw) {
  let folder = String(raw ?? '').trim().replace(/\\/g, '/')
  while (folder.startsWith('/')) folder = folder.slice(1)
  while (folder.endsWith('/')) folder = folder.slice(0, -1)
  if (!folder) return DEFAULT_FOLDER
  const parts = folder.split('/').filter(Boolean)
  if (parts.some((p) => p === '.' || p === '..')) return null
  return parts.join('/')
}

/**
 * Computed daily path: folder + '/' + todayLocalISO + '.md'
 * Keep settings.folder; path is derived (filenameFormat fixed YYYY-MM-DD for v1).
 */
function dailyPath(folder = settings.folder) {
  const f = normalizeFolder(folder)
  const safe = f === null ? DEFAULT_FOLDER : f || DEFAULT_FOLDER
  const iso = todayLocalISO()
  return safe ? `${safe}/${iso}.md` : `${iso}.md`
}

/**
 * @param {unknown} raw
 * @returns {Settings}
 */
function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULTS }
  const obj = /** @type {Record<string, unknown>} */ (raw)
  const folder = normalizeFolder(obj.folder != null ? String(obj.folder) : DEFAULT_FOLDER)
  return {
    folder: folder === null ? DEFAULT_FOLDER : folder || DEFAULT_FOLDER,
    filenameFormat: FILENAME_FORMAT,
    heading: obj.heading != null ? String(obj.heading).trim() : '',
    prefixTimestamp: obj.prefixTimestamp !== false,
    showStatus: obj.showStatus === true,
  }
}

async function loadSettings() {
  try {
    const stored = await fanotes.storage.get(STORAGE_KEY)
    settings = normalizeSettings(stored)
  } catch (error) {
    fanotes.log('loadSettings failed', errMessage(error))
    settings = { ...DEFAULTS }
  }
}

/**
 * Persist settings. Returns false on invalid folder or storage error.
 * @param {Partial<Settings>} next
 */
async function saveSettings(next) {
  const folderRaw = next.folder != null ? next.folder : settings.folder
  const folder = normalizeFolder(folderRaw)
  if (folder === null) {
    await fanotes.ui.toast(
      t('Ungültiger Ordnerpfad (kein „..“ erlaubt).', 'Invalid folder path (".." is not allowed).'),
      'error',
    )
    return false
  }
  const prev = { ...settings }
  settings = {
    folder: folder || DEFAULT_FOLDER,
    filenameFormat: FILENAME_FORMAT,
    heading: next.heading != null ? String(next.heading).trim() : settings.heading,
    prefixTimestamp:
      next.prefixTimestamp !== undefined
        ? next.prefixTimestamp !== false && next.prefixTimestamp !== 'false'
        : settings.prefixTimestamp,
    showStatus:
      next.showStatus !== undefined
        ? next.showStatus === true || next.showStatus === 'true'
        : settings.showStatus,
  }
  try {
    await fanotes.storage.set(STORAGE_KEY, settings)
    return true
  } catch (error) {
    settings = prev
    await fanotes.ui.toast(
      t(`Speichern fehlgeschlagen: ${errMessage(error)}`, `Save failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

/**
 * Apply panel values into settings (soft persist before actions).
 * @param {Record<string, unknown>} values
 */
async function applyPanelValues(values) {
  if (!values || typeof values !== 'object') return true
  const folderRaw = values.folder != null ? String(values.folder) : settings.folder
  const heading = values.heading != null ? String(values.heading) : settings.heading
  const prefix =
    values.prefixTimestamp !== undefined
      ? values.prefixTimestamp !== false && values.prefixTimestamp !== 'false'
      : settings.prefixTimestamp
  return saveSettings({
    folder: folderRaw,
    heading,
    prefixTimestamp: prefix,
  })
}

/**
 * Ensure today’s daily note exists. No vault:write — create fail → toast Ordner anlegen.
 * Keeps settings.folder; path stays computed (no path fallback rewrite).
 * @returns {Promise<string | null>} vault path
 */
async function ensureDaily() {
  const folder = normalizeFolder(settings.folder)
  if (folder === null) {
    await fanotes.ui.toast(
      t('Ungültiger Ordnerpfad in den Einstellungen.', 'Invalid folder path in settings.'),
      'error',
    )
    return null
  }
  const safeFolder = folder || DEFAULT_FOLDER
  const iso = todayLocalISO()
  const path = dailyPath(safeFolder)

  let exists = false
  try {
    exists = await fanotes.notes.exists(path)
  } catch (error) {
    await fanotes.ui.toast(
      t(`Prüfung fehlgeschlagen: ${errMessage(error)}`, `Existence check failed: ${errMessage(error)}`),
      'error',
    )
    return null
  }

  if (exists) return path

  try {
    const created = await fanotes.notes.create({
      folder: safeFolder,
      name: iso,
      content: `# ${iso}\n`,
    })
    const resolved = created || path
    fanotes.log('created daily note', resolved)
    await fanotes.ui.toast(
      t(`Tagesnotiz ${iso} angelegt.`, `Daily note ${iso} created.`),
      'info',
    )
    return resolved
  } catch (error) {
    fanotes.log('notes.create failed', errMessage(error))
    await fanotes.ui.toast(
      t(
        `Tagesnotiz konnte nicht angelegt werden. Bitte Ordner „${safeFolder}“ manuell anlegen.`,
        `Could not create daily note. Please create folder "${safeFolder}" manually.`,
      ),
      'error',
    )
    return null
  }
}

/**
 * Build append payload: optional `HH:mm ` prefix + text.
 * If heading set: ensure `## heading` once (Soft: missing → insert heading then append;
 * else append at end after newline).
 * @param {string} text
 * @param {string} existingContent
 */
function buildAppendChunk(text, existingContent) {
  const body = String(text ?? '')
  const line = settings.prefixTimestamp ? `${localTimeHHMM()} ${body}` : body
  const heading = String(settings.heading || '').trim()
  if (!heading) return line

  const marker = `## ${heading}`
  if (!String(existingContent || '').includes(marker)) {
    return `\n\n## ${heading}\n${line}`
  }
  return line
}

/**
 * Append text to today’s daily note.
 * @param {string} text
 */
async function appendToDaily(text) {
  const trimmed = String(text ?? '')
  if (!trimmed.trim()) {
    await fanotes.ui.toast(
      t('Leerer Text – nichts angehängt.', 'Empty text – nothing appended.'),
      'info',
    )
    return false
  }

  const path = await ensureDaily()
  if (!path) return false

  let content = ''
  const heading = String(settings.heading || '').trim()
  if (heading) {
    try {
      content = await fanotes.notes.read(path)
    } catch (error) {
      await fanotes.ui.toast(
        t(`Lesen fehlgeschlagen: ${errMessage(error)}`, `Read failed: ${errMessage(error)}`),
        'error',
      )
      return false
    }
  }

  const chunk = buildAppendChunk(trimmed, content)

  try {
    await fanotes.notes.append(path, chunk)
    await fanotes.ui.toast(
      t(`An Tagesnotiz angehängt: ${path}`, `Appended to daily note: ${path}`),
      'success',
    )
    panelExists = true
    await refreshPanel()
    return true
  } catch (error) {
    await fanotes.ui.toast(
      t(`Anhängen fehlgeschlagen: ${errMessage(error)}`, `Append failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

async function appendSelection() {
  try {
    let sel = null
    try {
      sel = await fanotes.editor.getSelection()
    } catch (error) {
      await fanotes.ui.toast(
        t(`Auswahl nicht lesbar: ${errMessage(error)}`, `Could not read selection: ${errMessage(error)}`),
        'error',
      )
      return
    }

    const text = sel && typeof sel.text === 'string' ? sel.text : ''
    if (!text.trim()) {
      await fanotes.ui.toast(
        t('Keine Textauswahl – nichts angehängt.', 'No text selection – nothing appended.'),
        'info',
      )
      return
    }

    await appendToDaily(text)
  } catch (error) {
    await fanotes.ui.toast(
      t(`Anhängen fehlgeschlagen: ${errMessage(error)}`, `Append failed: ${errMessage(error)}`),
      'error',
    )
  }
}

async function appendPrompt() {
  try {
    const value = await fanotes.ui.prompt(
      t('Text an die Tagesnotiz anhängen:', 'Append text to today’s daily note:'),
      {
        title: t('An Tagesnotiz anhängen', 'Append to Daily'),
        placeholder: t('Notiz…', 'Note…'),
        multiline: true,
      },
    )
    if (value == null) return
    if (!String(value).trim()) {
      await fanotes.ui.toast(
        t('Leerer Text – nichts angehängt.', 'Empty text – nothing appended.'),
        'info',
      )
      return
    }
    await appendToDaily(value)
  } catch (error) {
    await fanotes.ui.toast(
      t(`Prompt fehlgeschlagen: ${errMessage(error)}`, `Prompt failed: ${errMessage(error)}`),
      'error',
    )
  }
}

async function openDaily() {
  try {
    const path = await ensureDaily()
    if (!path) return
    try {
      await fanotes.notes.open(path)
      await fanotes.ui.toast(
        t(`Geöffnet: ${path}`, `Opened: ${path}`),
        'info',
      )
      panelExists = true
      await refreshPanel()
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

async function probeExists() {
  try {
    const path = dailyPath()
    panelExists = await fanotes.notes.exists(path)
  } catch (error) {
    fanotes.log('exists probe failed', errMessage(error))
    panelExists = null
  }
}

function existsLabel() {
  if (panelExists === true) return t('ja', 'yes')
  if (panelExists === false) return t('nein', 'no')
  return t('—', '—')
}

function renderBlocks() {
  const path = dailyPath()
  /** @type {FaNotes.Block[]} */
  return [
    { type: 'heading', text: t('An Tagesnotiz anhängen', 'Append to Daily'), level: 2 },
    {
      type: 'text',
      muted: true,
      text: t(
        'Hängt Auswahl oder Prompt-Text an die heutige Tagesnotiz (YYYY-MM-DD).',
        'Appends selection or prompted text to today’s daily note (YYYY-MM-DD).',
      ),
    },
    {
      type: 'keyvalue',
      items: [
        { key: t('Heutiger Pfad', 'Today’s path'), value: path },
        { key: t('Existiert?', 'Exists?'), value: existsLabel() },
      ],
    },
    {
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'append-selection',
          label: t('Auswahl anhängen', 'Append selection'),
          primary: true,
        },
        { type: 'button', id: 'append-prompt', label: t('Prompt', 'Prompt') },
        { type: 'button', id: 'open-daily', label: t('Öffnen', 'Open') },
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
      id: 'prefixTimestamp',
      label: t('Uhrzeit voranstellen (HH:mm)', 'Prefix local time (HH:mm)'),
      checked: settings.prefixTimestamp === true,
    },
    {
      type: 'input',
      id: 'heading',
      label: t('Überschrift (optional, ## …)', 'Heading (optional, ## …)'),
      value: settings.heading,
      placeholder: t('leer = ans Dateiende', 'empty = end of file'),
    },
    {
      type: 'callout',
      tone: 'info',
      text: t(
        `Kein vault:write – fehlenden Ordner „${settings.folder}“ bitte manuell anlegen. Dateiname fest: YYYY-MM-DD.md.`,
        `No vault:write – please create missing folder "${settings.folder}" manually. Filename fixed: YYYY-MM-DD.md.`,
      ),
    },
  ]
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('An Tagesnotiz anhängen', 'Append to Daily'))
  } catch (error) {
    if (isNoPanel(error)) {
      panel = null
      return
    }
    fanotes.log('refreshPanel', errMessage(error))
  }
}

async function openPanel() {
  try {
    await probeExists()

    if (panel) {
      void panel.show().catch((error) => fanotes.log('panel.show', errMessage(error)))
      await refreshPanel()
      return
    }

    panel = fanotes.ui.panel({
      id: PANEL_ID,
      title: t('An Tagesnotiz anhängen', 'Append to Daily'),
      icon: '➕',
      blocks: renderBlocks(),
    })

    panel.onAction(async (action) => {
      try {
        const values = action.values || {}
        if (
          action.id === 'append-selection' ||
          action.id === 'append-prompt' ||
          action.id === 'open-daily' ||
          action.id === 'submit:folder' ||
          action.id === 'submit:heading'
        ) {
          const ok = await applyPanelValues(values)
          if (!ok) {
            await refreshPanel()
            return
          }
        }

        if (action.id === 'append-selection') {
          await appendSelection()
          return
        }
        if (action.id === 'append-prompt') {
          await appendPrompt()
          return
        }
        if (action.id === 'open-daily') {
          await openDaily()
          return
        }
        if (action.id === 'submit:folder' || action.id === 'submit:heading') {
          await fanotes.ui.toast(t('Einstellungen gespeichert.', 'Settings saved.'), 'success')
          await probeExists()
          await refreshPanel()
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
        if (input.id === 'prefixTimestamp') {
          const checked = input.value === true
          await saveSettings({ prefixTimestamp: checked })
          await refreshPanel()
          return
        }
        if (input.id === 'folder') {
          const folderRaw = input.value != null ? String(input.value) : settings.folder
          const ok = await saveSettings({ folder: folderRaw })
          if (ok) {
            await probeExists()
            await refreshPanel()
          }
          return
        }
        if (input.id === 'heading') {
          const heading = input.value != null ? String(input.value) : ''
          await saveSettings({ heading })
        }
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
  id: 'append-selection',
  title: t('Auswahl an Tagesnotiz anhängen', 'Append selection to daily note'),
  detail: t('Editor-Auswahl an heute anhängen', 'Append editor selection to today'),
  keywords: 'daily append selection auswahl anhängen',
  run: () => appendSelection(),
})

fanotes.commands.register({
  id: 'append-prompt',
  title: t('Text an Tagesnotiz anhängen…', 'Append text to daily note…'),
  detail: t('Prompt → an heutige Tagesnotiz', 'Prompt → today’s daily note'),
  keywords: 'daily append prompt text anhängen',
  run: () => appendPrompt(),
})

fanotes.commands.register({
  id: 'open-daily',
  title: t('Tagesnotiz öffnen', 'Open daily note'),
  detail: t('Heutige YYYY-MM-DD.md öffnen/anlegen', 'Open/create today’s YYYY-MM-DD.md'),
  keywords: 'daily open tagesnotiz öffnen',
  run: () => openDaily(),
})

fanotes.commands.register({
  id: 'open',
  title: t('An Tagesnotiz anhängen öffnen', 'Open Append to Daily'),
  detail: t('Panel mit Pfad und Einstellungen', 'Panel with path and settings'),
  keywords: 'settings panel einstellungen',
  run: () => openPanel(),
})

fanotes.commands.register({
  id: 'open-settings',
  title: t('Append-to-Daily-Einstellungen öffnen', 'Open Append to Daily settings'),
  detail: t('Gleiches Panel wie „öffnen“', 'Same panel as open'),
  keywords: 'settings panel einstellungen',
  run: () => openPanel(),
})

// --- Lifecycle --------------------------------------------------------------

fanotes.onActivate(async () => {
  // Soft: load settings only. No ensure/create/read of daily on activate.
  await loadSettings()
  fanotes.log('append-to-daily ready', settings.folder, FILENAME_FORMAT)
})

fanotes.onDeactivate(() => {
  panel = null
  panelExists = null
})
