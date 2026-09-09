/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Callout-Einfüger / Callout Inserter – insert Obsidian-style markdown
// callouts (info / warning / tip + success / note) into the open editor.
// Abgrenzung: NOT template-library (no freeform CRUD templates);
// NOT math-snippets (no LaTeX). Fixed types + last-used + settings only.
// Scan-gate: no vault scan; Activate = load storage only.

const STORAGE_KEY = 'data'
const PANEL_ID = 'callouts'

/** @typedef {'info' | 'warning' | 'tip' | 'success' | 'note'} CalloutType */

/**
 * @typedef {{
 *   blankBefore: boolean,
 *   blankAfter: boolean,
 *   trailingNewline: boolean,
 *   lastType: CalloutType | null,
 * }} Settings
 */

/**
 * @typedef {{
 *   settings: Settings,
 * }} Store
 */

/** Core + clean extras (Obsidian-compatible). */
const CALLOUT_TYPES = /** @type {const} */ (['info', 'warning', 'tip', 'success', 'note'])

/** @type {Store} */
let store = {
  settings: {
    blankBefore: true,
    blankAfter: true,
    trailingNewline: true,
    lastType: null,
  },
}

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
 * @returns {CalloutType | null}
 */
function normalizeType(raw) {
  if (raw == null) return null
  const s = String(raw).trim().toLowerCase()
  return /** @type {CalloutType[]} */ ([...CALLOUT_TYPES]).includes(/** @type {CalloutType} */ (s))
    ? /** @type {CalloutType} */ (s)
    : null
}

/**
 * @param {unknown} raw
 * @returns {Store}
 */
function normalizeStore(raw) {
  const defaults = {
    blankBefore: true,
    blankAfter: true,
    trailingNewline: true,
    lastType: /** @type {CalloutType | null} */ (null),
  }
  if (!raw || typeof raw !== 'object') {
    return { settings: { ...defaults } }
  }
  const obj = /** @type {Record<string, unknown>} */ (raw)
  const settingsRaw =
    obj.settings && typeof obj.settings === 'object'
      ? /** @type {Record<string, unknown>} */ (obj.settings)
      : obj
  return {
    settings: {
      blankBefore: settingsRaw.blankBefore !== false,
      blankAfter: settingsRaw.blankAfter !== false,
      trailingNewline: settingsRaw.trailingNewline !== false,
      lastType: normalizeType(settingsRaw.lastType),
    },
  }
}

/**
 * Snapshot for rollback-safe writes.
 * @returns {Store}
 */
function cloneStore() {
  return {
    settings: {
      blankBefore: store.settings.blankBefore,
      blankAfter: store.settings.blankAfter,
      trailingNewline: store.settings.trailingNewline,
      lastType: store.settings.lastType,
    },
  }
}

async function loadStore() {
  try {
    const raw = await fanotes.storage.get(STORAGE_KEY)
    store = normalizeStore(raw)
  } catch (error) {
    fanotes.log('loadStore failed', errMessage(error))
    store = normalizeStore(null)
  }
}

/**
 * Persist store; on failure restore `rollback` when provided.
 * @param {Store} [rollback]
 * @returns {Promise<boolean>}
 */
async function persistStore(rollback) {
  try {
    await fanotes.storage.set(STORAGE_KEY, {
      settings: {
        blankBefore: store.settings.blankBefore === true,
        blankAfter: store.settings.blankAfter === true,
        trailingNewline: store.settings.trailingNewline === true,
        lastType: store.settings.lastType,
      },
    })
    return true
  } catch (error) {
    if (rollback) store = cloneStoreFrom(rollback)
    await fanotes.ui.toast(
      t(`Speichern fehlgeschlagen: ${errMessage(error)}`, `Save failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

/**
 * @param {Store} other
 * @returns {Store}
 */
function cloneStoreFrom(other) {
  return {
    settings: {
      blankBefore: other.settings.blankBefore,
      blankAfter: other.settings.blankAfter,
      trailingNewline: other.settings.trailingNewline,
      lastType: other.settings.lastType,
    },
  }
}

/**
 * @param {CalloutType} type
 */
function typeLabel(type) {
  switch (type) {
    case 'info':
      return t('Info', 'Info')
    case 'warning':
      return t('Warnung', 'Warning')
    case 'tip':
      return t('Tipp', 'Tip')
    case 'success':
      return t('Erfolg', 'Success')
    case 'note':
      return t('Notiz', 'Note')
    default:
      return type
  }
}

/**
 * @param {CalloutType} type
 */
function typeDetail(type) {
  switch (type) {
    case 'info':
      return t('Hinweis / Information', 'Notice / information')
    case 'warning':
      return t('Warnung / Vorsicht', 'Warning / caution')
    case 'tip':
      return t('Tipp / Empfehlung', 'Tip / recommendation')
    case 'success':
      return t('Erfolg / positiv', 'Success / positive')
    case 'note':
      return t('Allgemeine Notiz', 'General note')
    default:
      return `> [!${type}]`
  }
}

/**
 * Short bilingual placeholder when there is no selection.
 * @param {CalloutType} type
 */
function placeholderBody(type) {
  switch (type) {
    case 'warning':
      return t('Deine Warnung…', 'Your warning…')
    case 'tip':
      return t('Dein Tipp…', 'Your tip…')
    case 'success':
      return t('Dein Erfolg…', 'Your success…')
    case 'note':
      return t('Deine Notiz…', 'Your note…')
    case 'info':
    default:
      return t('Dein Hinweis…', 'Your note…')
  }
}

/**
 * Build Obsidian-compatible callout markdown.
 * @param {CalloutType} type
 * @param {string} body
 */
function formatCallout(type, body) {
  const lines = String(body).split('\n')
  const quoted = [`> [!${type}]`, ...lines.map((line) => (line.length ? `> ${line}` : '>'))]
  let text = quoted.join('\n')
  if (store.settings.blankBefore) text = `\n${text}`
  if (store.settings.blankAfter) text = `${text}\n`
  if (store.settings.trailingNewline) text = `${text}\n`
  return text
}

/**
 * Insert callout: wrap selection as body, else placeholder.
 * @param {CalloutType} type
 */
async function insertCallout(type) {
  try {
    let body = placeholderBody(type)
    let hasRange = false
    try {
      const sel = await fanotes.editor.getSelection()
      if (sel && sel.from !== sel.to) {
        hasRange = true
        if (typeof sel.text === 'string') body = sel.text
      }
    } catch {
      // ignore – fall through to insert with placeholder
    }

    const text = formatCallout(type, body)
    let ok = false
    if (hasRange) {
      ok = await fanotes.editor.replaceSelection(text)
    } else {
      ok = await fanotes.editor.insert(text, 'cursor')
    }

    if (!ok) {
      await fanotes.ui.toast(
        t('Kein Markdown-Editor geöffnet.', 'No Markdown editor is open.'),
        'error',
      )
      return false
    }

    const prev = cloneStore()
    store.settings.lastType = type
    const saved = await persistStore(prev)
    if (!saved) await refreshPanel()
    else {
      await fanotes.ui.toast(
        t(`Callout eingefügt: ${typeLabel(type)}`, `Callout inserted: ${typeLabel(type)}`),
        'success',
      )
      await refreshPanel()
    }
    return true
  } catch (error) {
    await fanotes.ui.toast(
      t(`Einfügen fehlgeschlagen: ${errMessage(error)}`, `Insert failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

async function insertLast() {
  const type = store.settings.lastType
  if (!type) {
    await fanotes.ui.toast(
      t('Kein zuletzt genutzter Callout-Typ.', 'No last-used callout type.'),
      'info',
    )
    return
  }
  await insertCallout(type)
}

function renderBlocks() {
  const last = store.settings.lastType

  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Callout-Einfüger', 'Callout Inserter'), level: 2 },
    {
      type: 'text',
      muted: true,
      text: t(
        'Obsidian-Callouts (`> [!info]` …) in den offenen Markdown-Editor einfügen. Klick auf einen Typ fügt sofort ein.',
        'Insert Obsidian callouts (`> [!info]` …) into the open Markdown editor. Click a type to insert immediately.',
      ),
    },
    {
      type: 'keyvalue',
      items: [
        {
          key: t('Zuletzt', 'Last used'),
          value: last ? typeLabel(last) : t('—', '—'),
        },
        {
          key: t('Leerzeile davor', 'Blank before'),
          value: store.settings.blankBefore ? t('an', 'on') : t('aus', 'off'),
        },
        {
          key: t('Leerzeile danach', 'Blank after'),
          value: store.settings.blankAfter ? t('an', 'on') : t('aus', 'off'),
        },
      ],
    },
    { type: 'divider' },
    { type: 'heading', text: t('Typen', 'Types'), level: 3 },
    {
      type: 'list',
      id: 'types',
      empty: t('Keine Typen.', 'No types.'),
      items: CALLOUT_TYPES.map((type) => ({
        id: type,
        title: typeLabel(type),
        detail: `${typeDetail(type)} · > [!${type}]`,
        badge: type === last ? '✓' : undefined,
      })),
    },
    {
      type: 'callout',
      tone: 'info',
      text: t(
        'Nur feste Callout-Typen – keine freie Vorlagen-Bibliothek (→ template-library) und kein LaTeX (→ math-snippets). Bei Auswahl wird der markierte Text zum Callout-Körper; sonst ein kurzer Platzhalter.',
        'Fixed callout types only — not a freeform template library (→ template-library) and not LaTeX (→ math-snippets). With a selection, that text becomes the callout body; otherwise a short placeholder is used.',
      ),
    },
    { type: 'divider' },
    { type: 'heading', text: t('Einstellungen', 'Settings'), level: 3 },
    {
      type: 'checkbox',
      id: 'blankBefore',
      label: t('Leerzeile vor dem Callout', 'Blank line before callout'),
      checked: store.settings.blankBefore === true,
    },
    {
      type: 'checkbox',
      id: 'blankAfter',
      label: t('Leerzeile nach dem Callout', 'Blank line after callout'),
      checked: store.settings.blankAfter === true,
    },
    {
      type: 'checkbox',
      id: 'trailingNewline',
      label: t('Abschließenden Zeilenumbruch einfügen', 'Include trailing newline'),
      checked: store.settings.trailingNewline === true,
    },
    {
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'insert-last',
          label: t('Zuletzt einfügen', 'Insert last'),
          primary: true,
          disabled: !last,
        },
      ],
    },
  ]

  return blocks
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Callout-Einfüger', 'Callout Inserter'))
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
      title: t('Callout-Einfüger', 'Callout Inserter'),
      icon: '💬',
      blocks: renderBlocks(),
    })

    panel.onAction(async (action) => {
      try {
        if (action.id === 'types' && action.itemId) {
          const type = normalizeType(action.itemId)
          if (!type) {
            await fanotes.ui.toast(t('Unbekannter Typ.', 'Unknown type.'), 'error')
            return
          }
          await insertCallout(type)
          return
        }
        if (action.id === 'insert-last') {
          await insertLast()
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
        if (input.id === 'blankBefore' || input.id === 'blankAfter' || input.id === 'trailingNewline') {
          const prev = cloneStore()
          if (input.id === 'blankBefore') store.settings.blankBefore = input.value === true
          if (input.id === 'blankAfter') store.settings.blankAfter = input.value === true
          if (input.id === 'trailingNewline') store.settings.trailingNewline = input.value === true
          const ok = await persistStore(prev)
          if (!ok) await refreshPanel()
          else await refreshPanel()
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
  title: t('Callout-Einfüger öffnen', 'Open Callout Inserter'),
  detail: t(
    'Panel mit Callout-Typen und Einstellungen',
    'Panel with callout types and settings',
  ),
  keywords: 'callout hinweis warnung tipp info tip warning öffnen open panel einfügen insert',
  run: () => {
    try {
      openPanel()
    } catch (error) {
      void fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'insert-info',
  title: t('Info-Callout einfügen', 'Insert info callout'),
  detail: t(
    'Schnell > [!info] an Cursor/Auswahl einfügen',
    'Quick-insert > [!info] at cursor/selection',
  ),
  keywords: 'callout info hinweis einfügen insert markdown obsidian',
  run: async () => {
    try {
      await insertCallout('info')
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'insert-warning',
  title: t('Warnungs-Callout einfügen', 'Insert warning callout'),
  detail: t(
    'Schnell > [!warning] an Cursor/Auswahl einfügen',
    'Quick-insert > [!warning] at cursor/selection',
  ),
  keywords: 'callout warning warnung caution einfügen insert markdown',
  run: async () => {
    try {
      await insertCallout('warning')
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'insert-tip',
  title: t('Tipp-Callout einfügen', 'Insert tip callout'),
  detail: t(
    'Schnell > [!tip] an Cursor/Auswahl einfügen',
    'Quick-insert > [!tip] at cursor/selection',
  ),
  keywords: 'callout tip tipp hinweis einfügen insert markdown',
  run: async () => {
    try {
      await insertCallout('tip')
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'insert-last',
  title: t('Letzten Callout einfügen', 'Insert last callout'),
  detail: t(
    'Zuletzt genutzten Callout-Typ erneut einfügen',
    'Re-insert the last-used callout type',
  ),
  keywords: 'callout zuletzt last used einfügen insert wiederholen repeat',
  run: async () => {
    try {
      await insertLast()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.onActivate(async () => {
  try {
    await loadStore()
    fanotes.log('callout-inserter activated', fanotes.app.appVersion, store.settings.lastType)
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(() => {
  panel = null
})
