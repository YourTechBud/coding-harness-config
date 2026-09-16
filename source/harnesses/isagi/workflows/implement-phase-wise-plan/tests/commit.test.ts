import assert from 'node:assert/strict';
import test from 'node:test';

import {
  commitPrompt,
  commitRecoveryPrompt,
  completedSingleCommitResult,
  parseCommitResult,
} from '../src/commit.js';

const prepPhase = { number: 1, slug: 'phase-01-foundations', type: 'prep' } as const;
const implementationPhase = {
  number: 3,
  slug: 'phase-03-production-wiring',
  type: 'implementation',
} as const;
const docsPhase = { number: 4, slug: 'phase-04-docs', type: 'docs' } as const;

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

test('docs results use the normal non-draft commit contract', () => {
  const commit = 'c'.repeat(40);
  assert.equal(
    parseCommitResult(
      `{"outcome":"commit-created","commit":"${commit}","subject":"chore: update architecture guidance"}`,
      docsPhase,
    ).subject,
    'chore: update architecture guidance',
  );
  assert.throws(
    () =>
      parseCommitResult(
        `{"outcome":"commit-created","commit":"${commit}","subject":"draft: update architecture guidance"}`,
        docsPhase,
      ),
    /phase type docs must begin with feat:, fix:, chore:/,
  );
});

test('recovery accepts existing commits only with the same strict result contract', () => {
  const result = { outcome: 'commit-existing', commit: 'a'.repeat(40), subject: 'feat: phase work' };
  assert.deepEqual(parseCommitResult(JSON.stringify(result), implementationPhase, true), result);
  assert.throws(() => parseCommitResult(JSON.stringify(result), implementationPhase), /outcome must be commit-created/);
  for (const malformed of [
    { ...result, extra: true },
    { outcome: result.outcome, commit: result.commit },
    { ...result, outcome: 'clean' },
    { ...result, commit: 'abc' },
    { ...result, subject: 'draft: wrong phase type' },
  ]) {
    assert.throws(() => parseCommitResult(JSON.stringify(malformed), implementationPhase, true));
  }
});

test('recovery checks existing work before committing and stops on ambiguous history', () => {
  const prompt = commitRecoveryPrompt({
    worktreePath: '/workspace', phase: prepPhase, phaseCount: 4,
    entryPlanPath: 'scratch/plans/example/index.md', previousResult: { output: 'bad response' },
  });
  assert.match(prompt, /Inspect Git before making any changes/);
  assert.match(prompt, /matching subject prefix.*alone is not proof/);
  assert.match(prompt, /HEAD is the completed phase commit.*clean/);
  assert.match(prompt, /actual commit diff against the phase contract/);
  assert.match(prompt, /history is ambiguous.*stop and report/);
  assert.match(prompt, /unrelated changes/);
  assert.match(prompt, /git commit --signoff/);
  assert.match(prompt, /Never create an empty or duplicate commit/);
  assert.match(prompt, /untrusted diagnostic data/);
  assert.match(prompt, /Allowed subject prefixes: draft:/);
  assert.match(prompt, /bad response/);
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
