#!/usr/bin/env node
// Scaffolds a new add-on folder:
//   node scripts/new-addon.mjs my-addon "Mein Add-on" "Dein Name"

import { mkdir, writeFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ADDON_ID_PATTERN } from './lib/manifest.mjs'

const [id, name = id, author = 'Dein Name'] = process.argv.slice(2)
if (!id || !ADDON_ID_PATTERN.test(id)) {
  console.error('Nutzung: node scripts/new-addon.mjs <id> ["Name"] ["Autor"]\nDie ID besteht aus Kleinbuchstaben, Ziffern und Bindestrichen, z. B. wort-zaehler.')
  process.exit(1)
}

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const dir = path.join(root, 'addons', id)
if (await stat(dir).then(() => true).catch(() => false)) {
  console.error(`Der Ordner addons/${id} existiert bereits.`)
  process.exit(1)
}
await mkdir(dir, { recursive: true })

await writeFile(path.join(dir, 'manifest.json'), `${JSON.stringify({
  id,
  name,
  version: '1.0.0',
  description: 'Beschreibe in einem Satz, was dein Add-on tut.',
  author: { name: author },
  license: 'MIT',
  api: 1,
  permissions: ['commands', 'ui'],
  categories: ['productivity'],
  keywords: [],
}, null, 2)}\n`)

await writeFile(path.join(dir, 'main.js'), `// ${name} – FaNotes-Add-on
// API-Referenz: ../../docs/API.md · Typen: ../../sdk/fanotes-addon.d.ts
/// <reference path="../../sdk/fanotes-addon.d.ts" />

fanotes.commands.register({
  id: 'hello',
  title: '${name}: Hallo',
  run: async () => {
    await fanotes.ui.toast('Hallo von ${name}!', 'success')
  },
})

fanotes.onActivate(() => {
  fanotes.log('${name} ist aktiv.')
})
`)

await writeFile(path.join(dir, 'README.md'), `# ${name}

Beschreibe hier, was dein Add-on tut, wie man es benutzt und welche Berechtigungen es wofür braucht.

## Berechtigungen

| Berechtigung | Wofür |
| --- | --- |
| \`commands\` | Befehl in der Palette |
| \`ui\` | Toast anzeigen |
`)

console.log(`Angelegt: addons/${id}/`)
console.log('Nächste Schritte:')
console.log('  1. main.js bearbeiten (Typen: sdk/fanotes-addon.d.ts)')
console.log('  2. node scripts/validate.mjs ' + id)
console.log('  3. In FaNotes: Add-on-Store → Entwickeln → Lokal laden (manifest.json + main.js)')
console.log('  4. Pull Request öffnen')
