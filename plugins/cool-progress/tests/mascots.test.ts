import { test, expect, mock } from 'claude-code/testing'

const usage = () => ({ value: { cost: { usd: 2.06 }, context: { tokens: 162000, window: 1000000, percent: 16 }, startedAt: 0, rateLimits: [] } })

test('agents that match no role keyword each get a kind no running agent has', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  on('session.usage', usage as any)
  on('session.turns', (() => ({ value: 4 })) as any)
  let n = 0
  on('agent.spawn', (() => ({ agentId: 'ag' + n++, model: 'claude-sonnet-5-5' })) as any)
  for (const d of ['Misc helper one', 'Misc helper two', 'Misc helper three'])
    await ($ as any).agent.spawn({ description: d, subagentType: 'general-purpose', prompt: 'x', background: false })
  const ui: any = await $.ui.mount({
    plugin: 'cool-progress', surface: 'desktop', component: 'Pane', requestId: 'cool-progress',
    props: { title: 'Cool Progress', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { bodyRows: 0, contentRows: 0, offset: 0 } } as any,
  } as any)
  const kinds = ((await ui.findAll({ type: 'Svg' })) as any[]).map(s => String(s.props.alt)).filter(a => a.endsWith('mascot'))
  expect(kinds.length).toBe(3)
  expect(new Set(kinds).size).toBe(3)
  await ui.unmount()
})

test('two agents of one kind wear different palettes, and a running mascot cycles its frames and blinks', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  on('session.usage', usage as any)
  on('session.turns', (() => ({ value: 4 })) as any)
  let n = 0
  on('agent.spawn', (() => ({ agentId: 'ag' + n++, model: 'claude-sonnet-5-5' })) as any)
  for (const d of ['Break the first claim', 'Break the second claim'])
    await ($ as any).agent.spawn({ description: d, subagentType: 'general-purpose', prompt: 'x', background: false })
  const ui: any = await $.ui.mount({
    plugin: 'cool-progress', surface: 'desktop', component: 'Pane', requestId: 'cool-progress',
    props: { title: 'Cool Progress', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { bodyRows: 0, contentRows: 0, offset: 0 } } as any,
  } as any)
  const foxes = ((await ui.findAll({ type: 'Svg' })) as any[]).filter(s => s.props.alt === 'fox mascot').map(s => String(s.props.source))
  expect(foxes.length).toBe(2)
  expect(foxes[0]).toContain('#f97316')
  expect(foxes[1]).not.toContain('#f97316')
  expect(foxes[0]).toMatch(/-f1\{animation:/)
  expect(foxes[0]).toMatch(/-e\{opacity:0;animation:/)
  await ui.unmount()
})

test('the band pins its counters right and draws them as a robot head and a terminal window', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const band: any = await $.ui.mount({ plugin: 'cool-progress', surface: 'desktop', component: 'AbovePrompt', props: { bodyColumns: 140, maxRows: 4, isWorking: false } } as any)
  const svgs = (await band.findAll({ type: 'Svg' })) as any[]
  const term = svgs.find(s => /^background jobs/.test(s.props.alt))
  expect(term).toBeDefined()
  expect(String(term.props.source)).toContain('circle')
  expect(svgs.find(s => /^sub-agents/.test(s.props.alt))).toBeDefined()
  const boxes = (await band.findAll({ type: 'Box' })) as any[]
  expect(boxes.some(b => b.props.flexGrow === 1)).toBe(true)
  expect(String(svgs.find(s => /progress/.test(s.props.alt))?.props.source)).toContain('cr-f0')
  await band.unmount()
})

// The band's px per column was fitted on screenshots: at 62 columns a 330px bar fit, at 96 columns
// 657px pushed the jobs chip out of the row (it fit at about 596px).
for (const [cols, max] of [[62, 335], [96, 600]] as const)
  test(`the band's bar at ${cols} columns leaves the counters room (bar <= ${max}px)`, async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    on('session.usage', usage as any)
    const band: any = await $.ui.mount({ plugin: 'cool-progress', surface: 'desktop', component: 'AbovePrompt', props: { bodyColumns: cols, maxRows: 4, isWorking: false } } as any)
    const svgs = (await band.findAll({ type: 'Svg' })) as any[]
    const bar = svgs.find(s => /^progress/.test(s.props.alt))
    expect(bar).toBeDefined()
    expect(bar.props.width).toBeLessThanOrEqual(max)
    expect(bar.props.width).toBeGreaterThan(max - 60)
    await band.unmount()
  })
