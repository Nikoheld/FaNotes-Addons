/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Pinnwand / Pinboard – pin active notes and editor selections (max 50),
// open / insert / clipboard / reorder / label from a dock panel.

const STORAGE_KEY = 'data'
const PANEL_ID = 'board'
const STATUS_ID = 'pins'
const MAX_PINS = 50
const MAX_SNIPPET = 20000
const MAX_TITLE = 200
const MAX_LABEL = 80

/**
 * @typedef {{
 *   id: string,
 *   kind: 'note' | 'snippet',
 *   path?: string,
 *   title: string,
 *   text?: string,
 *   label?: string,
 *   createdAt: number,
 * }} Pin
 */

/**
 * @typedef {{ showStatus: boolean }} Settings
 */

/**
 * @typedef {{ pins: Pin[], settings: Settings }} Store
 */

/** @type {Store} */
let store = {
  pins: [],
  settings: { showStatus: true },
}

/** @type {string | null} */
let selectedId = null

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

/** IDs: `p-` + Date.now() + random fragment. */
function newId() {
  return `p-${Date.now()}${Math.random().toString(36).slice(2, 10)}`
}

/**
 * @param {unknown} raw
 * @returns {Pin | null}
 */
function normalizePin(raw) {
  if (!raw || typeof raw !== 'object') return null
  const obj = /** @type {Record<string, unknown>} */ (raw)
  const id = obj.id != null ? String(obj.id).trim() : ''
  const kind = obj.kind === 'snippet' ? 'snippet' : obj.kind === 'note' ? 'note' : null
  const title = obj.title != null ? String(obj.title).trim() : ''
  if (!id || !kind || !title) return null

  /** @type {Pin} */
  const pin = {
    id,
    kind,
    title: title.slice(0, MAX_TITLE),
    createdAt: Number.isFinite(Number(obj.createdAt)) ? Number(obj.createdAt) : Date.now(),
  }

  if (obj.label != null) {
    const label = String(obj.label).trim()
    if (label) pin.label = label.slice(0, MAX_LABEL)
  }

  if (kind === 'note') {
    const path = obj.path != null ? String(obj.path).trim().replace(/\\/g, '/') : ''
    if (!path || path.includes('..')) return null
    pin.path = path
  } else {
    const text = obj.text != null ? String(obj.text) : ''
    if (!text) return null
    pin.text = text.slice(0, MAX_SNIPPET)
  }

  return pin
}

/**
 * @param {unknown} raw
 * @returns {Settings}
 */
function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') return { showStatus: true }
  const obj = /** @type {Record<string, unknown>} */ (raw)
  return { showStatus: obj.showStatus !== false }
}

async function loadStore() {
  try {
    const raw = await fanotes.storage.get(STORAGE_KEY)
    if (raw && typeof raw === 'object') {
      const obj = /** @type {Record<string, unknown>} */ (raw)
      const list = Array.isArray(obj.pins) ? obj.pins : []
      /** @type {Pin[]} */
      const pins = []
      for (const item of list) {
        const n = normalizePin(item)
        if (n) pins.push(n)
        if (pins.length >= MAX_PINS) break
      }
      store = {
        pins,
        settings: normalizeSettings(obj.settings),
      }
    } else {
      store = { pins: [], settings: { showStatus: true } }
    }
  } catch (error) {
    fanotes.log('loadStore failed', errMessage(error))
    store = { pins: [], settings: { showStatus: true } }
  }

  if (selectedId && !store.pins.some((p) => p.id === selectedId)) {
    selectedId = null
  }
  if (!selectedId && store.pins.length) {
    selectedId = store.pins[0].id
  }
}

/** Persist full store after every mutation. */
async function saveStore() {
  try {
    await fanotes.storage.set(STORAGE_KEY, store)
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
 * @param {string} id
 * @returns {Pin | null}
 */
function findPin(id) {
  return store.pins.find((p) => p.id === id) ?? null
}

function previewText(text) {
  const one = String(text ?? '').replace(/\s+/gu, ' ').trim()
  if (!one) return ''
  if (one.length <= 90) return one
  return `${one.slice(0, 89)}…`
}

function titleFromSelection(text) {
  const first = String(text).split(/\r?\n/u)[0].replace(/\s+/gu, ' ').trim()
  if (!first) return t('Auswahl', 'Selection')
  return first.slice(0, MAX_TITLE)
}

async function updateStatus() {
  try {
    if (!store.settings.showStatus) {
      await fanotes.ui.status.remove(STATUS_ID)
      return
    }
    const n = store.pins.length
    await fanotes.ui.status.set({
      id: STATUS_ID,
      text: `Pins: ${n}`,
      title: t('Pinnwand öffnen', 'Open pinboard'),
      onClick: () => {
        try {
          openBoard()
        } catch (error) {
          fanotes.log('status onClick', errMessage(error))
        }
      },
    })
  } catch (error) {
    fanotes.log('updateStatus failed', errMessage(error))
  }
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Pinnwand', 'Pinboard'))
  } catch (error) {
    if (isNoPanel(error)) {
      panel = null
      return
    }
    fanotes.log('refreshPanel', errMessage(error))
  }
}

async function refreshUi() {
  await updateStatus()
  await refreshPanel()
}

/**
 * @param {Pin} pin
 */

/** @returns {Pin[]} */
function clonePins() {
  return store.pins.map((pin) => ({ ...pin }))
}

async function addPin(pin) {
  if (store.pins.length >= MAX_PINS) {
    await fanotes.ui.toast(
      t(`Maximal ${MAX_PINS} Pins.`, `Maximum ${MAX_PINS} pins.`),
      'error',
    )
    return false
  }
  const prevSelected = selectedId
  store.pins.unshift(pin)
  selectedId = pin.id
  const ok = await saveStore()
  if (!ok) {
    store.pins = store.pins.filter((p) => p.id !== pin.id)
    selectedId = prevSelected
    return false
  }
  await refreshUi()
  return true
}

async function pinActiveNote() {
  try {
    let active = null
    try {
      active = await fanotes.notes.active()
    } catch (error) {
      await fanotes.ui.toast(
        t(`Aktive Notiz nicht lesbar: ${errMessage(error)}`, `Could not read active note: ${errMessage(error)}`),
        'error',
      )
      return
    }

    if (!active || !active.path || active.kind === 'none') {
      await fanotes.ui.toast(
        t('Keine aktive Notiz zum Anheften.', 'No active note to pin.'),
        'info',
      )
      return
    }

    const path = String(active.path).replace(/\\/g, '/')
    const existing = store.pins.find((p) => p.kind === 'note' && p.path === path)
    if (existing) {
      selectedId = existing.id
      await refreshPanel()
      await fanotes.ui.toast(
        t('Notiz ist bereits angeheftet.', 'Note is already pinned.'),
        'info',
      )
      return
    }

    const title = (active.title && String(active.title).trim()) || path
    /** @type {Pin} */
    const pin = {
      id: newId(),
      kind: 'note',
      path,
      title: title.slice(0, MAX_TITLE),
      createdAt: Date.now(),
    }

    const ok = await addPin(pin)
    if (ok) {
      await fanotes.ui.toast(
        t(`Notiz angeheftet: ${pin.title}`, `Note pinned: ${pin.title}`),
        'success',
      )
    }
  } catch (error) {
    await fanotes.ui.toast(
      t(`Anheften fehlgeschlagen: ${errMessage(error)}`, `Pin failed: ${errMessage(error)}`),
      'error',
    )
  }
}

async function pinSelection() {
  try {
    let sel = null
    try {
      sel = await fanotes.editor.getSelection()
    } catch (error) {
      await fanotes.ui.toast(
        t(`Auswahl nicht lesbar: ${errMessage(error)}`, `Could not read selection: ${errMessage(error)}`),
        'error',
      )
      return
    }

    const text = sel && typeof sel.text === 'string' ? sel.text : ''
    if (!text.trim()) {
      await fanotes.ui.toast(
        t('Keine Textauswahl zum Anheften.', 'No text selection to pin.'),
        'info',
      )
      return
    }
    if (text.length > MAX_SNIPPET) {
      await fanotes.ui.toast(
        t(`Auswahl zu lang (max. ${MAX_SNIPPET} Zeichen).`, `Selection too long (max ${MAX_SNIPPET} characters).`),
        'error',
      )
      return
    }

    /** @type {Pin} */
    const pin = {
      id: newId(),
      kind: 'snippet',
      title: titleFromSelection(text),
      text,
      createdAt: Date.now(),
    }

    const ok = await addPin(pin)
    if (ok) {
      await fanotes.ui.toast(
        t('Auswahl angeheftet.', 'Selection pinned.'),
        'success',
      )
    }
  } catch (error) {
    await fanotes.ui.toast(
      t(`Anheften fehlgeschlagen: ${errMessage(error)}`, `Pin failed: ${errMessage(error)}`),
      'error',
    )
  }
}

/**
 * @param {Pin} pin
 */
async function openPin(pin) {
  if (pin.kind !== 'note' || !pin.path) {
    await fanotes.ui.toast(
      t('Nur Notiz-Pins können geöffnet werden.', 'Only note pins can be opened.'),
      'info',
    )
    return
  }
  try {
    await fanotes.notes.open(pin.path)
  } catch (error) {
    await fanotes.ui.toast(
      t(`Öffnen fehlgeschlagen: ${errMessage(error)}`, `Open failed: ${errMessage(error)}`),
      'error',
    )
  }
}

/**
 * @param {Pin} pin
 */
async function insertPin(pin) {
  if (pin.kind !== 'snippet' || pin.text == null) {
    await fanotes.ui.toast(
      t('Nur Schnipsel-Pins können eingefügt werden.', 'Only snippet pins can be inserted.'),
      'info',
    )
    return
  }
  try {
    const text = String(pin.text)
    let hasRange = false
    try {
      const sel = await fanotes.editor.getSelection()
      if (sel && sel.from !== sel.to) hasRange = true
    } catch {
      // fall through to insert
    }

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
      return
    }
    await fanotes.ui.toast(
      t('Schnipsel eingefügt.', 'Snippet inserted.'),
      'success',
    )
  } catch (error) {
    await fanotes.ui.toast(
      t(`Einfügen fehlgeschlagen: ${errMessage(error)}`, `Insert failed: ${errMessage(error)}`),
      'error',
    )
  }
}

/**
 * Primary flow for the selected pin: open note or insert snippet.
 * @param {Pin} pin
 */
async function usePin(pin) {
  if (pin.kind === 'note') {
    await openPin(pin)
  } else {
    await insertPin(pin)
  }
}

/**
 * @param {Pin} pin
 */
async function copyPin(pin) {
  try {
    let text = ''
    if (pin.kind === 'note') {
      text = pin.path || pin.title
    } else {
      text = pin.text != null ? String(pin.text) : pin.title
    }
    if (!text) {
      await fanotes.ui.toast(t('Nichts zum Kopieren.', 'Nothing to copy.'), 'info')
      return
    }
    await fanotes.clipboard.writeText(text)
    await fanotes.ui.toast(
      pin.kind === 'note'
        ? t('Pfad kopiert.', 'Path copied.')
        : t('Text kopiert.', 'Text copied.'),
      'success',
    )
  } catch (error) {
    await fanotes.ui.toast(
      t(`Kopieren fehlgeschlagen: ${errMessage(error)}`, `Copy failed: ${errMessage(error)}`),
      'error',
    )
  }
}

/**
 * @param {'up' | 'down'} dir
 */
async function moveSelected(dir) {
  try {
    if (!selectedId) {
      await fanotes.ui.toast(t('Kein Pin ausgewählt.', 'No pin selected.'), 'info')
      return
    }
    const idx = store.pins.findIndex((p) => p.id === selectedId)
    if (idx < 0) return
    const target = dir === 'up' ? idx - 1 : idx + 1
    if (target < 0 || target >= store.pins.length) {
      await fanotes.ui.toast(
        t('Bereits am Rand der Liste.', 'Already at the edge of the list.'),
        'info',
      )
      return
    }
    const prev = clonePins()
    const tmp = store.pins[idx]
    store.pins[idx] = store.pins[target]
    store.pins[target] = tmp
    const ok = await saveStore()
    if (!ok) {
      store.pins = prev
      await refreshPanel()
      return
    }
    await refreshPanel()
  } catch (error) {
    await fanotes.ui.toast(
      t(`Verschieben fehlgeschlagen: ${errMessage(error)}`, `Move failed: ${errMessage(error)}`),
      'error',
    )
  }
}

async function labelSelected() {
  try {
    const pin = selectedId ? findPin(selectedId) : null
    if (!pin) {
      await fanotes.ui.toast(t('Kein Pin ausgewählt.', 'No pin selected.'), 'info')
      return
    }
    const raw = await fanotes.ui.prompt(
      t('Label (leer = entfernen)', 'Label (empty = remove)'),
      {
        title: t('Pin beschriften', 'Label pin'),
        placeholder: t('z. B. Prüfung', 'e.g. exam'),
        value: pin.label || '',
      },
    )
    if (raw === null) return
    const label = String(raw).trim().slice(0, MAX_LABEL)
    const prev = clonePins()
    if (label) pin.label = label
    else delete pin.label
    const ok = await saveStore()
    if (!ok) {
      store.pins = prev
      await refreshPanel()
      return
    }
    await fanotes.ui.toast(
      label
        ? t('Label gesetzt.', 'Label set.')
        : t('Label entfernt.', 'Label removed.'),
      'success',
    )
    await refreshPanel()
  } catch (error) {
    await fanotes.ui.toast(
      t(`Beschriften fehlgeschlagen: ${errMessage(error)}`, `Label failed: ${errMessage(error)}`),
      'error',
    )
  }
}

async function removeSelected() {
  try {
    const pin = selectedId ? findPin(selectedId) : null
    if (!pin) {
      await fanotes.ui.toast(t('Kein Pin ausgewählt.', 'No pin selected.'), 'info')
      return
    }
    const ok = await fanotes.ui.confirm(
      t(
        `Pin „${pin.title}“ wirklich entfernen?`,
        `Really remove pin “${pin.title}”?`,
      ),
      {
        title: t('Pin entfernen', 'Remove pin'),
        confirmLabel: t('Entfernen', 'Remove'),
      },
    )
    if (!ok) return
    const prev = clonePins()
    const prevSelected = selectedId
    store.pins = store.pins.filter((p) => p.id !== pin.id)
    selectedId = store.pins[0]?.id ?? null
    const saved = await saveStore()
    if (!saved) {
      store.pins = prev
      selectedId = prevSelected
      await refreshUi()
      return
    }
    await fanotes.ui.toast(t('Pin entfernt.', 'Pin removed.'), 'success')
    await refreshUi()
  } catch (error) {
    await fanotes.ui.toast(
      t(`Entfernen fehlgeschlagen: ${errMessage(error)}`, `Remove failed: ${errMessage(error)}`),
      'error',
    )
  }
}

async function clearAllPins() {
  try {
    if (!store.pins.length) {
      await fanotes.ui.toast(t('Pinnwand ist bereits leer.', 'Pinboard is already empty.'), 'info')
      return
    }
    const ok = await fanotes.ui.confirm(
      t(
        `Alle ${store.pins.length} Pins wirklich löschen?`,
        `Really clear all ${store.pins.length} pins?`,
      ),
      {
        title: t('Pinnwand leeren', 'Clear pinboard'),
        confirmLabel: t('Alles löschen', 'Clear all'),
      },
    )
    if (!ok) return
    const prev = clonePins()
    const prevSelected = selectedId
    store.pins = []
    selectedId = null
    const saved = await saveStore()
    if (!saved) {
      store.pins = prev
      selectedId = prevSelected
      await refreshUi()
      return
    }
    await fanotes.ui.toast(t('Pinnwand geleert.', 'Pinboard cleared.'), 'success')
    await refreshUi()
  } catch (error) {
    await fanotes.ui.toast(
      t(`Leeren fehlgeschlagen: ${errMessage(error)}`, `Clear failed: ${errMessage(error)}`),
      'error',
    )
  }
}

function renderBlocks() {
  const selected = selectedId ? findPin(selectedId) : null
  const noteCount = store.pins.filter((p) => p.kind === 'note').length
  const snipCount = store.pins.length - noteCount

  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Pinnwand', 'Pinboard'), level: 2 },
    {
      type: 'text',
      muted: true,
      text: t(
        'Notizen und Textauswahl anheften – öffnen, einfügen, kopieren, sortieren.',
        'Pin notes and text selections – open, insert, copy, reorder.',
      ),
    },
    {
      type: 'keyvalue',
      items: [
        { key: t('Pins', 'Pins'), value: String(store.pins.length) },
        { key: t('Notizen', 'Notes'), value: String(noteCount) },
        { key: t('Schnipsel', 'Snippets'), value: String(snipCount) },
      ],
    },
    {
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'pin-note',
          label: t('Aktive Notiz', 'Active note'),
        },
        {
          type: 'button',
          id: 'pin-selection',
          label: t('Auswahl', 'Selection'),
        },
      ],
    },
    { type: 'divider' },
    { type: 'heading', text: t('Pins', 'Pins'), level: 3 },
    {
      type: 'list',
      id: 'pins',
      empty: t(
        'Noch keine Pins – aktive Notiz oder Auswahl anheften.',
        'No pins yet – pin the active note or a selection.',
      ),
      items: store.pins.map((pin) => {
        const kindLabel =
          pin.kind === 'note'
            ? t('Notiz', 'Note')
            : t('Schnipsel', 'Snippet')
        const detailParts = [kindLabel]
        if (pin.label) detailParts.push(pin.label)
        if (pin.kind === 'note' && pin.path) detailParts.push(pin.path)
        else if (pin.kind === 'snippet') detailParts.push(previewText(pin.text))
        return {
          id: pin.id,
          title: pin.title,
          detail: detailParts.join(' · '),
          badge: pin.id === selectedId ? '✓' : pin.kind === 'note' ? '📄' : '✂',
        }
      }),
    },
  ]

  if (selected) {
    blocks.push({ type: 'divider' })
    blocks.push({
      type: 'heading',
      text: t('Auswahl', 'Selected'),
      level: 3,
    })
    blocks.push({
      type: 'keyvalue',
      items: [
        {
          key: t('Art', 'Kind'),
          value:
            selected.kind === 'note'
              ? t('Notiz', 'Note')
              : t('Schnipsel', 'Snippet'),
        },
        { key: t('Titel', 'Title'), value: selected.title },
        {
          key: t('Label', 'Label'),
          value: selected.label || t('—', '—'),
        },
        ...(selected.kind === 'note'
          ? [{ key: t('Pfad', 'Path'), value: selected.path || '—' }]
          : [
              {
                key: t('Vorschau', 'Preview'),
                value: previewText(selected.text) || t('—', '—'),
              },
            ]),
      ],
    })
  }

  blocks.push({ type: 'divider' })
  blocks.push({
    type: 'checkbox',
    id: 'showStatus',
    label: t('„Pins: N“ in der Statusleiste anzeigen', 'Show “Pins: N” in the status bar'),
    checked: store.settings.showStatus,
  })
  blocks.push({
    type: 'callout',
    tone: 'info',
    text: t(
      'Klick auf eine Zeile wählt den Pin. Primäraktion: Notiz öffnen bzw. Schnipsel einfügen. Zwischenablage: Notiz-Pfad bzw. Schnipsel-Text. Maximal 50 Pins.',
      'Click a row to select the pin. Primary action: open note or insert snippet. Clipboard: note path or snippet text. Maximum 50 pins.',
    ),
  })

  const primaryLabel =
    selected && selected.kind === 'snippet'
      ? t('Einfügen', 'Insert')
      : t('Öffnen', 'Open')

  blocks.push({
    type: 'row',
    children: [
      {
        type: 'button',
        id: 'use',
        label: primaryLabel,
        primary: true,
        disabled: !selected,
      },
      {
        type: 'button',
        id: 'clipboard',
        label: t('Kopieren', 'Copy'),
        disabled: !selected,
      },
      {
        type: 'button',
        id: 'move-up',
        label: t('Hoch', 'Up'),
        disabled: !selected,
      },
      {
        type: 'button',
        id: 'move-down',
        label: t('Runter', 'Down'),
        disabled: !selected,
      },
    ],
  })
  blocks.push({
    type: 'row',
    children: [
      {
        type: 'button',
        id: 'label',
        label: t('Label', 'Label'),
        disabled: !selected,
      },
      {
        type: 'button',
        id: 'remove',
        label: t('Entfernen', 'Remove'),
        danger: true,
        disabled: !selected,
      },
      {
        type: 'button',
        id: 'clear',
        label: t('Alles leeren', 'Clear all'),
        danger: true,
        disabled: store.pins.length === 0,
      },
    ],
  })

  return blocks
}

function openBoard() {
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
      title: t('Pinnwand', 'Pinboard'),
      icon: '📌',
      blocks: renderBlocks(),
    })

    panel.onAction(async (action) => {
      try {
        if (action.id === 'pins' && action.itemId) {
          selectedId = String(action.itemId)
          await refreshPanel()
          return
        }
        if (action.id === 'pin-note') {
          await pinActiveNote()
          return
        }
        if (action.id === 'pin-selection') {
          await pinSelection()
          return
        }
        if (action.id === 'use') {
          const pin = selectedId ? findPin(selectedId) : null
          if (!pin) {
            await fanotes.ui.toast(t('Kein Pin ausgewählt.', 'No pin selected.'), 'info')
            return
          }
          await usePin(pin)
          return
        }
        if (action.id === 'clipboard') {
          const pin = selectedId ? findPin(selectedId) : null
          if (!pin) {
            await fanotes.ui.toast(t('Kein Pin ausgewählt.', 'No pin selected.'), 'info')
            return
          }
          await copyPin(pin)
          return
        }
        if (action.id === 'move-up') {
          await moveSelected('up')
          return
        }
        if (action.id === 'move-down') {
          await moveSelected('down')
          return
        }
        if (action.id === 'label') {
          await labelSelected()
          return
        }
        if (action.id === 'remove') {
          await removeSelected()
          return
        }
        if (action.id === 'clear') {
          await clearAllPins()
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
        if (input.id === 'showStatus') {
          const prev = store.settings.showStatus
          store.settings.showStatus = input.value === true
          const ok = await saveStore()
          if (!ok) {
            store.settings.showStatus = prev
            await refreshUi()
            return
          }
          await refreshUi()
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
  title: t('Pinnwand öffnen', 'Open pinboard'),
  detail: t(
    'Panel mit angehefteten Notizen und Schnipseln',
    'Panel with pinned notes and snippets',
  ),
  keywords: 'pinnwand pinboard öffnen open pin board panel',
  run: () => {
    try {
      openBoard()
    } catch (error) {
      void fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'pin-note',
  title: t('Aktive Notiz anheften', 'Pin active note'),
  detail: t(
    'Die aktuelle Notiz auf die Pinnwand setzen',
    'Add the current note to the pinboard',
  ),
  keywords: 'anheften pin notiz note aktiv active pinnwand pinboard',
  run: async () => {
    try {
      await pinActiveNote()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'pin-selection',
  title: t('Auswahl anheften', 'Pin selection'),
  detail: t(
    'Markierten Editor-Text als Schnipsel anheften',
    'Pin the selected editor text as a snippet',
  ),
  keywords: 'anheften pin auswahl selection text schnipsel snippet',
  run: async () => {
    try {
      await pinSelection()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'clear',
  title: t('Pinnwand leeren', 'Clear pinboard'),
  detail: t(
    'Alle Pins nach Bestätigung löschen',
    'Delete all pins after confirmation',
  ),
  keywords: 'leeren clear löschen delete alle all pins pinnwand pinboard',
  run: async () => {
    try {
      await clearAllPins()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.onActivate(async () => {
  try {
    // Light work only: load storage + optional status. No vault scan.
    await loadStore()
    await updateStatus()
    fanotes.log('pinboard activated', fanotes.app.appVersion, store.pins.length)
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(async () => {
  try {
    await fanotes.ui.status.remove(STATUS_ID)
  } catch {
    // Host tears down UI; ignore.
  }
  panel = null
})
