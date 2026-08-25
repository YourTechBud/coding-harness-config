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

export const pageBuilder = {
  harness: 'claude',
  model: 'opus',
  effort: 'medium',
} satisfies AgentProfile;

export const guide = {
  harness: 'codex',
  model: 'gpt-5.6-sol',
  effort: 'low',
} satisfies AgentProfile;

export const deckArchitect = preparer;

export const deckBuilder = pageBuilder;

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
