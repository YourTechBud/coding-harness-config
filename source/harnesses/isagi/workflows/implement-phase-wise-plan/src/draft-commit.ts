import {
  event as workflowEvent,
  type WorkflowHeadlessResult,
} from "@yourtechbudstudio/isagi-workflow-sdk";

export type DraftCommitResult = {
  readonly outcome: "draft-commit-created";
  readonly commit: string;
  readonly subject: string;
};

export function draftCommitPrompt(input: {
  readonly worktreePath: string;
  readonly phaseNumber: number;
  readonly phaseCount: number;
  readonly entryPlanPath: string;
}): string {
  return `You are the unattended draft-commit agent for an Isagi workflow.

Create the Git commit yourself now. Do not merely describe commands, suggest a commit message, or stop after inspecting the worktree.

Worktree root:
${input.worktreePath}

Current phase:
${input.phaseNumber} of ${input.phaseCount}

Plan file, relative to the worktree root:
${input.entryPlanPath}

Required procedure:
1. Change to the worktree root and inspect the current Git status.
2. Stage every change with \`git add -A\`. This must include already-staged changes, tracked unstaged changes, deletions, and untracked files.
3. Confirm that the index contains changes to commit. A clean index is a failure; do not report success.
4. Choose a concise commit subject describing the completed phase. The subject must begin with the exact prefix \`draft:\`.
5. Execute \`git commit --signoff\` yourself using that subject.
6. Verify the created commit with Git. Confirm its full commit hash and confirm that its subject begins with \`draft:\`.

Safety rules:
- Never amend an existing commit.
- Never reset, restore, checkout, clean, discard, or otherwise remove worktree changes.
- Never push.
- Do not create more than one commit.
- If any command fails, stop and report the failure instead of claiming success.

After the commit is created and verified, return exactly one JSON object with exactly these fields and no markdown or commentary:
{"outcome":"draft-commit-created","commit":"<full commit hash>","subject":"draft: <subject>"}`;
}

export function completedSingleDraftCommitResult(
  event: unknown,
): WorkflowHeadlessResult {
  const results = workflowEvent.getHeadlessAgentResults(event);
  if (!results) {
    throw new Error("Workflow resumed with a non-headless draft commit event.");
  }
  if (results.length !== 1) {
    throw new Error(
      `Expected exactly one draft commit result, received ${results.length}.`,
    );
  }
  const result = results[0];
  if (!result || result.status !== "completed") {
    const error = result?.error ? `: ${result.error}` : "";
    throw new Error(`Draft commit agent did not complete${error}.`);
  }
  return result;
}

export function parseDraftCommitResult(output: string): DraftCommitResult {
  const value = JSON.parse(extractJsonObject(output)) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Draft commit result must be a JSON object.");
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expected = ["commit", "outcome", "subject"];
  if (
    keys.length !== expected.length ||
    keys.some((key, index) => key !== expected[index])
  ) {
    throw new Error(
      `Draft commit result must contain exactly these fields: ${expected.join(", ")}.`,
    );
  }
  if (record.outcome !== "draft-commit-created") {
    throw new Error("Draft commit outcome must be draft-commit-created.");
  }
  if (
    typeof record.commit !== "string" ||
    !/^[0-9a-f]{40,64}$/u.test(record.commit)
  ) {
    throw new Error(
      "Draft commit hash must be a full hexadecimal Git object id.",
    );
  }
  if (
    typeof record.subject !== "string" ||
    !record.subject.startsWith("draft:")
  ) {
    throw new Error("Draft commit subject must begin with draft:.");
  }
  return {
    outcome: record.outcome,
    commit: record.commit,
    subject: record.subject,
  };
}

function extractJsonObject(output: string): string {
  const first = output.indexOf("{");
  const last = output.lastIndexOf("}");
  if (first < 0 || last < first) {
    throw new Error("Draft commit output did not contain a JSON object.");
  }
  return output.slice(first, last + 1);
}
