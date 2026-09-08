// Reads and validates every add-on folder under addons/. Shared by
// validate.mjs (CI gate for pull requests) and build-index.mjs.

import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  ADDON_ICON_FILE,
  ADDON_MAIN_FILE,
  ADDON_MAX_ICON_BYTES,
  ADDON_MAX_MAIN_BYTES,
  ADDON_MAX_README_BYTES,
  compareAddonVersions,
  parseAddonManifest,
} from './manifest.mjs'

export const ADDONS_DIR = 'addons'
const ALLOWED_FILES = new Set(['manifest.json', ADDON_MAIN_FILE, 'README.md', ADDON_ICON_FILE, 'LICENSE', 'CHANGELOG.md', 'package.json', 'tsconfig.json', 'jsconfig.json', '.gitignore'])
const ALLOWED_DIRS = new Set(['src', 'test', 'tests', 'docs', 'screenshots'])

// Patterns that never belong in a sandboxed add-on. They cannot break out of
// the worker, but they signal code that will not work and confuses users.
const FORBIDDEN_SOURCE = [
  { pattern: /\bimportScripts\s*\(/u, reason: 'importScripts() ist nicht erlaubt – Add-ons bestehen aus einer einzigen main.js.' },
  { pattern: /^\s*import\s+[^(]/mu, reason: 'Statische import-Anweisungen werden im Worker blockiert. Bündle alles in main.js.' },
  { pattern: /\bnew\s+Worker\s*\(/u, reason: 'Verschachtelte Worker sind nicht erlaubt.' },
  { pattern: /\beval\s*\(|new\s+Function\s*\(/u, reason: 'eval()/new Function() sind nicht erlaubt.' },
  { pattern: /\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b/u, reason: 'Direkte Netzwerkzugriffe sind nicht erlaubt; nutze fanotes.net.fetch (Berechtigung "network").' },
]

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex')

const exists = async (target) => stat(target).then(() => true).catch(() => false)

/** Parses main.js as an ES module exactly like the FaNotes worker does (`import(blobUrl)`). */
const syntaxCheck = (source) => {
  const result = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: source, encoding: 'utf8' })
  if (result.status === 0) return null
  const lines = (result.stderr || 'Syntaxfehler').trim().split('\n').filter((line) => line && !line.startsWith('    at ') && !line.startsWith('Node.js'))
  return lines.slice(0, 4).join(' ').replace(/\s+/gu, ' ')
}

export const inspectAddon = async (root, folder) => {
  const dir = path.join(root, ADDONS_DIR, folder)
  const problems = []
  const warnings = []
  const files = {}
  let manifest = null

  const manifestPath = path.join(dir, 'manifest.json')
  if (!(await exists(manifestPath))) problems.push('manifest.json fehlt.')
  else {
    const raw = await readFile(manifestPath, 'utf8')
    try {
      const parsed = parseAddonManifest(JSON.parse(raw), { expectedId: folder })
      problems.push(...parsed.errors)
      warnings.push(...parsed.warnings)
      manifest = parsed.manifest
    } catch (error) {
      problems.push(`manifest.json ist kein gültiges JSON: ${error.message}`)
    }
  }

  const mainPath = path.join(dir, ADDON_MAIN_FILE)
  if (!(await exists(mainPath))) problems.push(`${ADDON_MAIN_FILE} fehlt.`)
  else {
    const source = await readFile(mainPath, 'utf8')
    const bytes = Buffer.byteLength(source, 'utf8')
    if (bytes > ADDON_MAX_MAIN_BYTES) problems.push(`${ADDON_MAIN_FILE} ist ${bytes} Bytes groß (max. ${ADDON_MAX_MAIN_BYTES}).`)
    if (!source.trim()) problems.push(`${ADDON_MAIN_FILE} ist leer.`)
    for (const rule of FORBIDDEN_SOURCE) if (rule.pattern.test(source)) problems.push(rule.reason)
    const syntax = syntaxCheck(source)
    if (syntax) problems.push(`Syntaxfehler in ${ADDON_MAIN_FILE}: ${syntax}`)
    files[ADDON_MAIN_FILE] = { size: bytes, sha256: sha256(source) }
  }

  const readmePath = path.join(dir, 'README.md')
  if (!(await exists(readmePath))) warnings.push('README.md fehlt – der Store zeigt dann nur die Kurzbeschreibung.')
  else {
    const readme = await readFile(readmePath, 'utf8')
    const bytes = Buffer.byteLength(readme, 'utf8')
    if (bytes > ADDON_MAX_README_BYTES) problems.push(`README.md ist größer als ${ADDON_MAX_README_BYTES} Bytes.`)
    files['README.md'] = { size: bytes, sha256: sha256(readme) }
  }

  const iconPath = path.join(dir, ADDON_ICON_FILE)
  if (await exists(iconPath)) {
    const icon = await readFile(iconPath, 'utf8')
    const bytes = Buffer.byteLength(icon, 'utf8')
    if (bytes > ADDON_MAX_ICON_BYTES) problems.push(`${ADDON_ICON_FILE} ist größer als ${ADDON_MAX_ICON_BYTES} Bytes.`)
    if (!/<svg[\s>]/iu.test(icon)) problems.push(`${ADDON_ICON_FILE} ist kein SVG.`)
    if (/<script|on[a-z]+\s*=|javascript:|<foreignObject|<iframe|<embed|<object/iu.test(icon)) problems.push(`${ADDON_ICON_FILE} enthält Skripte oder eingebettete Inhalte.`)
    if (manifest && !manifest.icon) warnings.push(`${ADDON_ICON_FILE} liegt im Ordner, aber "icon": "icon.svg" fehlt im Manifest.`)
    files[ADDON_ICON_FILE] = { size: bytes, sha256: sha256(icon) }
  } else if (manifest?.icon) {
    problems.push(`Das Manifest nennt ${ADDON_ICON_FILE}, aber die Datei fehlt.`)
  }

  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ALLOWED_DIRS.has(entry.name)) warnings.push(`Unerwarteter Ordner "${entry.name}/" – nur ${[...ALLOWED_DIRS].join(', ')} sind üblich.`)
      continue
    }
    if (!ALLOWED_FILES.has(entry.name)) warnings.push(`Unerwartete Datei "${entry.name}" – sie wird nicht ausgeliefert.`)
    if (/\.(exe|dll|so|dylib|wasm|zip|tar|gz|7z|bin)$/iu.test(entry.name)) problems.push(`Binärdatei "${entry.name}" ist nicht erlaubt.`)
  }

  return { id: folder, dir, manifest, files, problems, warnings }
}

export const inspectAll = async (root) => {
  const addonsRoot = path.join(root, ADDONS_DIR)
  const entries = (await readdir(addonsRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory() && !entry.name.startsWith('.')).map((entry) => entry.name).sort()
  const results = []
  for (const folder of entries) results.push(await inspectAddon(root, folder))
  return results
}

/** Compares a candidate index against the previous one so downgrades and silent code changes are caught in CI. */
export const compareWithPrevious = (previousIndex, results) => {
  const problems = []
  const previous = new Map((previousIndex?.addons ?? []).map((entry) => [entry.id, entry]))
  for (const result of results) {
    if (!result.manifest) continue
    const before = previous.get(result.id)
    if (!before) continue
    const cmp = compareAddonVersions(result.manifest.version, before.version)
    if (cmp < 0) problems.push(`${result.id}: Version ${result.manifest.version} ist älter als die veröffentlichte ${before.version}.`)
    const codeChanged = before.files?.['main.js']?.sha256 && result.files['main.js']?.sha256 && before.files['main.js'].sha256 !== result.files['main.js'].sha256
    if (codeChanged && cmp === 0) problems.push(`${result.id}: main.js hat sich geändert, aber die Version ist weiterhin ${before.version}. Bitte "version" erhöhen, sonst erhalten Nutzer das Update nicht.`)
  }
  return problems
}
