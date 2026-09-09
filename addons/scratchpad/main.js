/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Notizzettel / Scratchpad – park draft text outside the vault,
// insert / copy / clear / append selection from a dock panel.

const STORAGE_KEY = 'data'
const PANEL_ID = 'scratch'
const MAX_CHARS = 100000
const DEBOUNCE_MS = 300

/**
 * @typedef {{
 *   text: string,
 *   updatedAt: string | null,
 * }} Store
 */

/** @type {Store} */
let store = {
  text: '',
  updatedAt: null,
}

/** @type {FaNotes.Panel | null} */
let panel = null

/** @type {ReturnType<typeof setTimeout> | 0} */
let debounceTimer = 0

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
 * @returns {Store}
 */
function normalizeStore(raw) {
  if (!raw || typeof raw !== 'object') {
    return { text: '', updatedAt: null }
  }
  const obj = /** @type {Record<string, unknown>} */ (raw)
  const text = obj.text != null ? String(obj.text) : ''
  let updatedAt = null
  if (obj.updatedAt != null && obj.updatedAt !== '') {
    const s = String(obj.updatedAt)
    const ms = Date.parse(s)
    updatedAt = Number.isFinite(ms) ? new Date(ms).toISOString() : null
  }
  // Load may exceed cap only if older data; keep as-is until next save rejects.
  return { text, updatedAt }
}

/**
 * Snapshot for rollback after failed persist.
 * @returns {Store}
 */
function cloneStore() {
  return { text: store.text, updatedAt: store.updatedAt }
}

async function loadStore() {
  try {
    const raw = await fanotes.storage.get(STORAGE_KEY)
    store = normalizeStore(raw)
  } catch (error) {
    fanotes.log('loadStore failed', errMessage(error))
    store = { text: '', updatedAt: null }
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
      text: store.text,
      updatedAt: store.updatedAt,
    })
    return true
  } catch (error) {
    if (rollback) store = { text: rollback.text, updatedAt: rollback.updatedAt }
    await fanotes.ui.toast(
      t(`Speichern fehlgeschlagen: ${errMessage(error)}`, `Save failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

/**
 * Apply text with 100k cap check. Rejects without truncating.
 * @param {string} nextText
 * @param {{ toastSuccess?: boolean, silentOk?: boolean }} [opts]
 * @returns {Promise<boolean>}
 */
async function saveText(nextText, opts = {}) {
  const text = String(nextText ?? '')
  if (text.length > MAX_CHARS) {
    await fanotes.ui.toast(
      t(
        `Zu lang (max. ${MAX_CHARS} Zeichen, aktuell ${text.length}). Speichern abgelehnt.`,
        `Too long (max ${MAX_CHARS} characters, currently ${text.length}). Save rejected.`,
      ),
      'error',
    )
    return false
  }

  const prev = cloneStore()
  store = {
    text,
    updatedAt: new Date().toISOString(),
  }
  const ok = await persistStore(prev)
  if (!ok) {
    await refreshPanel()
    return false
  }
  if (opts.toastSuccess) {
    await fanotes.ui.toast(t('Gespeichert.', 'Saved.'), 'success')
  }
  await refreshPanel()
  return true
}

function formatUpdatedAt(iso) {
  if (!iso) return t('noch nie', 'never')
  try {
    const locale = fanotes.app.language === 'en' ? 'en' : 'de'
    return new Date(iso).toLocaleString(locale)
  } catch {
    return String(iso)
  }
}

function scheduleSaveFromInput(rawText) {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = 0
    void (async () => {
      try {
        const text = String(rawText ?? '')
        // Unchanged → skip (avoid bumping updatedAt on every blur/noise).
        if (text === store.text) return
        const ok = await saveText(text, { silentOk: true })
        if (!ok) {
          // Rejected or persist failed: restore panel to last good store text.
          await refreshPanel()
        }
      } catch (error) {
        fanotes.log('debounced save failed', errMessage(error))
      }
    })()
  }, DEBOUNCE_MS)
}

async function insertScratch() {
  try {
    const text = store.text
    if (!text) {
      await fanotes.ui.toast(
        t('Notizzettel ist leer.', 'Scratchpad is empty.'),
        'info',
      )
      return
    }
    const ok = await fanotes.editor.insert(text, 'cursor')
    if (!ok) {
      await fanotes.ui.toast(
        t('Kein Markdown-Editor geöffnet.', 'No Markdown editor is open.'),
        'error',
      )
      return
    }
    await fanotes.ui.toast(
      t('In die Notiz eingefügt.', 'Inserted into the note.'),
      'success',
    )
  } catch (error) {
    await fanotes.ui.toast(
      t(`Einfügen fehlgeschlagen: ${errMessage(error)}`, `Insert failed: ${errMessage(error)}`),
      'error',
    )
  }
}

async function copyScratch() {
  try {
    const text = store.text
    if (!text) {
      await fanotes.ui.toast(
        t('Nichts zum Kopieren.', 'Nothing to copy.'),
        'info',
      )
      return
    }
    await fanotes.clipboard.writeText(text)
    await fanotes.ui.toast(
      t('In die Zwischenablage kopiert.', 'Copied to clipboard.'),
      'success',
    )
  } catch (error) {
    await fanotes.ui.toast(
      t(`Kopieren fehlgeschlagen: ${errMessage(error)}`, `Copy failed: ${errMessage(error)}`),
      'error',
    )
  }
}

async function clearScratch() {
  try {
    if (!store.text) {
      await fanotes.ui.toast(
        t('Notizzettel ist bereits leer.', 'Scratchpad is already empty.'),
        'info',
      )
      return
    }
    const ok = await fanotes.ui.confirm(
      t(
        'Notizzettel wirklich leeren? Der Text geht verloren.',
        'Really clear the scratchpad? The text will be lost.',
      ),
      {
        title: t('Notizzettel leeren', 'Clear scratchpad'),
        confirmLabel: t('Leeren', 'Clear'),
      },
    )
    if (!ok) return
    const saved = await saveText('', { toastSuccess: false })
    if (saved) {
      await fanotes.ui.toast(t('Geleert.', 'Cleared.'), 'success')
    }
  } catch (error) {
    await fanotes.ui.toast(
      t(`Leeren fehlgeschlagen: ${errMessage(error)}`, `Clear failed: ${errMessage(error)}`),
      'error',
    )
  }
}

async function appendSelection() {
  try {
    let sel = null
    try {
      sel = await fanotes.editor.getSelection()
    } catch (error) {
      await fanotes.ui.toast(
        t(`Auswahl fehlgeschlagen: ${errMessage(error)}`, `Selection failed: ${errMessage(error)}`),
        'error',
      )
      return
    }

    const selected = sel && typeof sel.text === 'string' ? sel.text : ''
    if (!selected) {
      await fanotes.ui.toast(
        t('Keine Textauswahl.', 'No text selection.'),
        'info',
      )
      return
    }

    const next = store.text ? `${store.text}\n\n${selected}` : selected
    const saved = await saveText(next, { toastSuccess: false })
    if (saved) {
      await fanotes.ui.toast(
        t('Auswahl angehängt.', 'Selection appended.'),
        'success',
      )
    }
  } catch (error) {
    await fanotes.ui.toast(
      t(`Anhängen fehlgeschlagen: ${errMessage(error)}`, `Append failed: ${errMessage(error)}`),
      'error',
    )
  }
}

function renderBlocks() {
  const len = store.text.length
  /** @type {FaNotes.Block[]} */
  return [
    { type: 'heading', text: t('Notizzettel', 'Scratchpad'), level: 2 },
    {
      type: 'text',
      muted: true,
      text: t(
        'Nicht im Vault, bis du einfügst.',
        'Not in the vault until you insert.',
      ),
    },
    {
      type: 'input',
      id: 'body',
      label: t('Text', 'Text'),
      value: store.text,
      multiline: true,
      rows: 12,
      placeholder: t('Entwurf hier parken…', 'Park a draft here…'),
    },
    {
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'save',
          label: t('Speichern', 'Save'),
          primary: true,
        },
        {
          type: 'button',
          id: 'insert',
          label: t('Einfügen', 'Insert'),
        },
        {
          type: 'button',
          id: 'copy',
          label: t('Kopieren', 'Copy'),
        },
        {
          type: 'button',
          id: 'clear',
          label: t('Leeren', 'Clear'),
          danger: true,
        },
      ],
    },
    {
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'append-selection',
          label: t('Auswahl anhängen', 'Append selection'),
        },
      ],
    },
    {
      type: 'keyvalue',
      items: [
        {
          key: t('Zuletzt gespeichert', 'Last saved'),
          value: formatUpdatedAt(store.updatedAt),
        },
        {
          key: t('Zeichen', 'Characters'),
          value: `${len} / ${MAX_CHARS}`,
        },
      ],
    },
  ]
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Notizzettel', 'Scratchpad'))
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
      title: t('Notizzettel', 'Scratchpad'),
      icon: '📝',
      blocks: renderBlocks(),
    })

    panel.onAction(async (action) => {
      try {
        if (action.id === 'save' || action.id === 'submit:body') {
          const values = action.values || {}
          const body = values.body != null ? String(values.body) : store.text
          await saveText(body, { toastSuccess: true })
          return
        }
        if (action.id === 'insert') {
          // Prefer latest panel value if present (not yet debounced).
          const values = action.values || {}
          if (values.body != null && String(values.body) !== store.text) {
            const ok = await saveText(String(values.body), { silentOk: true })
            if (!ok) return
          }
          await insertScratch()
          return
        }
        if (action.id === 'copy') {
          const values = action.values || {}
          if (values.body != null && String(values.body) !== store.text) {
            const ok = await saveText(String(values.body), { silentOk: true })
            if (!ok) return
          }
          await copyScratch()
          return
        }
        if (action.id === 'clear') {
          await clearScratch()
          return
        }
        if (action.id === 'append-selection') {
          await appendSelection()
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
        if (input.id === 'body') {
          scheduleSaveFromInput(input.value != null ? String(input.value) : '')
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
// Fixed bilingual keywords (stable DE+EN tokens for palette search).

fanotes.commands.register({
  id: 'open',
  title: t('Notizzettel öffnen', 'Open scratchpad'),
  detail: t(
    'Panel mit dem gespeicherten Entwurf',
    'Panel with the saved draft',
  ),
  keywords: 'scratch notizzettel parkplatz draft zettel öffnen open panel',
  run: () => {
    try {
      openPanel()
    } catch (error) {
      void fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'insert',
  title: t('Notizzettel einfügen', 'Insert scratchpad'),
  detail: t(
    'Gespeicherten Text am Cursor in den Editor einfügen',
    'Insert saved text at the cursor into the editor',
  ),
  keywords: 'scratch notizzettel einfügen insert editor draft zettel',
  run: async () => {
    try {
      await insertScratch()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'copy',
  title: t('Notizzettel kopieren', 'Copy scratchpad'),
  detail: t(
    'Gespeicherten Text in die Zwischenablage schreiben',
    'Write saved text to the clipboard',
  ),
  keywords: 'scratch notizzettel kopieren copy zwischenablage clipboard draft',
  run: async () => {
    try {
      await copyScratch()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'clear',
  title: t('Notizzettel leeren', 'Clear scratchpad'),
  detail: t(
    'Gespeicherten Text nach Bestätigung löschen',
    'Delete saved text after confirmation',
  ),
  keywords: 'scratch notizzettel leeren clear löschen delete draft zettel',
  run: async () => {
    try {
      await clearScratch()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'append-selection',
  title: t('Auswahl an Notizzettel anhängen', 'Append selection to scratchpad'),
  detail: t(
    'Markierten Editor-Text mit Leerzeile anhängen',
    'Append selected editor text with a blank line separator',
  ),
  keywords: 'scratch notizzettel anhängen append auswahl selection draft parkplatz',
  run: async () => {
    try {
      await appendSelection()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.onActivate(async () => {
  try {
    // Load storage only — no editor required.
    await loadStore()
    fanotes.log(
      'scratchpad activated',
      fanotes.app.appVersion,
      fanotes.app.language,
      store.text.length,
      store.updatedAt,
    )
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(() => {
  clearTimeout(debounceTimer)
  debounceTimer = 0
  panel = null
})
