import type { WorkflowAgentHarness } from "@yourtechbudstudio/isagi-workflow-sdk";

export type AgentProfile = {
  readonly harness: WorkflowAgentHarness;
  readonly model: string;
  readonly effort: string;
};

export const reviewer = {
  harness: "claude",
  model: "fable",
  effort: "low",
} satisfies AgentProfile;

export const fixer = {
  harness: "codex",
  model: "gpt-5.6-sol",
  effort: "medium",
} satisfies AgentProfile;

export const routingJudgment = {
  harness: "codex",
  model: "gpt-5.6-luna",
  effort: "medium",
} satisfies AgentProfile;
