/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Leerzeilen-Druck / Blank Line Squeeze – collapse consecutive blank lines in
// the editor selection to at most maxConsecutive (Soft 0 = remove all blanks).
// Abgrenzung: strip-markdown=MD-Syntax; trim in join-split; hier=nur Blank-Line-Collapse.
// Soft: no vault/network/notes. Activate = load settings only.
// Mirror Soft: strip-markdown / join-split-lines selection patterns.

const STORAGE_KEY = 'settings'
const PANEL_ID = 'squeeze'

/**
 * @typedef {{
 *   maxConsecutive: number,
 *   trimTrailing: boolean,
 *   scope: 'selection',
 * }} Settings
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  maxConsecutive: 1,
  trimTrailing: false,
  scope: 'selection',
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
 * Soft clamp integer into [lo, hi].
 * @param {unknown} raw
 * @param {number} fallback
 * @param {number} lo
 * @param {number} hi
 */
function clampInt(raw, fallback, lo, hi) {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.max(lo, Math.min(hi, Math.round(n)))
}

/**
 * @param {unknown} raw
 * @returns {Settings}
 */
function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const obj = /** @type {Record<string, unknown>} */ (raw)
  return {
    maxConsecutive: clampInt(obj.maxConsecutive, DEFAULT_SETTINGS.maxConsecutive, 0, 3),
    trimTrailing: obj.trimTrailing === true,
    scope: 'selection',
  }
}

/**
 * @returns {Settings}
 */
function cloneSettings() {
  return {
    maxConsecutive: settings.maxConsecutive,
    trimTrailing: settings.trimTrailing === true,
    scope: 'selection',
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
 * Persist settings Soft; on failure restore `rollback` when provided.
 * @param {Settings} [rollback]
 * @returns {Promise<boolean>}
 */
async function persistSettings(rollback) {
  try {
    await fanotes.storage.set(STORAGE_KEY, {
      maxConsecutive: settings.maxConsecutive,
      trimTrailing: settings.trimTrailing === true,
      scope: 'selection',
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
 * Soft blank = line.trim() === ''.
 * Soft algorithm: walk lines, emit blank only while streak <= maxConsecutive.
 * Soft trimTrailing: also rtrim each line spaces/tabs.
 * Soft maxConsecutive 0 = drop all blank lines.
 * @param {string} text
 * @param {number} maxConsecutive
 * @param {boolean} trimTrailing
 * @returns {string}
 */
function squeezeBlankLines(text, maxConsecutive, trimTrailing) {
  const lines = String(text ?? '').split('\n')
  /** @type {string[]} */
  const out = []
  let streak = 0

  for (const raw of lines) {
    let line = raw
    if (trimTrailing === true) {
      line = line.replace(/[ \t]+$/u, '')
    }
    const isBlank = line.trim() === ''
    if (isBlank) {
      streak += 1
      if (streak <= maxConsecutive) {
        out.push(line)
      }
    } else {
      streak = 0
      out.push(line)
    }
  }

  return out.join('\n')
}

/**
 * Soft: getSelection; empty (from===to / '') → toast info;
 * Soft: whitespace-only selection is valid (blank lines to squeeze).
 * read failure → toast error. Mirrors strip-markdown / join-split selection Soft.
 * @returns {Promise<string | null>}
 */
async function getSelectionText() {
  try {
    const sel = await fanotes.editor.getSelection()
    const raw = sel && typeof sel.text === 'string' ? sel.text : ''
    if (!sel || sel.from === sel.to || raw === '') {
      await fanotes.ui.toast(
        t('Bitte Text markieren', 'Please select text'),
        'info',
      )
      return null
    }
    return raw
  } catch (error) {
    await fanotes.ui.toast(
      t(`Auswahl lesen fehlgeschlagen: ${errMessage(error)}`, `Could not read selection: ${errMessage(error)}`),
      'error',
    )
    return null
  }
}

/**
 * Soft: replaceSelection; toast kein Editor / replace failure / success.
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
 * Core squeeze Soft: selection only (scope v1).
 */
async function runSqueeze() {
  const text = await getSelectionText()
  if (text == null) return

  const max = clampInt(settings.maxConsecutive, 1, 0, 3)
  const trimTrailing = settings.trimTrailing === true
  const result = squeezeBlankLines(text, max, trimTrailing)

  if (result === text) {
    await fanotes.ui.toast(
      t(
        'Keine mehrfachen Leerzeilen zum Zusammenziehen.',
        'No consecutive blank lines to squeeze.',
      ),
      'info',
    )
    return
  }

  const before = text.split('\n').length
  const after = result.split('\n').length
  const removed = Math.max(0, before - after)

  await applyReplace(
    result,
    t(
      removed === 1
        ? 'Leerzeilen zusammengezogen (−1 Zeile).'
        : `Leerzeilen zusammengezogen (−${removed} Zeilen).`,
      removed === 1
        ? 'Blank lines squeezed (−1 line).'
        : `Blank lines squeezed (−${removed} lines).`,
    ),
  )
}

/**
 * Apply panel values into settings Soft before squeeze.
 * @param {Record<string, unknown>} values
 * @returns {Promise<boolean>}
 */
async function applyPanelValues(values) {
  if (!values || typeof values !== 'object') return true
  const prev = cloneSettings()

  if (values.maxConsecutive != null) {
    settings.maxConsecutive = clampInt(values.maxConsecutive, settings.maxConsecutive, 0, 3)
  }
  if (values.trimTrailing !== undefined) {
    settings.trimTrailing = values.trimTrailing === true || values.trimTrailing === 'true'
  }
  settings.scope = 'selection'

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
    { type: 'heading', text: t('Leerzeilen-Druck', 'Blank Line Squeeze'), level: 2 },
    {
      type: 'text',
      muted: true,
      text: t(
        'Reduziert mehrfache Leerzeilen in der Auswahl auf höchstens N (0 = alle Leerzeilen entfernen Soft). Wirkt nur auf die Auswahl.',
        'Collapses consecutive blank lines in the selection to at most N (0 = remove all blank lines Soft). Acts on the selection only.',
      ),
    },
    { type: 'divider' },
    {
      type: 'input',
      id: 'maxConsecutive',
      label: t('Max. aufeinanderfolgende Leerzeilen (0–3)', 'Max consecutive blank lines (0–3)'),
      value: String(settings.maxConsecutive),
      placeholder: '1',
    },
    {
      type: 'checkbox',
      id: 'trimTrailing',
      label: t(
        'Trailing Spaces/Tabs pro Zeile entfernen Soft',
        'Also trim trailing spaces/tabs on each line Soft',
      ),
      checked: settings.trimTrailing === true,
    },
    { type: 'divider' },
    {
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'squeeze',
          label: t('Zusammenziehen', 'Squeeze'),
          primary: true,
        },
      ],
    },
    {
      type: 'callout',
      tone: 'info',
      text: t(
        'Nur Blank-Line-Collapse – nicht MD-Syntax (→ strip-markdown), nicht Join/Split-Trim (→ join-split-lines). Soft: Leerzeile = trim===\'\'. maxConsecutive 0 = alle Blanks weg Soft. Scope v1 = Auswahl. Kein Vault.',
        'Blank-line collapse only — not MD markup (→ strip-markdown), not join/split trim (→ join-split-lines). Soft: blank line = trim===\'\'. maxConsecutive 0 = drop all blanks Soft. Scope v1 = selection. No vault.',
      ),
    },
  ]
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Leerzeilen-Druck', 'Blank Line Squeeze'))
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
      title: t('Leerzeilen-Druck', 'Blank Line Squeeze'),
      icon: '⇕',
      blocks: renderBlocks(),
      focus: true,
    })

    panel.onAction(async (action) => {
      try {
        const values = action.values || {}
        if (action.id === 'squeeze') {
          const ok = await applyPanelValues(values)
          if (!ok) {
            await refreshPanel()
            return
          }
          await runSqueeze()
          return
        }
        if (action.id === 'submit:maxConsecutive') {
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
        if (input.id === 'maxConsecutive') {
          const prev = cloneSettings()
          settings.maxConsecutive = clampInt(input.value, settings.maxConsecutive, 0, 3)
          const ok = await persistSettings(prev)
          if (!ok) {
            await refreshPanel()
            return
          }
          return
        }
        if (input.id === 'trimTrailing') {
          const prev = cloneSettings()
          settings.trimTrailing = input.value === true
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
  id: 'squeeze',
  title: t('Leerzeilen zusammenziehen', 'Squeeze blank lines'),
  detail: t(
    'Mehrfache Leerzeilen in der Auswahl auf höchstens N reduzieren',
    'Collapse consecutive blank lines in the selection to at most N',
  ),
  keywords: 'blank leerzeilen squeeze collapse whitespace tidy zusammenziehen',
  run: async () => {
    try {
      await runSqueeze()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'open',
  title: t('Leerzeilen-Druck öffnen', 'Open Blank Line Squeeze'),
  detail: t(
    'Panel: maxConsecutive, trimTrailing, Zusammenziehen',
    'Panel: maxConsecutive, trimTrailing, Squeeze',
  ),
  keywords: 'blank leerzeilen squeeze collapse panel öffnen open zusammenziehen',
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
    fanotes.log('blank-line-squeeze activated', fanotes.app.appVersion, settings)
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(() => {
  panel = null
})
