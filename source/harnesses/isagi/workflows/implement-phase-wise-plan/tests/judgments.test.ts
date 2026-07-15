import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import type { WorkflowConversationMessage } from '@yourtechbudstudio/isagi-workflow-sdk';

import {
  classifyImplementerOutcomePrompt,
  latestAssistantTurnText,
  normalizeDiscoveryResult,
  parseDiscoveryResult,
  parseImplementerOutcomeResult,
  parsePlannerOutcomeResult,
} from '../src/judgments.js';

test('latestAssistantTurnText collects every assistant message in the latest completed turn', () => {
  const history: readonly WorkflowConversationMessage[] = [
    message('user', 'older prompt'),
    message('assistant', 'older response'),
    message('user', 'workflow prompt'),
    message('assistant', 'first response segment'),
    message('system', 'harness metadata'),
    message('assistant', 'final response segment'),
    message('user', 'a later unanswered user message'),
  ];

  assert.equal(
    latestAssistantTurnText(history),
    'first response segment\n\nfinal response segment',
  );
});

test('latestAssistantTurnText returns null when no assistant text exists', () => {
  assert.equal(latestAssistantTurnText([message('user', 'hello')]), null);
});

test('implementer outcomes include required human verification and reject extra fields', () => {
  assert.deepEqual(parseImplementerOutcomeResult('{"outcome":"phase-complete"}'), {
    outcome: 'phase-complete',
  });
  assert.deepEqual(
    parseImplementerOutcomeResult(
      '{"outcome":"phase-complete-awaiting-human-verification"}',
    ),
    { outcome: 'phase-complete-awaiting-human-verification' },
  );
  assert.deepEqual(parseImplementerOutcomeResult('{"outcome":"planner-response-needed"}'), {
    outcome: 'planner-response-needed',
  });
  assert.throws(
    () => parseImplementerOutcomeResult('{"outcome":"phase-complete","confidence":1}'),
    /exactly one field/,
  );
});

test('implementer outcome prompt separates required manual verification from incomplete work', () => {
  const prompt = classifyImplementerOutcomePrompt({
    worktreePath: '/workspace',
    phaseNumber: 2,
    phaseCount: 4,
    entryPlanPath: 'docs/plan.md',
    implementerTurn: 'Implementation is done, but a human must verify it on a real device.',
  });

  assert.match(prompt, /phase-complete-awaiting-human-verification/);
  assert.match(prompt, /required verification remains/);
  assert.match(prompt, /could not perform/);
  assert.match(prompt, /optional follow-up suggestions/);
  assert.match(prompt, /does not require a planner response/);
});

test('planner outcomes use one tagged result including severe flags', () => {
  for (const outcome of ['severe-flag', 'approved', 'feedback'] as const) {
    assert.deepEqual(parsePlannerOutcomeResult(`{"outcome":"${outcome}"}`), { outcome });
  }
  assert.throws(
    () => parsePlannerOutcomeResult('{"outcome":"no-flags"}'),
    /severe-flag, approved, feedback/,
  );
});

test('discovery parser accepts the canonical phase array and rejects derived fields', () => {
  assert.deepEqual(
    parseDiscoveryResult(
      JSON.stringify({
        planReferenceFound: true,
        entryPlanPath: 'scratch/plans/example/index.md',
        decisionLogPath: 'scratch/plans/example/decisions.md',
        phases,
        completedPhaseCount: 1,
      }),
    ),
    {
      planReferenceFound: true,
      entryPlanPath: 'scratch/plans/example/index.md',
      decisionLogPath: 'scratch/plans/example/decisions.md',
      phases,
      completedPhaseCount: 1,
    },
  );
  assert.throws(
    () =>
      parseDiscoveryResult(
        JSON.stringify({
          planReferenceFound: true,
          entryPlanPath: 'scratch/plans/example/index.md',
          decisionLogPath: 'scratch/plans/example/decisions.md',
          phases,
          completedPhaseCount: 1,
          phaseCount: 2,
        }),
      ),
    /exactly these fields/,
  );
});

test('discovery keeps workspace-relative paths and resets progress when the decision log is absent', () => {
  const worktreePath = mkdtempSync(join(tmpdir(), 'isagi-phase-plan-'));
  try {
    createPlan(worktreePath);

    assert.deepEqual(
      normalizeDiscoveryResult({
        worktreePath,
        result: {
          planReferenceFound: true,
          entryPlanPath: 'scratch/plans/example/index.md',
          decisionLogPath: 'scratch/plans/example/decisions.md',
          phases,
          completedPhaseCount: 2,
        },
      }),
      {
        entryPlanPath: 'scratch/plans/example/index.md',
        decisionLogPath: 'scratch/plans/example/decisions.md',
        phases,
        currentPhaseIndex: 0,
      },
    );
  } finally {
    rmSync(worktreePath, { recursive: true, force: true });
  }
});

test('discovery rejects absolute paths and paths outside the worktree', () => {
  const worktreePath = mkdtempSync(join(tmpdir(), 'isagi-phase-plan-paths-'));
  try {
    createPlan(worktreePath);
    const baseResult = {
      planReferenceFound: true as const,
      entryPlanPath: 'scratch/plans/example/index.md',
      decisionLogPath: 'scratch/plans/example/decisions.md',
      phases,
      completedPhaseCount: 0,
    };

    assert.throws(
      () =>
        normalizeDiscoveryResult({
          worktreePath,
          result: { ...baseResult, phases: [phases[0]] },
        }),
      /do not match canonical phase files/,
    );
    assert.throws(
      () =>
        normalizeDiscoveryResult({
          worktreePath,
          result: { ...baseResult, entryPlanPath: join(worktreePath, 'scratch/plans/example/index.md') },
        }),
      /must be relative/,
    );
    assert.throws(
      () =>
        normalizeDiscoveryResult({
          worktreePath,
          result: { ...baseResult, entryPlanPath: '../plan.md' },
        }),
      /outside the worktree/,
    );
  } finally {
    rmSync(worktreePath, { recursive: true, force: true });
  }
});

test('discovery rejects a future decision log beneath a symlink outside the worktree', () => {
  const worktreePath = mkdtempSync(join(tmpdir(), 'isagi-phase-plan-symlink-'));
  const outsidePath = mkdtempSync(join(tmpdir(), 'isagi-phase-plan-outside-'));
  try {
    createPlan(worktreePath);
    symlinkSync(outsidePath, join(worktreePath, 'linked'));

    assert.throws(
      () =>
        normalizeDiscoveryResult({
          worktreePath,
          result: {
            planReferenceFound: true,
            entryPlanPath: 'scratch/plans/example/index.md',
            decisionLogPath: 'linked/decisions.md',
            phases,
            completedPhaseCount: 0,
          },
        }),
      /resolves outside the worktree/,
    );
  } finally {
    rmSync(worktreePath, { recursive: true, force: true });
    rmSync(outsidePath, { recursive: true, force: true });
  }
});

test('discovery rejects non-contiguous phase metadata and frontmatter mismatches', () => {
  const worktreePath = mkdtempSync(join(tmpdir(), 'isagi-phase-plan-contract-'));
  try {
    createPlan(worktreePath);
    const baseResult = {
      planReferenceFound: true as const,
      entryPlanPath: 'scratch/plans/example/index.md',
      decisionLogPath: 'scratch/plans/example/decisions.md',
      completedPhaseCount: 0,
    };

    assert.throws(
      () =>
        normalizeDiscoveryResult({
          worktreePath,
          result: { ...baseResult, phases: [{ ...phases[0], number: 2 }, phases[1]] },
        }),
      /expected contiguous phase number 1/,
    );
    assert.throws(
      () =>
        normalizeDiscoveryResult({
          worktreePath,
          result: { ...baseResult, phases: [{ ...phases[0], type: 'release' }, phases[1]] },
        }),
      /does not match frontmatter type prep/,
    );
  } finally {
    rmSync(worktreePath, { recursive: true, force: true });
  }
});

const phases = [
  { number: 1, slug: 'phase-01-foundations', type: 'prep' },
  { number: 2, slug: 'phase-02-dashboard-mock', type: 'mock-ui' },
] as const;

function createPlan(worktreePath: string): void {
  const planDirectory = join(worktreePath, 'scratch', 'plans', 'example');
  mkdirSync(planDirectory, { recursive: true });
  writeFileSync(
    join(planDirectory, 'index.md'),
    `# Plan\n\n${phases.map((phase) => `- [${phase.slug}](${phase.slug}.md)`).join('\n')}\n`,
    'utf8',
  );
  for (const phase of phases) {
    writeFileSync(
      join(planDirectory, `${phase.slug}.md`),
      `---\ntype: ${phase.type}\ndepends_on: []\npays_back_in: []\n---\n\n# Phase\n`,
      'utf8',
    );
  }
}

function message(
  role: WorkflowConversationMessage['role'],
  text: string,
): WorkflowConversationMessage {
  return { role, parts: [{ type: 'text', text, state: 'done' }] };
}
