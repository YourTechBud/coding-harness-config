import type { WorkflowAgentHarness } from '@yourtechbudstudio/isagi-workflow-sdk';

export type AgentProfile = {
  readonly harness: WorkflowAgentHarness;
  readonly model: string;
  readonly effort: string;
};

export const planner = {
  harness: 'pi',
  model: 'openai-codex/gpt-6-astra',
  effort: 'low',
} satisfies AgentProfile;

export const plannerJudgment = {
  harness: 'codex',
  model: 'gpt-5.6-luna',
  effort: 'medium',
} satisfies AgentProfile;
