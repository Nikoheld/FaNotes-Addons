/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Suchen & Ersetzen / Find Replace Note – literal find/replace in the open note.
// Abgrenzung: saved-searches = Vault-Suche; unlinked-mentions = Titel-Erwähnungen;
// hier = literales Find/Replace in der aktiven Notiz. v1 KEIN Regex (Sicherheit).
// Soft: prefer editor.getText/setText; else notes.active+read / notes.write.
// Activate = load settings only. Never notes.list.

const STORAGE_KEY = 'settings'
const PANEL_ID = 'fr'
const CONFIRM_THRESHOLD = 20

/**
 * @typedef {{
 *   caseSensitive: boolean,
 *   lastFind: string,
 *   lastReplace: string,
 * }} Settings
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  caseSensitive: false,
  lastFind: '',
  lastReplace: '',
}

/** @type {Settings} */
let settings = { ...DEFAULT_SETTINGS }

/** @type {FaNotes.Panel | null} */
let panel = null

/** Soft: last counted hit count for keyvalue (null = not yet counted). */
/** @type {number | null} */
let hitCount = null

/**
 * Soft pendingConfirm for replace-all when count > CONFIRM_THRESHOLD:
 * first Alle → toast info + set flag; second Alle in same session applies.
 * Cleared when find/replace/case changes or after a successful replace-all.
 */
let pendingConfirm = false

/** Soft fingerprint of find+case used for pendingConfirm Soft. */
let pendingFingerprint = ''

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
    caseSensitive: obj.caseSensitive === true,
    lastFind: typeof obj.lastFind === 'string' ? obj.lastFind : '',
    lastReplace: typeof obj.lastReplace === 'string' ? obj.lastReplace : '',
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
      caseSensitive: settings.caseSensitive === true,
      lastFind: settings.lastFind,
      lastReplace: settings.lastReplace,
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

function clearPending() {
  pendingConfirm = false
  pendingFingerprint = ''
}

/**
 * Soft fingerprint for confirm Soft (find + caseSensitive).
 * @param {string} find
 * @param {boolean} caseSensitive
 */
function fingerprint(find, caseSensitive) {
  return `${caseSensitive ? '1' : '0'}\0${find}`
}

/**
 * Soft literal count Soft (non-overlapping). Case Soft: lower-case index loop Soft.
 * @param {string} text
 * @param {string} find
 * @param {boolean} caseSensitive
 */
function countLiteral(text, find, caseSensitive) {
  if (!find) return 0
  if (caseSensitive) {
    let count = 0
    let idx = 0
    while (idx <= text.length - find.length) {
      const found = text.indexOf(find, idx)
      if (found < 0) break
      count += 1
      idx = found + find.length
    }
    return count
  }
  const hay = text.toLowerCase()
  const needle = find.toLowerCase()
  let count = 0
  let idx = 0
  while (idx <= hay.length - needle.length) {
    const found = hay.indexOf(needle, idx)
    if (found < 0) break
    count += 1
    idx = found + needle.length
  }
  return count
}

/**
 * Soft replace-all literal Soft. Case Soft: lower-case index loop building new string Soft
 * (do NOT rely on String.replaceAll ignoreCase). Case-sensitive Soft: split/join Soft.
 * @param {string} text
 * @param {string} find
 * @param {string} replace
 * @param {boolean} caseSensitive
 */
function replaceAllLiteral(text, find, replace, caseSensitive) {
  if (!find) return text
  if (caseSensitive) {
    return text.split(find).join(replace)
  }
  const hay = text.toLowerCase()
  const needle = find.toLowerCase()
  let out = ''
  let i = 0
  while (i < text.length) {
    const found = hay.indexOf(needle, i)
    if (found < 0) {
      out += text.slice(i)
      break
    }
    out += text.slice(i, found) + replace
    i = found + needle.length
  }
  return out
}

/**
 * Soft replace-one Soft (first occurrence only).
 * @param {string} text
 * @param {string} find
 * @param {string} replace
 * @param {boolean} caseSensitive
 * @returns {{ text: string, replaced: boolean }}
 */
function replaceOneLiteral(text, find, replace, caseSensitive) {
  if (!find) return { text, replaced: false }
  if (caseSensitive) {
    const found = text.indexOf(find)
    if (found < 0) return { text, replaced: false }
    return {
      text: text.slice(0, found) + replace + text.slice(found + find.length),
      replaced: true,
    }
  }
  const hay = text.toLowerCase()
  const needle = find.toLowerCase()
  const found = hay.indexOf(needle)
  if (found < 0) return { text, replaced: false }
  return {
    text: text.slice(0, found) + replace + text.slice(found + needle.length),
    replaced: true,
  }
}

/**
 * Prefer editor.getText(); else notes.active + notes.read Soft.
 * Soft: no vault scan / never notes.list Soft.
 * @returns {Promise<{ available: boolean, text: string, path: string | null, viaEditor: boolean }>}
 */
async function readActiveText() {
  /** @type {FaNotes.ActiveNote | null} */
  let active = null
  try {
    active = await fanotes.notes.active()
  } catch (error) {
    fanotes.log('notes.active failed', errMessage(error))
  }

  try {
    const editorText = await fanotes.editor.getText()
    if (editorText !== null && editorText !== undefined) {
      return {
        available: true,
        text: String(editorText),
        path: active ? active.path : null,
        viaEditor: true,
      }
    }
  } catch (error) {
    fanotes.log('editor.getText failed', errMessage(error))
  }

  if (!active || !active.path) {
    return { available: false, text: '', path: null, viaEditor: false }
  }

  // Soft: skip non-markdown kinds when known Soft.
  if (active.kind && active.kind !== 'markdown' && active.kind !== 'none') {
    return {
      available: false,
      text: '',
      path: active.path,
      viaEditor: false,
    }
  }

  try {
    const text = await fanotes.notes.read(active.path)
    return {
      available: true,
      text: String(text ?? ''),
      path: active.path,
      viaEditor: false,
    }
  } catch (error) {
    fanotes.log('notes.read failed', errMessage(error))
    return {
      available: false,
      text: '',
      path: active.path,
      viaEditor: false,
    }
  }
}

/**
 * Prefer editor.setText Soft; else notes.write Soft when path known Soft.
 * @param {string} content
 * @param {string | null} path
 * @returns {Promise<boolean>}
 */
async function writeActiveText(content, path) {
  try {
    const ok = await fanotes.editor.setText(content)
    if (ok) return true
  } catch (error) {
    fanotes.log('editor.setText failed', errMessage(error))
  }

  if (!path) {
    await fanotes.ui.toast(
      t(
        'Schreiben fehlgeschlagen (kein Editor und kein Pfad).',
        'Write failed (no editor and no path).',
      ),
      'error',
    )
    return false
  }

  try {
    await fanotes.notes.write(path, content)
    return true
  } catch (error) {
    await fanotes.ui.toast(
      t(
        `Schreiben fehlgeschlagen: ${errMessage(error)}`,
        `Write failed: ${errMessage(error)}`,
      ),
      'error',
    )
    return false
  }
}

/**
 * Soft: sync draft find/replace/case from panel action.values Soft when present Soft.
 * @param {Record<string, unknown>} [values]
 */
function applyValues(values) {
  if (!values || typeof values !== 'object') return
  if (typeof values.find === 'string') {
    if (values.find !== settings.lastFind) clearPending()
    settings.lastFind = values.find
  }
  if (typeof values.replace === 'string') {
    settings.lastReplace = values.replace
  }
  if (typeof values.caseSensitive === 'boolean') {
    if (values.caseSensitive !== settings.caseSensitive) clearPending()
    settings.caseSensitive = values.caseSensitive
  }
}

/**
 * Soft empty find → toast error Soft.
 * @param {string} find
 */
async function requireFind(find) {
  if (!find) {
    await fanotes.ui.toast(
      t('Suchtext darf nicht leer sein.', 'Find text must not be empty.'),
      'error',
    )
    return false
  }
  return true
}

async function runCount(values) {
  applyValues(values)
  const find = settings.lastFind
  if (!(await requireFind(find))) return

  const read = await readActiveText()
  if (!read.available) {
    await fanotes.ui.toast(
      t('Keine offene Notiz.', 'No open note.'),
      'error',
    )
    return
  }

  hitCount = countLiteral(read.text, find, settings.caseSensitive === true)
  await persistSettings()
  await refreshPanel()
  await fanotes.ui.toast(
    t(
      hitCount === 1 ? '1 Treffer' : `${hitCount} Treffer`,
      hitCount === 1 ? '1 match' : `${hitCount} matches`,
    ),
    'info',
  )
}

async function runReplaceOne(values) {
  applyValues(values)
  const find = settings.lastFind
  const replace = settings.lastReplace
  if (!(await requireFind(find))) return

  const read = await readActiveText()
  if (!read.available) {
    await fanotes.ui.toast(
      t('Keine offene Notiz.', 'No open note.'),
      'error',
    )
    return
  }

  const { text: next, replaced } = replaceOneLiteral(
    read.text,
    find,
    replace,
    settings.caseSensitive === true,
  )

  if (!replaced) {
    hitCount = 0
    await persistSettings()
    await refreshPanel()
    await fanotes.ui.toast(
      t('Kein Treffer.', 'No match.'),
      'info',
    )
    return
  }

  const ok = await writeActiveText(next, read.path)
  if (!ok) return

  hitCount = countLiteral(next, find, settings.caseSensitive === true)
  clearPending()
  await persistSettings()
  await refreshPanel()
  await fanotes.ui.toast(
    t('Einmal ersetzt.', 'Replaced once.'),
    'success',
  )
}

/**
 * Soft replace-all Soft with confirm Soft when count > 20 Soft.
 * @param {Record<string, unknown>} [values]
 */
async function runReplaceAll(values) {
  applyValues(values)
  const find = settings.lastFind
  const replace = settings.lastReplace
  if (!(await requireFind(find))) return

  const read = await readActiveText()
  if (!read.available) {
    await fanotes.ui.toast(
      t('Keine offene Notiz.', 'No open note.'),
      'error',
    )
    return
  }

  const caseSensitive = settings.caseSensitive === true
  const count = countLiteral(read.text, find, caseSensitive)
  hitCount = count

  if (count === 0) {
    clearPending()
    await persistSettings()
    await refreshPanel()
    await fanotes.ui.toast(
      t('Kein Treffer.', 'No match.'),
      'info',
    )
    return
  }

  const fp = fingerprint(find, caseSensitive)
  if (count > CONFIRM_THRESHOLD) {
    if (!pendingConfirm || pendingFingerprint !== fp) {
      pendingConfirm = true
      pendingFingerprint = fp
      await persistSettings()
      await refreshPanel()
      await fanotes.ui.toast(
        t(
          `${count} Treffer — Alle nochmals drücken zum Bestätigen.`,
          `${count} matches — press All again to confirm.`,
        ),
        'info',
      )
      return
    }
  }

  const next = replaceAllLiteral(read.text, find, replace, caseSensitive)
  const ok = await writeActiveText(next, read.path)
  if (!ok) return

  hitCount = countLiteral(next, find, caseSensitive)
  clearPending()
  await persistSettings()
  await refreshPanel()
  await fanotes.ui.toast(
    t(
      count === 1 ? '1 Treffer ersetzt.' : `${count} Treffer ersetzt.`,
      count === 1 ? 'Replaced 1 match.' : `Replaced ${count} matches.`,
    ),
    'success',
  )
}

function renderBlocks() {
  const trefferValue =
    hitCount === null
      ? t('—', '—')
      : String(hitCount)

  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Suchen & Ersetzen', 'Find & Replace'), level: 2 },
    {
      type: 'text',
      muted: true,
      text: t(
        'Literales Suchen/Ersetzen in der offenen Notiz. v1 ohne Regex.',
        'Literal find/replace in the open note. No regex in v1.',
      ),
    },
    {
      type: 'input',
      id: 'find',
      label: t('Suchen', 'Find'),
      value: settings.lastFind,
      placeholder: t('Suchtext…', 'Find text…'),
    },
    {
      type: 'input',
      id: 'replace',
      label: t('Ersetzen', 'Replace'),
      value: settings.lastReplace,
      placeholder: t('Ersatztext…', 'Replace with…'),
    },
    {
      type: 'checkbox',
      id: 'caseSensitive',
      label: t('Groß-/Kleinschreibung beachten', 'Case sensitive'),
      checked: settings.caseSensitive === true,
    },
    {
      type: 'keyvalue',
      items: [
        { key: t('Treffer', 'Matches'), value: trefferValue },
      ],
    },
    {
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'count',
          label: t('Zählen', 'Count'),
        },
        {
          type: 'button',
          id: 'one',
          label: t('Einmal', 'Once'),
        },
        {
          type: 'button',
          id: 'all',
          label: pendingConfirm
            ? t('Alle bestätigen', 'Confirm all')
            : t('Alle', 'All'),
          primary: true,
        },
      ],
    },
    {
      type: 'callout',
      tone: 'info',
      text: t(
        'Nur aktive Notiz – kein Vault-Scan. Kein Regex (Sicherheit). Bei >20 Treffern Alle zweimal drücken. Abgrenzung: saved-searches = Vault-Suche; unlinked-mentions = Titel-Erwähnungen.',
        'Active note only — no vault scan. No regex (safety). When >20 matches, press All twice. Boundaries: saved-searches = vault search; unlinked-mentions = title mentions.',
      ),
    },
  ]
  return blocks
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Suchen & Ersetzen', 'Find & Replace'))
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
      title: t('Suchen & Ersetzen', 'Find & Replace'),
      icon: '⇄',
      blocks: renderBlocks(),
    })

    panel.onAction(async (action) => {
      try {
        const values = /** @type {Record<string, unknown>} */ (action.values || {})
        if (action.id === 'count') {
          await runCount(values)
          return
        }
        if (action.id === 'one') {
          await runReplaceOne(values)
          return
        }
        if (action.id === 'all') {
          await runReplaceAll(values)
          return
        }
        // Soft: Enter on find/replace Soft → count Soft.
        if (action.id === 'submit:find' || action.id === 'submit:replace') {
          await runCount(values)
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
        if (input.id === 'find') {
          const prev = { ...settings }
          const next = String(input.value ?? '')
          if (next !== settings.lastFind) clearPending()
          settings.lastFind = next
          hitCount = null
          await persistSettings(prev)
          await refreshPanel()
          return
        }
        if (input.id === 'replace') {
          const prev = { ...settings }
          settings.lastReplace = String(input.value ?? '')
          await persistSettings(prev)
          return
        }
        if (input.id === 'caseSensitive') {
          const prev = { ...settings }
          const next = input.value === true
          if (next !== settings.caseSensitive) clearPending()
          settings.caseSensitive = next
          hitCount = null
          await persistSettings(prev)
          await refreshPanel()
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
  id: 'open',
  title: t('Suchen & Ersetzen öffnen', 'Open Find & Replace'),
  detail: t(
    'Panel: Suchen, Ersetzen, Zählen, Einmal, Alle',
    'Panel: find, replace, count, once, all',
  ),
  keywords: 'find replace suchen ersetzen note editor panel öffnen open',
  run: () => {
    try {
      openPanel()
    } catch (error) {
      void fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'replace-one',
  title: t('Einmal ersetzen', 'Replace once'),
  detail: t(
    'Ersten Treffer in der offenen Notiz ersetzen (letztes Such-/Ersatzfeld)',
    'Replace the first match in the open note (last find/replace fields)',
  ),
  keywords: 'replace once einmal ersetzen find suchen',
  run: async () => {
    try {
      await runReplaceOne()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'replace-all',
  title: t('Alle ersetzen', 'Replace all'),
  detail: t(
    'Alle Treffer in der offenen Notiz ersetzen (Bestätigung bei >20)',
    'Replace all matches in the open note (confirm when >20)',
  ),
  keywords: 'replace all alle ersetzen find suchen',
  run: async () => {
    try {
      await runReplaceAll()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.onActivate(async () => {
  try {
    await loadSettings()
    // Soft: load lastFind/lastReplace settings only Soft. Never notes.list Soft.
    fanotes.log('find-replace-note activated', fanotes.app.appVersion, {
      caseSensitive: settings.caseSensitive,
      lastFindLen: settings.lastFind.length,
      lastReplaceLen: settings.lastReplace.length,
    })
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(() => {
  panel = null
  hitCount = null
  clearPending()
})
