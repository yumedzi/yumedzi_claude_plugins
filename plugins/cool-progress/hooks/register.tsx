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
// 8 pixels wide, 4 tall (two text rows of half blocks), two frames each.
const BUILTIN: Record<string, Sprite> = {
  crab: {
    palette: { O: '#d97757', R: '#ee9b7d', E: '#1f1411', L: '#a8452e' },
    frames: [
      ['RR......RR', 'R.OOOOOO.R', '..OEOOEO..', '.OOOOOOOO.', '..OOOOOO..', '.L.L..L.L.'],
      ['.RR....RR.', 'R.OOOOOO.R', '..OEOOEO..', '.OOOOOOOO.', '..OOOOOO..', '..L.LL.L..'],
    ],
  },
  robot: {
    palette: { A: '#ef4444', H: '#94a3b8', E: '#22d3ee', B: '#64748b' },
    frames: [
      ['...A....', '.HHHHHH.', '.HEHHEH.', '..BBBB..'],
      ['........', '.HHHHHH.', '.HHHHHH.', '..BBBB..'],
    ],
  },
  owl: {
    palette: { O: '#a16207', W: '#fef9c3', P: '#111827', B: '#d97706', Y: '#facc15' },
    frames: [
      ['O.OOOO.O', 'OWPOOPWO', '.OOBBOO.', '..Y..Y..'],
      ['O.OOOO.O', 'OOOOOOOO', '.OOBBOO.', '..Y..Y..'],
    ],
  },
  cat: {
    palette: { K: '#6b7280', G: '#4ade80', N: '#f9a8d4' },
    frames: [
      ['K.KKKK.K', 'KKKKKKKK', 'KGKKKKGK', '.KKNNKK.'],
      ['K.KKKK.K', 'KKKKKKKK', 'KKKKKKKK', '.KKNNKK.'],
    ],
  },
  ghost: {
    palette: { W: '#e2e8f0', E: '#1e293b' },
    frames: [
      ['..WWWW..', '.WWWWWW.', '.WEWWEW.', '.W.WW.W.'],
      ['..WWWW..', '.WWWWWW.', '.WEWWEW.', 'W.W..W.W'],
    ],
  },
  wizard: {
    palette: { P: '#7c3aed', S: '#fcd9b6', E: '#111827', B: '#e5e7eb', s: '#fde047' },
    frames: [
      ['...PP...', '..PPPP..', '.SESSES.', '..BBBB..'],
      ['..sPP...', '..PPPP..', '.SESSES.', '..BBBB..'],
    ],
  },
}

const KEYWORDS: [RegExp, string][] = [
  [/scout|explor|search|recon|find|locate/i, 'crab'],
  [/research|web|doc|read|brief/i, 'owl'],
  [/review|test|qa|lint|audit|check/i, 'cat'],
  [/deep|think|plan|architect|design|reason/i, 'wizard'],
  [/work|code|impl|edit|build|fix|write/i, 'robot'],
]

function pickSprite(type: string, label: string, mapText: string, fallback: string, known: string[]): string {
  for (const part of mapText.split(',')) {
    const [key, val] = part.split('=').map(s => s.trim())
    if (key && val && (key === type || key === label) && known.includes(val)) return val
  }
  const hay = `${type} ${label}`
  for (const [re, name] of KEYWORDS) if (re.test(hay) && known.includes(name)) return name

  return known.includes(fallback) ? fallback : 'crab'
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

function spriteRows(Box: any, Text: any, sp: Sprite, frame: number, isDim: boolean) {
  const g = sp.frames[frame % sp.frames.length]!
  const out: any[] = []
  for (let r = 0; r + 1 < g.length; r += 2) {
    const top = g[r]!
    const bot = g[r + 1]!
    const runs: { ch: string; fg?: string; bg?: string }[] = []
    for (let c = 0; c < top.length; c++) {
      const t = sp.palette[top[c]!]
      const b = sp.palette[bot[c] ?? '.']
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
const CRAB_A = ['RR......RR', 'R.OOOOOO.R', '..OEOOEO..', '.OOOOOOOO.', '..OOOOOO..', '.L.L..L.L.']
const CRAB_B = ['.RR....RR.', 'R.OOOOOO.R', '..OEOOEO..', '.OOOOOOOO.', '..OOOOOO..', '..L.LL.L..']
const CRAB_PAL: Record<string, string> = { O: '#d97757', R: '#ee9b7d', E: '#2b1b17', L: '#a8452e' }

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
.fb{opacity:0}
${isLive ? '.fa{animation:sa .5s steps(1) infinite}.fb{animation:sb .5s steps(1) infinite}.bob{animation:bob .5s steps(1) infinite}' : ''}
@keyframes sa{0%{opacity:1}50%{opacity:0}}@keyframes sb{0%{opacity:0}50%{opacity:1}}@keyframes bob{50%{transform:translateY(-1px)}}
@media (prefers-reduced-motion: reduce){.t0,.t1,.t2,.t3,.fa,.fb,.bob{animation:none}}
</style>`

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
  const crabX = Math.min(Math.max(to, 0), 1) * (w - 30)
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
  const crabY = y0 + (bH - 16.8) / 2
  let ticks = ''
  for (const i of [1, 2, 3]) {
    const x = (w * i) / 4
    if (x > fe + 40) ticks += `<rect x="${(x - 1).toFixed(1)}" y="${(y0 + bH / 2 - 4).toFixed(1)}" width="2" height="8" rx="1" fill="#8a8a8a" fill-opacity="0.4"/>`
  }
  const crab = `<g transform="translate(${crabX.toFixed(1)} 0)">
<g transform="translate(0 ${crabY.toFixed(1)})"><g class="bob"><g class="fa">${gridRects(CRAB_A, CRAB_PAL, 2.8)}</g><g class="fb">${gridRects(CRAB_B, CRAB_PAL, 2.8)}</g></g></g></g>`

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

function spriteSvg(sp: Sprite, u: number, isLive: boolean): string {
  const w = (sp.frames[0]![0]!.length * u).toFixed(0)
  const h = (sp.frames[0]!.length * u).toFixed(0)
  const groups = sp.frames
    .slice(0, 2)
    .map((g, i, all) => `<g class="${all.length === 1 ? '' : i === 0 ? 'fa' : 'fb'}">${gridRects(g, sp.palette, u)}</g>`)
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${Number(h) + 2}" viewBox="0 -1 ${w} ${Number(h) + 2}">${SVG_CSS(isLive)}<g class="bob">${groups}</g></svg>`
}


const tfmt = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n))
const realMoney = (c: number) => '$' + (c < 1 ? c.toFixed(3) : c.toFixed(2))
const ctxMaxOf = (model: string) => (/haiku-4/.test(model) ? 200000 : 1000000)

// A terminal glyph of fixed size. The cursor blinks with a CSS animation inside the image, so the
// text beside it never moves.
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
}

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
type StripItem = { icon: string; label: string; value: string; color?: string }
// `tail`, when given, is the last column, pinned right: the agents and background counts stacked.
type StripTail = { agents: string; agentsLive: boolean; tasks: string; tasksLive: boolean }
// The costs outrank the counts: when the tail would push session or turn cost out, it is dropped.
const STRIP_MUST = 2
function stripSvg(w: number, ctx: { pct: number; value: string; color: string } | null, items: StripItem[], tail?: StripTail): string {
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
  if (tail && placed < Math.min(STRIP_MUST, items.length)) parts = layout(false).parts

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${H}" viewBox="0 0 ${w} ${H}"><style>${TXT_CSS}</style>${parts.join('')}</svg>`
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
  const barEl = (width: number, from: number, to: number, hasCrab: boolean, live: boolean) =>
    hasSvg ? (
      <table.Svg
        source={dotBar(px(width), to, hasCrab, live)}
        alt={`progress ${Math.round(to * 100)}%`}
        width={px(width)}
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
  const chips = (
    <Box flexDirection="row" gap={1} alignItems="center" flexShrink={0}>
      <Box flexShrink={0}><Text color="#d97757" dimColor={runningAgents.length === 0}>{`🤖 ${runningAgents.length}`}</Text></Box>
      <Box flexShrink={0}><Text color="#4ade80" dimColor={runningTasks.length === 0}>{`>_ ${runningTasks.length}`}</Text></Box>
    </Box>
  )
  if (mode === 'band' && !isLive) {
    return (
      <Box flexDirection="row" gap={1} alignItems="center">
        <Box flexShrink={0}>{statusEl('idle')}</Box>
        <Box flexShrink={0}>{barEl(barW, 0, 0, true, false)}</Box>
        <Box flexShrink={0}><Text dimColor>idle</Text></Box>
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
      <Box flexShrink={0}>{barEl(barW, r.from, r.shown, true, isRunning)}</Box>
      <Box flexShrink={0}><Text bold={done} color={done ? '#4ade80' : undefined}>{done ? 'done' : `${pct}%${est}`}</Text></Box>
      <Box flexShrink={0}><Text dimColor>{elapsed}</Text></Box>
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
  const innerW = Math.max(160, (cols - 2) * 8)
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
    ...limits.map((l): [string, string, string | undefined, string] => [l.kind === 'five_hour' ? '5H LIMIT' : l.kind === 'seven_day' ? '7D LIMIT' : l.kind.toUpperCase(), `${Math.round(l.percentUsed)}%`, pctColor(l.percentUsed), 'clock']),
  ]
  const isNarrow = innerW < 460
  // The terminal's text tiles: two or three to a row, in cells (the card's border and padding take 4).
  const termTileW = Math.max(14, Math.floor((cols - 4) / (cols >= 66 ? 3 : 2)) - 1)
  const perRow = isNarrow ? 2 : Math.min(tiles.length, 4)
  const tileW = isNarrow ? Math.max(90, Math.floor((innerW - 12) / 2) - 4) : Math.max(100, Math.floor((innerW - (hasRing ? RING + 30 : 0)) / perRow) - 8)
  const sideW = Math.max(90, innerW - RING - 24)
  const belowRows = Math.ceil(Math.max(0, tiles.length - SIDE) / 2)

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
      ...limits.map((l): StripItem => ({ icon: 'clock', label: l.kind === 'five_hour' ? '5H' : l.kind === 'seven_day' ? '7D' : l.kind.toUpperCase(), value: `${Math.round(l.percentUsed)}%`, color: pctColor(l.percentUsed) })),
      { icon: 'bars', label: usage ? `${turns} TURN${turns === 1 ? '' : 'S'}` : 'TURNS', value: usage ? clockLong(upMs) : '—', color: '#d97757' },
      ...(allAgents.length > 0 ? [{ icon: 'robot', label: 'AGENTS', value: money(agentCost), color: '#a78bfa' }] : []),
    ]
    const ctxVal = `${ctxPct}% · ${tfmt(ctxTokens)}`
    const isUltra = tier === 'ultra'
    const tail: StripTail | undefined = isUltra
      ? { agents: `${runningAgents.length} · ${doneAgents.length} done`, agentsLive: runningAgents.length > 0, tasks: `${runningTasks.length} · ${doneTasks.length} done`, tasksLive: runningTasks.length > 0 }
      : undefined
    const sessionRow = hasSvg ? (
      <table.Svg source={stripSvg(innerW, ctxWindow > 0 ? { pct: ctxPct, value: ctxVal, color: ctxColor(ctxTokens, ctxPct) } : null, strip, tail)} alt={`context ${ctxVal}`} width={innerW} height={30} />
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
            </Box>
            {tiles.length > SIDE && (
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
          const u = sp.frames[0]!.length > 4 ? 4.6 : 6
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
                  <table.Svg source={spriteSvg(sp, u, isRun)} alt={`${a.sprite} mascot`} width={spriteW} height={spriteH} />
                ) : (
                  <Box flexDirection="column">{spriteRows(Box, Text, sp, frame, !isRun)}</Box>
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
  const fallback = str(options.defaultMascot) || 'crab'
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
    const row: AgentRow = {
      id,
      label: e.description,
      type: e.subagentType,
      model: modelName(out.model || e.model || e.parentModel),
      status: 'running',
      steps: 0, tools: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, ctx: 0,
      sprite: pickSprite(e.subagentType, e.description, mapText, fallback, known),
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
