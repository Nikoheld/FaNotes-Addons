/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Formel-Schnipsel / Math Snippets – insert built-in & custom LaTeX snippets
// as inline $…$ or display $$…$$. No network, no KaTeX preview in v1.

const STORAGE_KEY = 'data'
const PANEL_ID = 'math'
const MAX_CUSTOM = 80
const MAX_BODY = 4000

/**
 * @typedef {{
 *   id: string,
 *   category: string,
 *   title_de: string,
 *   title_en: string,
 *   body: string,
 *   wrap: 'inline' | 'display',
 *   builtin?: boolean,
 * }} Snippet
 */

/**
 * @typedef {{
 *   custom: Snippet[],
 *   settings: { lastId: string | null, preferDisplay: boolean },
 * }} Store
 */

/** @type {Store} */
let store = {
  custom: [],
  settings: { lastId: null, preferDisplay: false },
}

/** @type {string} */
let filterCategory = 'all'

/** @type {string} */
let searchQuery = ''

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

function newId() {
  return `snip_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** Stable built-in catalog (not deletable; clone to edit). */
function builtinSnippets() {
  /** @type {Snippet[]} */
  return [
    // algebra
    {
      id: 'builtin-algebra-frac',
      category: 'algebra',
      title_de: 'Bruch',
      title_en: 'Fraction',
      body: '\\frac{a}{b}',
      wrap: 'inline',
      builtin: true,
    },
    {
      id: 'builtin-algebra-sqrt',
      category: 'algebra',
      title_de: 'Wurzel',
      title_en: 'Square root',
      body: '\\sqrt{x}',
      wrap: 'inline',
      builtin: true,
    },
    {
      id: 'builtin-algebra-pow',
      category: 'algebra',
      title_de: 'Potenz',
      title_en: 'Power',
      body: 'x^{n}',
      wrap: 'inline',
      builtin: true,
    },
    {
      id: 'builtin-algebra-sub',
      category: 'algebra',
      title_de: 'Index',
      title_en: 'Subscript',
      body: 'x_{i}',
      wrap: 'inline',
      builtin: true,
    },
    // analysis
    {
      id: 'builtin-analysis-int',
      category: 'analysis',
      title_de: 'Integral',
      title_en: 'Integral',
      body: '\\int_{a}^{b}',
      wrap: 'display',
      builtin: true,
    },
    {
      id: 'builtin-analysis-sum',
      category: 'analysis',
      title_de: 'Summe',
      title_en: 'Sum',
      body: '\\sum_{i=1}^{n}',
      wrap: 'display',
      builtin: true,
    },
    {
      id: 'builtin-analysis-lim',
      category: 'analysis',
      title_de: 'Grenzwert',
      title_en: 'Limit',
      body: '\\lim_{x \\to \\infty}',
      wrap: 'display',
      builtin: true,
    },
    {
      id: 'builtin-analysis-deriv',
      category: 'analysis',
      title_de: 'Ableitung',
      title_en: 'Derivative',
      body: '\\frac{d}{dx}',
      wrap: 'inline',
      builtin: true,
    },
    // linear
    {
      id: 'builtin-linear-mat2',
      category: 'linear',
      title_de: '2×2-Matrix',
      title_en: '2×2 matrix',
      body: '\\begin{pmatrix}\na & b \\\\\nc & d\n\\end{pmatrix}',
      wrap: 'display',
      builtin: true,
    },
    {
      id: 'builtin-linear-det',
      category: 'linear',
      title_de: 'Determinante',
      title_en: 'Determinant',
      body: '\\begin{vmatrix}\na & b \\\\\nc & d\n\\end{vmatrix}',
      wrap: 'display',
      builtin: true,
    },
    // misc
    {
      id: 'builtin-misc-cases',
      category: 'misc',
      title_de: 'Fallunterscheidung',
      title_en: 'Cases',
      body: '\\begin{cases}\nx & \\text{if } a \\\\\ny & \\text{otherwise}\n\\end{cases}',
      wrap: 'display',
      builtin: true,
    },
    {
      id: 'builtin-misc-implies',
      category: 'misc',
      title_de: 'Implikation',
      title_en: 'Implies',
      body: '\\Rightarrow',
      wrap: 'inline',
      builtin: true,
    },
    {
      id: 'builtin-misc-in',
      category: 'misc',
      title_de: 'Element von',
      title_en: 'Element of',
      body: '\\in',
      wrap: 'inline',
      builtin: true,
    },
  ]
}

const CATEGORY_IDS = ['algebra', 'analysis', 'linear', 'misc']

function categoryLabel(id) {
  switch (id) {
    case 'algebra':
      return t('Algebra', 'Algebra')
    case 'analysis':
      return t('Analysis', 'Analysis')
    case 'linear':
      return t('Linear', 'Linear')
    case 'misc':
      return t('Sonstiges', 'Misc')
    case 'custom':
      return t('Eigene', 'Custom')
    case 'all':
      return t('Alle', 'All')
    default:
      return id
  }
}

/**
 * @param {unknown} raw
 * @returns {Snippet | null}
 */
function normalizeSnippet(raw) {
  if (!raw || typeof raw !== 'object') return null
  const obj = /** @type {Record<string, unknown>} */ (raw)
  const id = obj.id != null ? String(obj.id).trim() : ''
  const category = obj.category != null ? String(obj.category).trim() : 'misc'
  const title_de = obj.title_de != null ? String(obj.title_de).trim() : ''
  const title_en = obj.title_en != null ? String(obj.title_en).trim() : ''
  const body = obj.body != null ? String(obj.body) : ''
  const wrap = obj.wrap === 'display' ? 'display' : 'inline'
  if (!id || (!title_de && !title_en) || !body) return null
  const cat = CATEGORY_IDS.includes(category) ? category : 'misc'
  return {
    id,
    category: cat,
    title_de: title_de || title_en,
    title_en: title_en || title_de,
    body,
    wrap,
    builtin: false,
  }
}

/** @returns {Snippet[]} */
function allSnippets() {
  return [...builtinSnippets(), ...store.custom]
}

/**
 * @param {string} id
 * @returns {Snippet | null}
 */
function findSnippet(id) {
  return allSnippets().find((x) => x.id === id) ?? null
}

function snippetTitle(snip) {
  return t(snip.title_de, snip.title_en)
}

/**
 * Wrap body for editor insert. preferDisplay forces display math.
 * @param {Snippet} snip
 */
function wrapForInsert(snip) {
  const body = String(snip.body).trim()
  const useDisplay = store.settings.preferDisplay || snip.wrap === 'display'
  if (useDisplay) return `$$\n${body}\n$$`
  return `$${body}$`
}

async function loadStore() {
  try {
    const raw = await fanotes.storage.get(STORAGE_KEY)
    if (raw && typeof raw === 'object') {
      const obj = /** @type {Record<string, unknown>} */ (raw)
      const list = Array.isArray(obj.custom) ? obj.custom : []
      /** @type {Snippet[]} */
      const custom = []
      for (const item of list) {
        const n = normalizeSnippet(item)
        if (n) custom.push(n)
      }
      const settingsRaw =
        obj.settings && typeof obj.settings === 'object'
          ? /** @type {Record<string, unknown>} */ (obj.settings)
          : {}
      store = {
        custom,
        settings: {
          lastId: settingsRaw.lastId != null ? String(settingsRaw.lastId) : null,
          preferDisplay: settingsRaw.preferDisplay === true,
        },
      }
    } else {
      store = { custom: [], settings: { lastId: null, preferDisplay: false } }
    }
  } catch (error) {
    fanotes.log('loadStore failed', errMessage(error))
    store = { custom: [], settings: { lastId: null, preferDisplay: false } }
  }

  if (selectedId && !findSnippet(selectedId)) selectedId = null
  if (!selectedId && store.settings.lastId && findSnippet(store.settings.lastId)) {
    selectedId = store.settings.lastId
  }
}

async function saveStore() {
  try {
    await fanotes.storage.set(STORAGE_KEY, {
      custom: store.custom.map((s) => ({
        id: s.id,
        category: s.category,
        title_de: s.title_de,
        title_en: s.title_en,
        body: s.body,
        wrap: s.wrap,
      })),
      settings: {
        lastId: store.settings.lastId,
        preferDisplay: store.settings.preferDisplay === true,
      },
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
 * Insert wrapped snippet at selection or cursor.
 * @param {Snippet} snip
 */
async function insertSnippet(snip) {
  try {
    const text = wrapForInsert(snip)
    let hasRange = false
    try {
      const sel = await fanotes.editor.getSelection()
      if (sel && sel.from !== sel.to) hasRange = true
    } catch {
      // ignore – fall through to insert
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
      return false
    }

    store.settings.lastId = snip.id
    selectedId = snip.id
    await saveStore()
    await fanotes.ui.toast(
      t(`Eingefügt: ${snippetTitle(snip)}`, `Inserted: ${snippetTitle(snip)}`),
      'success',
    )
    await refreshPanel()
    return true
  } catch (error) {
    await fanotes.ui.toast(
      t(`Einfügen fehlgeschlagen: ${errMessage(error)}`, `Insert failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

async function insertLast() {
  const id = store.settings.lastId
  const snip = id ? findSnippet(id) : null
  if (!snip) {
    await fanotes.ui.toast(
      t('Kein zuletzt genutzter Schnipsel.', 'No last-used snippet.'),
      'info',
    )
    return
  }
  await insertSnippet(snip)
}

async function insertFraction() {
  const snip = findSnippet('builtin-algebra-frac')
  if (!snip) {
    // Fallback if builtin id missing – should not happen
    await insertSnippet({
      id: 'builtin-algebra-frac',
      category: 'algebra',
      title_de: 'Bruch',
      title_en: 'Fraction',
      body: '\\frac{a}{b}',
      wrap: 'inline',
      builtin: true,
    })
    return
  }
  await insertSnippet(snip)
}

/**
 * @param {string} raw
 * @returns {'inline' | 'display'}
 */
function parseWrap(raw) {
  const q = String(raw).trim().toLowerCase()
  if (q === 'display' || q === 'd' || q === '$$' || q === 'anzeige') return 'display'
  return 'inline'
}

/**
 * @param {string} raw
 */
function parseCategory(raw) {
  const q = String(raw).trim().toLowerCase()
  if (CATEGORY_IDS.includes(q)) return q
  if (q === 'sonstiges' || q === 'misc' || q === 'other') return 'misc'
  if (q.startsWith('alg')) return 'algebra'
  if (q.startsWith('ana')) return 'analysis'
  if (q.startsWith('lin')) return 'linear'
  return 'misc'
}

async function addCustom() {
  try {
    if (store.custom.length >= MAX_CUSTOM) {
      await fanotes.ui.toast(
        t(`Maximal ${MAX_CUSTOM} eigene Schnipsel.`, `Maximum ${MAX_CUSTOM} custom snippets.`),
        'error',
      )
      return
    }

    const titleDeRaw = await fanotes.ui.prompt(t('Titel (DE)', 'Title (DE)'), {
      title: t('Neuer Schnipsel', 'New snippet'),
      placeholder: t('z. B. Binomische Formel', 'e.g. Binomial formula'),
    })
    if (titleDeRaw === null) return
    const title_de = titleDeRaw.trim()
    if (!title_de) {
      await fanotes.ui.toast(t('Titel darf nicht leer sein.', 'Title must not be empty.'), 'error')
      return
    }

    const titleEnRaw = await fanotes.ui.prompt(t('Titel (EN)', 'Title (EN)'), {
      title: t('Neuer Schnipsel', 'New snippet'),
      value: title_de,
      placeholder: 'e.g. Binomial formula',
    })
    if (titleEnRaw === null) return
    const title_en = titleEnRaw.trim() || title_de

    const bodyRaw = await fanotes.ui.prompt(
      t('LaTeX-Körper (ohne $…$)', 'LaTeX body (without $…$)'),
      {
        title: t('Schnipsel-Körper', 'Snippet body'),
        multiline: true,
        value: '\\frac{a}{b}',
      },
    )
    if (bodyRaw === null) return
    const body = String(bodyRaw)
    if (!body.trim()) {
      await fanotes.ui.toast(t('Körper darf nicht leer sein.', 'Body must not be empty.'), 'error')
      return
    }
    if (body.length > MAX_BODY) {
      await fanotes.ui.toast(
        t(`Körper zu lang (max. ${MAX_BODY}).`, `Body too long (max ${MAX_BODY}).`),
        'error',
      )
      return
    }

    const wrapRaw = await fanotes.ui.prompt(
      t('Wrap: inline oder display', 'Wrap: inline or display'),
      {
        title: t('Wrap', 'Wrap'),
        value: store.settings.preferDisplay ? 'display' : 'inline',
        placeholder: 'inline | display',
      },
    )
    if (wrapRaw === null) return

    const catRaw = await fanotes.ui.prompt(
      t(
        'Kategorie: algebra | analysis | linear | misc',
        'Category: algebra | analysis | linear | misc',
      ),
      {
        title: t('Kategorie', 'Category'),
        value: filterCategory !== 'all' ? filterCategory : 'misc',
      },
    )
    if (catRaw === null) return

    const snip = {
      id: newId(),
      category: parseCategory(catRaw),
      title_de,
      title_en,
      body,
      wrap: parseWrap(wrapRaw),
      builtin: false,
    }
    store.custom.push(snip)
    selectedId = snip.id
    await saveStore()
    await fanotes.ui.toast(t('Schnipsel angelegt.', 'Snippet created.'), 'success')
    await refreshPanel()
  } catch (error) {
    await fanotes.ui.toast(
      t(`Anlegen fehlgeschlagen: ${errMessage(error)}`, `Create failed: ${errMessage(error)}`),
      'error',
    )
  }
}

/**
 * Edit a custom snippet in place.
 * @param {Snippet} snip
 */
async function editCustomSnippet(snip) {
  try {
    const titleDeRaw = await fanotes.ui.prompt(t('Titel (DE)', 'Title (DE)'), {
      title: t('Schnipsel bearbeiten', 'Edit snippet'),
      value: snip.title_de,
    })
    if (titleDeRaw === null) return
    const title_de = titleDeRaw.trim()
    if (!title_de) {
      await fanotes.ui.toast(t('Titel darf nicht leer sein.', 'Title must not be empty.'), 'error')
      return
    }

    const titleEnRaw = await fanotes.ui.prompt(t('Titel (EN)', 'Title (EN)'), {
      title: t('Schnipsel bearbeiten', 'Edit snippet'),
      value: snip.title_en,
    })
    if (titleEnRaw === null) return
    const title_en = titleEnRaw.trim() || title_de

    const bodyRaw = await fanotes.ui.prompt(
      t('LaTeX-Körper (ohne $…$)', 'LaTeX body (without $…$)'),
      {
        title: t('Schnipsel-Körper', 'Snippet body'),
        multiline: true,
        value: snip.body,
      },
    )
    if (bodyRaw === null) return
    const body = String(bodyRaw)
    if (!body.trim()) {
      await fanotes.ui.toast(t('Körper darf nicht leer sein.', 'Body must not be empty.'), 'error')
      return
    }
    if (body.length > MAX_BODY) {
      await fanotes.ui.toast(
        t(`Körper zu lang (max. ${MAX_BODY}).`, `Body too long (max ${MAX_BODY}).`),
        'error',
      )
      return
    }

    const wrapRaw = await fanotes.ui.prompt(
      t('Wrap: inline oder display', 'Wrap: inline or display'),
      {
        title: t('Wrap', 'Wrap'),
        value: snip.wrap,
      },
    )
    if (wrapRaw === null) return

    const catRaw = await fanotes.ui.prompt(
      t(
        'Kategorie: algebra | analysis | linear | misc',
        'Category: algebra | analysis | linear | misc',
      ),
      {
        title: t('Kategorie', 'Category'),
        value: snip.category,
      },
    )
    if (catRaw === null) return

    snip.title_de = title_de
    snip.title_en = title_en
    snip.body = body
    snip.wrap = parseWrap(wrapRaw)
    snip.category = parseCategory(catRaw)
    await saveStore()
    await fanotes.ui.toast(t('Schnipsel gespeichert.', 'Snippet saved.'), 'success')
    await refreshPanel()
  } catch (error) {
    await fanotes.ui.toast(
      t(`Bearbeiten fehlgeschlagen: ${errMessage(error)}`, `Edit failed: ${errMessage(error)}`),
      'error',
    )
  }
}

async function editSelected() {
  const snip = selectedId ? findSnippet(selectedId) : null
  if (!snip) {
    await fanotes.ui.toast(t('Kein Schnipsel ausgewählt.', 'No snippet selected.'), 'info')
    return
  }
  if (snip.builtin) {
    await fanotes.ui.toast(
      t(
        'Eingebaute Schnipsel sind fest – bitte „Klonen“ nutzen.',
        'Built-in snippets are fixed – use “Clone”.',
      ),
      'info',
    )
    return
  }
  const live = store.custom.find((x) => x.id === snip.id)
  if (!live) {
    await fanotes.ui.toast(t('Eigener Schnipsel nicht gefunden.', 'Custom snippet not found.'), 'error')
    return
  }
  await editCustomSnippet(live)
}

async function cloneSelected() {
  try {
    const snip = selectedId ? findSnippet(selectedId) : null
    if (!snip) {
      await fanotes.ui.toast(t('Kein Schnipsel ausgewählt.', 'No snippet selected.'), 'info')
      return
    }
    if (store.custom.length >= MAX_CUSTOM) {
      await fanotes.ui.toast(
        t(`Maximal ${MAX_CUSTOM} eigene Schnipsel.`, `Maximum ${MAX_CUSTOM} custom snippets.`),
        'error',
      )
      return
    }

    const clone = {
      id: newId(),
      category: snip.category,
      title_de: `${snip.title_de} (${t('Kopie', 'copy')})`,
      title_en: `${snip.title_en} (${t('Kopie', 'copy')})`,
      body: snip.body,
      wrap: snip.wrap,
      builtin: false,
    }
    store.custom.push(clone)
    selectedId = clone.id
    await saveStore()
    await fanotes.ui.toast(t('Klon angelegt – bearbeiten…', 'Clone created – editing…'), 'success')
    await refreshPanel()
    const live = store.custom.find((x) => x.id === clone.id)
    if (live) await editCustomSnippet(live)
  } catch (error) {
    await fanotes.ui.toast(
      t(`Klonen fehlgeschlagen: ${errMessage(error)}`, `Clone failed: ${errMessage(error)}`),
      'error',
    )
  }
}

async function deleteSelected() {
  try {
    const snip = selectedId ? findSnippet(selectedId) : null
    if (!snip) {
      await fanotes.ui.toast(t('Kein Schnipsel ausgewählt.', 'No snippet selected.'), 'info')
      return
    }
    if (snip.builtin) {
      await fanotes.ui.toast(
        t('Eingebaute Schnipsel können nicht gelöscht werden.', 'Built-in snippets cannot be deleted.'),
        'info',
      )
      return
    }

    const ok = await fanotes.ui.confirm(
      t(
        `Schnipsel „${snippetTitle(snip)}“ wirklich löschen?`,
        `Really delete snippet “${snippetTitle(snip)}”?`,
      ),
      {
        title: t('Schnipsel löschen', 'Delete snippet'),
        confirmLabel: t('Löschen', 'Delete'),
      },
    )
    if (!ok) return

    store.custom = store.custom.filter((x) => x.id !== snip.id)
    if (store.settings.lastId === snip.id) store.settings.lastId = null
    selectedId = null
    await saveStore()
    await fanotes.ui.toast(t('Schnipsel gelöscht.', 'Snippet deleted.'), 'success')
    await refreshPanel()
  } catch (error) {
    await fanotes.ui.toast(
      t(`Löschen fehlgeschlagen: ${errMessage(error)}`, `Delete failed: ${errMessage(error)}`),
      'error',
    )
  }
}

function previewBody(body) {
  const one = String(body).replace(/\s+/gu, ' ').trim()
  if (one.length <= 72) return one
  return `${one.slice(0, 71)}…`
}

/** @returns {Snippet[]} */
function filteredSnippets() {
  const q = searchQuery.trim().toLowerCase()
  return allSnippets().filter((snip) => {
    if (filterCategory !== 'all' && snip.category !== filterCategory) return false
    if (!q) return true
    const hay = [
      snip.title_de,
      snip.title_en,
      snip.body,
      snip.category,
      snip.wrap,
      snip.builtin ? 'builtin' : 'custom',
    ]
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
}

function renderBlocks() {
  const selected = selectedId ? findSnippet(selectedId) : null
  const last = store.settings.lastId ? findSnippet(store.settings.lastId) : null
  const list = filteredSnippets()
  const isCustom = Boolean(selected && !selected.builtin)

  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Formel-Schnipsel', 'Math Snippets'), level: 2 },
    {
      type: 'text',
      muted: true,
      text: t(
        'LaTeX-Schnipsel einfügen ($…$ oder $$…$$). Klick auf eine Zeile fügt ein. Keine KaTeX-Vorschau.',
        'Insert LaTeX snippets ($…$ or $$…$$). Click a row to insert. No KaTeX preview.',
      ),
    },
    {
      type: 'keyvalue',
      items: [
        { key: t('Sichtbar', 'Visible'), value: String(list.length) },
        {
          key: t('Zuletzt', 'Last used'),
          value: last ? snippetTitle(last) : t('—', '—'),
        },
        {
          key: t('Auswahl', 'Selected'),
          value: selected ? snippetTitle(selected) : t('—', '—'),
        },
      ],
    },
    {
      type: 'select',
      id: 'category',
      label: t('Kategorie', 'Category'),
      value: filterCategory,
      options: [
        { value: 'all', label: categoryLabel('all') },
        { value: 'algebra', label: categoryLabel('algebra') },
        { value: 'analysis', label: categoryLabel('analysis') },
        { value: 'linear', label: categoryLabel('linear') },
        { value: 'misc', label: categoryLabel('misc') },
      ],
    },
    {
      type: 'input',
      id: 'search',
      label: t('Suche', 'Search'),
      value: searchQuery,
      placeholder: t('Titel oder LaTeX…', 'Title or LaTeX…'),
    },
    {
      type: 'checkbox',
      id: 'preferDisplay',
      label: t('Display bevorzugen ($$…$$)', 'Prefer display ($$…$$)'),
      checked: store.settings.preferDisplay === true,
    },
    { type: 'divider' },
    { type: 'heading', text: t('Schnipsel', 'Snippets'), level: 3 },
    {
      type: 'list',
      id: 'snippets',
      empty: t('Keine Treffer.', 'No matches.'),
      items: list.map((snip) => ({
        id: snip.id,
        title: snippetTitle(snip),
        detail: `${categoryLabel(snip.category)} · ${snip.wrap} · ${previewBody(snip.body)}`,
        badge: snip.builtin
          ? snip.id === selectedId
            ? '✓'
            : t('fest', 'built-in')
          : snip.id === selectedId
            ? '✓'
            : t('eigen', 'custom'),
      })),
    },
    {
      type: 'callout',
      tone: 'info',
      text: t(
        'Klick auf eine Zeile fügt sofort ein. Eingebaute Schnipsel: Klonen zum Bearbeiten. Keine automatische Math-Formatierung in v1.',
        'Click a row to insert immediately. Built-ins: Clone to edit. No automatic math formatting in v1.',
      ),
    },
    {
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'insert',
          label: t('Einfügen', 'Insert'),
          primary: true,
          disabled: !selected,
        },
        {
          type: 'button',
          id: 'add',
          label: t('Neu', 'New'),
        },
        {
          type: 'button',
          id: 'clone',
          label: t('Klonen', 'Clone'),
          disabled: !selected,
        },
        {
          type: 'button',
          id: 'edit',
          label: t('Bearbeiten', 'Edit'),
          disabled: !isCustom,
        },
        {
          type: 'button',
          id: 'delete',
          label: t('Löschen', 'Delete'),
          danger: true,
          disabled: !isCustom,
        },
      ],
    },
  ]

  return blocks
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Formel-Schnipsel', 'Math Snippets'))
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
      title: t('Formel-Schnipsel', 'Math Snippets'),
      icon: '∑',
      blocks: renderBlocks(),
    })

    panel.onAction(async (action) => {
      try {
        if (action.id === 'snippets' && action.itemId) {
          selectedId = String(action.itemId)
          const snip = findSnippet(selectedId)
          if (snip) await insertSnippet(snip)
          else await refreshPanel()
          return
        }
        if (action.id === 'submit:search') {
          const values = action.values || {}
          if (values.search != null) searchQuery = String(values.search)
          await refreshPanel()
          return
        }
        if (action.id === 'insert') {
          const snip = selectedId ? findSnippet(selectedId) : null
          if (!snip) {
            await fanotes.ui.toast(
              t('Kein Schnipsel ausgewählt.', 'No snippet selected.'),
              'info',
            )
            return
          }
          await insertSnippet(snip)
          return
        }
        if (action.id === 'add') {
          await addCustom()
          return
        }
        if (action.id === 'clone') {
          await cloneSelected()
          return
        }
        if (action.id === 'edit') {
          await editSelected()
          return
        }
        if (action.id === 'delete') {
          await deleteSelected()
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
        if (input.id === 'category') {
          filterCategory = String(input.value || 'all')
          await refreshPanel()
          return
        }
        if (input.id === 'search') {
          searchQuery = String(input.value ?? '')
          await refreshPanel()
          return
        }
        if (input.id === 'preferDisplay') {
          store.settings.preferDisplay = input.value === true
          await saveStore()
          await refreshPanel()
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

fanotes.commands.register({
  id: 'open',
  title: t('Formel-Schnipsel öffnen', 'Open Math Snippets'),
  detail: t(
    'Panel mit Kategorien, Suche und Einfügen',
    'Panel with categories, search and insert',
  ),
  keywords: 'formel math latex schnipsel snippet öffnen open panel algebra analysis',
  run: () => {
    try {
      openPanel()
    } catch (error) {
      void fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'insert-last',
  title: t('Letzten Schnipsel einfügen', 'Insert last snippet'),
  detail: t(
    'Zuletzt genutzten Schnipsel an Cursor/Auswahl einfügen',
    'Insert last-used snippet at cursor/selection',
  ),
  keywords: 'formel math latex schnipsel snippet einfügen insert zuletzt last',
  run: async () => {
    try {
      await insertLast()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'insert-fraction',
  title: t('Bruch einfügen', 'Insert fraction'),
  detail: t(
    'Schnell \\frac{a}{b} einfügen (Display-Einstellung beachten)',
    'Quick-insert \\frac{a}{b} (respects prefer-display)',
  ),
  keywords: 'formel math latex bruch fraction frac einfügen insert algebra',
  run: async () => {
    try {
      await insertFraction()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.onActivate(async () => {
  try {
    await loadStore()
    fanotes.log(
      'math-snippets activated',
      fanotes.app.appVersion,
      builtinSnippets().length,
      store.custom.length,
    )
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(() => {
  panel = null
})
