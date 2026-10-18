import { test, expect, mock } from 'claude-code/testing'

for (const surface of ['desktop', 'terminal'] as const)
  for (const [rows, cols] of [[3, 46], [10, 46], [60, 46], [60, 120]] as const) {
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
