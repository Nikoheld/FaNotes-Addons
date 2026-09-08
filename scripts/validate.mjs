#!/usr/bin/env node
// Validates every add-on in addons/. Runs on each pull request and locally:
//   node scripts/validate.mjs            # all add-ons
//   node scripts/validate.mjs my-addon   # one add-on
// Exit code 1 when any add-on has a problem; warnings never fail the build.

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { compareWithPrevious, inspectAddon, inspectAll } from './lib/inspect.mjs'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const only = process.argv.slice(2).filter((arg) => !arg.startsWith('-'))

const results = only.length ? await Promise.all(only.map((folder) => inspectAddon(root, folder))) : await inspectAll(root)

let previous = null
try {
  previous = JSON.parse(await readFile(path.join(root, 'index.json'), 'utf8'))
} catch { /* first index */ }

const releaseProblems = compareWithPrevious(previous, results)
let failed = 0
for (const result of results) {
  const own = [...result.problems, ...releaseProblems.filter((problem) => problem.startsWith(`${result.id}:`))]
  const status = own.length ? '✖' : '✔'
  const title = result.manifest ? `${result.manifest.name} v${result.manifest.version}` : '(kein Manifest)'
  console.log(`${status} ${result.id} – ${title}`)
  for (const problem of own) console.log(`    Fehler:   ${problem}`)
  for (const warning of result.warnings) console.log(`    Hinweis:  ${warning}`)
  if (own.length) failed += 1
}

const ids = results.map((result) => result.id)
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index)
for (const id of new Set(duplicates)) {
  console.log(`✖ Doppelte Add-on-ID: ${id}`)
  failed += 1
}

console.log('')
if (failed) {
  console.log(`${failed} Add-on(s) mit Fehlern. Bitte beheben, bevor der Pull Request gemerged werden kann.`)
  process.exit(1)
}
console.log(`${results.length} Add-on(s) geprüft, keine Fehler.`)
