/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Geschwister-Notiz / Sibling Note – create a new note in the same folder as
// the active one; optional Wikilink insert into the open editor.
// Abgrenzung: daily-note/selection-to-note/template-library = andere Create-Flows;
// hier = gleicher Ordner wie active + optional Wikilink einfügen.
// Activate = load settings only. Kein Vault-Scan. Soft ohne vault:write —
// create Fail → toast Ordner. Mirror Soft: selection-to-note / daily-note create;
// path-copier Soft (notes.active, no heavy scan).

const SETTINGS_KEY = 'settings'
const PANEL_ID = 'sib'
const DEFAULT_MAX_NAME = 80

/**
 * @typedef {'prompt' | 'untitled'} NameMode
 */

/**
 * @typedef {{
 *   openAfter: boolean,
 *   insertLink: boolean,
 *   defaultNameMode: NameMode,
 *   stubContent: boolean,
 * }} Settings
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  openAfter: true,
  insertLink: false,
  defaultNameMode: 'prompt',
  stubContent: true,
}

/** @type {Settings} */
let settings = { ...DEFAULT_SETTINGS }

/** @type {FaNotes.Panel | null} */
let panel = null

/** Soft: counter for Untitled-N fallback within the session. */
let untitledCounter = 0

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
 * Soft basename without extension from a vault-relative path.
 * @param {string} path
 */
function basenameNoExt(path) {
  const raw = String(path ?? '').replace(/\\/g, '/')
  const slash = raw.lastIndexOf('/')
  const base = slash >= 0 ? raw.slice(slash + 1) : raw
  return base.replace(/\.md$/i, '')
}

/**
 * Soft folder: dirname(active.path) or '' (vault root).
 * @param {string} path
 * @returns {string}
 */
function dirnameOf(path) {
  const raw = String(path ?? '').replace(/\\/g, '/')
  const slash = raw.lastIndexOf('/')
  if (slash < 0) return ''
  return raw.slice(0, slash)
}

/**
 * @param {unknown} raw
 * @returns {NameMode}
 */
function normalizeNameMode(raw) {
  const s = String(raw ?? '').trim()
  if (s === 'untitled' || s === 'prompt') return s
  return DEFAULT_SETTINGS.defaultNameMode
}

/**
 * @param {unknown} raw
 * @returns {Settings}
 */
function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const obj = /** @type {Record<string, unknown>} */ (raw)
  return {
    openAfter: obj.openAfter !== false,
    insertLink: obj.insertLink === true,
    defaultNameMode: normalizeNameMode(obj.defaultNameMode),
    stubContent: obj.stubContent !== false,
  }
}

/**
 * @returns {Settings}
 */
function cloneSettings() {
  return {
    openAfter: settings.openAfter === true,
    insertLink: settings.insertLink === true,
    defaultNameMode: settings.defaultNameMode,
    stubContent: settings.stubContent === true,
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
}

/**
 * Persist settings; on failure restore `rollback` when provided.
 * @param {Settings} [rollback]
 * @returns {Promise<boolean>}
 */
async function persistSettings(rollback) {
  try {
    await fanotes.storage.set(SETTINGS_KEY, {
      openAfter: settings.openAfter === true,
      insertLink: settings.insertLink === true,
      defaultNameMode: settings.defaultNameMode,
      stubContent: settings.stubContent === true,
    })
    return true
  } catch (error) {
    if (rollback) {
      settings = {
        openAfter: rollback.openAfter === true,
        insertLink: rollback.insertLink === true,
        defaultNameMode: rollback.defaultNameMode,
        stubContent: rollback.stubContent === true,
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
 * Sanitize a note file name (no extension). Soft max 80.
 * Empty after sanitize → '' (caller treats as cancel Soft for prompt).
 * @param {string} title
 * @returns {string}
 */
function sanitizeName(title) {
  let name = String(title ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  while (name.startsWith('.') || name.endsWith('.')) {
    name = name.replace(/^\.+/, '').replace(/\.+$/, '').trim()
  }
  if (name.length > DEFAULT_MAX_NAME) name = name.slice(0, DEFAULT_MAX_NAME).trim()
  return name
}

/**
 * Soft: wiki target — if title has bad wiki chars use sanitized basename.
 * @param {string} title
 * @param {string} sanitizedBasename
 */
function wikiTitleFrom(title, sanitizedBasename) {
  const raw = String(title ?? '').trim()
  if (!raw || /[\[\]|#^]/.test(raw)) return sanitizedBasename
  return raw
}

/**
 * Soft resolve active note. Missing → toast error; return null.
 * @returns {Promise<{ path: string, title: string, folder: string } | null>}
 */
async function resolveActive() {
  /** @type {FaNotes.ActiveNote | null} */
  let active = null
  try {
    active = await fanotes.notes.active()
  } catch (error) {
    fanotes.log('notes.active failed', errMessage(error))
    await fanotes.ui.toast(
      t(
        `Aktive Notiz lesen fehlgeschlagen: ${errMessage(error)}`,
        `Could not read active note: ${errMessage(error)}`,
      ),
      'error',
    )
    return null
  }

  if (!active || typeof active.path !== 'string' || !active.path) {
    await fanotes.ui.toast(
      t('Keine aktive Notiz.', 'No active note.'),
      'error',
    )
    return null
  }

  const titleRaw = typeof active.title === 'string' ? active.title.trim() : ''
  const title = titleRaw || basenameNoExt(active.path) || active.path
  const folder = dirnameOf(active.path)
  return { path: active.path, title, folder }
}

/**
 * Soft name: prompt Soft (defaultNameMode prompt); empty cancel Soft.
 * untitled Soft → Untitled / Ohne Titel / Untitled-N.
 * @returns {Promise<string | null>}
 */
async function resolveName() {
  const mode = settings.defaultNameMode

  if (mode === 'untitled') {
    untitledCounter += 1
    const base = t('Ohne Titel', 'Untitled')
    // Soft: first untitled without suffix; later Untitled-N Soft.
    const raw = untitledCounter <= 1 ? base : `${base}-${untitledCounter}`
    return sanitizeName(raw) || `Untitled-${untitledCounter}`
  }

  // prompt (default)
  try {
    const value = await fanotes.ui.prompt(
      t('Name der neuen Notiz:', 'Name for the new note:'),
      {
        title: t('Geschwister-Notiz', 'Sibling Note'),
        placeholder: t('Titel…', 'Title…'),
        value: '',
      },
    )
    if (value == null) return null
    const name = sanitizeName(String(value))
    // Soft: empty after sanitize → cancel Soft.
    if (!name) return null
    return name
  } catch (error) {
    await fanotes.ui.toast(
      t(`Prompt fehlgeschlagen: ${errMessage(error)}`, `Prompt failed: ${errMessage(error)}`),
      'error',
    )
    return null
  }
}

/**
 * Soft stubContent: `# Title\n\n` else empty string.
 * @param {string} title
 */
function contentFor(title) {
  if (settings.stubContent === true) return `# ${title}\n\n`
  return ''
}

/**
 * Soft insertLink: when true and editor open → editor.insert(`[[title]] `)
 * else skip (kein editor force). No editor permission in manifest Soft —
 * try/catch skip Soft.
 * @param {string} wikiTitle
 * @param {boolean} [forceInsert]
 * @returns {Promise<'ok' | 'skip' | 'fail'>}
 */
async function maybeInsertLink(wikiTitle, forceInsert) {
  if (!forceInsert && settings.insertLink !== true) return 'skip'
  const text = `[[${wikiTitle}]] `
  try {
    // Soft: no editor permission in manifest — Soft-try insert Soft;
    // kein editor force. Missing editor / E_PERMISSION → fail Soft (caller toast).
    const ok = await fanotes.editor.insert(text, 'cursor')
    if (ok) return 'ok'
    return 'fail'
  } catch (error) {
    fanotes.log('editor.insert Soft skip', errMessage(error))
    return 'fail'
  }
}

/**
 * Core create flow.
 * Soft: forceInsert overrides insertLink Soft for create-link command.
 * Soft: forceOpen overrides openAfter Soft when true.
 * @param {{ forceInsert?: boolean, forceOpen?: boolean }} [opts]
 */
async function runCreate(opts) {
  const forceInsert = Boolean(opts && opts.forceInsert)
  const forceOpen = Boolean(opts && opts.forceOpen)

  try {
    const active = await resolveActive()
    if (!active) return false

    const folder = active.folder // '' = vault root Soft

    const name = await resolveName()
    if (name == null) return false

    const content = contentFor(name)
    /** @type {{ folder?: string, name: string, content: string }} */
    const createOpts = { name, content }
    if (folder) createOpts.folder = folder

    let newPath = ''
    try {
      newPath = await fanotes.notes.create(createOpts)
    } catch (error) {
      // Soft ohne vault:write — create Fail → toast Ordner.
      const folderLabel = folder || t('(Vault-Wurzel)', '(vault root)')
      await fanotes.ui.toast(
        t(
          `Notiz konnte nicht angelegt werden: ${errMessage(error)}. Bitte Ordner „${folderLabel}“ manuell anlegen (kein vault:write) und erneut versuchen.`,
          `Could not create note: ${errMessage(error)}. Please create folder "${folderLabel}" manually (no vault:write) and try again.`,
        ),
        'error',
      )
      return false
    }

    const basename = basenameNoExt(newPath) || name
    const wiki = wikiTitleFrom(name, basename)

    // Soft insertLink: insert into CURRENT editor (active note) before optional open.
    const insertResult = await maybeInsertLink(wiki, forceInsert)

    if (insertResult === 'fail') {
      await fanotes.ui.toast(
        t(
          'Notiz angelegt, aber Wikilink konnte nicht eingefügt werden (kein Editor).',
          'Note created, but wikilink could not be inserted (no editor).',
        ),
        'info',
      )
    }

    await fanotes.ui.toast(
      t(`Geschwister-Notiz angelegt: ${newPath}`, `Sibling note created: ${newPath}`),
      'success',
    )

    const shouldOpen = forceOpen || settings.openAfter === true
    if (shouldOpen && newPath) {
      try {
        await fanotes.notes.open(newPath)
      } catch (error) {
        await fanotes.ui.toast(
          t(`Öffnen fehlgeschlagen: ${errMessage(error)}`, `Open failed: ${errMessage(error)}`),
          'error',
        )
      }
    }

    await refreshPanel()
    return true
  } catch (error) {
    await fanotes.ui.toast(
      t(
        `Geschwister-Notiz fehlgeschlagen: ${errMessage(error)}`,
        `Sibling note failed: ${errMessage(error)}`,
      ),
      'error',
    )
    return false
  }
}

/**
 * Apply panel values into settings Soft.
 * @param {Record<string, unknown>} values
 */
async function applyPanelValues(values) {
  if (!values || typeof values !== 'object') return true
  const prev = cloneSettings()

  if (values.openAfter !== undefined) {
    settings.openAfter = values.openAfter === true || values.openAfter === 'true'
  }
  if (values.insertLink !== undefined) {
    settings.insertLink = values.insertLink === true || values.insertLink === 'true'
  }
  if (values.stubContent !== undefined) {
    settings.stubContent = values.stubContent === true || values.stubContent === 'true'
  }
  if (values.defaultNameMode != null) {
    settings.defaultNameMode = normalizeNameMode(values.defaultNameMode)
  }

  const ok = await persistSettings(prev)
  if (!ok) return false
  return true
}

function renderBlocks() {
  /** @type {FaNotes.Block[]} */
  return [
    { type: 'heading', text: t('Geschwister-Notiz', 'Sibling Note'), level: 2 },
    {
      type: 'text',
      muted: true,
      text: t(
        'Legt eine neue Notiz im selben Ordner wie die aktive an. Optional Wikilink in den Editor einfügen.',
        'Creates a new note in the same folder as the active one. Optionally insert a wikilink into the editor.',
      ),
    },
    {
      type: 'checkbox',
      id: 'openAfter',
      label: t('Notiz danach öffnen', 'Open note afterwards'),
      checked: settings.openAfter === true,
    },
    {
      type: 'checkbox',
      id: 'insertLink',
      label: t('Wikilink in Editor einfügen', 'Insert wikilink into editor'),
      checked: settings.insertLink === true,
    },
    {
      type: 'checkbox',
      id: 'stubContent',
      label: t('Stub-Inhalt (# Titel)', 'Stub content (# Title)'),
      checked: settings.stubContent === true,
    },
    {
      type: 'select',
      id: 'defaultNameMode',
      label: t('Namensmodus', 'Name mode'),
      value: settings.defaultNameMode,
      options: [
        { value: 'prompt', label: t('Prompt (nachfragen)', 'Prompt (ask)') },
        { value: 'untitled', label: t('Ohne Titel / Untitled', 'Untitled') },
      ],
    },
    {
      type: 'text',
      muted: true,
      text: t(
        'Kein vault:write – fehlenden Ordner bitte manuell anlegen. Create-Fehler → Toast „Ordner“.',
        'No vault:write – please create missing folders manually. Create failure → toast about the folder.',
      ),
    },
    {
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'create',
          label: t('Neue Geschwister-Notiz', 'New sibling note'),
          primary: true,
        },
      ],
    },
  ]
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Geschwister-Notiz', 'Sibling Note'))
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
      void refreshPanel()
      return
    }

    panel = fanotes.ui.panel({
      id: PANEL_ID,
      title: t('Geschwister-Notiz', 'Sibling Note'),
      icon: '📄',
      blocks: renderBlocks(),
      focus: true,
    })

    panel.onAction(async (action) => {
      try {
        const values = action.values || {}
        if (action.id === 'create') {
          const ok = await applyPanelValues(values)
          if (!ok) {
            await refreshPanel()
            return
          }
          await runCreate()
          return
        }
        if (action.id === 'submit:defaultNameMode') {
          const ok = await applyPanelValues(values)
          if (!ok) {
            await refreshPanel()
            return
          }
          await fanotes.ui.toast(t('Einstellungen gespeichert.', 'Settings saved.'), 'success')
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
        if (input.id === 'openAfter') {
          const prev = cloneSettings()
          settings.openAfter = input.value === true
          const ok = await persistSettings(prev)
          if (!ok) {
            await refreshPanel()
            return
          }
          await refreshPanel()
          return
        }
        if (input.id === 'insertLink') {
          const prev = cloneSettings()
          settings.insertLink = input.value === true
          const ok = await persistSettings(prev)
          if (!ok) {
            await refreshPanel()
            return
          }
          await refreshPanel()
          return
        }
        if (input.id === 'stubContent') {
          const prev = cloneSettings()
          settings.stubContent = input.value === true
          const ok = await persistSettings(prev)
          if (!ok) {
            await refreshPanel()
            return
          }
          await refreshPanel()
          return
        }
        if (input.id === 'defaultNameMode') {
          const prev = cloneSettings()
          settings.defaultNameMode = normalizeNameMode(input.value)
          const ok = await persistSettings(prev)
          if (!ok) {
            await refreshPanel()
            return
          }
          await refreshPanel()
        }
      } catch (error) {
        fanotes.log('onInput failed', errMessage(error))
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
  id: 'create',
  title: t('Geschwister-Notiz anlegen', 'Create sibling note'),
  detail: t(
    'Neue Notiz im Ordner der aktiven Notiz',
    'New note in the folder of the active note',
  ),
  keywords: 'sibling geschwister note notiz create folder ordner same',
  run: async () => {
    try {
      await runCreate()
    } catch (error) {
      await fanotes.ui.toast(
        t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`),
        'error',
      )
    }
  },
})

fanotes.commands.register({
  id: 'create-link',
  title: t('Geschwister-Notiz mit Wikilink', 'Sibling note with wikilink'),
  detail: t(
    'Anlegen und [[Titel]] in den Editor einfügen',
    'Create and insert [[title]] into the editor',
  ),
  keywords: 'sibling geschwister wikilink link create notiz note',
  run: async () => {
    try {
      await runCreate({ forceInsert: true })
    } catch (error) {
      await fanotes.ui.toast(
        t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`),
        'error',
      )
    }
  },
})

fanotes.commands.register({
  id: 'open-settings',
  title: t('Geschwister-Notiz-Einstellungen öffnen', 'Open Sibling Note settings'),
  detail: t(
    'Panel mit Optionen und Create-Button',
    'Panel with options and create button',
  ),
  keywords: 'sibling geschwister settings einstellungen panel',
  run: () => {
    try {
      openPanel()
    } catch (error) {
      void fanotes.ui.toast(
        t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`),
        'error',
      )
    }
  },
})

// --- Lifecycle --------------------------------------------------------------

fanotes.onActivate(async () => {
  try {
    await loadSettings()
    fanotes.log(
      'sibling-note activated',
      fanotes.app.appVersion,
      fanotes.app.language,
      settings.defaultNameMode,
      settings.openAfter,
      settings.insertLink,
    )
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(() => {
  panel = null
})
