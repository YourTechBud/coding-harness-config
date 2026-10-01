import assert from 'node:assert/strict';
import test from 'node:test';

import { pullRequestPrompt, readPullRequestResult, storyLinkLine } from '../src/pull-request.js';

test('story link chooses closing syntax for GitHub issues and a related-story line otherwise', () => {
  assert.equal(storyLinkLine('https://github.com/owner/repository/issues/123'), 'Closes owner/repository#123');
  assert.equal(storyLinkLine('#45'), 'Closes #45');
  assert.equal(storyLinkLine('owner/repository#67'), 'Closes owner/repository#67');
  assert.equal(storyLinkLine('https://linear.app/team/issue/ABC-89/story'), 'Related story: https://linear.app/team/issue/ABC-89/story');
});

test('pull-request prompt assigns authorship and submission to Luna without another commit', () => {
  const prompt = pullRequestPrompt({
    worktreePath: '/workspace',
    story: 'https://github.com/owner/repository/issues/123',
    currentStatePath: 'scratch/story/design/current-state.md',
    architecturePath: 'scratch/story/design/architecture.md',
    programDesignPath: 'scratch/story/design/program-design.md',
    entryPlanPath: 'scratch/story/implementation/index.md',
  });
  assert.match(prompt, /Create or update the pull request yourself now/);
  assert.match(prompt, /all implementation commits have already been made/);
  assert.match(prompt, /Target base branch: main/);
  assert.match(prompt, /Closes owner\/repository#123/);
  assert.match(prompt, /Do not create, amend, reset, or remove commits/);
  assert.match(prompt, /Push the current branch/);
  assert.match(prompt, /exactly these fields and no markdown or commentary/);
});

test('pull-request result requires verified metadata and the exact story link', () => {
  const result = {
    outcome: 'pull-request-submitted',
    number: 123,
    url: 'https://github.com/owner/repository/pull/123',
    title: 'Deliver the story',
    body: '## Summary\n\nDelivered.\n\nCloses owner/repository#123',
    baseBranch: 'main',
    headBranch: 'story-123',
    state: 'OPEN',
  };
  assert.deepEqual(readPullRequestResult(event(JSON.stringify(result)), 'https://github.com/owner/repository/issues/123'), result);
  assert.throws(() => readPullRequestResult(event(JSON.stringify({ ...result, body: 'No story link.' })), 'https://github.com/owner/repository/issues/123'), /story-link line/);
  assert.throws(() => readPullRequestResult(event(JSON.stringify({ ...result, body: `${result.body}\n\nCloses owner/repository#123` })), 'https://github.com/owner/repository/issues/123'), /exactly once/);
  assert.throws(() => readPullRequestResult(event(JSON.stringify({ ...result, state: 'CLOSED' })), 'https://github.com/owner/repository/issues/123'), /must be open/);
  assert.throws(() => readPullRequestResult(event(JSON.stringify({ ...result, extra: true })), 'https://github.com/owner/repository/issues/123'), /exactly these fields/);
  assert.throws(() => readPullRequestResult({ operationId: 'pr-1', status: 'failed', error: 'gh failed' }, 'https://github.com/owner/repository/issues/123'), /Pull-request agent did not complete: gh failed/);
});

function event(output: string) {
  return { operationId: 'pr-1', status: 'completed' as const, output };
}
