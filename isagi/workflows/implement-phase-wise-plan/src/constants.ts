import type { WorkflowAgentHarness } from "@yourtechbudstudio/isagi-workflow-sdk";

export type ImplementerKind = "ui-heavy" | "prose-heavy" | "generic";

export type ImplementerProfile = {
  readonly kind: ImplementerKind;
  readonly harness: WorkflowAgentHarness;
  readonly model: string;
  readonly effort: string;
};

export const implementerGeneric = {
  kind: "generic",
  harness: "codex",
  model: "gpt-5.6-sol",
  effort: "medium",
} satisfies ImplementerProfile;

export const implementerUiHeavy = {
  kind: "ui-heavy",
  harness: "claude",
  model: "opus",
  effort: "max",
} satisfies ImplementerProfile;

export const implementerProseHeavy = {
  kind: "prose-heavy",
  harness: "claude",
  model: "opus",
  effort: "max",
} satisfies ImplementerProfile;

export const headlessJudgment = {
  harness: "codex",
  model: "gpt-5.6-luna",
  effort: "medium",
} satisfies {
  readonly harness: WorkflowAgentHarness;
  readonly model: string;
  readonly effort: string;
};

export const draftCommitter = {
  harness: "codex",
  model: "gpt-5.6-luna",
  effort: "low",
} satisfies {
  readonly harness: WorkflowAgentHarness;
  readonly model: string;
  readonly effort: string;
};
