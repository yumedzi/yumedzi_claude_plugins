import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { FileEntry, ViewState } from '../types'

const PANE = 'file-tree'
const MAX_TEXT = 300_000
const KIND: Record<string, 'reading' | 'editing'> = {
  Read: 'reading',
  Edit: 'editing',
  MultiEdit: 'editing',
  Write: 'editing',
  NotebookEdit: 'editing',
}

const files = atom({ plugin: 'file-tree', key: 'files' } as const, {} as Record<string, FileEntry>)
const tick = atom({ plugin: 'file-tree', key: 'tick' } as const, 0)
const view = atom(
  { plugin: 'file-tree', key: 'view' } as const,
  { path: null, mode: 'diff', text: '', changes: [], top: 0 } as ViewState,
)

const targetTop = (line: number) => Math.max(0, line - 3)

type Node = { name: string; path?: string; children: Map<string, Node> }
type Row = { depth: number; name: string; path?: string }

function flatten(rels: [string, string][]): Row[] {
  const root: Node = { name: '', children: new Map() }
  for (const [rel, abs] of rels) {
    let node = root
    const parts = rel.split('/').filter(Boolean)
    parts.forEach((part, i) => {
      if (!node.children.has(part)) node.children.set(part, { name: part, children: new Map() })
      node = node.children.get(part)!
      if (i === parts.length - 1) node.path = abs
    })
  }
  const rows: Row[] = []
  const walk = (node: Node, depth: number) => {
    const kids = [...node.children.values()].sort((a, b) => {
      const aDir = a.children.size > 0 && !a.path
      const bDir = b.children.size > 0 && !b.path
      return aDir === bDir ? a.name.localeCompare(b.name) : aDir ? -1 : 1
    })
    for (const kid of kids) {
      rows.push({ depth, name: kid.path ? kid.name : kid.name + '/', path: kid.path })
      walk(kid, depth + 1)
    }
  }
  walk(root, 0)
  return rows
}

const gitRun = ($: any, cwd: string, args: string[]) =>
  $.process.run(['git', '-C', cwd, ...args], { timeoutMs: 15000 }) as Promise<{
    exitCode: number
    stdout: string
  }>

async function diffText($: any, cwd: string, path: string, ctx: number): Promise<string> {
  const head = await gitRun($, cwd, ['diff', 'HEAD', `-U${ctx}`, '--', path])
  if (head.exitCode === 0 && head.stdout.trim()) return head.stdout
  const tracked = await gitRun($, cwd, ['ls-files', '--error-unmatch', '--', path])
  if (tracked.exitCode !== 0) {
    const fresh = await gitRun($, cwd, ['diff', '--no-index', `-U${ctx}`, '--', '/dev/null', path])
    return fresh.stdout
  }
  const last = await gitRun($, cwd, ['log', '-1', '-p', `-U${ctx}`, '--format=', '--', path])
  return last.stdout
}

async function load($: any, path: string, mode: 'diff' | 'file', jumpFirst: boolean) {
  const cwd = await $.session.cwd()
  let next: ViewState
  if (mode === 'diff') {
    const raw = await diffText($, cwd, path, 3)
    const at = raw.indexOf('@@')
    const text = at >= 0 ? raw.slice(at) : ''
    next = { path, mode, text, changes: [], top: 0, note: text ? undefined : 'No diff to show (clean, binary or outside git).' }
  } else {
    let text = ''
    let note: string | undefined
    try {
      text = (await $.fs.read(path)) as string
      if (text.length > MAX_TEXT) {
        text = text.slice(0, MAX_TEXT)
        note = `Showing the first ${MAX_TEXT} characters.`
      }
    } catch {
      note = 'Cannot read this file.'
    }
    const raw = await diffText($, cwd, path, 0)
    const changes = [...raw.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/gm)].map(m => Number(m[1]))
    next = { path, mode, text, changes, top: jumpFirst && changes[0] ? targetTop(changes[0]) : 0, note }
  }
  await update($, view, () => next)
}

async function patch($: any, path: string, change: Partial<FileEntry>) {
  await update($, files, f => ({
    ...f,
    [path]: { ...(f[path] ?? { activity: null, phase: 'none' }), ...change },
  }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'file-tree', description: 'Toggle the File Tree panel (close if shown, open if closed)' })
    void $.ui.open({ id: PANE, title: 'File Tree' })
    $.clock.every(140, async () => {
      const f = await read($, files)
      if (Object.values(f).some(x => x.activity)) await update($, tick, n => n + 1)
    })

    return next(e)
  })

  on('command.run', { command: 'file-tree' }, async $ => {
    const isUp = (await $.ui.panes()).some(pane => pane.id === PANE)
    if (isUp) {
      await $.ui.close({ id: PANE })

      return { text: 'File Tree closed.' }
    }
    await $.ui.open({ id: PANE, title: 'File Tree' })

    return { text: 'File Tree opened.' }
  })

  on('tool.call', async ($, e, next) => {
    const name = String(e.tool)
    const args = e as unknown as Record<string, unknown>

    if (name === 'Bash') {
      const ran = await next(e)
      const command = typeof args.command === 'string' ? args.command : ''
      if (ran.deny === undefined && ran.isError !== true && /\bgit\b[^|;&\n]*\bcommit\b/.test(command)) {
        try {
          const cwd = await $.session.cwd()
          const top = (await gitRun($, cwd, ['rev-parse', '--show-toplevel'])).stdout.trim()
          const shown = await gitRun($, cwd, ['show', '--name-only', '--no-renames', '--pretty=format:', 'HEAD'])
          const done = new Set(shown.stdout.split('\n').filter(Boolean).map(rel => `${top}/${rel}`))
          await update($, files, f => {
            const out = { ...f }
            for (const [p, entry] of Object.entries(out)) {
              if (done.has(p) && entry.phase !== 'none') out[p] = { ...entry, phase: 'committed' }
            }
            return out
          })
          const open = (await read($, view)).path
          if (open && done.has(open)) await load($, open, (await read($, view)).mode, false)
        } catch {
          // a failed lookup leaves the tree as it was
        }
      }

      return ran
    }

    const kind = KIND[name]
    const path = args.file_path ?? args.notebook_path
    if (!kind || typeof path !== 'string') return next(e)

    await patch($, path, { activity: kind })
    let ok = false
    try {
      const ran = await next(e)
      const staged = (ran as { result?: { staged?: boolean } }).result?.staged === true
      ok = ran.deny === undefined && ran.isError !== true && !staged

      return ran
    } finally {
      if (kind === 'editing') await patch($, path, { activity: null, phase: ok ? 'saved' : 'failed' })
      else await patch($, path, { activity: null })
      if (kind === 'editing' && ok && (await read($, view)).path === path) {
        await load($, path, (await read($, view)).mode, true)
      }
    }
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Code } = $.ui.resolve(e)
    const f = await read($, files)
    const t = await read($, tick)
    const v = await read($, view)
    const cwd = await $.session.cwd()
    const rowsAvail = e.viewport?.rows ?? 30
    const rel = (p: string) => (p.startsWith(cwd + '/') ? p.slice(cwd.length + 1) : p)
    const entries = Object.entries(f).slice(-200)
    const rows = flatten(entries.map(([abs]) => [rel(abs), abs]))
    const win = Math.max(8, Math.min(60, rowsAvail - Math.min(rows.length, 14) - 12))

    const nameNode = (name: string, entry: FileEntry | undefined, isSel: boolean) => {
      if (entry?.activity) {
        const base = entry.activity === 'editing' ? 'warning' : 'suggestion'
        const p = (t % (name.length + 8)) - 3
        return (
          <Box flexDirection="row">
            {[...name].map((ch, i) =>
              Math.abs(i - p) <= 1 ? (
                <Text bold color="text">{ch}</Text>
              ) : (
                <Text color={base} dimColor={Math.abs(i - p) > 3}>{ch}</Text>
              ),
            )}
          </Box>
        )
      }
      const color =
        entry?.phase === 'committed' ? 'success' : entry?.phase === 'failed' ? 'error' : entry?.phase === 'saved' ? 'text' : undefined

      return <Text color={color} dimColor={!color} bold={isSel}>{name}</Text>
    }

    const glyph = (entry: FileEntry | undefined) =>
      entry?.activity ? (entry.activity === 'editing' ? '✎' : '◌') : entry?.phase === 'committed' ? '✓' : entry?.phase === 'saved' ? '●' : entry?.phase === 'failed' ? '✗' : '·'

    const sel = v.path
    const lines = v.text ? v.text.split('\n') : []
    const nextTop = v.changes.map(targetTop).find(x => x > v.top)
    const prevTop = [...v.changes.map(targetTop)].reverse().find(x => x < v.top)

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Text bold>File Tree</Text>
          <Text dimColor>{entries.length} files</Text>
          <Button key="clear" label="clear" dimColor onPress={() => update($, files, () => ({}))} />
        </Box>
        {rows.length === 0 && <Text dimColor>No files touched yet.</Text>}
        {rows.map(row => {
          const entry = row.path ? f[row.path] : undefined
          if (!row.path) {
            return <Box marginLeft={row.depth * 2}><Text dimColor>{row.name}</Text></Box>
          }
          const p = row.path
          return (
            <Box key={`row:${p}`} flexDirection="row" gap={1} marginLeft={row.depth * 2}>
              <Text color={entry?.phase === 'committed' ? 'success' : entry?.activity ? 'warning' : undefined} dimColor={!entry?.phase || entry.phase === 'none'}>
                {sel === p ? '▸' : glyph(entry)}
              </Text>
              {nameNode(row.name, entry, sel === p)}
              <Box display="none" hover={{ display: 'flex' }} gap={1}>
                <Button key={`d:${p}`} label="diff" dimColor onPress={() => load($, p, 'diff', false)} />
                <Button key={`f:${p}`} label="file" dimColor onPress={() => load($, p, 'file', true)} />
              </Box>
            </Box>
          )
        })}
        {sel && (
          <Box flexDirection="column" marginTop={1} gap={1}>
            <Box flexDirection="row" gap={1}>
              <Text bold>{rel(sel)}</Text>
              <Button key="m-diff" label="diff" variant={v.mode === 'diff' ? 'primary' : 'secondary'} onPress={() => load($, sel, 'diff', false)} />
              <Button key="m-file" label="file" variant={v.mode === 'file' ? 'primary' : 'secondary'} onPress={() => load($, sel, 'file', true)} />
              <Button key="m-close" label="✕" dimColor onPress={() => update($, view, x => ({ ...x, path: null, text: '' }))} />
            </Box>
            {v.note && <Text dimColor>{v.note}</Text>}
            {v.mode === 'diff' && v.text && <Code source={v.text} format="diff" path={sel} wrap="truncate-end" />}
            {v.mode === 'file' && (
              <Box flexDirection="column">
                <Box flexDirection="row" gap={1}>
                  <Button key="pg-up" label="▲" dimColor onPress={() => update($, view, x => ({ ...x, top: Math.max(0, x.top - win) }))} />
                  <Button key="pg-dn" label="▼" dimColor onPress={() => update($, view, x => ({ ...x, top: Math.min(Math.max(0, lines.length - 1), x.top + win) }))} />
                  <Button key="prev" label="◀ change" dimColor onPress={() => prevTop !== undefined && update($, view, x => ({ ...x, top: prevTop }))} />
                  <Button key="next" label="change ▶" dimColor onPress={() => nextTop !== undefined && update($, view, x => ({ ...x, top: nextTop }))} />
                  <Text dimColor>{lines.length === 0 ? '' : `${v.top + 1}–${Math.min(lines.length, v.top + win)} / ${lines.length}`}</Text>
                </Box>
                {v.changes.length > 0 && (
                  <Box flexDirection="row" flexWrap="wrap" gap={1}>
                    {v.changes.slice(0, 16).map(c => (
                      <Button
                        key={`c:${c}`}
                        label={`L${c}`}
                        variant={c > v.top && c <= v.top + win ? 'primary' : 'secondary'}
                        onPress={() => update($, view, x => ({ ...x, top: targetTop(c) }))}
                      />
                    ))}
                  </Box>
                )}
                {lines.length > 0 && (
                  <Code source={lines.slice(v.top, v.top + win).join('\n')} path={sel} startLine={v.top + 1} wrap="truncate-end" />
                )}
              </Box>
            )}
          </Box>
        )}
      </Box>
    )
  })
}
