import type { WorkflowAgentHarness } from '@isagi/workflow-sdk';

export type ImplementerProfile = {
  readonly kind: 'generic' | 'frontend';
  readonly harness: WorkflowAgentHarness;
  readonly model: string;
  readonly effort: string;
};

export const implementerGeneric = {
  kind: 'generic',
  harness: 'codex',
  model: 'gpt-5.5',
  effort: 'medium',
} satisfies ImplementerProfile;

export const implementerFrontend = {
  kind: 'frontend',
  harness: 'claude',
  model: 'opus',
  effort: 'max',
} satisfies ImplementerProfile;

export const headlessJudgment = {
  harness: 'codex',
  model: 'gpt-5.5',
  effort: 'low',
} satisfies {
  readonly harness: WorkflowAgentHarness;
  readonly model: string;
  readonly effort: string;
};
