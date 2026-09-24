import type { WorkflowAgentHarness } from '@yourtechbudstudio/isagi-workflow-sdk';

type AgentProfile = {
  readonly harness: WorkflowAgentHarness;
  readonly model: string;
  readonly effort: string;
};

export const uiAgent = {
  harness: 'claude',
  model: 'opus',
  effort: 'medium',
} satisfies AgentProfile;

export const documentationAgent = {
  harness: 'codex',
  model: 'gpt-6-sol',
  effort: 'medium',
} satisfies AgentProfile;

export const commitAgent = {
  harness: 'codex',
  model: 'gpt-6-luna',
  effort: 'medium',
} satisfies AgentProfile;

export const pullRequestAgent = {
  harness: 'codex',
  model: 'gpt-6-luna',
  effort: 'medium',
} satisfies AgentProfile;
