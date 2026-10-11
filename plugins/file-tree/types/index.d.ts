export type FileEntry = {
  /** What Claude is doing to the file right now; null when idle. */
  activity: 'reading' | 'editing' | null
  /** none: only read; saved: edited, not committed; committed: in HEAD; failed: last edit failed. */
  phase: 'none' | 'saved' | 'committed' | 'failed'
}

export type ViewState = {
  path: string | null
  mode: 'diff' | 'file'
  /** The diff hunks (diff mode) or the whole file (file mode). */
  text: string
  /** 1-based first line of each changed hunk, file mode. */
  changes: number[]
  /** 0-based first line shown, file mode. */
  top: number
  note?: string
}

declare module 'claude-code' {
  interface PluginState {
    'file-tree': {
      files: Record<string, FileEntry>
      tick: number
      view: ViewState
    }
  }
}
