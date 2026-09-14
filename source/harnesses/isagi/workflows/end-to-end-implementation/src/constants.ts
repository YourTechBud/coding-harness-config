import type { WorkflowAgentHarness } from '@yourtechbudstudio/isagi-workflow-sdk';

type AgentProfile = {
  readonly harness: WorkflowAgentHarness;
  readonly model: string;
  readonly effort: string;
};

export const uiAgent = {
  harness: 'claude',
  model: 'fable',
  effort: 'medium',
} satisfies AgentProfile;

export const documentationAgent = {
  harness: 'codex',
  model: 'gpt-6-astra',
  effort: 'low',
} satisfies AgentProfile;

export const commitAgent = {
  harness: 'codex',
  model: 'gpt-5.6-luna',
  effort: 'medium',
} satisfies AgentProfile;

export const pullRequestAgent = {
  harness: 'codex',
  model: 'gpt-5.6-luna',
  effort: 'medium',
} satisfies AgentProfile;
