/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Schnellerfassung / Quick Inbox – capture short tasks into an Inbox.md checklist.

const STORAGE_KEY = 'settings'
const PANEL_ID = 'settings'
const STATUS_ID = 'inbox'
const DEFAULT_INBOX = 'Inbox.md'

/**
 * @typedef {{
 *   inboxPath: string,
 *   prefix: string,
 *   defaultTag: string,
 *   showStatus: boolean,
 * }} Settings
 */

/** @type {Settings} */
const DEFAULTS = {
  inboxPath: DEFAULT_INBOX,
  prefix: '',
  defaultTag: '',
  showStatus: true,
}

/** @type {Settings} */
let settings = { ...DEFAULTS }

/** @type {FaNotes.Panel | null} */
let panel = null

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
 * Normalize a vault-relative inbox path to a `.md` file.
 * Rejects `..`, absolute paths, and non-markdown extensions.
 * @returns {{ path: string, folder: string, name: string } | null}
 */
function normalizeInboxPath(raw) {
  let path = String(raw ?? '').trim().replace(/\\/g, '/')
  while (path.startsWith('/')) path = path.slice(1)
  while (path.endsWith('/')) path = path.slice(0, -1)
  if (!path) path = DEFAULT_INBOX

  const parts = path.split('/').filter(Boolean)
  if (!parts.length || parts.some((p) => p === '.' || p === '..')) return null

  let file = parts[parts.length - 1]
  const lower = file.toLowerCase()
  if (lower.endsWith('.markdown')) {
    // Only .md is supported for append/create flows.
    return null
  }
  if (lower.includes('.') && !lower.endsWith('.md')) {
    return null
  }
  if (!lower.endsWith('.md')) {
    file = `${file}.md`
    parts[parts.length - 1] = file
  }

  const name = file.slice(0, -3) // strip .md
  if (!name) return null
  const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
  return { path: parts.join('/'), folder, name }
}

/**
 * Normalize a tag token: trim, strip leading `#`, disallow spaces.
 * @returns {string} bare tag without `#`, or '' if empty/invalid
 */
function normalizeTag(raw) {
  let tag = String(raw ?? '').trim()
  if (!tag) return ''
  while (tag.startsWith('#')) tag = tag.slice(1)
  tag = tag.trim()
  if (!tag || /\s/.test(tag)) return ''
  return tag
}

/**
 * Build one checklist line.
 * Format: `- [ ] YYYY-MM-DD HH:mm` + optional ` #tag` + ` ` + optional prefix + text
 * Prefix (settings) is placed after the tag and before the free text.
 */
function buildLine(text, tag) {
  const stamp = formatStamp()
  const bare = normalizeTag(tag)
  const prefix = String(settings.prefix ?? '')
  let line = `- [ ] ${stamp}`
  if (bare) line += ` #${bare}`
  line += ' '
  if (prefix) line += prefix
  line += text
  return line
}

/** Bilingual heading used when creating a missing inbox note. */
function inboxHeading() {
  return t('# Inbox\n\nSchnellerfassung / Quick capture\n\n', '# Inbox\n\nQuick capture / Schnellerfassung\n\n')
}

/**
 * Persist inboxPath when create/fallback resolves to a different path.
 * @param {string} path
 */
async function persistInboxPath(path) {
  if (!path || path === settings.inboxPath) return
  settings = { ...settings, inboxPath: path }
  try {
    await fanotes.storage.set(STORAGE_KEY, settings)
    fanotes.log('persisted inboxPath after create/fallback', path)
  } catch (error) {
    fanotes.log('could not persist inboxPath', errMessage(error))
  }
}

/**
 * Ensure the inbox note exists; create if missing.
 * Without vault:write, a missing parent folder falls back to FaNotes’ default folder
 * and settings.inboxPath is updated to the real path.
 * @returns {Promise<string | null>} resolved vault path to append to
 */
async function ensureInbox() {
  const parsed = normalizeInboxPath(settings.inboxPath)
  if (!parsed) {
    await fanotes.ui.toast(
      t(
        'Ungültiger Inbox-Pfad (nur .md, kein „..“).',
        'Invalid inbox path (only .md, no “..”).',
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

  const content = inboxHeading()

  // Prefer the configured folder; if that fails (e.g. missing parent, no vault:write),
  // fall back to FaNotes’ default note folder.
  try {
    const opts = /** @type {{ folder?: string, name: string, content: string }} */ ({
      name: parsed.name,
      content,
    })
    if (parsed.folder) opts.folder = parsed.folder
    const created = await fanotes.notes.create(opts)
    const path = created || parsed.path
    fanotes.log('created inbox', path)
    await persistInboxPath(path)
    await fanotes.ui.toast(
      t(`Inbox angelegt: ${path}`, `Inbox created: ${path}`),
      'info',
    )
    return path
  } catch (error) {
    fanotes.log('create with folder failed, trying default folder', errMessage(error))
    try {
      const bare = `${parsed.name}.md`
      try {
        if (await fanotes.notes.exists(bare)) {
          await persistInboxPath(bare)
          await fanotes.ui.toast(
            t(
              `Ordner fehlte – vorhandene Inbox „${bare}“ übernommen (Einstellungen aktualisiert).`,
              `Folder missing – reused existing inbox "${bare}" (settings updated).`,
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
      const path = created || `${parsed.name}.md`
      fanotes.log('created inbox in default folder', path)
      await persistInboxPath(path)
      await fanotes.ui.toast(
        t(
          `Ordner fehlte – Inbox woanders angelegt. Einstellungen auf „${path}“ aktualisiert.`,
          `Folder missing – inbox created elsewhere. Settings updated to "${path}".`,
        ),
        'info',
      )
      return path
    } catch (error2) {
      await fanotes.ui.toast(
        t(
          `Inbox konnte nicht angelegt werden: ${errMessage(error2)}`,
          `Could not create inbox: ${errMessage(error2)}`,
        ),
        'error',
      )
      return null
    }
  }
}

/**
 * Prompt → append one capture line.
 * @param {{ askTag?: boolean }} [opts]
 */
async function capture(opts = {}) {
  try {
    let tag = settings.defaultTag || ''

    if (opts.askTag) {
      const tagRaw = await fanotes.ui.prompt(
        t('Tag (ohne #, leer = kein Tag)', 'Tag (without #, empty = none)'),
        {
          title: t('Tag wählen', 'Choose tag'),
          placeholder: t('z. B. schule', 'e.g. school'),
          value: settings.defaultTag || '',
        },
      )
      if (tagRaw === null) return
      tag = tagRaw.trim()
      // Empty string is allowed (no tag). Invalid (spaces) → toast and abort.
      if (tag && !normalizeTag(tag)) {
        await fanotes.ui.toast(
          t('Ungültiger Tag (keine Leerzeichen).', 'Invalid tag (no spaces).'),
          'error',
        )
        return
      }
    }

    const textRaw = await fanotes.ui.prompt(
      t('Was soll in die Inbox?', 'What should go into the inbox?'),
      {
        title: t('In Inbox erfassen', 'Capture to inbox'),
        placeholder: t('z. B. Mathe Blatt 3', 'e.g. Math worksheet 3'),
        multiline: false,
      },
    )
    if (textRaw === null) return
    const text = textRaw.trim()
    if (!text) return

    const path = await ensureInbox()
    if (!path) return

    const line = buildLine(text, tag)
    try {
      await fanotes.notes.append(path, line)
      await fanotes.ui.toast(
        t('In Inbox erfasst.', 'Captured to inbox.'),
        'success',
      )
    } catch (error) {
      await fanotes.ui.toast(
        t(`Anhängen fehlgeschlagen: ${errMessage(error)}`, `Append failed: ${errMessage(error)}`),
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
      fanotes.log('capture failed', errMessage(error))
    }
  }
}

async function openInbox() {
  try {
    const parsed = normalizeInboxPath(settings.inboxPath)
    if (!parsed) {
      await fanotes.ui.toast(
        t('Ungültiger Inbox-Pfad.', 'Invalid inbox path.'),
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
      const created = await ensureInbox()
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
      fanotes.log('openInbox failed', errMessage(error))
    }
  }
}

async function loadSettings() {
  try {
    const stored = await fanotes.storage.get(STORAGE_KEY)
    if (stored && typeof stored === 'object') {
      const obj = /** @type {Record<string, unknown>} */ (stored)
      const parsed = normalizeInboxPath(obj.inboxPath != null ? String(obj.inboxPath) : DEFAULT_INBOX)
      settings = {
        inboxPath: parsed ? parsed.path : DEFAULT_INBOX,
        prefix: obj.prefix != null ? String(obj.prefix) : '',
        defaultTag: obj.defaultTag != null ? String(obj.defaultTag) : '',
        showStatus: obj.showStatus !== false,
      }
    } else {
      settings = { ...DEFAULTS }
    }
  } catch (error) {
    fanotes.log('loadSettings failed', errMessage(error))
    settings = { ...DEFAULTS }
  }
}

/**
 * @param {Partial<Settings>} next
 */
async function saveSettings(next) {
  const parsed = normalizeInboxPath(next.inboxPath != null ? next.inboxPath : settings.inboxPath)
  if (!parsed) {
    await fanotes.ui.toast(
      t(
        'Ungültiger Inbox-Pfad (nur .md, kein „..“).',
        'Invalid inbox path (only .md, no “..”).',
      ),
      'error',
    )
    return false
  }

  const tagRaw = next.defaultTag != null ? String(next.defaultTag) : settings.defaultTag
  const tagNorm = tagRaw.trim()
  if (tagNorm && !normalizeTag(tagNorm)) {
    await fanotes.ui.toast(
      t('Standard-Tag ungültig (keine Leerzeichen).', 'Default tag invalid (no spaces).'),
      'error',
    )
    return false
  }

  settings = {
    inboxPath: parsed.path,
    prefix: next.prefix != null ? String(next.prefix) : settings.prefix,
    defaultTag: tagNorm ? normalizeTag(tagNorm) : '',
    showStatus: next.showStatus !== false && next.showStatus !== 'false',
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
    if (!settings.showStatus) {
      await fanotes.ui.status.remove(STATUS_ID)
      return
    }
    await fanotes.ui.status.set({
      id: STATUS_ID,
      text: 'Inbox',
      title: t('Inbox öffnen', 'Open inbox'),
      onClick: () => {
        void openInbox()
      },
    })
  } catch (error) {
    fanotes.log('updateStatus failed', errMessage(error))
  }
}

function renderBlocks() {
  const previewTag = settings.defaultTag ? ` #${normalizeTag(settings.defaultTag) || settings.defaultTag}` : ''
  const previewPrefix = settings.prefix || ''
  const preview = `- [ ] ${formatStamp()}${previewTag} ${previewPrefix}…`

  return [
    { type: 'heading', text: t('Schnellerfassung', 'Quick Inbox'), level: 2 },
    {
      type: 'text',
      muted: true,
      text: t(
        'Kurze Aufgaben per Prompt als Checklistenzeile in die Inbox schreiben.',
        'Write short tasks via prompt as checklist lines into the inbox.',
      ),
    },
    {
      type: 'keyvalue',
      items: [
        { key: t('Pfad', 'Path'), value: settings.inboxPath },
        { key: t('Vorschau', 'Preview'), value: preview },
      ],
    },
    { type: 'divider' },
    { type: 'heading', text: t('Einstellungen', 'Settings'), level: 3 },
    {
      type: 'input',
      id: 'inboxPath',
      label: t('Inbox-Pfad (.md, relativ zum Vault)', 'Inbox path (.md, vault-relative)'),
      value: settings.inboxPath,
      placeholder: DEFAULT_INBOX,
    },
    {
      type: 'input',
      id: 'prefix',
      label: t('Text-Präfix (nach Tag, vor dem Text)', 'Text prefix (after tag, before text)'),
      value: settings.prefix,
      placeholder: t('z. B. TODO: ', 'e.g. TODO: '),
    },
    {
      type: 'input',
      id: 'defaultTag',
      label: t('Standard-Tag (ohne #)', 'Default tag (without #)'),
      value: settings.defaultTag,
      placeholder: t('z. B. schule', 'e.g. school'),
    },
    {
      type: 'checkbox',
      id: 'showStatus',
      label: t('„Inbox“ in der Statusleiste anzeigen', 'Show “Inbox” in the status bar'),
      checked: settings.showStatus,
    },
    {
      type: 'callout',
      tone: 'info',
      text: t(
        'Nur .md-Dateien. Ohne vault:write wird bei fehlendem Ordner die Inbox im Standardordner angelegt. Präfix steht nach dem Tag und vor dem Freitext.',
        'Only .md files. Without vault:write, a missing folder creates the inbox in the default folder. Prefix is placed after the tag and before the free text.',
      ),
    },
    {
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'save-settings',
          label: t('Einstellungen speichern', 'Save settings'),
          primary: true,
        },
        {
          type: 'button',
          id: 'open-inbox',
          label: t('Inbox öffnen', 'Open inbox'),
        },
      ],
    },
  ]
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Schnellerfassung', 'Quick Inbox'))
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

function openSettingsPanel() {
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
      title: t('Schnellerfassung', 'Quick Inbox'),
      icon: '📥',
      blocks: renderBlocks(),
    })

    panel.onAction(async (action) => {
      try {
        if (action.id === 'open-inbox') {
          await openInbox()
          return
        }
        if (
          action.id === 'save-settings' ||
          action.id === 'submit:inboxPath' ||
          action.id === 'submit:prefix' ||
          action.id === 'submit:defaultTag'
        ) {
          const values = action.values || {}
          const ok = await saveSettings({
            inboxPath: values.inboxPath != null ? String(values.inboxPath) : settings.inboxPath,
            prefix: values.prefix != null ? String(values.prefix) : settings.prefix,
            defaultTag: values.defaultTag != null ? String(values.defaultTag) : settings.defaultTag,
            showStatus:
              values.showStatus !== false &&
              values.showStatus !== 'false',
          })
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
        if (input.id === 'showStatus') {
          const checked = input.value === true
          await saveSettings({
            inboxPath: settings.inboxPath,
            prefix: settings.prefix,
            defaultTag: settings.defaultTag,
            showStatus: checked,
          })
          await refreshUi()
        }
        // Path / prefix / tag applied on Save or Enter (submit:*) to avoid partial paths.
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
  id: 'capture',
  title: t('In Inbox erfassen', 'Capture to inbox'),
  detail: t(
    'Text abfragen und als Checklistenzeile anhängen',
    'Prompt for text and append a checklist line',
  ),
  keywords: 'inbox erfassen capture schnell quick todo aufgabe task checkliste',
  run: async () => {
    try {
      await capture({ askTag: false })
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'capture-tagged',
  title: t('In Inbox mit Tag erfassen', 'Capture to inbox with tag'),
  detail: t(
    'Zuerst Tag, dann Text – als Checklistenzeile anhängen',
    'Prompt for tag, then text – append a checklist line',
  ),
  keywords: 'inbox tag erfassen capture schule school labelled',
  run: async () => {
    try {
      await capture({ askTag: true })
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'open-inbox',
  title: t('Inbox öffnen', 'Open inbox'),
  detail: t('Die konfigurierte Inbox-Notiz öffnen', 'Open the configured inbox note'),
  keywords: 'inbox öffnen open notiz note',
  run: async () => {
    try {
      await openInbox()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'open-settings',
  title: t('Schnellerfassung-Einstellungen öffnen', 'Open Quick Inbox settings'),
  detail: t(
    'Pfad, Präfix, Standard-Tag und Statusleiste',
    'Path, prefix, default tag and status bar',
  ),
  keywords: 'inbox settings einstellungen panel präfix prefix',
  run: () => {
    try {
      openSettingsPanel()
    } catch (error) {
      void fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.onActivate(async () => {
  try {
    await loadSettings()
    await updateStatus()
    fanotes.log('quick-inbox activated', fanotes.app.appVersion, settings.inboxPath)
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
