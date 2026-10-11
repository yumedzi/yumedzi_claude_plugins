import { expect, test } from 'claude-code/testing'

test('a TodoWrite call passes through the band unchanged', async ($, on) => {
  on('tool.call', { tool: 'TodoWrite' }, () => ({ result: {}, text: 'ok' }))
  const ran = await $.tool.call({
    tool: 'TodoWrite',
    todos: [{ content: 'a', status: 'completed', activeForm: 'a' }],
  })
  expect(ran.text).toBe('ok')
})

test('a background Bash call still answers', async ($, on) => {
  on('tool.call', { tool: 'Bash' }, () => ({ result: { backgroundTaskId: 'b1' }, text: 'started' }))
  const ran = await $.tool.call({ tool: 'Bash', command: 'sleep 5', run_in_background: true })
  expect(ran.text).toBe('started')
})
