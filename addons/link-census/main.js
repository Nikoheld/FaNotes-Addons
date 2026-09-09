/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Link-Zensus / Link Census – count wikilinks, MD-links, bare https URLs and
// images in the ACTIVE note only. Abgrenzung: url-collector / media-refs /
// wikilink-map = Vault/Sammeln; hier = nur aktive Notiz Zähler + kurze Listen.
// Kein notes.list Soft. Text Soft: editor.getText() || notes.read(active).

const SETTINGS_KEY = 'settings'
const PANEL_ID = 'census'
const STATUS_ID = 'census'
const DEBOUNCE_MS = 400
const DEFAULT_LIST_MAX = 30
const LIST_TITLE_LEN = 60

/** Spec Soft: wikilinks [[...]] */
const WIKILINK_RE = /\[\[[^\]]+\]\]/g
/** Spec Soft: images ![...](...) — matched before MD links Soft. */
const IMAGE_RE = /!\[[^\]]*\]\([^)]+\)/g
/** Spec Soft: md links [...](...); images blanked first Soft. */
const MD_LINK_RE = /\[[^\]]*\]\([^)]+\)/g
/** Bare https:// URLs Soft (url-collector style). */
const URL_RE = /https:\/\/[^\s<>\]\)]+/gi
const TRAILING_PUNCT_RE = /[.,;:)]+$/

/**
 * @typedef {{
 *   showStatus: boolean,
 *   listMax: number,
 * }} Settings
 */

/**
 * @typedef {{
 *   kind: 'wiki' | 'md' | 'url' | 'img',
 *   target: string,
 *   raw: string,
 * }} LinkItem
 */

/**
 * @typedef {{
 *   available: boolean,
 *   path: string | null,
 *   title: string | null,
 *   wikilinks: number,
 *   mdLinks: number,
 *   urls: number,
 *   images: number,
 *   items: LinkItem[],
 * }} Snapshot
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  showStatus: true,
  listMax: DEFAULT_LIST_MAX,
}

/** @type {Settings} */
let settings = { ...DEFAULT_SETTINGS }

/** @type {FaNotes.Panel | null} */
let panel = null

/** @type {Snapshot} */
let snapshot = emptySnapshot()

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

function emptySnapshot() {
  return {
    available: false,
    path: null,
    title: null,
    wikilinks: 0,
    mdLinks: 0,
    urls: 0,
    images: 0,
    items: /** @type {LinkItem[]} */ ([]),
  }
}

/**
 * Clamp listMax Soft 5–100 (default 30).
 * @param {unknown} raw
 */
function clampListMax(raw) {
  let n = Number(raw)
  if (!Number.isFinite(n)) n = DEFAULT_LIST_MAX
  n = Math.floor(n)
  if (n < 5) n = 5
  if (n > 100) n = 100
  return n
}

/**
 * @param {unknown} raw
 * @returns {Settings}
 */
function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const obj = /** @type {Record<string, unknown>} */ (raw)
  return {
    showStatus: obj.showStatus !== false,
    listMax: clampListMax(obj.listMax),
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
 * @param {Settings} [rollback]
 * @returns {Promise<boolean>}
 */
async function saveSettings(rollback) {
  try {
    await fanotes.storage.set(SETTINGS_KEY, {
      showStatus: settings.showStatus === true,
      listMax: settings.listMax,
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
 * Soft basename without extension.
 * @param {string} path
 */
function basenameNoExt(path) {
  const raw = String(path ?? '')
  const slash = Math.max(raw.lastIndexOf('/'), raw.lastIndexOf('\\'))
  const base = slash >= 0 ? raw.slice(slash + 1) : raw
  const dot = base.lastIndexOf('.')
  if (dot > 0) return base.slice(0, dot)
  return base || raw
}

/**
 * Truncate Soft for list titles.
 * @param {string} s
 * @param {number} maxLen
 */
function truncate(s, maxLen) {
  const str = String(s ?? '')
  if (str.length <= maxLen) return str
  if (maxLen <= 1) return '…'
  return `${str.slice(0, maxLen - 1)}…`
}

/**
 * Strip fenced ``` / ~~~ blocks Soft (url-collector / media-refs style).
 * @param {string} text
 */
function stripFencedCode(text) {
  const normalised = String(text ?? '').replace(/\r\n|\r/g, '\n')
  const lines = normalised.split('\n')
  /** @type {string[]} */
  const out = []
  let inFence = false
  let fenceChar = ''
  let fenceLen = 0

  for (const line of lines) {
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
      out.push('')
      continue
    }
    out.push(inFence ? '' : line)
  }
  return out.join('\n')
}

/**
 * Soft blank a span in a working copy (avoid re-matching nested Soft).
 * @param {string} s
 * @param {number} start
 * @param {number} end
 */
function blankSpan(s, start, end) {
  return s.slice(0, start) + ' '.repeat(Math.max(0, end - start)) + s.slice(end)
}

/**
 * Trim trailing punctuation Soft from bare URL matches.
 * @param {string} raw
 */
function trimUrlPunct(raw) {
  return String(raw ?? '').replace(TRAILING_PUNCT_RE, '')
}

/**
 * Extract target Soft from [[inner]] (drop #heading / |alias Soft).
 * @param {string} raw
 */
function wikiTarget(raw) {
  const inner = String(raw ?? '').replace(/^\[\[/, '').replace(/\]\]$/, '')
  const noAlias = inner.split('|')[0] || inner
  const noHash = noAlias.split('#')[0] || noAlias
  return noHash.trim() || inner.trim()
}

/**
 * Extract target Soft from ![alt](target) / [label](target).
 * @param {string} raw
 */
function mdTarget(raw) {
  const m = /\(([^)]+)\)\s*$/.exec(String(raw ?? ''))
  return m ? String(m[1]).trim() : String(raw ?? '').trim()
}

/**
 * Parse Soft: fence-skip, then images → md links → wikilinks → bare https.
 * Counts + ordered items (first-seen Soft). listMax applied later Soft.
 * @param {string} text
 * @returns {{ wikilinks: number, mdLinks: number, urls: number, images: number, items: LinkItem[] }}
 */
function parseLinks(text) {
  const prose = stripFencedCode(text)
  /** @type {LinkItem[]} */
  const items = []
  let working = prose

  // 1) Images ![…](…) Soft — blank so MD-link regex cannot re-match.
  IMAGE_RE.lastIndex = 0
  let m
  /** @type {Array<{ start: number, end: number, raw: string }>} */
  const imageMatches = []
  while ((m = IMAGE_RE.exec(prose)) !== null) {
    imageMatches.push({ start: m.index, end: m.index + m[0].length, raw: m[0] })
  }
  for (let i = imageMatches.length - 1; i >= 0; i--) {
    const hit = imageMatches[i]
    working = blankSpan(working, hit.start, hit.end)
  }
  for (const hit of imageMatches) {
    items.push({ kind: 'img', target: mdTarget(hit.raw), raw: hit.raw })
  }

  // 2) MD links […](…) Soft (images already blanked).
  MD_LINK_RE.lastIndex = 0
  /** @type {Array<{ start: number, end: number, raw: string }>} */
  const mdMatches = []
  while ((m = MD_LINK_RE.exec(working)) !== null) {
    mdMatches.push({ start: m.index, end: m.index + m[0].length, raw: m[0] })
  }
  for (let i = mdMatches.length - 1; i >= 0; i--) {
    const hit = mdMatches[i]
    working = blankSpan(working, hit.start, hit.end)
  }
  for (const hit of mdMatches) {
    items.push({ kind: 'md', target: mdTarget(hit.raw), raw: hit.raw })
  }

  // 3) Wikilinks [[…]] Soft
  WIKILINK_RE.lastIndex = 0
  /** @type {Array<{ start: number, end: number, raw: string }>} */
  const wikiMatches = []
  while ((m = WIKILINK_RE.exec(working)) !== null) {
    wikiMatches.push({ start: m.index, end: m.index + m[0].length, raw: m[0] })
  }
  for (let i = wikiMatches.length - 1; i >= 0; i--) {
    const hit = wikiMatches[i]
    working = blankSpan(working, hit.start, hit.end)
  }
  for (const hit of wikiMatches) {
    items.push({ kind: 'wiki', target: wikiTarget(hit.raw), raw: hit.raw })
  }

  // 4) Bare https:// Soft (already-blanked spans Soft avoid double-count)
  URL_RE.lastIndex = 0
  while ((m = URL_RE.exec(working)) !== null) {
    const url = trimUrlPunct(m[0])
    if (!url || !url.startsWith('https://')) continue
    items.push({ kind: 'url', target: url, raw: url })
  }

  const images = items.filter((i) => i.kind === 'img').length
  const mdLinks = items.filter((i) => i.kind === 'md').length
  const wikilinks = items.filter((i) => i.kind === 'wiki').length
  const urls = items.filter((i) => i.kind === 'url').length

  return { wikilinks, mdLinks, urls, images, items }
}

/**
 * Text Soft: editor.getText() || notes.read(active) Soft via notes.active().
 * Soft: no notes.list Soft.
 * @returns {Promise<{ available: boolean, text: string, path: string | null, title: string | null }>}
 */
async function readActiveText() {
  /** @type {FaNotes.ActiveNote | null} */
  let active = null
  try {
    active = await fanotes.notes.active()
  } catch (error) {
    fanotes.log('notes.active failed', errMessage(error))
  }

  const path = active && typeof active.path === 'string' ? active.path : null
  const titleRaw = active && typeof active.title === 'string' ? active.title.trim() : ''
  const title = path ? titleRaw || basenameNoExt(path) || path : null

  try {
    const editorText = await fanotes.editor.getText()
    if (editorText !== null && editorText !== undefined) {
      return {
        available: true,
        text: String(editorText),
        path,
        title,
      }
    }
  } catch (error) {
    fanotes.log('editor.getText failed', errMessage(error))
  }

  if (!path) {
    return { available: false, text: '', path: null, title: null }
  }

  // Soft: skip non-markdown kinds when known Soft.
  if (active && active.kind && active.kind !== 'markdown' && active.kind !== 'none') {
    return { available: false, text: '', path, title }
  }

  try {
    const text = await fanotes.notes.read(path)
    return {
      available: true,
      text: String(text ?? ''),
      path,
      title,
    }
  } catch (error) {
    fanotes.log('notes.read failed', errMessage(error))
    return { available: false, text: '', path, title }
  }
}

/**
 * Active note only Soft — no vault list Soft.
 * @returns {Promise<Snapshot>}
 */
async function compute() {
  const read = await readActiveText()
  if (!read.available) {
    return {
      ...emptySnapshot(),
      path: read.path,
      title: read.title,
    }
  }

  const parsed = parseLinks(read.text)
  return {
    available: true,
    path: read.path,
    title: read.title,
    wikilinks: parsed.wikilinks,
    mdLinks: parsed.mdLinks,
    urls: parsed.urls,
    images: parsed.images,
    items: parsed.items,
  }
}

/**
 * Summary text Soft for clipboard / toast.
 */
function formatSummary() {
  if (!snapshot.available) {
    return t(
      'Keine aktive Notiz – kein Link-Zensus.',
      'No active note – no link census.',
    )
  }
  return t(
    `Wikilinks: ${snapshot.wikilinks} | MD-Links: ${snapshot.mdLinks} | URLs: ${snapshot.urls} | Bilder: ${snapshot.images}`,
    `Wikilinks: ${snapshot.wikilinks} | MD links: ${snapshot.mdLinks} | URLs: ${snapshot.urls} | Images: ${snapshot.images}`,
  )
}

/**
 * Badge label Soft.
 * @param {LinkItem['kind']} kind
 */
function badgeFor(kind) {
  if (kind === 'wiki') return 'wiki'
  if (kind === 'md') return 'md'
  if (kind === 'url') return 'url'
  return 'img'
}

/**
 * Soft detail for list Soft.
 * @param {LinkItem} item
 */
function detailFor(item) {
  if (item.kind === 'wiki') return t('Wikilink', 'Wikilink')
  if (item.kind === 'md') return t('MD-Link', 'MD link')
  if (item.kind === 'url') return 'URL'
  return t('Bild', 'Image')
}

function renderBlocks() {
  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Link-Zensus', 'Link Census'), level: 2 },
  ]

  if (!snapshot.available) {
    blocks.push({
      type: 'callout',
      tone: 'info',
      text: t(
        'Keine aktive Notiz. Öffne eine Markdown-Notiz, um Wikilinks, MD-Links, URLs und Bilder zu zählen. Kein Vault-Scan.',
        'No active note. Open a Markdown note to count wikilinks, MD links, URLs and images. No vault scan.',
      ),
    })
  } else {
    blocks.push({
      type: 'text',
      muted: true,
      text: snapshot.title || snapshot.path || '',
    })

    blocks.push({
      type: 'keyvalue',
      items: [
        { key: t('Wikilinks', 'Wikilinks'), value: String(snapshot.wikilinks) },
        { key: t('MD-Links', 'MD links'), value: String(snapshot.mdLinks) },
        { key: t('URLs', 'URLs'), value: String(snapshot.urls) },
        { key: t('Bilder', 'Images'), value: String(snapshot.images) },
      ],
    })

    const limited = snapshot.items.slice(0, settings.listMax)
    if (limited.length === 0) {
      blocks.push({
        type: 'text',
        muted: true,
        text: t(
          'Keine Links oder Bilder in dieser Notiz (fenced Soft übersprungen).',
          'No links or images in this note (fenced Soft skipped).',
        ),
      })
    } else {
      blocks.push({
        type: 'list',
        id: 'items',
        empty: t('Keine Einträge.', 'No items.'),
        items: limited.map((item, idx) => ({
          id: `${item.kind}:${idx}:${item.target}`,
          title: truncate(item.target || item.raw, LIST_TITLE_LEN),
          detail: detailFor(item),
          badge: badgeFor(item.kind),
        })),
      })
      if (snapshot.items.length > settings.listMax) {
        blocks.push({
          type: 'text',
          muted: true,
          text: t(
            `… +${snapshot.items.length - settings.listMax} weitere (listMax ${settings.listMax})`,
            `… +${snapshot.items.length - settings.listMax} more (listMax ${settings.listMax})`,
          ),
        })
      }
    }
  }

  blocks.push({ type: 'divider' })

  blocks.push({
    type: 'checkbox',
    id: 'showStatus',
    label: t('Statusleiste anzeigen', 'Show status bar'),
    checked: settings.showStatus === true,
  })

  blocks.push({
    type: 'input',
    id: 'listMax',
    label: t('Max. Listeneinträge (5–100)', 'Max list items (5–100)'),
    value: String(settings.listMax),
    placeholder: String(DEFAULT_LIST_MAX),
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
      {
        type: 'button',
        id: 'copy-summary',
        label: t('Summary kopieren', 'Copy summary'),
      },
    ],
  })

  blocks.push({
    type: 'text',
    muted: true,
    text: t(
      'Nur die aktive Notiz. Abgrenzung: url-collector / media-refs / wikilink-map = Vault/Sammeln; hier = Zähler + kurze Listen. Fenced ``` Soft übersprungen.',
      'Active note only. Distinction: url-collector / media-refs / wikilink-map = vault/collect; here = counters + short lists. Fenced ``` Soft skipped.',
    ),
  })

  return blocks
}

/**
 * Status Soft: `🔗 W/U` counts when showStatus (W=wikilinks, U=urls).
 */
async function updateStatus() {
  try {
    if (!settings.showStatus || !snapshot.available) {
      await fanotes.ui.status.remove(STATUS_ID)
      return
    }
    const text = `🔗 ${snapshot.wikilinks}/${snapshot.urls}`
    await fanotes.ui.status.set({
      id: STATUS_ID,
      text: text.slice(0, 60),
      title: t('Link-Zensus öffnen', 'Open Link Census'),
      onClick: () => {
        try {
          openPanel()
        } catch (error) {
          fanotes.log('status onClick', errMessage(error))
        }
      },
    })
  } catch (error) {
    fanotes.log('updateStatus failed', errMessage(error))
  }
}

async function updatePanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Link-Zensus', 'Link Census'))
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
    await updateStatus()
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

/**
 * Soft debounce — active only Soft (no vault list Soft).
 * @param {number} [delay]
 */
function scheduleRefresh(delay = DEBOUNCE_MS) {
  // Gate: only when showStatus or panel open Soft
  if (!settings.showStatus && !panel) return
  clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = 0
    if (!settings.showStatus && !panel) return
    void refresh()
  }, delay)
}

/**
 * Copy summary Soft via clipboard.writeText (path-copier Soft).
 */
async function copySummary() {
  try {
    snapshot = await compute()
    await updateStatus()
    await updatePanel()
    const summary = formatSummary()
    try {
      const ok = await fanotes.clipboard.writeText(summary)
      if (ok === false) {
        await fanotes.ui.toast(
          t('Kopieren fehlgeschlagen.', 'Copy failed.'),
          'error',
        )
        return
      }
    } catch (error) {
      await fanotes.ui.toast(
        t(`Kopieren fehlgeschlagen: ${errMessage(error)}`, `Copy failed: ${errMessage(error)}`),
        'error',
      )
      return
    }
    await fanotes.ui.toast(
      t('Zusammenfassung kopiert.', 'Summary copied.'),
      'success',
    )
  } catch (error) {
    await fanotes.ui.toast(
      t(
        `Zusammenfassung fehlgeschlagen: ${errMessage(error)}`,
        `Summary failed: ${errMessage(error)}`,
      ),
      'error',
    )
  }
}

/**
 * Soft: tap list row → copy target Soft (clipboard Soft).
 * @param {string} itemId
 */
async function copyItem(itemId) {
  const id = String(itemId ?? '')
  // id format: kind:idx:target — recover from limited list Soft
  const limited = snapshot.items.slice(0, settings.listMax)
  const match = limited.find((item, idx) => `${item.kind}:${idx}:${item.target}` === id)
  if (!match) {
    await fanotes.ui.toast(t('Kein Eintrag.', 'No item.'), 'info')
    return
  }
  try {
    const ok = await fanotes.clipboard.writeText(match.target || match.raw)
    if (ok === false) {
      await fanotes.ui.toast(t('Kopieren fehlgeschlagen.', 'Copy failed.'), 'error')
      return
    }
    await fanotes.ui.toast(t('Ziel kopiert.', 'Target copied.'), 'success')
  } catch (error) {
    await fanotes.ui.toast(
      t(`Kopieren fehlgeschlagen: ${errMessage(error)}`, `Copy failed: ${errMessage(error)}`),
      'error',
    )
  }
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
      title: t('Link-Zensus', 'Link Census'),
      icon: '🔗',
      blocks: renderBlocks(),
      focus: true,
    })

    panel.onAction(async (action) => {
      try {
        if (action.id === 'refresh' || action.id === 'submit:listMax') {
          const values = action.values || {}
          if (values.listMax != null) {
            const rollback = { ...settings }
            settings.listMax = clampListMax(values.listMax)
            const ok = await saveSettings(rollback)
            if (!ok) {
              await updatePanel()
              return
            }
          }
          await refresh()
          return
        }
        if (action.id === 'copy-summary') {
          await copySummary()
          return
        }
        if (action.id === 'items' && action.itemId) {
          await copyItem(String(action.itemId))
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
        if (input.id === 'showStatus') {
          const rollback = { ...settings }
          settings.showStatus = input.value === true
          const ok = await saveSettings(rollback)
          if (!ok) {
            await updatePanel()
            return
          }
          await updateStatus()
          await updatePanel()
          return
        }
        if (input.id === 'listMax') {
          const rollback = { ...settings }
          settings.listMax = clampListMax(input.value)
          const ok = await saveSettings(rollback)
          if (!ok) {
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

// --- Commands ----------------------------------------------------------------

fanotes.commands.register({
  id: 'open',
  title: t('Link-Zensus öffnen', 'Open Link Census'),
  detail: t(
    'Wikilinks, URLs und Bilder der aktiven Notiz zählen',
    'Count wikilinks, URLs and images in the active note',
  ),
  keywords:
    'links census wikilink url count structure active zensus öffnen open panel',
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
  id: 'refresh',
  title: t('Link-Zensus aktualisieren', 'Refresh Link Census'),
  detail: t(
    'Zähler der aktiven Notiz neu berechnen',
    'Recompute counts for the active note',
  ),
  keywords:
    'links census wikilink url count aktualisieren refresh active zensus',
  run: async () => {
    try {
      await refresh()
      if (!snapshot.available) {
        await fanotes.ui.toast(
          t('Keine aktive Notiz geöffnet.', 'No active note is open.'),
          'info',
        )
        return
      }
      await fanotes.ui.toast(
        t(
          `Aktualisiert: ${snapshot.wikilinks}W / ${snapshot.urls}U / ${snapshot.images}B`,
          `Updated: ${snapshot.wikilinks}W / ${snapshot.urls}U / ${snapshot.images}I`,
        ),
        'success',
      )
    } catch (error) {
      await fanotes.ui.toast(
        t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`),
        'error',
      )
    }
  },
})

fanotes.commands.register({
  id: 'copy-summary',
  title: t('Link-Zensus Summary kopieren', 'Copy Link Census summary'),
  detail: t(
    'Kurzfassung (Wikilinks/MD/URLs/Bilder) in die Zwischenablage',
    'Copy short summary (wikilinks/MD/URLs/images) to the clipboard',
  ),
  keywords:
    'links census summary kopieren copy clipboard wikilink url zensus',
  run: async () => {
    try {
      await copySummary()
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
      'link-census activated',
      fanotes.app.appVersion,
      fanotes.app.language,
      settings.showStatus,
      settings.listMax,
    )

    // Soft refresh on note:opened / note:saved debounce — active only Soft
    fanotes.events.on('note:opened', () => {
      scheduleRefresh(200)
    })

    fanotes.events.on('note:saved', () => {
      scheduleRefresh(DEBOUNCE_MS)
    })

    // Activate Soft: if showStatus one refresh of active note Soft
    // (allowed — active only, not vault list Scan-Gate Soft)
    if (settings.showStatus) {
      let active = null
      try {
        active = await fanotes.notes.active()
      } catch (error) {
        fanotes.log('activate notes.active failed', errMessage(error))
      }
      if (active && active.path) {
        await refresh()
      } else {
        snapshot = emptySnapshot()
        await updateStatus()
      }
    }
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(async () => {
  clearTimeout(refreshTimer)
  refreshTimer = 0
  refreshBusy = false
  refreshQueued = false
  try {
    await fanotes.ui.status.remove(STATUS_ID)
  } catch {
    // Host also clears status on deactivate Soft.
  }
  panel = null
  snapshot = emptySnapshot()
})
