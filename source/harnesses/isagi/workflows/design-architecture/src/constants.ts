import type { WorkflowAgentHarness } from '@yourtechbudstudio/isagi-workflow-sdk';

export type AgentProfile = {
  readonly harness: WorkflowAgentHarness;
  readonly model: string;
  readonly effort: string;
};

export const reviewer = {
  harness: 'claude',
  model: 'opus',
  effort: 'medium',
} satisfies AgentProfile;

export const writer = {
  harness: 'claude',
  model: 'fable',
  effort: 'medium',
} satisfies AgentProfile;

export const writerJudgment = {
  harness: 'codex',
  model: 'gpt-5.6-luna',
  effort: 'medium',
} satisfies AgentProfile;

export const reviewerJudgment = {
  harness: 'codex',
  model: 'gpt-5.6-luna',
  effort: 'medium',
} satisfies AgentProfile;
