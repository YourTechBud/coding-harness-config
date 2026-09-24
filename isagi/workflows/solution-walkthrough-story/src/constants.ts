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
  model: 'gpt-6-sol',
  effort: 'high',
} satisfies AgentProfile;

export const deckArchitect = {
  harness: 'claude',
  model: 'opus',
  effort: 'high',
} satisfies AgentProfile;
