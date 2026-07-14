import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import type { WorkflowConversationMessage } from '@yourtechbudstudio/isagi-workflow-sdk';

import {
  latestAssistantTurnText,
  normalizeDiscoveryResult,
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

test('implementer outcomes use the two routing states and reject extra fields', () => {
  assert.deepEqual(parseImplementerOutcomeResult('{"outcome":"phase-complete"}'), {
    outcome: 'phase-complete',
  });
  assert.deepEqual(parseImplementerOutcomeResult('{"outcome":"planner-response-needed"}'), {
    outcome: 'planner-response-needed',
  });
  assert.throws(
    () => parseImplementerOutcomeResult('{"outcome":"phase-complete","confidence":1}'),
    /exactly one field/,
  );
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

test('discovery keeps workspace-relative paths and resets progress when the decision log is absent', () => {
  const worktreePath = mkdtempSync(join(tmpdir(), 'isagi-phase-plan-'));
  try {
    mkdirSync(join(worktreePath, 'docs'), { recursive: true });
    writeFileSync(join(worktreePath, 'docs', 'plan.md'), '# Plan\n', 'utf8');

    assert.deepEqual(
      normalizeDiscoveryResult({
        worktreePath,
        result: {
          planReferenceFound: true,
          entryPlanPath: 'docs/plan.md',
          decisionLogPath: 'docs/plan-decisions.md',
          phaseCount: 4,
          completedPhaseCount: 2,
          nextPhaseToImplement: 3,
        },
      }),
      {
        entryPlanPath: 'docs/plan.md',
        decisionLogPath: 'docs/plan-decisions.md',
        phaseCount: 4,
        completedPhaseCount: 0,
        nextPhaseToImplement: 1,
      },
    );
  } finally {
    rmSync(worktreePath, { recursive: true, force: true });
  }
});

test('discovery rejects absolute paths and paths outside the worktree', () => {
  const worktreePath = mkdtempSync(join(tmpdir(), 'isagi-phase-plan-paths-'));
  try {
    writeFileSync(join(worktreePath, 'plan.md'), '# Plan\n', 'utf8');
    const baseResult = {
      planReferenceFound: true as const,
      entryPlanPath: 'plan.md',
      decisionLogPath: 'decisions.md',
      phaseCount: 1,
      completedPhaseCount: 0,
      nextPhaseToImplement: 1,
    };

    assert.throws(
      () =>
        normalizeDiscoveryResult({
          worktreePath,
          result: { ...baseResult, entryPlanPath: join(worktreePath, 'plan.md') },
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
    writeFileSync(join(worktreePath, 'plan.md'), '# Plan\n', 'utf8');
    symlinkSync(outsidePath, join(worktreePath, 'linked'));

    assert.throws(
      () =>
        normalizeDiscoveryResult({
          worktreePath,
          result: {
            planReferenceFound: true,
            entryPlanPath: 'plan.md',
            decisionLogPath: 'linked/decisions.md',
            phaseCount: 1,
            completedPhaseCount: 0,
            nextPhaseToImplement: 1,
          },
        }),
      /resolves outside the worktree/,
    );
  } finally {
    rmSync(worktreePath, { recursive: true, force: true });
    rmSync(outsidePath, { recursive: true, force: true });
  }
});

function message(
  role: WorkflowConversationMessage['role'],
  text: string,
): WorkflowConversationMessage {
  return { role, parts: [{ type: 'text', text, state: 'done' }] };
}
