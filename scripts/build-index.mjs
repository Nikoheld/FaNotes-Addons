#!/usr/bin/env node
// Builds index.json – the file FaNotes downloads to list the store.
//   node scripts/build-index.mjs           # write index.json
//   node scripts/build-index.mjs --check   # fail if index.json is out of date
//
// Add-ons with problems are left out (and reported) so one broken folder can
// never hide the others. The "Auto-index" workflow runs this after every merge.

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { ADDONS_DIR, inspectAll } from './lib/inspect.mjs'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const checkOnly = process.argv.includes('--check')
const indexPath = path.join(root, 'index.json')

const lastCommitDate = (folder) => {
  try {
    const iso = execSync(`git log -1 --format=%cI -- ${JSON.stringify(`${ADDONS_DIR}/${folder}`)}`, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    // Normalise: git prints "+00:00" locally and "Z" on the CI runner for the same instant.
    return iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso).toISOString() : null
  } catch {
    return null
  }
}

const repository = (() => {
  const fromEnv = process.env.GITHUB_REPOSITORY
  if (fromEnv) return fromEnv
  try {
    const remote = execSync('git remote get-url origin', { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    const match = /github\.com[/:]([^/]+\/[^/.]+)/u.exec(remote)
    return match ? match[1] : 'Nikoheld/FaNotes-Addons'
  } catch {
    return 'Nikoheld/FaNotes-Addons'
  }
})()

let previous = null
try {
  previous = JSON.parse(await readFile(indexPath, 'utf8'))
} catch { /* first build */ }
const previousById = new Map((previous?.addons ?? []).map((entry) => [entry.id, entry]))

const results = await inspectAll(root)
const addons = []
const skipped = []
for (const result of results) {
  if (!result.manifest || result.problems.length) {
    skipped.push({ id: result.id, problems: result.problems })
    continue
  }
  const before = previousById.get(result.id)
  // Uncommitted folders have no git date yet; keep the previous stamp so
  // `--check` stays stable and only fall back to "now" for a brand-new add-on.
  const updatedAt = lastCommitDate(result.id)
    ?? (before && before.files?.['main.js']?.sha256 === result.files['main.js']?.sha256 && before.version === result.manifest.version ? before.updatedAt : null)
    ?? new Date().toISOString()
  addons.push({
    ...result.manifest,
    path: `${ADDONS_DIR}/${result.id}`,
    files: result.files,
    updatedAt,
  })
}
addons.sort((left, right) => left.id.localeCompare(right.id))

// Keep generatedAt stable when nothing changed so the auto-index commit is a no-op.
const stripVolatile = (index) => JSON.stringify({ ...index, generatedAt: null })
const next = {
  schema: 1,
  repository,
  branch: process.env.GITHUB_REF_NAME || 'main',
  generatedAt: new Date().toISOString(),
  count: addons.length,
  addons,
}
const unchanged = previous && stripVolatile(previous) === stripVolatile(next)
const output = unchanged ? previous : next

for (const entry of skipped) console.log(`⚠ ${entry.id} übersprungen: ${entry.problems[0] ?? 'unbekanntes Problem'}`)
console.log(`${addons.length} Add-on(s) im Index${unchanged ? ' (unverändert)' : ''}.`)

if (checkOnly) {
  if (!previous || !unchanged) {
    console.error('index.json ist nicht aktuell. Bitte `node scripts/build-index.mjs` ausführen.')
    process.exit(1)
  }
} else if (!unchanged) {
  await writeFile(indexPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
  console.log('index.json geschrieben.')
}
