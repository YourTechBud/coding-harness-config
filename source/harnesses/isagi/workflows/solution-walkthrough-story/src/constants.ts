import type { WorkflowAgentHarness } from '@yourtechbudstudio/isagi-workflow-sdk';

export type AgentProfile = {
  readonly harness: WorkflowAgentHarness;
  readonly model: string;
  readonly effort: string;
};

export const deckBuilder = {
  harness: 'claude',
  model: 'opus',
  effort: 'medium',
} satisfies AgentProfile;

export const guide = {
  harness: 'codex',
  model: 'gpt-5.6-sol',
  effort: 'low',
} satisfies AgentProfile;

export const deckArchitect = {
  harness: 'claude',
  model: 'fable',
  effort: 'high',
} satisfies AgentProfile;
