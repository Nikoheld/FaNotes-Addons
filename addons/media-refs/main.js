/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Medien-Verweise / Media Refs – list image and PDF references in the note or a vault sample.
// Abgrenzung: url-collector = https links; hier = Markdown-Medien ![alt](path|url)
// und bare .pdf/.png/.jpg/.jpeg/.webp/.gif Pfade.
// No network / vault:write / notes:write.
// Scan-gate: notes.list / notes.read never onActivate (settings only).

const SETTINGS_KEY = 'settings'
const PANEL_ID = 'media'
const DEFAULT_MAX_NOTES = 200
const DEFAULT_MAX_ITEMS = 150
const LIST_TITLE_LEN = 60
const MD_EXT_RE = /\.(md|markdown)$/iu
/** Markdown image embeds: ![alt](target) */
const MD_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g
/** Bare media paths; skip targets already inside ](…) via lookbehind. */
const BARE_MEDIA_RE = /(?<![(\w])([^\s)]+\.(?:pdf|png|jpe?g|webp|gif))/gi
const IMAGE_EXT_RE = /\.(?:png|jpe?g|webp|gif)$/iu
const PDF_EXT_RE = /\.pdf$/iu

/**
 * @typedef {'active' | 'vault'} Scope
 */

/**
 * @typedef {{
 *   scope: Scope,
 *   maxNotes: number,
 *   maxItems: number,
 * }} Settings
 */

/**
 * @typedef {{
 *   target: string,
 *   alt: string,
 *   kind: 'img' | 'pdf',
 *   sources: Array<{ path: string, title: string }>,
 * }} MediaHit
 */

/**
 * @typedef {{
 *   scope: Scope,
 *   scanned: number,
 *   hits: MediaHit[],
 *   builtAt: number,
 * }} View
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  scope: 'active',
  maxNotes: DEFAULT_MAX_NOTES,
  maxItems: DEFAULT_MAX_ITEMS,
}

/** @type {Settings} */
let settings = { ...DEFAULT_SETTINGS }

/** @type {FaNotes.Panel | null} */
let panel = null

/** @type {View | null} */
let view = null

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
 * Clamp maxNotes to integer 50–1000 Soft.
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
 * Clamp maxItems to integer 20–500 Soft.
 * @param {unknown} raw
 */
function clampMaxItems(raw) {
  let n = Number(raw)
  if (!Number.isFinite(n)) n = DEFAULT_MAX_ITEMS
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
    maxItems: clampMaxItems(obj.maxItems),
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
      maxItems: settings.maxItems,
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
 * Strip fenced ``` / ~~~ blocks Soft — heading-outline / note-splitter style.
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
 * Kind from target path/URL Soft: pdf → pdf, image ext → img; markdown embed without known ext → img.
 * @param {string} target
 * @param {boolean} fromMdImage
 * @returns {'img' | 'pdf'}
 */
function kindFromTarget(target, fromMdImage) {
  const t0 = String(target ?? '').trim()
  // Strip query/hash Soft for extension check on URLs.
  const bare = t0.split(/[?#]/)[0] || t0
  if (PDF_EXT_RE.test(bare)) return 'pdf'
  if (IMAGE_EXT_RE.test(bare)) return 'img'
  return fromMdImage ? 'img' : 'img'
}

/**
 * Extract media refs from note text (fenced skipped Soft).
 * Returns ordered unique targets with first-seen alt/kind.
 * @param {string} text
 * @returns {Array<{ target: string, alt: string, kind: 'img' | 'pdf' }>}
 */
function extractMedia(text) {
  const prose = stripFencedCode(text)
  /** @type {Array<{ target: string, alt: string, kind: 'img' | 'pdf' }>} */
  const found = []
  /** @type {Set<string>} */
  const seen = new Set()

  // Soft: blank Markdown image spans so bare regex cannot re-match inside ![…](…).
  let proseForBare = prose
  MD_IMAGE_RE.lastIndex = 0
  let m
  while ((m = MD_IMAGE_RE.exec(prose)) !== null) {
    const alt = String(m[1] ?? '').trim()
    const target = String(m[2] ?? '').trim()
    if (target && !seen.has(target)) {
      seen.add(target)
      found.push({ target, alt, kind: kindFromTarget(target, true) })
    }
    const start = m.index
    const end = m.index + m[0].length
    proseForBare =
      proseForBare.slice(0, start) + ' '.repeat(end - start) + proseForBare.slice(end)
  }

  BARE_MEDIA_RE.lastIndex = 0
  while ((m = BARE_MEDIA_RE.exec(proseForBare)) !== null) {
    const target = String(m[1] ?? '').trim()
    if (!target) continue
    // Soft: reject junk spans leftover from links / punctuation (spec lookbehind alone is not enough).
    if (/[\]!\(\[]/.test(target)) continue
    if (seen.has(target)) continue
    seen.add(target)
    found.push({ target, alt: '', kind: kindFromTarget(target, false) })
  }

  return found
}

/**
 * Merge hit into ordered map keyed by exact target string.
 * @param {Map<string, MediaHit>} map
 * @param {{ target: string, alt: string, kind: 'img' | 'pdf' }} ref
 * @param {string} path
 * @param {string} title
 */
function addMediaHit(map, ref, path, title) {
  let hit = map.get(ref.target)
  if (!hit) {
    hit = {
      target: ref.target,
      alt: ref.alt,
      kind: ref.kind,
      sources: [],
    }
    map.set(ref.target, hit)
  } else if (!hit.alt && ref.alt) {
    // Soft: keep first alt; fill if earlier was empty.
    hit.alt = ref.alt
  }
  if (!hit.sources.some((s) => s.path === path)) {
    hit.sources.push({ path, title })
  }
}

/**
 * Scan active note or vault cap for media refs (SCAN GATE).
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

    /** @type {Map<string, MediaHit>} */
    const byTarget = new Map()
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
      for (const ref of extractMedia(text)) {
        addMediaHit(byTarget, ref, active.path, title)
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
        for (const ref of extractMedia(text)) {
          addMediaHit(byTarget, ref, note.path, title)
        }
      }
    }

    /** @type {MediaHit[]} */
    const hits = Array.from(byTarget.values())
    // Stable: first-seen order from Map insertion; cap by maxItems.
    const limited = hits.slice(0, settings.maxItems)

    view = {
      scope: settings.scope,
      scanned,
      hits: limited,
      builtAt: Date.now(),
    }
    scannedOnce = true

    if (!opts.silent) {
      await fanotes.ui.toast(
        t(
          `Scan: ${limited.length} Medien-Verweis(e) (${scanned} Notiz(en)).`,
          `Scan: ${limited.length} media ref(s) (${scanned} note(s)).`,
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
    if (scanQueued) {
      scanQueued = false
      void rescan({ silent: true })
    }
  }
}

/**
 * List detail: alt || kind || source title Soft.
 * @param {MediaHit} h
 */
function hitDetail(h) {
  const alt = (h.alt && String(h.alt).trim()) || ''
  if (alt) return alt
  if (h.kind) return h.kind
  const first = h.sources[0]
  return (first && first.title) || '–'
}

/**
 * Click → clipboard.writeText(target) + toast Soft (SDK has writeText, not write).
 * @param {MediaHit} hit
 */
async function copyOne(hit) {
  if (!hit || !hit.target) {
    await fanotes.ui.toast(
      t('Kein Verweis ausgewählt.', 'No reference selected.'),
      'info',
    )
    return
  }
  try {
    await fanotes.clipboard.writeText(hit.target)
    await fanotes.ui.toast(t('Verweis kopiert.', 'Reference copied.'), 'success')
  } catch (error) {
    await fanotes.ui.toast(
      t(`Kopieren fehlgeschlagen: ${errMessage(error)}`, `Copy failed: ${errMessage(error)}`),
      'error',
    )
  }
}

/**
 * Copy all collected targets joined by newline (copy-list).
 */
async function copyList() {
  if (!view || !view.hits.length) {
    if (!scannedOnce) {
      await rescan({ silent: true })
    }
  }
  if (!view || !view.hits.length) {
    await fanotes.ui.toast(
      t('Keine Verweise zum Kopieren.', 'No references to copy.'),
      'info',
    )
    return
  }
  const text = view.hits.map((h) => h.target).join('\n')
  try {
    await fanotes.clipboard.writeText(text)
    await fanotes.ui.toast(
      t(`${view.hits.length} Verweis(e) kopiert.`, `${view.hits.length} reference(s) copied.`),
      'success',
    )
  } catch (error) {
    await fanotes.ui.toast(
      t(`Kopieren fehlgeschlagen: ${errMessage(error)}`, `Copy failed: ${errMessage(error)}`),
      'error',
    )
  }
}

function renderBlocks() {
  const countLabel = view
    ? String(view.hits.length)
    : scanning
      ? '…'
      : scannedOnce
        ? '0'
        : '–'

  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Medien-Verweise', 'Media Refs'), level: 2 },
    {
      type: 'callout',
      tone: 'info',
      text: t(
        'Abgrenzung: url-collector = https-Links · hier = Markdown-Medien ![alt](…) und bare .pdf/.png/.jpg/.jpeg/.webp/.gif. Keine Binärvorschau.',
        'Distinction: url-collector = https links · here = Markdown media ![alt](…) and bare .pdf/.png/.jpg/.jpeg/.webp/.gif. No binary preview.',
      ),
    },
    {
      type: 'keyvalue',
      items: [
        { key: t('Verweise', 'Refs'), value: countLabel },
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
      id: 'maxItems',
      label: t('Max. Verweise in der Liste (20–500)', 'Max refs in list (20–500)'),
      value: String(settings.maxItems),
      placeholder: String(DEFAULT_MAX_ITEMS),
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
        'Keine Bild-/PDF-Verweise unter diesen Einstellungen.',
        'No image/PDF references under these settings.',
      ),
    })
  } else if (view) {
    blocks.push({
      type: 'list',
      id: 'hits',
      empty: t('Keine Verweise.', 'No references.'),
      items: view.hits.map((h) => {
        const firstTitle = (h.sources[0] && h.sources[0].title) || ''
        // Soft detail: alt || kind || source title; also show source when alt present Soft.
        let detail = hitDetail(h)
        if (h.alt && firstTitle) {
          detail = `${h.alt} · ${firstTitle}`
        } else if (!h.alt && firstTitle && detail === h.kind) {
          detail = `${h.kind} · ${firstTitle}`
        }
        return {
          id: h.target,
          title: truncate(h.target, LIST_TITLE_LEN),
          detail,
          badge: h.kind,
        }
      }),
    })

    blocks.push({
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'copy-list',
          label: t('Alle kopieren', 'Copy all'),
          disabled: scanning || !view.hits.length,
        },
      ],
    })

    blocks.push({
      type: 'text',
      muted: true,
      text: t(
        'Eintrag tippen → Ziel in die Zwischenablage. Relative Vault-Pfade und https bleiben unverändert.',
        'Tap a row → copy the target to the clipboard. Relative vault paths and https stay unchanged.',
      ),
    })
  }

  blocks.push({ type: 'divider' })
  blocks.push({
    type: 'text',
    muted: true,
    text: t(
      `Keine Binärvorschau · Scope ${settings.scope} · Cap ${settings.maxNotes} · maxItems ${settings.maxItems} · fenced \`\`\` Soft übersprungen · Abgrenzung url-collector · kein Netz/Schreiben.`,
      `No binary preview · scope ${settings.scope} · cap ${settings.maxNotes} · maxItems ${settings.maxItems} · fenced \`\`\` Soft skipped · distinction url-collector · no network/write.`,
    ),
  })

  return blocks
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Medien-Verweise', 'Media Refs'))
  } catch (error) {
    if (isNoPanel(error)) {
      panel = null
      return
    }
    fanotes.log('refreshPanel', errMessage(error))
  }
}

/**
 * Open panel + scan Soft (scan-gate entry via open / refresh / rescan / copy-list).
 * @param {{ silent?: boolean }} [opts]
 */
async function openAndScan(opts = {}) {
  const silent = opts.silent !== false
  await rescan({ silent: true })
  if (!silent && view) {
    await fanotes.ui.toast(
      t(
        `${view.hits.length} Verweis(e) (${view.scanned} gescannt).`,
        `${view.hits.length} reference(s) (${view.scanned} scanned).`,
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
      title: t('Medien-Verweise', 'Media Refs'),
      icon: '🖼',
      blocks: renderBlocks(),
      focus: true,
    })

    panel.onAction(async (action) => {
      try {
        if (
          action.id === 'refresh' ||
          action.id === 'submit:maxNotes' ||
          action.id === 'submit:maxItems'
        ) {
          const values = action.values || {}
          const rollback = { ...settings }
          if (values.scope != null) settings.scope = normalizeScope(values.scope)
          if (values.maxNotes != null) settings.maxNotes = clampMaxNotes(values.maxNotes)
          if (values.maxItems != null) settings.maxItems = clampMaxItems(values.maxItems)
          const ok = await saveSettings(rollback)
          if (!ok) {
            await refreshPanel()
            return
          }
          await rescan({ silent: false })
          return
        }
        if (action.id === 'copy-list') {
          await copyList()
          return
        }
        if (action.id === 'hits' && action.itemId) {
          const target = String(action.itemId)
          const hit = view && view.hits.find((h) => h.target === target)
          if (!hit) return
          await copyOne(hit)
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
        if (input.id === 'maxItems') {
          const rollback = { ...settings }
          settings.maxItems = clampMaxItems(input.value)
          const ok = await saveSettings(rollback)
          if (!ok) {
            await refreshPanel()
            return
          }
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
  title: t('Medien-Verweise öffnen', 'Open Media Refs'),
  detail: t(
    'Panel mit Bild- und PDF-Verweisen aus Notizen zum Kopieren',
    'Panel of image and PDF references from notes to copy',
  ),
  keywords: 'media bild pdf image attachment embed verweise refs öffnen open',
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
  title: t('Medien-Verweise aktualisieren', 'Refresh Media Refs scan'),
  detail: t(
    'Aktive Notiz oder Vault erneut auf Bild-/PDF-Verweise scannen',
    'Re-scan active note or vault for image/PDF references',
  ),
  keywords: 'media bild pdf rescan aktualisieren refresh scan verweise',
  run: async () => {
    try {
      await rescan({ silent: false })
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'copy-list',
  title: t('Alle Medien-Verweise kopieren', 'Copy all media refs'),
  detail: t(
    'Gesammelte Bild-/PDF-Ziele zeilenweise in die Zwischenablage',
    'Copy collected image/PDF targets to the clipboard, one per line',
  ),
  keywords: 'media bild pdf kopieren copy clipboard alle all verweise list',
  run: async () => {
    try {
      await copyList()
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
    fanotes.log(
      'media-refs activated',
      fanotes.app.appVersion,
      settings.scope,
      settings.maxNotes,
      settings.maxItems,
    )
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(async () => {
  scanning = false
  scanQueued = false
  scannedOnce = false
  panel = null
  view = null
})
