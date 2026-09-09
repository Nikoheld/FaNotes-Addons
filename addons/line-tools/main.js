/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Zeilen-Werkzeuge / Line Tools – sort, dedupe or reverse selected editor lines.
// Abgrenzung: heading-outline / template-library / callout-inserter = Struktur-Snippets;
// hier = reine Zeilen-Operationen auf Selection. Kein Vault. Activate = load settings only.

const STORAGE_KEY = 'settings'
const PANEL_ID = 'lines'

/**
 * @typedef {{
 *   sortLocale: 'auto' | 'de' | 'en',
 *   caseSensitiveDedupe: boolean,
 * }} Settings
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  sortLocale: 'auto',
  caseSensitiveDedupe: false,
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
  const localeRaw = typeof obj.sortLocale === 'string' ? obj.sortLocale.trim().toLowerCase() : 'auto'
  /** @type {'auto' | 'de' | 'en'} */
  let sortLocale = 'auto'
  if (localeRaw === 'de' || localeRaw === 'en' || localeRaw === 'auto') sortLocale = localeRaw
  return {
    sortLocale,
    caseSensitiveDedupe: obj.caseSensitiveDedupe === true,
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
      sortLocale: settings.sortLocale,
      caseSensitiveDedupe: settings.caseSensitiveDedupe === true,
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
 * Locale for localeCompare.
 * Soft: de→'de', en→'en', auto / other → undefined (runtime default).
 * @returns {string | undefined}
 */
function getCompareLocale() {
  let lang = settings.sortLocale
  if (lang === 'auto') {
    const appLang = String(fanotes.app.language || '').toLowerCase()
    if (appLang === 'de') lang = 'de'
    else if (appLang === 'en') lang = 'en'
    else return undefined
  }
  if (lang === 'de' || lang === 'en') return lang
  return undefined
}

/**
 * Read selected lines from the editor.
 * Soft: single-line selection OK if non-empty; split('\\n') preserves trailing empty line.
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
      t(`Auswahl lesen fehlgeschlagen: ${errMessage(error)}`, `Could not read selection: ${errMessage(error)}`),
      'error',
    )
    return null
  }
}

/**
 * Replace selection with joined lines and toast.
 * @param {string[]} lines
 * @param {string} successMsg
 * @returns {Promise<boolean>}
 */
async function apply(lines, successMsg) {
  try {
    const ok = await fanotes.editor.replaceSelection(lines.join('\n'))
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

async function runSortAsc() {
  const lines = await getTargetLines()
  if (!lines) return
  const locale = getCompareLocale()
  const sorted = [...lines].sort((a, b) => a.localeCompare(b, locale))
  await apply(sorted, t('Zeilen aufsteigend sortiert', 'Lines sorted A→Z'))
}

async function runSortDesc() {
  const lines = await getTargetLines()
  if (!lines) return
  const locale = getCompareLocale()
  const sorted = [...lines].sort((a, b) => b.localeCompare(a, locale))
  await apply(sorted, t('Zeilen absteigend sortiert', 'Lines sorted Z→A'))
}

async function runDedupe() {
  const lines = await getTargetLines()
  if (!lines) return
  const seen = new Set()
  /** @type {string[]} */
  const out = []
  const caseSensitive = settings.caseSensitiveDedupe === true
  for (const line of lines) {
    const key = caseSensitive ? line : line.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(line)
  }
  const removed = lines.length - out.length
  await apply(
    out,
    t(
      removed === 0
        ? 'Keine Duplikate gefunden'
        : `${removed} Duplikat${removed === 1 ? '' : 'e'} entfernt`,
      removed === 0
        ? 'No duplicates found'
        : `Removed ${removed} duplicate${removed === 1 ? '' : 's'}`,
    ),
  )
}

async function runReverse() {
  const lines = await getTargetLines()
  if (!lines) return
  await apply([...lines].reverse(), t('Zeilen umgedreht', 'Lines reversed'))
}

function renderBlocks() {
  /** @type {FaNotes.Block[]} */
  return [
    { type: 'heading', text: t('Zeilen-Werkzeuge', 'Line Tools'), level: 2 },
    {
      type: 'text',
      muted: true,
      text: t(
        'Wirkt nur auf die aktuelle Auswahl im Editor – bitte Zeilen markieren. Keine ganze Datei ohne Selection.',
        'Acts only on the current editor selection — please select lines. Does not rewrite the whole file without a selection.',
      ),
    },
    { type: 'divider' },
    {
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'sort-asc',
          label: t('A→Z', 'A→Z'),
          primary: true,
        },
        {
          type: 'button',
          id: 'sort-desc',
          label: t('Z→A', 'Z→A'),
        },
        {
          type: 'button',
          id: 'dedupe',
          label: t('Duplikate weg', 'Remove duplicates'),
        },
        {
          type: 'button',
          id: 'reverse',
          label: t('Umdrehen', 'Reverse'),
        },
      ],
    },
    { type: 'divider' },
    {
      type: 'checkbox',
      id: 'caseSensitiveDedupe',
      label: t(
        'Groß-/Kleinschreibung beim Deduplizieren beachten',
        'Case-sensitive dedupe',
      ),
      checked: settings.caseSensitiveDedupe === true,
    },
    {
      type: 'callout',
      tone: 'info',
      text: t(
        'Reine Zeilen-Operationen auf Selection – keine Struktur-Snippets (→ heading-outline / template-library / callout-inserter). Kein Vault-Zugriff.',
        'Pure line operations on the selection — not structure snippets (→ heading-outline / template-library / callout-inserter). No vault access.',
      ),
    },
  ]
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Zeilen-Werkzeuge', 'Line Tools'))
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
      title: t('Zeilen-Werkzeuge', 'Line Tools'),
      icon: '⇅',
      blocks: renderBlocks(),
    })

    panel.onAction(async (action) => {
      try {
        if (action.id === 'sort-asc') {
          await runSortAsc()
          return
        }
        if (action.id === 'sort-desc') {
          await runSortDesc()
          return
        }
        if (action.id === 'dedupe') {
          await runDedupe()
          return
        }
        if (action.id === 'reverse') {
          await runReverse()
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
        if (input.id === 'caseSensitiveDedupe') {
          const prev = { ...settings }
          settings.caseSensitiveDedupe = input.value === true
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
  id: 'open',
  title: t('Zeilen-Werkzeuge öffnen', 'Open Line Tools'),
  detail: t(
    'Panel: Sortieren, Deduplizieren, Umdrehen',
    'Panel: sort, dedupe, reverse',
  ),
  keywords: 'sort zeilen lines dedupe reverse panel öffnen open werkzeuge tools',
  run: () => {
    try {
      openPanel()
    } catch (error) {
      void fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'sort-asc',
  title: t('Zeilen A→Z sortieren', 'Sort lines A→Z'),
  detail: t(
    'Ausgewählte Editorzeilen aufsteigend sortieren',
    'Sort selected editor lines ascending',
  ),
  keywords: 'sort asc a-z aufsteigend zeilen lines',
  run: async () => {
    try {
      await runSortAsc()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'sort-desc',
  title: t('Zeilen Z→A sortieren', 'Sort lines Z→A'),
  detail: t(
    'Ausgewählte Editorzeilen absteigend sortieren',
    'Sort selected editor lines descending',
  ),
  keywords: 'sort desc z-a absteigend zeilen lines',
  run: async () => {
    try {
      await runSortDesc()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'dedupe',
  title: t('Zeilen-Duplikate entfernen', 'Remove duplicate lines'),
  detail: t(
    'Erste Vorkommen behalten; optional case-sensitiv',
    'Keep first occurrence; optional case-sensitive',
  ),
  keywords: 'dedupe duplikate unique uniquezeilen lines',
  run: async () => {
    try {
      await runDedupe()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'reverse',
  title: t('Zeilen umdrehen', 'Reverse lines'),
  detail: t(
    'Reihenfolge der ausgewählten Zeilen umkehren',
    'Reverse the order of selected lines',
  ),
  keywords: 'reverse umdrehen invert zeilen lines',
  run: async () => {
    try {
      await runReverse()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.onActivate(async () => {
  try {
    await loadSettings()
    fanotes.log('line-tools activated', fanotes.app.appVersion, settings)
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(() => {
  panel = null
})
