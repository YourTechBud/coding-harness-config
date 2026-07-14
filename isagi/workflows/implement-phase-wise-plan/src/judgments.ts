import { existsSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import type { WorkflowConversationMessage, WorkflowHeadlessResult } from '@yourtechbudstudio/isagi-workflow-sdk';
import { event as workflowEvent } from '@yourtechbudstudio/isagi-workflow-sdk';

import type { ImplementerKind } from './constants.js';

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

export type PhaseImplementationKindResult = {
  readonly implementationKind: ImplementerKind;
};

export type ImplementerOutcome = 'phase-complete' | 'planner-response-needed';

export type ImplementerOutcomeResult = {
  readonly outcome: ImplementerOutcome;
};

export type PlannerOutcome = 'severe-flag' | 'approved' | 'feedback';

export type PlannerOutcomeResult = {
  readonly outcome: PlannerOutcome;
};

export function latestAssistantTurnText(
  history: readonly WorkflowConversationMessage[],
): string | null {
  let finalAssistantIndex = -1;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message?.role === 'assistant' && messageText(message)) {
      finalAssistantIndex = index;
      break;
    }
  }
  if (finalAssistantIndex < 0) return null;

  let precedingUserIndex = -1;
  for (let index = finalAssistantIndex - 1; index >= 0; index -= 1) {
    if (history[index]?.role === 'user') {
      precedingUserIndex = index;
      break;
    }
  }

  const turnText = history
    .slice(precedingUserIndex + 1, finalAssistantIndex + 1)
    .filter((message) => message.role === 'assistant')
    .map(messageText)
    .filter((text) => text.length > 0)
    .join('\n\n')
    .trim();
  return turnText.length > 0 ? turnText : null;
}

export function completedSingleHeadlessJudgmentResult(event: unknown): WorkflowHeadlessResult {
  const results = workflowEvent.getHeadlessAgentResults(event);
  if (!results) {
    throw new Error('Workflow resumed with a non-headless judgment event.');
  }
  if (results.length !== 1) {
    throw new Error(`Expected exactly one headless judgment result, received ${results.length}.`);
  }
  const result = results[0];
  if (!result || result.status !== 'completed') {
    const error = result?.error ? `: ${result.error}` : '';
    throw new Error(`Headless judgment did not complete${error}.`);
  }
  return result;
}

export function parseDiscoveryResult(output: string): DiscoveryResult {
  return validateDiscoveryResult(parseJsonObject(output));
}

export function parsePhaseImplementationKindResult(output: string): PhaseImplementationKindResult {
  return validateImplementationKindResult(parseJsonObject(output));
}

export function parseImplementerOutcomeResult(output: string): ImplementerOutcomeResult {
  return validateStringEnumOnly(parseJsonObject(output), 'outcome', [
    'phase-complete',
    'planner-response-needed',
  ] as const);
}

export function parsePlannerOutcomeResult(output: string): PlannerOutcomeResult {
  return validateStringEnumOnly(parseJsonObject(output), 'outcome', [
    'severe-flag',
    'approved',
    'feedback',
  ] as const);
}

export function normalizeDiscoveryResult(input: {
  readonly result: DiscoveryResult;
  readonly worktreePath: string;
}): NormalizedDiscoveryResult | null {
  if (input.result.planReferenceFound === false) return null;

  const entryPlanPath = normalizeWorkspaceRelativePath({
    path: input.result.entryPlanPath,
    worktreePath: input.worktreePath,
    label: 'plan',
    mustExist: true,
  });
  const decisionLogPath = normalizeWorkspaceRelativePath({
    path: input.result.decisionLogPath,
    worktreePath: input.worktreePath,
    label: 'decision log',
    mustExist: false,
  });
  const decisionLogExists = existsSync(resolve(input.worktreePath, decisionLogPath));
  const completedPhaseCount = decisionLogExists ? input.result.completedPhaseCount : 0;
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
  return `${jsonClassifierPreamble('discoverPlan')}

Find the phase-wise implementation plan referenced by the focused planner agent, then determine where the workflow should resume.

Worktree root:
${input.worktreePath}

Planner agent session id:
${input.plannerSessionId}

Full planner conversation history:
${input.plannerConversation}

You may inspect files under the worktree root. Resolve paths against the worktree root, but return workspace-relative paths.
Return exactly one JSON object with exactly these fields:
{
  "planReferenceFound": true,
  "entryPlanPath": "docs/plans/current-plan.md",
  "decisionLogPath": "docs/plans/current-plan-decisions.md",
  "phaseCount": 4,
  "completedPhaseCount": 3,
  "nextPhaseToImplement": 4
}

Rules:
- If there is no phase-wise plan reference, return:
  {"planReferenceFound": false, "entryPlanPath": null, "decisionLogPath": null, "phaseCount": null, "completedPhaseCount": null, "nextPhaseToImplement": null}
- When planReferenceFound is true, entryPlanPath must be the path to the entry plan file relative to the worktree root. Never return an absolute path or a path outside the worktree.
- When planReferenceFound is true, decisionLogPath must be the path relative to the worktree root where the plan says phase decisions are or will be recorded. Never return an absolute path or a path outside the worktree.
- When planReferenceFound is true, phaseCount must be the positive integer count of phases in that plan.
- Use the full conversation history to identify the current plan reference. Consider both user and assistant messages.
- If multiple plan references appear, choose the latest current or agreed phase-wise plan, not stale examples or superseded paths.
- The decision log file may not exist yet. If it does not exist, implementation has not started; return completedPhaseCount 0 and nextPhaseToImplement 1.
- If the decision log file exists, inspect it and count the consecutive implemented phase prefix from phase 1. A phase with a decision entry is implemented; a phase without a decision entry is not implemented yet. Stop at the first missing phase even if a later phase appears in the decision file.
- completedPhaseCount must be the number of consecutive implemented phases starting at phase 1, clamped to the range 0..phaseCount.
- nextPhaseToImplement must be completedPhaseCount + 1. If all phases are complete, return phaseCount + 1.`;
}

export function classifyPhaseImplementationKindPrompt(input: {
  readonly worktreePath: string;
  readonly phaseNumber: number;
  readonly phaseCount: number;
  readonly entryPlanPath: string;
}) {
  return `${jsonClassifierPreamble('classifyPhaseImplementationKind')}

Inspect the phase-wise implementation plan and classify the primary nature of work for phase ${input.phaseNumber} of ${input.phaseCount}.

Worktree root:
${input.worktreePath}

Entry plan path, relative to the worktree root:
${input.entryPlanPath}

You may inspect files under the worktree root and the plan file. Judge only this phase, not the whole plan. Classify the kind of work to be done, not file extensions.

Return exactly one JSON object with exactly this field:
{"implementationKind": "ui-heavy"}

Rules:
- Return "ui-heavy" only when the phase's main deliverable changes user-visible UI: screens, layout, styling, visual interaction behavior, accessibility affordances, or mobile app UI.
- Do not return "ui-heavy" merely because files live in the frontend package. Frontend-internal logic, data flow, API/client wiring, validation, caching, state machines, tests, refactors, or non-visual hooks/utilities are "generic" unless they materially change the UI the user sees or interacts with.
- Examples that should usually be "ui-heavy": React components that render or restructure screens, CSS, Tailwind, browser layout, visual styling, screen-specific presentation or interaction state, design-system implementation, mobile views, and user-facing app surfaces.
- Return "prose-heavy" when the phase's primary success criterion is writing quality, clarity, structure, tone, or text-heavy output rather than code implementation.
- Examples that should usually be "prose-heavy": documentation, ADRs, engineering guidance, skills, README material, product copy, workflow prompts, and other substantial prose or narrative artifacts.
- Return "generic" for implementation work that is neither ui-heavy nor prose-heavy.
- Examples that should usually be "generic": runtime APIs, contracts, CLI tools, workflow orchestration, harness/process work, persistence, backend services, frontend data/model logic, tests, and refactors where prose or UI work is incidental.
- If a phase includes multiple kinds of work, choose the kind that would most benefit from a specialized implementer for the phase's main deliverable.
- Do not include confidence, commentary, markdown, or extra JSON fields.`;
}

export function classifyImplementerOutcomePrompt(input: {
  readonly worktreePath: string;
  readonly phaseNumber: number;
  readonly phaseCount: number;
  readonly entryPlanPath: string;
  readonly implementerTurn: string;
}) {
  return `${jsonClassifierPreamble('classifyImplementerOutcome')}

Classify the implementer's latest complete assistant turn for phase ${input.phaseNumber} of ${input.phaseCount}.

Worktree root:
${input.worktreePath}

Entry plan path, relative to the worktree root:
${input.entryPlanPath}

Latest implementer assistant turn:
${input.implementerTurn}

Return exactly one JSON object with exactly this field:
{"outcome": "planner-response-needed"}

Rules:
- Return "phase-complete" only when the implementer clearly reports that the current phase's implementation is finished.
- Return "planner-response-needed" for every other response: questions, pushback, alignment summaries, readiness to begin, proposed scope changes, claims that the phase should be skipped, partial progress, blocked work, requests for action, or ambiguous completion language.
- A response saying the implementer is aligned or has no more questions is not phase completion.
- Prefer "planner-response-needed" when uncertain. One additional adversarial exchange is safer than advancing an incomplete phase.
- Do not verify the decision log. This judgment classifies the implementer's reported outcome only.
- Do not include confidence, commentary, markdown, or extra JSON fields.`;
}

export function classifyPlannerOutcomePrompt(input: {
  readonly phaseNumber: number;
  readonly phaseCount: number;
  readonly plannerTurn: string;
}) {
  return `${jsonClassifierPreamble('classifyPlannerOutcome')}

Classify the planner's latest complete assistant turn for phase ${input.phaseNumber} of ${input.phaseCount}.

Latest planner assistant turn:
${input.plannerTurn}

Return exactly one JSON object with exactly this field:
{"outcome": "feedback"}

Apply this precedence:
1. "severe-flag"
2. "approved"
3. "feedback"

Rules:
- Return "severe-flag" when the planner explicitly reports one or more active severe flags that require human intervention before work continues. A FLAGS section with a severe architectural or product flag qualifies.
- Do not return "severe-flag" for "no flags", "no severe flags", resolved or historical flags, ordinary caveats, nuances, suggestions, or warnings without a human stop condition.
- When an active severe flag exists, return "severe-flag" even if another part of the response sounds approving.
- Otherwise, return "approved" only when the planner explicitly approves implementation or clearly gives consent to begin.
- Return "feedback" for answers, corrections, pushback, nuance, non-severe flags, or any response without explicit approval.
- Do not include confidence, commentary, markdown, or extra JSON fields.`;
}

function jsonClassifierPreamble(key: string) {
  return `You are a headless workflow classifier for Isagi.

Judgment key:
${key}`;
}

function messageText(message: WorkflowConversationMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim();
}

function parseJsonObject(output: string): unknown {
  const jsonText = extractJsonObject(output);
  return JSON.parse(jsonText) as unknown;
}

function extractJsonObject(output: string): string {
  const first = output.indexOf('{');
  const last = output.lastIndexOf('}');
  if (first < 0 || last < first) {
    throw new Error('Headless judgment output did not contain a JSON object.');
  }
  return output.slice(first, last + 1);
}

function validateDiscoveryResult(value: unknown): DiscoveryResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Discovery result must be a JSON object.');
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expected = [
    'completedPhaseCount',
    'decisionLogPath',
    'entryPlanPath',
    'nextPhaseToImplement',
    'phaseCount',
    'planReferenceFound',
  ].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error(`Discovery result must contain exactly these fields: ${expected.join(', ')}.`);
  }
  if (typeof record.planReferenceFound !== 'boolean') {
    throw new Error('Discovery result field planReferenceFound must be boolean.');
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
  if (typeof record.entryPlanPath !== 'string' || record.entryPlanPath.trim().length === 0) {
    throw new Error('Discovery result field entryPlanPath must be a non-empty string.');
  }
  if (typeof record.decisionLogPath !== 'string' || record.decisionLogPath.trim().length === 0) {
    throw new Error('Discovery result field decisionLogPath must be a non-empty string.');
  }
  if (
    typeof record.phaseCount !== 'number' ||
    !Number.isInteger(record.phaseCount) ||
    record.phaseCount <= 0
  ) {
    throw new Error('Discovery result field phaseCount must be a positive integer.');
  }
  if (
    typeof record.completedPhaseCount !== 'number' ||
    !Number.isInteger(record.completedPhaseCount) ||
    record.completedPhaseCount < 0 ||
    record.completedPhaseCount > record.phaseCount
  ) {
    throw new Error(
      'Discovery result field completedPhaseCount must be an integer between 0 and phaseCount.',
    );
  }
  if (
    typeof record.nextPhaseToImplement !== 'number' ||
    !Number.isInteger(record.nextPhaseToImplement) ||
    record.nextPhaseToImplement !== record.completedPhaseCount + 1 ||
    record.nextPhaseToImplement > record.phaseCount + 1
  ) {
    throw new Error(
      'Discovery result field nextPhaseToImplement must be completedPhaseCount + 1 and no greater than phaseCount + 1.',
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

function validateImplementationKindResult(value: unknown): PhaseImplementationKindResult {
  return validateStringEnumOnly(value, 'implementationKind', [
    'ui-heavy',
    'prose-heavy',
    'generic',
  ] as const);
}

function validateStringEnumOnly<Key extends string, Value extends string>(
  value: unknown,
  key: Key,
  allowed: readonly Value[],
): { readonly [Property in Key]: Value } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${key} result must be a JSON object.`);
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 1 || keys[0] !== key) {
    throw new Error(`${key} result must contain exactly one field: ${key}.`);
  }
  const result = record[key];
  if (typeof result !== 'string' || !allowed.includes(result as Value)) {
    throw new Error(`${key} result field ${key} must be one of: ${allowed.join(', ')}.`);
  }
  return { [key]: result } as { readonly [Property in Key]: Value };
}

function normalizeWorkspaceRelativePath(input: {
  readonly path: string;
  readonly worktreePath: string;
  readonly label: string;
  readonly mustExist: boolean;
}): string {
  if (isAbsolute(input.path)) {
    throw new Error(`Discovered ${input.label} path must be relative to the worktree root.`);
  }

  const absolutePath = resolve(input.worktreePath, input.path);
  const relativePath = relative(input.worktreePath, absolutePath);
  if (
    relativePath.length === 0 ||
    isAbsolute(relativePath) ||
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`)
  ) {
    throw new Error(`Discovered ${input.label} path is outside the worktree: ${input.path}`);
  }

  if (!existsSync(absolutePath)) {
    if (input.mustExist) {
      throw new Error(`Discovered ${input.label} path does not exist: ${relativePath}`);
    }
    assertRealPathInsideWorktree({
      path: nearestExistingAncestor(absolutePath),
      worktreePath: input.worktreePath,
      label: input.label,
      displayPath: relativePath,
    });
    return relativePath;
  }
  if (!statSync(absolutePath).isFile()) {
    throw new Error(`Discovered ${input.label} path is not a file: ${relativePath}`);
  }

  assertRealPathInsideWorktree({
    path: absolutePath,
    worktreePath: input.worktreePath,
    label: input.label,
    displayPath: relativePath,
  });
  return relativePath;
}

function nearestExistingAncestor(path: string): string {
  let candidate = path;
  while (!existsSync(candidate)) {
    const parent = dirname(candidate);
    if (parent === candidate) return candidate;
    candidate = parent;
  }
  return candidate;
}

function assertRealPathInsideWorktree(input: {
  readonly path: string;
  readonly worktreePath: string;
  readonly label: string;
  readonly displayPath: string;
}): void {
  const realWorktreePath = realpathSync(input.worktreePath);
  const realPath = realpathSync(input.path);
  const realRelativePath = relative(realWorktreePath, realPath);
  if (
    isAbsolute(realRelativePath) ||
    realRelativePath === '..' ||
    realRelativePath.startsWith(`..${sep}`)
  ) {
    throw new Error(
      `Discovered ${input.label} path resolves outside the worktree: ${input.displayPath}`,
    );
  }
}
