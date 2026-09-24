import type { WorkflowAgentHarness } from "@yourtechbudstudio/isagi-workflow-sdk";

export type AgentProfile = {
  readonly harness: WorkflowAgentHarness;
  readonly model: string;
  readonly effort: string;
};

export const fixer = {
  harness: "claude",
  model: "opus",
  effort: "medium",
} satisfies AgentProfile;

export const reviewer = {
  harness: "codex",
  model: "gpt-6-sol",
  effort: "high",
} satisfies AgentProfile;

export const routingJudgment = {
  harness: "codex",
  model: "gpt-6-luna",
  effort: "medium",
} satisfies AgentProfile;
