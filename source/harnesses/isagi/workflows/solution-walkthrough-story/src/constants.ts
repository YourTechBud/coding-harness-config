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
  harness: 'pi',
  model: 'openai-codex/gpt-6-astra',
  effort: 'low',
} satisfies AgentProfile;

export const deckArchitect = {
  harness: 'codex',
  model: 'gpt-6-astra',
  effort: 'low',
} satisfies AgentProfile;
