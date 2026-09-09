/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Kaputte Einbettungen / Broken Embeds – find image/PDF embeds whose vault
// target file is missing. Abgrenzung: media-refs = alle Verweise listen;
// url-collector = https; orphan-notes = Wikilinks; hier = lokale Media-
// Targets gegen notes.exists / notes.list.
// Scan-gate: notes.list / notes.read / notes.exists never onActivate.
// v1: no notes:write / network / vault:write.

const SETTINGS_KEY = 'settings'
const PANEL_ID = 'broken'
const STATUS_ID = 'broken'
const DEFAULT_MAX_NOTES = 250
const LIST_TITLE_LEN = 60
const MD_EXT_RE = /\.(md|markdown)$/iu
/** Markdown image embeds: ![alt](target) — same as media-refs. */
const MD_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g
/** Bare media paths; skip targets already inside ](…) via lookbehind. */
const BARE_MEDIA_RE = /(?<![(\w])([^\s)]+\.(?:pdf|png|jpe?g|webp|gif))/gi

/**
 * @typedef {'active' | 'vault'} Scope
 */

/**
 * @typedef {{
 *   scope: Scope,
 *   maxNotes: number,
 *   folder: string,
 *   showStatus: boolean,
 * }} Settings
 */

/**
 * @typedef {{
 *   target: string,
 *   resolved: string,
 *   sourcePath: string,
 *   sourceTitle: string,
 * }} BrokenHit
 */

/**
 * @typedef {{
 *   scope: Scope,
 *   scanned: number,
 *   brokenCount: number,
 *   hits: BrokenHit[],
 *   builtAt: number,
 * }} View
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  scope: 'active',
  maxNotes: DEFAULT_MAX_NOTES,
  folder: '',
  showStatus: false,
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

/** Draft folder shown in the panel (may differ until Refresh). */
let folderDraft = ''

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
 * Clamp maxNotes to integer 1–2000.
 * @param {unknown} raw
 */
function clampMaxNotes(raw) {
  let n = Number(raw)
  if (!Number.isFinite(n)) n = DEFAULT_MAX_NOTES
  n = Math.floor(n)
  if (n < 1) n = 1
  if (n > 2000) n = 2000
  return n
}

/**
 * Vault-relative folder prefix: no leading/trailing `/`, no `..`.
 * Empty string = vault root (all notes). Returns null if invalid.
 * @param {unknown} raw
 * @returns {string | null}
 */
function normalizeFolder(raw) {
  let folder = String(raw ?? '').trim().replace(/\\/g, '/')
  while (folder.startsWith('/')) folder = folder.slice(1)
  while (folder.endsWith('/')) folder = folder.slice(0, -1)
  if (!folder) return ''
  const parts = folder.split('/').filter(Boolean)
  if (!parts.length || parts.some((p) => p === '.' || p === '..')) return null
  return parts.join('/')
}

/**
 * @param {string} notePath
 * @param {string} folder
 */
function inFolder(notePath, folder) {
  if (folder === '') return true
  const path = String(notePath).replace(/\\/g, '/')
  return path === folder || path.startsWith(`${folder}/`)
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
 * Parent folder of a vault path ('' at vault root).
 * @param {string} path
 */
function dirnamePath(path) {
  const norm = String(path ?? '').replace(/\\/g, '/')
  const idx = norm.lastIndexOf('/')
  if (idx < 0) return ''
  return norm.slice(0, idx)
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
 * Strip fenced ``` / ~~~ blocks — media-refs / heading-outline style.
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
 * Extract local media targets from note text (fenced skipped).
 * Same patterns as media-refs; https:// targets skipped (not vault-broken).
 * @param {string} text
 * @returns {string[]}
 */
function extractMediaTargets(text) {
  const prose = stripFencedCode(text)
  /** @type {string[]} */
  const found = []
  /** @type {Set<string>} */
  const seen = new Set()

  let proseForBare = prose
  MD_IMAGE_RE.lastIndex = 0
  let m
  while ((m = MD_IMAGE_RE.exec(prose)) !== null) {
    const target = String(m[2] ?? '').trim()
    if (target && !seen.has(target)) {
      seen.add(target)
      found.push(target)
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
    if (/[\]!\(\[]/.test(target)) continue
    if (seen.has(target)) continue
    seen.add(target)
    found.push(target)
  }

  return found
}

/**
 * Resolve a raw embed target to a vault-relative path.
 * Decode; reject `..`; join with note folder; normalize.
 * Returns null for https / other schemes / invalid / `..`.
 * @param {string} rawTarget
 * @param {string} notePath
 * @returns {string | null}
 */
function resolveMediaTarget(rawTarget, notePath) {
  let target = String(rawTarget ?? '').trim()
  if (!target) return null

  // Strip surrounding quotes from Markdown destinations.
  if (
    (target.startsWith('"') && target.endsWith('"')) ||
    (target.startsWith("'") && target.endsWith("'"))
  ) {
    target = target.slice(1, -1).trim()
  }
  if (!target) return null

  // Skip remote / non-vault schemes (https ignored per README).
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return null

  // Decode percent-encoding when possible.
  try {
    target = decodeURIComponent(target)
  } catch {
    // Keep undecoded if malformed.
  }

  // Drop query/hash for existence checks.
  target = (target.split(/[?#]/)[0] || '').trim()
  if (!target) return null

  target = target.replace(/\\/g, '/')
  while (target.startsWith('/')) target = target.slice(1)

  const base = dirnamePath(notePath)
  const joined = base ? `${base}/${target}` : target

  /** @type {string[]} */
  const parts = []
  for (const part of joined.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') return null
    parts.push(part)
  }
  if (!parts.length) return null
  return parts.join('/')
}

/**
 * @param {unknown} raw
 * @returns {Settings}
 */
function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const obj = /** @type {Record<string, unknown>} */ (raw)

  const folderNorm = normalizeFolder(obj.folder != null ? String(obj.folder) : '')
  const folder = folderNorm === null ? '' : folderNorm

  return {
    scope: normalizeScope(obj.scope),
    maxNotes: clampMaxNotes(obj.maxNotes),
    folder,
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
  folderDraft = settings.folder
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
      folder: settings.folder,
      showStatus: settings.showStatus,
    })
    return true
  } catch (error) {
    if (rollback) settings = { ...rollback }
    folderDraft = settings.folder
    await fanotes.ui.toast(
      t(`Speichern fehlgeschlagen: ${errMessage(error)}`, `Save failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

/**
 * Apply folder (+ optional scope) from panel values / drafts.
 * @param {Record<string, unknown>} [values]
 * @param {{ silent?: boolean }} [opts]
 * @returns {Promise<boolean>}
 */
async function applySettingsFromValues(values, opts = {}) {
  const rawFolder = values && values.folder != null ? values.folder : folderDraft
  const folderNorm = normalizeFolder(rawFolder)
  if (folderNorm === null) {
    await fanotes.ui.toast(
      t('Ungültiger Ordnerpfad (kein „..“ erlaubt).', 'Invalid folder path (".." is not allowed).'),
      'error',
    )
    return false
  }

  const rollback = { ...settings }
  if (values && values.scope != null) settings.scope = normalizeScope(values.scope)
  settings.folder = folderNorm
  folderDraft = folderNorm

  const ok = await saveSettings(rollback)
  if (!ok) {
    await refreshPanel()
    return false
  }

  if (!opts.silent) {
    await fanotes.ui.toast(
      t(
        `Einstellungen übernommen${settings.folder ? ` (Ordner: ${settings.folder})` : ''}.`,
        `Settings applied${settings.folder ? ` (folder: ${settings.folder})` : ''}.`,
      ),
      'success',
    )
  }
  return true
}

/**
 * Build Set of all notes.list paths; missing if not in set and !exists(target).
 * @param {string[]} candidates
 * @param {Set<string>} vaultPaths
 * @returns {Promise<Set<string>>} resolved paths that are missing
 */
async function findMissingResolved(candidates, vaultPaths) {
  /** @type {Set<string>} */
  const missing = new Set()
  /** @type {Set<string>} */
  const checked = new Set()

  for (const resolved of candidates) {
    if (!resolved || checked.has(resolved)) continue
    checked.add(resolved)
    if (vaultPaths.has(resolved)) continue
    let exists = false
    try {
      exists = await fanotes.notes.exists(resolved)
    } catch (error) {
      fanotes.log('exists failed', resolved, errMessage(error))
      exists = false
    }
    if (!exists) missing.add(resolved)
  }
  return missing
}

/**
 * Scan active note or vault for broken local media embeds (SCAN GATE).
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

    /** @type {BrokenHit[]} */
    const pending = []
    let scanned = 0

    // Always need vault path set for existence checks.
    let allNotes = []
    try {
      allNotes = await fanotes.notes.list()
    } catch (error) {
      await fanotes.ui.toast(
        t(`Notizenliste fehlgeschlagen: ${errMessage(error)}`, `Note list failed: ${errMessage(error)}`),
        'error',
      )
      return
    }

    /** @type {Set<string>} */
    const vaultPaths = new Set()
    for (const n of allNotes) {
      if (n && n.path) vaultPaths.add(String(n.path).replace(/\\/g, '/'))
    }

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
          brokenCount: 0,
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
      // Folder filter applies to active too when set.
      if (!inFolder(active.path, settings.folder)) {
        view = {
          scope: settings.scope,
          scanned: 0,
          brokenCount: 0,
          hits: [],
          builtAt: Date.now(),
        }
        scannedOnce = true
        if (!opts.silent) {
          await fanotes.ui.toast(
            t('Aktive Notiz liegt nicht im Ordnerfilter.', 'Active note is outside the folder filter.'),
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
      for (const raw of extractMediaTargets(text)) {
        const resolved = resolveMediaTarget(raw, active.path)
        if (!resolved) continue
        pending.push({
          target: raw,
          resolved,
          sourcePath: active.path,
          sourceTitle: title,
        })
      }
    } else {
      const folder = settings.folder
      const mdNotes = allNotes
        .filter((n) => MD_EXT_RE.test(n.path))
        .filter((n) => inFolder(n.path, folder))
        .sort((a, b) => {
          const byDate = compareModifiedDesc(a.modifiedAt, b.modifiedAt)
          if (byDate !== 0) return byDate
          return String(a.path).localeCompare(String(b.path))
        })
        .slice(0, settings.maxNotes)

      scanned = mdNotes.length
      for (const note of mdNotes) {
        let text = ''
        try {
          text = await fanotes.notes.read(note.path)
        } catch (error) {
          fanotes.log('read failed', note.path, errMessage(error))
          continue
        }
        const title = (note.title && String(note.title).trim()) || basenameNoExt(note.path)
        for (const raw of extractMediaTargets(text)) {
          const resolved = resolveMediaTarget(raw, note.path)
          if (!resolved) continue
          pending.push({
            target: raw,
            resolved,
            sourcePath: note.path,
            sourceTitle: title,
          })
        }
      }
    }

    const missingSet = await findMissingResolved(
      pending.map((h) => h.resolved),
      vaultPaths,
    )

    /** @type {BrokenHit[]} */
    const hits = []
    /** @type {Set<string>} */
    const seenPair = new Set()
    for (const h of pending) {
      if (!missingSet.has(h.resolved)) continue
      const key = `${h.resolved}\0${h.sourcePath}`
      if (seenPair.has(key)) continue
      seenPair.add(key)
      hits.push(h)
    }

    hits.sort((a, b) => {
      const byTarget = a.resolved.localeCompare(b.resolved)
      if (byTarget !== 0) return byTarget
      return a.sourcePath.localeCompare(b.sourcePath)
    })

    view = {
      scope: settings.scope,
      scanned,
      brokenCount: hits.length,
      hits,
      builtAt: Date.now(),
    }
    scannedOnce = true

    if (!opts.silent) {
      await fanotes.ui.toast(
        t(
          `Scan: ${hits.length} kaputte Einbettung(en) (${scanned} Notiz(en)).`,
          `Scan: ${hits.length} broken embed(s) (${scanned} note(s)).`,
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
 * Status: count after scan only when showStatus && scannedOnce.
 * Never from onActivate scan.
 */
async function updateStatus() {
  try {
    if (!settings.showStatus || !scannedOnce) {
      await fanotes.ui.status.remove(STATUS_ID)
      return
    }
    const n = view ? view.brokenCount : 0
    await fanotes.ui.status.set({
      id: STATUS_ID,
      text: `⚠ ${n}`,
      title: t('Kaputte Einbettungen öffnen', 'Open Broken Embeds'),
      priority: 43,
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
 * Stable list item id for a hit.
 * @param {BrokenHit} h
 * @param {number} index
 */
function hitId(h, index) {
  return `${index}:${h.resolved}:${h.sourcePath}`
}

function renderBlocks() {
  const brokenLabel = view
    ? String(view.brokenCount)
    : scanning
      ? '…'
      : scannedOnce
        ? '0'
        : '–'
  const scannedLabel = view
    ? String(view.scanned)
    : scanning
      ? '…'
      : scannedOnce
        ? '0'
        : '–'

  const listItems = view
    ? view.hits.map((h, i) => ({
        id: hitId(h, i),
        title: truncate(h.resolved || h.target, LIST_TITLE_LEN),
        detail: `${h.sourceTitle} · ${h.sourcePath}`,
      }))
    : []

  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Kaputte Einbettungen', 'Broken Embeds'), level: 2 },
    {
      type: 'callout',
      tone: 'info',
      text: t(
        'Abgrenzung: media-refs = alle Verweise · url-collector = https · orphan-notes = Wikilinks · hier = lokale Media-Ziele gegen Vault.',
        'Distinction: media-refs = all refs · url-collector = https · orphan-notes = wikilinks · here = local media targets vs vault.',
      ),
    },
    {
      type: 'keyvalue',
      items: [
        { key: t('Broken', 'Broken'), value: brokenLabel },
        { key: t('Gescannt', 'Scanned'), value: scannedLabel },
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
      id: 'folder',
      label: t('Ordnerpfad (vault-relativ, ohne Slash am Ende)', 'Folder path (vault-relative, no trailing slash)'),
      value: folderDraft,
      placeholder: t('leer = Vault-Wurzel', 'empty = vault root'),
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
    {
      type: 'list',
      id: 'hits',
      empty: scannedOnce
        ? t('Keine kaputten Einbettungen unter diesen Einstellungen.', 'No broken embeds under these settings.')
        : t('Noch nicht gescannt – „Aktualisieren“ tippen.', 'Not scanned yet – tap “Refresh”.'),
      items: listItems,
    },
    { type: 'divider' },
    {
      type: 'checkbox',
      id: 'showStatus',
      label: t('Statusleiste ⚠ N anzeigen', 'Show status bar ⚠ N'),
      checked: settings.showStatus === true,
    },
    {
      type: 'text',
      muted: true,
      text: t(
        `Nur Vault-relative Media · https ignoriert · Scope ${settings.scope} · Cap ${settings.maxNotes} · Ordner ${settings.folder || '(Wurzel)'} · Klick öffnet Quellnotiz · kein Netz/Schreiben.`,
        `Vault-relative media only · https ignored · scope ${settings.scope} · cap ${settings.maxNotes} · folder ${settings.folder || '(root)'} · click opens source note · no network/write.`,
      ),
    },
  ]

  return blocks
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Kaputte Einbettungen', 'Broken Embeds'))
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
        `${view.brokenCount} kaputte Einbettung(en) (${view.scanned} gescannt).`,
        `${view.brokenCount} broken embed(s) (${view.scanned} scanned).`,
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

    folderDraft = settings.folder

    panel = fanotes.ui.panel({
      id: PANEL_ID,
      title: t('Kaputte Einbettungen', 'Broken Embeds'),
      icon: '🖼',
      blocks: renderBlocks(),
      focus: true,
    })

    panel.onAction(async (action) => {
      try {
        if (action.id === 'refresh' || action.id === 'submit:folder') {
          const values = action.values || {}
          if (values.folder != null) folderDraft = String(values.folder)
          if (values.scope != null) {
            const rollback = { ...settings }
            settings.scope = normalizeScope(values.scope)
            const scopeOk = await saveSettings(rollback)
            if (!scopeOk) {
              await refreshPanel()
              return
            }
          }
          const ok = await applySettingsFromValues(values, {
            silent: action.id !== 'refresh',
          })
          if (!ok) return
          await rescan({ silent: action.id !== 'refresh' })
          return
        }
        if (action.id === 'hits' && action.itemId) {
          const id = String(action.itemId)
          const hit =
            view &&
            view.hits.find((h, i) => hitId(h, i) === id)
          if (!hit) return
          try {
            await fanotes.notes.open(hit.sourcePath)
          } catch (error) {
            await fanotes.ui.toast(
              t(`Öffnen fehlgeschlagen: ${errMessage(error)}`, `Open failed: ${errMessage(error)}`),
              'error',
            )
          }
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
        if (input.id === 'folder') {
          folderDraft = String(input.value ?? '')
          return
        }
        if (input.id === 'showStatus') {
          const prev = settings.showStatus
          const rollback = { ...settings }
          settings.showStatus = input.value === true
          const ok = await saveSettings(rollback)
          if (!ok) {
            settings.showStatus = prev
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

/**
 * Command: open the first source note with a broken embed.
 */
async function openFirst() {
  try {
    await rescan({ silent: true })

    if (!view || !view.hits.length) {
      await fanotes.ui.toast(
        t('Keine kaputten Einbettungen gefunden.', 'No broken embeds found.'),
        'info',
      )
      return
    }

    const first = view.hits[0]
    try {
      await fanotes.notes.open(first.sourcePath)
      await fanotes.ui.toast(
        t(
          `Geöffnet: ${first.sourceTitle} → ${first.resolved}`,
          `Opened: ${first.sourceTitle} → ${first.resolved}`,
        ),
        'success',
      )
    } catch (error) {
      await fanotes.ui.toast(
        t(`Öffnen fehlgeschlagen: ${errMessage(error)}`, `Open failed: ${errMessage(error)}`),
        'error',
      )
    }
  } catch (error) {
    await fanotes.ui.toast(
      t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`),
      'error',
    )
  }
}

// --- Commands ---------------------------------------------------------------

fanotes.commands.register({
  id: 'open',
  title: t('Kaputte Einbettungen öffnen', 'Open Broken Embeds'),
  detail: t(
    'Panel mit Bild-/PDF-Einbettungen, deren Zieldatei im Vault fehlt',
    'Panel of image/PDF embeds whose target file is missing in the vault',
  ),
  keywords: 'embed broken kaputt image pdf missing media link fehlt einbettung öffnen open',
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
  title: t('Kaputte-Einbettungen-Scan aktualisieren', 'Refresh broken embeds scan'),
  detail: t(
    'Aktive Notiz oder Vault erneut auf fehlende Media-Ziele scannen',
    'Re-scan active note or vault for missing media targets',
  ),
  keywords: 'embed broken kaputt rescan aktualisieren refresh scan missing media pdf',
  run: async () => {
    try {
      await rescan({ silent: false })
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'open-first',
  title: t('Erste kaputte Einbettung öffnen', 'Open first broken embed'),
  detail: t(
    'Quellnotiz der ersten fehlenden Media-Einbettung öffnen',
    'Open the source note of the first missing media embed',
  ),
  keywords: 'embed broken kaputt first erste öffnen open missing media',
  run: async () => {
    try {
      await openFirst()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.onActivate(async () => {
  try {
    // Light work only: settings. NO notes.list / notes.read / notes.exists (scan-gate).
    await loadSettings()
    scannedOnce = false
    view = null
    await fanotes.ui.status.remove(STATUS_ID)
    fanotes.log(
      'broken-embeds activated',
      fanotes.app.appVersion,
      settings.scope,
      settings.maxNotes,
      settings.folder || '(root)',
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
  try {
    await fanotes.ui.status.remove(STATUS_ID)
  } catch {
    // Host tears down UI; ignore.
  }
  panel = null
  view = null
})
