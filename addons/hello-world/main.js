// Hello World – the smallest complete FaNotes add-on.
//
// Everything runs inside a Web Worker. `fanotes` is a global object (typed in
// ../../sdk/fanotes-addon.d.ts). Nothing here can reach the DOM, the file
// system or the network: every call goes through the host, which checks the
// permissions declared in manifest.json.

/// <reference path="../../sdk/fanotes-addon.d.ts" />

let greetings = 0

// A command shows up in the command palette (Ctrl+P) under "Add-on: Hello World".
fanotes.commands.register({
  id: 'greet',
  title: 'Hallo sagen',
  detail: 'Begrüßt dich mit dem Namen der offenen Notiz',
  run: async () => {
    const note = await fanotes.notes.active()
    greetings += 1
    await fanotes.ui.toast(note ? `Hallo aus „${note.title}“! (${greetings}×)` : 'Hallo! Öffne eine Notiz, dann kenne ich ihren Namen.', 'success')
  },
})

// A panel is a JSON description that FaNotes renders in the add-on dock.
fanotes.commands.register({
  id: 'open-panel',
  title: 'Hello-World-Panel öffnen',
  run: () => {
    const panel = fanotes.ui.panel({
      id: 'main',
      title: 'Hello World',
      icon: '👋',
      blocks: render(),
    })
    panel.onAction(async (action) => {
      if (action.id === 'greet') {
        greetings += 1
        await panel.update(render())
      }
      if (action.id === 'count-notes') {
        const notes = await fanotes.notes.list()
        await fanotes.ui.toast(`Dein Vault hat ${notes.length} Notizen.`)
      }
    })
  },
})

function render() {
  return [
    { type: 'heading', text: 'Hallo aus dem Worker' },
    { type: 'text', text: `Du hast ${greetings}× gegrüßt.` },
    { type: 'row', children: [
      { type: 'button', id: 'greet', label: 'Grüßen', primary: true },
      { type: 'button', id: 'count-notes', label: 'Notizen zählen' },
    ] },
    { type: 'callout', tone: 'info', text: 'Dieses Panel ist reines JSON – FaNotes rendert es. Ein Fehler hier kann die App nicht mitreißen.' },
  ]
}

// Optional lifecycle hooks.
fanotes.onActivate(() => fanotes.log('Hello World aktiviert in FaNotes', fanotes.app.appVersion))
