export type Run = {
  active: boolean
  /** Briefly true after a turn ends so the finished bar stays visible. */
  showDone: boolean
  startedAt: number
  steps: number
  tools: number
  todoDone: number
  todoActive: number
  todoTotal: number
  /** Where the bar is heading, 0..1. */
  target: number
  /** Where the bar is drawn, 0..1. */
  shown: number
  /** Where the bar was before the last move, 0..1: the animation starts here. */
  from: number
  activity: string
  /** When the turn ended, 0 while it runs: the timer freezes here. */
  endedAt: number
  /** Last tool call or model step, to notice a run that stopped without telling us. */
  lastActivity: number
  /** Session cost (USD, from the engine) when this turn started; 0 if unknown. */
  costAtStart: number
  /** What the previous turn cost, USD; -1 if unknown. */
  lastTurnCost: number
}

export type AgentRow = {
  id: string
  label: string
  type: string
  model: string
  status: 'running' | 'done' | 'failed'
  steps: number
  tools: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  /** Prompt size of the agent's latest model step, in tokens: its context fill. */
  ctx: number
  sprite: string
  background: boolean
  startedAt: number
  /** When it finished, 0 while it runs: its timer freezes here. */
  endedAt: number
  activity: string
}

export type TaskRow = {
  id: string
  label: string
  status: 'running' | 'done' | 'failed'
  startedAt: number
  /** When it finished, 0 while it runs: its timer freezes here. */
  endedAt: number
}

export type Sprite = { palette: Record<string, string>; frames: string[][] }

declare module 'claude-code' {
  interface PluginState {
    'cool-progress': {
      run: Run
      agents: Record<string, AgentRow>
      view: { agents: boolean; tasks: boolean }
      tasks: Record<string, TaskRow>
      sprites: Record<string, Sprite>
      tick: number
      /** The /cool-progress switch: false hides the whole band. */
      isEnabled: boolean
    }
  }
}
