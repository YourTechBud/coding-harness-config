import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';

import { checkpointPrompt, isWorktreeClean, verifyCheckpoint } from '../src/checkpoint.js';

function repository(t: TestContext): string {
  const path = mkdtempSync(join(tmpdir(), 'story-checkpoint-'));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  git(path, ['init', '-q']);
  git(path, ['config', 'user.name', 'Workflow Test']);
  git(path, ['config', 'user.email', 'test@example.invalid']);
  git(path, ['config', 'commit.gpgsign', 'false']);
  git(path, ['config', 'core.hooksPath', '/dev/null']);
  return path;
}

function git(path: string, args: string[]): string {
  return execFileSync('git', args, { cwd: path, encoding: 'utf8' }).trim();
}

function event(record: unknown, opId = 'commit-1') {
  return { kind: 'headless_agent', results: [{ opId, status: 'completed', output: JSON.stringify(record) }] };
}

test('clean detection includes staged, unstaged, deleted, and non-ignored untracked changes but ignores mocks', (t) => {
  const path = repository(t);
  writeFileSync(join(path, '.git/info/exclude'), 'scratch/\n');
  mkdirSync(join(path, 'scratch'));
  writeFileSync(join(path, 'scratch/mock.html'), '<html>mock</html>');
  assert.equal(isWorktreeClean(path), true);
  writeFileSync(join(path, 'route.ts'), 'mock');
  assert.equal(isWorktreeClean(path), false);
  git(path, ['add', '-A']);
  assert.equal(isWorktreeClean(path), false);
  git(path, ['commit', '-m', 'draft: mock route']);
  assert.equal(isWorktreeClean(path), true);
  writeFileSync(join(path, 'route.ts'), 'changed');
  assert.equal(isWorktreeClean(path), false);
  rmSync(join(path, 'route.ts'));
  assert.equal(isWorktreeClean(path), false);
});

test('checkpoint validates clean skips and rejects dirty or malformed success reports', (t) => {
  const path = repository(t);
  assert.match(verifyCheckpoint(event({ outcome: 'clean' }), 'commit-1', path, true), /No commit needed/);
  assert.throws(() => verifyCheckpoint(event({ outcome: 'clean', extra: true }), 'commit-1', path, true), /Invalid/);
  assert.throws(() => verifyCheckpoint(event({ outcome: 'clean' }, 'other'), 'commit-1', path, true), /Unexpected/);
  assert.throws(() => verifyCheckpoint(event({ outcome: 'failed' }), 'commit-1', path, true), /Invalid/);
  writeFileSync(join(path, 'uncommitted'), 'work');
  assert.throws(() => verifyCheckpoint(event({ outcome: 'clean' }), 'commit-1', path, true), /outstanding/);
});

test('checkpoint validates the actual commit and draft subject', (t) => {
  const path = repository(t);
  writeFileSync(join(path, 'route.ts'), 'mock');
  git(path, ['add', '-A']);
  const subject = 'draft: mock route';
  git(path, ['commit', '-m', subject]);
  const commit = git(path, ['rev-parse', 'HEAD']);
  const result = { outcome: 'commit-created', commit, subject };
  assert.match(verifyCheckpoint(event(result), 'commit-1', path, true), /Created/);
  assert.throws(() => verifyCheckpoint(event({ ...result, commit: 'a'.repeat(40) }), 'commit-1', path, true), /does not match/);
  assert.throws(() => verifyCheckpoint(event({ ...result, subject: 'docs: overview' }), 'commit-1', path, true), /subject/);
  assert.throws(() => verifyCheckpoint(event({ ...result, subject: 'draft: different' }), 'commit-1', path, true), /does not match/);
});

test('checkpoint prompts preserve ignored files and distinguish UI and documentation commits', () => {
  const ui = checkpointPrompt('/workspace', true);
  const docs = checkpointPrompt('/workspace', false);
  assert.match(ui, /draft: /);
  assert.doesNotMatch(docs, /draft: /);
  for (const prompt of [ui, docs]) {
    assert.match(prompt, /git add -A and git commit --signoff/);
    assert.match(prompt, /Leave ignored files untracked/);
    assert.match(prompt, /Never amend, push, discard changes, or bypass failing hooks/);
    assert.match(prompt, /already clean/);
  }
});
