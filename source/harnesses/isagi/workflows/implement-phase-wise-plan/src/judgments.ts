import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import type {
  WorkflowConversationMessage,
  WorkflowHeadlessResult,
} from '@yourtechbudstudio/isagi-workflow-sdk';
import { event as workflowEvent } from '@yourtechbudstudio/isagi-workflow-sdk';

import type { ImplementerKind } from './constants.js';

export type DiscoveryResult =
  | {
      readonly planReferenceFound: false;
      readonly entryPlanPath?: unknown;
      readonly decisionLogPath?: unknown;
      readonly phases?: unknown;
      readonly completedPhaseCount?: unknown;
    }
  | {
      readonly planReferenceFound: true;
      readonly entryPlanPath: string;
      readonly decisionLogPath: string;
      readonly phases: readonly PlanPhase[];
      readonly completedPhaseCount: number;
    };

export type PhaseType = 'prep' | 'mock-ui' | 'implementation' | 'release';

export type PlanPhase = {
  readonly number: number;
  readonly slug: string;
  readonly type: PhaseType;
};

export type NormalizedDiscoveryResult = {
  readonly entryPlanPath: string;
  readonly decisionLogPath: string;
  readonly phases: readonly PlanPhase[];
  readonly currentPhaseIndex: number;
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
  validatePlanPhases({
    phases: input.result.phases,
    entryPlanPath,
    worktreePath: input.worktreePath,
  });
  return {
    entryPlanPath,
    decisionLogPath,
    phases: input.result.phases,
    currentPhaseIndex: completedPhaseCount,
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
  "entryPlanPath": "scratch/plans/current-plan/index.md",
  "decisionLogPath": "scratch/plans/current-plan/decisions.md",
  "phases": [
    {"number": 1, "slug": "phase-01-foundations", "type": "prep"},
    {"number": 2, "slug": "phase-02-interface-mock", "type": "mock-ui"},
    {"number": 3, "slug": "phase-03-production-wiring", "type": "implementation"}
  ],
  "completedPhaseCount": 1
}

Rules:
- If there is no phase-wise plan reference, return:
  {"planReferenceFound": false, "entryPlanPath": null, "decisionLogPath": null, "phases": null, "completedPhaseCount": null}
- When planReferenceFound is true, entryPlanPath must be the path to the entry plan file relative to the worktree root. Never return an absolute path or a path outside the worktree.
- When planReferenceFound is true, decisionLogPath must be the path relative to the worktree root where the plan says phase decisions are or will be recorded. Never return an absolute path or a path outside the worktree.
- When planReferenceFound is true, phases must contain every phase in plan order. Read each linked phase file and return its one-based number, complete filename stem as slug, and frontmatter type.
- Phase type must be exactly one of "prep", "mock-ui", "implementation", or "release". Do not classify or infer a different type from the prose when frontmatter supplies it.
- Use the full conversation history to identify the current plan reference. Consider both user and assistant messages.
- If multiple plan references appear, choose the latest current or agreed phase-wise plan, not stale examples or superseded paths.
- The decision log file may not exist yet. If it does not exist, implementation has not started; return completedPhaseCount 0.
- If the decision log file exists, inspect it and count the consecutive implemented phase prefix from phase 1. A phase with a decision entry is implemented; a phase without a decision entry is not implemented yet. Stop at the first missing phase even if a later phase appears in the decision file.
- completedPhaseCount must be the number of consecutive implemented phases starting at phase 1, clamped to the range 0..phases.length.
- Do not include derived fields such as phaseCount or nextPhaseToImplement.`;
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
    'phases',
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
      phases: record.phases,
      completedPhaseCount: record.completedPhaseCount,
    };
  }
  if (typeof record.entryPlanPath !== 'string' || record.entryPlanPath.trim().length === 0) {
    throw new Error('Discovery result field entryPlanPath must be a non-empty string.');
  }
  if (typeof record.decisionLogPath !== 'string' || record.decisionLogPath.trim().length === 0) {
    throw new Error('Discovery result field decisionLogPath must be a non-empty string.');
  }
  const phases = validatePhasesValue(record.phases);
  if (
    typeof record.completedPhaseCount !== 'number' ||
    !Number.isInteger(record.completedPhaseCount) ||
    record.completedPhaseCount < 0 ||
    record.completedPhaseCount > phases.length
  ) {
    throw new Error(
      'Discovery result field completedPhaseCount must be an integer between 0 and phases.length.',
    );
  }
  return {
    planReferenceFound: true,
    entryPlanPath: record.entryPlanPath,
    decisionLogPath: record.decisionLogPath,
    phases,
    completedPhaseCount: record.completedPhaseCount,
  };
}

function validatePhasesValue(value: unknown): readonly PlanPhase[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Discovery result field phases must be a non-empty array.');
  }
  return value.map((phase, index) => {
    if (!phase || typeof phase !== 'object' || Array.isArray(phase)) {
      throw new Error(`Discovery phase ${index + 1} must be a JSON object.`);
    }
    const record = phase as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const expected = ['number', 'slug', 'type'];
    if (keys.length !== expected.length || keys.some((key, keyIndex) => key !== expected[keyIndex])) {
      throw new Error(`Discovery phase ${index + 1} must contain exactly: ${expected.join(', ')}.`);
    }
    if (typeof record.number !== 'number' || !Number.isInteger(record.number)) {
      throw new Error(`Discovery phase ${index + 1} number must be an integer.`);
    }
    if (typeof record.slug !== 'string' || record.slug.length === 0) {
      throw new Error(`Discovery phase ${index + 1} slug must be a non-empty string.`);
    }
    if (!isPhaseType(record.type)) {
      throw new Error(
        `Discovery phase ${index + 1} type must be prep, mock-ui, implementation, or release.`,
      );
    }
    return { number: record.number, slug: record.slug, type: record.type };
  });
}

function isPhaseType(value: unknown): value is PhaseType {
  return (
    value === 'prep' || value === 'mock-ui' || value === 'implementation' || value === 'release'
  );
}

function validateImplementationKindResult(value: unknown): PhaseImplementationKindResult {
  return validateStringEnumOnly(value, 'implementationKind', [
    'ui-heavy',
    'prose-heavy',
    'generic',
  ] as const);
}

function validatePlanPhases(input: {
  readonly phases: readonly PlanPhase[];
  readonly entryPlanPath: string;
  readonly worktreePath: string;
}): void {
  const planDirectory = dirname(input.entryPlanPath);
  const absolutePlanDirectory = resolve(input.worktreePath, planDirectory);
  const expectedPhaseFiles = input.phases.map((phase) => `${phase.slug}.md`);
  const actualPhaseFiles = readdirSync(absolutePlanDirectory)
    .filter((name) => /^phase-[0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/u.test(name));
  if (
    actualPhaseFiles.length !== expectedPhaseFiles.length ||
    actualPhaseFiles.some((name) => !expectedPhaseFiles.includes(name))
  ) {
    throw new Error(
      `Discovered phases do not match canonical phase files. Canonical files: ${actualPhaseFiles.join(', ') || 'none'}; discovered: ${expectedPhaseFiles.join(', ')}.`,
    );
  }

  const entryPlan = readFileSync(resolve(input.worktreePath, input.entryPlanPath), 'utf8');
  let previousLinkIndex = -1;
  const seenSlugs = new Set<string>();
  input.phases.forEach((phase, index) => {
    const expectedNumber = index + 1;
    if (phase.number !== expectedNumber) {
      throw new Error(
        `Phase ${phase.slug} has number ${phase.number}; expected contiguous phase number ${expectedNumber}.`,
      );
    }
    const expectedPrefix = `phase-${String(expectedNumber).padStart(2, '0')}-`;
    if (
      !phase.slug.startsWith(expectedPrefix) ||
      !/^phase-[0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(phase.slug)
    ) {
      throw new Error(
        `Phase ${expectedNumber} slug must be a kebab-case stable identifier beginning with ${expectedPrefix}.`,
      );
    }
    if (seenSlugs.has(phase.slug)) {
      throw new Error(`Phase slug is duplicated: ${phase.slug}.`);
    }
    seenSlugs.add(phase.slug);

    const linkIndex = entryPlan.indexOf(`${phase.slug}.md`);
    if (linkIndex < 0) {
      throw new Error(`Entry plan does not link to phase file ${phase.slug}.md.`);
    }
    if (linkIndex <= previousLinkIndex) {
      throw new Error(`Entry plan phase links are not ordered at ${phase.slug}.md.`);
    }
    previousLinkIndex = linkIndex;

    const phasePath = normalizeWorkspaceRelativePath({
      path: `${planDirectory}/${phase.slug}.md`,
      worktreePath: input.worktreePath,
      label: `phase ${phase.number}`,
      mustExist: true,
    });
    const phaseType = readPhaseType(resolve(input.worktreePath, phasePath), phase.slug);
    if (phaseType !== phase.type) {
      throw new Error(
        `Phase ${phase.slug} discovery type ${phase.type} does not match frontmatter type ${phaseType}.`,
      );
    }
  });
}

function readPhaseType(path: string, slug: string): PhaseType {
  const contents = readFileSync(path, 'utf8');
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(contents)?.[1];
  if (frontmatter === undefined) {
    throw new Error(`Phase ${slug} must begin with YAML frontmatter.`);
  }
  const typeLines = frontmatter
    .split(/\r?\n/u)
    .map((line) => /^type:\s*(\S+)\s*$/u.exec(line)?.[1])
    .filter((value): value is string => value !== undefined);
  if (typeLines.length !== 1 || !isPhaseType(typeLines[0])) {
    throw new Error(
      `Phase ${slug} frontmatter must contain exactly one valid type: prep, mock-ui, implementation, or release.`,
    );
  }
  return typeLines[0];
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
