// Type declarations for the FaNotes add-on API (API version 1).
//
// Add `/// <reference path="../../sdk/fanotes-addon.d.ts" />` to the top of
// your main.js (or a tsconfig/jsconfig `include`) and your editor completes
// every call. The runtime object is the global `fanotes`; there is nothing to
// import. Full prose documentation: docs/API.md.

declare namespace FaNotes {
  type Permission =
    | 'notes:read' | 'notes:write' | 'vault:write' | 'editor' | 'ink:read' | 'stats:read'
    | 'settings:read' | 'clipboard' | 'network' | 'ui' | 'commands' | 'storage'

  type ToastKind = 'info' | 'success' | 'error'

  interface AppInfo {
    /** FaNotes version, calendar scheme `YYYY.M.N`. */
    appVersion: string
    /** `linux`, `win32`, `darwin` or `web`. */
    platform: string
    /** UI language, `de` or `en`. */
    language: string
    apiVersion: number
    /** True in the browser build (no `network` permission there). */
    web: boolean
    addon: { id: string; name: string; version: string; permissions: Permission[] }
  }

  interface NoteSummary {
    /** Vault-relative path, e.g. `Mathe/Ableitungen.md`. */
    path: string
    /** File name without extension. */
    title: string
    /** Parent folder path, `''` at the vault root. */
    folder: string
    modifiedAt: string | null
    size: number | null
  }

  interface ActiveNote {
    path: string
    title: string
    /** `markdown`, `ink` (pen mode), `pdf` or `none`. */
    kind: string
  }

  interface TreeEntry {
    name: string
    path: string
    kind: 'file' | 'folder'
    extension?: string
    modifiedAt: string | null
    size: number | null
    children?: TreeEntry[]
  }

  interface SearchHit {
    path: string
    title: string
    excerpt: string
    matches: number
    kind: 'note' | 'drawing'
  }

  interface Selection {
    from: number
    to: number
    text: string
    /** 1-based line of the selection start. */
    line: number
  }

  type FormatAction =
    | 'heading1' | 'heading2' | 'heading3' | 'bold' | 'italic' | 'strikethrough' | 'code' | 'codeBlock'
    | 'quote' | 'bulletList' | 'numberedList' | 'taskList' | 'link' | 'table' | 'horizontalRule' | 'math'

  interface Disposable { dispose(): void }

  interface CommandSpec {
    /** Unique within your add-on; letters, digits, `.`, `:`, `-`, `_`. */
    id: string
    /** Shown in the command palette. */
    title: string
    detail?: string
    /** Extra search words for the palette. */
    keywords?: string
    /** Display only, e.g. `Ctrl ⇧ P`. FaNotes does not bind keys for add-ons. */
    shortcut?: string
    run: (...args: unknown[]) => unknown | Promise<unknown>
  }

  // ---- UI blocks ---------------------------------------------------------

  type Block =
    | { type: 'heading'; text: string; level?: 1 | 2 | 3 }
    | { type: 'text'; text: string; muted?: boolean }
    /** Markdown rendered by FaNotes (no raw HTML, no scripts). */
    | { type: 'markdown'; text: string }
    | { type: 'callout'; tone?: 'info' | 'success' | 'warning' | 'error'; text: string }
    /** Click → `onAction({ id })`. */
    | { type: 'button'; id: string; label: string; primary?: boolean; danger?: boolean; disabled?: boolean }
    /** Commit (blur/Enter) → `onInput({ id, value })`; Enter also fires action `submit:<id>`. */
    | { type: 'input'; id: string; label?: string; value?: string; placeholder?: string; multiline?: boolean; rows?: number }
    | { type: 'select'; id: string; label?: string; value?: string; options: Array<string | { value: string; label?: string }> }
    | { type: 'checkbox'; id: string; label: string; checked?: boolean }
    /** Row click → `onAction({ id: <list id>, itemId })`. */
    | { type: 'list'; id?: string; items: Array<{ id?: string; title: string; detail?: string; badge?: string }>; empty?: string }
    | { type: 'keyvalue'; items: Array<{ key: string; value: string | number }> }
    | { type: 'progress'; value: number; label?: string }
    | { type: 'divider' }
    /** Children laid out horizontally (wraps). Max nesting depth 4. */
    | { type: 'row'; children: Block[] }

  interface PanelAction {
    /** Button id, or the list id for row clicks, or `submit:<inputId>`. */
    id: string
    itemId?: string
    /** Latest values of all inputs/selects/checkboxes in the panel. */
    values: Record<string, unknown>
  }

  interface PanelInput {
    id: string
    value: unknown
    values: Record<string, unknown>
  }

  interface PanelSpec {
    /** Stable id within your add-on (default `main`). Max 6 panels per add-on. */
    id?: string
    title: string
    /** One emoji or short glyph shown in the tab. */
    icon?: string
    blocks: Block[]
    /** Focus the panel when shown (default true). */
    focus?: boolean
    onAction?: (action: PanelAction) => unknown | Promise<unknown>
    onInput?: (input: PanelInput) => unknown | Promise<unknown>
  }

  interface Panel {
    readonly id: string
    /** Replace all blocks. */
    update(blocks: Block[]): Promise<boolean>
    setTitle(title: string): Promise<boolean>
    /** Re-open/focus the panel if the user closed it. */
    show(): Promise<boolean>
    close(): Promise<boolean>
    onAction(handler: (action: PanelAction) => unknown | Promise<unknown>): Panel
    onInput(handler: (input: PanelInput) => unknown | Promise<unknown>): Panel
    /** Last known input values. */
    values(): Record<string, unknown>
  }

  interface StatusItem {
    /** Stable id within your add-on (default `status`). Max 3 items per add-on. */
    id?: string
    /** Up to 60 characters; empty text hides the item. */
    text: string
    title?: string
    onClick?: () => unknown | Promise<unknown>
  }

  // ---- Events --------------------------------------------------------------

  interface EventPayloads {
    /** Active note changed. */
    'note:opened': { path: string; title: string; kind: 'markdown' | 'pdf' }
    /** Typed text changed (debounced ~400 ms). Needs `notes:read`. */
    'note:changed': { path: string; length: number }
    /** A note was written to disk. Needs `notes:read`. */
    'note:saved': { path: string; title: string; length: number }
    'note:created': { path: string }
    'note:deleted': { path: string }
    /** A pen stroke finished. Needs `ink:read`. */
    'ink:stroke': { path: string; durationMs: number; lengthMm: number; points: number; purpose: 'handwriting' | 'art'; color?: string; brush?: string }
    /** Keyboard ↔ pen mode. */
    'mode:changed': { mode: 'keyboard' | 'ink'; path: string | null }
    /** Files or folders changed. */
    'vault:changed': { notes: number }
    /** Display settings changed. Needs `settings:read`. */
    'settings:changed': Record<string, unknown>
  }

  type EventName = keyof EventPayloads

  // ---- Network -------------------------------------------------------------

  interface FetchInit {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD'
    headers?: Record<string, string>
    /** Text body only. */
    body?: string
  }

  interface FetchResponse {
    ok: boolean
    status: number
    statusText: string
    headers: Record<string, string>
    url: string
    text(): Promise<string>
    json(): Promise<unknown>
  }

  // ---- Errors --------------------------------------------------------------

  /**
   * Thrown (as a rejected promise) when the host refuses a call. Common codes:
   * E_PERMISSION, E_ARGS, E_UNKNOWN_METHOD, E_TIMEOUT, E_RATE, E_LIMIT,
   * E_TOO_LARGE, E_NETWORK, E_NO_PANEL, E_NO_COMMAND, E_HOST.
   */
  class FaNotesError extends Error {
    code: string
    constructor(code: string, message: string)
  }

  interface Api {
    /** App and add-on facts, cheap to read. */
    readonly app: AppInfo
    /** Runs once after main.js was evaluated (or immediately if already active). Alternative: `export function activate(fanotes) {}`. */
    onActivate(hook: (api: Api) => unknown | Promise<unknown>): void
    /** Runs when the add-on is disabled, updated or FaNotes closes. Timers keep running until the worker is terminated right after. */
    onDeactivate(hook: (api: Api) => unknown | Promise<unknown>): void
    hasPermission(permission: Permission): boolean
    /** Writes to the add-on log shown in the store (Installiert → Protokoll). console.* is mirrored there too. */
    log(...args: unknown[]): void

    notes: {
      /** All notes (.md, .pdf) in the vault. Permission `notes:read`. */
      list(): Promise<NoteSummary[]>
      /** Folder tree. Permission `notes:read`. */
      tree(): Promise<TreeEntry[]>
      /** Markdown text without the .famd payload. Unsaved edits of open notes are included. Permission `notes:read`. */
      read(path: string): Promise<string>
      exists(path: string): Promise<boolean>
      /** Full-text search like Ctrl+Shift+F. Permission `notes:read`. */
      search(query: string): Promise<SearchHit[]>
      /** The note in front of the user, or null. Permission `notes:read`. */
      active(): Promise<ActiveNote | null>
      /** Replaces the text of a .md note (open notes update live and autosave). Permission `notes:write`. */
      write(path: string, content: string): Promise<boolean>
      /** Appends text (adds a newline first when needed). Permission `notes:write`. */
      append(path: string, content: string): Promise<boolean>
      /** Creates a note and returns its path. Permission `notes:write`. */
      create(options?: { folder?: string; name?: string; content?: string }): Promise<string>
      /** Opens the note in the editor. Permission `ui`. */
      open(path: string): Promise<boolean>
    }

    vault: {
      /** Permission `vault:write`. Returns the new folder path. */
      createFolder(parent?: string, name?: string): Promise<string>
      rename(path: string, newName: string): Promise<string>
      move(path: string, folder?: string): Promise<string>
      /** Moves to the FaNotes trash (recoverable). */
      trash(path: string): Promise<boolean>
    }

    /** Live access to the open Markdown editor. All need permission `editor`; they return false when no editor is open (pen mode, PDF). */
    editor: {
      getText(): Promise<string | null>
      getSelection(): Promise<Selection | null>
      insert(text: string, where?: 'cursor' | 'start' | 'end' | 'line-end'): Promise<boolean>
      replaceSelection(text: string): Promise<boolean>
      setText(text: string): Promise<boolean>
      format(action: FormatAction): Promise<boolean>
    }

    ink: {
      /** Parsed ink document of a note (pages → strokes with normalised 0–1 points), or null. Permission `ink:read`. */
      read(path: string): Promise<unknown | null>
    }

    stats: {
      /** Page statistics FaNotes keeps in the .famd payload (dwell time, typing, ink, document counts). Permission `stats:read`. */
      read(path: string): Promise<unknown>
    }

    settings: {
      /** Display preferences only (theme, fonts, sizes, language …). Never keys or passwords. Permission `settings:read`. */
      read(): Promise<Record<string, unknown>>
    }

    clipboard: {
      /** Permission `clipboard`. */
      writeText(text: string): Promise<boolean>
    }

    /** https only, hosts must be listed in manifest `networkHosts`. Permission `network`. Not available in the web build. */
    net: {
      fetch(url: string, init?: FetchInit): Promise<FetchResponse>
    }

    ui: {
      /** Short message at the bottom; prefixed with your add-on name. Permission `ui`. */
      toast(message: string, kind?: ToastKind): Promise<boolean>
      confirm(message: string, options?: { title?: string; confirmLabel?: string }): Promise<boolean>
      /** Text input dialog; resolves null when cancelled. */
      prompt(message: string, options?: { title?: string; placeholder?: string; value?: string; multiline?: boolean }): Promise<string | null>
      /** Opens a https link after the user confirmed. */
      openExternal(url: string): Promise<boolean>
      /** Opens (or re-shows) a panel in the add-on dock. */
      panel(spec: PanelSpec): Panel
      status: {
        set(item: StatusItem): Promise<boolean>
        remove(id: string): Promise<boolean>
      }
    }

    commands: {
      /** Adds a palette entry. Permission `commands`. Max 40 per add-on. */
      register(spec: CommandSpec): Disposable
      /** Runs one of your commands or a FaNotes command such as `new-note`, `save`, `search`, `drawing`, `split`, `settings`. */
      execute(id: string, ...args: unknown[]): Promise<boolean>
      list(): Promise<Array<{ id: string; label: string; group: string }>>
    }

    events: {
      on<K extends EventName>(name: K, handler: (payload: EventPayloads[K]) => unknown | Promise<unknown>): Disposable
      once<K extends EventName>(name: K, handler: (payload: EventPayloads[K]) => unknown | Promise<unknown>): Disposable
    }

    /** Private JSON key/value store per add-on (1 MB, 500 keys). Permission `storage`. */
    storage: {
      get(key: string): Promise<unknown | null>
      set(key: string, value: unknown): Promise<boolean>
      remove(key: string): Promise<boolean>
      keys(): Promise<string[]>
      clear(): Promise<boolean>
    }

    FaNotesError: typeof FaNotesError
  }
}

/** The FaNotes add-on API. Available as a global inside your worker. */
declare const fanotes: FaNotes.Api

interface WorkerGlobalScope {
  fanotes: FaNotes.Api
}
