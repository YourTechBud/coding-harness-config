import { execFileSync } from 'node:child_process';
import { event as workflowEvent } from '@yourtechbudstudio/isagi-workflow-sdk';

function git(worktreePath: string, args: string[]): string {
  return execFileSync('git', args, { cwd: worktreePath, encoding: 'utf8' }).trim();
}

export function isWorktreeClean(worktreePath: string): boolean {
  return git(worktreePath, ['status', '--porcelain=v1', '--untracked-files=all']) === '';
}

export function checkpointPrompt(worktreePath: string, draft: boolean): string {
  return `You are the unattended commit agent for an Isagi workflow.

Check the working tree and index in ${worktreePath}.

If there are outstanding changes, including non-ignored untracked files, review the diff to choose an appropriate commit message and commit all outstanding changes using git add -A and git commit --signoff. ${draft ? 'Use a commit subject beginning with "draft: ".' : 'Use a normal commit message following repository conventions.'}

Leave ignored files untracked. If the working tree and index are already clean, finish without creating a commit.

Verify that the working tree and index are clean afterward. Never amend, push, discard changes, or bypass failing hooks. If committing fails, stop and report the failure.

Return exactly one JSON object without markdown or commentary:
- After creating a commit: {"outcome":"commit-created","commit":"<full commit hash>","subject":"<exact commit subject>"}
- If already clean: {"outcome":"clean"}`;
}

export function verifyCheckpoint(incoming: unknown, opId: string, worktreePath: string, draft: boolean): string {
  const results = workflowEvent.getHeadlessAgentResults(incoming);
  if (!results || results.length !== 1 || results[0]?.opId !== opId) throw new Error('Unexpected commit checkpoint result.');
  const result = results[0];
  if (result.status !== 'completed') throw new Error(`Commit checkpoint failed: ${result.error ?? 'agent failed'}`);
  const record = JSON.parse(result.output ?? '') as Record<string, unknown> | null;
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Invalid commit checkpoint response.');
  if (!isWorktreeClean(worktreePath)) throw new Error('Commit checkpoint left outstanding working-tree or index changes.');
  if (record.outcome === 'clean' && Object.keys(record).length === 1) return 'No commit needed; worktree is clean.';
  if (record.outcome !== 'commit-created' || Object.keys(record).sort().join(',') !== 'commit,outcome,subject') throw new Error('Invalid commit checkpoint outcome.');
  if (typeof record.commit !== 'string' || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(record.commit)) throw new Error('Invalid checkpoint commit hash.');
  if (typeof record.subject !== 'string' || !record.subject.trim() || (draft && !/^draft: .+/.test(record.subject))) throw new Error('Invalid checkpoint commit subject.');
  if (git(worktreePath, ['rev-parse', 'HEAD']) !== record.commit || git(worktreePath, ['log', '-1', '--format=%s']) !== record.subject) throw new Error('Checkpoint result does not match Git HEAD.');
  return `Created ${record.commit}: ${record.subject}`;
}
