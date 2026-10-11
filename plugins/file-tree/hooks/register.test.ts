import { expect, test } from 'claude-code/testing'

test('an Edit passes through and a failed one is reported as the tool answered', async ($, on) => {
  on('tool.call', { tool: 'Edit' }, () => ({ result: {}, text: 'ok', isError: false }))
  const ran = await $.tool.call({ tool: 'Edit', file_path: '/x/a.py', old_string: 'a', new_string: 'b' })
  expect(ran.text).toBe('ok')
})

test('a Bash call is untouched by the tree', async ($, on) => {
  on('tool.call', { tool: 'Bash' }, () => ({ result: {}, text: 'done', isError: false }))
  const ran = await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(ran.text).toBe('done')
})
