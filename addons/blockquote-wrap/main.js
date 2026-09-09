/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Zitat-Umbruch / Blockquote Wrap – prefix selected lines as Markdown blockquote (> ).
// Abgrenzung: quote-collector=Sammeln/Export; callout-inserter=Callouts; fence-wrap=Code;
// hier=klassisches > Zitat. Soft: no vault/network/notes. Activate = load settings only.
// Mirror Soft: fence-wrap / list-convert selection transforms.

const SETTINGS_KEY = 'settings'
const PANEL_ID = 'bq'

/** Soft remove: strip one blockquote marker after optional indent. */
const QUOTE_STRIP_RE = /^(\s*)>\s?/

/**
 * @typedef {'add' | 'toggle' | 'remove'} BqMode
 * @typedef {{
 *   mode: BqMode,
 *   keepBlank: boolean,
 * }} Settings
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  mode: 'add',
  keepBlank: true,
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
  const modeRaw = typeof obj.mode === 'string' ? obj.mode.trim().toLowerCase() : 'add'
  /** @type {BqMode} */
  let mode = 'add'
  if (modeRaw === 'add' || modeRaw === 'toggle' || modeRaw === 'remove') mode = modeRaw
  return {
    mode,
    keepBlank: obj.keepBlank !== false,
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
async function saveSettings(rollback) {
  try {
    await fanotes.storage.set(SETTINGS_KEY, {
      mode: settings.mode,
      keepBlank: settings.keepBlank === true,
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
 * Soft: line already has a blockquote marker after optional indent.
 * @param {string} line
 */
function isQuoted(line) {
  return /^(\s*)>/.test(line)
}

/**
 * Soft add: non-empty → `> ` after indent; blank → `>` if keepBlank else unchanged.
 * Soft already: lines starting with > still get another > (Markdown nested).
 * @param {string} line
 * @param {boolean} keepBlank
 */
function addQuoteLine(line, keepBlank) {
  if (line === '') {
    return keepBlank ? '>' : ''
  }
  const m = /^(\s*)(.*)$/.exec(line)
  const indent = m ? m[1] : ''
  const rest = m ? m[2] : line
  return indent + '> ' + rest
}

/**
 * Soft remove: strip /^(\s*)>\s?/ — keeps indent group, one marker level.
 * @param {string} line
 */
function removeQuoteLine(line) {
  return line.replace(QUOTE_STRIP_RE, '$1')
}

/**
 * Soft toggle majority: among non-empty lines, if majority already quoted → remove else add.
 * @param {string[]} lines
 */
function majorityQuoted(lines) {
  const relevant = lines.filter((l) => l !== '')
  if (relevant.length === 0) return false
  let quoted = 0
  for (const l of relevant) {
    if (isQuoted(l)) quoted += 1
  }
  return quoted > relevant.length / 2
}

/**
 * @param {string[]} lines
 * @param {'add' | 'remove'} action
 * @param {boolean} keepBlank
 * @returns {string[]}
 */
function transformLines(lines, action, keepBlank) {
  if (action === 'remove') {
    return lines.map(removeQuoteLine)
  }
  return lines.map((line) => addQuoteLine(line, keepBlank))
}

/**
 * Soft: getSelection; empty/whitespace → toast info; read error → toast error.
 * @returns {Promise<string[] | null>}
 */
async function getTargetLines() {
  try {
    const sel = await fanotes.editor.getSelection()
    if (!sel || typeof sel.text !== 'string' || !sel.text.trim()) {
      await fanotes.ui.toast(
        t('Bitte Zeilen markieren', 'Please select lines'),
        'info',
      )
      return null
    }
    return sel.text.split('\n')
  } catch (error) {
    await fanotes.ui.toast(
      t(
        `Auswahl lesen fehlgeschlagen: ${errMessage(error)}`,
        `Could not read selection: ${errMessage(error)}`,
      ),
      'error',
    )
    return null
  }
}

/**
 * Core transform Soft: wrap | unwrap | toggle (resolved to add/remove).
 * @param {'add' | 'remove' | 'toggle'} mode
 */
async function runTransform(mode) {
  const lines = await getTargetLines()
  if (!lines) return false

  const keepBlank = settings.keepBlank === true
  /** @type {'add' | 'remove'} */
  let action = mode === 'toggle' ? (majorityQuoted(lines) ? 'remove' : 'add') : mode

  const next = transformLines(lines, action, keepBlank)

  try {
    const ok = await fanotes.editor.replaceSelection(next.join('\n'))
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

  /** @type {Record<'add' | 'remove', [string, string]>} */
  const msgs = {
    add: ['Als Blockzitat markiert.', 'Prefixed as blockquote.'],
    remove: ['Blockzitat-Marker entfernt.', 'Blockquote markers removed.'],
  }
  const [de, en] = msgs[action]
  await fanotes.ui.toast(t(de, en), 'success')
  return true
}

/**
 * Apply panel Soft mode from settings (Anwenden).
 */
async function runApply() {
  const mode = settings.mode
  if (mode === 'add') return runTransform('add')
  if (mode === 'remove') return runTransform('remove')
  return runTransform('toggle')
}

function renderBlocks() {
  /** @type {FaNotes.Block[]} */
  return [
    { type: 'heading', text: t('Zitat-Umbruch', 'Blockquote Wrap'), level: 2 },
    {
      type: 'text',
      muted: true,
      text: t(
        'Stellt markierte Zeilen als Markdown-Blockzitat mit > vor. Im Add-Modus werden bereits zitierte Zeilen Soft verschachtelt (> > …).',
        'Prefixes selected lines as a Markdown blockquote with >. In add mode, already-quoted lines Soft nest (> > …).',
      ),
    },
    { type: 'divider' },
    {
      type: 'select',
      id: 'mode',
      label: t('Modus', 'Mode'),
      value: settings.mode,
      options: [
        { value: 'add', label: t('Hinzufügen (>)', 'Add (>)') },
        { value: 'remove', label: t('Entfernen', 'Remove') },
        { value: 'toggle', label: t('Umschalten (Mehrheit)', 'Toggle (majority)') },
      ],
    },
    {
      type: 'checkbox',
      id: 'keepBlank',
      label: t('Leerzeilen als > behalten', 'Keep blank lines as >'),
      checked: settings.keepBlank === true,
    },
    { type: 'divider' },
    {
      type: 'button',
      id: 'apply',
      label: t('Anwenden', 'Apply'),
      primary: true,
    },
    {
      type: 'callout',
      tone: 'info',
      text: t(
        'Klassisches >-Zitat der Selection – nicht Sammeln/Export (→ quote-collector), nicht Callouts (→ callout-inserter), nicht Code-Fence (→ fence-wrap). Soft: Toggle = Mehrheit der nicht-leeren Zeilen bereits zitiert → entfernen, sonst hinzufügen. Kein Vault.',
        'Classic > quote of the selection — not collect/export (→ quote-collector), not callouts (→ callout-inserter), not code fence (→ fence-wrap). Soft: toggle = majority of non-empty lines already quoted → remove, else add. No vault.',
      ),
    },
  ]
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Zitat-Umbruch', 'Blockquote Wrap'))
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
      title: t('Zitat-Umbruch', 'Blockquote Wrap'),
      icon: '❝',
      blocks: renderBlocks(),
    })

    panel.onAction(async (action) => {
      try {
        if (action.id === 'apply') {
          await runApply()
          return
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
        if (input.id === 'mode') {
          const prev = { ...settings }
          const v = String(input.value ?? '').trim().toLowerCase()
          if (v === 'add' || v === 'toggle' || v === 'remove') {
            settings.mode = v
            const ok = await saveSettings(prev)
            await refreshPanel()
            if (!ok) return
          }
          return
        }
        if (input.id === 'keepBlank') {
          const prev = { ...settings }
          settings.keepBlank = input.value === true
          const ok = await saveSettings(prev)
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
  id: 'wrap',
  title: t('Auswahl als Blockzitat', 'Wrap selection as blockquote'),
  detail: t(
    'Markierte Zeilen mit > voranstellen (verschachtelt möglich)',
    'Prefix selected lines with > (nesting allowed)',
  ),
  keywords: 'blockquote zitat quote wrap markdown umbruch prefix add',
  run: async () => {
    try {
      await runTransform('add')
    } catch (error) {
      await fanotes.ui.toast(
        t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`),
        'error',
      )
    }
  },
})

fanotes.commands.register({
  id: 'unwrap',
  title: t('Blockzitat entfernen', 'Unwrap blockquote'),
  detail: t(
    'Einen >-Marker je Zeile entfernen',
    'Strip one > marker per line',
  ),
  keywords: 'blockquote unwrap remove entfernen zitat quote',
  run: async () => {
    try {
      await runTransform('remove')
    } catch (error) {
      await fanotes.ui.toast(
        t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`),
        'error',
      )
    }
  },
})

fanotes.commands.register({
  id: 'toggle',
  title: t('Blockzitat umschalten', 'Toggle blockquote'),
  detail: t(
    'Mehrheit zitiert → entfernen, sonst hinzufügen',
    'Majority quoted → remove, else add',
  ),
  keywords: 'blockquote toggle umschalten zitat quote majority',
  run: async () => {
    try {
      await runTransform('toggle')
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
  title: t('Zitat-Umbruch öffnen', 'Open Blockquote Wrap'),
  detail: t(
    'Panel: Modus, Leerzeilen, Anwenden',
    'Panel: mode, blank lines, Apply',
  ),
  keywords: 'panel open öffnen settings blockquote zitat quote wrap',
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
      'blockquote-wrap activated',
      fanotes.app.appVersion,
      fanotes.app.language,
      settings.mode,
      settings.keepBlank,
    )
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(() => {
  panel = null
})
