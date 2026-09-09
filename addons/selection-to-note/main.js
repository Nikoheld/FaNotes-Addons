/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Auswahl → Notiz / Selection to Note – create a new note from the editor
// selection and optionally replace it with a wikilink.
// Abgrenzung: note-splitter=ganze Notiz an Headings; quote-collector=Zitate sammeln;
// scratchpad=kein Vault; hier=Extrakt→neue Notiz.
// Active editor only. No vault:write / network / clipboard. Activate = load settings only.

const SETTINGS_KEY = 'settings'
const PANEL_ID = 'extract'
const DEFAULT_MAX_TITLE = 80

/** @typedef {'prompt' | 'first-line' | 'heading'} TitleFrom */

/**
 * @typedef {{
 *   folder: string,
 *   replaceWithLink: boolean,
 *   titleFrom: TitleFrom,
 *   maxTitle: number,
 *   openAfter: boolean,
 * }} Settings
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  folder: '',
  replaceWithLink: true,
  titleFrom: 'prompt',
  maxTitle: DEFAULT_MAX_TITLE,
  openAfter: false,
}

/** @type {Settings} */
let settings = { ...DEFAULT_SETTINGS }

/** @type {FaNotes.Panel | null} */
let panel = null

/** Soft: counter for Extract-N fallback within the session. */
let extractCounter = 0

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
 * Normalize vault-relative folder. Empty string = vault root (allowed).
 * Rejects `..`. Returns null if invalid.
 * Soft: mirror note-splitter normalizeFolderAllowEmpty.
 * @param {string} raw
 * @returns {string | null}
 */
function normalizeFolderAllowEmpty(raw) {
  let folder = String(raw ?? '').trim().replace(/\\/g, '/')
  while (folder.startsWith('/')) folder = folder.slice(1)
  while (folder.endsWith('/')) folder = folder.slice(0, -1)
  if (!folder) return ''
  const parts = folder.split('/').filter(Boolean)
  if (parts.some((p) => p === '.' || p === '..')) return null
  return parts.join('/')
}

/**
 * @param {unknown} raw
 * @returns {TitleFrom}
 */
function normalizeTitleFrom(raw) {
  const s = String(raw ?? '').trim()
  if (s === 'first-line' || s === 'heading' || s === 'prompt') return s
  return DEFAULT_SETTINGS.titleFrom
}

/**
 * @param {unknown} raw
 * @returns {Settings}
 */
function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const obj = /** @type {Record<string, unknown>} */ (raw)

  let folder = typeof obj.folder === 'string' ? obj.folder : ''
  const norm = normalizeFolderAllowEmpty(folder)
  folder = norm === null ? '' : norm

  let maxTitle = Number(obj.maxTitle)
  if (!Number.isFinite(maxTitle) || maxTitle < 1) maxTitle = DEFAULT_MAX_TITLE
  maxTitle = Math.min(200, Math.max(1, Math.floor(maxTitle)))

  return {
    folder,
    replaceWithLink: obj.replaceWithLink !== false,
    titleFrom: normalizeTitleFrom(obj.titleFrom),
    maxTitle,
    openAfter: obj.openAfter === true,
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

async function saveSettings() {
  try {
    await fanotes.storage.set(SETTINGS_KEY, {
      folder: settings.folder,
      replaceWithLink: settings.replaceWithLink === true,
      titleFrom: settings.titleFrom,
      maxTitle: settings.maxTitle,
      openAfter: settings.openAfter === true,
    })
    return true
  } catch (error) {
    await fanotes.ui.toast(
      t(`Speichern fehlgeschlagen: ${errMessage(error)}`, `Save failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

/**
 * Sanitize a note file name (no extension). Soft from note-splitter:
 * strip unsafe chars, max maxTitle, strip leading/trailing dots, fallback Extract-N.
 * @param {string} title
 * @param {number} [index1]
 */
function sanitizeName(title, index1) {
  let name = String(title ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  // Soft: also strip leading/trailing dots (awkward on some FS).
  while (name.startsWith('.') || name.endsWith('.')) {
    name = name.replace(/^\.+/, '').replace(/\.+$/, '').trim()
  }
  const max = settings.maxTitle || DEFAULT_MAX_TITLE
  if (name.length > max) name = name.slice(0, max).trim()
  if (!name) {
    const n = index1 != null && Number.isFinite(index1) ? index1 : ++extractCounter || 1
    name = `Extract-${n}`
  }
  return name
}

/**
 * Soft: first non-empty line for title defaults; else first line.
 * @param {string} text
 */
function firstLineRaw(text) {
  const normalised = String(text ?? '').replace(/\r\n|\r/g, '\n')
  const lines = normalised.split('\n')
  for (const line of lines) {
    if (line.trim()) return line.trim()
  }
  return (lines[0] || '').trim()
}

/**
 * Soft: strip leading #+ and whitespace (heading mode).
 * @param {string} text
 */
function headingCandidate(text) {
  return firstLineRaw(text).replace(/^#{1,6}\s+/, '').trim()
}

/**
 * Soft: wiki target — if title has bad wiki chars use sanitized basename.
 * Bad: [, ], |, #, ^ (Obsidian wikilink specials).
 * @param {string} title
 * @param {string} sanitizedBasename
 */
function wikiTitleFrom(title, sanitizedBasename) {
  const raw = String(title ?? '').trim()
  if (!raw || /[\[\]|#^]/.test(raw)) return sanitizedBasename
  return raw
}

/**
 * Basename without .md for wikilink Soft.
 * @param {string} path
 */
function basenameNoExt(path) {
  const p = String(path ?? '').replace(/\\/g, '/')
  const base = p.includes('/') ? p.slice(p.lastIndexOf('/') + 1) : p
  return base.replace(/\.md$/i, '')
}

/**
 * Resolve title from selection text according to titleFrom.
 * Soft: prompt cancel → null (abort).
 * @param {string} selText
 * @returns {Promise<string | null>}
 */
async function resolveTitle(selText) {
  const mode = settings.titleFrom
  if (mode === 'first-line') {
    return sanitizeName(firstLineRaw(selText))
  }
  if (mode === 'heading') {
    return sanitizeName(headingCandidate(selText))
  }
  // prompt (default)
  const defaultValue = sanitizeName(firstLineRaw(selText))
  try {
    const value = await fanotes.ui.prompt(
      t('Titel der neuen Notiz:', 'Title for the new note:'),
      {
        title: t('Auswahl → Notiz', 'Selection to Note'),
        placeholder: t('Titel…', 'Title…'),
        value: defaultValue,
      },
    )
    if (value == null) return null
    return sanitizeName(String(value))
  } catch (error) {
    await fanotes.ui.toast(
      t(`Prompt fehlgeschlagen: ${errMessage(error)}`, `Prompt failed: ${errMessage(error)}`),
      'error',
    )
    return null
  }
}

/**
 * Core extract flow.
 * Soft: forceOpen overrides openAfter for extract-open command.
 * @param {{ forceOpen?: boolean }} [opts]
 */
async function runExtract(opts) {
  const forceOpen = Boolean(opts && opts.forceOpen)
  try {
    /** @type {FaNotes.Selection | null} */
    let sel = null
    try {
      sel = await fanotes.editor.getSelection()
    } catch (error) {
      await fanotes.ui.toast(
        t(
          `Auswahl nicht lesbar: ${errMessage(error)}`,
          `Could not read selection: ${errMessage(error)}`,
        ),
        'error',
      )
      return false
    }

    // Soft: mirror callout-inserter / line-tools — need real selection text.
    const selText = sel && typeof sel.text === 'string' ? sel.text : ''
    if (!selText.trim() || !sel || sel.from === sel.to) {
      await fanotes.ui.toast(
        t('Keine Textauswahl – nichts extrahiert.', 'No text selection – nothing extracted.'),
        'info',
      )
      return false
    }

    const folderNorm = normalizeFolderAllowEmpty(settings.folder)
    if (folderNorm === null) {
      await fanotes.ui.toast(
        t(
          'Ungültiger Ordnerpfad (kein „..“ erlaubt).',
          'Invalid folder path (".." is not allowed).',
        ),
        'error',
      )
      return false
    }

    const title = await resolveTitle(selText)
    if (title == null) return false

    const content = `${selText}\n`
    /** @type {{ folder?: string, name: string, content: string }} */
    const createOpts = { name: title, content }
    if (folderNorm) createOpts.folder = folderNorm

    let newPath = ''
    try {
      newPath = await fanotes.notes.create(createOpts)
    } catch (error) {
      // Soft from append-to-daily: no vault:write — ask user to create folder manually.
      const folderLabel = folderNorm || t('(Vault-Wurzel)', '(vault root)')
      await fanotes.ui.toast(
        t(
          `Notiz konnte nicht angelegt werden: ${errMessage(error)}. Bitte Ordner „${folderLabel}“ manuell anlegen (kein vault:write) und erneut versuchen.`,
          `Could not create note: ${errMessage(error)}. Please create folder "${folderLabel}" manually (no vault:write) and try again.`,
        ),
        'error',
      )
      return false
    }

    if (settings.replaceWithLink) {
      const basename = basenameNoExt(newPath) || title
      const wiki = wikiTitleFrom(title, basename)
      try {
        const ok = await fanotes.editor.replaceSelection(`[[${wiki}]]`)
        if (!ok) {
          // Soft: note exists; link replace failed (editor lost) — still success for create.
          await fanotes.ui.toast(
            t(
              'Notiz angelegt, aber Wikilink konnte nicht eingefügt werden (kein Editor).',
              'Note created, but wikilink could not be inserted (no editor).',
            ),
            'info',
          )
        }
      } catch (error) {
        fanotes.log('replaceSelection failed', errMessage(error))
        await fanotes.ui.toast(
          t(
            `Notiz angelegt, Wikilink fehlgeschlagen: ${errMessage(error)}`,
            `Note created, wikilink failed: ${errMessage(error)}`,
          ),
          'info',
        )
      }
    }

    await fanotes.ui.toast(
      t(`Notiz angelegt: ${newPath}`, `Note created: ${newPath}`),
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
      t(`Extrahieren fehlgeschlagen: ${errMessage(error)}`, `Extract failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

/**
 * Apply panel values into settings before extract.
 * @param {Record<string, unknown>} values
 */
async function applyPanelValues(values) {
  if (!values || typeof values !== 'object') return true
  const prev = { ...settings }

  if (values.folder != null) {
    const next = normalizeFolderAllowEmpty(String(values.folder))
    if (next === null) {
      await fanotes.ui.toast(
        t(
          'Ungültiger Ordnerpfad (kein „..“ erlaubt).',
          'Invalid folder path (".." is not allowed).',
        ),
        'error',
      )
      return false
    }
    settings.folder = next
  }

  if (values.replaceWithLink !== undefined) {
    settings.replaceWithLink =
      values.replaceWithLink === true || values.replaceWithLink === 'true'
  }

  if (values.titleFrom != null) {
    settings.titleFrom = normalizeTitleFrom(values.titleFrom)
  }

  if (values.openAfter !== undefined) {
    settings.openAfter = values.openAfter === true || values.openAfter === 'true'
  }

  const ok = await saveSettings()
  if (!ok) {
    settings = prev
    return false
  }
  return true
}

function renderBlocks() {
  /** @type {FaNotes.Block[]} */
  return [
    { type: 'heading', text: t('Auswahl → Notiz', 'Selection to Note'), level: 2 },
    {
      type: 'text',
      muted: true,
      text: t(
        'Erstellt aus der Editor-Auswahl eine neue Notiz und ersetzt sie optional durch einen Wikilink.',
        'Creates a new note from the editor selection and optionally replaces it with a wikilink.',
      ),
    },
    {
      type: 'input',
      id: 'folder',
      label: t('Ordner (leer = Vault-Wurzel)', 'Folder (empty = vault root)'),
      value: settings.folder,
      placeholder: t('z. B. Extrakte', 'e.g. Extracts'),
    },
    {
      type: 'checkbox',
      id: 'replaceWithLink',
      label: t('Auswahl durch Wikilink ersetzen', 'Replace selection with wikilink'),
      checked: settings.replaceWithLink === true,
    },
    {
      type: 'select',
      id: 'titleFrom',
      label: t('Titel aus', 'Title from'),
      value: settings.titleFrom,
      options: [
        { value: 'prompt', label: t('Prompt (nachfragen)', 'Prompt (ask)') },
        { value: 'first-line', label: t('Erste Zeile', 'First line') },
        { value: 'heading', label: t('Überschrift (# …)', 'Heading (# …)') },
      ],
    },
    {
      type: 'checkbox',
      id: 'openAfter',
      label: t('Notiz danach öffnen', 'Open note afterwards'),
      checked: settings.openAfter === true,
    },
    {
      type: 'text',
      muted: true,
      text: t(
        'Kein vault:write – fehlenden Ordner bitte manuell anlegen. Create-Fehler → Toast „Ordner manuell“.',
        'No vault:write – please create missing folders manually. Create failure → toast to create the folder by hand.',
      ),
    },
    {
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'extract',
          label: t('Extrahieren', 'Extract'),
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
    await panel.setTitle(t('Auswahl → Notiz', 'Selection to Note'))
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
      title: t('Auswahl → Notiz', 'Selection to Note'),
      icon: '📄',
      blocks: renderBlocks(),
      focus: true,
    })

    panel.onAction(async (action) => {
      try {
        const values = action.values || {}
        if (action.id === 'extract') {
          const ok = await applyPanelValues(values)
          if (!ok) {
            await refreshPanel()
            return
          }
          await runExtract()
          return
        }
        if (
          action.id === 'submit:folder' ||
          action.id === 'submit:titleFrom'
        ) {
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
        if (input.id === 'folder') {
          const prev = settings.folder
          const next = normalizeFolderAllowEmpty(String(input.value ?? ''))
          if (next === null) {
            await fanotes.ui.toast(
              t(
                'Ungültiger Ordnerpfad (kein „..“ erlaubt).',
                'Invalid folder path (".." is not allowed).',
              ),
              'error',
            )
            await refreshPanel()
            return
          }
          settings.folder = next
          const ok = await saveSettings()
          if (!ok) {
            settings.folder = prev
            await refreshPanel()
            return
          }
          await refreshPanel()
          return
        }
        if (input.id === 'replaceWithLink') {
          const prev = settings.replaceWithLink
          settings.replaceWithLink = input.value === true
          const ok = await saveSettings()
          if (!ok) {
            settings.replaceWithLink = prev
            await refreshPanel()
            return
          }
          await refreshPanel()
          return
        }
        if (input.id === 'titleFrom') {
          const prev = settings.titleFrom
          settings.titleFrom = normalizeTitleFrom(input.value)
          const ok = await saveSettings()
          if (!ok) {
            settings.titleFrom = prev
            await refreshPanel()
            return
          }
          await refreshPanel()
          return
        }
        if (input.id === 'openAfter') {
          // Soft: persist openAfter from panel checkbox.
          const prev = settings.openAfter
          settings.openAfter = input.value === true
          const ok = await saveSettings()
          if (!ok) {
            settings.openAfter = prev
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
  id: 'extract',
  title: t('Auswahl → Notiz', 'Selection to Note'),
  detail: t(
    'Auswahl als neue Notiz extrahieren (optional Wikilink)',
    'Extract selection as a new note (optional wikilink)',
  ),
  keywords: 'extract extrahieren selection auswahl wikilink note notiz',
  run: async () => {
    try {
      await runExtract()
    } catch (error) {
      await fanotes.ui.toast(
        t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`),
        'error',
      )
    }
  },
})

fanotes.commands.register({
  id: 'extract-open',
  title: t('Auswahl → Notiz und öffnen', 'Selection to Note and open'),
  detail: t(
    'Extrahieren und neue Notiz danach öffnen',
    'Extract and open the new note afterwards',
  ),
  keywords: 'extract open öffnen extrahieren selection auswahl',
  run: async () => {
    try {
      await runExtract({ forceOpen: true })
    } catch (error) {
      await fanotes.ui.toast(
        t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`),
        'error',
      )
    }
  },
})

fanotes.commands.register({
  id: 'open',
  title: t('Auswahl → Notiz öffnen', 'Open Selection to Note'),
  detail: t(
    'Panel mit Ordner, Titelquelle und Optionen',
    'Panel with folder, title source, and options',
  ),
  keywords: 'panel open öffnen settings extract',
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

fanotes.commands.register({
  id: 'open-settings',
  title: t('Auswahl→Notiz-Einstellungen öffnen', 'Open Selection to Note settings'),
  detail: t('Gleiches Panel wie „öffnen“', 'Same panel as open'),
  keywords: 'settings panel einstellungen',
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
      'selection-to-note activated',
      fanotes.app.appVersion,
      fanotes.app.language,
      settings.titleFrom,
      settings.replaceWithLink,
    )
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(() => {
  panel = null
})
