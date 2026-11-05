import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { AgentRow, Run, Sprite, TaskRow } from '../types'

const run0: Run = {
  active: false, showDone: false, startedAt: 0, steps: 0, tools: 0,
  todoDone: 0, todoActive: 0, todoTotal: 0, target: 0, shown: 0, from: 0, activity: '', endedAt: 0, lastActivity: 0, costAtStart: -1, lastTurnCost: -1,
}
const runA = atom({ plugin: 'cool-progress', key: 'run' } as const, run0)
const agentsA = atom({ plugin: 'cool-progress', key: 'agents' } as const, {} as Record<string, AgentRow>)
const tasksA = atom({ plugin: 'cool-progress', key: 'tasks' } as const, {} as Record<string, TaskRow>)
const spritesA = atom({ plugin: 'cool-progress', key: 'sprites' } as const, {} as Record<string, Sprite>)
const tickA = atom({ plugin: 'cool-progress', key: 'tick' } as const, 0)
const viewA = atom({ plugin: 'cool-progress', key: 'view' } as const, { agents: false, tasks: false })
const PANE = 'cool-progress'
const enabledA = atom({ plugin: 'cool-progress', key: 'isEnabled' } as const, true)

// ---------------------------------------------------------------- sprites
// 14 pixels wide, 8 tall (four text rows of half blocks; the crab is 9 tall and rides the band).
// Frames cycle while the agent runs, `blink` is drawn over the eyes now and then, and `variants`
// are palette swaps, so two agents of one kind still look different.
const BUILTIN: Record<string, Sprite> = {
  crab: {
    palette: { O: '#d97757', D: '#b4573b', H: '#f2a283', R: '#ee9b7d', r: '#c86a4c', W: '#fff7ed', E: '#2b1b17', L: '#8f3a26', M: '#7a2e1e' },
    frames: [
      ['RR.R......R.RR', 'RRR..W..W..RRR', '.r...E..E...r.', '.r.HHHHHHHH.r.', '..OOOOOOOOOO..', '.OOOOOMMOOOOO.', '..DDDDDDDDDD..', '.L.L.L..L.L.L.', 'L.L.L....L.L.L'],
      ['.RR........RR.', 'RRRR.W..W.RRRR', '.r...E..E...r.', '.r.HHHHHHHH.r.', '..OOOOOOOOOO..', '.OOOOOMMOOOOO.', '..DDDDDDDDDD..', '..L.L.LL.L.L..', '.L.L......L.L.'],
    ],
    blink: ['..............', '.....L..L.....', '.....L..L.....'],
  },
  robot: {
    palette: { A: '#ef4444', a: '#64748b', H: '#94a3b8', h: '#64748b', E: '#22d3ee', M: '#1e293b', Y: '#facc15', B: '#475569', b: '#334155' },
    frames: [
      ['......A.......', '......a.......', '..HHHHHHHHHH..', '.hHEEHHHHEEHh.', '.hHEEHHHHEEHh.', '..HHMYMYMYHH..', '..bBBBBBBBBb..', '..h.hh..hh.h..'],
      ['......Y.......', '......a.......', '..HHHHHHHHHH..', '.hHHEEHHHHEEh.', '.hHHEEHHHHEEh.', '..HHYMYMYMHH..', '..bBBBBBBBBb..', '..h.hh..hh.h..'],
      ['......A.......', '......a.......', '..HHHHHHHHHH..', '.hEEHHHHEEHHh.', '.hEEHHHHEEHHh.', '..HHMYMYMYHH..', '..bBBBBBBBBb..', '...hh.hh.hh...'],
    ],
    blink: ['..............', '..............', '..............', '...HH....HH...', '...hh....hh...'],
    variants: [{}, { H: '#fbbf24', h: '#b45309', B: '#92400e', b: '#78350f' }, { H: '#c4b5fd', h: '#7c3aed', B: '#5b21b6', b: '#4c1d95', E: '#f0abfc' }],
  },
  owl: {
    palette: { O: '#a16207', o: '#78350f', W: '#fef9c3', P: '#111827', B: '#f59e0b', F: '#d6a35c', Y: '#facc15' },
    frames: [
      ['..oo......oo..', '..oOOOOOOOOo..', '.OWWWOOOOWWWO.', '.OWPWOBBOWPWO.', '.OWWWOBBOWWWO.', 'oOOFFFFFFFFOOo', '.oOFFFFFFFFOo.', '...YY....YY...'],
      ['..oo......oo..', '..oOOOOOOOOo..', '.OWWWOOOOWWWO.', '.OPWWOBBOPWWO.', '.OWWWOBBOWWWO.', '.OOFFFFFFFFOO.', 'oOOFFFFFFFFOOo', '...YY....YY...'],
    ],
    blink: ['..............', '..............', '..OOO....OOO..', '..ooo....ooo..', '..OOO....OOO..'],
    variants: [{}, { O: '#9ca3af', o: '#4b5563', F: '#e5e7eb' }, { O: '#e5e7eb', o: '#9ca3af', F: '#f8fafc', W: '#fde68a' }],
  },
  cat: {
    palette: { K: '#6b7280', k: '#4b5563', G: '#4ade80', E: '#111827', N: '#f9a8d4', W: '#d1d5db', T: '#6b7280' },
    frames: [
      ['.k........k...', '.kK......Kk...', '.KKKKKKKKKK...', '.KGEKKKKGEK..T', 'WKKKKNNKKKKW.T', '.KKKKkkKKKK..T', '..KKKKKKKK..TT', '..k.k..k.k.TT.'],
      ['.k............', '.kK......Kk...', '.KKKKKKKKKK...', '.KEGKKKKEGK...', 'WKKKKNNKKKKW..', '.KKKKkkKKKK...', '..KKKKKKKK.TTT', '..k.k..k.k.T..'],
    ],
    blink: ['..............', '..............', '..............', '..kk....kk....'],
    variants: [{}, { K: '#f59e0b', k: '#b45309', T: '#f59e0b' }, { K: '#e5e7eb', k: '#9ca3af', T: '#e5e7eb', G: '#60a5fa', W: '#9ca3af' }, { K: '#3f3f46', k: '#18181b', T: '#3f3f46', G: '#facc15', W: '#a1a1aa' }],
  },
  ghost: {
    palette: { W: '#e2e8f0', w: '#94a3b8', E: '#1e293b', B: '#fda4af' },
    frames: [
      ['....WWWWWW....', '...WWWWWWWW...', '..WWEEWWEEWW..', '..WWEEWWEEWW..', '..WBWWEEWWBW..', '..WWWWWWWWWW..', '..WwWWWWWWwW..', '..W.WW..WW.W..'],
      ['....WWWWWW....', '...WWWWWWWW...', '..WWWEEWWEEW..', '..WWWEEWWEEW..', '..WBWWWEEWBW..', '..WWWWWWWWWW..', '..WwWWWWWWwW..', '..WW.WW..WW.W.'],
    ],
    blink: ['..............', '..............', '..............', '....ww..ww....'],
    variants: [{}, { W: '#bae6fd', w: '#38bdf8' }, { W: '#bbf7d0', w: '#4ade80' }],
  },
  wizard: {
    palette: { P: '#7c3aed', p: '#5b21b6', s: '#fde047', S: '#fcd9b6', E: '#111827', B: '#e5e7eb', R: '#4c1d95', W: '#a16207' },
    frames: [
      ['.......P......', '......PPs.....', '.....PPPPP....', '...pPPPPPPPp..', '....SESSES....', '....BBSSBB..s.', '...RBBBBBBR.W.', '...RRBBBBRRW..'],
      ['.......P......', '......PP......', '.....PPPPP....', '...pPPPPPPPp..', '....SESSES..s.', '....BBSSBB....', '...RBBBBBBR.W.', '...RRBBBBRRW..'],
      ['.......P......', '......PPs.....', '.....PPPPP....', '...pPPPPPPPp..', '....SESSES....', '....BBSSBB...s', '...RBBBBBBR.W.', '...RRBBBBRRW..'],
    ],
    blink: ['..............', '..............', '..............', '..............', '.....S..S.....'],
    variants: [{}, { P: '#2563eb', p: '#1e40af', R: '#1e3a8a' }, { P: '#16a34a', p: '#166534', R: '#14532d' }],
  },
  fox: {
    palette: { F: '#f97316', f: '#c2410c', W: '#fff7ed', E: '#111827', N: '#1f2937' },
    frames: [
      ['.f........f...', '.fF......Ff...', '.FFFFFFFFFF...', '.FFEFFFFEFF...', '.FWWWNNWWWF...', '..FWWWWWWF..FF', '...FFFFFF..FFW', '...f.ff.f.FFW.'],
      ['.f........f...', '.fF......Ff...', '.FFFFFFFFFF...', '.FFEFFFFEFF...', '.FWWWNNWWWF...', '..FWWWWWWF....', '...FFFFFF.FFFW', '...f.ff.f..FF.'],
    ],
    blink: ['..............', '..............', '..............', '...f....f.....'],
    variants: [{}, { F: '#e5e7eb', f: '#9ca3af', W: '#ffffff' }, { F: '#78350f', f: '#451a03' }],
  },
  octopus: {
    palette: { M: '#c084fc', m: '#9333ea', W: '#ffffff', E: '#111827' },
    frames: [
      ['....MMMMMM....', '...MMMMMMMM...', '..MMWEMMWEMM..', '..MMMMMMMMMM..', '..MMmMMMMmMM..', '.M.MM.MM.MM.M.', 'M..M..M..M..M.', '.M..M..M..M..M'],
      ['....MMMMMM....', '...MMMMMMMM...', '..MMEWMMEWMM..', '..MMMMMMMMMM..', '..MMmMMMMmMM..', '..MM.MM.MM.MM.', '.M..M..M..M..M', 'M..M..M..M..M.'],
    ],
    blink: ['..............', '..............', '....mm..mm....'],
    variants: [{}, { M: '#fb7185', m: '#e11d48' }, { M: '#38bdf8', m: '#0369a1' }],
  },
  frog: {
    palette: { G: '#4ade80', g: '#16a34a', W: '#ffffff', E: '#111827', R: '#f87171', Y: '#bbf7d0' },
    frames: [
      ['..gWWg..gWWg..', '..gWEg..gWEg..', '.GGGGGGGGGGGG.', '.GGGGGGGGGGGG.', '.GRRRRRRRRRRG.', '..GYYYYYYYYG..', '.gGGYYYYYYGGg.', 'gg.g......g.gg'],
      ['..gWWg..gWWg..', '..gEWg..gEWg..', '.GGGGGGGGGGGG.', '.GGGGGGGGGGGG.', '.GGGGRRRRGGGG.', '..GYYYRRYYYG..', '.gGGYYYYYYGGg.', '.gg.g....g.gg.'],
    ],
    blink: ['..gggg..gggg..', '..gggg..gggg..'],
    variants: [{}, { G: '#a3e635', g: '#4d7c0f' }, { G: '#2dd4bf', g: '#0f766e', Y: '#ccfbf1' }],
  },
  dragon: {
    palette: { D: '#14b8a6', d: '#0f766e', Y: '#fde68a', E: '#111827', W: '#5eead4', F: '#fb923c', f: '#facc15' },
    frames: [
      ['.d..d.........', '.DDDD....WW...', '.DEDDDD.WWWW..', '.DDDDDDDDWW...', '..DYYDDDDD....', '..DYYYDDDDD.Dd', '..DDYYDDDDDDd.', '...d.d...d.d..'],
      ['.d..d.........', 'fDDDD.....WWW.', 'FDEDDDD..WWWW.', '.DDDDDDDDWW...', '..DYYDDDDD....', '..DYYYDDDDD.Dd', '..DDYYDDDDDDd.', '...d.d...d.d..'],
      ['.d..d.........', '.DDDD.........', '.DEDDDD..WW...', '.DDDDDDDWWWW..', '..DYYDDDDWW...', '..DYYYDDDDD..d', '..DDYYDDDDDDDd', '...d.d...d.d..'],
    ],
    blink: ['..............', '..............', '..D...........'],
    variants: [{}, { D: '#ef4444', d: '#991b1b', W: '#fca5a5' }, { D: '#8b5cf6', d: '#5b21b6', W: '#c4b5fd' }],
  },
  penguin: {
    palette: { K: '#475569', W: '#f8fafc', B: '#f59e0b', E: '#111827', F: '#f97316', S: '#ef4444' },
    frames: [
      ['....KKKKKK....', '...KKWWWWKK...', '...KWEWWEWK...', '...KWWBBWWK...', '..KSSSSSSSSK..', '.KKWWWWWWWWKK.', '..KWWWWWWWWK..', '...FF....FF...'],
      ['....KKKKKK....', '...KKWWWWKK...', '...KWEWWEWK...', '...KWWBBWWK...', '..KSSSSSSSSK..', '..KWWWWWWWWK..', '.KKWWWWWWWWKK.', '....FF..FF....'],
    ],
    blink: ['..............', '..............', '.....W..W.....'],
    variants: [{}, { S: '#3b82f6' }, { S: '#22c55e' }],
  },
}

const KEYWORDS: [RegExp, string][] = [
  [/secur|vuln|snyk|threat|cve|exploit/i, 'dragon'],
  [/break|claim|probe|adversar|verif|challeng|attack|red.?team/i, 'fox'],
  [/data|sql|query|databricks|table|metric|log/i, 'penguin'],
  [/parallel|multi|batch|fan|orchestr|workflow|coordinat/i, 'octopus'],
  [/deploy|ship|release|launch|exec|run\b/i, 'frog'],
  [/background|cleanup|silent|archive|stash/i, 'ghost'],
  [/scout|explor|search|recon|find|locate/i, 'crab'],
  [/research|web|doc|read|brief|fetch/i, 'owl'],
  [/review|test|qa|lint|audit|check/i, 'cat'],
  [/deep|think|plan|architect|design|reason/i, 'wizard'],
  [/work|code|impl|edit|build|fix|write/i, 'robot'],
]

const hashOf = (t: string) => [...t].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7)

// The mascot map wins, then the role keywords. With neither (and no default mascot set), the agent
// gets a kind no running agent has yet, so a row of agents is a row of different animals.
function pickSprite(type: string, label: string, mapText: string, fallback: string, known: string[], inUse: string[]): string {
  for (const part of mapText.split(',')) {
    const [key, val] = part.split('=').map(s => s.trim())
    if (key && val && (key === type || key === label) && known.includes(val)) return val
  }
  const hay = `${type} ${label}`
  for (const [re, name] of KEYWORDS) if (re.test(hay) && known.includes(name)) return name
  if (fallback && known.includes(fallback)) return fallback
  const free = known.filter(n => !inUse.includes(n))
  const pool = free.length > 0 ? free : known

  return pool[hashOf(hay) % pool.length] ?? 'crab'
}

// ---------------------------------------------------------------- pricing
// $/MTok, first-party API rates as listed in the claude-api skill (cached 2026-10-06).
// cache read is the listed rate where one is given, else ~0.1x input; cache write ~1.25x input.
const PRICES: [RegExp, number, number, number | null][] = [
  [/fable-5-1/, 10, 50, 0.25],
  [/fable|mythos/, 10, 50, null],
  [/opus-5-5/, 4, 20, 0.2],
  [/opus/, 5, 25, null],
  [/sonnet-5-5/, 2, 10, 0.2],
  [/sonnet-5/, 2, 10, null],
  [/sonnet-4/, 3, 15, null],
  [/haiku-5/, 0.1, 0.5, null],
  [/haiku/, 1, 5, null],
]

function costOf(a: AgentRow): number | null {
  const m = a.model.toLowerCase()
  for (const [re, inp, out, read] of PRICES) {
    if (re.test(m)) {
      const r = read ?? inp * 0.1
      return (a.input * inp + a.output * out + a.cacheRead * r + a.cacheWrite * inp * 1.25) / 1e6
    }
  }

  return null
}

// Finished rows stay for review; only the oldest finished ones are dropped past this many.
const KEEP_DONE = 30
function keepRecent<T extends { status: string; endedAt: number }>(all: Record<string, T>): Record<string, T> {
  const done = Object.entries(all).filter(([, x]) => x.status !== 'running').sort((x, y) => y[1].endedAt - x[1].endedAt)
  const drop = new Set(done.slice(KEEP_DONE).map(([id]) => id))

  return drop.size === 0 ? all : Object.fromEntries(Object.entries(all).filter(([id]) => !drop.has(id)))
}

// Flip a Completed section, then bump the tick so an idle pane (no 1 Hz redraw) repaints at once.
// A click on a button the focus ring is not on yet only moves the ring there (`ui.focus`, no
// press), so the first click on a toggle seemed lost. The toggle flips on that focus move too; when
// one click raises both (focus and press, in either order, within SAME_CLICK_MS), only the first counts.
const SAME_CLICK_MS = 400
const lastFlip: { key: string; at: number; via: 'press' | 'focus' } = { key: '', at: 0, via: 'press' }
async function toggleView($: any, key: 'agents' | 'tasks', via: 'press' | 'focus' = 'press') {
  const at: number = await $.clock.now()
  const isSameClick = lastFlip.key === key && lastFlip.via !== via && at - lastFlip.at < SAME_CLICK_MS
  Object.assign(lastFlip, { key, at, via })
  if (isSameClick) return
  await update($, viewA, x => ({ ...x, [key]: !x[key] }))
  await update($, tickA, n => n + 1)
}
async function focusToggle($: any, e: any, next: any) {
  const key = e.element === 'agents-toggle' ? 'agents' : e.element === 'tasks-toggle' ? 'tasks' : null
  if (key && e.origin?.kind === 'person') await toggleView($, key, 'focus')

  return next(e)
}

// ---------------------------------------------------------------- small helpers
const num = (v: unknown, d: number) => (typeof v === 'number' && v > 0 ? v : d)
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const short = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
const base = (p: string) => p.split('/').pop() ?? p
const kfmt = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n))
const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))

  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const clockLong = (ms: number) => {
  const m = Math.floor(Math.max(0, ms) / 60000)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)

  return d > 0 ? `${d}d ${h % 24}h` : h > 0 ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`
}
const money = (c: number | null) => (c === null ? '—' : '~$' + (c < 1 ? c.toFixed(3) : c.toFixed(2)))
const modelName = (m: string) => m.replace(/^claude-/, '')

// The row draws this with `truncate-end`, so it is cut where the pane runs out of room. Here it
// is only folded to one line and capped, to keep the stored state small.
const oneLine = (s: string) => short(s.replace(/\s+/g, ' ').trim(), 300)
function describeCall(name: string, args: Record<string, unknown>): string {
  const p = args.file_path ?? args.notebook_path ?? args.path
  if (typeof p === 'string') return `${name} ${base(p)}`
  if (typeof args.command === 'string') return `${name} ${oneLine(args.command)}`
  if (typeof args.pattern === 'string') return `${name} ${oneLine(args.pattern)}`
  if (typeof args.description === 'string') return `${name} ${oneLine(args.description)}`

  return name
}

function target(r: Run, k: number): number {
  let t: number
  if (r.todoTotal > 0) t = (r.todoDone + 0.4 * r.todoActive) / r.todoTotal
  else t = 1 - Math.exp(-r.steps / k)

  return Math.max(r.target, Math.min(0.95, t))
}

// The session's cost so far, or -1 when the engine reports none. A first turn starts at 0, a real
// value, so 0 must not stand for "unknown".
async function sessionCost($: any): Promise<number> {
  try {
    const usd = (await $.session.usage()).cost?.usd
    return typeof usd === 'number' ? usd : -1
  } catch {
    return -1
  }
}

async function patchRun($: any, k: number, change: Partial<Run>) {
  const seen: number = await $.clock.now()
  await update($, runA, r => {
    const next = { ...r, ...change, lastActivity: seen }
    const t = next.active ? target(next, k) : next.target
    const moved = Math.abs(t - r.shown) > 0.004

    return { ...next, target: t, from: moved ? r.shown : r.from, shown: moved ? t : r.shown }
  })
  $.clock.after(1200, () => {
    void update($, runA, r => (r.from === r.shown ? r : { ...r, from: r.shown }))
  })
}

async function patchAgent($: any, id: string, fn: (a: AgentRow) => AgentRow) {
  await update($, agentsA, all => (all[id] ? { ...all, [id]: fn(all[id]) } : all))
}

async function finishTask($: any, id: string, status: 'done' | 'failed') {
  const at: number = await $.clock.now()
  await update($, tasksA, all => (all[id] ? { ...all, [id]: { ...all[id], status, endedAt: all[id].endedAt || at } } : all))
}

async function noteNotifications($: any, text: string) {
  if (!text.includes('<task-id>')) return
  const id = /<task-id>([^<]+)<\/task-id>/.exec(text)?.[1]?.trim()
  const status = /<status>([^<]+)<\/status>/.exec(text)?.[1]?.trim().toLowerCase()
  if (!id || !status || status === 'running') return
  await finishTask($, id, status === 'completed' ? 'done' : 'failed')
}

async function loadSprites($: any, file: string) {
  if (!file) return
  try {
    const parsed = JSON.parse((await $.fs.read(file)) as string) as Record<string, Sprite>
    const ok: Record<string, Sprite> = {}
    for (const [name, sp] of Object.entries(parsed)) {
      const frames = (sp.frames ?? []).filter(f => Array.isArray(f) && f.length >= 2 && f.length % 2 === 0)
      if (sp.palette && frames.length > 0) ok[name] = { palette: sp.palette, frames }
    }
    await update($, spritesA, () => ok)
  } catch {
    $.ui.toast('cool-progress: could not read the sprites file')
  }
}

// ---------------------------------------------------------------- drawing
function bar(Text: any, width: number, shown: number, tick: number, isLive: boolean) {
  const fill = Math.min(width - 1, Math.floor(shown * width))
  const wave = (tick * 0.8) % (width + 8) - 4
  const cells: { ch: string; color: string; bold?: boolean }[] = []
  for (let i = 0; i < width; i++) {
    if (i < fill) {
      const d = Math.abs(i - wave)
      cells.push({ ch: '█', color: isLive && d < 1 ? '#d9fff5' : isLive && d < 3 ? '#5eead4' : '#14b8a6' })
    } else if (i === fill && shown < 0.999) {
      cells.push({ ch: '🦀', color: '#d97757', bold: true })
      i++
    } else {
      cells.push({ ch: shown >= 0.999 ? '█' : '░', color: shown >= 0.999 ? '#14b8a6' : '#475569' })
    }
  }
  const runs: { ch: string; color: string; bold?: boolean }[] = []
  for (const c of cells) {
    const last = runs[runs.length - 1]
    if (last && last.color === c.color && last.bold === c.bold && c.ch === last.ch.slice(-1)) last.ch += c.ch
    else runs.push({ ...c })
  }

  return runs.map(r => <Text color={r.color} bold={r.bold === true}>{r.ch}</Text>)
}

function spriteRows(Box: any, Text: any, sp: Sprite, frame: number, isDim: boolean, variant = 0) {
  const g = sp.frames[frame % sp.frames.length]!
  const pal = paletteOf(sp, variant)
  const out: any[] = []
  for (let r = 0; r + 1 < g.length; r += 2) {
    const top = g[r]!
    const bot = g[r + 1]!
    const runs: { ch: string; fg?: string; bg?: string }[] = []
    for (let c = 0; c < top.length; c++) {
      const t = pal[top[c]!]
      const b = pal[bot[c] ?? '.']
      const cell: { ch: string; fg?: string; bg?: string } =
        t && b ? { ch: '▀', fg: t, bg: b } : t ? { ch: '▀', fg: t } : b ? { ch: '▄', fg: b } : { ch: ' ' }
      const last = runs[runs.length - 1]
      if (last && last.fg === cell.fg && last.bg === cell.bg && last.ch === cell.ch) last.ch += cell.ch
      else runs.push(cell)
    }
    out.push(
      <Box flexDirection="row">
        {runs.map(x => (
          <Text {...(x.fg ? { color: x.fg } : {})} {...(x.bg ? { backgroundColor: x.bg } : {})} dimColor={isDim}>
            {x.ch}
          </Text>
        ))}
      </Box>,
    )
  }

  return out
}


// ---------------------------------------------------------------- desktop SVG (static source, CSS-animated)
// The source only changes on real events (a step, a tool call), so the image is never
// reloaded between them; every motion below is a CSS or SMIL animation inside the SVG.
// A sprite as SVG markup, its frames stacked and cycled by CSS: every frame shows for its share of
// `period`, steps(1), so the pixels never blend. `blink` lays closed eyes over it for a moment
// every few seconds and the whole sprite bobs a pixel. Class and keyframe names carry `id`, since
// several sprites can share one page. Idle, it holds frame 0 and only blinks, slower.
function animSprite(sp: Sprite, pal: Record<string, string>, u: number, isLive: boolean, id: string, period = 0.8): { css: string; body: string } {
  const n = Math.max(1, sp.frames.length)
  const step = period / n
  let css = `@keyframes ${id}f{0%{opacity:1}${(100 / n).toFixed(2)}%{opacity:0}100%{opacity:0}}`
  css += `@keyframes ${id}k{0%,93%{opacity:0}94%,98%{opacity:1}99%,100%{opacity:0}}`
  css += `@keyframes ${id}b{0%,100%{transform:translateY(0)}50%{transform:translateY(-${(u * 0.5).toFixed(1)}px)}}`
  for (let k = 0; k < n; k++) {
    css += isLive
      ? `.${id}-f${k}{animation:${id}f ${period}s steps(1) infinite;animation-delay:-${(((n - k) % n) * step).toFixed(2)}s}`
      : `.${id}-f${k}{opacity:${k === 0 ? 1 : 0}}`
  }
  const blinkDelay = (hashOf(id) % 30) / 10
  css += `.${id}-e{opacity:0;animation:${id}k ${isLive ? 3.6 : 5.2}s steps(1) infinite;animation-delay:-${blinkDelay}s}`
  css += isLive ? `.${id}-o{animation:${id}b ${period}s steps(2) infinite}` : ''
  css += `@media (prefers-reduced-motion: reduce){[class^="${id}-"]{animation:none}}`
  const frames = sp.frames.map((g, k) => `<g class="${id}-f${k}">${gridRects(g, pal, u)}</g>`).join('')
  const blink = sp.blink ? `<g class="${id}-e">${gridRects(sp.blink, pal, u)}</g>` : ''

  return { css, body: `<g class="${id}-o">${frames}${blink}</g>` }
}

const paletteOf = (sp: Sprite, variant = 0) => ({ ...sp.palette, ...(sp.variants?.[variant % sp.variants.length] ?? {}) })

function noise(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0
  h = ((h ^ (h >>> 13)) * 1274126177) | 0

  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function gridRects(grid: string[], pal: Record<string, string>, u: number): string {
  let out = ''
  grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = pal[row[x]!]
      if (c) out += `<rect x="${(x * u).toFixed(1)}" y="${(y * u).toFixed(1)}" width="${(u + 0.15).toFixed(2)}" height="${(u + 0.15).toFixed(2)}" fill="${c}"/>`
    }
  })

  return out
}

const SVG_CSS = (isLive: boolean) => `<style>
.k{fill:#e4e4e2}@media (prefers-color-scheme: dark){.k{fill:#2c2c2c}}
.t0,.t1,.t2,.t3{animation:tw 2.2s ease-in-out infinite}
.t1{animation-duration:2.8s;animation-delay:-.7s}.t2{animation-duration:1.9s;animation-delay:-1.3s}.t3{animation-duration:3.3s;animation-delay:-.4s}
@keyframes tw{0%,100%{opacity:1}50%{opacity:.3}}
@media (prefers-reduced-motion: reduce){.t0,.t1,.t2,.t3{animation:none}}
</style>`

// The band's crab: 14 x 9 pixels of 2.1px, about 29 x 19, inside the 24px band.
const CRAB_U = 2.1
const CRAB_W = 14 * CRAB_U

function dotBar(w: number, to: number, hasCrab: boolean, isLive: boolean): string {
  const bH = hasCrab ? 18 : 8
  const H = hasCrab ? 24 : 12
  const y0 = (H - bH) / 2
  const cell = 3.6
  const f1 = Math.max(to * w, bH)
  if (!hasCrab) {
    // Small bars (sub-agents) are a plain solid fill: a gradient looks muddy at this size.
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${H}" viewBox="0 0 ${w} ${H}">${SVG_CSS(false)}<rect class="k" x="0" y="${y0}" width="${w}" height="${bH}" rx="${bH / 2}"/><rect x="0" y="${y0}" width="${f1.toFixed(1)}" height="${bH}" rx="${bH / 2}" fill="#d97757"/></svg>`
  }
  // The crab rides the track and the fill always ends where the crab begins, so at 0% there are
  // no dots under it and at 100% the crab sits at the far end.
  const crabX = Math.min(Math.max(to, 0), 1) * (w - CRAB_W - 1)
  const fe = crabX
  const cols = Math.floor(fe / cell)
  // The fill keeps the track's rounded left end but is cut flat on the right, where the crab begins.
  const rr = bH / 2
  const fillClip =
    fe > rr
      ? `<path d="M ${rr} ${y0} H ${fe.toFixed(1)} V ${y0 + bH} H ${rr} A ${rr} ${rr} 0 0 1 ${rr} ${y0} Z"/>`
      : `<rect x="0" y="${y0}" width="${Math.max(fe, 0).toFixed(1)}" height="${bH}"/>`
  const rows = Math.floor(bH / cell)
  const gy = y0 + (bH - rows * cell) / 2
  // Round dots of varying brightness on a gradient that builds toward the head. The dot pattern is
  // periodic and streams right to left (a trail leaving the crab); the hole mask is fixed to the
  // screen, dense near the head and thinning toward the left.
  const PERIOD = 18
  let dots = ''
  for (let c = 0; c < cols + PERIOD; c++) {
    const cc = ((c % PERIOD) + PERIOD) % PERIOD
    for (let r = 0; r < rows; r++) {
      if (noise(cc, r) < 0.8) {
        const o = (0.3 + 0.6 * noise(cc + 31, r + 5)).toFixed(2)
        dots += `<circle cx="${(c * cell + cell / 2).toFixed(1)}" cy="${(gy + r * cell + cell / 2).toFixed(1)}" r="1.35" fill-opacity="${o}"/>`
      }
    }
  }
  let keep = ''
  for (let c = 0; c < cols; c++) {
    const t = c / Math.max(1, cols - 1)
    const pk = t >= 0.55 ? 1 : 0.07 + 0.93 * Math.pow(t / 0.55, 1.7)
    for (let r = 0; r < rows; r++) {
      if (pk >= 1 || noise(c + 101, r + 7) < pk) keep += `<rect x="${(c * cell).toFixed(1)}" y="${(gy + r * cell).toFixed(1)}" width="${cell}" height="${cell}"/>`
    }
  }
  const flowCss = `<style>.flow{${isLive ? 'animation:flow 1.8s steps(18) infinite' : ''}}@keyframes flow{to{transform:translateX(-${(PERIOD * cell).toFixed(1)}px)}}@media (prefers-reduced-motion: reduce){.flow{animation:none}}</style>`
  const crabY = y0 + (bH - CRAB_U * BUILTIN.crab!.frames[0]!.length) / 2
  let ticks = ''
  for (const i of [1, 2, 3]) {
    const x = (w * i) / 4
    if (x > fe + 40) ticks += `<rect x="${(x - 1).toFixed(1)}" y="${(y0 + bH / 2 - 4).toFixed(1)}" width="2" height="8" rx="1" fill="#8a8a8a" fill-opacity="0.4"/>`
  }
  const pet = animSprite(BUILTIN.crab!, BUILTIN.crab!.palette, CRAB_U, isLive, 'cr', 0.6)
  const crab = `<style>${pet.css}</style><g transform="translate(${crabX.toFixed(1)} ${crabY.toFixed(1)})">${pet.body}</g>`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${H}" viewBox="0 0 ${w} ${H}">
${SVG_CSS(isLive)}${flowCss}
<defs>
<linearGradient id="bg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${Math.max(40, fe).toFixed(0)}" y2="0"><stop offset="0" stop-color="#a99cf0" stop-opacity="0"/><stop offset="0.5" stop-color="#9a88ea" stop-opacity="0.42"/><stop offset="1" stop-color="#8b78e0" stop-opacity="0.9"/></linearGradient>
<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${Math.max(40, fe).toFixed(0)}" y2="0"><stop offset="0" stop-color="#b3aecb"/><stop offset="0.55" stop-color="#d9d2fb"/><stop offset="1" stop-color="#ffffff"/></linearGradient>
<mask id="mk"><g fill="#fff">${keep}</g></mask>
<clipPath id="c">${fillClip}</clipPath>
</defs>
<rect class="k" x="0" y="${y0}" width="${w}" height="${bH}" rx="${bH / 2}"/>
<g clip-path="url(#c)"><rect x="0" y="${y0}" width="${fe.toFixed(1)}" height="${bH}" fill="url(#bg)"/><g mask="url(#mk)"><g class="flow" fill="url(#g)">${dots}</g></g></g>
${ticks}
${crab}
</svg>`
}

function spriteSvg(sp: Sprite, u: number, isLive: boolean, variant: number, seed: string): string {
  const w = Math.round(sp.frames[0]![0]!.length * u)
  const h = Math.round(sp.frames[0]!.length * u)
  const id = 's' + (hashOf(seed) % 1e6).toString(36)
  const a = animSprite(sp, paletteOf(sp, variant), u, isLive, id, 0.9)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h + 2}" viewBox="0 -2 ${w} ${h + 2}"><style>${a.css}</style>${a.body}</svg>`
}


const tfmt = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n))
const realMoney = (c: number) => '$' + (c < 1 ? c.toFixed(3) : c.toFixed(2))
const ctxMaxOf = (model: string) => (/haiku-4/.test(model) ? 200000 : 1000000)

// A terminal glyph of fixed size. The cursor blinks with a CSS animation inside the image, so the
// text beside it never moves.
// The band's jobs counter: a terminal window, title-bar dots and a prompt; the cursor blinks while
// a job runs.
// The band's sub-agents counter, the terminal chip's sibling: a robot head on a dark plate with ears,
// a mouth grille and an antenna. While an agent runs the antenna tip glows and the eyes scan side to
// side and blink.
// Each chip carries its count, drawn 4px after the icon, so the number sits snug against it.
const chipW = (n: number) => Math.ceil(24 + String(n).length * 7.6)
// Both chips follow the theme: light gets a pale plate with deeper strokes, dark keeps the night
// plate. Classes carry a chip prefix (rb/tm) because the band's SVGs share one page's styles.
const chipCount = (n: number, cls: string, isLive: boolean) =>
  `<text class="${cls}" x="24" y="12.6" font-family="${FONT}" font-size="13" font-weight="${isLive ? 700 : 400}" fill-opacity="${isLive ? 1 : 0.6}">${n}</text>`
type ChipTheme = { line: string; plate: string; text: string; accent: string }
const chipThemeCss = (p: string, light: ChipTheme, dark: ChipTheme) => {
  const rules = (t: ChipTheme) =>
    `.${p}S{stroke:${t.line}}.${p}F{fill:${t.line}}.${p}P{fill:${t.plate}}.${p}T{fill:${t.text}}.${p}A{fill:${t.accent}}`
  return `${rules(light)}@media (prefers-color-scheme: dark){${rules(dark)}}`
}

function robotChip(n: number): string {
  const isLive = n > 0
  const theme = chipThemeCss(
    'rb',
    isLive
      ? { line: '#7c3aed', plate: '#f5f3ff', text: '#7c3aed', accent: '#0891b2' }
      : { line: '#9ca3af', plate: '#f3f4f6', text: '#8b5cf6', accent: '#9ca3af' },
    isLive
      ? { line: '#a78bfa', plate: '#1a1433', text: '#a78bfa', accent: '#67e8f9' }
      : { line: '#6b7280', plate: '#1a1433', text: '#a78bfa', accent: '#6b7280' },
  )
  const glow = isLive ? '.rbG{fill:#d946ef}@media (prefers-color-scheme: dark){.rbG{fill:#f0abfc}}' : ''
  const css = isLive
    ? '.gl{animation:gl 1.6s ease-in-out infinite}@keyframes gl{50%{opacity:.25}}.ey{animation:ey 3.2s steps(1) infinite}@keyframes ey{0%{transform:translateX(0)}30%{transform:translateX(1px)}55%{transform:translateX(-1px)}80%{transform:translateX(0)}}.bk{animation:bk 3.2s steps(1) infinite}@keyframes bk{0%,88%{transform:scaleY(1)}89%,93%{transform:scaleY(.15)}94%{transform:scaleY(1)}}.bk{transform-origin:10px 8.6px}'
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${chipW(n)}" height="16" viewBox="0 0 ${chipW(n)} 16"><style>${theme}${glow}${css}@media (prefers-reduced-motion: reduce){.gl,.ey,.bk{animation:none}}</style><path class="rbS" d="M10 3.4V1.8" stroke-width="1.3" stroke-linecap="round"/><circle class="gl ${isLive ? 'rbG' : 'rbF'}" cx="10" cy="1.5" r="1.3"/><rect class="rbF" x="0.9" y="6.6" width="2" height="4.6" rx="1"/><rect class="rbF" x="17.1" y="6.6" width="2" height="4.6" rx="1"/><rect class="rbP rbS" x="3.4" y="3.75" width="13.2" height="11.5" rx="3.2" stroke-width="1.5"/><g class="bk"><g class="ey"><rect class="rbA" x="6" y="7.3" width="2.4" height="2.6" rx="1"/><rect class="rbA" x="11.6" y="7.3" width="2.4" height="2.6" rx="1"/></g></g><path class="rbS" d="M7.2 12.4h5.6" fill="none" stroke-width="1.1" stroke-linecap="round" stroke-dasharray="1.1 1"/>${chipCount(n, 'rbT', isLive)}</svg>`
}

function termChip(n: number): string {
  const isLive = n > 0
  const theme = chipThemeCss(
    'tm',
    isLive
      ? { line: '#16a34a', plate: '#f0fdf4', text: '#16a34a', accent: '#16a34a' }
      : { line: '#9ca3af', plate: '#f3f4f6', text: '#22c55e', accent: '#9ca3af' },
    isLive
      ? { line: '#4ade80', plate: '#0b1f14', text: '#4ade80', accent: '#4ade80' }
      : { line: '#6b7280', plate: '#0b1f14', text: '#4ade80', accent: '#6b7280' },
  )

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${chipW(n)}" height="16" viewBox="0 0 ${chipW(n)} 16"><style>${theme}.cu{${isLive ? 'animation:cu 1s steps(1) infinite' : ''}}@keyframes cu{50%{opacity:0}}@media (prefers-reduced-motion: reduce){.cu{animation:none}}</style><rect class="tmP tmS" x="0.75" y="0.75" width="18.5" height="14.5" rx="3" stroke-width="1.5"/><path class="tmS" d="M0.75 4.6h18.5" stroke-width="1"/><circle cx="3.4" cy="2.7" r="0.8" fill="#f87171"/><circle cx="5.8" cy="2.7" r="0.8" fill="#fbbf24"/><circle cx="8.2" cy="2.7" r="0.8" fill="#4ade80"/><path class="tmS" d="M4 7.6l2.6 2.1L4 11.8" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><rect class="cu tmA" x="8.4" y="10.9" width="5" height="1.5" rx="0.6"/>${chipCount(n, 'tmT', isLive)}</svg>`
}

function termIcon(status: 'running' | 'done' | 'failed'): string {
  const mark =
    status === 'running'
      ? '<text x="5" y="13" font-family="ui-monospace,Menlo,monospace" font-size="12" font-weight="700" fill="#4ade80">&gt;</text><rect class="cur" x="14" y="12" width="7" height="2" fill="#4ade80"/>'
      : status === 'done'
        ? '<path d="M7 9.5l3.2 3.2L17 6.5" fill="none" stroke="#4ade80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
        : '<path d="M8 6l8 8M16 6l-8 8" fill="none" stroke="#f87171" stroke-width="2" stroke-linecap="round"/>'

  return `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="20" viewBox="0 0 28 20"><style>.cur{animation:cur 1s steps(1) infinite}@keyframes cur{50%{opacity:0}}@media (prefers-reduced-motion: reduce){.cur{animation:none}}</style><rect x="1" y="1" width="26" height="18" rx="4" fill="#0b1f14" stroke="#1f6f43" stroke-width="1"/>${mark}</svg>`
}


const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif"
const xml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const TXT_CSS = '.n{fill:#6b6b6b}.v{fill:#1f1f1f}@media (prefers-color-scheme: dark){.n{fill:#a0a0a0}.v{fill:#ececec}}'

// 16x16 line icons, drawn in the given colour.
const ICONS: Record<string, string> = {
  bars: '<path d="M3 13V8M8 13V3M13 13V6"/>',
  robot: '<rect x="3" y="5.5" width="10" height="8" rx="2.5"/><circle cx="6.3" cy="9.5" r="1" fill="CLR" stroke="none"/><circle cx="9.7" cy="9.5" r="1" fill="CLR" stroke="none"/><path d="M8 5.5V3M6.5 3h3"/>',
  terminal: '<rect x="1.5" y="3" width="13" height="10" rx="2.5"/><path d="M5 6.5l2 1.5-2 1.5M8.5 10.5H11"/>',
  coin: '<circle cx="8" cy="8" r="6"/><path d="M8 4.5v7M10 6.3c-.4-.6-1.2-1-2-1-1 0-2 .5-2 1.5S7 8 8 8s2 .5 2 1.5-1 1.5-2 1.5c-.9 0-1.6-.4-2-1"/>',
  chip: '<rect x="4" y="4" width="8" height="8" rx="1.5"/><path d="M6.5 1.5V4M9.5 1.5V4M6.5 12v2.5M9.5 12v2.5M1.5 6.5H4M1.5 9.5H4M12 6.5h2.5M12 9.5h2.5"/>',
  clock: '<circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.5 1.5"/>',
  // The rate limits: an hourglass for the 5-hour window, a calendar for the 7-day one.
  hourglass: '<path d="M4 2h8M4 14h8M5 2c0 3.5 6 3.5 6 6s-6 2.5-6 6M11 2c0 3.5-6 3.5-6 6s6 2.5 6 6"/>',
  calendar: '<rect x="2" y="3.5" width="12" height="10.5" rx="2"/><path d="M2 7h12M5.5 2v3M10.5 2v3"/><circle cx="8" cy="10.5" r="1" fill="CLR" stroke="none"/>',
}

const limitIcon = (kind: string) => (kind === 'five_hour' ? 'hourglass' : kind === 'seven_day' ? 'calendar' : 'clock')

const icon = (name: string, color: string, x: number, y: number, scale: number) =>
  `<g transform="translate(${x} ${y}) scale(${scale})" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${(ICONS[name] ?? '').replace(/CLR/g, color)}</g>`

const PULSE_CSS = '.pulse{animation:pulse 1.4s ease-in-out infinite;transform-origin:center;transform-box:fill-box}@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.7)}}.sheen{animation:sheen 3.2s ease-in-out infinite}@keyframes sheen{0%{transform:translateX(-120px)}60%,100%{transform:translateX(var(--w))}}@media (prefers-reduced-motion: reduce){.pulse,.sheen{animation:none}}'

function headerSvg(w: number, title: string, noteFull: string, color: string, iconName: string, isLive: boolean, noteShort?: string): string {
  const room = w - 28 - (36 + title.length * 10.4) - 10
  const fits = (t: string) => t.length * 6.6 <= room
  let note = fits(noteFull) ? noteFull : noteShort && fits(noteShort) ? noteShort : (noteShort ?? noteFull)
  if (!fits(note)) {
    const keep = Math.floor(room / 6.6) - 1
    note = keep >= 4 ? note.slice(0, keep) + '…' : ''
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="30" viewBox="0 0 ${w} 30"><style>${TXT_CSS}${PULSE_CSS}.sheen{--w:${w}px}</style>
<defs><clipPath id="hc"><rect x="0" y="0" width="${w}" height="30" rx="9"/></clipPath><linearGradient id="sh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${color}" stop-opacity="0"/><stop offset="0.5" stop-color="${color}" stop-opacity="0.28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
<rect x="0" y="0" width="${w}" height="30" rx="9" fill="${color}" fill-opacity="0.13"/>
${isLive ? '<g clip-path="url(#hc)"><rect class="sheen" x="0" y="0" width="120" height="30" fill="url(#sh)"/></g>' : ''}
<rect x="0" y="7" width="3.5" height="16" rx="1.75" fill="${color}"/>
${icon(iconName, color, 13, 6.5, 1.1)}
<text x="36" y="19.5" font-family="${FONT}" font-size="11.5" font-weight="700" letter-spacing="1.4" fill="${color}">${xml(title)}</text>
<text x="${w - 28}" y="19.5" text-anchor="end" class="n" font-family="${FONT}" font-size="12">${xml(note)}</text>
<circle class="${isLive ? 'pulse' : ''}" cx="${w - 14}" cy="15" r="3.4" fill="${isLive ? color : '#8a8a8a'}" ${isLive ? '' : 'fill-opacity="0.45"'}/></svg>`
}

// `h` 48 is the full tile; 40 the slimmer one stacked three high beside the context ring.
function statTile(w: number, label: string, value: string, color?: string, iconName?: string, tileH = 48): string {
  const lx = iconName ? 17 : 0
  const h = tileH
  const isSlim = h < 48

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><style>${TXT_CSS}</style>
${iconName ? icon(iconName, color ?? '#8a8a8a', 0, 2, 0.8) : ''}
<text x="${lx}" y="12.5" class="n" font-family="${FONT}" font-size="10.5" letter-spacing="0.6">${xml(label)}</text>
<text x="0" y="${isSlim ? 33 : 38}" font-family="${FONT}" font-size="${isSlim ? 19 : 22}" font-weight="700" ${color ? `fill="${color}"` : 'class="v"'}>${xml(value)}</text></svg>`
}

// A thin sliver under a running job: a light segment sweeps along the track.
function jobBar(w: number, status: 'running' | 'done' | 'failed'): string {
  const fill = status === 'failed' ? '#f87171' : '#4ade80'
  const body =
    status === 'running'
      ? `<rect x="0" y="0" width="${w}" height="4" rx="2" fill="#4ade80" fill-opacity="0.18"/><g clip-path="url(#jc)"><rect class="sweep" x="0" y="0" width="${Math.round(w * 0.28)}" height="4" rx="2" fill="${fill}"/></g>`
      : `<rect x="0" y="0" width="${w}" height="4" rx="2" fill="${fill}" fill-opacity="0.55"/>`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="4" viewBox="0 0 ${w} 4"><style>.sweep{animation:sw 1.6s ease-in-out infinite}@keyframes sw{0%{transform:translateX(-${Math.round(w * 0.28)}px)}100%{transform:translateX(${w}px)}}@media (prefers-reduced-motion: reduce){.sweep{animation:none}}</style><defs><clipPath id="jc"><rect x="0" y="0" width="${w}" height="4" rx="2"/></clipPath></defs>${body}</svg>`
}

// Three dots that bounce in turn: "working".
const TYPING_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="10" viewBox="0 0 22 10"><style>.d{animation:bn 1.1s ease-in-out infinite;fill:#a78bfa}.d2{animation-delay:.15s}.d3{animation-delay:.3s}@keyframes bn{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-2.5px);opacity:1}}@media (prefers-reduced-motion: reduce){.d{animation:none}}</style><circle class="d" cx="4" cy="6" r="2"/><circle class="d d2" cx="11" cy="6" r="2"/><circle class="d d3" cx="18" cy="6" r="2"/></svg>`

const dividerSvg = (w: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="1" viewBox="0 0 ${w} 1"><rect width="${w}" height="1" fill="#8a8a8a" fill-opacity="0.22"/></svg>`

function donutSvg(size: number, pct: number, color: string, sub: string): string {
  const r = size / 2 - 6
  const c = 2 * Math.PI * r
  const dash = (Math.min(100, Math.max(0, pct)) / 100) * c
  const m = size / 2

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><style>${TXT_CSS}</style>
<circle cx="${m}" cy="${m}" r="${r}" fill="${color}" fill-opacity="0.07" stroke="#8a8a8a" stroke-opacity="0.22" stroke-width="7"/>
${dash > 0 ? `<circle cx="${m}" cy="${m}" r="${r}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${m} ${m})"/>` : ''}
<text x="${m}" y="${m - 13}" text-anchor="middle" class="n" font-family="${FONT}" font-size="8.5" letter-spacing="0.8">CONTEXT</text>
<text x="${m}" y="${m + 7}" text-anchor="middle" font-family="${FONT}" font-size="21" font-weight="700" fill="${color}">${Math.round(pct)}%</text>
<text x="${m}" y="${m + 21}" text-anchor="middle" class="n" font-family="${FONT}" font-size="9.5">${xml(sub)}</text></svg>`
}

// The compact SESSION strip, one row high: the context ring first, then the other stats as icon,
// label and value, in priority order, each dropped whole when the width runs out.
type StripItem = { icon: string; label: string; value: string; color?: string; bars?: { pct: number; color: string }[] }
// `tail`, when given, is the last column, pinned right: the agents and background counts stacked.
type StripTail = { agents: string; agentsLive: boolean; tasks: string; tasksLive: boolean }
// The first `must` items outrank the tail: when it would push any of them out, it is dropped. The
// caller puts the costs and, on a subscription, the 5H and 7D limits first.
function stripSvg(w: number, ctx: { pct: number; value: string; color: string } | null, items: StripItem[], tail?: StripTail, must = 2): string {
  const H = 30
  const layout = (withTail: boolean) => {
    const parts: string[] = []
    let x = 0
    let room = w
    if (withTail && tail) {
      const tailW = 18 + Math.max(tail.agents.length, tail.tasks.length) * 6.6
      const tx = w - tailW
      const line = (y: number, name: string, color: string, text: string, isLive: boolean) => {
        parts.push(`<g opacity="${isLive ? 1 : 0.55}">${icon(name, color, tx, y, 0.72)}`)
        parts.push(`<text x="${tx + 16}" y="${y + 10}" font-family="${FONT}" font-size="11" font-weight="${isLive ? 700 : 400}" fill="${color}">${xml(text)}</text></g>`)
      }
      line(0.5, 'robot', '#a78bfa', tail.agents, tail.agentsLive)
      line(15.5, 'terminal', '#4ade80', tail.tasks, tail.tasksLive)
      room -= tailW + 12
    }
    const cell = (it: StripItem, ringPct?: number) => {
      const iw = ringPct === undefined ? 15 : 28
      const tw = Math.max(it.label.length * 6.1, it.value.length * 7.9)
      if (x + iw + 5 + tw > room) return false
      if (ringPct === undefined) {
        parts.push(icon(it.icon, it.color ?? '#8a8a8a', x, 7.5, 0.9))
      } else {
        const r = 11.5
        const c = 2 * Math.PI * r
        const dash = (Math.min(100, Math.max(0, ringPct)) / 100) * c
        parts.push(`<circle cx="${x + 14}" cy="15" r="${r}" fill="none" stroke="#8a8a8a" stroke-opacity="0.25" stroke-width="3.5"/>`)
        if (dash > 0) parts.push(`<circle cx="${x + 14}" cy="15" r="${r}" fill="none" stroke="${it.color}" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${x + 14} 15)"/>`)
        parts.push(icon(it.icon, it.color ?? '#8a8a8a', x + 8.6, 9.6, 0.68))
      }
      const tx = x + iw + 5
      parts.push(`<text x="${tx}" y="11" class="n" font-family="${FONT}" font-size="9" letter-spacing="0.6">${xml(it.label)}</text>`)
      parts.push(`<text x="${tx}" y="26" font-family="${FONT}" font-size="13" font-weight="700" ${it.color ? `fill="${it.color}"` : 'class="v"'}>${xml(it.value)}</text>`)
      x = tx + tw + 16
      return true
    }
    if (ctx) cell({ icon: 'chip', label: 'CONTEXT', value: ctx.value, color: ctx.color }, ctx.pct)
    let placed = 0
    for (const it of items) {
      if (!cell(it)) break
      placed++
    }
    return { parts, placed }
  }
  let { parts, placed } = layout(true)
  if (tail && placed < Math.min(must, items.length)) parts = layout(false).parts

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${H}" viewBox="0 0 ${w} ${H}"><style>${TXT_CSS}</style>${parts.join('')}</svg>`
}

// Each group is its own small SVG, so the pane's row can spread them across its real width: `w`, from
// the column count, is only a floor for deciding what fits.
function slimStripGroups(w: number, H: number, ctx: { pct: number; value: string; color: string } | null, allItems: StripItem[], tail: StripTail | undefined, mustAll: number): { svg: string; w: number }[] {
  const mid = H / 2
  // On a subscription the 5H and 7D limits fold into one cell: two thin bars, 5H's number above
  // and 7D's below, as narrow as a single stat.
  const hi = allItems.findIndex(it => it.icon === 'hourglass')
  const di = allItems.findIndex(it => it.icon === 'calendar')
  const pctOf = (it: StripItem) => parseFloat(it.value) || 0
  const items = hi < 0 || di < 0 ? allItems : allItems.flatMap((it, k) =>
    k === Math.min(hi, di) ? [{ icon: 'limits', label: '5H/7D', value: '', bars: [allItems[hi], allItems[di]].map(l => ({ pct: pctOf(l), color: l.color ?? '#8a8a8a' })) }] : k === hi || k === di ? [] : [it])
  const must = mustAll - (items.length < allItems.length ? 1 : 0)
  const base = mid + 4.3
  // No labels on one line, the icons say what each value is. Squeezed, the context drops its token
  // count, and the gaps between the groups close up, before a stat is dropped. LEVELS is that order.
  // Text width by glyph, the system font's bold at 12px: dots and spaces are narrow, % is wide.
  const textW = (t: string) => [...t].reduce((n, ch) => n + (ch === '.' || ch === ' ' || ch === '·' ? 3.4 : ch === '%' ? 10.2 : ch === '$' ? 7 : 7.1), 0)
  const LEVELS = [{ tokens: true, gap: 18 }, { tokens: true, gap: 12 }, { tokens: false, gap: 18 }, { tokens: false, gap: 12 }, { tokens: false, gap: 7 }]
  const layout = (withTail: boolean, lvl: number) => {
    const { tokens, gap } = LEVELS[lvl]
    const groups: { x0: number; w: number; parts: string[] }[] = []
    let parts: string[] = []
    const open = (x0: number) => { parts = []; groups.push({ x0, w: 0, parts }) }
    const close = (x1: number) => { const g = groups[groups.length - 1]; g.w = x1 - g.x0 }
    let tailGroup: { x0: number; w: number; parts: string[] } | null = null
    let x = 0
    let room = w
    if (withTail && tail) {
      // Only the running counts fit on one line: the robot and terminal side by side, pinned right.
      const a = tail.agents.split(' · ')[0]
      const t = tail.tasks.split(' · ')[0]
      const tailW = 13 + a.length * 7 + 8 + 13 + t.length * 7
      let tx = w - tailW
      open(tx)
      const pair = (name: string, color: string, text: string, isLive: boolean) => {
        parts.push(`<g opacity="${isLive ? 1 : 0.55}">${icon(name, color, tx, mid - 5.5, 0.68)}`)
        parts.push(`<text x="${tx + 13}" y="${base}" font-family="${FONT}" font-size="12" font-weight="${isLive ? 700 : 400}" fill="${color}">${xml(text)}</text></g>`)
        tx += 13 + text.length * 7 + 8
      }
      pair('robot', '#a78bfa', a, tail.agentsLive)
      pair('terminal', '#4ade80', t, tail.tasksLive)
      close(w)
      tailGroup = groups.pop() ?? null
      room -= tailW + 10
    }
    const cell = (it: StripItem, ringPct?: number) => {
      if (it.bars) {
        const bw = 26
        if (x + bw > room) return false
        open(x)
        const [top, bot] = it.bars
        const bar = (y: number, b: { pct: number; color: string }) =>
          `<rect x="${x}" y="${y}" width="${bw}" height="2.4" rx="1.2" fill="#8a8a8a" fill-opacity="0.3"/>` +
          (b.pct > 0 ? `<rect x="${x}" y="${y}" width="${((Math.min(100, b.pct) / 100) * bw).toFixed(1)}" height="2.4" rx="1.2" fill="${b.color}"/>` : '')
        const num = (y: number, b: { pct: number; color: string }) =>
          `<text x="${x + bw / 2}" y="${y}" text-anchor="middle" font-family="${FONT}" font-size="6.5" font-weight="700" fill="${b.color}">${Math.round(b.pct)}</text>`
        parts.push(num(mid - 3.6, top), bar(mid - 2.2, top), bar(mid + 0.8, bot), num(mid + 8.6, bot))
        close(x + bw)
        x += bw + gap
        return true
      }
      const iw = ringPct === undefined ? 11 : 13
      const vw = textW(it.value)
      if (x + iw + 3 + vw > room) return false
      open(x - 1)
      if (ringPct === undefined) {
        parts.push(icon(it.icon, it.color ?? '#8a8a8a', x, mid - 5.5, 0.68))
      } else {
        const r = Math.min(5.5, mid - 2)
        const c = 2 * Math.PI * r
        const dash = (Math.min(100, Math.max(0, ringPct)) / 100) * c
        parts.push(`<circle cx="${x + 6.5}" cy="${mid}" r="${r}" fill="none" stroke="#8a8a8a" stroke-opacity="0.25" stroke-width="2.4"/>`)
        if (dash > 0) parts.push(`<circle cx="${x + 6.5}" cy="${mid}" r="${r}" fill="none" stroke="${it.color}" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${x + 6.5} ${mid})"/>`)
      }
      const vx = x + iw + 3
      parts.push(`<text x="${vx}" y="${base}" font-family="${FONT}" font-size="12" font-weight="700" ${it.color ? `fill="${it.color}"` : 'class="v"'}>${xml(it.value)}</text>`)
      // The width estimate runs a little short on real glyphs; a group's own Svg would clip it.
      close(vx + vw * 1.12 + 3)
      x = vx + vw + gap
      return true
    }
    if (ctx) cell({ icon: 'chip', label: 'CONTEXT', value: tokens ? ctx.value : ctx.value.split(' · ')[0], color: ctx.color }, ctx.pct)
    let placed = 0
    for (const it of items) {
      if (!cell(it)) break
      placed++
    }
    return { groups: tailGroup ? [...groups, tailGroup] : groups, placed }
  }
  // The first layout that keeps every must-have stat; failing that, the one that keeps the most.
  const need = Math.min(must, items.length)
  let best = layout(false, LEVELS.length - 1)
  for (let lvl = 0; lvl < LEVELS.length; lvl++) {
    const tried = [tail ? layout(true, lvl) : null, layout(false, lvl)].find(o => o && o.placed >= need)
    if (tried) { best = tried; break }
  }
  return best.groups.map(g => {
    const gw = Math.ceil(g.w)
    return { w: gw, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${gw}" height="${H}" viewBox="${g.x0} 0 ${gw} ${H}"><style>${TXT_CSS}</style>${g.parts.join('')}</svg>` }
  })
}


// Status icon in the bar: a sleeping moon with floating z's (idle), a spinner (running), a check (done).
function statusIcon(state: 'idle' | 'running' | 'done'): string {
  const css =
    '<style>.spin{transform-origin:11px 11px;animation:spin .9s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}' +
    '.beat{transform-origin:11px 11px;animation:beat 1.2s ease-in-out infinite}@keyframes beat{50%{transform:scale(.6);opacity:.5}}' +
    '.z{opacity:0;animation:zz 2.4s ease-in-out infinite}.z2{animation-delay:.8s}.z3{animation-delay:1.6s}' +
    '@keyframes zz{0%{opacity:0;transform:translate(0,4px)}30%{opacity:1}100%{opacity:0;transform:translate(4px,-6px)}}' +
    '.tick{stroke-dasharray:18;stroke-dashoffset:18;animation:draw .5s ease-out forwards}@keyframes draw{to{stroke-dashoffset:0}}' +
    '@media (prefers-reduced-motion: reduce){.spin,.beat,.z,.tick{animation:none}.z{opacity:.7}.tick{stroke-dashoffset:0}}</style>'
  const body =
    state === 'running'
      ? '<circle cx="11" cy="11" r="7.5" fill="none" stroke="#8b78e0" stroke-opacity="0.25" stroke-width="2.4"/><g class="spin"><path d="M11 3.5a7.5 7.5 0 0 1 7.5 7.5" fill="none" stroke="#8b78e0" stroke-width="2.4" stroke-linecap="round"/></g><circle class="beat" cx="11" cy="11" r="2" fill="#8b78e0"/>'
      : state === 'done'
        ? '<circle cx="11" cy="11" r="8.5" fill="#4ade80" fill-opacity="0.18" stroke="#4ade80" stroke-width="1.6"/><path class="tick" d="M7 11.4l3 3 5-6" fill="none" stroke="#4ade80" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'
        : '<path d="M14.5 14.2a6.2 6.2 0 1 1-6.1-8.3 5 5 0 0 0 6.1 8.3z" fill="#9a8fd8" fill-opacity="0.85"/><text class="z" x="13" y="9" font-family="sans-serif" font-size="7" font-weight="700" fill="#9a8fd8">z</text><text class="z z2" x="15.5" y="6.5" font-family="sans-serif" font-size="6" font-weight="700" fill="#9a8fd8">z</text><text class="z z3" x="18" y="4.5" font-family="sans-serif" font-size="5" font-weight="700" fill="#9a8fd8">z</text>'

  return `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">${css}${body}</svg>`
}

const STALE_MS = 90000
const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

type Cfg = { maxAgents: number; ka: number; showCost: boolean }

async function draw($: any, e: any, cfg: Cfg, mode: 'band' | 'pane'): Promise<any> {
  const r = await read($, runA)
  const runningAgents = Object.values(await read($, agentsA)).filter(a => a.status === 'running')
  const runningTasks = Object.values(await read($, tasksA)).filter(t => t.status === 'running')
  const busy = runningAgents.length > 0 || runningTasks.length > 0
  const now: number = await $.clock.now()
  const isStale = r.active && !busy && (now - r.lastActivity > STALE_MS || (mode === 'band' && e.props.isWorking === false))
  const isRunning = r.active && !isStale
  const isLive = isRunning || r.showDone || busy
  const table: any = $.ui.resolve(e)
  const { Box, Text, Button } = table
  // `resolve` completes every table, so the terminal's has an `Svg` too, but one that draws an empty
  // fragment: only the remote surfaces draw SVG, so the terminal takes the text fallbacks.
  const hasSvg = Boolean(table.Svg) && e.surface !== 'terminal'
  const tick = await read($, tickA)
  const sprites = { ...BUILTIN, ...(await read($, spritesA)) }
  const cols: number = e.props.bodyColumns
  // The bar takes the whole row; what is left over holds the status, the time and the two counters.
  const barW = Math.max(14, cols - 30)

  // The band draws on wider cells than the panel does (measured: about 9.7 CSS px per column
  // there, 8 in the panel), so each converts its column count to pixels on its own scale.
  const pxCol = mode === 'band' ? 9 : 8
  // The estimate drifts with the window, so the band's bar is also capped: it may leave some room
  // on a very wide window, but it can never push the counters out of the row.
  const maxPx = mode === 'band' ? 1040 : 100000
  const px = (cells: number) => Math.round(Math.min(cells * pxCol, maxPx))
  // The band's bar takes the row less what stands beside it in px: the status icon (22), the percent
  // and timer (about 95) and the two counter chips (about 80), the gaps between them and a margin.
  // Fitted on two desktop screenshots (62 and 96 columns): the band's row grows about 7.85px per
  // column, so the bar is 7.85 * cols less 160px for what stands beside it. The old 9.6px slope
  // ran wide as the window grew and pushed the counters out of the row; erring short is safe,
  // since the spacer before the chips takes up the slack. Counts of more digits widen their chip.
  const chipExtra = chipW(runningAgents.length) + chipW(runningTasks.length) - 2 * chipW(0)
  const bandBarPx = Math.round(Math.max(120, Math.min(1400, cols * 7.85 - 160 - chipExtra)))
  const barEl = (width: number, from: number, to: number, hasCrab: boolean, live: boolean, pxW = px(width)) =>
    hasSvg ? (
      <table.Svg
        source={dotBar(pxW, to, hasCrab, live)}
        alt={`progress ${Math.round(to * 100)}%`}
        width={pxW}
        height={hasCrab ? 24 : 12}
      />
    ) : (
      <Box flexDirection="row">{bar(Text, width, to, tick, live)}</Box>
    )
  const statusEl = (state: 'idle' | 'running' | 'done') =>
    hasSvg ? (
      <table.Svg source={statusIcon(state)} alt={state} width={22} height={22} />
    ) : (
      <Text color="#2dd4bf" bold>{state === 'done' ? '✓' : state === 'running' ? SPIN[tick % SPIN.length] : '◇'}</Text>
    )
  // The two counters, pinned to the band's right edge by a spacer. On the desktop each is a small
  // drawn chip, a robot head for sub-agents and a terminal window for jobs: `>_` in text read as a face.
  const chips = (
    <Box flexDirection="row" gap={1} alignItems="center" flexShrink={0}>
      {hasSvg ? (
        <Box flexShrink={0}><table.Svg source={robotChip(runningAgents.length)} alt={`sub-agents ${runningAgents.length}`} width={chipW(runningAgents.length)} height={16} /></Box>
      ) : (
        <Box flexShrink={0}><Text color="#d97757" dimColor={runningAgents.length === 0}>{`🤖 ${runningAgents.length}`}</Text></Box>
      )}
      {hasSvg ? (
        <Box flexShrink={0}><table.Svg source={termChip(runningTasks.length)} alt={`background jobs ${runningTasks.length}`} width={chipW(runningTasks.length)} height={16} /></Box>
      ) : (
        <Box flexShrink={0}><Text color="#4ade80" dimColor={runningTasks.length === 0}>{`>_ ${runningTasks.length}`}</Text></Box>
      )}
    </Box>
  )
  const spacer = <Box flexGrow={1} flexShrink={1} minWidth={0} />
  if (mode === 'band' && !isLive) {
    return (
      <Box flexDirection="row" gap={1} alignItems="center">
        <Box flexShrink={0}>{statusEl('idle')}</Box>
        <Box flexShrink={0}>{barEl(barW, 0, 0, true, false, mode === 'band' ? bandBarPx : px(barW))}</Box>
        <Box flexShrink={0}><Text dimColor>idle</Text></Box>
        {spacer}
        {chips}
      </Box>
    )
  }
  const done = !isRunning && r.target >= 1
  const pct = Math.round(r.shown * 100)
  const est = ''
  const endAt = isRunning ? now : r.active ? r.lastActivity : r.endedAt
  const elapsed = r.startedAt > 0 ? clock(Math.max(0, endAt - r.startedAt)) : '0:00'
  const header = (
    <Box flexDirection="row" gap={1} alignItems="center">
      <Box flexShrink={0}>{statusEl(done ? 'done' : isRunning ? 'running' : 'idle')}</Box>
      <Box flexShrink={0}>{barEl(barW, r.from, r.shown, true, isRunning, mode === 'band' ? bandBarPx : px(barW))}</Box>
      <Box flexShrink={0}><Text bold={done} color={done ? '#4ade80' : undefined}>{done ? 'done' : `${pct}%${est}`}</Text></Box>
      <Box flexShrink={0}><Text dimColor>{elapsed}</Text></Box>
      {mode === 'band' && spacer}
      {mode === 'band' && chips}
    </Box>
  )
  if (mode === 'band') return header

  const rank = (st: string) => (st === 'running' ? 0 : 1)
  const allAgents = Object.values(await read($, agentsA)).sort((x, y) => rank(x.status) - rank(y.status) || y.startedAt - x.startedAt)
  const view = await read($, viewA)
  const liveAgents = allAgents.filter(a => a.status === 'running')
  const doneAgents = allAgents.filter(a => a.status !== 'running')
  const shownAgents = liveAgents.slice(0, Math.max(1, cfg.maxAgents))
  const hidden = liveAgents.length - shownAgents.length
  const allTasks = Object.values(await read($, tasksA)).sort((x, y) => rank(x.status) - rank(y.status) || y.startedAt - x.startedAt)
  const liveTasks = allTasks.filter(t => t.status === 'running')
  const doneTasks = allTasks.filter(t => t.status !== 'running')
  const doneAgentCost = doneAgents.reduce((sum, a) => sum + (costOf(a) ?? 0), 0)
  const costs = allAgents.map(costOf)
  const agentCost = costs.some(c => c !== null) ? costs.reduce<number>((sum, c) => sum + (c ?? 0), 0) : null
  const agentTokens = allAgents.reduce((sum, a) => sum + a.input + a.output + a.cacheRead + a.cacheWrite, 0)

  let usage: any = null
  let turns = 0
  try {
    usage = await $.session.usage()
    turns = await $.session.turns()
  } catch {
    usage = null
  }
  const sessionCost: number | null = usage?.cost?.usd ?? null
  const ctxTokens: number = usage?.context?.tokens ?? 0
  const ctxWindow: number = usage?.context?.window ?? 0
  const ctxPct: number = usage?.context?.percent ?? (ctxWindow > 0 ? Math.round((ctxTokens / ctxWindow) * 100) : 0)
  const upMs: number = usage ? now - usage.startedAt : 0
  const limits = (usage?.rateLimits ?? []) as { kind: string; percentUsed: number }[]
  const pctColor = (v: number) => (v >= 80 ? '#f87171' : v >= 60 ? '#fbbf24' : '#4ade80')
  // Context by its size: green under 250k tokens, yellow to 350k, red past it. A small window (an
  // agent on 200k) never gets that far, so it also turns by its share, whichever is worse.
  const ctxColor = (tokens: number, pct: number) => {
    const rank = (c: string) => ['#4ade80', '#fbbf24', '#f87171'].indexOf(c)
    const bySize = tokens >= 350000 ? '#f87171' : tokens >= 250000 ? '#fbbf24' : '#4ade80'
    const byShare = pctColor(pct)
    return rank(bySize) >= rank(byShare) ? bySize : byShare
  }

  const title = (text: string, note: string, color: string) => (
    <Box flexDirection="row" gap={1} alignItems="center">
      <Text bold color={color}>{text}</Text>
      <Text dimColor>{note}</Text>
    </Box>
  )
  const stat = (label: string, value: string, color?: string) => (
    <Box flexDirection="column" flexShrink={0}>
      <Text dimColor>{label}</Text>
      <Text bold {...(color ? { color } : {})}>{value}</Text>
    </Box>
  )
  const card = { borderStyle: 'round', borderColor: 'inactive', paddingX: 1, paddingY: 1 }
  // The card's inner width in px. Measured on the desktop pane: about 9px per column (8 left the
  // card headers some 58px short of the card's right edge).
  const innerW = Math.max(160, (cols - 2) * 9)
  // innerW leans wide so stretched strips reach the card's edge; rows of fixed-width tiles that
  // wrap are sized from the lean estimate instead, or two tiles that would fit drop to two rows.
  const fitW = Math.max(160, (cols - 2) * 8)
  const hdr = (name: string, note: string, color: string, iconName: string, live: boolean, noteShort?: string) =>
    hasSvg ? <table.Svg source={headerSvg(innerW, name, note, color, iconName, live, noteShort)} alt={`${name}: ${note}`} width={innerW} height={30} /> : title(name, note, color)
  const tile = (label: string, value: string, color: string | undefined, iconName: string, w: number, tileH = 48) =>
    hasSvg ? <table.Svg source={statTile(w, label, value, color, iconName, tileH)} alt={`${label}: ${value}`} width={w} height={tileH} /> : <Box width={termTileW}>{stat(label, value, color)}</Box>

  const turnCost = isRunning ? (r.costAtStart >= 0 && sessionCost !== null ? Math.max(0, sessionCost - r.costAtStart) : -1) : r.lastTurnCost
  // On the desktop the context ring leads the card, so CONTEXT drops out of the tiles. Narrow, the
  // three costs (session, turn, agents) stack beside the ring in slim tiles, 3 x 40px = the ring's
  // 120px, and the limits go below; wide, every tile stands in one row beside it.
  const RING = innerW < 460 ? 120 : 96
  const SIDE = 3
  const SLIM = 40
  const hasRing = hasSvg && ctxWindow > 0
  const tiles: [string, string, string | undefined, string][] = [
    ['SESSION', sessionCost === null ? '—' : realMoney(sessionCost), '#fbbf24', 'coin'],
    ['TURN', turnCost < 0 ? '—' : realMoney(turnCost), turnCost < 0 ? undefined : '#fbbf24', 'clock'],
    ['AGENTS', allAgents.length === 0 ? '—' : money(agentCost), allAgents.length === 0 ? undefined : '#fbbf24', 'robot'],
    ...(hasRing ? [] : [['CONTEXT', ctxWindow > 0 ? (innerW < 460 ? `${ctxPct}% · ${tfmt(ctxTokens)}` : `${tfmt(ctxTokens)} / ${tfmt(ctxWindow)}`) : '—', ctxWindow > 0 ? ctxColor(ctxTokens, ctxPct) : undefined, 'chip'] as [string, string, string | undefined, string]]),
    ...limits.map((l): [string, string, string | undefined, string] => [l.kind === 'five_hour' ? '5H LIMIT' : l.kind === 'seven_day' ? '7D LIMIT' : l.kind.toUpperCase(), `${Math.round(l.percentUsed)}%`, pctColor(l.percentUsed), limitIcon(l.kind)]),
  ]
  const isNarrow = innerW < 460
  // The terminal's text tiles: two or three to a row, in cells (the card's border and padding take 4).
  const termTileW = Math.max(14, Math.floor((cols - 4) / (cols >= 66 ? 3 : 2)) - 1)
  const perRow = isNarrow ? 2 : Math.min(tiles.length, 4)
  const tileW = isNarrow ? Math.max(90, Math.floor((fitW - 12) / 2) - 4) : Math.max(100, Math.floor((fitW - (hasRing ? RING + 30 : 0)) / perRow) - 8)
  // Narrow with a ring, the limits (up to three) stand in a second slim column beside the costs
  // when both columns fit, about 90px each; otherwise they fall below the ring.
  const extraTiles = tiles.length - SIDE
  const sideRoom = fitW - RING - 24
  const twoCol = extraTiles > 0 && extraTiles <= SIDE && sideRoom >= 196
  const sideW = twoCol ? Math.floor((sideRoom - 8) / 2) : Math.max(90, innerW - RING - 24)
  const belowRows = twoCol ? 0 : Math.ceil(Math.max(0, extraTiles) / 2)

  // Three views, the largest that fits the pane's height without scrolling:
  //   full    the cards as they are;
  //   middle  SESSION folds into one strip led by the context ring, then one summary row for the
  //           agents and background jobs and one row per item, as many as fit, then "+N more";
  //   ultra   that strip alone, its last column the agents and background counts stacked.
  // Heights are estimated in the pane's rows. On the desktop a row is about 19.5 CSS px (the pane's
  // text line), and the SVG parts are sized in px, so `u(px, rows)` gives each part's height in rows
  // on either surface. Measured on the desktop: a card's border, padding, header and gap take about
  // 59px, the gap between cards 10px, an agent row with its mascot about 88px, a job row 34px.
  const bodyRows: number = e.props.scroll?.bodyRows ?? 0
  const ROW_PX = 19.5
  const u = (pxH: number, rowsH: number) => (hasSvg ? pxH / ROW_PX : rowsH)
  const termPerRow = cols >= 66 ? 3 : 2
  const tileRows = Math.ceil(tiles.length / (hasSvg ? perRow : termPerRow))
  const agentItems = shownAgents.length + (view.agents ? doneAgents.length : 0)
  const taskItems = liveTasks.length + (view.tasks ? doneTasks.length : 0)
  const fullNeed =
    u(60 + (hasRing ? (isNarrow ? RING + 8 + belowRows * 48 : Math.max(RING, tileRows * 48)) : tileRows * 48), 6 + tileRows * 2) +
    u(59 + (allAgents.length === 0 ? 39 : agentItems * 88) + (doneAgents.length > 0 ? 30 : 0) + (hidden > 0 ? 20 : 0), 6 + (allAgents.length === 0 ? 2 : agentItems * 5) + (doneAgents.length > 0 ? 2 : 0) + (hidden > 0 ? 1 : 0)) +
    u(59 + (allTasks.length === 0 ? 39 : taskItems * 34) + (doneTasks.length > 0 ? 30 : 0), 6 + (allTasks.length === 0 ? 2 : taskItems * 2) + (doneTasks.length > 0 ? 2 : 0)) +
    u(20, 2)
  const stripH = u(30, 1)
  const gapH = u(10, 1)
  const lineH = u(ROW_PX, 1)
  // The summary row may wrap to two lines on a thin pane.
  const summaryH = lineH * (cols < 52 ? 2 : 1)
  const middleMin = stripH + gapH + summaryH + lineH
  const tier: 'full' | 'middle' | 'ultra' = bodyRows <= 0 || bodyRows >= fullNeed ? 'full' : bodyRows >= middleMin ? 'middle' : 'ultra'

  if (tier !== 'full') {
    const strip: StripItem[] = [
      { icon: 'coin', label: 'SESSION', value: sessionCost === null ? '—' : realMoney(sessionCost), color: '#fbbf24' },
      { icon: 'clock', label: 'TURN', value: turnCost < 0 ? '—' : realMoney(turnCost), color: turnCost < 0 ? undefined : '#fbbf24' },
      ...limits.map((l): StripItem => ({ icon: limitIcon(l.kind), label: l.kind === 'five_hour' ? '5H' : l.kind === 'seven_day' ? '7D' : l.kind.toUpperCase(), value: `${Math.round(l.percentUsed)}%`, color: pctColor(l.percentUsed) })),
      { icon: 'bars', label: usage ? `${turns} TURN${turns === 1 ? '' : 'S'}` : 'TURNS', value: usage ? clockLong(upMs) : '—', color: '#d97757' },
      ...(allAgents.length > 0 ? [{ icon: 'robot', label: 'AGENTS', value: money(agentCost), color: '#a78bfa' }] : []),
    ]
    const ctxVal = `${ctxPct}% · ${tfmt(ctxTokens)}`
    const isUltra = tier === 'ultra'
    // At its smallest the pane shows two text lines at most, with its own padding eating into them:
    // the two-line strip clips, so it goes slim, one line high.
    const stripPx = isUltra && bodyRows <= 2 ? 18 : 30
    const tail: StripTail | undefined = isUltra
      ? { agents: `${runningAgents.length} · ${doneAgents.length} done`, agentsLive: runningAgents.length > 0, tasks: `${runningTasks.length} · ${doneTasks.length} done`, tasksLive: runningTasks.length > 0 }
      : undefined
    const ctxCell = ctxWindow > 0 ? { pct: ctxPct, value: ctxVal, color: ctxColor(ctxTokens, ctxPct) } : null
    // Under 30px high (the pane at its smallest) the strip goes slim: one line of icons and values,
    // its groups spread evenly across the pane.
    const sessionRow = hasSvg && stripPx < 30 ? (
      <Box flexDirection="row" justifyContent="space-between" alignItems="center">
        {slimStripGroups(innerW, stripPx, ctxCell, strip, tail, 2 + limits.length).map((g, k) => (
          <table.Svg source={g.svg} alt={k === 0 ? `context ${ctxVal}` : 'stat'} width={g.w} height={stripPx} />
        ))}
      </Box>
    ) : hasSvg ? (
      <table.Svg source={stripSvg(innerW, ctxCell, strip, tail, 2 + limits.length)} alt={`context ${ctxVal}`} width={innerW} height={30} />
    ) : (
      <Text wrap="truncate-end">
        {ctxWindow > 0 && <Text color={ctxColor(ctxTokens, ctxPct)} bold>{`${['○', '◔', '◑', '◕', '●'][Math.round(Math.min(100, ctxPct) / 25)]} ${ctxVal}`}</Text>}
        {isUltra && <Text color="#a78bfa">{`  🤖 ${runningAgents.length}`}</Text>}
        {isUltra && <Text color="#4ade80">{`  >_ ${runningTasks.length}`}</Text>}
        {strip.map(s => <Text color={s.color}>{`  ${s.value}`}<Text dimColor>{` ${s.label.toLowerCase()}`}</Text></Text>)}
      </Text>
    )
    if (isUltra) return sessionRow

    const agentRow = (a: AgentRow) => {
      const isRun = a.status === 'running'
      const p = Math.round(Math.min(0.95, 1 - Math.exp(-a.steps / cfg.ka)) * 100)
      return (
        <Box flexDirection="row" gap={1}>
          <Box flexShrink={0}><Text color={a.status === 'failed' ? '#f87171' : '#a78bfa'}>{isRun ? SPIN[tick % SPIN.length] : a.status === 'failed' ? '✗' : '✓'}</Text></Box>
          <Box flexShrink={1} minWidth={0}><Text bold={isRun} dimColor={!isRun} wrap="truncate-end">{a.label}</Text></Box>
          <Box flexShrink={0}><Text dimColor={!isRun}>{isRun ? `${p}%` : clock(a.endedAt - a.startedAt)}</Text></Box>
          {isRun && <Box flexShrink={1} flexGrow={1} minWidth={0}><Text dimColor wrap="truncate-end">{a.activity}</Text></Box>}
        </Box>
      )
    }
    const taskRow = (t: TaskRow) => (
      <Box flexDirection="row" gap={1}>
        <Box flexShrink={0}><Text color={t.status === 'failed' ? '#f87171' : '#4ade80'}>{t.status === 'running' ? '>_' : t.status === 'done' ? '✓' : '✗'}</Text></Box>
        <Box flexShrink={1} flexGrow={1} minWidth={0}><Text dimColor={t.status !== 'running'} wrap="truncate-end">{t.label.replace(/\s+/g, ' ')}</Text></Box>
        <Box flexShrink={0}><Text dimColor>{clock((t.endedAt || now) - t.startedAt)}</Text></Box>
      </Box>
    )
    const summary = (
      <Box flexDirection="row" flexWrap="wrap" columnGap={3} rowGap={0}>
        <Box flexShrink={0} flexDirection="row" gap={1}>
          <Text bold color="#a78bfa">🤖 AGENTS</Text>
          <Text dimColor>{`${runningAgents.length} running · ${doneAgents.length} done`}</Text>
        </Box>
        <Box flexShrink={0} flexDirection="row" gap={1}>
          <Text bold color="#4ade80">{'>_ BACKGROUND'}</Text>
          <Text dimColor>{`${runningTasks.length} running · ${doneTasks.length} done`}</Text>
        </Box>
      </Box>
    )
    // Running agents and jobs first, then the recently finished, as many rows as are left.
    const rows = [...liveAgents.map(agentRow), ...liveTasks.map(taskRow), ...doneAgents.map(agentRow), ...doneTasks.map(taskRow)]
    const room = Math.max(1, Math.floor((bodyRows - stripH - gapH - summaryH) / lineH))
    const fits = rows.length <= room ? rows : rows.slice(0, room - 1)
    return (
      <Box flexDirection="column" gap={1}>
        {sessionRow}
        <Box flexDirection="column">
          {summary}
          {fits}
          {fits.length < rows.length && <Text dimColor>{`+${rows.length - fits.length} more`}</Text>}
        </Box>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column" gap={1} {...card}>
        {hdr('SESSION', usage ? `${turns} turn${turns === 1 ? '' : 's'} · up ${clockLong(upMs)}` : 'stats unavailable', '#d97757', 'bars', isRunning || busy, usage ? `up ${clockLong(upMs)}` : undefined)}
        {hasRing && isNarrow ? (
          <Box flexDirection="column" gap={1}>
            <Box flexDirection="row" gap={2} alignItems="center">
              <Box flexShrink={0}><table.Svg source={donutSvg(RING, ctxPct, ctxColor(ctxTokens, ctxPct), `${tfmt(ctxTokens)} / ${tfmt(ctxWindow)}`)} alt={`context ${ctxPct}%`} width={RING} height={RING} /></Box>
              <Box flexDirection="column">{tiles.slice(0, SIDE).map(x => tile(x[0], x[1], x[2], x[3], sideW, SLIM))}</Box>
              {twoCol && <Box flexDirection="column" alignSelf="flex-start">{tiles.slice(SIDE).map(x => tile(x[0], x[1], x[2], x[3], sideW, SLIM))}</Box>}
            </Box>
            {tiles.length > SIDE && !twoCol && (
              <Box flexDirection="row" flexWrap="wrap" columnGap={1} rowGap={0}>
                {tiles.slice(SIDE).map(x => tile(x[0], x[1], x[2], x[3], tileW))}
              </Box>
            )}
          </Box>
        ) : (
          <Box flexDirection="row" gap={2} alignItems="center">
            {hasRing && (
              <Box flexShrink={0}><table.Svg source={donutSvg(RING, ctxPct, ctxColor(ctxTokens, ctxPct), `${tfmt(ctxTokens)} / ${tfmt(ctxWindow)}`)} alt={`context ${ctxPct}%`} width={RING} height={RING} /></Box>
            )}
            <Box flexDirection="row" flexWrap="wrap" columnGap={1} rowGap={0} flexGrow={1}>
              {tiles.map(x => tile(x[0], x[1], x[2], x[3], tileW))}
            </Box>
          </Box>
        )}
      </Box>

      <Box flexDirection="column" gap={1} {...card}>
        {hdr('AGENTS', `${runningAgents.length} running · ${doneAgents.length} done${cfg.showCost && allAgents.length > 0 ? ' · ' + money(agentCost) : ''}`, '#a78bfa', 'robot', runningAgents.length > 0, `${runningAgents.length} running`)}
        {allAgents.length === 0 && <Text color="#8a8a8a" italic>No sub-agents yet. They show up here as Claude spawns them.</Text>}
        {[...shownAgents, ...(view.agents ? doneAgents : [])].map((a, idx) => {
          const isRun = a.status === 'running'
          const sp = sprites[a.sprite] ?? BUILTIN.crab!
          const frame = Math.floor((tick + a.startedAt) / 4) % sp.frames.length
          const p = isRun ? Math.min(0.95, 1 - Math.exp(-a.steps / cfg.ka)) : 1
          // About 50px wide whatever the grid: the 14-wide built-ins at 3.6px, an 8-wide custom one at 6.
          const u = Math.min(6, 50 / sp.frames[0]![0]!.length)
          const spriteW = Math.round(sp.frames[0]![0]!.length * u)
          const spriteH = Math.round(sp.frames[0]!.length * u) + 2
          const cmax = ctxMaxOf(a.model)
          const cpct = Math.round((a.ctx / cmax) * 100)
          return (
            <Box flexDirection="column" gap={1}>
              {idx > 0 && hasSvg && <table.Svg source={dividerSvg(innerW)} alt="" width={innerW} height={1} />}
            <Box flexDirection="row" gap={1} alignItems="center">
              <Box flexShrink={0} width={hasSvg ? Math.ceil(spriteW / 8) + 1 : sp.frames[0]![0]!.length + 1}>
                {hasSvg ? (
                  <table.Svg source={spriteSvg(sp, u, isRun, a.variant ?? 0, a.id)} alt={`${a.sprite} mascot`} width={spriteW} height={spriteH} />
                ) : (
                  <Box flexDirection="column">{spriteRows(Box, Text, sp, frame, !isRun, a.variant ?? 0)}</Box>
                )}
              </Box>
              <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
                <Box flexDirection="row" gap={1}>
                  <Box flexShrink={1} minWidth={0}>
                    <Text bold dimColor={!isRun} wrap="truncate-end">{`${isRun ? '' : a.status === 'failed' ? '✗ ' : '✓ '}${a.label}`}</Text>
                  </Box>
                  <Box flexShrink={0}><Text color="#a78bfa">{a.model}</Text></Box>
                </Box>
                <Box flexDirection="row" gap={1} alignItems="center">
                  <Box flexShrink={0}>{barEl(Math.max(10, cols - (hasSvg ? 28 : 20 + sp.frames[0]![0]!.length)), p, p, false, isRun)}</Box>
                  <Box flexShrink={0}><Text bold={isRun}>{isRun ? `${Math.round(p * 100)}%` : 'done'}</Text></Box>
                </Box>
                <Box flexDirection="row" gap={1} alignItems="center">
                  <Box flexShrink={1} minWidth={0}><Text dimColor wrap="truncate-end">{isRun ? a.activity : a.type}</Text></Box>
                  {isRun && hasSvg && <Box flexShrink={0}><table.Svg source={TYPING_SVG} alt="working" width={22} height={10} /></Box>}
                </Box>
                <Box flexDirection="row" flexWrap="wrap" columnGap={2} rowGap={0}>
                  <Box flexShrink={0}><Text dimColor>{`${a.tools} tools · ${clock((a.endedAt || now) - a.startedAt)}`}</Text></Box>
                  <Box flexShrink={0}><Text color={a.ctx > 0 ? ctxColor(a.ctx, cpct) : undefined} dimColor={a.ctx === 0}>{`ctx ${tfmt(a.ctx)} / ${tfmt(cmax)} · ${cpct}%`}</Text></Box>
                  {cfg.showCost && <Box flexShrink={0}><Text color="#fbbf24">{`${tfmt(a.input + a.output + a.cacheRead + a.cacheWrite)} tok · ${money(costOf(a))}`}</Text></Box>}
                </Box>
              </Box>
            </Box>
            </Box>
          )
        })}
        {hidden > 0 && <Text dimColor>{`+${hidden} more running agent(s)`}</Text>}
        {doneAgents.length > 0 && (
          <Box flexDirection="row" gap={1} alignItems="center">
            <Button key="agents-toggle" label={`${view.agents ? '⊘ Hide' : '👁 Show'} completed (${doneAgents.length})`} dimColor onPress={() => toggleView($, 'agents')} />
            {cfg.showCost && <Text color="#fbbf24">{money(doneAgentCost)}</Text>}
          </Box>
        )}
      </Box>

      <Box flexDirection="column" gap={1} {...card}>
        {hdr('BACKGROUND', `${runningTasks.length} running`, '#4ade80', 'terminal', runningTasks.length > 0)}
        {allTasks.length === 0 && <Text color="#8a8a8a" italic>No background jobs. Commands started with run_in_background show up here.</Text>}
        {[...liveTasks, ...(view.tasks ? doneTasks : [])].map(t => {
          const isRun = t.status === 'running'
          const barW = Math.max(80, innerW - 130)
          return (
            <Box flexDirection="row" gap={1} alignItems="center">
              <Box flexShrink={0} width={4}>
                {hasSvg ? (
                  <table.Svg source={termIcon(t.status)} alt={`${t.status} job`} width={28} height={20} />
                ) : (
                  <Text color="#4ade80">{t.status === 'running' ? '>_' : t.status === 'done' ? '✓' : '✗'}</Text>
                )}
              </Box>
              <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
                <Text dimColor={!isRun} wrap="truncate-end">{t.label.replace(/\s+/g, ' ')}</Text>
                {hasSvg && <table.Svg source={jobBar(barW, t.status)} alt="" width={barW} height={4} />}
              </Box>
              <Box flexShrink={0}><Text dimColor>{clock((t.endedAt || now) - t.startedAt)}</Text></Box>
            </Box>
          )
        })}
        {doneTasks.length > 0 && (
          <Button key="tasks-toggle" label={`${view.tasks ? '⊘ Hide' : '👁 Show'} completed (${doneTasks.length})`} dimColor onPress={() => toggleView($, 'tasks')} />
        )}
      </Box>
    </Box>
  )
}

export const register: Register = (on, options) => {
  const maxAgents = Math.round(num(options.maxAgents, 2))
  const k = num(options.estimateSteps, 10)
  const ka = num(options.agentEstimateSteps, 6)
  const showCost = options.showCost !== false
  const mapText = str(options.mascotMap)
  const fallback = str(options.defaultMascot)
  const spritesFile = str(options.spritesFile)

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'cool-progress',
      description: 'Toggle the Cool Progress panel (sub-agents and background tasks); the progress bar stays above the prompt',
    })
    await loadSprites($, spritesFile)
    void $.ui.open({ id: PANE, title: 'Cool Progress' })
    $.clock.every(1000, async () => {
      const [r, ag, tk] = [await read($, runA), await read($, agentsA), await read($, tasksA)]
      const busy = Object.values(ag).some(a => a.status === 'running') || Object.values(tk).some(t => t.status === 'running')
      const at: number = await $.clock.now()
      if (r.active && !busy && at - r.lastActivity > STALE_MS) {
        await update($, runA, x => ({ ...x, active: false, endedAt: x.lastActivity }))
        return
      }
      if (!(r.active || r.showDone || busy)) return
      await update($, tickA, n => n + 1)
    })

    return next(e)
  })

  on('command.run', { command: 'cool-progress' }, async $ => {
    const isUp = (await $.ui.panes()).some(pane => pane.id === PANE)
    if (isUp) {
      await $.ui.close({ id: PANE })
      await update($, enabledA, () => false)

      return { text: 'Cool Progress closed.' }
    }
    await update($, enabledA, () => true)
    await $.ui.open({ id: PANE, title: 'Cool Progress' })

    return { text: 'Cool Progress opened.' }
  })

  on('turn.start', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, agentsA, all => keepRecent(all))
    await update($, tasksA, all => keepRecent(all))
    const c0 = await sessionCost($)
    await update($, runA, r => ({ ...run0, active: true, startedAt: now, lastActivity: now, costAtStart: c0, lastTurnCost: r.lastTurnCost }))

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId) {
      const doneAt: number = await $.clock.now()
      await patchAgent($, e.agentId, a => ({ ...a, status: e.reason === 'error' ? 'failed' : 'done', endedAt: a.endedAt || doneAt }))
    } else {
      const endedNow: number = await $.clock.now()
      const c1 = await sessionCost($)
      await update($, runA, r => ({
        ...r,
        active: false,
        showDone: true,
        target: 1,
        from: 1,
        shown: 1,
        endedAt: endedNow,
        lastTurnCost: r.costAtStart >= 0 && c1 >= 0 ? Math.max(0, c1 - r.costAtStart) : r.lastTurnCost,
      }))
      $.clock.after(1200, () => {
        void update($, runA, r => (r.from === r.shown ? r : { ...r, from: r.shown }))
      })
      $.clock.after(6000, () => {
        void update($, runA, r => (r.active ? r : { ...r, showDone: false }))
      })
    }

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const u = result.usage
    if (e.agentId) {
      await patchAgent($, e.agentId, a => ({
        ...a,
        steps: a.steps + 1,
        input: a.input + (u?.input_tokens ?? 0),
        output: a.output + (u?.output_tokens ?? 0),
        cacheRead: a.cacheRead + (u?.cache_read_input_tokens ?? 0),
        cacheWrite: a.cacheWrite + (u?.cache_creation_input_tokens ?? 0),
        ctx: u ? u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens : a.ctx,
        model: u?.model ? u.model : a.model,
      }))
    } else {
      const stepNow = await $.clock.now()
      const stepCost = await sessionCost($)
      await update($, runA, r => (r.active ? r : { ...run0, active: true, startedAt: stepNow, lastActivity: stepNow, costAtStart: stepCost, lastTurnCost: r.lastTurnCost }))
      await patchRun($, k, { steps: e.index + 1 })
    }

    return result
  })

  on('agent.spawn', async ($, e, next) => {
    const out = await next(e)
    if (out.deny !== undefined || !out.agentId) return out
    const id = out.agentId
    const now = await $.clock.now()
    const custom = await read($, spritesA)
    const known = [...Object.keys(BUILTIN), ...Object.keys(custom)]
    const running = Object.values(await read($, agentsA)).filter(a => a.status === 'running')
    const sprite = pickSprite(e.subagentType, e.description, mapText, fallback, known, running.map(a => a.sprite))
    // The next palette after the ones running agents of this kind wear.
    const sp: Sprite | undefined = custom[sprite] ?? BUILTIN[sprite]
    const taken = running.filter(a => a.sprite === sprite).map(a => a.variant ?? 0)
    const nVar = sp?.variants?.length ?? 1
    const variant = Array.from({ length: nVar }, (_, k) => k).find(k => !taken.includes(k)) ?? taken.length % nVar
    const row: AgentRow = {
      id,
      label: e.description,
      type: e.subagentType,
      model: modelName(out.model || e.model || e.parentModel),
      status: 'running',
      steps: 0, tools: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, ctx: 0,
      sprite,
      variant,
      background: e.background,
      startedAt: now,
      endedAt: 0,
      activity: 'starting',
    }
    await update($, agentsA, all => ({ ...all, [id]: row }))

    return out
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const name = String(e.tool)
    const args = e as unknown as Record<string, unknown>
    const what = describeCall(name, args)

    if (e.agentId) {
      await patchAgent($, e.agentId, a => ({ ...a, tools: a.tools + 1, activity: what }))

      return next(e)
    }
    const startNow = await $.clock.now()
    const startCost = await sessionCost($)
    await update($, runA, r => ({
      ...r,
      tools: r.tools + 1,
      activity: what,
      lastActivity: startNow,
      ...(r.active ? {} : { ...run0, active: true, startedAt: startNow, lastActivity: startNow, tools: 1, activity: what, costAtStart: startCost, lastTurnCost: r.lastTurnCost }),
    }))

    if (name === 'TodoWrite' && Array.isArray(args.todos)) {
      const todos = args.todos as { status?: string }[]
      await patchRun($, k, {
        todoTotal: todos.length,
        todoDone: todos.filter(t => t.status === 'completed').length,
        todoActive: todos.filter(t => t.status === 'in_progress').length,
      })
    }

    const ran = await next(e)

    if (name === 'Bash' && ran.deny === undefined) {
      const taskId = (ran as { result?: { backgroundTaskId?: string } }).result?.backgroundTaskId
      if (taskId) {
        const now = await $.clock.now()
        const label = typeof args.command === 'string' ? args.command : 'background task'
        const row: TaskRow = { id: taskId, label, status: 'running', startedAt: now, endedAt: 0 }
        await update($, tasksA, all => ({ ...all, [taskId]: row }))
      }
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('session.append', async ($, e, next) => {
    try {
      for (const block of e.message.content as { type: string; text?: string }[]) {
        if (block.type === 'text' && block.text) await noteNotifications($, block.text)
      }
    } catch {
      // a row this hook cannot read is stored untouched
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  const cfg = { maxAgents, ka, showCost }

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, enabledA))) return next(e)
    const tree = await draw($, e, cfg, 'band')

    return tree ?? next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => (await draw($, e, cfg, 'pane')) ?? <></>)
  on('ui.focus', { component: 'Pane', requestId: PANE }, focusToggle).catch(($, e, next) => next(e))
}
