/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Notiz-Eigenschaften / Note Properties – Key: Value block at note start
// (not YAML ---). Active note only; no vault scan.

const PRESETS_KEY = 'presets'
const PANEL_ID = 'props'
const PROP_LINE_RE = /^([A-Za-zÄÖÜäöüß0-9_\-/ ]{1,40}):\s*(.*)$/
const DEFAULT_KEYS = ['Fach', 'Status', 'Dozent', 'Blatt']
const MAX_KEY_LEN = 40

/**
 * @typedef {{
 *   defaultKeys: string[],
 * }} Presets
 */

/**
 * @typedef {{
 *   key: string,
 *   value: string,
 * }} Prop
 */

/**
 * @typedef {{
 *   available: boolean,
 *   path: string | null,
 *   title: string,
 *   props: Prop[],
 *   bodyAfterBlock: string,
 *   uncertain: boolean,
 *   uncertainReasons: string[],
 *   viaEditor: boolean,
 *   hadDuplicates: boolean,
 *   hadYamlFence: boolean,
 * }} Snapshot
 */

/** @type {Presets} */
let presets = { defaultKeys: [...DEFAULT_KEYS] }

/** @type {FaNotes.Panel | null} */
let panel = null

/** @type {Snapshot} */
let snapshot = emptySnapshot()

/** @type {string | null} */
let selectedKey = null

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
    props: /** @type {Prop[]} */ ([]),
    bodyAfterBlock: '',
    uncertain: false,
    uncertainReasons: /** @type {string[]} */ ([]),
    viaEditor: false,
    hadDuplicates: false,
    hadYamlFence: false,
  }
}

/**
 * UI label for a stored key name (file keys stay unchanged).
 * @param {string} key
 */
function keyLabel(key) {
  switch (key) {
    case 'Fach':
      return t('Fach', 'Subject')
    case 'Status':
      return t('Status', 'Status')
    case 'Dozent':
      return t('Dozent', 'Lecturer')
    case 'Blatt':
      return t('Blatt', 'Sheet')
    default:
      return key
  }
}

/**
 * @param {unknown} raw
 * @returns {Presets}
 */
function normalizePresets(raw) {
  if (!raw || typeof raw !== 'object') return { defaultKeys: [...DEFAULT_KEYS] }
  const obj = /** @type {Record<string, unknown>} */ (raw)
  const arr = Array.isArray(obj.defaultKeys) ? obj.defaultKeys : null
  if (!arr || !arr.length) return { defaultKeys: [...DEFAULT_KEYS] }
  /** @type {string[]} */
  const keys = []
  const seen = new Set()
  for (const item of arr) {
    const k = normalizeKey(String(item ?? ''))
    if (!k || seen.has(k.toLowerCase())) continue
    seen.add(k.toLowerCase())
    keys.push(k)
    if (keys.length >= 24) break
  }
  return { defaultKeys: keys.length ? keys : [...DEFAULT_KEYS] }
}

/**
 * @param {string} raw
 * @returns {string}
 */
function normalizeKey(raw) {
  const trimmed = String(raw ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .slice(0, MAX_KEY_LEN)
  if (!trimmed) return ''
  if (!/^[A-Za-zÄÖÜäöüß0-9_\-/ ]{1,40}$/.test(trimmed)) return ''
  return trimmed
}

async function loadPresets() {
  try {
    const stored = await fanotes.storage.get(PRESETS_KEY)
    presets = normalizePresets(stored)
  } catch (error) {
    fanotes.log('loadPresets failed', errMessage(error))
    presets = { defaultKeys: [...DEFAULT_KEYS] }
  }
}

async function savePresets() {
  try {
    await fanotes.storage.set(PRESETS_KEY, {
      defaultKeys: [...presets.defaultKeys],
    })
    return true
  } catch (error) {
    await fanotes.ui.toast(
      t(`Presets speichern fehlgeschlagen: ${errMessage(error)}`, `Saving presets failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

/**
 * Strip optional UTF-8 BOM.
 * @param {string} text
 */
function stripBom(text) {
  if (text.charCodeAt(0) === 0xfeff) return text.slice(1)
  return text
}

/**
 * Parse Key: Value block at file start.
 * Soft uncertain: YAML --- fence at start; duplicate keys (last wins).
 * @param {string} rawText
 * @returns {{ props: Prop[], bodyAfterBlock: string, uncertain: boolean, uncertainReasons: string[], hadDuplicates: boolean, hadYamlFence: boolean }}
 */
function parsePropsBlock(rawText) {
  const text = stripBom(String(rawText ?? '')).replace(/\r\n|\r/g, '\n')
  const lines = text.split('\n')

  /** @type {string[]} */
  const reasons = []
  let hadYamlFence = false
  let hadDuplicates = false

  // Soft: detect YAML frontmatter fence — we do not parse YAML ---.
  if (lines[0] === '---') {
    hadYamlFence = true
    reasons.push(
      t(
        'Notiz beginnt mit YAML --- (nicht unterstützt).',
        'Note starts with YAML --- (not supported).',
      ),
    )
  }

  /** @type {Map<string, string>} */
  const map = new Map()
  /** @type {string[]} */
  const order = []
  let i = 0

  for (; i < lines.length; i++) {
    const line = lines[i]
    if (line === '') {
      // Blank ends the block; Soft: keep blank as leading \n in bodyAfterBlock.
      break
    }
    const m = PROP_LINE_RE.exec(line)
    if (!m) break
    const key = String(m[1] ?? '').trim()
    const value = String(m[2] ?? '')
    if (!key) break
    if (map.has(key)) {
      hadDuplicates = true
    } else {
      order.push(key)
    }
    map.set(key, value)
  }

  if (hadDuplicates) {
    reasons.push(
      t(
        'Doppelte Schlüssel — letzter Wert gilt.',
        'Duplicate keys — last value wins.',
      ),
    )
  }

  /** @type {Prop[]} */
  const props = order.map((key) => ({ key, value: map.get(key) ?? '' }))

  // bodyAfterBlock: if ended on blank, include that blank as leading \n so
  // reconstruct = propsBlock + '\n' + bodyAfterBlock keeps the separator.
  let bodyAfterBlock = ''
  if (i < lines.length) {
    if (lines[i] === '') {
      bodyAfterBlock = '\n' + lines.slice(i + 1).join('\n')
    } else {
      bodyAfterBlock = lines.slice(i).join('\n')
    }
  }

  const uncertain = reasons.length > 0
  return {
    props,
    bodyAfterBlock,
    uncertain,
    uncertainReasons: reasons,
    hadDuplicates,
    hadYamlFence,
  }
}

/**
 * Unique keys on write (order preserved; last value already in props).
 * @param {Prop[]} props
 */
function serializePropsBlock(props) {
  /** @type {Map<string, string>} */
  const map = new Map()
  /** @type {string[]} */
  const order = []
  for (const p of props) {
    const key = normalizeKey(p.key)
    if (!key) continue
    if (!map.has(key)) order.push(key)
    map.set(key, String(p.value ?? ''))
  }
  return order.map((key) => `${key}: ${map.get(key) ?? ''}`).join('\n')
}

/**
 * reconstruct = props block + '\n' + bodyAfterBlock (exact Soft when empty props → body only).
 * @param {Prop[]} props
 * @param {string} bodyAfterBlock
 */
function reconstructText(props, bodyAfterBlock) {
  const block = serializePropsBlock(props)
  if (!block) return String(bodyAfterBlock ?? '')
  return block + '\n' + String(bodyAfterBlock ?? '')
}

/**
 * Prefer editor.getText(); else notes.active + notes.read.
 * @returns {Promise<{ text: string, path: string, title: string, viaEditor: boolean } | null>}
 */
async function readActiveNoteText() {
  /** @type {FaNotes.ActiveNote | null} */
  let active = null
  try {
    active = await fanotes.notes.active()
  } catch (error) {
    fanotes.log('notes.active failed', errMessage(error))
    return null
  }
  if (!active || !active.path) return null
  const kind = String(active.kind || '')
  const pathLower = active.path.toLowerCase()
  const isMd =
    kind === 'markdown' ||
    pathLower.endsWith('.md') ||
    pathLower.endsWith('.markdown')
  if (!isMd) return null

  // Prefer live editor text when available.
  try {
    const editorText = await fanotes.editor.getText()
    if (editorText != null) {
      return {
        text: editorText,
        path: active.path,
        title: active.title || active.path,
        viaEditor: true,
      }
    }
  } catch (error) {
    fanotes.log('editor.getText failed', errMessage(error))
  }

  try {
    const text = await fanotes.notes.read(active.path)
    return {
      text: String(text ?? ''),
      path: active.path,
      title: active.title || active.path,
      viaEditor: false,
    }
  } catch (error) {
    fanotes.log('notes.read failed', errMessage(error))
    return null
  }
}

/**
 * Load / reload snapshot from the active Markdown note.
 * @returns {Promise<Snapshot>}
 */
async function loadSnapshot() {
  const read = await readActiveNoteText()
  if (!read) {
    snapshot = emptySnapshot()
    selectedKey = null
    return snapshot
  }
  const parsed = parsePropsBlock(read.text)
  snapshot = {
    available: true,
    path: read.path,
    title: read.title,
    props: parsed.props.map((p) => ({ key: p.key, value: p.value })),
    bodyAfterBlock: parsed.bodyAfterBlock,
    uncertain: parsed.uncertain,
    uncertainReasons: parsed.uncertainReasons,
    viaEditor: read.viaEditor,
    hadDuplicates: parsed.hadDuplicates,
    hadYamlFence: parsed.hadYamlFence,
  }
  if (selectedKey && !snapshot.props.some((p) => p.key === selectedKey)) {
    selectedKey = snapshot.props[0]?.key ?? null
  } else if (!selectedKey && snapshot.props.length) {
    selectedKey = snapshot.props[0].key
  }
  return snapshot
}

/**
 * Apply panel input values into snapshot.props (by prop:<key> ids).
 * @param {Record<string, unknown>} values
 */
function applyValuesToProps(values) {
  if (!values || !snapshot.available) return
  for (const p of snapshot.props) {
    const id = `prop:${p.key}`
    if (Object.prototype.hasOwnProperty.call(values, id)) {
      p.value = String(values[id] ?? '')
    }
  }
  if (typeof values.selected === 'string' && values.selected) {
    selectedKey = values.selected
  }
}

/**
 * Write reconstructed text. Prefer editor.setText; else notes.write.
 * Soft stale: before write without editor, re-read and take fresh bodyAfterBlock.
 * @param {Prop[]} props
 * @returns {Promise<boolean>}
 */
async function writeProps(props) {
  if (!snapshot.available || !snapshot.path) {
    await fanotes.ui.toast(
      t('Keine aktive Markdown-Notiz.', 'No active Markdown note.'),
      'error',
    )
    return false
  }

  const path = snapshot.path
  let bodyAfterBlock = snapshot.bodyAfterBlock
  let viaEditor = snapshot.viaEditor

  // Prefer editor when available.
  let editorOpen = false
  try {
    const cur = await fanotes.editor.getText()
    editorOpen = cur != null
  } catch {
    editorOpen = false
  }

  if (!editorOpen) {
    // Soft stale guard: re-read disk body before notes.write.
    try {
      const fresh = await fanotes.notes.read(path)
      const parsed = parsePropsBlock(String(fresh ?? ''))
      bodyAfterBlock = parsed.bodyAfterBlock
      viaEditor = false
    } catch (error) {
      await fanotes.ui.toast(
        t(`Erneutes Lesen fehlgeschlagen: ${errMessage(error)}`, `Re-read failed: ${errMessage(error)}`),
        'error',
      )
      return false
    }
  }

  const content = reconstructText(props, bodyAfterBlock)

  if (editorOpen) {
    try {
      const ok = await fanotes.editor.setText(content)
      if (ok) {
        snapshot.bodyAfterBlock = bodyAfterBlock
        snapshot.viaEditor = true
        snapshot.props = props.map((p) => ({ key: p.key, value: p.value }))
        return true
      }
    } catch (error) {
      fanotes.log('editor.setText failed', errMessage(error))
    }
    // Fall through to notes.write Soft.
  }

  try {
    // Soft stale already applied above when !editorOpen; if editor failed mid-way, re-read once more.
    if (editorOpen) {
      try {
        const fresh = await fanotes.notes.read(path)
        const parsed = parsePropsBlock(String(fresh ?? ''))
        bodyAfterBlock = parsed.bodyAfterBlock
      } catch (error) {
        fanotes.log('stale re-read before notes.write failed', errMessage(error))
      }
    }
    const finalContent = reconstructText(props, bodyAfterBlock)
    const ok = await fanotes.notes.write(path, finalContent)
    if (!ok) {
      await fanotes.ui.toast(t('Schreiben fehlgeschlagen.', 'Write failed.'), 'error')
      return false
    }
    snapshot.bodyAfterBlock = bodyAfterBlock
    snapshot.viaEditor = false
    snapshot.props = props.map((p) => ({ key: p.key, value: p.value }))
    return true
  } catch (error) {
    await fanotes.ui.toast(
      t(`Schreiben fehlgeschlagen: ${errMessage(error)}`, `Write failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

/**
 * Speichern — confirm if parse uncertain Soft.
 * @param {Record<string, unknown>} [values]
 */
async function saveProps(values) {
  try {
    if (!snapshot.available) {
      await fanotes.ui.toast(
        t('Keine aktive Markdown-Notiz.', 'No active Markdown note.'),
        'error',
      )
      return
    }
    if (values) applyValuesToProps(values)

    if (snapshot.uncertain) {
      const detail = snapshot.uncertainReasons.join(' ')
      const ok = await fanotes.ui.confirm(
        t(
          `Parse unsicher Soft. ${detail} Trotzdem speichern? Der Key: Value-Block wird neu geschrieben (kein YAML ---).`,
          `Parse uncertain Soft. ${detail} Save anyway? The Key: Value block will be rewritten (no YAML ---).`,
        ),
        {
          title: t('Unsicher speichern?', 'Save uncertain?'),
          confirmLabel: t('Speichern', 'Save'),
        },
      )
      if (!ok) return
    }

    const ok = await writeProps(snapshot.props)
    if (!ok) return

    // Clear uncertain after successful own write Soft (duplicates gone; YAML may still be in body).
    snapshot.uncertain = snapshot.hadYamlFence
    snapshot.uncertainReasons = snapshot.hadYamlFence
      ? [
          t(
            'Notiz beginnt mit YAML --- (nicht unterstützt).',
            'Note starts with YAML --- (not supported).',
          ),
        ]
      : []
    snapshot.hadDuplicates = false

    await fanotes.ui.toast(t('Eigenschaften gespeichert.', 'Properties saved.'), 'success')
    await refreshPanel()
  } catch (error) {
    await fanotes.ui.toast(
      t(`Speichern fehlgeschlagen: ${errMessage(error)}`, `Save failed: ${errMessage(error)}`),
      'error',
    )
  }
}

/**
 * Add a new key via prompt (empty value).
 */
async function addNewKey() {
  try {
    if (!snapshot.available) {
      await fanotes.ui.toast(
        t('Keine aktive Markdown-Notiz.', 'No active Markdown note.'),
        'error',
      )
      return
    }
    const raw = await fanotes.ui.prompt(
      t('Neuer Schlüssel (Key)', 'New property key'),
      {
        title: t('Eigenschaft hinzufügen', 'Add property'),
        placeholder: t('z. B. Semester', 'e.g. Semester'),
        value: '',
      },
    )
    if (raw === null) return
    const key = normalizeKey(raw)
    if (!key) {
      await fanotes.ui.toast(
        t(
          'Ungültiger Schlüssel (1–40: Buchstaben, Ziffern, _ - / Leerzeichen).',
          'Invalid key (1–40: letters, digits, _ - / spaces).',
        ),
        'error',
      )
      return
    }
    if (snapshot.props.some((p) => p.key === key)) {
      await fanotes.ui.toast(
        t(`Schlüssel „${key}“ existiert bereits.`, `Key "${key}" already exists.`),
        'info',
      )
      selectedKey = key
      await refreshPanel()
      return
    }
    snapshot.props.push({ key, value: '' })
    selectedKey = key
    await fanotes.ui.toast(t('Schlüssel hinzugefügt.', 'Key added.'), 'success')
    await refreshPanel()
  } catch (error) {
    await fanotes.ui.toast(
      t(`Hinzufügen fehlgeschlagen: ${errMessage(error)}`, `Add failed: ${errMessage(error)}`),
      'error',
    )
  }
}

/**
 * apply-presets: add missing preset keys with empty values (in-memory; Speichern persists).
 */
async function applyPresets() {
  try {
    if (!snapshot.available) {
      // Soft: still allow loading active note first.
      await loadSnapshot()
    }
    if (!snapshot.available) {
      await fanotes.ui.toast(
        t('Keine aktive Markdown-Notiz.', 'No active Markdown note.'),
        'error',
      )
      return
    }
    const existing = new Set(snapshot.props.map((p) => p.key))
    let added = 0
    for (const key of presets.defaultKeys) {
      const k = normalizeKey(key)
      if (!k || existing.has(k)) continue
      snapshot.props.push({ key: k, value: '' })
      existing.add(k)
      added += 1
    }
    if (added === 0) {
      await fanotes.ui.toast(
        t('Alle Preset-Schlüssel sind bereits vorhanden.', 'All preset keys are already present.'),
        'info',
      )
    } else {
      await fanotes.ui.toast(
        t(`${added} Preset-Schlüssel ergänzt.`, `Added ${added} preset key(s).`),
        'success',
      )
    }
    if (!selectedKey && snapshot.props.length) selectedKey = snapshot.props[0].key
    await refreshPanel()
  } catch (error) {
    await fanotes.ui.toast(
      t(`Presets fehlgeschlagen: ${errMessage(error)}`, `Presets failed: ${errMessage(error)}`),
      'error',
    )
  }
}

/**
 * Remove selected property (in-memory until Speichern).
 * @param {Record<string, unknown>} [values]
 */
async function removeSelected(values) {
  try {
    if (!snapshot.available) {
      await fanotes.ui.toast(
        t('Keine aktive Markdown-Notiz.', 'No active Markdown note.'),
        'error',
      )
      return
    }
    if (values) applyValuesToProps(values)
    const key = selectedKey
    if (!key) {
      await fanotes.ui.toast(t('Kein Schlüssel ausgewählt.', 'No key selected.'), 'info')
      return
    }
    const ok = await fanotes.ui.confirm(
      t(
        `Schlüssel „${key}“ wirklich entfernen? (Erst Speichern schreibt die Datei.)`,
        `Really remove key "${key}"? (Save writes the file.)`,
      ),
      {
        title: t('Eigenschaft entfernen', 'Remove property'),
        confirmLabel: t('Entfernen', 'Remove'),
      },
    )
    if (!ok) return
    snapshot.props = snapshot.props.filter((p) => p.key !== key)
    selectedKey = snapshot.props[0]?.key ?? null
    await fanotes.ui.toast(t('Schlüssel entfernt.', 'Key removed.'), 'success')
    await refreshPanel()
  } catch (error) {
    await fanotes.ui.toast(
      t(`Entfernen fehlgeschlagen: ${errMessage(error)}`, `Remove failed: ${errMessage(error)}`),
      'error',
    )
  }
}

/**
 * @returns {FaNotes.Block[]}
 */
function renderBlocks() {
  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Notiz-Eigenschaften', 'Note Properties'), level: 2 },
  ]

  if (!snapshot.available) {
    blocks.push({
      type: 'callout',
      tone: 'info',
      text: t(
        'Keine aktive Markdown-Notiz. Öffne eine .md-Notiz, dann Neu laden.',
        'No active Markdown note. Open a .md note, then Reload.',
      ),
    })
    blocks.push({
      type: 'text',
      muted: true,
      text: t(
        'Kein YAML --- · nur aktive Notiz · kein Vault-Scan · Abgrenzung tag-browser (#Hashtags).',
        'No YAML --- · active note only · no vault scan · distinction tag-browser (#hashtags).',
      ),
    })
    blocks.push({
      type: 'row',
      children: [
        { type: 'button', id: 'reload', label: t('Neu laden', 'Reload') },
      ],
    })
    return blocks
  }

  blocks.push({
    type: 'keyvalue',
    items: [
      { key: t('Notiz', 'Note'), value: snapshot.title || snapshot.path || '—' },
      {
        key: t('Quelle', 'Source'),
        value: snapshot.viaEditor
          ? t('Editor', 'Editor')
          : t('Datei', 'File'),
      },
      { key: t('Schlüssel', 'Keys'), value: snapshot.props.length },
    ],
  })

  if (snapshot.uncertain) {
    blocks.push({
      type: 'callout',
      tone: 'warning',
      text:
        t('Parse unsicher Soft: ', 'Parse uncertain Soft: ') +
        snapshot.uncertainReasons.join(' '),
    })
  }

  if (!snapshot.props.length) {
    blocks.push({
      type: 'text',
      muted: true,
      text: t(
        'Noch keine Key: Value-Zeilen am Anfang. Presets oder Neu nutzen.',
        'No Key: Value lines at the start yet. Use Presets or New.',
      ),
    })
  } else {
    for (const p of snapshot.props) {
      blocks.push({
        type: 'input',
        id: `prop:${p.key}`,
        label: keyLabel(p.key),
        value: p.value,
        placeholder: t('Wert', 'Value'),
      })
    }

    blocks.push({
      type: 'select',
      id: 'selected',
      label: t('Auswahl (Entfernen)', 'Selection (Remove)'),
      value: selectedKey || snapshot.props[0]?.key || '',
      options: snapshot.props.map((p) => ({
        value: p.key,
        label: keyLabel(p.key),
      })),
    })
  }

  blocks.push({
    type: 'row',
    children: [
      {
        type: 'button',
        id: 'save',
        label: t('Speichern', 'Save'),
        primary: true,
      },
      { type: 'button', id: 'new', label: t('Neu', 'New') },
      { type: 'button', id: 'presets', label: t('Presets', 'Presets') },
      {
        type: 'button',
        id: 'remove',
        label: t('Entfernen', 'Remove'),
        danger: true,
        disabled: !snapshot.props.length || !selectedKey,
      },
    ],
  })

  blocks.push({
    type: 'row',
    children: [
      { type: 'button', id: 'reload', label: t('Neu laden', 'Reload') },
    ],
  })

  blocks.push({
    type: 'text',
    muted: true,
    text: t(
      'Format: Key: Value am Dateianfang · Ende bei Leerzeile · kein YAML --- · nur aktive Notiz · Abgrenzung tag-browser.',
      'Format: Key: Value at file start · ends at blank line · no YAML --- · active note only · distinction tag-browser.',
    ),
  })

  return blocks
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
  } catch (error) {
    if (isNoPanel(error)) {
      panel = null
      return
    }
    fanotes.log('panel.update failed', errMessage(error))
  }
}

async function reloadAndRefresh() {
  try {
    await loadSnapshot()
    await refreshPanel()
    if (snapshot.available) {
      await fanotes.ui.toast(
        t(
          `${snapshot.props.length} Eigenschaften geladen.`,
          `Loaded ${snapshot.props.length} properties.`,
        ),
        'info',
      )
    }
  } catch (error) {
    await fanotes.ui.toast(
      t(`Laden fehlgeschlagen: ${errMessage(error)}`, `Load failed: ${errMessage(error)}`),
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
      void (async () => {
        await loadSnapshot()
        await refreshPanel()
      })()
      return
    }

    panel = fanotes.ui.panel({
      id: PANEL_ID,
      title: t('Eigenschaften', 'Properties'),
      icon: '🏷️',
      blocks: renderBlocks(),
      focus: true,
    })

    panel.onAction(async (action) => {
      try {
        if (action.values) applyValuesToProps(action.values)

        if (action.id === 'save') {
          await saveProps(action.values)
          return
        }
        if (action.id === 'new') {
          await addNewKey()
          return
        }
        if (action.id === 'presets') {
          await applyPresets()
          return
        }
        if (action.id === 'remove') {
          await removeSelected(action.values)
          return
        }
        if (action.id === 'reload') {
          await reloadAndRefresh()
          return
        }
        if (action.id === 'selected' || action.id?.startsWith?.('submit:')) {
          await refreshPanel()
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
        if (input.id === 'selected') {
          selectedKey = String(input.value ?? '') || null
          return
        }
        if (input.id && input.id.startsWith('prop:')) {
          const key = input.id.slice('prop:'.length)
          const prop = snapshot.props.find((p) => p.key === key)
          if (prop) prop.value = String(input.value ?? '')
        }
      } catch (error) {
        fanotes.log('panel input failed', errMessage(error))
      }
    })

    void (async () => {
      await loadSnapshot()
      await refreshPanel()
    })()
  } catch (error) {
    fanotes.log('openPanel failed', errMessage(error))
    void fanotes.ui.toast(
      t(`Panel fehlgeschlagen: ${errMessage(error)}`, `Panel failed: ${errMessage(error)}`),
      'error',
    )
  }
}

fanotes.onActivate(async () => {
  // Activate: load presets only. No vault scan. No note read.
  await loadPresets()

  fanotes.commands.register({
    id: 'open',
    title: t('Notiz-Eigenschaften öffnen', 'Open Note Properties'),
    detail: t('Key: Value-Panel der aktiven Notiz', 'Key: Value panel for the active note'),
    keywords: 'properties eigenschaften metadata frontmatter fach',
    run: () => {
      openPanel()
    },
  })

  fanotes.commands.register({
    id: 'reload',
    title: t('Eigenschaften neu laden', 'Reload properties'),
    detail: t('Key: Value-Block erneut lesen', 'Re-read the Key: Value block'),
    keywords: 'reload neu laden properties',
    run: async () => {
      openPanel()
      await reloadAndRefresh()
    },
  })

  fanotes.commands.register({
    id: 'apply-presets',
    title: t('Preset-Schlüssel ergänzen', 'Apply preset keys'),
    detail: t(
      'Fehlende Presets (Fach, Status, …) leer ergänzen',
      'Add missing presets (Subject, Status, …) empty',
    ),
    keywords: 'presets fach status dozent blatt',
    run: async () => {
      openPanel()
      if (!snapshot.available) await loadSnapshot()
      await applyPresets()
    },
  })

  // Soft: refresh open panel when the active note changes (still no vault scan).
  fanotes.events.on('note:opened', () => {
    if (!panel) return
    void (async () => {
      await loadSnapshot()
      await refreshPanel()
    })()
  })
})

fanotes.onDeactivate(() => {
  panel = null
  snapshot = emptySnapshot()
  selectedKey = null
})
