import {
  event as workflowEvent,
  type WorkflowHeadlessResult,
} from '@yourtechbudstudio/isagi-workflow-sdk';

import type { PlanPhase } from './judgments.js';

export type CommitResult = {
  readonly outcome: 'commit-created';
  readonly commit: string;
  readonly subject: string;
};

export function commitPrompt(input: {
  readonly worktreePath: string;
  readonly phase: PlanPhase;
  readonly phaseCount: number;
  readonly entryPlanPath: string;
}): string {
  const allowedPrefixes = prefixesForPhase(input.phase);
  const prefixInstruction =
    allowedPrefixes.length === 1
      ? `The subject must begin with the exact prefix \`${allowedPrefixes[0]}\`.`
      : `Choose the prefix that best matches the phase contract and actual diff. The subject must begin with exactly one of: ${allowedPrefixes.map((prefix) => `\`${prefix}\``).join(', ')}.`;

  return `You are the unattended commit agent for an Isagi workflow.

Create the Git commit yourself now. Do not merely describe commands, suggest a commit message, or stop after inspecting the worktree.

Worktree root:
${input.worktreePath}

Entry plan, relative to the worktree root:
${input.entryPlanPath}

Current phase:
- Number: ${input.phase.number} of ${input.phaseCount}
- Stable identifier: ${input.phase.slug}
- Type: ${input.phase.type}

Read the entry plan and current phase file, then inspect the actual Git diff before choosing the subject.

Required procedure:
1. Change to the worktree root and inspect the current Git status.
2. Stage every change with \`git add -A\`. This must include already-staged changes, tracked unstaged changes, deletions, and untracked files.
3. Confirm that the index contains changes to commit. A clean index is a failure; do not report success.
4. Choose a concise commit subject describing the completed phase. ${prefixInstruction}
5. For non-draft commits, use \`feat:\` for a new capability, \`fix:\` for corrected behavior, and \`chore:\` for maintenance, refactoring, documentation, tests, or release work that is neither a feature nor a fix. Choose by the dominant outcome of the phase contract and diff.
6. Execute \`git commit --signoff\` yourself using that subject.
7. Verify the created commit with Git. Confirm its full commit hash and exact subject.

Safety rules:
- Never amend an existing commit.
- Never reset, restore, checkout, clean, discard, or otherwise remove worktree changes.
- Never push.
- Do not create more than one commit.
- If any command fails, stop and report the failure instead of claiming success.

After the commit is created and verified, return exactly one JSON object with exactly these fields and no markdown or commentary:
{"outcome":"commit-created","commit":"<full commit hash>","subject":"${allowedPrefixes.length === 1 ? `${allowedPrefixes[0]}<subject>` : '<prefix><subject>'}"}`;
}

export function completedSingleCommitResult(event: unknown): WorkflowHeadlessResult {
  const results = workflowEvent.getHeadlessAgentResults(event);
  if (!results) {
    throw new Error('Workflow resumed with a non-headless commit event.');
  }
  if (results.length !== 1) {
    throw new Error(`Expected exactly one commit result, received ${results.length}.`);
  }
  const result = results[0];
  if (!result || result.status !== 'completed') {
    const error = result?.error ? `: ${result.error}` : '';
    throw new Error(`Commit agent did not complete${error}.`);
  }
  return result;
}

export function parseCommitResult(output: string, phase: PlanPhase): CommitResult {
  const value = JSON.parse(extractJsonObject(output)) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Commit result must be a JSON object.');
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expected = ['commit', 'outcome', 'subject'];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error(`Commit result must contain exactly these fields: ${expected.join(', ')}.`);
  }
  if (record.outcome !== 'commit-created') {
    throw new Error('Commit outcome must be commit-created.');
  }
  if (typeof record.commit !== 'string' || !/^[0-9a-f]{40,64}$/u.test(record.commit)) {
    throw new Error('Commit hash must be a full hexadecimal Git object id.');
  }
  if (typeof record.subject !== 'string' || !hasAllowedPrefix(record.subject, phase)) {
    throw new Error(
      `Commit subject for phase type ${phase.type} must begin with ${formatAllowedPrefixes(phase)}.`,
    );
  }
  return {
    outcome: record.outcome,
    commit: record.commit,
    subject: record.subject,
  };
}

function prefixesForPhase(phase: PlanPhase): readonly string[] {
  switch (phase.type) {
    case 'prep':
    case 'mock-ui':
      return ['draft: '];
    case 'implementation':
    case 'release':
      return ['feat: ', 'fix: ', 'chore: '];
  }
}

function hasAllowedPrefix(subject: string, phase: PlanPhase): boolean {
  return prefixesForPhase(phase).some(
    (prefix) => subject.startsWith(prefix) && subject.length > prefix.length,
  );
}

function formatAllowedPrefixes(phase: PlanPhase): string {
  return prefixesForPhase(phase)
    .map((prefix) => prefix.trim())
    .join(', ');
}

function extractJsonObject(output: string): string {
  const first = output.indexOf('{');
  const last = output.lastIndexOf('}');
  if (first < 0 || last < first) {
    throw new Error('Commit output did not contain a JSON object.');
  }
  return output.slice(first, last + 1);
}
