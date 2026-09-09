/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Überschrift-Stufe / Heading Shift – promote/demote ATX heading level in selection.
// Abgrenzung: heading-outline=Gliederung/TOC; note-splitter=Split; hier=#+ Shift in Selection.
// Soft: no vault/network/notes. Activate = load settings only.
// Soft onlyHeadingLines fixed true (non-heading lines unchanged; not exposed in panel Soft).

const STORAGE_KEY = 'settings'
const PANEL_ID = 'shift'

/** Soft ATX heading: 1–6 hashes, whitespace, rest. */
const HEADING_RE = /^(#{1,6})(\s+)(.*)$/

/**
 * @typedef {{
 *   clampMin: number,
 *   clampMax: number,
 *   onlyHeadingLines: boolean,
 * }} Settings
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  clampMin: 1,
  clampMax: 6,
  onlyHeadingLines: true,
}

/** @type {Settings} */
let settings = { ...DEFAULT_SETTINGS }

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

/**
 * Soft clamp integer into [lo, hi].
 * @param {unknown} raw
 * @param {number} fallback
 * @param {number} lo
 * @param {number} hi
 */
function clampInt(raw, fallback, lo, hi) {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.max(lo, Math.min(hi, Math.round(n)))
}

/**
 * @param {unknown} raw
 * @returns {Settings}
 */
function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const obj = /** @type {Record<string, unknown>} */ (raw)
  let clampMin = clampInt(obj.clampMin, 1, 1, 6)
  let clampMax = clampInt(obj.clampMax, 6, 1, 6)
  if (clampMin > clampMax) {
    const tmp = clampMin
    clampMin = clampMax
    clampMax = tmp
  }
  // Soft onlyHeadingLines fixed true Soft (v1; ignore stored false Soft).
  return {
    clampMin,
    clampMax,
    onlyHeadingLines: true,
  }
}

async function loadSettings() {
  try {
    const raw = await fanotes.storage.get(STORAGE_KEY)
    settings = normalizeSettings(raw)
  } catch (error) {
    fanotes.log('loadSettings failed', errMessage(error))
    settings = { ...DEFAULT_SETTINGS }
  }
}

/**
 * Persist settings Soft; on failure restore `rollback` when provided.
 * @param {Settings} [rollback]
 * @returns {Promise<boolean>}
 */
async function persistSettings(rollback) {
  try {
    await fanotes.storage.set(STORAGE_KEY, {
      clampMin: settings.clampMin,
      clampMax: settings.clampMax,
      onlyHeadingLines: true,
    })
    return true
  } catch (error) {
    if (rollback) settings = { ...rollback }
    await fanotes.ui.toast(
      t(`Speichern fehlgeschlagen: ${errMessage(error)}`, `Save failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

/**
 * Soft: promote = fewer # (delta −1); demote = more # (delta +1).
 * Clamps level to clampMin..clampMax. Non-match Soft unchanged.
 * @param {string} line
 * @param {number} delta
 * @returns {{ line: string, isHeading: boolean }}
 */
function shiftLine(line, delta) {
  const m = HEADING_RE.exec(line)
  if (!m) return { line, isHeading: false }
  const current = m[1].length
  const next = Math.max(settings.clampMin, Math.min(settings.clampMax, current + delta))
  return {
    line: '#'.repeat(next) + m[2] + m[3],
    isHeading: true,
  }
}

/**
 * Soft shift all lines; onlyHeadingLines Soft always true → non-heading unchanged.
 * @param {string[]} lines
 * @param {number} delta
 * @returns {{ lines: string[], headingCount: number }}
 */
function shiftLines(lines, delta) {
  let headingCount = 0
  /** @type {string[]} */
  const out = []
  for (const line of lines) {
    const { line: next, isHeading } = shiftLine(line, delta)
    if (isHeading) headingCount += 1
    out.push(next)
  }
  return { lines: out, headingCount }
}

/**
 * Soft: getSelection; empty/whitespace → toast info; read error Soft toast error.
 * @returns {Promise<string[] | null>}
 */
async function getTargetLines() {
  try {
    const sel = await fanotes.editor.getSelection()
    if (!sel || typeof sel.text !== 'string' || !sel.text.trim()) {
      await fanotes.ui.toast(
        t('Bitte Zeilen markieren', 'Please select lines'),
        'info',
      )
      return null
    }
    return sel.text.split('\n')
  } catch (error) {
    await fanotes.ui.toast(
      t(`Auswahl lesen fehlgeschlagen: ${errMessage(error)}`, `Could not read selection: ${errMessage(error)}`),
      'error',
    )
    return null
  }
}

/**
 * Soft: replaceSelection joined; toast when no heading lines Soft / no editor Soft.
 * @param {'promote' | 'demote'} mode
 */
async function runShift(mode) {
  const lines = await getTargetLines()
  if (!lines) return

  const delta = mode === 'promote' ? -1 : 1
  const { lines: next, headingCount } = shiftLines(lines, delta)

  if (headingCount === 0) {
    await fanotes.ui.toast(
      t(
        'Keine Überschrift-Zeile in der Auswahl',
        'No heading line in the selection',
      ),
      'info',
    )
    return
  }

  try {
    const ok = await fanotes.editor.replaceSelection(next.join('\n'))
    if (!ok) {
      await fanotes.ui.toast(
        t('Kein Markdown-Editor geöffnet.', 'No Markdown editor is open.'),
        'error',
      )
      return
    }
  } catch (error) {
    await fanotes.ui.toast(
      t(`Ersetzen fehlgeschlagen: ${errMessage(error)}`, `Replace failed: ${errMessage(error)}`),
      'error',
    )
    return
  }

  if (mode === 'promote') {
    await fanotes.ui.toast(
      t(
        headingCount === 1
          ? '1 Überschrift hochgestuft'
          : `${headingCount} Überschriften hochgestuft`,
        headingCount === 1
          ? 'Promoted 1 heading'
          : `Promoted ${headingCount} headings`,
      ),
      'success',
    )
  } else {
    await fanotes.ui.toast(
      t(
        headingCount === 1
          ? '1 Überschrift herabgestuft'
          : `${headingCount} Überschriften herabgestuft`,
        headingCount === 1
          ? 'Demoted 1 heading'
          : `Demoted ${headingCount} headings`,
      ),
      'success',
    )
  }
}

function renderBlocks() {
  /** @type {FaNotes.Block[]} */
  return [
    { type: 'heading', text: t('Überschrift-Stufe', 'Heading Shift'), level: 2 },
    {
      type: 'text',
      muted: true,
      text: t(
        'Hochstufen = weniger # (z. B. H2→H1). Herabstufen = mehr # (z. B. H2→H3). Nur ATX-Zeilen (#{1–6}); andere Zeilen Soft unverändert. Stufe Soft zwischen clampMin und clampMax geklemmt.',
        'Promote = fewer # (e.g. H2→H1). Demote = more # (e.g. H2→H3). Only ATX lines (#{1–6}); other lines Soft unchanged. Level Soft clamped between clampMin and clampMax.',
      ),
    },
    { type: 'divider' },
    {
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'promote',
          label: t('Hochstufen', 'Promote'),
          primary: true,
        },
        {
          type: 'button',
          id: 'demote',
          label: t('Herabstufen', 'Demote'),
        },
      ],
    },
    {
      type: 'callout',
      tone: 'info',
      text: t(
        '#+ Shift in der Selection – nicht Gliederung/TOC (→ heading-outline), nicht Split (→ note-splitter). Soft onlyHeadingLines fest true. Kein Vault.',
        '#+ shift in the selection — not outline/TOC (→ heading-outline), not split (→ note-splitter). Soft onlyHeadingLines fixed true. No vault.',
      ),
    },
  ]
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Überschrift-Stufe', 'Heading Shift'))
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
      title: t('Überschrift-Stufe', 'Heading Shift'),
      icon: '↕',
      blocks: renderBlocks(),
    })

    panel.onAction(async (action) => {
      try {
        if (action.id === 'promote') {
          await runShift('promote')
          return
        }
        if (action.id === 'demote') {
          await runShift('demote')
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
  id: 'open',
  title: t('Überschrift-Stufe öffnen', 'Open Heading Shift'),
  detail: t(
    'Panel: Überschriften hoch- oder herabstufen',
    'Panel: promote or demote headings',
  ),
  keywords: 'heading überschrift promote demote shift stufe panel öffnen open',
  run: () => {
    try {
      openPanel()
    } catch (error) {
      void fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'promote',
  title: t('Überschrift hochstufen', 'Promote heading'),
  detail: t(
    'Weniger #: markierte ATX-Zeilen eine Stufe hoch (z. B. H2→H1)',
    'Fewer #: raise selected ATX lines one level (e.g. H2→H1)',
  ),
  keywords: 'promote hochstufen heading überschrift h1 h2',
  run: async () => {
    try {
      await runShift('promote')
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.commands.register({
  id: 'demote',
  title: t('Überschrift herabstufen', 'Demote heading'),
  detail: t(
    'Mehr #: markierte ATX-Zeilen eine Stufe runter (z. B. H2→H3)',
    'More #: lower selected ATX lines one level (e.g. H2→H3)',
  ),
  keywords: 'demote herabstufen heading überschrift h2 h3',
  run: async () => {
    try {
      await runShift('demote')
    } catch (error) {
      await fanotes.ui.toast(t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`), 'error')
    }
  },
})

fanotes.onActivate(async () => {
  try {
    await loadSettings()
    // Soft: ensure defaults Soft persisted once if empty Soft optional — load only Soft.
    fanotes.log('heading-shift activated', fanotes.app.appVersion, settings)
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(() => {
  panel = null
})
