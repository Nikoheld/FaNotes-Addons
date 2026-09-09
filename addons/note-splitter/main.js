/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Notiz teilen / Note Splitter – split the open note at ATX headings into new notes.
// Active note only; no vault scan. No vault:write / network.

const SETTINGS_KEY = 'settings'
const PANEL_ID = 'split'
const DEFAULT_MAX_PARTS = 30
const NAME_MAX = 80

/**
 * @typedef {{
 *   level: number,
 *   targetFolder: string,
 *   mode: 'copy' | 'cut',
 *   insertWikilinks: boolean,
 *   maxParts: number,
 * }} Settings
 */

/**
 * @typedef {{
 *   title: string,
 *   body: string,
 * }} Part
 */

/**
 * @typedef {{
 *   available: boolean,
 *   path: string | null,
 *   title: string,
 *   folder: string,
 *   preamble: string,
 *   parts: Part[],
 *   tooMany: boolean,
 *   viaEditor: boolean,
 * }} Snapshot
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  level: 2,
  targetFolder: '',
  mode: 'copy',
  insertWikilinks: true,
  maxParts: DEFAULT_MAX_PARTS,
}

/** @type {Settings} */
let settings = { ...DEFAULT_SETTINGS }

/** @type {FaNotes.Panel | null} */
let panel = null

/** @type {Snapshot} */
let snapshot = emptySnapshot()

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
    title: '',
    folder: '',
    preamble: '',
    parts: /** @type {Part[]} */ ([]),
    tooMany: false,
    viaEditor: false,
  }
}

/**
 * @param {unknown} raw
 * @returns {Settings}
 */
function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const obj = /** @type {Record<string, unknown>} */ (raw)

  let level = Number(obj.level)
  if (!Number.isFinite(level) || level < 1) level = DEFAULT_SETTINGS.level
  level = Math.min(3, Math.max(1, Math.floor(level)))

  let targetFolder = typeof obj.targetFolder === 'string' ? obj.targetFolder : ''
  targetFolder = normalizeFolderAllowEmpty(targetFolder)
  if (targetFolder === null) targetFolder = ''

  const mode = obj.mode === 'cut' ? 'cut' : 'copy'
  const insertWikilinks = obj.insertWikilinks !== false

  let maxParts = Number(obj.maxParts)
  if (!Number.isFinite(maxParts) || maxParts < 1) maxParts = DEFAULT_MAX_PARTS
  maxParts = Math.min(200, Math.max(1, Math.floor(maxParts)))

  return { level, targetFolder, mode, insertWikilinks, maxParts }
}

/**
 * Normalize vault-relative folder. Empty string = same as source (allowed).
 * Rejects `..`. Returns null if invalid.
 * @param {string} raw
 * @returns {string | null}
 */
function normalizeFolderAllowEmpty(raw) {
  let folder = String(raw ?? '').trim().replace(/\\/g, '/')
  while (folder.startsWith('/')) folder = folder.slice(1)
  while (folder.endsWith('/')) folder = folder.slice(0, -1)
  if (!folder) return ''
  const parts = folder.split('/').filter(Boolean)
  if (parts.some((p) => p === '.' || p === '..')) return null
  return parts.join('/')
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
    await fanotes.storage.set(SETTINGS_KEY, {
      level: settings.level,
      targetFolder: settings.targetFolder,
      mode: settings.mode,
      insertWikilinks: settings.insertWikilinks,
      maxParts: settings.maxParts,
    })
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
 * Sanitize a note file name (no extension). Strip unsafe chars, max 80.
 * Soft: empty → Teil-N (1-based index).
 * @param {string} title
 * @param {number} index1
 */
function sanitizeName(title, index1) {
  let name = String(title ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  // Soft: also strip leading/trailing dots (awkward on some FS).
  while (name.startsWith('.') || name.endsWith('.')) {
    name = name.replace(/^\.+/, '').replace(/\.+$/, '').trim()
  }
  if (name.length > NAME_MAX) name = name.slice(0, NAME_MAX).trim()
  if (!name) name = `Teil-${index1}`
  return name
}

/**
 * Fence-aware split at exactly `level` ATX headings.
 * Spec regex: /^(#{1,6})\s+(.+)$/
 * Soft: trim title; ignore empty titles; deeper headings stay inside body.
 * @param {string} text
 * @param {number} level
 * @param {number} maxParts
 * @returns {{ preamble: string, parts: Part[], tooMany: boolean }}
 */
function parseSplit(text, level, maxParts) {
  const normalised = String(text ?? '').replace(/\r\n|\r/g, '\n')
  const lines = normalised.split('\n')

  /** @type {{ title: string, startLine: number }[]} */
  const hits = []
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
      continue
    }
    if (inFence) continue

    const m = /^(#{1,6})\s+(.+)$/.exec(line)
    if (!m) continue
    if (m[1].length !== level) continue
    const title = String(m[2] ?? '').trim()
    if (!title) continue
    hits.push({ title, startLine: i })
  }

  if (hits.length > maxParts) {
    return { preamble: '', parts: [], tooMany: true }
  }

  if (!hits.length) {
    return { preamble: normalised, parts: [], tooMany: false }
  }

  const preamble = lines.slice(0, hits[0].startLine).join('\n')

  /** @type {Part[]} */
  const parts = []
  for (let h = 0; h < hits.length; h++) {
    const start = hits[h].startLine + 1 // body after heading line
    const end = h + 1 < hits.length ? hits[h + 1].startLine : lines.length
    let body = lines.slice(start, end).join('\n')
    // Soft: trim a single leading blank left by "# Title\n\n…" so create uses `# ${title}\n\n${body}` cleanly.
    if (body.startsWith('\n')) body = body.slice(1)
    // Soft: trim trailing newlines for stable create content.
    body = body.replace(/\n+$/, '')
    parts.push({ title: hits[h].title, body })
  }

  return { preamble, parts, tooMany: false }
}

/**
 * Prefer editor.getText(); else notes.active + notes.read.
 * Soft: no vault scan.
 */
async function readActiveText() {
  /** @type {FaNotes.ActiveNote | null} */
  let active = null
  try {
    active = await fanotes.notes.active()
  } catch (error) {
    fanotes.log('notes.active failed', errMessage(error))
  }

  try {
    const editorText = await fanotes.editor.getText()
    if (editorText !== null && editorText !== undefined) {
      return {
        available: true,
        text: String(editorText),
        path: active ? active.path : null,
        title: active ? active.title : '',
        folder: active ? folderOfPath(active.path) : '',
        viaEditor: true,
      }
    }
  } catch (error) {
    fanotes.log('editor.getText failed', errMessage(error))
  }

  if (!active || !active.path) {
    return {
      available: false,
      text: '',
      path: null,
      title: '',
      folder: '',
      viaEditor: false,
    }
  }

  // Soft: skip non-markdown kinds when known.
  if (active.kind && active.kind !== 'markdown' && active.kind !== 'none') {
    return {
      available: false,
      text: '',
      path: active.path,
      title: active.title,
      folder: folderOfPath(active.path),
      viaEditor: false,
    }
  }

  try {
    const text = await fanotes.notes.read(active.path)
    return {
      available: true,
      text: String(text ?? ''),
      path: active.path,
      title: active.title,
      folder: folderOfPath(active.path),
      viaEditor: false,
    }
  } catch (error) {
    fanotes.log('notes.read failed', errMessage(error))
    return {
      available: false,
      text: '',
      path: active.path,
      title: active.title,
      folder: folderOfPath(active.path),
      viaEditor: false,
    }
  }
}

/**
 * @param {string} path
 */
function folderOfPath(path) {
  const p = String(path ?? '').replace(/\\/g, '/')
  const idx = p.lastIndexOf('/')
  if (idx < 0) return ''
  return p.slice(0, idx)
}

async function compute() {
  const read = await readActiveText()
  if (!read.available) {
    return emptySnapshot()
  }
  const parsed = parseSplit(read.text, settings.level, settings.maxParts)
  return {
    available: true,
    path: read.path,
    title: read.title,
    folder: read.folder,
    preamble: parsed.preamble,
    parts: parsed.parts,
    tooMany: parsed.tooMany,
    viaEditor: read.viaEditor,
  }
}

async function refresh() {
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
      // ignore
    }
  }
}

function renderBlocks() {
  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Notiz teilen', 'Note Splitter') },
  ]

  if (!snapshot.available) {
    blocks.push({
      type: 'callout',
      tone: 'info',
      text: t(
        'Keine offene Markdown-Notiz. Öffne eine Notiz, um an Überschriften zu teilen.',
        'No open Markdown note. Open a note to split at headings.',
      ),
    })
    blocks.push({
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'preview',
          label: t('Vorschau', 'Preview'),
          primary: true,
        },
      ],
    })
    return blocks
  }

  if (snapshot.tooMany) {
    blocks.push({
      type: 'callout',
      tone: 'error',
      text: t(
        `Mehr als ${settings.maxParts} Abschnitte auf Ebene H${settings.level} — Abbruch (maxParts).`,
        `More than ${settings.maxParts} sections at level H${settings.level} — aborted (maxParts).`,
      ),
    })
  }

  const count = snapshot.tooMany ? '—' : String(snapshot.parts.length)

  blocks.push({
    type: 'keyvalue',
    items: [
      { key: t('Abschnitte', 'Parts'), value: count },
      { key: t('Ebene', 'Level'), value: String(settings.level) },
      {
        key: t('Modus', 'Mode'),
        value: settings.mode === 'cut' ? t('Ausschneiden', 'Cut') : t('Kopieren', 'Copy'),
      },
    ],
  })

  blocks.push({
    type: 'input',
    id: 'level',
    label: t('Überschriftenebene (1–3)', 'Heading level (1–3)'),
    value: String(settings.level),
    placeholder: '2',
  })

  blocks.push({
    type: 'select',
    id: 'mode',
    label: t('Modus', 'Mode'),
    value: settings.mode,
    options: [
      { value: 'copy', label: t('Kopieren (Original bleibt)', 'Copy (keep original)') },
      { value: 'cut', label: t('Ausschneiden (TOC-Stubs)', 'Cut (TOC stubs)') },
    ],
  })

  blocks.push({
    type: 'input',
    id: 'targetFolder',
    label: t('Zielordner (leer = Quellordner)', 'Target folder (empty = source folder)'),
    value: settings.targetFolder,
    placeholder: t('z. B. Kapitel', 'e.g. Chapters'),
  })

  blocks.push({
    type: 'checkbox',
    id: 'insertWikilinks',
    label: t(
      'Wikilinks als Stubs (nur Ausschneiden)',
      'Wikilink stubs (cut mode only)',
    ),
    checked: settings.insertWikilinks === true,
  })

  blocks.push({ type: 'divider' })

  if (!snapshot.tooMany && snapshot.parts.length === 0) {
    blocks.push({
      type: 'callout',
      tone: 'info',
      text: t(
        `Keine H${settings.level}-Überschriften gefunden (Codeblöcke werden ignoriert; nur exakte Ebene).`,
        `No H${settings.level} headings found (fenced code ignored; exact level only).`,
      ),
    })
  } else if (!snapshot.tooMany) {
    blocks.push({
      type: 'list',
      id: 'parts',
      empty: t('Keine Abschnitte.', 'No parts.'),
      items: snapshot.parts.map((p, index) => ({
        id: `p-${index}`,
        title: p.title,
        detail: sanitizeName(p.title, index + 1),
        badge: String(index + 1),
      })),
    })
  }

  blocks.push({
    type: 'text',
    muted: true,
    text: t(
      'Teilen legt neue Notizen an. Ausschneiden schreibt das Original um — kein Undo über Vault-Create.',
      'Split creates new notes. Cut rewrites the original — no undo for vault creates.',
    ),
  })

  const canSplit = !snapshot.tooMany && snapshot.parts.length > 0

  blocks.push({
    type: 'row',
    children: [
      {
        type: 'button',
        id: 'preview',
        label: t('Vorschau', 'Preview'),
      },
      {
        type: 'button',
        id: 'split',
        label: t('Teilen', 'Split'),
        primary: true,
        disabled: !canSplit,
      },
    ],
  })

  return blocks
}

async function updatePanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Notiz teilen', 'Note Splitter'))
  } catch (error) {
    if (isNoPanel(error)) {
      panel = null
      return
    }
    fanotes.log('panel update failed', errMessage(error))
  }
}

/**
 * Resolve create folder: settings.targetFolder or source folder.
 * @returns {string | null} null = invalid
 */
function resolveTargetFolder() {
  const custom = normalizeFolderAllowEmpty(settings.targetFolder)
  if (custom === null) return null
  if (custom !== '') return custom
  return snapshot.folder || ''
}

/**
 * Write original text (cut mode). Prefer editor.setText; else notes.write.
 * @param {string} content
 */
async function writeOriginal(content) {
  try {
    const ok = await fanotes.editor.setText(content)
    if (ok) return true
  } catch (error) {
    fanotes.log('editor.setText failed', errMessage(error))
  }

  if (!snapshot.path) {
    await fanotes.ui.toast(
      t('Original konnte nicht geschrieben werden (kein Pfad).', 'Could not write original (no path).'),
      'error',
    )
    return false
  }

  try {
    await fanotes.notes.write(snapshot.path, content)
    return true
  } catch (error) {
    await fanotes.ui.toast(
      t(
        `Original schreiben fehlgeschlagen: ${errMessage(error)}`,
        `Writing original failed: ${errMessage(error)}`,
      ),
      'error',
    )
    return false
  }
}

/**
 * Build wikilink stub list from part titles (display titles, Soft: as parsed).
 * @param {Part[]} parts
 */
function buildWikilinks(parts) {
  return parts.map((p) => `[[${p.title}]]`).join('\n')
}

async function runPreview() {
  await refresh()
  if (!snapshot.available) {
    await fanotes.ui.toast(
      t('Keine offene Markdown-Notiz.', 'No open Markdown note.'),
      'error',
    )
    return
  }
  if (snapshot.tooMany) {
    await fanotes.ui.toast(
      t(
        `Zu viele Abschnitte (> ${settings.maxParts}). Erhöhe maxParts oder wähle eine andere Ebene.`,
        `Too many parts (> ${settings.maxParts}). Raise maxParts or pick another level.`,
      ),
      'error',
    )
    return
  }
  if (!snapshot.parts.length) {
    await fanotes.ui.toast(
      t(
        `Keine H${settings.level}-Überschriften zum Teilen.`,
        `No H${settings.level} headings to split.`,
      ),
      'info',
    )
    return
  }
  await fanotes.ui.toast(
    t(
      `Vorschau: ${snapshot.parts.length} Abschnitt(e) auf H${settings.level}.`,
      `Preview: ${snapshot.parts.length} part(s) at H${settings.level}.`,
    ),
    'info',
  )
}

async function runSplit() {
  try {
    // Fresh compute before destructive work.
    snapshot = await compute()
    await updatePanel()

    if (!snapshot.available) {
      await fanotes.ui.toast(
        t('Keine offene Markdown-Notiz.', 'No open Markdown note.'),
        'error',
      )
      return
    }
    if (snapshot.tooMany) {
      await fanotes.ui.toast(
        t(
          `Zu viele Abschnitte (> ${settings.maxParts}) — Abbruch.`,
          `Too many parts (> ${settings.maxParts}) — aborted.`,
        ),
        'error',
      )
      return
    }
    if (!snapshot.parts.length) {
      await fanotes.ui.toast(
        t(
          `Keine H${settings.level}-Überschriften zum Teilen.`,
          `No H${settings.level} headings to split.`,
        ),
        'info',
      )
      return
    }

    const folder = resolveTargetFolder()
    if (folder === null) {
      await fanotes.ui.toast(
        t('Ungültiger Zielordner (kein „..“ erlaubt).', 'Invalid target folder (".." is not allowed).'),
        'error',
      )
      return
    }

    const n = snapshot.parts.length
    const modeLabel = settings.mode === 'cut' ? t('Ausschneiden', 'Cut') : t('Kopieren', 'Copy')
    const confirmed = await fanotes.ui.confirm(
      t(
        `${n} neue Notiz(en) anlegen (${modeLabel}${folder ? `, Ordner „${folder}“` : ''})? Ausschneiden ändert das Original. Kein Undo für erzeugte Notizen.`,
        `Create ${n} new note(s) (${modeLabel}${folder ? `, folder “${folder}”` : ''})? Cut changes the original. No undo for created notes.`,
      ),
      {
        title: t('Notiz teilen', 'Note Splitter'),
        confirmLabel: t('Teilen', 'Split'),
      },
    )
    if (!confirmed) return

    /** @type {string[]} */
    const createdPaths = []
    /** @type {Part[]} */
    const createdParts = []

    for (let i = 0; i < snapshot.parts.length; i++) {
      const part = snapshot.parts[i]
      const name = sanitizeName(part.title, i + 1)
      const content = `# ${part.title}\n\n${part.body}`.replace(/\n+$/, '') + '\n'
      const opts = /** @type {{ folder?: string, name: string, content: string }} */ ({
        name,
        content,
      })
      if (folder) opts.folder = folder

      try {
        const path = await fanotes.notes.create(opts)
        createdPaths.push(path)
        createdParts.push(part)
      } catch (error) {
        const msg = errMessage(error)
        // Soft: missing folder without vault:write — ask user to create it.
        await fanotes.ui.toast(
          t(
            `Notiz „${name}“ konnte nicht angelegt werden: ${msg}. Bitte Zielordner manuell anlegen (kein vault:write) und erneut versuchen.`,
            `Could not create note “${name}”: ${msg}. Please create the target folder manually (no vault:write) and try again.`,
          ),
          'error',
        )
        // Soft: stop further creates; partial creates already exist (no undo).
        if (createdPaths.length) {
          await fanotes.ui.toast(
            t(
              `${createdPaths.length} Notiz(en) wurden bereits angelegt (kein Undo). Original unverändert.`,
              `${createdPaths.length} note(s) were already created (no undo). Original unchanged.`,
            ),
            'info',
          )
        }
        await refresh()
        return
      }
    }

    const links = settings.insertWikilinks ? buildWikilinks(createdParts) : ''

    if (settings.mode === 'cut') {
      let newOriginal = String(snapshot.preamble ?? '')
      if (links) {
        newOriginal = newOriginal.replace(/\n+$/, '')
        if (newOriginal) newOriginal += '\n\n'
        newOriginal += links
        if (!newOriginal.endsWith('\n')) newOriginal += '\n'
      } else {
        // Soft: cut without wikilinks → preamble only (sections removed).
        if (newOriginal && !newOriginal.endsWith('\n')) newOriginal += '\n'
      }
      const wrote = await writeOriginal(newOriginal)
      if (!wrote) {
        await fanotes.ui.toast(
          t(
            `${createdPaths.length} Notiz(en) angelegt, aber Original nicht geschrieben.`,
            `${createdPaths.length} note(s) created, but original was not written.`,
          ),
          'error',
        )
        await refresh()
        return
      }
    }

    await fanotes.ui.toast(
      t(
        `${createdPaths.length} Notiz(en) angelegt (${modeLabel}).`,
        `${createdPaths.length} note(s) created (${modeLabel}).`,
      ),
      'success',
    )

    await refresh()
  } catch (error) {
    await fanotes.ui.toast(
      t(`Teilen fehlgeschlagen: ${errMessage(error)}`, `Split failed: ${errMessage(error)}`),
      'error',
    )
  }
}

/**
 * Apply settings from panel values.
 * @param {Record<string, unknown>} values
 */
async function applySettingsFromValues(values) {
  const prev = { ...settings }
  let changed = false

  if (values.level != null) {
    let n = Number(String(values.level).trim())
    if (!Number.isFinite(n) || n < 1) n = DEFAULT_SETTINGS.level
    n = Math.min(3, Math.max(1, Math.floor(n)))
    if (n !== settings.level) {
      settings.level = n
      changed = true
    }
  }

  if (values.mode === 'copy' || values.mode === 'cut') {
    if (values.mode !== settings.mode) {
      settings.mode = values.mode
      changed = true
    }
  }

  if (values.targetFolder != null) {
    const next = normalizeFolderAllowEmpty(String(values.targetFolder))
    if (next === null) {
      await fanotes.ui.toast(
        t('Ungültiger Zielordner (kein „..“ erlaubt).', 'Invalid target folder (".." is not allowed).'),
        'error',
      )
      settings = { ...prev }
      return false
    }
    if (next !== settings.targetFolder) {
      settings.targetFolder = next
      changed = true
    }
  }

  if (values.insertWikilinks !== undefined) {
    const next = values.insertWikilinks === true || values.insertWikilinks === 'true'
    if (next !== settings.insertWikilinks) {
      settings.insertWikilinks = next
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
      title: t('Notiz teilen', 'Note Splitter'),
      icon: '✂️',
      blocks: renderBlocks(),
      focus: true,
    })

    panel.onAction(async (action) => {
      try {
        if (action.values) {
          await applySettingsFromValues(action.values)
        }

        if (action.id === 'preview') {
          await runPreview()
          return
        }
        if (action.id === 'split') {
          await runSplit()
          return
        }
        // List row click Soft: toast the sanitized file name.
        if (action.id === 'parts' && action.itemId) {
          const idx = Number(String(action.itemId).replace(/^p-/, ''))
          const part =
            snapshot.parts && Number.isFinite(idx) ? snapshot.parts[idx] : null
          if (!part) return
          await fanotes.ui.toast(
            t(
              `Datei: ${sanitizeName(part.title, idx + 1)}.md`,
              `File: ${sanitizeName(part.title, idx + 1)}.md`,
            ),
            'info',
          )
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
        if (input.id === 'level') {
          const prev = settings.level
          let n = Number(String(input.value ?? '').trim())
          if (!Number.isFinite(n) || n < 1) n = DEFAULT_SETTINGS.level
          settings.level = Math.min(3, Math.max(1, Math.floor(n)))
          const ok = await saveSettings()
          if (!ok) {
            settings.level = prev
            await updatePanel()
            return
          }
          await refresh()
          return
        }
        if (input.id === 'mode') {
          const prev = settings.mode
          settings.mode = input.value === 'cut' ? 'cut' : 'copy'
          const ok = await saveSettings()
          if (!ok) {
            settings.mode = prev
            await updatePanel()
            return
          }
          await updatePanel()
          return
        }
        if (input.id === 'targetFolder') {
          // Soft: persist on blur/Enter; reject .. without wiping previous.
          const prev = settings.targetFolder
          const next = normalizeFolderAllowEmpty(String(input.value ?? ''))
          if (next === null) {
            await fanotes.ui.toast(
              t('Ungültiger Zielordner (kein „..“ erlaubt).', 'Invalid target folder (".." is not allowed).'),
              'error',
            )
            await updatePanel()
            return
          }
          settings.targetFolder = next
          const ok = await saveSettings()
          if (!ok) {
            settings.targetFolder = prev
            await updatePanel()
            return
          }
          await updatePanel()
          return
        }
        if (input.id === 'insertWikilinks') {
          const prev = settings.insertWikilinks
          settings.insertWikilinks = input.value === true
          const ok = await saveSettings()
          if (!ok) {
            settings.insertWikilinks = prev
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
  title: t('Notiz teilen öffnen', 'Open Note Splitter'),
  detail: t(
    'Panel: Vorschau und Teilen an Überschriften',
    'Panel: preview and split at headings',
  ),
  keywords: 'split teilen heading kapitel chapter h2 notiz section überschrift',
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
  id: 'preview',
  title: t('Teil-Vorschau', 'Split preview'),
  detail: t(
    'Abschnitte an gewählter Überschriftenebene zählen/anzeigen',
    'Count/show sections at the chosen heading level',
  ),
  keywords: 'vorschau preview split teilen heading kapitel',
  run: async () => {
    try {
      if (!panel) openPanel()
      await runPreview()
    } catch (error) {
      await fanotes.ui.toast(
        t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`),
        'error',
      )
    }
  },
})

fanotes.commands.register({
  id: 'split',
  title: t('Notiz teilen', 'Split note'),
  detail: t(
    'An Überschriften in neue Notizen teilen (mit Bestätigung)',
    'Split at headings into new notes (with confirmation)',
  ),
  keywords: 'split teilen cut copy heading kapitel chapter notiz',
  run: async () => {
    try {
      await runSplit()
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
      'note-splitter activated',
      fanotes.app.appVersion,
      fanotes.app.language,
      settings.level,
      settings.mode,
      settings.maxParts,
    )
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(() => {
  panel = null
  snapshot = emptySnapshot()
})
