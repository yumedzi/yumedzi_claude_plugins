import { test, expect, mock } from 'claude-code/testing'

for (const surface of ['desktop', 'terminal'] as const)
  for (const [rows, cols] of [[1, 46], [2, 30], [3, 46], [10, 46], [60, 46], [60, 120]] as const) {
    test(`pane draws on ${surface}, ${rows} rows x ${cols}`, async ($, on) => {
      mock.clock(on, { now: 1_000_000 })
      on('session.usage', (() => ({ value: { cost: { usd: 48.4 }, context: { tokens: 207000, window: 1000000, percent: 21 }, startedAt: 0, rateLimits: [] } })) as any)
      on('session.turns', (() => ({ value: 6 })) as any)
      const ui = await $.ui.mount({
        plugin: 'cool-progress', surface, component: 'Pane', requestId: 'cool-progress',
        props: { title: 'Cool Progress', isFocused: false, bodyColumns: cols, placement: 'dock', scroll: { bodyRows: rows, contentRows: 0, offset: 0 } } as any,
      } as any)
      expect(await ui.find({ type: surface === 'desktop' ? 'Svg' : 'Text' } as any)).toBeDefined()
      await ui.unmount()
    })
  }

test('a narrow ultra strip keeps the costs over the agent and job counts', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  on('session.usage', (() => ({ value: { cost: { usd: 48.4 }, context: { tokens: 88000, window: 1000000, percent: 9 }, startedAt: 0, rateLimits: [] } })) as any)
  on('session.turns', (() => ({ value: 6 })) as any)
  const ui = await $.ui.mount({
    plugin: 'cool-progress', surface: 'desktop', component: 'Pane', requestId: 'cool-progress',
    props: { title: 'Cool Progress', isFocused: false, bodyColumns: 30, placement: 'dock', scroll: { bodyRows: 3, contentRows: 0, offset: 0 } } as any,
  } as any)
  const svg: any = await ui.find({ type: 'Svg' } as any)
  const src = String(svg?.props?.source ?? svg?.source ?? JSON.stringify(svg))
  expect(src).toContain('SESSION')
  expect(src).toContain('$48.40')
  await ui.unmount()
})

test('on a subscription the narrow ultra strip shows the 7D limit over the agent and job counts', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  on('session.usage', (() => ({ value: { cost: { usd: 1.69 }, context: { tokens: 137000, window: 1000000, percent: 14 }, startedAt: 0, rateLimits: [{ kind: 'five_hour', percentUsed: 64 }, { kind: 'seven_day', percentUsed: 27 }] } })) as any)
  on('session.turns', (() => ({ value: 3 })) as any)
  const ui = await $.ui.mount({
    plugin: 'cool-progress', surface: 'desktop', component: 'Pane', requestId: 'cool-progress',
    props: { title: 'Cool Progress', isFocused: false, bodyColumns: 52, placement: 'dock', scroll: { bodyRows: 3, contentRows: 0, offset: 0 } } as any,
  } as any)
  const svg: any = await ui.find({ type: 'Svg' } as any)
  const src = String(svg?.props?.source ?? svg?.source ?? JSON.stringify(svg))
  expect(src).toContain('7D')
  await ui.unmount()
})

test('at the smallest pane height the strip goes slim, one line high, and keeps the costs', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  on('session.usage', (() => ({ value: { cost: { usd: 3.09 }, context: { tokens: 153000, window: 1000000, percent: 15 }, startedAt: 0, rateLimits: [] } })) as any)
  on('session.turns', (() => ({ value: 4 })) as any)
  const ui = await $.ui.mount({
    plugin: 'cool-progress', surface: 'desktop', component: 'Pane', requestId: 'cool-progress',
    props: { title: 'Cool Progress', isFocused: false, bodyColumns: 46, placement: 'dock', scroll: { bodyRows: 2, contentRows: 0, offset: 0 } } as any,
  } as any)
  const svg: any = await ui.find({ type: 'Svg' } as any)
  expect(svg?.props?.height).toBe(18)
  const src = String(svg?.props?.source ?? '')
  expect(src).toContain('height="18"')
  expect(src).toContain('$3.09')
  
  await ui.unmount()
})

test('the slim strip on a thin pane drops labels, not the session cost', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  on('session.usage', (() => ({ value: { cost: { usd: 3.09 }, context: { tokens: 115000, window: 1000000, percent: 11 }, startedAt: 0, rateLimits: [] } })) as any)
  on('session.turns', (() => ({ value: 4 })) as any)
  const ui = await $.ui.mount({
    plugin: 'cool-progress', surface: 'desktop', component: 'Pane', requestId: 'cool-progress',
    props: { title: 'Cool Progress', isFocused: false, bodyColumns: 24, placement: 'dock', scroll: { bodyRows: 1, contentRows: 0, offset: 0 } } as any,
  } as any)
  const src = String(((await ui.find({ type: 'Svg' } as any)) as any)?.props?.source ?? '')
  expect(src).toContain('$3.09')
  expect(src).not.toContain('SESSION')
  expect(src).not.toContain('CONTEXT')
  await ui.unmount()
})
