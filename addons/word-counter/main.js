/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Wortzähler / Word Counter – live word, character, line and reading-time
// stats for the current selection or the whole open Markdown note.

const PANEL_ID = 'main'
const STATUS_ID = 'words'
/** Rough adult reading speed used for the estimate. */
const WORDS_PER_MINUTE = 200

/** @type {FaNotes.Panel | null} */
let panel = null
/** @type {ReturnType<typeof setTimeout> | 0} */
let refreshTimer = 0
/** Prevent overlapping refreshes from stacked events. */
let refreshBusy = false
/** Queue one more refresh if events arrived while busy. */
let refreshQueued = false

/**
 * Last computed snapshot for the status bar / panel.
 * @type {{
 *   available: boolean,
 *   scope: 'selection' | 'note' | null,
 *   words: number,
 *   characters: number,
 *   charactersNoSpaces: number,
 *   lines: number,
 *   readingMinutes: number,
 *   readingLabel: string,
 * } | null}
 */
let snapshot = null

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
 * @param {string} text
 */
function analyse(text) {
  const words = text.trim() ? text.trim().split(/\s+/u).length : 0
  const characters = text.length
  const charactersNoSpaces = text.replace(/\s/gu, '').length
  const normalised = text.replace(/\r\n|\r/g, '\n')
  const lines = text === '' ? 0 : normalised.split('\n').length
  const readingMinutes = words === 0 ? 0 : words / WORDS_PER_MINUTE
  return { words, characters, charactersNoSpaces, lines, readingMinutes }
}

/**
 * @param {number} minutes
 */
function formatReadingTime(minutes) {
  if (!minutes || minutes <= 0) return t('0 Min.', '0 min')
  if (minutes < 1) {
    const seconds = Math.max(1, Math.round(minutes * 60))
    return t(`${seconds} Sek.`, `${seconds} sec`)
  }
  const whole = Math.max(1, Math.round(minutes))
  return t(`${whole} Min.`, `${whole} min`)
}

/**
 * Read selection or full editor text and build a snapshot.
 * Prefer editor APIs; return available:false when no Markdown editor is open.
 */
async function compute() {
  let selection = null
  let fullText = null
  try {
    selection = await fanotes.editor.getSelection()
    fullText = await fanotes.editor.getText()
  } catch (error) {
    fanotes.log('editor read failed:', errMessage(error))
    return {
      available: false,
      scope: null,
      words: 0,
      characters: 0,
      charactersNoSpaces: 0,
      lines: 0,
      readingMinutes: 0,
      readingLabel: formatReadingTime(0),
    }
  }

  // Both null ⇒ no Markdown editor (ink mode, PDF, or nothing open).
  if (selection === null && fullText === null) {
    return {
      available: false,
      scope: null,
      words: 0,
      characters: 0,
      charactersNoSpaces: 0,
      lines: 0,
      readingMinutes: 0,
      readingLabel: formatReadingTime(0),
    }
  }

  const hasSelection = Boolean(selection && selection.text)
  const text = hasSelection ? selection.text : (fullText ?? '')
  const stats = analyse(text)
  return {
    available: true,
    scope: hasSelection ? 'selection' : 'note',
    words: stats.words,
    characters: stats.characters,
    charactersNoSpaces: stats.charactersNoSpaces,
    lines: stats.lines,
    readingMinutes: stats.readingMinutes,
    readingLabel: formatReadingTime(stats.readingMinutes),
  }
}

function renderBlocks() {
  if (!snapshot || !snapshot.available) {
    return [
      { type: 'heading', text: t('Wortzähler', 'Word Counter') },
      {
        type: 'callout',
        tone: 'info',
        text: t(
          'Kein Markdown-Editor geöffnet. Öffne eine Notiz im Schreibmodus, um Wörter, Zeichen, Zeilen und Lesezeit zu sehen.',
          'No Markdown editor is open. Open a note in writing mode to see words, characters, lines and reading time.',
        ),
      },
      {
        type: 'button',
        id: 'refresh',
        label: t('Aktualisieren', 'Refresh'),
        primary: true,
      },
    ]
  }

  const scopeLabel =
    snapshot.scope === 'selection'
      ? t('Auswahl', 'Selection')
      : t('Ganze Notiz', 'Whole note')

  return [
    { type: 'heading', text: t('Wortzähler', 'Word Counter') },
    {
      type: 'text',
      muted: true,
      text: t(`Bereich: ${scopeLabel}`, `Scope: ${scopeLabel}`),
    },
    {
      type: 'keyvalue',
      items: [
        { key: t('Wörter', 'Words'), value: String(snapshot.words) },
        {
          key: t('Zeichen', 'Characters'),
          value: String(snapshot.characters),
        },
        {
          key: t('Ohne Leerzeichen', 'Without spaces'),
          value: String(snapshot.charactersNoSpaces),
        },
        { key: t('Zeilen', 'Lines'), value: String(snapshot.lines) },
        {
          key: t('Lesezeit (ca.)', 'Reading time (approx.)'),
          value: snapshot.readingLabel,
        },
      ],
    },
    { type: 'divider' },
    {
      type: 'text',
      muted: true,
      text: t(
        `Lesezeit geschätzt mit ${WORDS_PER_MINUTE} Wörtern/Minute. Markiere Text für Auswahl-Statistik; sonst zählt die ganze Notiz. Auswahlwechsel ohne Tippen aktualisieren den Stand nicht – nutze „Aktualisieren“.`,
        `Reading time estimated at ${WORDS_PER_MINUTE} words/minute. Select text for selection stats; otherwise the whole note is counted. Changing the selection without typing does not refresh – use “Refresh”.`,
      ),
    },
    {
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'refresh',
          label: t('Aktualisieren', 'Refresh'),
          primary: true,
        },
      ],
    },
  ]
}

async function updateStatus() {
  try {
    if (!snapshot || !snapshot.available) {
      // Empty text removes the status item when no editor is available.
      await fanotes.ui.status.set({ id: STATUS_ID, text: '' })
      return
    }
    const prefix =
      snapshot.scope === 'selection'
        ? t('Ausw.', 'Sel.')
        : t('Notiz', 'Note')
    const text = `${prefix}: ${snapshot.words} ${t('W', 'w')}`
    await fanotes.ui.status.set({
      id: STATUS_ID,
      text: text.slice(0, 60),
      title: t(
        'Wortzähler öffnen – Klick aktualisiert und zeigt das Panel',
        'Open Word Counter – click refreshes and shows the panel',
      ),
      onClick: openPanel,
    })
  } catch (error) {
    fanotes.log('status update failed:', errMessage(error))
  }
}

async function updatePanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Wortzähler', 'Word Counter'))
  } catch (error) {
    if (isNoPanel(error)) {
      panel = null
      return
    }
    fanotes.log('panel update failed:', errMessage(error))
  }
}

async function refresh() {
  if (refreshBusy) {
    refreshQueued = true
    return
  }
  refreshBusy = true
  try {
    snapshot = await compute()
    await updateStatus()
    await updatePanel()
  } catch (error) {
    fanotes.log('refresh failed:', errMessage(error))
    try {
      await fanotes.ui.toast(
        t(
          `Aktualisierung fehlgeschlagen: ${errMessage(error)}`,
          `Refresh failed: ${errMessage(error)}`,
        ),
        'error',
      )
    } catch {
      // ignore toast failures
    }
  } finally {
    refreshBusy = false
    if (refreshQueued) {
      refreshQueued = false
      void refresh()
    }
  }
}

function scheduleRefresh(delay = 400) {
  clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = 0
    void refresh()
  }, delay)
}

function openPanel() {
  try {
    if (panel) {
      void panel.show().catch((error) => {
        if (isNoPanel(error)) panel = null
        else fanotes.log('panel.show failed:', errMessage(error))
      })
      void refresh()
      return
    }

    panel = fanotes.ui.panel({
      id: PANEL_ID,
      title: t('Wortzähler', 'Word Counter'),
      icon: '🔢',
      blocks: renderBlocks(),
      focus: true,
    })

    panel.onAction(async (action) => {
      try {
        if (action.id === 'refresh') await refresh()
      } catch (error) {
        fanotes.log('panel action failed:', errMessage(error))
        await fanotes.ui.toast(
          t(
            `Aktion fehlgeschlagen: ${errMessage(error)}`,
            `Action failed: ${errMessage(error)}`,
          ),
          'error',
        )
      }
    })

    void refresh()
  } catch (error) {
    fanotes.log('openPanel failed:', errMessage(error))
    void fanotes.ui.toast(
      t(
        `Panel konnte nicht geöffnet werden: ${errMessage(error)}`,
        `Could not open panel: ${errMessage(error)}`,
      ),
      'error',
    )
  }
}

fanotes.commands.register({
  id: 'open',
  title: t('Wortzähler öffnen', 'Open Word Counter'),
  detail: t(
    'Wörter, Zeichen, Zeilen und Lesezeit der Auswahl oder Notiz',
    'Words, characters, lines and reading time for selection or note',
  ),
  keywords: 'wörter words zeichen characters zeilen lines lesezeit reading zählen count statistik statistics wortzähler word counter',
  run: openPanel,
})

fanotes.onActivate(async () => {
  fanotes.log(
    'word-counter activated',
    fanotes.app.appVersion,
    fanotes.app.language,
  )

  // note:opened / mode:changed need no extra permission.
  fanotes.events.on('note:opened', () => scheduleRefresh(200))
  fanotes.events.on('mode:changed', () => scheduleRefresh(200))
  // note:changed needs notes:read; host already debounces ~400 ms.
  if (fanotes.hasPermission('notes:read')) {
    fanotes.events.on('note:changed', () => scheduleRefresh(400))
    fanotes.events.on('note:saved', () => scheduleRefresh(500))
  }

  await refresh()
})

fanotes.onDeactivate(async () => {
  clearTimeout(refreshTimer)
  refreshTimer = 0
  try {
    await fanotes.ui.status.remove(STATUS_ID)
  } catch {
    // Host also clears status on deactivate.
  }
  panel = null
})
