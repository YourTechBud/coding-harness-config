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
