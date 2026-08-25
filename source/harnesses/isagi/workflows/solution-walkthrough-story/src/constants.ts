import type { WorkflowAgentHarness } from '@yourtechbudstudio/isagi-workflow-sdk';

export type AgentProfile = {
  readonly harness: WorkflowAgentHarness;
  readonly model: string;
  readonly effort: string;
};

export const preparer = {
  harness: 'codex',
  model: 'gpt-5.6-sol',
  effort: 'low',
} satisfies AgentProfile;

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

export const deckVerifier = {
  harness: 'codex',
  model: 'gpt-5.6-sol',
  effort: 'medium',
} satisfies AgentProfile;

export const deckReviewRouting = {
  harness: 'codex',
  model: 'gpt-5.6-luna',
  effort: 'medium',
} satisfies AgentProfile;
