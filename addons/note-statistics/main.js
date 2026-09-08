// Notiz-Statistik – shows the quiet page statistics FaNotes keeps in the .famd
// payload of every note, live for the active note.
//
// Demonstrates: stats:read + ink:read, reacting to note:opened / note:saved /
// ink:stroke events, a status-bar item, clipboard export and a panel with
// key/value blocks.

/// <reference path="../../sdk/fanotes-addon.d.ts" />

let panel = null
let current = null
let stats = null
let inkStrokes = null
let refreshTimer = 0

const minutes = (ms) => {
  const total = Math.round((ms || 0) / 60000)
  if (total < 60) return `${total} min`
  return `${Math.floor(total / 60)} h ${total % 60} min`
}

const date = (iso) => (iso ? new Date(iso).toLocaleString() : '–')

async function load() {
  current = await fanotes.notes.active()
  if (!current) {
    stats = null
    inkStrokes = null
    return
  }
  try {
    stats = await fanotes.stats.read(current.path)
  } catch (error) {
    stats = null
    fanotes.log('Statistik konnte nicht gelesen werden:', error && error.message)
  }
  try {
    const ink = await fanotes.ink.read(current.path)
    inkStrokes = ink && Array.isArray(ink.pages) ? ink.pages.reduce((sum, page) => sum + (Array.isArray(page.strokes) ? page.strokes.length : 0), 0) : ink && Array.isArray(ink.strokes) ? ink.strokes.length : null
  } catch {
    inkStrokes = null
  }
}

function render() {
  if (!current) return [{ type: 'callout', tone: 'info', text: 'Öffne eine Notiz, um ihre Statistik zu sehen.' }]
  if (!stats) return [{ type: 'heading', text: current.title }, { type: 'text', muted: true, text: 'Für diese Notiz liegen noch keine Statistiken vor.' }]
  const doc = stats.document || {}
  const typing = stats.typing || {}
  const ink = stats.ink || {}
  return [
    { type: 'heading', text: current.title },
    { type: 'text', muted: true, text: `Zuletzt geöffnet ${date(stats.lastOpenedAt)} · ${stats.openCount || 0}× geöffnet · ${(stats.activeDays || []).length} aktive Tage` },
    { type: 'heading', level: 3, text: 'Text' },
    { type: 'keyvalue', items: [
      { key: 'Wörter', value: String(doc.words || 0) },
      { key: 'Zeichen', value: `${doc.characters || 0} (${doc.charactersWithoutSpaces || 0} ohne Leerzeichen)` },
      { key: 'Lesezeit', value: `${doc.readingMinutes || 0} min` },
      { key: 'Überschriften / Listen / Aufgaben', value: `${doc.headings || 0} / ${doc.listItems || 0} / ${doc.tasksDone || 0} von ${doc.tasks || 0}` },
      { key: 'Getippte Wörter (gesamt)', value: String(typing.wordsTyped || 0) },
      { key: 'Tippzeit', value: minutes(typing.ms) },
      { key: 'Autokorrekturen', value: String(typing.autocorrects || 0) },
    ] },
    { type: 'heading', level: 3, text: 'Handschrift' },
    { type: 'keyvalue', items: [
      { key: 'Striche (Statistik)', value: String(ink.strokes || 0) },
      { key: 'Striche (aktuell auf der Seite)', value: inkStrokes === null ? '–' : String(inkStrokes) },
      { key: 'Stift am Papier', value: minutes(ink.penDownMs) },
      { key: 'Geschriebene Länge', value: `${Math.round((ink.lengthMm || 0) / 10) / 100} m` },
      { key: 'Farben', value: String((ink.colors || []).length) },
    ] },
    { type: 'heading', level: 3, text: 'Zeit auf der Seite' },
    { type: 'progress', value: Math.min(1, (stats.dwellMs || 0) / (4 * 3600000)), label: `${minutes(stats.dwellMs)} insgesamt · längste Sitzung ${minutes(stats.longestSessionMs)}` },
    { type: 'row', children: [
      { type: 'button', id: 'refresh', label: 'Aktualisieren' },
      { type: 'button', id: 'copy', label: 'Als Markdown kopieren' },
    ] },
  ]
}

async function refresh() {
  await load()
  if (panel) await panel.update(render())
  await fanotes.ui.status.set({
    id: 'words',
    text: current && stats ? `${(stats.document && stats.document.words) || 0} W · ${minutes(stats.dwellMs)}` : '',
    title: 'Notiz-Statistik öffnen',
    onClick: openPanel,
  })
}

function scheduleRefresh(delay = 800) {
  clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => { void refresh() }, delay)
}

function openPanel() {
  if (panel) {
    panel.show()
    void refresh()
    return
  }
  panel = fanotes.ui.panel({ id: 'stats', title: 'Statistik', icon: '📊', blocks: render() })
  panel.onAction(async (action) => {
    if (action.id === 'refresh') await refresh()
    if (action.id === 'copy' && stats && current) {
      const doc = stats.document || {}
      const markdown = [
        `## Statistik: ${current.title}`,
        '',
        `| Kennzahl | Wert |`,
        `| --- | --- |`,
        `| Wörter | ${doc.words || 0} |`,
        `| Zeichen | ${doc.characters || 0} |`,
        `| Lesezeit | ${doc.readingMinutes || 0} min |`,
        `| Zeit auf der Seite | ${minutes(stats.dwellMs)} |`,
        `| Öffnungen | ${stats.openCount || 0} |`,
        `| Handschrift-Striche | ${(stats.ink && stats.ink.strokes) || 0} |`,
      ].join('\n')
      await fanotes.clipboard.writeText(markdown)
      await fanotes.ui.toast('Statistik als Markdown-Tabelle kopiert.', 'success')
    }
  })
  void refresh()
}

fanotes.commands.register({ id: 'open', title: 'Notiz-Statistik anzeigen', detail: 'Wörter, Lesezeit, Handschrift und Zeit auf der Seite', keywords: 'statistik wörter lesezeit', run: openPanel })

fanotes.onActivate(async () => {
  fanotes.events.on('note:opened', () => scheduleRefresh(300))
  fanotes.events.on('note:saved', () => scheduleRefresh(500))
  fanotes.events.on('ink:stroke', () => scheduleRefresh(2000))
  await refresh()
})
