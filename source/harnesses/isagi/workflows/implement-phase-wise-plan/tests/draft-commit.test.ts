import assert from 'node:assert/strict';
import test from 'node:test';

import {
  completedSingleDraftCommitResult,
  draftCommitPrompt,
  parseDraftCommitResult,
} from '../src/draft-commit.js';

test('draft commit prompt requires the agent to stage untracked files and execute the commit', () => {
  const prompt = draftCommitPrompt({
    worktreePath: '/workspace',
    phaseNumber: 2,
    phaseCount: 4,
    entryPlanPath: 'docs/plan.md',
  });

  assert.match(prompt, /Create the Git commit yourself now/);
  assert.match(prompt, /git add -A/);
  assert.match(prompt, /untracked files/);
  assert.match(prompt, /must begin with the exact prefix `draft:`/);
  assert.match(prompt, /Never push/);
});

test('draft commit result requires a full hash and draft-prefixed subject', () => {
  const commit = 'a'.repeat(40);
  assert.deepEqual(
    parseDraftCommitResult(
      `{"outcome":"draft-commit-created","commit":"${commit}","subject":"draft: implement phase 2"}`,
    ),
    {
      outcome: 'draft-commit-created',
      commit,
      subject: 'draft: implement phase 2',
    },
  );
  assert.throws(
    () =>
      parseDraftCommitResult(
        `{"outcome":"draft-commit-created","commit":"${commit}","subject":"implement phase 2"}`,
      ),
    /must begin with draft:/,
  );
});

test('draft commit result inspection rejects failed headless operations', () => {
  assert.throws(
    () =>
      completedSingleDraftCommitResult({
        kind: 'headless_agent',
        results: [{ opId: 'commit-1', status: 'failed', error: 'git hook failed' }],
      }),
    /git hook failed/,
  );
});
