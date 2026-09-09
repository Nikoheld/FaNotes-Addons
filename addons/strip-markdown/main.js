/// <reference path="../../sdk/fanotes-addon.d.ts" />

// Markdown entfernen / Strip Markdown – Soft strip common Markdown markup from
// the editor selection; optionally write back and/or copy to clipboard.
// Abgrenzung: find-replace-note=frei; case/line-tools=andere Transforms;
// hier=gezieltes MD-Stripping. Soft: kein vollständiger MD-Parser — best-effort.
// Kein Vault/network/notes. Activate = load settings only.
// Mirror Soft: fence-wrap (selection) / path-copier (clipboard).

const SETTINGS_KEY = 'settings'
const PANEL_ID = 'strip'

/**
 * @typedef {{
 *   writeBack: boolean,
 *   copyAlso: boolean,
 * }} Settings
 */

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  writeBack: true,
  copyAlso: true,
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
 * @param {unknown} raw
 * @returns {Settings}
 */
function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const obj = /** @type {Record<string, unknown>} */ (raw)
  return {
    writeBack: obj.writeBack !== false,
    copyAlso: obj.copyAlso !== false,
  }
}

/**
 * @returns {Settings}
 */
function cloneSettings() {
  return {
    writeBack: settings.writeBack === true,
    copyAlso: settings.copyAlso === true,
  }
}

async function loadSettings() {
  try {
    const stored = await fanotes.storage.get(SETTINGS_KEY)
    settings = normalizeSettings(stored)
  } catch (error) {
    fanotes.log('loadSettings failed', errMessage(error))
    settings = { ...DEFAULT_SETTINGS }
  }
}

/**
 * Persist settings; on failure restore `rollback` when provided.
 * Soft: returns false on failure after toast.
 * @param {Settings} [rollback]
 * @returns {Promise<boolean>}
 */
async function saveSettings(rollback) {
  try {
    await fanotes.storage.set(SETTINGS_KEY, {
      writeBack: settings.writeBack === true,
      copyAlso: settings.copyAlso === true,
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
 * Soft best-effort Markdown strip (order matters). Not a full MD parser.
 * 1. fences ```...``` → inner text Soft (multiline Soft)
 * 2. images ![alt](url) → alt||url
 * 3. links [text](url) → text
 * 4. wikilinks [[t|a]] → a||t; [[t]] → t
 * 5. bold/italic/code markers Soft
 * 6. heading hashes at line start Soft
 * 7. list/task prefixes Soft
 * 8. blockquote > Soft
 * @param {string} text
 * @returns {string}
 */
function stripMarkdown(text) {
  let s = String(text ?? '')

  // 1. Fenced code blocks → keep inner Soft (lang tag discarded)
  s = s.replace(/```[^\n`]*\r?\n?([\s\S]*?)```/g, '$1')

  // 2. Images ![alt](url) → alt if non-empty Soft, else url
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, alt, url) => {
    const a = String(alt ?? '').trim()
    return a || String(url ?? '')
  })

  // 3. Links [text](url) → text
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, '$1')

  // 4. Wikilinks [[t|a]] → a; [[t]] → t
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
  s = s.replace(/\[\[([^\]]+)\]\]/g, '$1')

  // 5. Bold / italic / strike / inline code Soft (paired markers, longer first)
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1')
  s = s.replace(/__([^_]+)__/g, '$1')
  s = s.replace(/~~([^~]+)~~/g, '$1')
  s = s.replace(/`([^`]+)`/g, '$1')
  s = s.replace(/\*([^*\n]+)\*/g, '$1')
  s = s.replace(/_([^_\n]+)_/g, '$1')

  // Soft leftover lone markers Soft (best-effort)
  s = s.replace(/\*\*/g, '')
  s = s.replace(/__/g, '')
  s = s.replace(/~~/g, '')

  // 6. Heading hashes at line start Soft
  s = s.replace(/^#{1,6}\s+/gm, '')

  // 7. List / task prefixes Soft
  s = s.replace(/^(\s*)[-*+]\s+\[[ xX]\]\s+/gm, '$1')
  s = s.replace(/^(\s*)[-*+]\s+/gm, '$1')
  s = s.replace(/^(\s*)\d+\.\s+/gm, '$1')

  // 8. Blockquote > Soft
  s = s.replace(/^(\s*)>\s?/gm, '$1')

  return s
}

/**
 * Core strip flow Soft.
 * Soft opts can override writeBack / copyAlso for strip-copy.
 * @param {{ writeBack?: boolean, copyAlso?: boolean }} [opts]
 */
async function runStrip(opts) {
  const writeBack = opts && opts.writeBack !== undefined ? opts.writeBack === true : settings.writeBack === true
  const copyAlso = opts && opts.copyAlso !== undefined ? opts.copyAlso === true : settings.copyAlso === true

  try {
    if (!writeBack && !copyAlso) {
      await fanotes.ui.toast(
        t(
          'Nichts zu tun: weder Zurückschreiben noch Kopieren aktiv.',
          'Nothing to do: neither write-back nor copy is enabled.',
        ),
        'info',
      )
      return false
    }

    /** @type {FaNotes.Selection | null} */
    let sel = null
    try {
      sel = await fanotes.editor.getSelection()
    } catch (error) {
      await fanotes.ui.toast(
        t(
          `Auswahl nicht lesbar: ${errMessage(error)}`,
          `Could not read selection: ${errMessage(error)}`,
        ),
        'error',
      )
      return false
    }

    const selRaw = sel && typeof sel.text === 'string' ? sel.text : ''
    if (!sel || sel.from === sel.to || !selRaw) {
      await fanotes.ui.toast(
        t('Bitte Text markieren', 'Please select text'),
        'info',
      )
      return false
    }

    const result = stripMarkdown(selRaw)

    if (copyAlso) {
      try {
        const ok = await fanotes.clipboard.writeText(result)
        if (ok === false) {
          await fanotes.ui.toast(
            t('Kopieren fehlgeschlagen.', 'Copy failed.'),
            'error',
          )
          return false
        }
      } catch (error) {
        await fanotes.ui.toast(
          t(`Kopieren fehlgeschlagen: ${errMessage(error)}`, `Copy failed: ${errMessage(error)}`),
          'error',
        )
        return false
      }
    }

    if (writeBack) {
      try {
        const ok = await fanotes.editor.replaceSelection(result)
        if (!ok) {
          await fanotes.ui.toast(
            t('Kein Markdown-Editor geöffnet.', 'No Markdown editor is open.'),
            'error',
          )
          return false
        }
      } catch (error) {
        await fanotes.ui.toast(
          t(`Ersetzen fehlgeschlagen: ${errMessage(error)}`, `Replace failed: ${errMessage(error)}`),
          'error',
        )
        return false
      }
    }

    let de = 'Markdown entfernt.'
    let en = 'Markdown stripped.'
    if (writeBack && copyAlso) {
      de = 'Markdown entfernt und in die Zwischenablage kopiert.'
      en = 'Markdown stripped and copied to the clipboard.'
    } else if (copyAlso) {
      de = 'Bereinigter Text in die Zwischenablage kopiert.'
      en = 'Stripped text copied to the clipboard.'
    } else if (writeBack) {
      de = 'Auswahl bereinigt (Markdown entfernt).'
      en = 'Selection cleaned (Markdown stripped).'
    }
    await fanotes.ui.toast(t(de, en), 'success')

    await refreshPanel()
    return true
  } catch (error) {
    await fanotes.ui.toast(
      t(`Bereinigen fehlgeschlagen: ${errMessage(error)}`, `Strip failed: ${errMessage(error)}`),
      'error',
    )
    return false
  }
}

/**
 * Apply panel values into settings Soft.
 * @param {Record<string, unknown>} values
 */
async function applyPanelValues(values) {
  if (!values || typeof values !== 'object') return true
  const prev = cloneSettings()

  if (values.writeBack !== undefined) {
    settings.writeBack = values.writeBack === true || values.writeBack === 'true'
  }
  if (values.copyAlso !== undefined) {
    settings.copyAlso = values.copyAlso === true || values.copyAlso === 'true'
  }

  const ok = await saveSettings(prev)
  if (!ok) {
    settings = prev
    return false
  }
  return true
}

function renderBlocks() {
  /** @type {FaNotes.Block[]} */
  return [
    { type: 'heading', text: t('Markdown entfernen', 'Strip Markdown'), level: 2 },
    {
      type: 'text',
      muted: true,
      text: t(
        'Entfernt gängige Markdown-Markierung aus der Auswahl (best-effort Soft). Optional zurückschreiben und/oder kopieren.',
        'Strips common Markdown markup from the selection (best-effort Soft). Optionally write back and/or copy.',
      ),
    },
    {
      type: 'checkbox',
      id: 'writeBack',
      label: t('Auswahl ersetzen (zurückschreiben)', 'Replace selection (write back)'),
      checked: settings.writeBack === true,
    },
    {
      type: 'checkbox',
      id: 'copyAlso',
      label: t('Auch in Zwischenablage kopieren', 'Also copy to clipboard'),
      checked: settings.copyAlso === true,
    },
    {
      type: 'callout',
      tone: 'info',
      text: t(
        'Best-effort Soft — kein vollständiger Markdown-Parser. Abgrenzung: find-replace-note = freies Suchen/Ersetzen; case-tools / line-tools = andere Transforms; hier = gezieltes MD-Stripping.',
        'Best-effort Soft — not a full Markdown parser. Distinction: find-replace-note = free find/replace; case-tools / line-tools = other transforms; this = targeted MD stripping.',
      ),
    },
    {
      type: 'row',
      children: [
        {
          type: 'button',
          id: 'strip',
          label: t('Bereinigen', 'Strip'),
          primary: true,
        },
      ],
    },
  ]
}

async function refreshPanel() {
  if (!panel) return
  try {
    await panel.update(renderBlocks())
    await panel.setTitle(t('Markdown entfernen', 'Strip Markdown'))
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
      title: t('Markdown entfernen', 'Strip Markdown'),
      icon: '🧹',
      blocks: renderBlocks(),
      focus: true,
    })

    panel.onAction(async (action) => {
      try {
        const values = action.values || {}
        if (action.id === 'strip') {
          const ok = await applyPanelValues(values)
          if (!ok) {
            await refreshPanel()
            return
          }
          await runStrip()
          return
        }
      } catch (error) {
        await fanotes.ui.toast(
          t(`Aktion fehlgeschlagen: ${errMessage(error)}`, `Action failed: ${errMessage(error)}`),
          'error',
        )
      }
    })

    panel.onInput(async (input) => {
      try {
        if (input.id === 'writeBack') {
          const prev = cloneSettings()
          settings.writeBack = input.value === true
          const ok = await saveSettings(prev)
          if (!ok) {
            await refreshPanel()
            return
          }
          await refreshPanel()
          return
        }
        if (input.id === 'copyAlso') {
          const prev = cloneSettings()
          settings.copyAlso = input.value === true
          const ok = await saveSettings(prev)
          if (!ok) {
            await refreshPanel()
            return
          }
          await refreshPanel()
        }
      } catch (error) {
        fanotes.log('onInput failed', errMessage(error))
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
  id: 'strip',
  title: t('Markdown aus Auswahl entfernen', 'Strip Markdown from selection'),
  detail: t(
    'Markdown Soft entfernen; nach Einstellungen zurückschreiben und/oder kopieren',
    'Soft-strip Markdown; write back and/or copy per settings',
  ),
  keywords: 'strip markdown plain text entfernen clean clipboard bereinigen',
  run: async () => {
    try {
      await runStrip()
    } catch (error) {
      await fanotes.ui.toast(
        t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`),
        'error',
      )
    }
  },
})

fanotes.commands.register({
  id: 'strip-copy',
  title: t('Markdown entfernen und kopieren', 'Strip Markdown and copy'),
  detail: t(
    'Bereinigten Text nur in die Zwischenablage (kein Zurückschreiben)',
    'Copy stripped text to the clipboard only (no write-back)',
  ),
  keywords: 'strip copy clipboard markdown plain text kopieren entfernen',
  run: async () => {
    try {
      await runStrip({ writeBack: false, copyAlso: true })
    } catch (error) {
      await fanotes.ui.toast(
        t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`),
        'error',
      )
    }
  },
})

fanotes.commands.register({
  id: 'open',
  title: t('Markdown entfernen öffnen', 'Open Strip Markdown'),
  detail: t(
    'Panel mit writeBack und copyAlso',
    'Panel with writeBack and copyAlso',
  ),
  keywords: 'panel open öffnen strip markdown settings bereinigen',
  run: () => {
    try {
      openPanel()
    } catch (error) {
      void fanotes.ui.toast(
        t(`Fehler: ${errMessage(error)}`, `Error: ${errMessage(error)}`),
        'error',
      )
    }
  },
})

// --- Lifecycle --------------------------------------------------------------

fanotes.onActivate(async () => {
  try {
    await loadSettings()
    fanotes.log(
      'strip-markdown activated',
      fanotes.app.appVersion,
      fanotes.app.language,
      settings.writeBack,
      settings.copyAlso,
    )
  } catch (error) {
    fanotes.log('onActivate failed', errMessage(error))
  }
})

fanotes.onDeactivate(() => {
  panel = null
})
