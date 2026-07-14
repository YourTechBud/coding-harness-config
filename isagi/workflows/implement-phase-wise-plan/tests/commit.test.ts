import assert from 'node:assert/strict';
import test from 'node:test';

import {
  commitPrompt,
  completedSingleCommitResult,
  parseCommitResult,
} from '../src/commit.js';

const prepPhase = { number: 1, slug: 'phase-01-foundations', type: 'prep' } as const;
const implementationPhase = {
  number: 3,
  slug: 'phase-03-production-wiring',
  type: 'implementation',
} as const;

test('commit prompt includes phase context and requires the phase-specific prefix', () => {
  const prompt = commitPrompt({
    worktreePath: '/workspace',
    phase: prepPhase,
    phaseCount: 4,
    entryPlanPath: 'scratch/plans/example/index.md',
  });

  assert.match(prompt, /Create the Git commit yourself now/);
  assert.match(prompt, /phase-01-foundations/);
  assert.match(prompt, /Type: prep/);
  assert.match(prompt, /git add -A/);
  assert.match(prompt, /must begin with the exact prefix `draft: `/);
  assert.match(prompt, /Never push/);
});

test('multi-prefix commit prompt uses a neutral JSON subject example', () => {
  const prompt = commitPrompt({
    worktreePath: '/workspace',
    phase: implementationPhase,
    phaseCount: 4,
    entryPlanPath: 'scratch/plans/example/index.md',
  });

  assert.match(prompt, /"subject":"<prefix><subject>"/);
  assert.doesNotMatch(prompt, /"subject":"feat: <subject>"/);
});

test('prep and mock-ui results require draft subjects', () => {
  const commit = 'a'.repeat(40);
  assert.deepEqual(
    parseCommitResult(
      `{"outcome":"commit-created","commit":"${commit}","subject":"draft: establish foundations"}`,
      prepPhase,
    ),
    { outcome: 'commit-created', commit, subject: 'draft: establish foundations' },
  );
  assert.throws(
    () =>
      parseCommitResult(
        `{"outcome":"commit-created","commit":"${commit}","subject":"chore: establish foundations"}`,
        prepPhase,
      ),
    /phase type prep must begin with draft:/,
  );
});

test('implementation and release results allow only feat, fix, or chore', () => {
  const commit = 'b'.repeat(40);
  for (const prefix of ['feat', 'fix', 'chore'] as const) {
    assert.equal(
      parseCommitResult(
        `{"outcome":"commit-created","commit":"${commit}","subject":"${prefix}: wire production data"}`,
        implementationPhase,
      ).subject,
      `${prefix}: wire production data`,
    );
  }
  assert.throws(
    () =>
      parseCommitResult(
        `{"outcome":"commit-created","commit":"${commit}","subject":"feat(ui): wire production data"}`,
        implementationPhase,
      ),
    /feat:, fix:, chore:/,
  );
  assert.throws(
    () =>
      parseCommitResult(
        `{"outcome":"commit-created","commit":"${commit}","subject":"draft: wire production data"}`,
        implementationPhase,
      ),
    /feat:, fix:, chore:/,
  );
});

test('commit result inspection rejects failed headless operations', () => {
  assert.throws(
    () =>
      completedSingleCommitResult({
        kind: 'headless_agent',
        results: [{ opId: 'commit-1', status: 'failed', error: 'git hook failed' }],
      }),
    /git hook failed/,
  );
});
