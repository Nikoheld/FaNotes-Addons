/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Zeilen verbinden/trennen / Join Split Lines – join selected lines with a
// separator, or split the selection on a literal separator into lines.
// Abgrenzung: line-tools=sort/dedupe/reverse; list-convert=Listen-Prefix;
// hier=Join mit Separator / Split zu Zeilen.
// Soft: no vault/network/notes. Activate = load settings only.
// Mirror Soft: line-tools / list-convert selection patterns; fence-wrap panel Soft.

const STORAGE_KEY = 'settings'
const PANEL_ID = 'js'

/**
 * @typedef {{
 *   separator: string,
 *   splitPat: string,
 *   trimParts: boolean,
 * }} Settings
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  separator: ', ',
  splitPat: ',',
  trimParts: true,
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
 * @param {unknown} raw
 * @returns {Settings}
 */
function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const obj = /** @type {Record<string, unknown>} */ (raw)
  return {
    separator: typeof obj.separator === 'string' ? obj.separator : DEFAULT_SETTINGS.separator,
    splitPat: typeof obj.splitPat === 'string' ? obj.splitPat : DEFAULT_SETTINGS.splitPat,
    trimParts: obj.trimParts !== false,
  }
}

async function loadSettings() {
  try {
    const raw = await fanotes.storage.get(STORAGE_KEY)
    settings = normalizeSettings(raw)
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
    await fanotes.storage.set(STORAGE_KEY, {
      separator: settings.separator,
      splitPat: settings.splitPat,
      trimParts: settings.trimParts === true,
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
 * Soft: getSelection; empty/whitespace → toast info; read failure → toast error.
 * Mirrors line-tools / list-convert selection Soft.
 * @returns {Promise<string | null>}
 */
async function getSelectionText() {
  try {
    const sel = await fanotes.editor.getSelection()
    if (!sel || typeof sel.text !== 'string' || !sel.text.trim()) {
      await fanotes.ui.toast(
        t('Bitte Text markieren', 'Please select text'),
        'info',
      )
      return null
    }
    return sel.text
  } catch (error) {
    await fanotes.ui.toast(
      t(`Auswahl lesen fehlgeschlagen: ${errMessage(error)}`, `Could not read selection: ${errMessage(error)}`),
      'error',
    )
    return null
  }
}

/**
 * Replace selection Soft; toast kein Editor / replace failure.
 * @param {string} text
 * @param {string} successMsg
 * @returns {Promise<boolean>}
 */
async function applyReplace(text, successMsg) {
  try {
    const ok = await fanotes.editor.replaceSelection(text)
    if (!ok) {
      await fanotes.ui.toast(
        t('Kein Markdown-Editor geöffnet.', 'No Markdown editor is open.'),
        'error',
      )
      return false
    }
    await fanotes.ui.toast(successMsg, 'success')
    return true
  } catch (error) {
    await fanotes.ui.toast(
      t(`Ersetzen fehlgeschlagen: ${errMessage(error)}`, `Replace failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

/**
 * Soft join: selection lines; if trimParts empty lines skip; join with separator;
 * if already single line after filter → toast info Soft.
 */
async function runJoin() {
  const text = await getSelectionText()
  if (text == null) return

  let lines = text.split('\n')
  if (settings.trimParts === true) {
    lines = lines.map((l) => l.trim()).filter((l) => l.length > 0)
  }

  if (lines.length === 0) {
    await fanotes.ui.toast(
      t('Keine Zeilen zum Verbinden', 'No lines to join'),
      'info',
    )
    return
  }

  if (lines.length === 1) {
    await fanotes.ui.toast(
      t(
        'Bereits eine Zeile – nichts zu verbinden.',
        'Already a single line – nothing to join.',
      ),
      'info',
    )
    return
  }

  const sep = settings.separator
  const out = lines.join(sep)
  await applyReplace(
    out,
    t(
      `${lines.length} Zeilen verbunden`,
      `Joined ${lines.length} lines`,
    ),
  )
}

/**
 * Soft split: split selection by splitPat (literal, kein Regex v1);
 * join parts with \n; if pat empty toast error.
 * Soft trimParts: trim each part.
 */
async function runSplit() {
  const text = await getSelectionText()
  if (text == null) return

  const pat = settings.splitPat
  if (!pat) {
    await fanotes.ui.toast(
      t(
        'Trennmuster darf nicht leer sein.',
        'Split pattern must not be empty.',
      ),
      'error',
    )
    return
  }

  // Soft: literal split, kein Regex v1 (String.split with string = literal).
  let parts = text.split(pat)
  if (settings.trimParts === true) {
    parts = parts.map((p) => p.trim())
  }

  const out = parts.join('\n')
  await applyReplace(
    out,
    t(
      `Auswahl in ${parts.length} Zeile${parts.length === 1 ? '' : 'n'} getrennt`,
      `Split selection into ${parts.length} line${parts.length === 1 ? '' : 's'}`,
    ),
  )
}

/**
 * Apply panel values into settings Soft before join/split (fence-wrap Soft).
 * @param {Record<string, unknown>} values
 * @returns {Promise<boolean>}
 */
async function applyPanelValues(values) {
  if (!values || typeof values !== 'object') return true
  const prev = { ...settings }

  if (values.separator != null) {
    settings.separator = String(values.separator)
  }
  if (values.splitPat != null) {
    settings.splitPat = String(values.splitPat)
  }
  if (values.trimParts !== undefined) {
    settings.trimParts = values.trimParts === true || values.trimParts === 'true'
  }

  const ok = await persistSettings(prev)
  if (!ok) {
    settings = prev
    return false
  }
  return true
}

function renderBlocks() {
  /** @type {FaNotes.Block[]} */
  return [
    { type: 'heading', text: t('Zeilen verbinden/trennen', 'Join Split Lines'), level: 2 },
    {
      type: 'text',
      muted: true,
      text: t(
        'Verbindet markierte Zeilen mit einem Trenner oder trennt die Auswahl an einem Muster in Zeilen.',
        'Joins selected lines with a separator, or splits the selection on a pattern into lines.',
      ),
    },
    { type: 'divider' },
    {
      type: 'input',
      id: 'separator',
      label: t('Verbindungs-Trenner (Join)', 'Join separator'),
      value: settings.separator,
      placeholder: ', ',
    },
    {
      type: 'input',
      id: 'splitPat',
      label: t('Trennmuster (Split, wörtlich)', 'Split pattern (literal)'),
      value: settings.splitPat,
      placeholder: ',',
    },
    {
      type: 'checkbox',
      id: 'trimParts',
      label: t(
        'Teile trimmen / leere Zeilen beim Verbinden überspringen',
        'Trim parts / skip empty lines when joining',
      ),
      checked: settings.trimParts === true,
    },
    { type: 'divider' },
    {
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'join',
          label: t('Verbinden', 'Join'),
          primary: true,
        },
        {
          type: 'button',
          id: 'split',
          label: t('Trennen', 'Split'),
        },
      ],
    },
    {
      type: 'callout',
      tone: 'info',
      text: t(
        'Join mit Separator / Split zu Zeilen – nicht Sortieren (→ line-tools), nicht Listen-Prefix (→ list-convert). Soft: Trennmuster ist wörtlich (kein Regex v1). Kein Vault.',
        'Join with separator / split into lines — not sorting (→ line-tools), not list prefixes (→ list-convert). Soft: split pattern is literal (no regex in v1). No vault.',
      ),
    },
  ]
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Zeilen verbinden/trennen', 'Join Split Lines'))
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
      title: t('Zeilen verbinden/trennen', 'Join Split Lines'),
      icon: '⧉',
      blocks: renderBlocks(),
      focus: true,
    })

    panel.onAction(async (action) => {
      try {
        const values = action.values || {}
        if (action.id === 'join') {
          const ok = await applyPanelValues(values)
          if (!ok) {
            await refreshPanel()
            return
          }
          await runJoin()
          return
        }
        if (action.id === 'split') {
          const ok = await applyPanelValues(values)
          if (!ok) {
            await refreshPanel()
            return
          }
          await runSplit()
          return
        }
        if (action.id === 'submit:separator' || action.id === 'submit:splitPat') {
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
        if (input.id === 'separator') {
          const prev = { ...settings }
          settings.separator = String(input.value ?? '')
          const ok = await persistSettings(prev)
          if (!ok) {
            await refreshPanel()
            return
          }
          return
        }
        if (input.id === 'splitPat') {
          const prev = { ...settings }
          settings.splitPat = String(input.value ?? '')
          const ok = await persistSettings(prev)
          if (!ok) {
            await refreshPanel()
            return
          }
          return
        }
        if (input.id === 'trimParts') {
          const prev = { ...settings }
          settings.trimParts = input.value === true
          const ok = await persistSettings(prev)
          await refreshPanel()
          if (!ok) return
        }
      } catch (error) {
        fanotes.log('onInput', errMessage(error))
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
  id: 'join',
  title: t('Zeilen verbinden', 'Join lines'),
  detail: t(
    'Markierte Zeilen mit Trenner verbinden',
    'Join selected lines with the separator',
  ),
  keywords: 'join verbinden zeilen lines separator trenner',
  run: async () => {
    try {
      await runJoin()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'split',
  title: t('Auswahl trennen', 'Split selection'),
  detail: t(
    'Auswahl am Trennmuster in Zeilen aufteilen',
    'Split the selection on the pattern into lines',
  ),
  keywords: 'split trennen zeilen lines separator trenner pattern',
  run: async () => {
    try {
      await runSplit()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'open',
  title: t('Zeilen verbinden/trennen öffnen', 'Open Join Split Lines'),
  detail: t(
    'Panel: Trenner, Trennmuster, trimParts',
    'Panel: separator, split pattern, trimParts',
  ),
  keywords: 'join split verbinden trennen panel öffnen open zeilen lines',
  run: () => {
    try {
      openPanel()
    } catch (error) {
      void fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

// --- Lifecycle --------------------------------------------------------------

fanotes.onActivate(async () => {
  try {
    await loadSettings()
    fanotes.log('join-split-lines activated', fanotes.app.appVersion, settings)
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(() => {
  panel = null
})
