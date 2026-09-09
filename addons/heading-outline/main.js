/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Gliederung / Heading Outline – ATX heading outline of the open Markdown
// note, plain TOC insert (bullet/numbered, no links), clipboard copy.

const SETTINGS_KEY = 'settings'
const PANEL_ID = 'outline'
const DEBOUNCE_MS = 400
const MAX_LIST = 500

/**
 * @typedef {{
 *   maxLevel: number,
 *   tocStyle: 'bullet' | 'numbered',
 *   showLine: boolean,
 * }} Settings
 */

/**
 * @typedef {{
 *   level: number,
 *   text: string,
 *   line: number,
 * }} Heading
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  maxLevel: 3,
  tocStyle: 'bullet',
  showLine: true,
}

/** @type {Settings} */
let settings = { ...DEFAULT_SETTINGS }

/** @type {FaNotes.Panel | null} */
let panel = null

/**
 * Last snapshot for panel / commands.
 * @type {{
 *   available: boolean,
 *   headings: Heading[],
 * } | null}
 */
let snapshot = null

/** @type {ReturnType<typeof setTimeout> | 0} */
let refreshTimer = 0
let refreshBusy = false
let refreshQueued = false

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
  let maxLevel = Number(obj.maxLevel)
  if (!Number.isFinite(maxLevel) || maxLevel < 1) maxLevel = DEFAULT_SETTINGS.maxLevel
  maxLevel = Math.min(6, Math.max(1, Math.floor(maxLevel)))
  const tocStyle = obj.tocStyle === 'numbered' ? 'numbered' : 'bullet'
  const showLine = obj.showLine !== false
  return { maxLevel, tocStyle, showLine }
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

async function saveSettings() {
  try {
    await fanotes.storage.set(SETTINGS_KEY, settings)
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
 * Parse ATX headings (#–######). Ignores fenced code (``` / ~~~).
 * Skips levels above maxLevel. Line numbers are 1-based.
 * @param {string} text
 * @param {number} maxLevel
 * @returns {Heading[]}
 */
function parseHeadings(text, maxLevel) {
  const normalised = String(text ?? '').replace(/\r\n|\r/g, '\n')
  const lines = normalised.split('\n')
  /** @type {Heading[]} */
  const out = []
  let inFence = false
  let fenceChar = ''
  let fenceLen = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fenceMatch = /^(```+|~~~+)(.*)$/.exec(line)
    if (fenceMatch) {
      const ticks = fenceMatch[1]
      const ch = ticks[0]
      const len = ticks.length
      if (!inFence) {
        inFence = true
        fenceChar = ch
        fenceLen = len
      } else if (ch === fenceChar && len >= fenceLen && String(fenceMatch[2]).trim() === '') {
        inFence = false
        fenceChar = ''
        fenceLen = 0
      }
      // Lines that look like fences inside an open fence but do not close stay ignored.
      continue
    }
    if (inFence) continue

    const m = /^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line)
    if (!m) continue
    const level = m[1].length
    if (level > maxLevel) continue
    const headingText = m[2].trim()
    if (!headingText) continue
    out.push({ level, text: headingText, line: i + 1 })
    if (out.length >= MAX_LIST) break
  }
  return out
}

/**
 * Plain TOC lines – no markdown links / anchors.
 * Indent by (level − 1) × 2 spaces.
 * @param {Heading[]} headings
 * @param {'bullet' | 'numbered'} style
 */
function buildToc(headings, style) {
  if (!headings.length) return ''
  /** @type {string[]} */
  const lines = []
  let n = 0
  for (const h of headings) {
    const indent = '  '.repeat(Math.max(0, h.level - 1))
    if (style === 'numbered') {
      n += 1
      lines.push(`${indent}${n}. ${h.text}`)
    } else {
      lines.push(`${indent}- ${h.text}`)
    }
  }
  return lines.join('\n')
}

/**
 * Outline text for clipboard (same as TOC).
 * @param {Heading[]} headings
 */
function buildOutlineText(headings) {
  return buildToc(headings, settings.tocStyle)
}

async function compute() {
  let fullText = null
  try {
    fullText = await fanotes.editor.getText()
  } catch (error) {
    fanotes.log('editor.getText failed', errMessage(error))
    return { available: false, headings: /** @type {Heading[]} */ ([]) }
  }

  if (fullText === null) {
    return { available: false, headings: [] }
  }

  const headings = parseHeadings(fullText, settings.maxLevel)
  return { available: true, headings }
}

function renderBlocks() {
  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Gliederung', 'Heading Outline') },
  ]

  if (!snapshot || !snapshot.available) {
    blocks.push({
      type: 'callout',
      tone: 'info',
      text: t(
        'Kein Markdown-Editor geöffnet. Öffne eine Notiz im Schreibmodus, um Überschriften zu sehen.',
        'No Markdown editor is open. Open a note in writing mode to see headings.',
      ),
    })
    blocks.push({
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'refresh',
          label: t('Aktualisieren', 'Refresh'),
          primary: true,
        },
      ],
    })
    return blocks
  }

  const count = snapshot.headings.length

  blocks.push({
    type: 'keyvalue',
    items: [
      { key: t('Anzahl', 'Count'), value: String(count) },
      { key: t('Max. Ebene', 'Max level'), value: String(settings.maxLevel) },
    ],
  })

  blocks.push({
    type: 'select',
    id: 'maxLevel',
    label: t('Max. Überschriftenebene', 'Max heading level'),
    value: String(settings.maxLevel),
    options: [
      { value: '1', label: 'H1' },
      { value: '2', label: 'H1–H2' },
      { value: '3', label: 'H1–H3' },
      { value: '4', label: 'H1–H4' },
      { value: '5', label: 'H1–H5' },
      { value: '6', label: 'H1–H6' },
    ],
  })

  blocks.push({
    type: 'select',
    id: 'tocStyle',
    label: t('TOC-Stil', 'TOC style'),
    value: settings.tocStyle,
    options: [
      { value: 'bullet', label: t('Aufzählung (−)', 'Bullet (−)') },
      { value: 'numbered', label: t('Nummeriert (1.)', 'Numbered (1.)') },
    ],
  })

  blocks.push({
    type: 'checkbox',
    id: 'showLine',
    label: t('Zeilennummer anzeigen', 'Show line number'),
    checked: settings.showLine === true,
  })

  blocks.push({ type: 'divider' })

  if (!count) {
    blocks.push({
      type: 'callout',
      tone: 'info',
      text: t(
        'Keine ATX-Überschriften bis zur gewählten Ebene (Codeblöcke werden ignoriert).',
        'No ATX headings up to the selected level (fenced code is ignored).',
      ),
    })
  } else {
    blocks.push({
      type: 'list',
      id: 'headings',
      empty: t('Keine Überschriften.', 'No headings.'),
      items: snapshot.headings.map((h, index) => {
        const indent = '  '.repeat(Math.max(0, h.level - 1))
        /** @type {{ id: string, title: string, detail?: string, badge?: string }} */
        const item = {
          id: `h-${index}`,
          title: `${indent}${h.text}`,
          detail: `H${h.level}`,
        }
        if (settings.showLine) {
          item.badge = String(h.line)
        }
        return item
      }),
    })
    blocks.push({
      type: 'text',
      muted: true,
      text: t(
        'Klick auf eine Zeile kopiert den Überschriftentext. TOC ist reine Liste (− / 1.) ohne Markdown-Links oder Anker – kein Sprung im Editor.',
        'Click a row to copy the heading text. TOC is a plain list (− / 1.) without markdown links or anchors – no in-editor jump.',
      ),
    })
  }

  blocks.push({
    type: 'row',
    children: [
      {
        type: 'button',
        id: 'insert-toc',
        label: t('TOC einfügen', 'Insert TOC'),
        primary: true,
        disabled: count === 0,
      },
      {
        type: 'button',
        id: 'refresh',
        label: t('Aktualisieren', 'Refresh'),
      },
    ],
  })

  return blocks
}

async function updatePanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Gliederung', 'Heading Outline'))
  } catch (error) {
    if (isNoPanel(error)) {
      panel = null
      return
    }
    fanotes.log('panel update failed', errMessage(error))
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
    await updatePanel()
  } catch (error) {
    fanotes.log('refresh failed', errMessage(error))
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

function scheduleRefresh(delay = DEBOUNCE_MS) {
  clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = 0
    void refresh()
  }, delay)
}

/**
 * @param {string} text
 */
async function copyText(text) {
  try {
    await fanotes.clipboard.writeText(text)
    return true
  } catch (error) {
    await fanotes.ui.toast(
      t(`Kopieren fehlgeschlagen: ${errMessage(error)}`, `Copy failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

async function insertToc() {
  try {
    if (!snapshot || !snapshot.available) {
      snapshot = await compute()
    }
    if (!snapshot.available) {
      await fanotes.ui.toast(
        t('Kein Markdown-Editor geöffnet.', 'No Markdown editor is open.'),
        'error',
      )
      return
    }
    if (!snapshot.headings.length) {
      await fanotes.ui.toast(
        t('Keine Überschriften zum Einfügen.', 'No headings to insert.'),
        'info',
      )
      return
    }

    const toc = buildToc(snapshot.headings, settings.tocStyle)
    const ok = await fanotes.editor.insert(`${toc}\n`, 'cursor')
    if (!ok) {
      await fanotes.ui.toast(
        t('Kein Markdown-Editor geöffnet.', 'No Markdown editor is open.'),
        'error',
      )
      return
    }
    await fanotes.ui.toast(
      t('Inhaltsverzeichnis eingefügt.', 'Table of contents inserted.'),
      'success',
    )
    // Own editor write may trigger note:changed; refresh panel shortly.
    if (panel) scheduleRefresh(DEBOUNCE_MS)
  } catch (error) {
    await fanotes.ui.toast(
      t(`Einfügen fehlgeschlagen: ${errMessage(error)}`, `Insert failed: ${errMessage(error)}`),
      'error',
    )
  }
}

async function copyOutline() {
  try {
    if (!snapshot || !snapshot.available) {
      snapshot = await compute()
    }
    if (!snapshot.available) {
      await fanotes.ui.toast(
        t('Kein Markdown-Editor geöffnet.', 'No Markdown editor is open.'),
        'error',
      )
      return
    }
    if (!snapshot.headings.length) {
      await fanotes.ui.toast(
        t('Keine Überschriften zum Kopieren.', 'No headings to copy.'),
        'info',
      )
      return
    }
    const text = buildOutlineText(snapshot.headings)
    const ok = await copyText(text)
    if (ok) {
      await fanotes.ui.toast(
        t('Gliederung in die Zwischenablage kopiert.', 'Outline copied to clipboard.'),
        'success',
      )
    }
  } catch (error) {
    await fanotes.ui.toast(
      t(`Kopieren fehlgeschlagen: ${errMessage(error)}`, `Copy failed: ${errMessage(error)}`),
      'error',
    )
  }
}

/**
 * Apply settings from panel values object.
 * @param {Record<string, unknown>} values
 */
async function applySettingsFromValues(values) {
  const prev = { ...settings }
  let changed = false
  if (values.maxLevel != null) {
    let n = Number(String(values.maxLevel).trim())
    if (!Number.isFinite(n) || n < 1) n = DEFAULT_SETTINGS.maxLevel
    n = Math.min(6, Math.max(1, Math.floor(n)))
    if (n !== settings.maxLevel) {
      settings.maxLevel = n
      changed = true
    }
  }
  if (values.tocStyle === 'bullet' || values.tocStyle === 'numbered') {
    if (values.tocStyle !== settings.tocStyle) {
      settings.tocStyle = values.tocStyle
      changed = true
    }
  }
  if (values.showLine !== undefined) {
    const next = values.showLine === true || values.showLine === 'true'
    if (next !== settings.showLine) {
      settings.showLine = next
      changed = true
    }
  }
  if (changed) {
    const ok = await saveSettings()
    if (!ok) {
      settings = { ...prev }
      return false
    }
  }
  return changed
}

function openPanel() {
  try {
    if (panel) {
      void panel.show().catch((error) => {
        if (isNoPanel(error)) panel = null
        else fanotes.log('panel.show failed', errMessage(error))
      })
      void refresh()
      return
    }

    panel = fanotes.ui.panel({
      id: PANEL_ID,
      title: t('Gliederung', 'Heading Outline'),
      icon: '📑',
      blocks: renderBlocks(),
      focus: true,
    })

    panel.onAction(async (action) => {
      try {
        if (action.values) {
          await applySettingsFromValues(action.values)
        }

        if (action.id === 'refresh') {
          await refresh()
          return
        }
        if (action.id === 'insert-toc') {
          await insertToc()
          return
        }
        if (action.id === 'headings' && action.itemId) {
          const idx = Number(String(action.itemId).replace(/^h-/, ''))
          const heading =
            snapshot && snapshot.headings && Number.isFinite(idx)
              ? snapshot.headings[idx]
              : null
          if (!heading) {
            await fanotes.ui.toast(
              t('Überschrift nicht gefunden.', 'Heading not found.'),
              'info',
            )
            return
          }
          const ok = await copyText(heading.text)
          if (ok) {
            await fanotes.ui.toast(
              t('Überschrift kopiert.', 'Heading copied.'),
              'success',
            )
          }
          return
        }
      } catch (error) {
        fanotes.log('panel action failed', errMessage(error))
        await fanotes.ui.toast(
          t(
            `Aktion fehlgeschlagen: ${errMessage(error)}`,
            `Action failed: ${errMessage(error)}`,
          ),
          'error',
        )
      }
    })

    panel.onInput(async (input) => {
      try {
        if (input.id === 'maxLevel') {
          const prev = settings.maxLevel
          let n = Number(String(input.value ?? '').trim())
          if (!Number.isFinite(n) || n < 1) n = DEFAULT_SETTINGS.maxLevel
          settings.maxLevel = Math.min(6, Math.max(1, Math.floor(n)))
          const ok = await saveSettings()
          if (!ok) {
            settings.maxLevel = prev
            await updatePanel()
            return
          }
          await refresh()
          return
        }
        if (input.id === 'tocStyle') {
          const prev = settings.tocStyle
          settings.tocStyle = input.value === 'numbered' ? 'numbered' : 'bullet'
          const ok = await saveSettings()
          if (!ok) {
            settings.tocStyle = prev
            await updatePanel()
            return
          }
          await updatePanel()
          return
        }
        if (input.id === 'showLine') {
          const prev = settings.showLine
          settings.showLine = input.value === true
          const ok = await saveSettings()
          if (!ok) {
            settings.showLine = prev
            await updatePanel()
            return
          }
          await updatePanel()
        }
      } catch (error) {
        fanotes.log('onInput failed', errMessage(error))
      }
    })

    void refresh()
  } catch (error) {
    fanotes.log('openPanel failed', errMessage(error))
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
  title: t('Gliederung öffnen', 'Open Heading Outline'),
  detail: t(
    'ATX-Überschriften der offenen Notiz als Gliederung anzeigen',
    'Show ATX headings of the open note as an outline',
  ),
  keywords:
    'gliederung outline überschrift heading toc inhaltsverzeichnis struktur structure markdown',
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
  id: 'insert-toc',
  title: t('Inhaltsverzeichnis einfügen', 'Insert table of contents'),
  detail: t(
    'TOC als Aufzählung oder Nummerierung am Cursor (ohne Links/Anker)',
    'TOC as bullet or numbered list at cursor (no links/anchors)',
  ),
  keywords:
    'toc inhaltsverzeichnis gliederung outline einfügen insert bullet numbered liste list',
  run: async () => {
    try {
      await insertToc()
    } catch (error) {
      await fanotes.ui.toast(
        t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`),
        'error',
      )
    }
  },
})

fanotes.commands.register({
  id: 'copy-outline',
  title: t('Gliederung kopieren', 'Copy outline'),
  detail: t(
    'Überschriftenliste in die Zwischenablage (TOC-Stil)',
    'Heading list to clipboard (TOC style)',
  ),
  keywords:
    'gliederung outline kopieren copy zwischenablage clipboard toc überschrift heading',
  run: async () => {
    try {
      await copyOutline()
    } catch (error) {
      await fanotes.ui.toast(
        t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`),
        'error',
      )
    }
  },
})

fanotes.onActivate(async () => {
  try {
    await loadSettings()
    fanotes.log(
      'heading-outline activated',
      fanotes.app.appVersion,
      fanotes.app.language,
      settings.maxLevel,
      settings.tocStyle,
    )

    // Refresh only while the outline panel is open (reference held).
    fanotes.events.on('note:opened', () => {
      if (!panel) return
      scheduleRefresh(200)
    })

    fanotes.events.on('mode:changed', () => {
      if (!panel) return
      scheduleRefresh(200)
    })

    // note:changed needs notes:read per SDK; Vollspec omits it – gate safely.
    if (fanotes.hasPermission('notes:read')) {
      fanotes.events.on('note:changed', () => {
        if (!panel) return
        scheduleRefresh(DEBOUNCE_MS)
      })
    }
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(() => {
  clearTimeout(refreshTimer)
  refreshTimer = 0
  refreshBusy = false
  refreshQueued = false
  panel = null
  snapshot = null
})
