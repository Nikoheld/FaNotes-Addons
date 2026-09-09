/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Vokabelkarten / Vocab Cards – parse tables & “term — translation” lines
// from the active note (optional same-folder scan), spaced review leicht/schwer.

const STORE_KEY = 'data'
const PANEL_ID = 'cards'
const MAX_NOTES = 200
const MAX_CARDS = 500
const DAY_MS = 24 * 60 * 60 * 1000
const HARD_MS = 10 * 60 * 1000

/**
 * @typedef {{
 *   id: string,
 *   front: string,
 *   back: string,
 *   dueAt: number,
 *   intervalDays: number,
 *   reps: number,
 *   sourcePath: string,
 * }} Card
 */

/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   sourcePath: string,
 *   cards: Card[],
 *   updatedAt: number,
 * }} Deck
 */

/**
 * @typedef {{
 *   includeFolder: boolean,
 *   maxNotes: number,
 *   maxCards: number,
 * }} Settings
 */

/**
 * @typedef {{
 *   deck: Deck | null,
 *   settings: Settings,
 * }} Store
 */

/** @type {Store} */
let store = {
  deck: null,
  settings: {
    includeFolder: false,
    maxNotes: MAX_NOTES,
    maxCards: MAX_CARDS,
  },
}

/** @type {FaNotes.Panel | null} */
let panel = null

/** @type {'overview' | 'front' | 'back'} */
let mode = 'overview'

/** @type {string[]} */
let reviewQueue = []

/** @type {string | null} */
let currentCardId = null

/** Header cells that mark a table header row (skip). */
const HEADER_RE = /begriff|term|front|vokabel|wort|word/iu

/** Line pattern: front — back (em/en dash, hyphen, colon). */
const LINE_PAIR_RE = /^(.*?\S)\s*[—–\-:]\s+(.+\S)\s*$/u

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

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function clampInt(n, min, max, fallback) {
  const v = Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.min(max, Math.max(min, Math.floor(v)))
}

function normalizeText(s) {
  return String(s ?? '')
    .replace(/\s+/gu, ' ')
    .trim()
}

function cardKey(front, back) {
  return `${normalizeText(front).toLowerCase()}|||${normalizeText(back).toLowerCase()}`
}

function titleFromPath(path) {
  const base = String(path || '')
    .replace(/\\/g, '/')
    .split('/')
    .pop() || ''
  return base.replace(/\.(md|markdown)$/iu, '') || base || 'Deck'
}

function folderOf(path) {
  const p = String(path || '').replace(/\\/g, '/')
  const i = p.lastIndexOf('/')
  return i <= 0 ? '' : p.slice(0, i)
}

/**
 * Mask ``` fenced regions so table/line parsers ignore code blocks.
 * @param {string} text
 */
function maskCodeFences(text) {
  const lines = text.split('\n')
  let inFence = false
  /** @type {string[]} */
  const out = []
  for (const line of lines) {
    const trimmed = line.trimStart()
    if (trimmed.startsWith('```')) {
      inFence = !inFence
      out.push(' '.repeat(line.length))
      continue
    }
    if (inFence) out.push(' '.repeat(line.length))
    else out.push(line)
  }
  return out.join('\n')
}

/**
 * Parse Markdown pipe tables: rows with ≥2 cells → front/back (cols 0/1).
 * Skip separator rows and header rows matching HEADER_RE.
 * @param {string} text
 * @returns {{ front: string, back: string }[]}
 */
function parseTables(text) {
  /** @type {{ front: string, back: string }[]} */
  const pairs = []
  const lines = text.split(/\r?\n/)
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!/\|/.test(line)) {
      i += 1
      continue
    }
    /** @type {string[]} */
    const block = []
    while (i < lines.length && /\|/.test(lines[i])) {
      block.push(lines[i])
      i += 1
    }
    if (block.length < 1) continue

    /** @type {string[][]} */
    const rows = []
    for (const raw of block) {
      let row = raw.trim()
      if (row.startsWith('|')) row = row.slice(1)
      if (row.endsWith('|')) row = row.slice(0, -1)
      const cells = row.split('|').map((c) => normalizeText(c))
      // Separator: --- | :---: 
      if (cells.length && cells.every((c) => /^:?-{3,}:?$/.test(c) || c === '')) continue
      if (cells.filter(Boolean).length < 2) continue
      rows.push(cells)
    }
    if (!rows.length) continue

    let start = 0
    const headerJoined = rows[0].join(' ')
    if (HEADER_RE.test(headerJoined)) start = 1

    for (let r = start; r < rows.length; r += 1) {
      const front = normalizeText(rows[r][0])
      const back = normalizeText(rows[r][1])
      if (front && back) pairs.push({ front, back })
    }
  }
  return pairs
}

/**
 * Parse “front — back” / “front: back” lines.
 * @param {string} text
 * @returns {{ front: string, back: string }[]}
 */
function parseLinePairs(text) {
  /** @type {{ front: string, back: string }[]} */
  const pairs = []
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('|') || trimmed.startsWith('#')) continue
    // Skip pure markdown list markers only if no separator content after strip
    const m = LINE_PAIR_RE.exec(trimmed.replace(/^[-*+]\s+/, ''))
    if (!m) continue
    const front = normalizeText(m[1])
    const back = normalizeText(m[2])
    if (front && back && front !== back) pairs.push({ front, back })
  }
  return pairs
}

/**
 * Collect unique front/back pairs from note text (tables first, then lines).
 * @param {string} text
 * @param {number} limit
 */
function parseNoteText(text, limit) {
  const masked = maskCodeFences(text)
  /** @type {Map<string, { front: string, back: string }>} */
  const map = new Map()
  for (const p of parseTables(masked)) {
    const k = cardKey(p.front, p.back)
    if (!map.has(k)) map.set(k, p)
    if (map.size >= limit) break
  }
  if (map.size < limit) {
    for (const p of parseLinePairs(masked)) {
      const k = cardKey(p.front, p.back)
      if (!map.has(k)) map.set(k, p)
      if (map.size >= limit) break
    }
  }
  return [...map.values()]
}

async function loadStore() {
  try {
    const raw = await fanotes.storage.get(STORE_KEY)
    if (!raw || typeof raw !== 'object') return
    /** @type {any} */
    const data = raw
    if (data.settings && typeof data.settings === 'object') {
      store.settings = {
        includeFolder: data.settings.includeFolder === true,
        maxNotes: clampInt(data.settings.maxNotes, 1, MAX_NOTES, MAX_NOTES),
        maxCards: clampInt(data.settings.maxCards, 1, MAX_CARDS, MAX_CARDS),
      }
    }
    if (data.deck && typeof data.deck === 'object' && Array.isArray(data.deck.cards)) {
      store.deck = {
        id: String(data.deck.id || 'deck'),
        title: String(data.deck.title || 'Deck'),
        sourcePath: String(data.deck.sourcePath || ''),
        updatedAt: Number(data.deck.updatedAt) || 0,
        cards: data.deck.cards
          .filter((c) => c && typeof c === 'object')
          .slice(0, MAX_CARDS)
          .map((c) => ({
            id: String(c.id || newId('card')),
            front: normalizeText(c.front),
            back: normalizeText(c.back),
            dueAt: Number(c.dueAt) || 0,
            intervalDays: Math.max(0, Number(c.intervalDays) || 0),
            reps: Math.max(0, Number(c.reps) || 0),
            sourcePath: String(c.sourcePath || data.deck.sourcePath || ''),
          }))
          .filter((c) => c.front && c.back),
      }
    }
  } catch (error) {
    fanotes.log('loadStore failed:', errMessage(error))
  }
}

async function saveStore() {
  try {
    await fanotes.storage.set(STORE_KEY, {
      deck: store.deck,
      settings: store.settings,
    })
  } catch (error) {
    fanotes.log('saveStore failed:', errMessage(error))
    throw error
  }
}

function nowMs() {
  return Date.now()
}

/**
 * Spaced schedule v1:
 * - leicht: first → 1 day; then intervalDays *= 2 (cap 365)
 * - schwer: due again in 10 minutes; intervalDays = 0
 * @param {Card} card
 * @param {'leicht' | 'schwer'} grade
 */
function applyGrade(card, grade) {
  const now = nowMs()
  if (grade === 'schwer') {
    card.intervalDays = 0
    card.dueAt = now + HARD_MS
    return
  }
  // leicht
  if (!card.intervalDays || card.intervalDays < 1) {
    card.intervalDays = 1
  } else {
    card.intervalDays = Math.min(365, Math.round(card.intervalDays * 2))
  }
  card.reps = (card.reps || 0) + 1
  card.dueAt = now + card.intervalDays * DAY_MS
}

function deckStats() {
  const cards = store.deck?.cards || []
  const now = nowMs()
  const neu = cards.filter((c) => c.reps === 0).length
  const due = cards.filter((c) => c.dueAt <= now).length
  return { due, neu, total: cards.length }
}

function buildDueQueue() {
  const cards = store.deck?.cards || []
  const now = nowMs()
  return cards
    .filter((c) => c.dueAt <= now)
    .sort((a, b) => {
      // New (reps 0) first, then oldest due
      if (a.reps === 0 && b.reps !== 0) return -1
      if (b.reps === 0 && a.reps !== 0) return 1
      return a.dueAt - b.dueAt
    })
    .map((c) => c.id)
}

function findCard(id) {
  return store.deck?.cards.find((c) => c.id === id) || null
}

function currentCard() {
  return currentCardId ? findCard(currentCardId) : null
}

function exitReview() {
  mode = 'overview'
  reviewQueue = []
  currentCardId = null
}

function startReview() {
  reviewQueue = buildDueQueue()
  if (!reviewQueue.length) {
    mode = 'overview'
    currentCardId = null
    return false
  }
  currentCardId = reviewQueue[0]
  mode = 'front'
  return true
}

function advanceAfterGrade() {
  if (currentCardId) {
    const idx = reviewQueue.indexOf(currentCardId)
    if (idx >= 0) reviewQueue.splice(idx, 1)
  }
  // Drop cards no longer due (e.g. leicht pushed them out)
  const now = nowMs()
  reviewQueue = reviewQueue.filter((id) => {
    const c = findCard(id)
    return c && c.dueAt <= now
  })
  if (!reviewQueue.length) {
    exitReview()
    return
  }
  currentCardId = reviewQueue[0]
  mode = 'front'
}

/**
 * @param {string} path
 * @param {string} text
 * @param {Map<string, Card>} prevByKey
 * @param {number} room
 */
function pairsToCards(path, text, prevByKey, room) {
  /** @type {Card[]} */
  const out = []
  const pairs = parseNoteText(text, room)
  for (const p of pairs) {
    if (out.length >= room) break
    const k = cardKey(p.front, p.back)
    const prev = prevByKey.get(k)
    if (prev) {
      out.push({
        ...prev,
        front: p.front,
        back: p.back,
        sourcePath: path,
      })
      prevByKey.delete(k)
    } else {
      out.push({
        id: newId('card'),
        front: p.front,
        back: p.back,
        dueAt: 0,
        intervalDays: 0,
        reps: 0,
        sourcePath: path,
      })
    }
  }
  return out
}

/**
 * Build / rebuild deck from active note (+ optional same-folder notes).
 * Preserves SRS state for matching front|back pairs.
 */
async function buildFromNote({ silent } = { silent: false }) {
  const active = await fanotes.notes.active()
  if (!active || !active.path) {
    if (!silent) {
      await fanotes.ui.toast(
        t('Keine aktive Notiz.', 'No active note.'),
        'error',
      )
    }
    return { ok: false, added: 0 }
  }
  if (active.kind && active.kind !== 'markdown') {
    await fanotes.ui.toast(
      t(
        'Öffne eine Markdown-Notiz zum Einlesen.',
        'Open a Markdown note to build cards.',
      ),
      'error',
    )
    return { ok: false, added: 0 }
  }

  const maxCards = clampInt(store.settings.maxCards, 1, MAX_CARDS, MAX_CARDS)
  const maxNotes = clampInt(store.settings.maxNotes, 1, MAX_NOTES, MAX_NOTES)

  /** @type {Map<string, Card>} */
  const prevByKey = new Map()
  if (store.deck?.cards) {
    for (const c of store.deck.cards) {
      prevByKey.set(cardKey(c.front, c.back), c)
    }
  }

  /** @type {{ path: string, text: string }[]} */
  const sources = []
  try {
    const text = await fanotes.notes.read(active.path)
    sources.push({ path: active.path, text: String(text ?? '') })
  } catch (error) {
    await fanotes.ui.toast(
      t(`Lesen fehlgeschlagen: ${errMessage(error)}`, `Read failed: ${errMessage(error)}`),
      'error',
    )
    return { ok: false, added: 0 }
  }

  if (store.settings.includeFolder) {
    const folder = folderOf(active.path)
    try {
      const all = await fanotes.notes.list()
      const md = all
        .filter((n) => /\.(md|markdown)$/iu.test(n.path))
        .filter((n) => {
          if (n.path === active.path) return false
          if (!folder) return folderOf(n.path) === ''
          return folderOf(n.path) === folder || n.path.startsWith(`${folder}/`)
        })
        // Only direct children of same folder (not nested deeper than folder)
        .filter((n) => folderOf(n.path) === folder)
        .sort((a, b) => String(b.modifiedAt ?? '').localeCompare(String(a.modifiedAt ?? '')))
        .slice(0, Math.max(0, maxNotes - 1))

      for (const n of md) {
        if (sources.length >= maxNotes) break
        try {
          const text = await fanotes.notes.read(n.path)
          sources.push({ path: n.path, text: String(text ?? '') })
        } catch (error) {
          fanotes.log('skip note', n.path, errMessage(error))
        }
      }
    } catch (error) {
      fanotes.log('folder list failed:', errMessage(error))
    }
  }

  /** @type {Card[]} */
  const cards = []
  /** @type {Set<string>} */
  const seen = new Set()
  for (const src of sources) {
    const room = maxCards - cards.length
    if (room <= 0) break
    const chunk = pairsToCards(src.path, src.text, prevByKey, room)
    for (const c of chunk) {
      const k = cardKey(c.front, c.back)
      if (seen.has(k)) continue
      seen.add(k)
      cards.push(c)
      if (cards.length >= maxCards) break
    }
  }

  store.deck = {
    id: store.deck?.id || newId('deck'),
    title: titleFromPath(active.path),
    sourcePath: active.path,
    cards,
    updatedAt: nowMs(),
  }
  exitReview()
  await saveStore()

  if (!silent) {
    await fanotes.ui.toast(
      t(
        `${cards.length} Karten aus ${sources.length} Notiz(en).`,
        `${cards.length} cards from ${sources.length} note(s).`,
      ),
      'success',
    )
  }
  return { ok: true, added: cards.length, notes: sources.length }
}

function renderOverview() {
  const stats = deckStats()
  const hasDeck = Boolean(store.deck && store.deck.cards.length)

  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Vokabelkarten', 'Vocab Cards') },
  ]

  if (!hasDeck) {
    blocks.push({
      type: 'callout',
      tone: 'info',
      text: t(
        'Noch kein Deck. Öffne eine Markdown-Notiz mit einer Tabelle (| Begriff | Übersetzung |) oder Zeilen „Begriff — Übersetzung“, dann „Neu einlesen“.',
        'No deck yet. Open a Markdown note with a table (| Term | Translation |) or “Term — Translation” lines, then “Rebuild”.',
      ),
    })
  } else {
    blocks.push({
      type: 'text',
      muted: true,
      text: t(
        `Deck: ${store.deck.title}${store.deck.sourcePath ? ` · ${store.deck.sourcePath}` : ''}`,
        `Deck: ${store.deck.title}${store.deck.sourcePath ? ` · ${store.deck.sourcePath}` : ''}`,
      ),
    })
    blocks.push({
      type: 'keyvalue',
      items: [
        { key: t('Fällig', 'Due'), value: String(stats.due) },
        { key: t('Neu', 'New'), value: String(stats.neu) },
        { key: t('Gesamt', 'Total'), value: String(stats.total) },
      ],
    })
    if (stats.due === 0) {
      blocks.push({
        type: 'callout',
        tone: 'success',
        text: t(
          'Nichts fällig. Neue Karten oder „Neu einlesen“, oder warte auf den nächsten Termin (Leicht verlängert das Intervall).',
          'Nothing due. Add cards via “Rebuild”, or wait for the next schedule (Easy lengthens the interval).',
        ),
      })
    }
  }

  blocks.push({ type: 'divider' })
  blocks.push({
    type: 'row',
    children: [
      {
        type: 'button',
        id: 'start-review',
        label: t('Review starten', 'Start review'),
        primary: true,
        disabled: !hasDeck || stats.due === 0,
      },
      {
        type: 'button',
        id: 'rebuild',
        label: t('Neu einlesen', 'Rebuild'),
      },
    ],
  })
  blocks.push({
    type: 'checkbox',
    id: 'includeFolder',
    label: t(
      'Gleichen Ordner einbeziehen (max. 200 Notizen)',
      'Include same folder (max. 200 notes)',
    ),
    checked: store.settings.includeFolder === true,
  })
  blocks.push({
    type: 'text',
    muted: true,
    text: t(
      'SRS v1: Leicht → 1 Tag, dann Intervall ×2 (max. 365). Schwer → in 10 Min. erneut. Bestehende Karten behalten den Fortschritt bei gleichem Vorder-/Rückseitentext.',
      'SRS v1: Easy → 1 day, then interval ×2 (max 365). Hard → due again in 10 min. Matching front/back keeps progress on rebuild.',
    ),
  })
  return blocks
}

function renderReview() {
  const card = currentCard()
  const stats = deckStats()
  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Review', 'Review') },
    {
      type: 'text',
      muted: true,
      text: t(
        `Warteschlange: ${reviewQueue.length} · Fällig gesamt: ${stats.due}`,
        `Queue: ${reviewQueue.length} · Due total: ${stats.due}`,
      ),
    },
  ]

  if (!card) {
    blocks.push({
      type: 'callout',
      tone: 'info',
      text: t('Keine Karte in der Warteschlange.', 'No card in the queue.'),
    })
    blocks.push({
      type: 'button',
      id: 'back-overview',
      label: t('Zur Übersicht', 'Back to overview'),
      primary: true,
    })
    return blocks
  }

  blocks.push({
    type: 'markdown',
    text: `**${t('Vorderseite', 'Front')}**\n\n${card.front}`,
  })

  if (mode === 'back') {
    blocks.push({ type: 'divider' })
    blocks.push({
      type: 'markdown',
      text: `**${t('Rückseite', 'Back')}**\n\n${card.back}`,
    })
    blocks.push({
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'grade-schwer',
          label: t('Schwer', 'Hard'),
          danger: true,
        },
        {
          type: 'button',
          id: 'grade-leicht',
          label: t('Leicht', 'Easy'),
          primary: true,
        },
      ],
    })
  } else {
    blocks.push({
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'reveal',
          label: t('Aufdecken', 'Reveal'),
          primary: true,
        },
        {
          type: 'button',
          id: 'back-overview',
          label: t('Abbrechen', 'Cancel'),
        },
      ],
    })
  }

  if (card.sourcePath) {
    blocks.push({
      type: 'text',
      muted: true,
      text: t(`Quelle: ${card.sourcePath}`, `Source: ${card.sourcePath}`),
    })
  }
  return blocks
}

function renderBlocks() {
  if (mode === 'front' || mode === 'back') return renderReview()
  return renderOverview()
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(
      mode === 'overview'
        ? t('Vokabelkarten', 'Vocab Cards')
        : t('Vokabel-Review', 'Vocab Review'),
    )
  } catch (error) {
    if (isNoPanel(error)) {
      panel = null
      return
    }
    fanotes.log('panel update failed:', errMessage(error))
  }
}

async function gradeCurrent(grade) {
  const card = currentCard()
  if (!card || !store.deck) return
  applyGrade(card, grade)
  await saveStore()
  advanceAfterGrade()
  await refreshPanel()
  if (mode === 'overview') {
    await fanotes.ui.toast(
      t('Review fertig für jetzt.', 'Review done for now.'),
      'success',
    )
  }
}

function openPanel() {
  try {
    if (panel) {
      void panel.show().catch((error) => {
        if (isNoPanel(error)) panel = null
        else fanotes.log('panel.show failed:', errMessage(error))
      })
      void refreshPanel()
      return
    }

    panel = fanotes.ui.panel({
      id: PANEL_ID,
      title: t('Vokabelkarten', 'Vocab Cards'),
      icon: '🃏',
      blocks: renderBlocks(),
      focus: true,
    })

    panel.onAction(async (action) => {
      try {
        if (action.id === 'rebuild') {
          await buildFromNote({ silent: false })
          await refreshPanel()
          return
        }
        if (action.id === 'start-review') {
          const ok = startReview()
          if (!ok) {
            await fanotes.ui.toast(
              t('Nichts fällig.', 'Nothing due.'),
              'info',
            )
          }
          await refreshPanel()
          return
        }
        if (action.id === 'reveal') {
          mode = 'back'
          await refreshPanel()
          return
        }
        if (action.id === 'grade-leicht') {
          await gradeCurrent('leicht')
          return
        }
        if (action.id === 'grade-schwer') {
          await gradeCurrent('schwer')
          return
        }
        if (action.id === 'back-overview') {
          exitReview()
          await refreshPanel()
        }
      } catch (error) {
        fanotes.log('panel action failed:', errMessage(error))
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
        if (input.id === 'includeFolder') {
          store.settings.includeFolder = input.value === true
          await saveStore()
        }
      } catch (error) {
        fanotes.log('onInput failed:', errMessage(error))
      }
    })

    void refreshPanel()
  } catch (error) {
    fanotes.log('openPanel failed:', errMessage(error))
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
  title: t('Vokabelkarten öffnen', 'Open Vocab Cards'),
  detail: t(
    'Panel mit fälligen/neuen Karten und Review',
    'Panel with due/new cards and review',
  ),
  keywords:
    'vokabel vocab karte card flashcard lernen learn srs review wiederholung schule school',
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
  id: 'build-from-note',
  title: t('Karten aus Notiz bauen', 'Build cards from note'),
  detail: t(
    'Aktive Notiz (optional Ordner) parsen und Deck speichern',
    'Parse active note (optional folder) and save deck',
  ),
  keywords:
    'vokabel vocab bauen build einlesen parse tabelle table notiz note deck',
  run: async () => {
    try {
      await buildFromNote({ silent: false })
      openPanel()
      await refreshPanel()
    } catch (error) {
      await fanotes.ui.toast(
        t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`),
        'error',
      )
    }
  },
})

fanotes.commands.register({
  id: 'review',
  title: t('Vokabeln wiederholen', 'Review vocab'),
  detail: t(
    'Fällige Karten: Vorderseite → Aufdecken → Leicht/Schwer',
    'Due cards: front → reveal → Easy/Hard',
  ),
  keywords:
    'vokabel vocab review wiederholen leicht schwer easy hard srs flashcard',
  run: async () => {
    try {
      if (!store.deck || !store.deck.cards.length) {
        await fanotes.ui.toast(
          t(
            'Kein Deck – zuerst „Karten aus Notiz bauen“.',
            'No deck – run “Build cards from note” first.',
          ),
          'info',
        )
        openPanel()
        return
      }
      const ok = startReview()
      openPanel()
      await refreshPanel()
      if (!ok) {
        await fanotes.ui.toast(t('Nichts fällig.', 'Nothing due.'), 'info')
      }
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
    // Load storage only – never scan the vault here (≤15s / no-brick rule).
    await loadStore()
    fanotes.log(
      'vocab-cards activated',
      fanotes.app.appVersion,
      fanotes.app.language,
      store.deck?.cards?.length ?? 0,
    )
  } catch (error) {
    fanotes.log('onActivate failed:', errMessage(error))
  }
})

fanotes.onDeactivate(async () => {
  exitReview()
  panel = null
})
