// Aufgaben-Sammler – collects every open `- [ ]` task across the vault.
//
// Demonstrates: reading many notes, writing a note back, storage for a
// per-add-on preference, events (re-scan when a note is saved) and a list
// block whose rows are clickable.

/// <reference path="../../sdk/fanotes-addon.d.ts" />

const TASK_LINE = /^(\s*)[-*+]\s+\[( |x|X)\]\s+(.*)$/u
const MAX_NOTES = 400

let tasks = []
let scanning = false
let lastScan = 0
let showDone = false
let panel = null

async function scan() {
  if (scanning) return
  scanning = true
  try {
    const notes = (await fanotes.notes.list()).filter((note) => /\.(md|markdown)$/iu.test(note.path)).slice(0, MAX_NOTES)
    const found = []
    for (const note of notes) {
      let text
      try {
        text = await fanotes.notes.read(note.path)
      } catch {
        continue
      }
      const lines = text.split('\n')
      for (let index = 0; index < lines.length; index += 1) {
        const match = TASK_LINE.exec(lines[index])
        if (!match) continue
        const done = match[2].toLowerCase() === 'x'
        if (done && !showDone) continue
        found.push({ path: note.path, title: note.title, line: index, text: match[3].trim(), done })
      }
    }
    tasks = found
    lastScan = Date.now()
  } finally {
    scanning = false
  }
  await refresh()
}

function render() {
  const open = tasks.filter((task) => !task.done)
  return [
    { type: 'row', children: [
      { type: 'button', id: 'rescan', label: scanning ? 'Suche …' : 'Neu einlesen', disabled: scanning },
      { type: 'checkbox', id: 'show-done', label: 'Erledigte zeigen', checked: showDone },
    ] },
    { type: 'keyvalue', items: [
      { key: 'Offen', value: String(open.length) },
      { key: 'Zuletzt eingelesen', value: lastScan ? new Date(lastScan).toLocaleTimeString() : '–' },
    ] },
    { type: 'divider' },
    {
      type: 'list',
      id: 'tasks',
      empty: 'Keine Aufgaben gefunden. Schreibe „- [ ] Aufgabe“ in eine Notiz.',
      items: tasks.map((task, index) => ({
        id: String(index),
        title: task.text || '(leer)',
        detail: task.title,
        badge: task.done ? '✓' : '',
      })),
    },
    { type: 'text', muted: true, text: 'Klick auf eine Aufgabe öffnet die Notiz; „Abhaken“ setzt das Kreuz direkt in der Datei.' },
    { type: 'button', id: 'complete-first', label: 'Erste offene Aufgabe abhaken', danger: false, disabled: !open.length },
  ]
}

async function refresh() {
  if (panel) await panel.update(render())
}

async function toggleTask(task) {
  const text = await fanotes.notes.read(task.path)
  const lines = text.split('\n')
  const match = TASK_LINE.exec(lines[task.line] ?? '')
  if (!match || match[3].trim() !== task.text) {
    // The note changed since the scan; look for the same task text nearby instead of guessing.
    const at = lines.findIndex((line) => { const m = TASK_LINE.exec(line); return m && m[3].trim() === task.text })
    if (at < 0) throw new fanotes.FaNotesError('E_STALE', 'Die Aufgabe wurde in der Notiz verändert. Bitte neu einlesen.')
    task.line = at
  }
  const line = lines[task.line]
  lines[task.line] = task.done ? line.replace(/\[(x|X)\]/u, '[ ]') : line.replace(/\[ \]/u, '[x]')
  await fanotes.notes.write(task.path, lines.join('\n'))
  task.done = !task.done
  await fanotes.ui.toast(task.done ? `Erledigt: ${task.text}` : `Wieder offen: ${task.text}`, 'success')
  await scan()
}

function openPanel() {
  if (panel) {
    panel.show()
    return
  }
  panel = fanotes.ui.panel({ id: 'tasks', title: 'Aufgaben', icon: '☑', blocks: render() })
  panel.onAction(async (action) => {
    if (action.id === 'rescan') await scan()
    if (action.id === 'tasks' && action.itemId !== undefined) {
      const task = tasks[Number(action.itemId)]
      if (!task) return
      const done = await fanotes.ui.confirm(`„${task.text}“ in ${task.title}\n\nNotiz öffnen oder Aufgabe ${task.done ? 'wieder öffnen' : 'abhaken'}?`, { title: 'Aufgabe', confirmLabel: task.done ? 'Wieder öffnen' : 'Abhaken' })
      if (done) await toggleTask(task)
      else await fanotes.notes.open(task.path)
    }
    if (action.id === 'complete-first') {
      const first = tasks.find((task) => !task.done)
      if (first) await toggleTask(first)
    }
  })
  panel.onInput(async (input) => {
    if (input.id === 'show-done') {
      showDone = input.value === true
      await fanotes.storage.set('showDone', showDone)
      await scan()
    }
  })
  void scan()
}

fanotes.commands.register({ id: 'open', title: 'Aufgaben-Sammler öffnen', detail: 'Alle offenen Aufgaben des Vaults in einem Panel', keywords: 'todo aufgaben checkbox', run: openPanel })
fanotes.commands.register({ id: 'rescan', title: 'Aufgaben neu einlesen', run: scan })

fanotes.onActivate(async () => {
  showDone = (await fanotes.storage.get('showDone')) === true
  let timer = 0
  fanotes.events.on('note:saved', () => {
    if (!panel) return
    clearTimeout(timer)
    timer = setTimeout(() => { void scan() }, 1500)
  })
})
