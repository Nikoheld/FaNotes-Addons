/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Vorlagen-Bibliothek / Template Library – CRUD templates in storage,
// insert into the editor with {{date}}, {{time}}, {{title}}, {{selection}}.

const MAX_TEMPLATES = 40
const MAX_BODY = 20000
const STORAGE_KEY = 'data'
const PANEL_ID = 'library'

/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   body: string,
 *   keywords: string,
 * }} Template
 */

/**
 * @typedef {{
 *   templates: Template[],
 *   lastUsedId: string | null,
 *   seeded: boolean,
 * }} Store
 */

/** @type {Store} */
let store = { templates: [], lastUsedId: null, seeded: false }

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

function pad2(n) {
  return String(n).padStart(2, '0')
}

/** Local calendar date as `YYYY-MM-DD`. */
function formatDateLocal(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function formatTimeLocal(date = new Date()) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function newId() {
  return `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * @param {unknown} raw
 * @returns {Template | null}
 */
function normalizeTemplate(raw) {
  if (!raw || typeof raw !== 'object') return null
  const obj = /** @type {Record<string, unknown>} */ (raw)
  const id = obj.id != null ? String(obj.id).trim() : ''
  const title = obj.title != null ? String(obj.title).trim() : ''
  const body = obj.body != null ? String(obj.body) : ''
  const keywords = obj.keywords != null ? String(obj.keywords).trim() : ''
  if (!id || !title) return null
  return { id, title, body, keywords }
}

/** Starter set – language-aware bodies via `t()` at first seed. */
function starterTemplates() {
  /** @type {Template[]} */
  return [
    {
      id: 'starter-protokoll',
      title: t('Protokoll', 'Meeting minutes'),
      keywords: t('meeting protokoll sitzung', 'meeting minutes protocol'),
      body: t(
        [
          '# {{title}} – Protokoll',
          'Datum: {{date}} {{time}}',
          '',
          '## Teilnehmende',
          '- ',
          '',
          '## Themen',
          '1. ',
          '',
          '## Beschlüsse / To-dos',
          '- [ ] ',
          '',
          '## Notizen',
          '{{selection}}',
          '',
        ].join('\n'),
        [
          '# {{title}} – Meeting minutes',
          'Date: {{date}} {{time}}',
          '',
          '## Attendees',
          '- ',
          '',
          '## Topics',
          '1. ',
          '',
          '## Decisions / To-dos',
          '- [ ] ',
          '',
          '## Notes',
          '{{selection}}',
          '',
        ].join('\n'),
      ),
    },
    {
      id: 'starter-hausaufgabe',
      title: t('Hausaufgabe', 'Homework'),
      keywords: t('hausaufgabe homework schule aufgabe', 'homework school assignment'),
      body: t(
        [
          '# Hausaufgabe: {{title}}',
          'Datum: {{date}}',
          '',
          '## Aufgabe',
          '{{selection}}',
          '',
          '## Bearbeitung',
          '',
          '',
          '## Abgabe',
          '- [ ] erledigt',
          '',
        ].join('\n'),
        [
          '# Homework: {{title}}',
          'Date: {{date}}',
          '',
          '## Assignment',
          '{{selection}}',
          '',
          '## Work',
          '',
          '',
          '## Due',
          '- [ ] done',
          '',
        ].join('\n'),
      ),
    },
    {
      id: 'starter-wochenplan',
      title: t('Wochenplan', 'Weekly plan'),
      keywords: t('wochenplan week plan woche', 'weekly plan week schedule'),
      body: t(
        [
          '# Wochenplan – {{date}}',
          '',
          '## Montag',
          '- [ ] ',
          '',
          '## Dienstag',
          '- [ ] ',
          '',
          '## Mittwoch',
          '- [ ] ',
          '',
          '## Donnerstag',
          '- [ ] ',
          '',
          '## Freitag',
          '- [ ] ',
          '',
          '## Wochenende',
          '- [ ] ',
          '',
          '{{selection}}',
          '',
        ].join('\n'),
        [
          '# Weekly plan – {{date}}',
          '',
          '## Monday',
          '- [ ] ',
          '',
          '## Tuesday',
          '- [ ] ',
          '',
          '## Wednesday',
          '- [ ] ',
          '',
          '## Thursday',
          '- [ ] ',
          '',
          '## Friday',
          '- [ ] ',
          '',
          '## Weekend',
          '- [ ] ',
          '',
          '{{selection}}',
          '',
        ].join('\n'),
      ),
    },
  ]
}

async function loadStore() {
  try {
    const raw = await fanotes.storage.get(STORAGE_KEY)
    if (raw && typeof raw === 'object') {
      const obj = /** @type {Record<string, unknown>} */ (raw)
      const list = Array.isArray(obj.templates) ? obj.templates : []
      /** @type {Template[]} */
      const templates = []
      for (const item of list) {
        const n = normalizeTemplate(item)
        if (n) templates.push(n)
      }
      store = {
        templates,
        lastUsedId: obj.lastUsedId != null ? String(obj.lastUsedId) : null,
        seeded: obj.seeded === true,
      }
    } else {
      store = { templates: [], lastUsedId: null, seeded: false }
    }
  } catch (error) {
    fanotes.log('loadStore failed', errMessage(error))
    store = { templates: [], lastUsedId: null, seeded: false }
  }

  if (!store.seeded) {
    if (store.templates.length === 0) {
      store.templates = starterTemplates()
      if (!store.lastUsedId) store.lastUsedId = store.templates[0]?.id ?? null
    }
    store.seeded = true
    await saveStore()
  }

  if (selectedId && !store.templates.some((x) => x.id === selectedId)) {
    selectedId = null
  }
  if (!selectedId && store.lastUsedId && store.templates.some((x) => x.id === store.lastUsedId)) {
    selectedId = store.lastUsedId
  }
  if (!selectedId && store.templates.length) {
    selectedId = store.templates[0].id
  }
}

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
 * @returns {Template | null}
 */
function findTemplate(id) {
  return store.templates.find((x) => x.id === id) ?? null
}

/**
 * Resolve {{date}}, {{time}}, {{title}}, {{selection}} at insert time.
 * @param {string} body
 */
async function resolvePlaceholders(body) {
  let date = formatDateLocal()
  let time = formatTimeLocal()
  let title = ''
  let selection = ''

  try {
    const sel = await fanotes.editor.getSelection()
    if (sel && typeof sel.text === 'string') selection = sel.text
  } catch (error) {
    fanotes.log('getSelection failed', errMessage(error))
  }

  try {
    const active = await fanotes.notes.active()
    if (active && active.title) title = String(active.title)
  } catch (error) {
    fanotes.log('notes.active failed', errMessage(error))
  }

  // Function replacers: string replacements would interpret $ in title/selection.
  return String(body)
    .replace(/\{\{\s*date\s*\}\}/giu, () => date)
    .replace(/\{\{\s*time\s*\}\}/giu, () => time)
    .replace(/\{\{\s*title\s*\}\}/giu, () => title)
    .replace(/\{\{\s*selection\s*\}\}/giu, () => selection)
}

/**
 * Insert resolved body: replace selection if present, else insert at cursor.
 * @param {Template} tpl
 */
async function insertTemplate(tpl) {
  try {
    const text = await resolvePlaceholders(tpl.body)
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

    store.lastUsedId = tpl.id
    selectedId = tpl.id
    await saveStore()
    await fanotes.ui.toast(
      t(`Vorlage eingefügt: ${tpl.title}`, `Template inserted: ${tpl.title}`),
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

async function insertLastUsed() {
  const id = store.lastUsedId
  const tpl = id ? findTemplate(id) : null
  if (!tpl) {
    await fanotes.ui.toast(
      t('Keine zuletzt genutzte Vorlage.', 'No last-used template.'),
      'info',
    )
    return
  }
  await insertTemplate(tpl)
}

/**
 * Pick a template via numbered prompt, then insert.
 */
async function pickAndInsert() {
  try {
    if (!store.templates.length) {
      await fanotes.ui.toast(t('Keine Vorlagen vorhanden.', 'No templates available.'), 'info')
      return
    }

    const lines = store.templates.map((tpl, i) => `${i + 1}. ${tpl.title}`)
    const raw = await fanotes.ui.prompt(
      t(
        `Nummer oder Titel eingeben:\n${lines.join('\n')}`,
        `Enter number or title:\n${lines.join('\n')}`,
      ),
      {
        title: t('Vorlage wählen', 'Pick template'),
        placeholder: t('z. B. 1 oder Protokoll', 'e.g. 1 or Meeting'),
      },
    )
    if (raw === null) return
    const q = raw.trim()
    if (!q) return

    let tpl = null
    const asNum = Number(q)
    if (Number.isFinite(asNum) && asNum >= 1 && asNum <= store.templates.length) {
      tpl = store.templates[Math.floor(asNum) - 1]
    } else {
      const lower = q.toLowerCase()
      tpl =
        store.templates.find((x) => x.title.toLowerCase() === lower) ||
        store.templates.find((x) => x.title.toLowerCase().includes(lower)) ||
        store.templates.find((x) => x.keywords.toLowerCase().includes(lower)) ||
        null
    }

    if (!tpl) {
      await fanotes.ui.toast(t('Vorlage nicht gefunden.', 'Template not found.'), 'error')
      return
    }
    await insertTemplate(tpl)
  } catch (error) {
    await fanotes.ui.toast(
      t(`Auswahl fehlgeschlagen: ${errMessage(error)}`, `Pick failed: ${errMessage(error)}`),
      'error',
    )
  }
}

async function addTemplate() {
  try {
    const titleRaw = await fanotes.ui.prompt(t('Titel der Vorlage', 'Template title'), {
      title: t('Neue Vorlage', 'New template'),
      placeholder: t('z. B. Lernzettel', 'e.g. Study sheet'),
    })
    if (titleRaw === null) return
    const title = titleRaw.trim()
    if (!title) {
      await fanotes.ui.toast(t('Titel darf nicht leer sein.', 'Title must not be empty.'), 'error')
      return
    }

    const bodyRaw = await fanotes.ui.prompt(
      t(
        'Körper (Platzhalter: {{date}}, {{time}}, {{title}}, {{selection}})',
        'Body (placeholders: {{date}}, {{time}}, {{title}}, {{selection}})',
      ),
      {
        title: t('Vorlagen-Körper', 'Template body'),
        multiline: true,
        value: t(
          `# ${title}\nDatum: {{date}} {{time}}\n\n{{selection}}\n`,
          `# ${title}\nDate: {{date}} {{time}}\n\n{{selection}}\n`,
        ),
      },
    )
    if (bodyRaw === null) return

    const kwRaw = await fanotes.ui.prompt(
      t('Keywords (optional, Leerzeichen-getrennt)', 'Keywords (optional, space-separated)'),
      {
        title: t('Keywords', 'Keywords'),
        placeholder: t('z. B. schule lernen', 'e.g. school study'),
        value: '',
      },
    )
    if (kwRaw === null) return

    const tpl = {
      id: newId(),
      title,
      body: String(bodyRaw),
      keywords: String(kwRaw).trim(),
    }
    if (store.templates.length >= MAX_TEMPLATES) {
      await fanotes.ui.toast(t('Maximal 40 Vorlagen.', 'Maximum 40 templates.'), 'error')
      return
    }
    if (String(tpl.body).length > MAX_BODY) {
      await fanotes.ui.toast(t('Vorlage zu lang (max. 20 000 Zeichen).', 'Template too long (max 20,000 characters).'), 'error')
      return
    }
    store.templates.push(tpl)
    selectedId = tpl.id
    await saveStore()
    await fanotes.ui.toast(t('Vorlage angelegt.', 'Template created.'), 'success')
    await refreshPanel()
  } catch (error) {
    await fanotes.ui.toast(
      t(`Anlegen fehlgeschlagen: ${errMessage(error)}`, `Create failed: ${errMessage(error)}`),
      'error',
    )
  }
}

async function editSelected() {
  try {
    const tpl = selectedId ? findTemplate(selectedId) : null
    if (!tpl) {
      await fanotes.ui.toast(t('Keine Vorlage ausgewählt.', 'No template selected.'), 'info')
      return
    }

    const titleRaw = await fanotes.ui.prompt(t('Titel der Vorlage', 'Template title'), {
      title: t('Vorlage bearbeiten', 'Edit template'),
      value: tpl.title,
    })
    if (titleRaw === null) return
    const title = titleRaw.trim()
    if (!title) {
      await fanotes.ui.toast(t('Titel darf nicht leer sein.', 'Title must not be empty.'), 'error')
      return
    }

    const bodyRaw = await fanotes.ui.prompt(
      t(
        'Körper (Platzhalter: {{date}}, {{time}}, {{title}}, {{selection}})',
        'Body (placeholders: {{date}}, {{time}}, {{title}}, {{selection}})',
      ),
      {
        title: t('Vorlagen-Körper', 'Template body'),
        multiline: true,
        value: tpl.body,
      },
    )
    if (bodyRaw === null) return

    const kwRaw = await fanotes.ui.prompt(
      t('Keywords (optional, Leerzeichen-getrennt)', 'Keywords (optional, space-separated)'),
      {
        title: t('Keywords', 'Keywords'),
        value: tpl.keywords,
      },
    )
    if (kwRaw === null) return

    tpl.title = title
    if (String(bodyRaw).length > MAX_BODY) {
      await fanotes.ui.toast(t('Vorlage zu lang (max. 20 000 Zeichen).', 'Template too long (max 20,000 characters).'), 'error')
      return
    }
    tpl.body = String(bodyRaw)
    tpl.keywords = String(kwRaw).trim()
    await saveStore()
    await fanotes.ui.toast(t('Vorlage gespeichert.', 'Template saved.'), 'success')
    await refreshPanel()
  } catch (error) {
    await fanotes.ui.toast(
      t(`Bearbeiten fehlgeschlagen: ${errMessage(error)}`, `Edit failed: ${errMessage(error)}`),
      'error',
    )
  }
}

async function deleteSelected() {
  try {
    const tpl = selectedId ? findTemplate(selectedId) : null
    if (!tpl) {
      await fanotes.ui.toast(t('Keine Vorlage ausgewählt.', 'No template selected.'), 'info')
      return
    }

    const ok = await fanotes.ui.confirm(
      t(
        `Vorlage „${tpl.title}“ wirklich löschen?`,
        `Really delete template “${tpl.title}”?`,
      ),
      {
        title: t('Vorlage löschen', 'Delete template'),
        confirmLabel: t('Löschen', 'Delete'),
      },
    )
    if (!ok) return

    store.templates = store.templates.filter((x) => x.id !== tpl.id)
    if (store.lastUsedId === tpl.id) store.lastUsedId = null
    selectedId = store.templates[0]?.id ?? null
    await saveStore()
    await fanotes.ui.toast(t('Vorlage gelöscht.', 'Template deleted.'), 'success')
    await refreshPanel()
  } catch (error) {
    await fanotes.ui.toast(
      t(`Löschen fehlgeschlagen: ${errMessage(error)}`, `Delete failed: ${errMessage(error)}`),
      'error',
    )
  }
}

function previewSnippet(body) {
  const one = String(body).replace(/\s+/gu, ' ').trim()
  if (one.length <= 90) return one
  return `${one.slice(0, 89)}…`
}

function renderBlocks() {
  const selected = selectedId ? findTemplate(selectedId) : null
  const last = store.lastUsedId ? findTemplate(store.lastUsedId) : null

  /** @type {FaNotes.Block[]} */
  const blocks = [
    { type: 'heading', text: t('Vorlagen-Bibliothek', 'Template Library'), level: 2 },
    {
      type: 'text',
      muted: true,
      text: t(
        'Vorlagen speichern und mit {{date}}, {{time}}, {{title}}, {{selection}} in den Editor einfügen.',
        'Store templates and insert them into the editor with {{date}}, {{time}}, {{title}}, {{selection}}.',
      ),
    },
    {
      type: 'keyvalue',
      items: [
        { key: t('Anzahl', 'Count'), value: String(store.templates.length) },
        {
          key: t('Zuletzt', 'Last used'),
          value: last ? last.title : t('—', '—'),
        },
        {
          key: t('Auswahl', 'Selected'),
          value: selected ? selected.title : t('—', '—'),
        },
      ],
    },
    { type: 'divider' },
    { type: 'heading', text: t('Vorlagen', 'Templates'), level: 3 },
    {
      type: 'list',
      id: 'templates',
      empty: t('Noch keine Vorlagen – „Neu“ anlegen.', 'No templates yet – use “New”.'),
      items: store.templates.map((tpl) => ({
        id: tpl.id,
        title: tpl.title,
        detail: tpl.keywords
          ? `${tpl.keywords} · ${previewSnippet(tpl.body)}`
          : previewSnippet(tpl.body),
        badge: tpl.id === selectedId ? '✓' : undefined,
      })),
    },
  ]

  if (selected) {
    blocks.push({ type: 'divider' })
    blocks.push({
      type: 'heading',
      text: t('Vorschau', 'Preview'),
      level: 3,
    })
    blocks.push({
      type: 'markdown',
      text: selected.body.length > 4000
        ? `${selected.body.slice(0, 3990)}\n\n…`
        : selected.body || t('_(leer)_', '_(empty)_'),
    })
  }

  blocks.push({ type: 'divider' })
  blocks.push({
    type: 'callout',
    tone: 'info',
    text: t(
      'Platzhalter beim Einfügen: {{date}} = lokales YYYY-MM-DD, {{time}} = HH:mm, {{title}} = Titel der aktiven Notiz, {{selection}} = aktuelle Auswahl. Klick auf eine Zeile wählt sie aus.',
      'Placeholders at insert: {{date}} = local YYYY-MM-DD, {{time}} = HH:mm, {{title}} = active note title, {{selection}} = current selection. Click a row to select it.',
    ),
  })
  blocks.push({
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
        id: 'edit',
        label: t('Bearbeiten', 'Edit'),
        disabled: !selected,
      },
      {
        type: 'button',
        id: 'delete',
        label: t('Löschen', 'Delete'),
        danger: true,
        disabled: !selected,
      },
    ],
  })

  return blocks
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Vorlagen-Bibliothek', 'Template Library'))
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
      title: t('Vorlagen-Bibliothek', 'Template Library'),
      icon: '📄',
      blocks: renderBlocks(),
    })

    panel.onAction(async (action) => {
      try {
        if (action.id === 'templates' && action.itemId) {
          selectedId = String(action.itemId)
          await refreshPanel()
          return
        }
        if (action.id === 'insert') {
          const tpl = selectedId ? findTemplate(selectedId) : null
          if (!tpl) {
            await fanotes.ui.toast(
              t('Keine Vorlage ausgewählt.', 'No template selected.'),
              'info',
            )
            return
          }
          await insertTemplate(tpl)
          return
        }
        if (action.id === 'add') {
          await addTemplate()
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
  id: 'open-panel',
  title: t('Vorlagen-Bibliothek öffnen', 'Open Template Library'),
  detail: t(
    'Panel mit Vorlagenliste, Einfügen und CRUD',
    'Panel with template list, insert and CRUD',
  ),
  keywords: 'vorlage template bibliothek library panel öffnen open',
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
  title: t('Letzte Vorlage einfügen', 'Insert last-used template'),
  detail: t(
    'Zuletzt genutzte Vorlage an Cursor/Auswahl einfügen',
    'Insert last-used template at cursor/selection',
  ),
  keywords: 'vorlage template einfügen insert zuletzt last used',
  run: async () => {
    try {
      await insertLastUsed()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'pick-insert',
  title: t('Vorlage wählen und einfügen', 'Pick template and insert'),
  detail: t(
    'Vorlage per Nummer/Titel wählen und einfügen',
    'Pick a template by number/title and insert',
  ),
  keywords: 'vorlage template wählen pick einfügen insert auswahl',
  run: async () => {
    try {
      await pickAndInsert()
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.onActivate(async () => {
  try {
    await loadStore()
    fanotes.log('template-library activated', fanotes.app.appVersion, store.templates.length)
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(() => {
  panel = null
})
