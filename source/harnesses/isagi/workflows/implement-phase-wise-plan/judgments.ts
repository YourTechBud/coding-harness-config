import { existsSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import type {
  WorkflowConversationMessage,
  WorkflowHeadlessResult,
} from "@isagi/workflow-sdk";

export type AwaitingJudgment =
  | { readonly kind: "discoverPlan" }
  | { readonly kind: "classifyPhaseUiIntensity" }
  | {
      readonly kind: "didImplementerFinishPhase";
      readonly context: "exploration" | "implementation";
    }
  | { readonly kind: "doesImplementerNeedClarification" }
  | {
      readonly kind: "didPlannerRaiseSevereFlag";
      readonly plannerPassKind: PlannerPassKind;
    }
  | { readonly kind: "didPlannerApproveImplementation" };

export type PlannerPassKind = "clarification" | "final";

export type DiscoveryResult =
  | {
      readonly planReferenceFound: false;
      readonly entryPlanPath?: unknown;
      readonly decisionLogPath?: unknown;
      readonly phaseCount?: unknown;
      readonly completedPhaseCount?: unknown;
      readonly nextPhaseToImplement?: unknown;
    }
  | {
      readonly planReferenceFound: true;
      readonly entryPlanPath: string;
      readonly decisionLogPath: string;
      readonly phaseCount: number;
      readonly completedPhaseCount: number;
      readonly nextPhaseToImplement: number;
    };

export type NormalizedDiscoveryResult = {
  readonly entryPlanPath: string;
  readonly decisionLogPath: string;
  readonly phaseCount: number;
  readonly completedPhaseCount: number;
  readonly nextPhaseToImplement: number;
};

export type ImplementerFinishedResult = {
  readonly phaseFinished: boolean;
};

export type PhaseUiIntensityResult = {
  readonly frontendHeavy: boolean;
};

export type ImplementerClarificationResult = {
  readonly needsClarification: boolean;
};

export type PlannerSevereFlagResult = {
  readonly severeFlag: boolean;
};

export type PlannerApprovalResult = {
  readonly approved: boolean;
};

export function latestAssistantText(
  history: readonly WorkflowConversationMessage[],
): string | null {
  for (const message of [...history].reverse()) {
    if (message.role !== "assistant") continue;
    const text = message.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim();
    if (text.length > 0) return text;
  }
  return null;
}

export function completedSingleHeadlessResult(
  event: unknown,
): WorkflowHeadlessResult {
  if (!event || typeof event !== "object") {
    throw new Error("Workflow resumed without a headless result event.");
  }
  const payload = event as {
    readonly kind?: unknown;
    readonly results?: unknown;
  };
  if (payload.kind !== "headless" || !Array.isArray(payload.results)) {
    throw new Error("Workflow resumed with a non-headless event.");
  }
  if (payload.results.length !== 1) {
    throw new Error(
      `Expected exactly one headless result, received ${payload.results.length}.`,
    );
  }
  const result = payload.results[0] as WorkflowHeadlessResult | undefined;
  if (!result || result.status !== "completed") {
    const error = result?.error ? `: ${result.error}` : "";
    throw new Error(`Headless judgment did not complete${error}.`);
  }
  return result;
}

export function parseDiscoveryResult(output: string): DiscoveryResult {
  return validateDiscoveryResult(parseJsonObject(output));
}

export function parseImplementerFinishedResult(
  output: string,
): ImplementerFinishedResult {
  return validateBooleanOnly(parseJsonObject(output), "phaseFinished");
}

export function parsePhaseUiIntensityResult(
  output: string,
): PhaseUiIntensityResult {
  return validateBooleanOnly(parseJsonObject(output), "frontendHeavy");
}

export function parseImplementerClarificationResult(
  output: string,
): ImplementerClarificationResult {
  return validateBooleanOnly(parseJsonObject(output), "needsClarification");
}

export function parsePlannerSevereFlagResult(
  output: string,
): PlannerSevereFlagResult {
  return validateBooleanOnly(parseJsonObject(output), "severeFlag");
}

export function parsePlannerApprovalResult(
  output: string,
): PlannerApprovalResult {
  return validateBooleanOnly(parseJsonObject(output), "approved");
}

export function normalizeDiscoveryResult(input: {
  readonly result: DiscoveryResult;
  readonly worktreePath: string;
}): NormalizedDiscoveryResult | null {
  if (input.result.planReferenceFound === false) return null;
  const entryPlanPath = resolveDiscoveredPath(
    input.result.entryPlanPath,
    input.worktreePath,
  );
  if (!existsSync(entryPlanPath) || !statSync(entryPlanPath).isFile()) {
    throw new Error(`Discovered plan path is not a file: ${entryPlanPath}`);
  }
  const decisionLogPath = resolveDiscoveredPath(
    input.result.decisionLogPath,
    input.worktreePath,
  );
  const decisionLogExists = existsSync(decisionLogPath);
  if (decisionLogExists && !statSync(decisionLogPath).isFile()) {
    throw new Error(
      `Discovered decision log path is not a file: ${decisionLogPath}`,
    );
  }
  const completedPhaseCount = decisionLogExists
    ? input.result.completedPhaseCount
    : 0;
  return {
    entryPlanPath,
    decisionLogPath,
    phaseCount: input.result.phaseCount,
    completedPhaseCount,
    nextPhaseToImplement:
      completedPhaseCount === input.result.phaseCount
        ? input.result.phaseCount + 1
        : completedPhaseCount + 1,
  };
}

export function discoverPlanPrompt(input: {
  readonly worktreePath: string;
  readonly plannerSessionId: number;
  readonly plannerConversation: string;
}) {
  return `${jsonClassifierPreamble("discoverPlan")}

Find the phase-wise implementation plan referenced by the focused planner agent, then determine where the workflow should resume.

Worktree root:
${input.worktreePath}

Planner agent session id:
${input.plannerSessionId}

Full planner conversation history:
${input.plannerConversation}

You may inspect files under the worktree root. Resolve relative file paths against the worktree root.
Return exactly one JSON object with exactly these fields:
{
  "planReferenceFound": true,
  "entryPlanPath": "/absolute/path/to/plan.md",
  "decisionLogPath": "/absolute/path/to/plan-decisions.md",
  "phaseCount": 4,
  "completedPhaseCount": 3,
  "nextPhaseToImplement": 4
}

Rules:
- If there is no phase-wise plan reference, return:
  {"planReferenceFound": false, "entryPlanPath": null, "decisionLogPath": null, "phaseCount": null, "completedPhaseCount": null, "nextPhaseToImplement": null}
- When planReferenceFound is true, entryPlanPath must be the absolute path to the entry plan file.
- When planReferenceFound is true, decisionLogPath must be the absolute path where the plan says phase decisions are or will be recorded.
- When planReferenceFound is true, phaseCount must be the positive integer count of phases in that plan.
- Use the full conversation history to identify the current plan reference. Consider both user and assistant messages.
- If multiple plan references appear, choose the latest current or agreed phase-wise plan, not stale examples or superseded paths.
- The decision log file may not exist yet. If it does not exist, implementation has not started; return completedPhaseCount 0 and nextPhaseToImplement 1.
- If the decision log file exists, inspect it and count the consecutive implemented phase prefix from phase 1. A phase with a decision entry is implemented; a phase without a decision entry is not implemented yet. Stop at the first missing phase even if a later phase appears in the decision file.
- completedPhaseCount must be the number of consecutive implemented phases starting at phase 1, clamped to the range 0..phaseCount.
- nextPhaseToImplement must be completedPhaseCount + 1. If all phases are complete, return phaseCount + 1.`;
}

export function classifyPhaseUiIntensityPrompt(input: {
  readonly phaseNumber: number;
  readonly phaseCount: number;
  readonly entryPlanPath: string;
}) {
  return `${jsonClassifierPreamble("classifyPhaseUiIntensity")}

Inspect the phase-wise implementation plan and decide whether phase ${input.phaseNumber} of ${input.phaseCount} is frontend-heavy.

Entry plan path:
${input.entryPlanPath}

You may inspect files under the worktree root and the plan file. Judge only this phase, not the whole plan.

Return exactly one JSON object with exactly this field:
{"frontendHeavy": true}

Rules:
- Return true when the phase substantially touches UI code, browser-rendered behavior, mobile app UI, or frontend technologies.
- Examples that should usually return true: React components or hooks, CSS, Tailwind, browser layout, visual styling, frontend state for screens, design-system implementation, mobile views, and user-facing app surfaces.
- Return false for backend web technology work that does not materially touch browser or mobile UI. Node.js, Express, server routes, runtime APIs, database work, contracts, CLI tools, workflow orchestration, and harness/process work are not frontend by themselves.
- If a phase includes both frontend and backend work, return true only when the frontend/browser/mobile portion is meaningful enough to benefit from a UI-specialized implementer.
- Do not include confidence, commentary, markdown, or extra JSON fields.`;
}

export function didImplementerFinishPhasePrompt(input: {
  readonly phaseNumber: number;
  readonly phaseCount: number;
  readonly entryPlanPath: string;
  readonly context: "exploration" | "implementation";
  readonly latestImplementerText: string;
}) {
  return `${jsonClassifierPreamble("didImplementerFinishPhase")}

Decide whether the implementer has finished phase ${input.phaseNumber} of ${input.phaseCount}.

Entry plan path:
${input.entryPlanPath}

Workflow context:
${input.context}

Latest non-empty implementer assistant response:
${input.latestImplementerText}

Return exactly one JSON object with exactly this field:
{"phaseFinished": false}

Rules:
- Return true only if the latest implementer response says the current phase is complete or clearly ended early.
- Return false for questions, alignment summaries, partial progress, blocked implementation, or requests for user/planner action.
- Do not include confidence, commentary, markdown, or extra JSON fields.`;
}

export function doesImplementerNeedClarificationPrompt(input: {
  readonly phaseNumber: number;
  readonly phaseCount: number;
  readonly entryPlanPath: string;
  readonly latestImplementerText: string;
}) {
  return `${jsonClassifierPreamble("doesImplementerNeedClarification")}

Decide whether the implementer is asking for clarification or alignment before implementation for phase ${input.phaseNumber} of ${input.phaseCount}.

Entry plan path:
${input.entryPlanPath}

Latest non-empty implementer assistant response:
${input.latestImplementerText}

Return exactly one JSON object with exactly this field:
{"needsClarification": true}

Rules:
- Interpret needsClarification broadly: clarifying questions, confirmation requests, unresolved alignment questions, or requests for planner/user answer before implementation.
- Return false only when the implementer appears aligned and ready for a final planner pass.
- Do not include confidence, commentary, markdown, or extra JSON fields.`;
}

export function didPlannerRaiseSevereFlagPrompt(input: {
  readonly phaseNumber: number;
  readonly phaseCount: number;
  readonly plannerPassKind: PlannerPassKind;
  readonly latestPlannerText: string;
}) {
  return `${jsonClassifierPreamble("didPlannerRaiseSevereFlag")}

Decide whether the planner raised a severe flag that needs human intervention before continuing.

Phase:
${input.phaseNumber} of ${input.phaseCount}

Planner pass kind:
${input.plannerPassKind}

Latest non-empty planner assistant response:
${input.latestPlannerText}

Return exactly one JSON object with exactly this field:
{"severeFlag": false}

Rules:
- Severe flags are architecture/product decisions or risks that the planner explicitly says need human intervention before continuing.
- Ordinary nuance, caveats, suggestions, warnings without a stop condition, or an explicit "no flags" should return false.
- Do not include confidence, commentary, markdown, or extra JSON fields.`;
}

export function didPlannerApproveImplementationPrompt(input: {
  readonly phaseNumber: number;
  readonly phaseCount: number;
  readonly latestPlannerText: string;
}) {
  return `${jsonClassifierPreamble("didPlannerApproveImplementation")}

Decide whether the planner explicitly approved implementation for phase ${input.phaseNumber} of ${input.phaseCount}.

Latest non-empty planner assistant response:
${input.latestPlannerText}

Return exactly one JSON object with exactly this field:
{"approved": true}

Rules:
- Return true only when the planner explicitly says implementation is approved or aligned to begin.
- Return false for nuance, answers, no-flags statements, or ambiguity without explicit approval.
- Do not include confidence, commentary, markdown, or extra JSON fields.`;
}

function jsonClassifierPreamble(key: string) {
  return `You are a headless workflow classifier for Isagi.

Judgment key:
${key}`;
}

function parseJsonObject(output: string): unknown {
  const jsonText = extractJsonObject(output);
  return JSON.parse(jsonText) as unknown;
}

function extractJsonObject(output: string): string {
  const first = output.indexOf("{");
  const last = output.lastIndexOf("}");
  if (first < 0 || last < first) {
    throw new Error("Headless judgment output did not contain a JSON object.");
  }
  return output.slice(first, last + 1);
}

function validateDiscoveryResult(value: unknown): DiscoveryResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Discovery result must be a JSON object.");
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expected = [
    "completedPhaseCount",
    "decisionLogPath",
    "entryPlanPath",
    "nextPhaseToImplement",
    "phaseCount",
    "planReferenceFound",
  ].sort();
  if (
    keys.length !== expected.length ||
    keys.some((key, index) => key !== expected[index])
  ) {
    throw new Error(
      `Discovery result must contain exactly these fields: ${expected.join(", ")}.`,
    );
  }
  if (typeof record.planReferenceFound !== "boolean") {
    throw new Error(
      "Discovery result field planReferenceFound must be boolean.",
    );
  }
  if (record.planReferenceFound === false) {
    return {
      planReferenceFound: false,
      entryPlanPath: record.entryPlanPath,
      decisionLogPath: record.decisionLogPath,
      phaseCount: record.phaseCount,
      completedPhaseCount: record.completedPhaseCount,
      nextPhaseToImplement: record.nextPhaseToImplement,
    };
  }
  if (
    typeof record.entryPlanPath !== "string" ||
    record.entryPlanPath.trim().length === 0
  ) {
    throw new Error(
      "Discovery result field entryPlanPath must be a non-empty string.",
    );
  }
  if (
    typeof record.decisionLogPath !== "string" ||
    record.decisionLogPath.trim().length === 0
  ) {
    throw new Error(
      "Discovery result field decisionLogPath must be a non-empty string.",
    );
  }
  if (
    typeof record.phaseCount !== "number" ||
    !Number.isInteger(record.phaseCount) ||
    record.phaseCount <= 0
  ) {
    throw new Error(
      "Discovery result field phaseCount must be a positive integer.",
    );
  }
  if (
    typeof record.completedPhaseCount !== "number" ||
    !Number.isInteger(record.completedPhaseCount) ||
    record.completedPhaseCount < 0 ||
    record.completedPhaseCount > record.phaseCount
  ) {
    throw new Error(
      "Discovery result field completedPhaseCount must be an integer between 0 and phaseCount.",
    );
  }
  if (
    typeof record.nextPhaseToImplement !== "number" ||
    !Number.isInteger(record.nextPhaseToImplement) ||
    record.nextPhaseToImplement !== record.completedPhaseCount + 1 ||
    record.nextPhaseToImplement > record.phaseCount + 1
  ) {
    throw new Error(
      "Discovery result field nextPhaseToImplement must be completedPhaseCount + 1 and no greater than phaseCount + 1.",
    );
  }
  return {
    planReferenceFound: true,
    entryPlanPath: record.entryPlanPath,
    decisionLogPath: record.decisionLogPath,
    phaseCount: record.phaseCount,
    completedPhaseCount: record.completedPhaseCount,
    nextPhaseToImplement: record.nextPhaseToImplement,
  };
}

function resolveDiscoveredPath(path: string, worktreePath: string) {
  return resolve(isAbsolute(path) ? path : resolve(worktreePath, path));
}

function validateBooleanOnly<Key extends string>(
  value: unknown,
  key: Key,
): { readonly [Property in Key]: boolean } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${key} result must be a JSON object.`);
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 1 || keys[0] !== key) {
    throw new Error(`${key} result must contain exactly one field: ${key}.`);
  }
  if (typeof record[key] !== "boolean") {
    throw new Error(`${key} result field ${key} must be boolean.`);
  }
  return { [key]: record[key] } as { readonly [Property in Key]: boolean };
}
