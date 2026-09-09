/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Link-Sammler / URL Collector – collect https links from notes to copy or open.
// Abgrenzung: quote-collector = editor quotes → Quotes.md; wikilink-map = [[wikilinks]].
// Only https (no http). No network / vault:write / notes:write.
// Scan-gate: notes.list / notes.read never onActivate (settings only).

const SETTINGS_KEY = 'settings'
const PANEL_ID = 'urls'
const STATUS_ID = 'urls'
const DEFAULT_MAX_NOTES = 200
const DEFAULT_MAX_URLS = 200
const LIST_TITLE_LEN = 60
const MD_EXT_RE = /\.(md|markdown)$/iu
/** Spec URL regex; trailing .,;:) trimmed after match. */
const URL_RE = /https:\/\/[^\s<>\]\)]+/gi
const TRAILING_PUNCT_RE = /[.,;:)]+$/

/**
 * @typedef {'active' | 'vault'} Scope
 */

/**
 * @typedef {{
 *   scope: Scope,
 *   maxNotes: number,
 *   maxUrls: number,
 *   showStatus: boolean,
 * }} Settings
 */

/**
 * @typedef {{
 *   url: string,
 *   sourcePaths: string[],
 *   sourceTitles: string[],
 * }} UrlHit
 */

/**
 * @typedef {{
 *   scope: Scope,
 *   scanned: number,
 *   hits: UrlHit[],
 *   builtAt: number,
 * }} View
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  scope: 'active',
  maxNotes: DEFAULT_MAX_NOTES,
  maxUrls: DEFAULT_MAX_URLS,
  showStatus: false,
}

/** @type {Settings} */
let settings = { ...DEFAULT_SETTINGS }

/** @type {FaNotes.Panel | null} */
let panel = null

/** @type {View | null} */
let view = null

/** Selected URL string (exact first-seen casing). */
let selectedUrl = ''

/** True after at least one successful scan this session. */
let scannedOnce = false

let scanning = false
let scanQueued = false

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
 * @returns {Scope}
 */
function normalizeScope(raw) {
  return raw === 'vault' ? 'vault' : 'active'
}

/**
 * Clamp maxNotes to integer 50–1000.
 * @param {unknown} raw
 */
function clampMaxNotes(raw) {
  let n = Number(raw)
  if (!Number.isFinite(n)) n = DEFAULT_MAX_NOTES
  n = Math.floor(n)
  if (n < 50) n = 50
  if (n > 1000) n = 1000
  return n
}

/**
 * Clamp maxUrls to integer 20–500.
 * @param {unknown} raw
 */
function clampMaxUrls(raw) {
  let n = Number(raw)
  if (!Number.isFinite(n)) n = DEFAULT_MAX_URLS
  n = Math.floor(n)
  if (n < 20) n = 20
  if (n > 500) n = 500
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
    scope: normalizeScope(obj.scope),
    maxNotes: clampMaxNotes(obj.maxNotes),
    maxUrls: clampMaxUrls(obj.maxUrls),
    showStatus: obj.showStatus === true,
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
      scope: settings.scope,
      maxNotes: settings.maxNotes,
      maxUrls: settings.maxUrls,
      showStatus: settings.showStatus,
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
 * Compare modifiedAt descending (ISO localeCompare); missing dates last.
 * @param {string | null | undefined} a
 * @param {string | null | undefined} b
 */
function compareModifiedDesc(a, b) {
  const aMissing = a == null || a === ''
  const bMissing = b == null || b === ''
  if (aMissing && !bMissing) return 1
  if (!aMissing && bMissing) return -1
  if (aMissing && bMissing) return 0
  return String(b).localeCompare(String(a))
}

/**
 * Basename without `.md` / `.markdown`.
 * @param {string} path
 */
function basenameNoExt(path) {
  const base = String(path).split('/').pop() || String(path)
  return base.replace(/\.(md|markdown)$/iu, '')
}

/**
 * Strip fenced ``` / ~~~ blocks (line-state toggle) Soft — recommended.
 * @param {string} text
 */
function stripFencedCode(text) {
  const normalised = String(text ?? '').replace(/\r\n|\r/g, '\n')
  const lines = normalised.split('\n')
  /** @type {string[]} */
  const out = []
  let inFence = false
  for (const line of lines) {
    const trimmed = line.trimStart()
    const isFence = trimmed.startsWith('```') || trimmed.startsWith('~~~')
    if (isFence) {
      inFence = !inFence
      out.push('')
      continue
    }
    out.push(inFence ? '' : line)
  }
  return out.join('\n')
}

/**
 * Trim trailing punctuation .,;:) from a URL match.
 * @param {string} raw
 */
function trimUrlPunct(raw) {
  return String(raw ?? '').replace(TRAILING_PUNCT_RE, '')
}

/**
 * Truncate display string to maxLen (append … when cut).
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
 * Extract https URLs from note text (fenced skipped Soft).
 * Dedup key = exact string after trim trailing punct (keep first-seen casing).
 * @param {string} text
 * @returns {string[]}
 */
function extractUrls(text) {
  const prose = stripFencedCode(text)
  /** @type {string[]} */
  const found = []
  /** @type {Set<string>} */
  const seen = new Set()
  URL_RE.lastIndex = 0
  let m
  while ((m = URL_RE.exec(prose)) !== null) {
    const url = trimUrlPunct(m[0])
    if (!url || !url.startsWith('https://')) continue
    if (seen.has(url)) continue
    seen.add(url)
    found.push(url)
  }
  return found
}

/**
 * Status `🔗 N` only when showStatus && scannedOnce (N = URL count).
 */
async function updateStatus() {
  try {
    if (!settings.showStatus || !scannedOnce) {
      await fanotes.ui.status.remove(STATUS_ID)
      return
    }
    const n = view ? view.hits.length : 0
    await fanotes.ui.status.set({
      id: STATUS_ID,
      text: `🔗 ${n}`,
      title: t('Link-Sammler öffnen', 'Open URL Collector'),
      onClick: () => {
        try {
          openPanel()
        } catch (error) {
          fanotes.log('status onClick failed', errMessage(error))
        }
      },
    })
  } catch (error) {
    fanotes.log('updateStatus failed', errMessage(error))
  }
}

/**
 * Merge URL into ordered map keyed by exact URL string.
 * @param {Map<string, UrlHit>} map
 * @param {string} url
 * @param {string} path
 * @param {string} title
 */
function addUrlHit(map, url, path, title) {
  let hit = map.get(url)
  if (!hit) {
    hit = { url, sourcePaths: [], sourceTitles: [] }
    map.set(url, hit)
  }
  if (!hit.sourcePaths.includes(path)) {
    hit.sourcePaths.push(path)
    hit.sourceTitles.push(title)
  }
}

/**
 * Scan active note or vault cap for https links (SCAN GATE).
 * @param {{ silent?: boolean }} [opts]
 */
async function rescan(opts = {}) {
  if (scanning) {
    scanQueued = true
    return
  }
  scanning = true
  try {
    if (panel) await refreshPanel()

    /** @type {Map<string, UrlHit>} */
    const byUrl = new Map()
    let scanned = 0

    if (settings.scope === 'active') {
      let active = null
      try {
        active = await fanotes.notes.active()
      } catch (error) {
        await fanotes.ui.toast(
          t(`Aktive Notiz fehlgeschlagen: ${errMessage(error)}`, `Active note failed: ${errMessage(error)}`),
          'error',
        )
        return
      }
      if (!active || !MD_EXT_RE.test(active.path)) {
        view = {
          scope: settings.scope,
          scanned: 0,
          hits: [],
          builtAt: Date.now(),
        }
        scannedOnce = true
        if (!opts.silent) {
          await fanotes.ui.toast(
            t('Keine aktive Markdown-Notiz.', 'No active Markdown note.'),
            'info',
          )
        }
        return
      }
      let text = ''
      try {
        text = await fanotes.notes.read(active.path)
      } catch (error) {
        await fanotes.ui.toast(
          t(`Lesen fehlgeschlagen: ${errMessage(error)}`, `Read failed: ${errMessage(error)}`),
          'error',
        )
        return
      }
      scanned = 1
      const title = (active.title && String(active.title).trim()) || basenameNoExt(active.path)
      for (const url of extractUrls(text)) {
        addUrlHit(byUrl, url, active.path, title)
      }
    } else {
      let notes = []
      try {
        notes = await fanotes.notes.list()
      } catch (error) {
        await fanotes.ui.toast(
          t(`Notizenliste fehlgeschlagen: ${errMessage(error)}`, `Note list failed: ${errMessage(error)}`),
          'error',
        )
        return
      }
      const mdNotes = notes.filter((n) => MD_EXT_RE.test(n.path))
      const sorted = mdNotes.slice().sort((a, b) => {
        const byDate = compareModifiedDesc(a.modifiedAt, b.modifiedAt)
        if (byDate !== 0) return byDate
        return a.path.localeCompare(b.path)
      })
      const capped = sorted.slice(0, settings.maxNotes)
      scanned = capped.length
      for (const note of capped) {
        let text = ''
        try {
          text = await fanotes.notes.read(note.path)
        } catch (error) {
          fanotes.log('read failed', note.path, errMessage(error))
          continue
        }
        const title = (note.title && String(note.title).trim()) || basenameNoExt(note.path)
        for (const url of extractUrls(text)) {
          addUrlHit(byUrl, url, note.path, title)
        }
      }
    }

    /** @type {UrlHit[]} */
    const hits = Array.from(byUrl.values())
    // Stable: first-seen order from Map insertion; cap by maxUrls.
    const limited = hits.slice(0, settings.maxUrls)

    view = {
      scope: settings.scope,
      scanned,
      hits: limited,
      builtAt: Date.now(),
    }
    scannedOnce = true

    if (selectedUrl) {
      const still = limited.some((h) => h.url === selectedUrl)
      if (!still) selectedUrl = ''
    }

    if (!opts.silent) {
      await fanotes.ui.toast(
        t(
          `Scan: ${limited.length} URL(s) (${scanned} Notiz(en)).`,
          `Scan: ${limited.length} URL(s) (${scanned} note(s)).`,
        ),
        'success',
      )
    }
  } catch (error) {
    try {
      await fanotes.ui.toast(
        t(`Scan fehlgeschlagen: ${errMessage(error)}`, `Scan failed: ${errMessage(error)}`),
        'error',
      )
    } catch {
      fanotes.log('rescan failed', errMessage(error))
    }
  } finally {
    scanning = false
    await refreshPanel()
    await updateStatus()
    if (scanQueued) {
      scanQueued = false
      void rescan({ silent: true })
    }
  }
}

/**
 * @returns {UrlHit | null}
 */
function resolveSelectedHit() {
  if (!view || !view.hits.length) return null
  if (selectedUrl) {
    const found = view.hits.find((h) => h.url === selectedUrl)
    if (found) return found
  }
  return null
}

/**
 * Copy one URL to clipboard (direct; no confirm).
 * @param {UrlHit} [hit]
 */
async function copyOne(hit) {
  const target = hit || resolveSelectedHit()
  if (!target) {
    await fanotes.ui.toast(
      t('Keine URL ausgewählt.', 'No URL selected.'),
      'info',
    )
    return
  }
  try {
    await fanotes.clipboard.writeText(target.url)
    await fanotes.ui.toast(t('URL kopiert.', 'URL copied.'), 'success')
  } catch (error) {
    await fanotes.ui.toast(
      t(`Kopieren fehlgeschlagen: ${errMessage(error)}`, `Copy failed: ${errMessage(error)}`),
      'error',
    )
  }
}

/**
 * Open URL externally (host shows its own confirm for https).
 * Soft: also confirm when selection is missing via toast.
 * @param {UrlHit} [hit]
 */
async function openOne(hit) {
  const target = hit || resolveSelectedHit()
  if (!target) {
    await fanotes.ui.toast(
      t('Keine URL ausgewählt.', 'No URL selected.'),
      'info',
    )
    return
  }
  if (!target.url.startsWith('https://')) {
    await fanotes.ui.toast(
      t('Nur https-Links werden geöffnet.', 'Only https links can be opened.'),
      'info',
    )
    return
  }
  try {
    // ui.openExternal already prompts the user before opening.
    const ok = await fanotes.ui.openExternal(target.url)
    if (!ok) {
      await fanotes.ui.toast(t('Öffnen abgebrochen.', 'Open cancelled.'), 'info')
    }
  } catch (error) {
    await fanotes.ui.toast(
      t(`Öffnen fehlgeschlagen: ${errMessage(error)}`, `Open failed: ${errMessage(error)}`),
      'error',
    )
  }
}

/**
 * Copy all collected URLs joined by newline.
 */
async function copyAll() {
  if (!view || !view.hits.length) {
    if (!scannedOnce) {
      await rescan({ silent: true })
    }
  }
  if (!view || !view.hits.length) {
    await fanotes.ui.toast(
      t('Keine URLs zum Kopieren.', 'No URLs to copy.'),
      'info',
    )
    return
  }
  const text = view.hits.map((h) => h.url).join('\n')
  try {
    await fanotes.clipboard.writeText(text)
    await fanotes.ui.toast(
      t(`${view.hits.length} URL(s) kopiert.`, `${view.hits.length} URL(s) copied.`),
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
 * Soft: list click selects the hit. Copy / Open via dedicated buttons
 * (SDK confirm is yes/no only — no three-way Kopieren|Öffnen|Abbrechen).
 * openExternal still shows the host confirm when used.
 * @param {UrlHit} hit
 */
async function onHitClickAction(hit) {
  selectedUrl = hit.url
  await refreshPanel()
}

function renderBlocks() {
  const urlLabel = view
    ? String(view.hits.length)
    : scanning
      ? '…'
      : scannedOnce
        ? '0'
        : '–'

  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Link-Sammler', 'URL Collector'), level: 2 },
    {
      type: 'callout',
      tone: 'info',
      text: t(
        'Abgrenzung: quote-collector = Editor-Zitate → Quotes.md · wikilink-map = [[Wikilinks]] · hier = https-URLs aus Notiztext.',
        'Distinction: quote-collector = editor quotes → Quotes.md · wikilink-map = [[wikilinks]] · here = https URLs from note text.',
      ),
    },
    {
      type: 'keyvalue',
      items: [
        { key: t('URLs', 'URLs'), value: urlLabel },
        {
          key: t('Gescannt', 'Scanned'),
          value: view ? String(view.scanned) : scanning ? '…' : '–',
        },
      ],
    },
    {
      type: 'select',
      id: 'scope',
      label: t('Bereich', 'Scope'),
      value: settings.scope,
      options: [
        { value: 'active', label: t('Aktive Notiz', 'Active note') },
        { value: 'vault', label: t('Vault (Cap)', 'Vault (cap)') },
      ],
    },
    {
      type: 'input',
      id: 'maxNotes',
      label: t('Max. Notizen im Vault-Scan (50–1000)', 'Max notes in vault scan (50–1000)'),
      value: String(settings.maxNotes),
      placeholder: String(DEFAULT_MAX_NOTES),
    },
    {
      type: 'input',
      id: 'maxUrls',
      label: t('Max. URLs in der Liste (20–500)', 'Max URLs in list (20–500)'),
      value: String(settings.maxUrls),
      placeholder: String(DEFAULT_MAX_URLS),
    },
    {
      type: 'checkbox',
      id: 'showStatus',
      label: t('Statusleiste 🔗 N anzeigen', 'Show status bar 🔗 N'),
      checked: settings.showStatus === true,
    },
    {
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'refresh',
          label: scanning
            ? t('Scan …', 'Scanning …')
            : t('Aktualisieren', 'Refresh'),
          primary: true,
          disabled: scanning,
        },
      ],
    },
  ]

  if (!scannedOnce && !scanning) {
    blocks.push({
      type: 'text',
      muted: true,
      text: t(
        'Noch nicht gescannt – „Aktualisieren“ tippen.',
        'Not scanned yet – tap “Refresh”.',
      ),
    })
  } else if (view && view.hits.length === 0) {
    blocks.push({
      type: 'text',
      muted: true,
      text: t(
        'Keine https-Links unter diesen Einstellungen.',
        'No https links under these settings.',
      ),
    })
  } else if (view) {
    const selected = resolveSelectedHit()

    blocks.push({
      type: 'list',
      id: 'hits',
      empty: t('Keine URLs.', 'No URLs.'),
      items: view.hits.map((h) => {
        const sel = selectedUrl === h.url ? ' ★' : ''
        const firstTitle = h.sourceTitles[0] || h.sourcePaths[0] || '–'
        const n = h.sourcePaths.length
        return {
          id: h.url,
          title: `${truncate(h.url, LIST_TITLE_LEN)}${sel}`,
          detail: firstTitle,
          badge: String(n),
        }
      }),
    })

    blocks.push({
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'copy-one',
          label: t('Kopieren', 'Copy'),
          disabled: scanning || !selected,
        },
        {
          type: 'button',
          id: 'open-one',
          label: t('Öffnen', 'Open'),
          disabled: scanning || !selected,
        },
        {
          type: 'button',
          id: 'copy-all',
          label: t('Alle kopieren', 'Copy all'),
          disabled: scanning || !view.hits.length,
        },
      ],
    })

    if (!selected) {
      blocks.push({
        type: 'text',
        muted: true,
        text: t(
          'URL antippen → Auswahl · dann „Kopieren“ oder „Öffnen“ (openExternal bestätigt der Host).',
          'Tap a URL → select · then “Copy” or “Open” (host confirms openExternal).',
        ),
      })
    } else {
      blocks.push({
        type: 'text',
        muted: true,
        text: truncate(selected.url, 200),
      })
    }
  }

  blocks.push({ type: 'divider' })
  blocks.push({
    type: 'text',
    muted: true,
    text: t(
      `Nur https (kein http) · kein net.fetch · keine Online-Prüfung · Scope ${settings.scope} · Cap ${settings.maxNotes} · maxUrls ${settings.maxUrls} · fenced \`\`\` Soft übersprungen · Abgrenzung quote-collector / wikilink-map.`,
      `https only (no http) · no net.fetch · no online check · scope ${settings.scope} · cap ${settings.maxNotes} · maxUrls ${settings.maxUrls} · fenced \`\`\` Soft skipped · distinction quote-collector / wikilink-map.`,
    ),
  })

  return blocks
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Link-Sammler', 'URL Collector'))
  } catch (error) {
    if (isNoPanel(error)) {
      panel = null
      return
    }
    fanotes.log('refreshPanel', errMessage(error))
  }
}

/**
 * Open panel + scan (scan-gate entry).
 * @param {{ silent?: boolean }} [opts]
 */
async function openAndScan(opts = {}) {
  const silent = opts.silent !== false
  await rescan({ silent: true })
  if (!silent && view) {
    await fanotes.ui.toast(
      t(
        `${view.hits.length} URL(s) (${view.scanned} gescannt).`,
        `${view.hits.length} URL(s) (${view.scanned} scanned).`,
      ),
      'info',
    )
  }
}

function openPanel() {
  try {
    if (panel) {
      void panel.show().catch((error) => {
        if (isNoPanel(error)) panel = null
        else fanotes.log('panel.show', errMessage(error))
      })
      void openAndScan({ silent: true })
      return
    }

    panel = fanotes.ui.panel({
      id: PANEL_ID,
      title: t('Link-Sammler', 'URL Collector'),
      icon: '🔗',
      blocks: renderBlocks(),
      focus: true,
    })

    panel.onAction(async (action) => {
      try {
        if (
          action.id === 'refresh' ||
          action.id === 'submit:maxNotes' ||
          action.id === 'submit:maxUrls'
        ) {
          const values = action.values || {}
          const rollback = { ...settings }
          if (values.scope != null) settings.scope = normalizeScope(values.scope)
          if (values.maxNotes != null) settings.maxNotes = clampMaxNotes(values.maxNotes)
          if (values.maxUrls != null) settings.maxUrls = clampMaxUrls(values.maxUrls)
          if (values.showStatus != null) settings.showStatus = values.showStatus === true
          const ok = await saveSettings(rollback)
          if (!ok) {
            await refreshPanel()
            return
          }
          await rescan({ silent: false })
          return
        }
        if (action.id === 'copy-one') {
          await copyOne()
          return
        }
        if (action.id === 'open-one') {
          await openOne()
          return
        }
        if (action.id === 'copy-all') {
          await copyAll()
          return
        }
        if (action.id === 'hits' && action.itemId) {
          const url = String(action.itemId)
          const hit = view && view.hits.find((h) => h.url === url)
          if (!hit) return
          // Soft: select + optional open confirm (yes/no SDK); prefer buttons for copy/open.
          await onHitClickAction(hit)
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
        if (input.id === 'scope') {
          const rollback = { ...settings }
          settings.scope = normalizeScope(input.value)
          const ok = await saveSettings(rollback)
          if (!ok) {
            await refreshPanel()
            return
          }
          await refreshPanel()
          return
        }
        if (input.id === 'maxNotes') {
          const rollback = { ...settings }
          settings.maxNotes = clampMaxNotes(input.value)
          const ok = await saveSettings(rollback)
          if (!ok) {
            await refreshPanel()
            return
          }
          return
        }
        if (input.id === 'maxUrls') {
          const rollback = { ...settings }
          settings.maxUrls = clampMaxUrls(input.value)
          const ok = await saveSettings(rollback)
          if (!ok) {
            await refreshPanel()
            return
          }
          return
        }
        if (input.id === 'showStatus') {
          const rollback = { ...settings }
          settings.showStatus = input.value === true
          const ok = await saveSettings(rollback)
          if (!ok) {
            await refreshPanel()
            return
          }
          await updateStatus()
          await refreshPanel()
        }
      } catch (error) {
        fanotes.log('onInput', errMessage(error))
      }
    })

    void openAndScan({ silent: true })
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
  title: t('Link-Sammler öffnen', 'Open URL Collector'),
  detail: t(
    'Panel mit https-Links aus Notizen zum Kopieren oder Öffnen',
    'Panel of https links from notes to copy or open',
  ),
  keywords: 'url link https quellen sources collector sammler öffnen open',
  run: () => {
    try {
      openPanel()
    } catch (error) {
      void fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'rescan',
  title: t('Link-Sammler-Scan aktualisieren', 'Refresh URL Collector scan'),
  detail: t(
    'Aktive Notiz oder Vault erneut auf https-Links scannen',
    'Re-scan active note or vault for https links',
  ),
  keywords: 'url link https rescan aktualisieren refresh scan collector',
  run: async () => {
    try {
      await rescan({ silent: false })
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'copy-all',
  title: t('Alle URLs kopieren', 'Copy all URLs'),
  detail: t(
    'Gesammelte https-Links zeilenweise in die Zwischenablage',
    'Copy collected https links to the clipboard, one per line',
  ),
  keywords: 'url link https kopieren copy clipboard alle all collector',
  run: async () => {
    try {
      await copyAll()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.onActivate(async () => {
  try {
    // Light work only: settings. NO notes.list / notes.read (scan-gate).
    await loadSettings()
    scannedOnce = false
    view = null
    selectedUrl = ''
    try {
      await fanotes.ui.status.remove(STATUS_ID)
    } catch {
      // Cold status may not exist.
    }
    fanotes.log(
      'url-collector activated',
      fanotes.app.appVersion,
      settings.scope,
      settings.maxNotes,
      settings.maxUrls,
      settings.showStatus,
    )
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(async () => {
  scanning = false
  scanQueued = false
  scannedOnce = false
  selectedUrl = ''
  try {
    await fanotes.ui.status.remove(STATUS_ID)
  } catch {
    // Host tears down UI; ignore.
  }
  panel = null
  view = null
})
