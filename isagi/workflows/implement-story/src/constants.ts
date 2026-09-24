import type { WorkflowAgentHarness } from '@yourtechbudstudio/isagi-workflow-sdk';

export type AgentProfile = {
  readonly harness: WorkflowAgentHarness;
  readonly model: string;
  readonly effort: string;
};

export const planner = {
  harness: 'claude',
  model: 'opus',
  effort: 'high',
} satisfies AgentProfile;

export const plannerJudgment = {
  harness: 'codex',
  model: 'gpt-6-luna',
  effort: 'medium',
} satisfies AgentProfile;
