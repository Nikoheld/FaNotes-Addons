// Manifest rules for FaNotes add-ons.
//
// This is the registry-side twin of fanotes/src/lib/addons/manifest.ts in the
// FaNotes repository. Both must accept and reject the same manifests; the
// FaNotes check suite (scripts/check-addons.mjs) runs shared fixtures against
// both copies, so change them together.

export const ADDON_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u
export const ADDON_VERSION_PATTERN = /^\d{1,6}(?:\.\d{1,6}){0,2}(?:-[0-9A-Za-z.-]{1,32})?$/u
export const ADDON_API_VERSION = 1
export const ADDON_MAIN_FILE = 'main.js'
export const ADDON_ICON_FILE = 'icon.svg'
export const ADDON_MAX_MAIN_BYTES = 1_500_000
export const ADDON_MAX_README_BYTES = 200_000
export const ADDON_MAX_ICON_BYTES = 64_000

export const ADDON_PERMISSIONS = [
  'notes:read', 'notes:write', 'vault:write', 'editor', 'ink:read', 'stats:read', 'settings:read',
  'clipboard', 'network', 'ui', 'commands', 'storage',
]

export const ADDON_CATEGORIES = [
  'productivity', 'writing', 'handwriting', 'school', 'statistics', 'export', 'integration', 'appearance', 'fun', 'developer',
]

const HOST_PATTERN = /^(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/iu

const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)
const asString = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '')
const asStringList = (value, max, itemMax) => {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim().slice(0, itemMax)
    if (trimmed) seen.add(trimmed)
    if (seen.size >= max) break
  }
  return [...seen]
}

/**
 * Validates a manifest object. Returns { manifest, errors, warnings } and
 * never throws. Error texts are German because they are shown inside FaNotes.
 */
export const parseAddonManifest = (raw, options = {}) => {
  const errors = []
  const warnings = []
  const source = isRecord(raw) ? raw : {}
  if (!isRecord(raw)) errors.push('manifest.json muss ein JSON-Objekt sein.')

  const id = asString(source.id, 64)
  if (!id) errors.push('Feld "id" fehlt.')
  else if (!ADDON_ID_PATTERN.test(id)) errors.push(`"id" (${id}) darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten (2-64 Zeichen).`)
  if (options.expectedId && id && id !== options.expectedId) errors.push(`"id" (${id}) muss dem Ordnernamen (${options.expectedId}) entsprechen.`)

  const name = asString(source.name, 60)
  if (!name) errors.push('Feld "name" fehlt.')

  const version = asString(source.version, 48)
  if (!version) errors.push('Feld "version" fehlt.')
  else if (!ADDON_VERSION_PATTERN.test(version)) errors.push(`"version" (${version}) muss wie 1.0.0 aufgebaut sein.`)

  const description = asString(source.description, 280)
  if (!description) errors.push('Feld "description" fehlt (max. 280 Zeichen).')

  let author = { name: '' }
  if (typeof source.author === 'string') author = { name: asString(source.author, 80) }
  else if (isRecord(source.author)) {
    author = { name: asString(source.author.name, 80) }
    const url = asString(source.author.url, 300)
    if (url) {
      if (/^https:\/\//iu.test(url)) author.url = url
      else warnings.push('"author.url" muss mit https:// beginnen und wurde ignoriert.')
    }
  }
  if (!author.name) errors.push('Feld "author" (Name) fehlt.')

  const api = typeof source.api === 'number' && Number.isInteger(source.api) ? source.api : ADDON_API_VERSION
  if (api !== ADDON_API_VERSION) errors.push(`"api" ${api} wird nicht unterstützt (diese FaNotes-Version spricht API ${ADDON_API_VERSION}).`)

  const permissions = []
  for (const item of asStringList(source.permissions, 32, 40)) {
    if (ADDON_PERMISSIONS.includes(item)) permissions.push(item)
    else errors.push(`Unbekannte Berechtigung "${item}".`)
  }

  const networkHosts = asStringList(source.networkHosts, 16, 253)
  for (const host of networkHosts) {
    if (!HOST_PATTERN.test(host)) errors.push(`"networkHosts" enthält einen ungültigen Host: ${host}`)
  }
  if (networkHosts.length && !permissions.includes('network')) warnings.push('"networkHosts" ist gesetzt, aber die Berechtigung "network" fehlt.')
  if (permissions.includes('network') && !networkHosts.length) errors.push('Die Berechtigung "network" braucht mindestens einen Eintrag in "networkHosts".')

  const categories = []
  for (const item of asStringList(source.categories, 4, 40)) {
    if (ADDON_CATEGORIES.includes(item)) categories.push(item)
    else warnings.push(`Unbekannte Kategorie "${item}" wurde ignoriert.`)
  }

  const keywords = asStringList(source.keywords, 12, 32)
  const license = asString(source.license, 48) || undefined
  const homepage = asString(source.homepage, 300) || undefined
  if (homepage && !/^https:\/\//iu.test(homepage)) errors.push('"homepage" muss mit https:// beginnen.')
  const minAppVersion = asString(source.minAppVersion, 32) || undefined
  if (minAppVersion && !/^\d{4}\.\d{1,2}\.\d{1,4}$/u.test(minAppVersion)) warnings.push('"minAppVersion" sollte dem Kalender-Schema JJJJ.M.N folgen.')
  const main = asString(source.main, 64)
  if (main && main !== ADDON_MAIN_FILE) errors.push(`"main" muss ${ADDON_MAIN_FILE} sein; andere Einstiegsdateien werden nicht geladen.`)
  const icon = asString(source.icon, 64) || undefined
  if (icon && icon !== ADDON_ICON_FILE) errors.push(`"icon" muss ${ADDON_ICON_FILE} sein.`)

  return {
    manifest: { id, name, version, description, author, license, homepage, api, minAppVersion, permissions, networkHosts, categories, keywords, icon },
    errors,
    warnings,
  }
}

const versionParts = (value) => value.split('-')[0].split('.').map((part) => Number.parseInt(part, 10) || 0)

export const compareAddonVersions = (left, right) => {
  const a = versionParts(left)
  const b = versionParts(right)
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0)
    if (diff !== 0) return diff < 0 ? -1 : 1
  }
  const aPre = left.includes('-')
  const bPre = right.includes('-')
  if (aPre !== bPre) return aPre ? -1 : 1
  return 0
}
