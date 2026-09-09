/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Wikilink-Umbruch / Wikilink Wrap – wrap the editor selection as [[wikilink]]
// and optionally create a missing note. Soft: no vault:write / network / clipboard.
// Abgrenzung: unlinked-mentions=finden; selection-to-note=Extrakt neue Notiz;
// wikilink-map=Graph; hier=Micro-Wrap der Selection.
// Active editor only. Activate = load settings only. No auto-rename.

const SETTINGS_KEY = 'settings'
const PANEL_ID = 'wrap'
const NAME_MAX = 80

/** @typedef {'none' | 'selection-as-alias'} AliasMode */

/**
 * @typedef {{
 *   createIfMissing: boolean,
 *   folder: string,
 *   aliasMode: AliasMode,
 * }} Settings
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  createIfMissing: false,
  folder: '',
  aliasMode: 'none',
}

/** @type {Settings} */
let settings = { ...DEFAULT_SETTINGS }

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

/**
 * Normalize vault-relative folder. Empty string = vault root (allowed).
 * Rejects `..`. Returns null if invalid.
 * Soft: mirror selection-to-note / note-splitter normalizeFolderAllowEmpty.
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
 * Soft: aliasMode enum.
 * @param {unknown} raw
 * @returns {AliasMode}
 */
function normalizeAliasMode(raw) {
  const s = String(raw ?? '').trim()
  if (s === 'selection-as-alias' || s === 'none') return s
  return DEFAULT_SETTINGS.aliasMode
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

  return {
    createIfMissing: obj.createIfMissing === true,
    folder,
    aliasMode: normalizeAliasMode(obj.aliasMode),
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
 * Soft: returns false on failure after toast.
 * @param {Settings} [rollback]
 * @returns {Promise<boolean>}
 */
async function saveSettings(rollback) {
  try {
    await fanotes.storage.set(SETTINGS_KEY, {
      createIfMissing: settings.createIfMissing === true,
      folder: settings.folder,
      aliasMode: settings.aliasMode,
    })
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
 * Sanitize a note file name (no extension). Soft from note-splitter / selection-to-note:
 * strip unsafe chars, max NAME_MAX, strip leading/trailing dots, empty → `Link`.
 * Soft: no auto-rename of existing vault notes — sanitize is for create path only.
 * @param {string} title
 */
function sanitizeName(title) {
  let name = String(title ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  // Soft: also strip leading/trailing dots (awkward on some FS).
  while (name.startsWith('.') || name.endsWith('.')) {
    name = name.replace(/^\.+/, '').replace(/\.+$/, '').trim()
  }
  if (name.length > NAME_MAX) name = name.slice(0, NAME_MAX).trim()
  if (!name) name = 'Link'
  return name
}

/**
 * Soft: selection already looks like a wikilink — starts with [[ and ends with ]].
 * @param {string} text
 */
function looksLikeWikilink(text) {
  const s = String(text ?? '').trim()
  return s.startsWith('[[') && s.endsWith(']]')
}

/**
 * Soft resolve vault-relative path for createIfMissing exists-check.
 * @param {string} folderNorm
 * @param {string} sanitized
 */
function resolveCreatePath(folderNorm, sanitized) {
  return folderNorm ? `${folderNorm}/${sanitized}.md` : `${sanitized}.md`
}

/**
 * Core wrap flow.
 * Soft overrides (per call only, do not mutate persisted settings):
 *   forceAlias → aliasMode selection-as-alias for this call
 *   forceCreate → createIfMissing true for this call
 * @param {{ forceAlias?: boolean, forceCreate?: boolean }} [opts]
 */
async function runWrap(opts) {
  const forceAlias = Boolean(opts && opts.forceAlias)
  const forceCreate = Boolean(opts && opts.forceCreate)

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

    // Soft: need real non-whitespace selection text (active editor only).
    const selRaw = sel && typeof sel.text === 'string' ? sel.text : ''
    if (!selRaw.trim() || !sel || sel.from === sel.to) {
      await fanotes.ui.toast(
        t('Bitte Text markieren', 'Please select text'),
        'info',
      )
      return false
    }

    const target = selRaw.trim()
    if (looksLikeWikilink(target)) {
      await fanotes.ui.toast(
        t(
          'Auswahl ist bereits ein Wikilink – nichts geändert.',
          'Selection is already a wikilink – nothing changed.',
        ),
        'info',
      )
      return false
    }

    const aliasMode = forceAlias ? 'selection-as-alias' : settings.aliasMode
    const createIfMissing = forceCreate || settings.createIfMissing === true

    /** @type {string} */
    let out
    /** @type {string} */
    let linkTarget

    if (aliasMode === 'selection-as-alias') {
      // Soft: prompt for title; default = trimmed selection; display alias = original selRaw.
      let title = ''
      try {
        const value = await fanotes.ui.prompt(
          t('Titel / Linkziel:', 'Title / link target:'),
          {
            title: t('Wikilink mit Alias', 'Wikilink with alias'),
            placeholder: t('Notiz-Titel…', 'Note title…'),
            value: target,
          },
        )
        if (value == null) return false
        title = String(value).trim()
      } catch (error) {
        await fanotes.ui.toast(
          t(`Prompt fehlgeschlagen: ${errMessage(error)}`, `Prompt failed: ${errMessage(error)}`),
          'error',
        )
        return false
      }
      if (!title) {
        await fanotes.ui.toast(
          t('Titel darf nicht leer sein.', 'Title must not be empty.'),
          'info',
        )
        return false
      }
      // Soft: original sel display for alias part (spec: use original sel display).
      out = `[[${title}|${selRaw}]]`
      linkTarget = title
    } else {
      out = `[[${target}]]`
      linkTarget = target
    }

    try {
      const ok = await fanotes.editor.replaceSelection(out)
      if (!ok) {
        await fanotes.ui.toast(
          t('Kein Markdown-Editor geöffnet.', 'No Markdown editor is open.'),
          'error',
        )
        return false
      }
    } catch (error) {
      await fanotes.ui.toast(
        t(`Ersetzen fehlgeschlagen: ${errMessage(error)}`, `Replace failed: ${errMessage(error)}`),
        'error',
      )
      return false
    }

    await fanotes.ui.toast(
      t('Auswahl als Wikilink umhüllt.', 'Selection wrapped as wikilink.'),
      'success',
    )

    if (createIfMissing) {
      await maybeCreateMissing(linkTarget)
    }

    await refreshPanel()
    return true
  } catch (error) {
    await fanotes.ui.toast(
      t(`Umhüllen fehlgeschlagen: ${errMessage(error)}`, `Wrap failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

/**
 * Soft createIfMissing: resolve Soft path, exists-check, confirm, notes.create.
 * Soft: no vault:write — create fail → toast Ordner manuell.
 * Soft: no auto-rename if note already exists — skip create quietly.
 * @param {string} linkTarget
 */
async function maybeCreateMissing(linkTarget) {
  const folderNorm = normalizeFolderAllowEmpty(settings.folder)
  if (folderNorm === null) {
    await fanotes.ui.toast(
      t(
        'Ungültiger Ordnerpfad (kein „..“ erlaubt).',
        'Invalid folder path (".." is not allowed).',
      ),
      'error',
    )
    return
  }

  const sanitized = sanitizeName(linkTarget)
  const path = resolveCreatePath(folderNorm, sanitized)

  let exists = false
  try {
    exists = await fanotes.notes.exists(path)
  } catch (error) {
    await fanotes.ui.toast(
      t(
        `Existenzprüfung fehlgeschlagen: ${errMessage(error)}`,
        `Existence check failed: ${errMessage(error)}`,
      ),
      'error',
    )
    return
  }

  if (exists) {
    // Soft: note already present — no create, no auto-rename.
    fanotes.log('createIfMissing skipped, exists', path)
    return
  }

  const folderLabel = folderNorm || t('(Vault-Wurzel)', '(vault root)')
  let confirmed = false
  try {
    confirmed = await fanotes.ui.confirm(
      t(
        `Notiz „${path}“ fehlt. Anlegen?`,
        `Note “${path}” is missing. Create it?`,
      ),
      {
        title: t('Fehlende Notiz anlegen?', 'Create missing note?'),
        confirmLabel: t('Anlegen', 'Create'),
      },
    )
  } catch (error) {
    await fanotes.ui.toast(
      t(`Bestätigung fehlgeschlagen: ${errMessage(error)}`, `Confirm failed: ${errMessage(error)}`),
      'error',
    )
    return
  }
  if (!confirmed) return

  /** @type {{ folder?: string, name: string, content: string }} */
  const createOpts = {
    name: sanitized,
    content: `# ${linkTarget}\n`,
  }
  if (folderNorm) createOpts.folder = folderNorm

  try {
    const created = await fanotes.notes.create(createOpts)
    await fanotes.ui.toast(
      t(`Notiz angelegt: ${created}`, `Note created: ${created}`),
      'success',
    )
  } catch (error) {
    // Soft: no vault:write — ask user to create folder manually.
    await fanotes.ui.toast(
      t(
        `Notiz konnte nicht angelegt werden: ${errMessage(error)}. Bitte Ordner „${folderLabel}“ manuell anlegen (kein vault:write) und erneut versuchen.`,
        `Could not create note: ${errMessage(error)}. Please create folder "${folderLabel}" manually (no vault:write) and try again.`,
      ),
      'error',
    )
  }
}

/**
 * Apply panel values into settings before wrap.
 * Soft: invalid folder → toast + false (no persist).
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

  if (values.createIfMissing !== undefined) {
    settings.createIfMissing =
      values.createIfMissing === true || values.createIfMissing === 'true'
  }

  if (values.aliasMode != null) {
    settings.aliasMode = normalizeAliasMode(values.aliasMode)
  }

  const ok = await saveSettings(prev)
  if (!ok) {
    settings = prev
    return false
  }
  return true
}

function renderBlocks() {
  /** @type {FaNotes.Block[]} */
  return [
    { type: 'heading', text: t('Wikilink-Umbruch', 'Wikilink Wrap'), level: 2 },
    {
      type: 'text',
      muted: true,
      text: t(
        'Umhüllt die Editor-Auswahl als [[Wikilink]] und kann fehlende Notizen anlegen.',
        'Wraps the editor selection as a [[wikilink]] and can create missing notes.',
      ),
    },
    {
      type: 'checkbox',
      id: 'createIfMissing',
      label: t('Fehlende Notiz anlegen', 'Create missing note'),
      checked: settings.createIfMissing === true,
    },
    {
      type: 'input',
      id: 'folder',
      label: t('Ordner (leer = Vault-Wurzel)', 'Folder (empty = vault root)'),
      value: settings.folder,
      placeholder: t('z. B. Links', 'e.g. Links'),
    },
    {
      type: 'select',
      id: 'aliasMode',
      label: t('Alias-Modus', 'Alias mode'),
      value: settings.aliasMode,
      options: [
        { value: 'none', label: t('Kein Alias ([[Ziel]])', 'No alias ([[target]])') },
        {
          value: 'selection-as-alias',
          label: t('Auswahl als Alias ([[Titel|Auswahl]])', 'Selection as alias ([[title|selection]])'),
        },
      ],
    },
    {
      type: 'text',
      muted: true,
      text: t(
        'Kein vault:write – fehlenden Ordner bitte manuell anlegen. Kein Auto-Rename.',
        'No vault:write – please create missing folders manually. No auto-rename.',
      ),
    },
    {
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'wrap',
          label: t('Umhüllen', 'Wrap'),
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
    await panel.setTitle(t('Wikilink-Umbruch', 'Wikilink Wrap'))
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
      title: t('Wikilink-Umbruch', 'Wikilink Wrap'),
      icon: '🔗',
      blocks: renderBlocks(),
      focus: true,
    })

    panel.onAction(async (action) => {
      try {
        const values = action.values || {}
        if (action.id === 'wrap') {
          const ok = await applyPanelValues(values)
          if (!ok) {
            await refreshPanel()
            return
          }
          await runWrap()
          return
        }
        if (action.id === 'submit:folder' || action.id === 'submit:aliasMode') {
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
          const ok = await saveSettings({ ...settings, folder: prev })
          if (!ok) {
            settings.folder = prev
            await refreshPanel()
            return
          }
          await refreshPanel()
          return
        }
        if (input.id === 'createIfMissing') {
          const prev = settings.createIfMissing
          settings.createIfMissing = input.value === true
          const ok = await saveSettings({ ...settings, createIfMissing: prev })
          if (!ok) {
            settings.createIfMissing = prev
            await refreshPanel()
            return
          }
          await refreshPanel()
          return
        }
        if (input.id === 'aliasMode') {
          const prev = settings.aliasMode
          settings.aliasMode = normalizeAliasMode(input.value)
          const ok = await saveSettings({ ...settings, aliasMode: prev })
          if (!ok) {
            settings.aliasMode = prev
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
  id: 'wrap',
  title: t('Auswahl als Wikilink umhüllen', 'Wrap selection as wikilink'),
  detail: t(
    'Auswahl mit [[…]] umhüllen (Einstellungen für Alias/Create)',
    'Wrap selection with [[…]] (settings for alias/create)',
  ),
  keywords: 'wrap wikilink link umhüllen verlinken alias',
  run: async () => {
    try {
      await runWrap()
    } catch (error) {
      await fanotes.ui.toast(
        t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`),
        'error',
      )
    }
  },
})

fanotes.commands.register({
  id: 'wrap-alias',
  title: t('Auswahl als Wikilink mit Alias', 'Wrap selection as wikilink with alias'),
  detail: t(
    'Erzwingt Alias-Modus für diesen Aufruf (Titel|Auswahl)',
    'Forces alias mode for this call (title|selection)',
  ),
  keywords: 'wrap alias wikilink verlinken selection',
  run: async () => {
    try {
      await runWrap({ forceAlias: true })
    } catch (error) {
      await fanotes.ui.toast(
        t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`),
        'error',
      )
    }
  },
})

fanotes.commands.register({
  id: 'wrap-create',
  title: t('Wikilink umhüllen und Notiz anlegen', 'Wrap wikilink and create note'),
  detail: t(
    'Erzwingt createIfMissing für diesen Aufruf',
    'Forces createIfMissing for this call',
  ),
  keywords: 'wrap create anlegen wikilink missing notiz',
  run: async () => {
    try {
      await runWrap({ forceCreate: true })
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
  title: t('Wikilink-Umbruch öffnen', 'Open Wikilink Wrap'),
  detail: t(
    'Panel mit createIfMissing, Ordner und Alias-Modus',
    'Panel with createIfMissing, folder, and alias mode',
  ),
  keywords: 'panel open öffnen settings wrap wikilink',
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
  title: t('Wikilink-Umbruch-Einstellungen öffnen', 'Open Wikilink Wrap settings'),
  detail: t('Gleiches Panel wie „öffnen“', 'Same panel as open'),
  keywords: 'settings panel einstellungen wrap',
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
      'wikilink-wrap activated',
      fanotes.app.appVersion,
      fanotes.app.language,
      settings.aliasMode,
      settings.createIfMissing,
    )
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(() => {
  panel = null
})
