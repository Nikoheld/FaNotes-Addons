// Fokus-Timer – a Pomodoro timer that lives in the status bar.
//
// Demonstrates: timers inside the worker, a status-bar item with onClick,
// inputs/selects in a panel, storage for settings and history, ui.prompt,
// and editor.insert to log a finished round into the open note.

/// <reference path="../../sdk/fanotes-addon.d.ts" />

const DEFAULTS = { focusMinutes: 25, breakMinutes: 5, autoLog: true }

let settings = { ...DEFAULTS }
let phase = 'idle' // idle | focus | break
let endsAt = 0
let tick = 0
let roundsToday = 0
let panel = null

const pad = (value) => String(value).padStart(2, '0')

const remaining = () => Math.max(0, endsAt - Date.now())

const clock = () => {
  const ms = remaining()
  return `${pad(Math.floor(ms / 60000))}:${pad(Math.floor((ms % 60000) / 1000))}`
}

async function updateStatus() {
  const label = phase === 'idle' ? '⏱ Fokus' : phase === 'focus' ? `⏱ ${clock()}` : `☕ ${clock()}`
  await fanotes.ui.status.set({ id: 'timer', text: label, title: phase === 'idle' ? 'Fokus-Timer starten' : 'Fokus-Timer öffnen', onClick: openPanel })
}

async function render() {
  return [
    { type: 'heading', text: phase === 'idle' ? 'Bereit' : phase === 'focus' ? 'Fokus' : 'Pause' },
    { type: 'progress', value: phase === 'idle' ? 0 : 1 - remaining() / ((phase === 'focus' ? settings.focusMinutes : settings.breakMinutes) * 60000), label: phase === 'idle' ? `${settings.focusMinutes} min Fokus · ${settings.breakMinutes} min Pause` : `${clock()} verbleibend` },
    { type: 'row', children: [
      phase === 'idle'
        ? { type: 'button', id: 'start', label: 'Fokus starten', primary: true }
        : { type: 'button', id: 'stop', label: 'Abbrechen', danger: true },
      phase === 'focus' ? { type: 'button', id: 'finish', label: 'Runde jetzt abschließen' } : { type: 'button', id: 'break', label: 'Kurze Pause', disabled: phase !== 'idle' },
    ] },
    { type: 'keyvalue', items: [{ key: 'Runden heute', value: String(roundsToday) }] },
    { type: 'divider' },
    { type: 'heading', level: 3, text: 'Einstellungen' },
    { type: 'row', children: [
      { type: 'select', id: 'focusMinutes', label: 'Fokus', value: String(settings.focusMinutes), options: ['15', '20', '25', '30', '45', '50', '60'].map((value) => ({ value, label: `${value} min` })) },
      { type: 'select', id: 'breakMinutes', label: 'Pause', value: String(settings.breakMinutes), options: ['3', '5', '10', '15'].map((value) => ({ value, label: `${value} min` })) },
    ] },
    { type: 'checkbox', id: 'autoLog', label: 'Abgeschlossene Runde in die offene Notiz schreiben', checked: settings.autoLog },
  ]
}

async function refreshPanel() {
  if (panel) await panel.update(await render())
}

function stopTicking() {
  clearInterval(tick)
  tick = 0
}

async function start(nextPhase) {
  phase = nextPhase
  endsAt = Date.now() + (nextPhase === 'focus' ? settings.focusMinutes : settings.breakMinutes) * 60000
  stopTicking()
  tick = setInterval(async () => {
    if (remaining() <= 0) {
      await finish()
      return
    }
    await updateStatus()
    if (panel) await refreshPanel()
  }, 1000)
  await updateStatus()
  await refreshPanel()
}

async function finish() {
  const finished = phase
  stopTicking()
  phase = 'idle'
  if (finished === 'focus') {
    roundsToday += 1
    await fanotes.storage.set(`rounds:${new Date().toISOString().slice(0, 10)}`, roundsToday)
    await fanotes.ui.toast(`Fokus-Runde ${roundsToday} geschafft – Zeit für ${settings.breakMinutes} Minuten Pause.`, 'success')
    if (settings.autoLog) {
      const note = await fanotes.notes.active()
      if (note && note.kind === 'markdown') {
        const what = await fanotes.ui.prompt('Woran hast du gearbeitet?', { title: 'Fokus-Runde protokollieren', placeholder: 'z. B. Mathe-Hausaufgaben' })
        if (what !== null) {
          const line = `\n- ⏱ ${new Date().toLocaleTimeString().slice(0, 5)} Fokus-Runde (${settings.focusMinutes} min)${what ? `: ${what}` : ''}`
          const inserted = await fanotes.editor.insert(line, 'end')
          if (!inserted) await fanotes.notes.append(note.path, line.trimStart())
        }
      }
    }
    await start('break')
    return
  }
  await fanotes.ui.toast('Pause vorbei – bereit für die nächste Runde?', 'info')
  await updateStatus()
  await refreshPanel()
}

function openPanel() {
  if (panel) {
    panel.show()
    return
  }
  panel = fanotes.ui.panel({ id: 'timer', title: 'Fokus-Timer', icon: '⏱', blocks: [] })
  panel.onAction(async (action) => {
    if (action.id === 'start') await start('focus')
    if (action.id === 'break') await start('break')
    if (action.id === 'finish') await finish()
    if (action.id === 'stop') {
      stopTicking()
      phase = 'idle'
      await updateStatus()
      await refreshPanel()
    }
  })
  panel.onInput(async (input) => {
    if (input.id === 'focusMinutes' || input.id === 'breakMinutes') settings[input.id] = Number(input.value) || DEFAULTS[input.id]
    if (input.id === 'autoLog') settings.autoLog = input.value === true
    await fanotes.storage.set('settings', settings)
    await refreshPanel()
  })
  void refreshPanel()
}

fanotes.commands.register({ id: 'toggle', title: phase === 'idle' ? 'Fokus-Timer starten' : 'Fokus-Timer stoppen', detail: 'Pomodoro: 25 Minuten Fokus, 5 Minuten Pause', keywords: 'pomodoro timer fokus', run: async () => {
  if (phase === 'idle') await start('focus')
  else { stopTicking(); phase = 'idle'; await updateStatus(); await refreshPanel() }
} })
fanotes.commands.register({ id: 'open', title: 'Fokus-Timer öffnen', run: openPanel })

fanotes.onActivate(async () => {
  const stored = await fanotes.storage.get('settings')
  if (stored && typeof stored === 'object') settings = { ...DEFAULTS, ...stored }
  roundsToday = Number(await fanotes.storage.get(`rounds:${new Date().toISOString().slice(0, 10)}`)) || 0
  await updateStatus()
})

fanotes.onDeactivate(() => stopTicking())
