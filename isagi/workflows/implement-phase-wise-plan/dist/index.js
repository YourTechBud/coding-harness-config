// node_modules/.pnpm/@yourtechbudstudio+isagi-workflow-sdk@0.0.1/node_modules/@yourtechbudstudio/isagi-workflow-sdk/dist/index.js
function r(e) {
  return e;
}
function i(e) {
  return {
    type: "cont",
    state: e
  };
}
function a(e, t) {
  return {
    type: "suspend",
    state: e,
    condition: t
  };
}
var o = {
  agentTurn(e) {
    return {
      kind: "agent_turn",
      agentSessionId: e.agentSessionId,
      sentAt: e.sentAt
    };
  },
  userContinue() {
    return { kind: "user_continue" };
  },
  userInput(e) {
    return {
      kind: "user_input",
      questions: e
    };
  },
  workflow(e) {
    let t = Array.isArray(e) ? e : [e];
    if (t.length === 0) throw Error("Workflow wait requires at least one run id.");
    return {
      kind: "workflow",
      runIds: t
    };
  },
  headlessAgent(e) {
    let t = Array.isArray(e) ? e : [e];
    if (t.length === 0) throw Error("Headless agent wait requires at least one operation.");
    return {
      kind: "headless_agent",
      ops: t
    };
  }
};
var s = {
  isUserContinue(e) {
    return c(e) && e.kind === "user_continue";
  },
  isUserInput(e) {
    return c(e) && e.kind === "user_input" && c(e.answers);
  },
  isAgentTurnEnded(e) {
    return c(e) && e.outcome === "ended" && typeof e.recordedAt == "string";
  },
  isAgentTurnFailed(e) {
    return c(e) && e.outcome === "failed" && typeof e.recordedAt == "string" && typeof e.reason == "string";
  },
  requireAgentTurnEnded(e) {
    if (s.isAgentTurnEnded(e)) return e;
    throw Error("Expected an ended agent turn event.");
  },
  requireAgentTurnFailed(e) {
    if (s.isAgentTurnFailed(e)) return e;
    throw Error("Expected a failed agent turn event.");
  },
  getAgentTurnResult(e) {
    return s.isAgentTurnEnded(e) || s.isAgentTurnFailed(e) ? e : null;
  },
  getWorkflowResults(e) {
    return c(e) && e.kind === "workflow" && Array.isArray(e.results) ? e.results : null;
  },
  getHeadlessAgentResults(e) {
    return c(e) && e.kind === "headless_agent" && Array.isArray(e.results) ? e.results : null;
  }
};
function c(e) {
  return typeof e == "object" && !!e;
}
function l(e) {
  return {
    type: "done",
    value: e
  };
}
function u(e) {
  return {
    type: "fail",
    reason: e
  };
}

// src/constants.ts
var implementerGeneric = {
  kind: "generic",
  harness: "codex",
  model: "gpt-5.6-sol",
  effort: "medium"
};
var implementerUiHeavy = {
  kind: "ui-heavy",
  harness: "claude",
  model: "opus",
  effort: "max"
};
var implementerProseHeavy = {
  kind: "prose-heavy",
  harness: "claude",
  model: "opus",
  effort: "max"
};
var headlessJudgment = {
  harness: "codex",
  model: "gpt-5.6-luna",
  effort: "medium"
};
var draftCommitter = {
  harness: "codex",
  model: "gpt-5.6-luna",
  effort: "low"
};

// src/draft-commit.ts
function draftCommitPrompt(input) {
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
function completedSingleDraftCommitResult(event) {
  const results = s.getHeadlessAgentResults(event);
  if (!results) {
    throw new Error("Workflow resumed with a non-headless draft commit event.");
  }
  if (results.length !== 1) {
    throw new Error(
      `Expected exactly one draft commit result, received ${results.length}.`
    );
  }
  const result = results[0];
  if (!result || result.status !== "completed") {
    const error = result?.error ? `: ${result.error}` : "";
    throw new Error(`Draft commit agent did not complete${error}.`);
  }
  return result;
}
function parseDraftCommitResult(output) {
  const value = JSON.parse(extractJsonObject(output));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Draft commit result must be a JSON object.");
  }
  const record = value;
  const keys = Object.keys(record).sort();
  const expected = ["commit", "outcome", "subject"];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error(
      `Draft commit result must contain exactly these fields: ${expected.join(", ")}.`
    );
  }
  if (record.outcome !== "draft-commit-created") {
    throw new Error("Draft commit outcome must be draft-commit-created.");
  }
  if (typeof record.commit !== "string" || !/^[0-9a-f]{40,64}$/u.test(record.commit)) {
    throw new Error(
      "Draft commit hash must be a full hexadecimal Git object id."
    );
  }
  if (typeof record.subject !== "string" || !record.subject.startsWith("draft:")) {
    throw new Error("Draft commit subject must begin with draft:.");
  }
  return {
    outcome: record.outcome,
    commit: record.commit,
    subject: record.subject
  };
}
function extractJsonObject(output) {
  const first = output.indexOf("{");
  const last = output.lastIndexOf("}");
  if (first < 0 || last < first) {
    throw new Error("Draft commit output did not contain a JSON object.");
  }
  return output.slice(first, last + 1);
}

// src/feedback.ts
function setWorkflowStatus(ctx, status) {
  return ctx.setUiFeedback(renderWorkflowStatus(status));
}
function renderWorkflowStatus(status) {
  switch (status.kind) {
    case "discovering-plan":
      return {
        kind: "info",
        phase: "plan-discovery",
        message: "Finding the current plan"
      };
    case "plan-ready": {
      const next = status.nextPhase > status.phaseCount ? "No remaining phase" : `Phase ${status.nextPhase} of ${status.phaseCount}`;
      return {
        kind: "info",
        phase: "plan-confirmation",
        message: [
          `Plan: ${status.entryPlanPath}`,
          `Decision log: ${status.decisionLogPath}`,
          `Phases: ${status.phaseCount}`,
          `Completed: ${status.completedPhaseCount}`,
          `Next: ${next}`
        ].join("\n\n")
      };
    }
    case "preparing-phase":
      return {
        kind: "info",
        phase: "phase-preparation",
        message: `Choosing an implementer for phase ${status.phase} of ${status.phaseCount}`
      };
    case "implementer-aligning":
      return {
        kind: "info",
        phase: "phase-alignment",
        message: `Implementer reviewing phase ${status.phase} of ${status.phaseCount}`
      };
    case "planner-reviewing":
      return {
        kind: "info",
        phase: "phase-alignment",
        message: `Planner reviewing phase ${status.phase} of ${status.phaseCount}`
      };
    case "implementing":
      return {
        kind: "info",
        phase: "phase-implementation",
        message: `Implementing phase ${status.phase} of ${status.phaseCount}`
      };
    case "severe-flag":
      return {
        kind: "warning",
        phase: "human-intervention",
        message: `Phase ${status.phase} paused \u2014 the planner raised a severe flag.

Resolve it in the planner pane, then Continue. The latest planner response will be sent to the implementer verbatim.`
      };
    case "auto-review":
      return {
        kind: "info",
        phase: "phase-auto-review",
        message: `Reviewing phase ${status.phase} of ${status.phaseCount}`
      };
    case "phase-review":
      return {
        kind: "info",
        phase: "phase-review",
        message: `Phase ${status.phase} of ${status.phaseCount} is ready for approval. Continue to create its draft commit.`
      };
    case "draft-commit":
      return {
        kind: "info",
        phase: "phase-draft-commit",
        message: `Creating a draft commit for phase ${status.phase} of ${status.phaseCount}`
      };
    case "complete":
      return {
        kind: "info",
        phase: "complete",
        message: "Plan implementation complete"
      };
    case "failed":
      return {
        kind: "error",
        phase: "failed",
        message: status.message
      };
    default:
      return assertNever(status);
  }
}
function assertNever(value) {
  throw new Error(`Unsupported workflow status: ${String(value)}`);
}

// src/judgments.ts
import { existsSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
function latestAssistantTurnText(history) {
  let finalAssistantIndex = -1;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message?.role === "assistant" && messageText(message)) {
      finalAssistantIndex = index;
      break;
    }
  }
  if (finalAssistantIndex < 0) return null;
  let precedingUserIndex = -1;
  for (let index = finalAssistantIndex - 1; index >= 0; index -= 1) {
    if (history[index]?.role === "user") {
      precedingUserIndex = index;
      break;
    }
  }
  const turnText = history.slice(precedingUserIndex + 1, finalAssistantIndex + 1).filter((message) => message.role === "assistant").map(messageText).filter((text) => text.length > 0).join("\n\n").trim();
  return turnText.length > 0 ? turnText : null;
}
function completedSingleHeadlessJudgmentResult(event) {
  const results = s.getHeadlessAgentResults(event);
  if (!results) {
    throw new Error("Workflow resumed with a non-headless judgment event.");
  }
  if (results.length !== 1) {
    throw new Error(`Expected exactly one headless judgment result, received ${results.length}.`);
  }
  const result = results[0];
  if (!result || result.status !== "completed") {
    const error = result?.error ? `: ${result.error}` : "";
    throw new Error(`Headless judgment did not complete${error}.`);
  }
  return result;
}
function parseDiscoveryResult(output) {
  return validateDiscoveryResult(parseJsonObject(output));
}
function parsePhaseImplementationKindResult(output) {
  return validateImplementationKindResult(parseJsonObject(output));
}
function parseImplementerOutcomeResult(output) {
  return validateStringEnumOnly(parseJsonObject(output), "outcome", [
    "phase-complete",
    "planner-response-needed"
  ]);
}
function parsePlannerOutcomeResult(output) {
  return validateStringEnumOnly(parseJsonObject(output), "outcome", [
    "severe-flag",
    "approved",
    "feedback"
  ]);
}
function normalizeDiscoveryResult(input) {
  if (input.result.planReferenceFound === false) return null;
  const entryPlanPath = normalizeWorkspaceRelativePath({
    path: input.result.entryPlanPath,
    worktreePath: input.worktreePath,
    label: "plan",
    mustExist: true
  });
  const decisionLogPath = normalizeWorkspaceRelativePath({
    path: input.result.decisionLogPath,
    worktreePath: input.worktreePath,
    label: "decision log",
    mustExist: false
  });
  const decisionLogExists = existsSync(resolve(input.worktreePath, decisionLogPath));
  const completedPhaseCount = decisionLogExists ? input.result.completedPhaseCount : 0;
  return {
    entryPlanPath,
    decisionLogPath,
    phaseCount: input.result.phaseCount,
    completedPhaseCount,
    nextPhaseToImplement: completedPhaseCount === input.result.phaseCount ? input.result.phaseCount + 1 : completedPhaseCount + 1
  };
}
function discoverPlanPrompt(input) {
  return `${jsonClassifierPreamble("discoverPlan")}

Find the phase-wise implementation plan referenced by the focused planner agent, then determine where the workflow should resume.

Worktree root:
${input.worktreePath}

Planner agent session id:
${input.plannerSessionId}

Full planner conversation history:
${input.plannerConversation}

You may inspect files under the worktree root. Resolve paths against the worktree root, but return workspace-relative paths.
Return exactly one JSON object with exactly these fields:
{
  "planReferenceFound": true,
  "entryPlanPath": "docs/plans/current-plan.md",
  "decisionLogPath": "docs/plans/current-plan-decisions.md",
  "phaseCount": 4,
  "completedPhaseCount": 3,
  "nextPhaseToImplement": 4
}

Rules:
- If there is no phase-wise plan reference, return:
  {"planReferenceFound": false, "entryPlanPath": null, "decisionLogPath": null, "phaseCount": null, "completedPhaseCount": null, "nextPhaseToImplement": null}
- When planReferenceFound is true, entryPlanPath must be the path to the entry plan file relative to the worktree root. Never return an absolute path or a path outside the worktree.
- When planReferenceFound is true, decisionLogPath must be the path relative to the worktree root where the plan says phase decisions are or will be recorded. Never return an absolute path or a path outside the worktree.
- When planReferenceFound is true, phaseCount must be the positive integer count of phases in that plan.
- Use the full conversation history to identify the current plan reference. Consider both user and assistant messages.
- If multiple plan references appear, choose the latest current or agreed phase-wise plan, not stale examples or superseded paths.
- The decision log file may not exist yet. If it does not exist, implementation has not started; return completedPhaseCount 0 and nextPhaseToImplement 1.
- If the decision log file exists, inspect it and count the consecutive implemented phase prefix from phase 1. A phase with a decision entry is implemented; a phase without a decision entry is not implemented yet. Stop at the first missing phase even if a later phase appears in the decision file.
- completedPhaseCount must be the number of consecutive implemented phases starting at phase 1, clamped to the range 0..phaseCount.
- nextPhaseToImplement must be completedPhaseCount + 1. If all phases are complete, return phaseCount + 1.`;
}
function classifyPhaseImplementationKindPrompt(input) {
  return `${jsonClassifierPreamble("classifyPhaseImplementationKind")}

Inspect the phase-wise implementation plan and classify the primary nature of work for phase ${input.phaseNumber} of ${input.phaseCount}.

Worktree root:
${input.worktreePath}

Entry plan path, relative to the worktree root:
${input.entryPlanPath}

You may inspect files under the worktree root and the plan file. Judge only this phase, not the whole plan. Classify the kind of work to be done, not file extensions.

Return exactly one JSON object with exactly this field:
{"implementationKind": "ui-heavy"}

Rules:
- Return "ui-heavy" only when the phase's main deliverable changes user-visible UI: screens, layout, styling, visual interaction behavior, accessibility affordances, or mobile app UI.
- Do not return "ui-heavy" merely because files live in the frontend package. Frontend-internal logic, data flow, API/client wiring, validation, caching, state machines, tests, refactors, or non-visual hooks/utilities are "generic" unless they materially change the UI the user sees or interacts with.
- Examples that should usually be "ui-heavy": React components that render or restructure screens, CSS, Tailwind, browser layout, visual styling, screen-specific presentation or interaction state, design-system implementation, mobile views, and user-facing app surfaces.
- Return "prose-heavy" when the phase's primary success criterion is writing quality, clarity, structure, tone, or text-heavy output rather than code implementation.
- Examples that should usually be "prose-heavy": documentation, ADRs, engineering guidance, skills, README material, product copy, workflow prompts, and other substantial prose or narrative artifacts.
- Return "generic" for implementation work that is neither ui-heavy nor prose-heavy.
- Examples that should usually be "generic": runtime APIs, contracts, CLI tools, workflow orchestration, harness/process work, persistence, backend services, frontend data/model logic, tests, and refactors where prose or UI work is incidental.
- If a phase includes multiple kinds of work, choose the kind that would most benefit from a specialized implementer for the phase's main deliverable.
- Do not include confidence, commentary, markdown, or extra JSON fields.`;
}
function classifyImplementerOutcomePrompt(input) {
  return `${jsonClassifierPreamble("classifyImplementerOutcome")}

Classify the implementer's latest complete assistant turn for phase ${input.phaseNumber} of ${input.phaseCount}.

Worktree root:
${input.worktreePath}

Entry plan path, relative to the worktree root:
${input.entryPlanPath}

Latest implementer assistant turn:
${input.implementerTurn}

Return exactly one JSON object with exactly this field:
{"outcome": "planner-response-needed"}

Rules:
- Return "phase-complete" only when the implementer clearly reports that the current phase's implementation is finished.
- Return "planner-response-needed" for every other response: questions, pushback, alignment summaries, readiness to begin, proposed scope changes, claims that the phase should be skipped, partial progress, blocked work, requests for action, or ambiguous completion language.
- A response saying the implementer is aligned or has no more questions is not phase completion.
- Prefer "planner-response-needed" when uncertain. One additional adversarial exchange is safer than advancing an incomplete phase.
- Do not verify the decision log. This judgment classifies the implementer's reported outcome only.
- Do not include confidence, commentary, markdown, or extra JSON fields.`;
}
function classifyPlannerOutcomePrompt(input) {
  return `${jsonClassifierPreamble("classifyPlannerOutcome")}

Classify the planner's latest complete assistant turn for phase ${input.phaseNumber} of ${input.phaseCount}.

Latest planner assistant turn:
${input.plannerTurn}

Return exactly one JSON object with exactly this field:
{"outcome": "feedback"}

Apply this precedence:
1. "severe-flag"
2. "approved"
3. "feedback"

Rules:
- Return "severe-flag" when the planner explicitly reports one or more active severe flags that require human intervention before work continues. A FLAGS section with a severe architectural or product flag qualifies.
- Do not return "severe-flag" for "no flags", "no severe flags", resolved or historical flags, ordinary caveats, nuances, suggestions, or warnings without a human stop condition.
- When an active severe flag exists, return "severe-flag" even if another part of the response sounds approving.
- Otherwise, return "approved" only when the planner explicitly approves implementation or clearly gives consent to begin.
- Return "feedback" for answers, corrections, pushback, nuance, non-severe flags, or any response without explicit approval.
- Do not include confidence, commentary, markdown, or extra JSON fields.`;
}
function jsonClassifierPreamble(key) {
  return `You are a headless workflow classifier for Isagi.

Judgment key:
${key}`;
}
function messageText(message) {
  return message.parts.filter((part) => part.type === "text").map((part) => part.text).join("\n").trim();
}
function parseJsonObject(output) {
  const jsonText = extractJsonObject2(output);
  return JSON.parse(jsonText);
}
function extractJsonObject2(output) {
  const first = output.indexOf("{");
  const last = output.lastIndexOf("}");
  if (first < 0 || last < first) {
    throw new Error("Headless judgment output did not contain a JSON object.");
  }
  return output.slice(first, last + 1);
}
function validateDiscoveryResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Discovery result must be a JSON object.");
  }
  const record = value;
  const keys = Object.keys(record).sort();
  const expected = [
    "completedPhaseCount",
    "decisionLogPath",
    "entryPlanPath",
    "nextPhaseToImplement",
    "phaseCount",
    "planReferenceFound"
  ].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error(`Discovery result must contain exactly these fields: ${expected.join(", ")}.`);
  }
  if (typeof record.planReferenceFound !== "boolean") {
    throw new Error("Discovery result field planReferenceFound must be boolean.");
  }
  if (record.planReferenceFound === false) {
    return {
      planReferenceFound: false,
      entryPlanPath: record.entryPlanPath,
      decisionLogPath: record.decisionLogPath,
      phaseCount: record.phaseCount,
      completedPhaseCount: record.completedPhaseCount,
      nextPhaseToImplement: record.nextPhaseToImplement
    };
  }
  if (typeof record.entryPlanPath !== "string" || record.entryPlanPath.trim().length === 0) {
    throw new Error("Discovery result field entryPlanPath must be a non-empty string.");
  }
  if (typeof record.decisionLogPath !== "string" || record.decisionLogPath.trim().length === 0) {
    throw new Error("Discovery result field decisionLogPath must be a non-empty string.");
  }
  if (typeof record.phaseCount !== "number" || !Number.isInteger(record.phaseCount) || record.phaseCount <= 0) {
    throw new Error("Discovery result field phaseCount must be a positive integer.");
  }
  if (typeof record.completedPhaseCount !== "number" || !Number.isInteger(record.completedPhaseCount) || record.completedPhaseCount < 0 || record.completedPhaseCount > record.phaseCount) {
    throw new Error(
      "Discovery result field completedPhaseCount must be an integer between 0 and phaseCount."
    );
  }
  if (typeof record.nextPhaseToImplement !== "number" || !Number.isInteger(record.nextPhaseToImplement) || record.nextPhaseToImplement !== record.completedPhaseCount + 1 || record.nextPhaseToImplement > record.phaseCount + 1) {
    throw new Error(
      "Discovery result field nextPhaseToImplement must be completedPhaseCount + 1 and no greater than phaseCount + 1."
    );
  }
  return {
    planReferenceFound: true,
    entryPlanPath: record.entryPlanPath,
    decisionLogPath: record.decisionLogPath,
    phaseCount: record.phaseCount,
    completedPhaseCount: record.completedPhaseCount,
    nextPhaseToImplement: record.nextPhaseToImplement
  };
}
function validateImplementationKindResult(value) {
  return validateStringEnumOnly(value, "implementationKind", [
    "ui-heavy",
    "prose-heavy",
    "generic"
  ]);
}
function validateStringEnumOnly(value, key, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${key} result must be a JSON object.`);
  }
  const record = value;
  const keys = Object.keys(record);
  if (keys.length !== 1 || keys[0] !== key) {
    throw new Error(`${key} result must contain exactly one field: ${key}.`);
  }
  const result = record[key];
  if (typeof result !== "string" || !allowed.includes(result)) {
    throw new Error(`${key} result field ${key} must be one of: ${allowed.join(", ")}.`);
  }
  return { [key]: result };
}
function normalizeWorkspaceRelativePath(input) {
  if (isAbsolute(input.path)) {
    throw new Error(`Discovered ${input.label} path must be relative to the worktree root.`);
  }
  const absolutePath = resolve(input.worktreePath, input.path);
  const relativePath = relative(input.worktreePath, absolutePath);
  if (relativePath.length === 0 || isAbsolute(relativePath) || relativePath === ".." || relativePath.startsWith(`..${sep}`)) {
    throw new Error(`Discovered ${input.label} path is outside the worktree: ${input.path}`);
  }
  if (!existsSync(absolutePath)) {
    if (input.mustExist) {
      throw new Error(`Discovered ${input.label} path does not exist: ${relativePath}`);
    }
    assertRealPathInsideWorktree({
      path: nearestExistingAncestor(absolutePath),
      worktreePath: input.worktreePath,
      label: input.label,
      displayPath: relativePath
    });
    return relativePath;
  }
  if (!statSync(absolutePath).isFile()) {
    throw new Error(`Discovered ${input.label} path is not a file: ${relativePath}`);
  }
  assertRealPathInsideWorktree({
    path: absolutePath,
    worktreePath: input.worktreePath,
    label: input.label,
    displayPath: relativePath
  });
  return relativePath;
}
function nearestExistingAncestor(path) {
  let candidate = path;
  while (!existsSync(candidate)) {
    const parent = dirname(candidate);
    if (parent === candidate) return candidate;
    candidate = parent;
  }
  return candidate;
}
function assertRealPathInsideWorktree(input) {
  const realWorktreePath = realpathSync(input.worktreePath);
  const realPath = realpathSync(input.path);
  const realRelativePath = relative(realWorktreePath, realPath);
  if (isAbsolute(realRelativePath) || realRelativePath === ".." || realRelativePath.startsWith(`..${sep}`)) {
    throw new Error(
      `Discovered ${input.label} path resolves outside the worktree: ${input.displayPath}`
    );
  }
}

// src/index.ts
var autoCommitInput = {
  kind: "select",
  key: "autoCommit",
  label: "Automatic draft commit",
  options: [
    { value: "yes", label: "Yes, create a draft commit after each phase" },
    { value: "no", label: "No, leave phase changes uncommitted" }
  ],
  default: "yes"
};
var autoReviewInput = {
  kind: "select",
  key: "autoReview",
  label: "Automatic engineering guidance review",
  options: [
    { value: "yes", label: "Yes, review every completed phase" },
    { value: "no", label: "No, skip automatic review" }
  ],
  default: "yes"
};
var humanInTheLoopInput = {
  kind: "select",
  key: "humanInTheLoop",
  label: "Human in the loop",
  options: [
    { value: "yes", label: "Yes, pause after each phase" },
    { value: "no", label: "No, run through phases" }
  ],
  default: "yes"
};
var index_default = r({
  command: () => ({
    title: "Implement Phase-wise Plan",
    description: "Route a phase-wise plan through a fresh implementer per phase.",
    inputs: [humanInTheLoopInput, autoReviewInput, autoCommitInput]
  }),
  validate: (launchCtx, variables) => {
    if (launchCtx.agentSessionId === null || launchCtx.agentSessionId === void 0) {
      throw new Error("Start this workflow from the planner agent pane.");
    }
    parseHumanInTheLoop(variables.humanInTheLoop);
    parseAutoReview(variables.autoReview);
    parseAutoCommit(variables.autoCommit);
  },
  init: (launchCtx, variables) => ({
    stateVersion: 4,
    autoCommit: parseAutoCommit(variables.autoCommit) === "yes",
    autoReview: parseAutoReview(variables.autoReview) === "yes",
    humanInTheLoop: parseHumanInTheLoop(variables.humanInTheLoop) === "yes",
    plannerSessionId: launchCtx.agentSessionId,
    stage: { kind: "discover-plan" }
  }),
  step: async (ctx, state, event) => {
    await logTransition(ctx, state);
    switch (state.stage.kind) {
      case "discover-plan": {
        await setWorkflowStatus(ctx, { kind: "discovering-plan" });
        const plannerConversation = await fullConversationTextOrFail(ctx, {
          agentSessionId: state.plannerSessionId,
          label: "planner"
        });
        if (!plannerConversation.ok) return plannerConversation.result;
        return startHeadlessJudgment(ctx, {
          judgment: "discoverPlan",
          prompt: discoverPlanPrompt({
            worktreePath: ctx.worktreePath,
            plannerSessionId: state.plannerSessionId,
            plannerConversation: plannerConversation.text
          }),
          nextState: {
            ...state,
            stage: { kind: "await-plan-discovery" }
          }
        });
      }
      case "await-plan-discovery": {
        const judgment = await readHeadlessJudgment(ctx, state, event, {
          name: "discoverPlan",
          failureMessage: "The current plan could not be discovered",
          parse: parseDiscoveryResult
        });
        if (!judgment.ok) return judgment.result;
        const discovery = await normalizeDiscoveryOrFail(ctx, judgment.value, ctx.worktreePath);
        if (!discovery.ok) return discovery.result;
        const normalized = discovery.value;
        if (!normalized) {
          return failWorkflow(
            ctx,
            "No phase-wise plan was found in the planner conversation",
            "No phase-wise plan was found during discovery."
          );
        }
        const activeState = activatePlan(state, normalized);
        await setWorkflowStatus(ctx, {
          kind: "plan-ready",
          entryPlanPath: activeState.plan.entryPlanPath,
          decisionLogPath: activeState.plan.decisionLogPath,
          phaseCount: activeState.plan.phaseCount,
          completedPhaseCount: activeState.plan.completedPhaseCount,
          nextPhase: activeState.plan.currentPhase
        });
        await ctx.log(
          "info",
          `Plan found at ${activeState.plan.entryPlanPath} with ${activeState.plan.phaseCount} phases. Decision log: ${activeState.plan.decisionLogPath}. Completed phases: ${activeState.plan.completedPhaseCount}. Next phase: ${activeState.plan.currentPhase}.`
        );
        return a(activeState, o.userContinue());
      }
      case "confirm-plan": {
        const activeState = requireActiveState(state);
        if (!s.isUserContinue(event)) {
          return failWorkflow(
            ctx,
            "Plan confirmation could not be resumed",
            "Plan confirmation resumed with an unexpected event."
          );
        }
        if (activeState.plan.currentPhase > activeState.plan.phaseCount) {
          await setWorkflowStatus(ctx, { kind: "complete" });
          await ctx.log(
            "info",
            `The decision log already contains all ${activeState.plan.phaseCount} phase decisions.`
          );
          return i(withStage(activeState, { kind: "done" }));
        }
        return i(
          withStage(activeState, {
            kind: "select-implementer"
          })
        );
      }
      case "select-implementer": {
        const activeState = requireActiveState(state);
        await setWorkflowStatus(ctx, {
          kind: "preparing-phase",
          phase: activeState.plan.currentPhase,
          phaseCount: activeState.plan.phaseCount
        });
        return startHeadlessJudgment(ctx, {
          judgment: "classifyPhaseImplementationKind",
          prompt: classifyPhaseImplementationKindPrompt({
            worktreePath: ctx.worktreePath,
            phaseNumber: activeState.plan.currentPhase,
            phaseCount: activeState.plan.phaseCount,
            entryPlanPath: activeState.plan.entryPlanPath
          }),
          nextState: withStage(activeState, {
            kind: "await-implementer-selection"
          })
        });
      }
      case "await-implementer-selection": {
        const activeState = requireActiveState(state);
        const judgment = await readHeadlessJudgment(ctx, state, event, {
          name: "classifyPhaseImplementationKind",
          failureMessage: `The implementer for phase ${activeState.plan.currentPhase} could not be selected`,
          parse: parsePhaseImplementationKindResult
        });
        if (!judgment.ok) return judgment.result;
        const profile = selectImplementerProfile(judgment.value.implementationKind);
        await ctx.log(
          "info",
          `Selected the ${profile.kind} implementer profile for phase ${activeState.plan.currentPhase}.`
        );
        return i(
          withStage(activeState, {
            kind: "spawn-implementer",
            profile
          })
        );
      }
      case "spawn-implementer": {
        const activeState = requireActiveState(state);
        const profile = state.stage.profile;
        await setWorkflowStatus(ctx, {
          kind: "implementer-aligning",
          phase: activeState.plan.currentPhase,
          phaseCount: activeState.plan.phaseCount
        });
        const spawned = await ctx.spawnAgentSession({
          harness: profile.harness,
          model: profile.model,
          effort: profile.effort,
          prompt: initialImplementerPrompt({
            phaseNumber: activeState.plan.currentPhase,
            entryPlanPath: activeState.plan.entryPlanPath
          })
        });
        const implementer = {
          agentSessionId: spawned.agentSessionId,
          paneId: spawned.paneId
        };
        await ctx.log(
          "info",
          `Spawned ${profile.kind} implementer for phase ${activeState.plan.currentPhase}/${activeState.plan.phaseCount}: harness=${profile.harness}, model=${profile.model}, effort=${profile.effort}, agentSessionId=${implementer.agentSessionId}, paneId=${implementer.paneId}.`
        );
        return a(
          withStage(activeState, {
            kind: "await-implementer-turn",
            implementer,
            activity: "alignment",
            exchangeNumber: 1
          }),
          o.agentTurn(spawned)
        );
      }
      case "await-implementer-turn": {
        const activeState = requireActiveState(state);
        const ended = await requireEndedTurn(ctx, event, {
          role: "implementer",
          phaseNumber: activeState.plan.currentPhase
        });
        if (!ended.ok) return ended.result;
        const implementerTurn = await latestAssistantTurnOrFail(ctx, {
          agentSessionId: state.stage.implementer.agentSessionId,
          label: "implementer",
          phaseNumber: activeState.plan.currentPhase
        });
        if (!implementerTurn.ok) return implementerTurn.result;
        return startHeadlessJudgment(ctx, {
          judgment: "classifyImplementerOutcome",
          prompt: classifyImplementerOutcomePrompt({
            worktreePath: ctx.worktreePath,
            phaseNumber: activeState.plan.currentPhase,
            phaseCount: activeState.plan.phaseCount,
            entryPlanPath: activeState.plan.entryPlanPath,
            implementerTurn: implementerTurn.text
          }),
          nextState: withStage(activeState, {
            kind: "await-implementer-outcome",
            implementer: state.stage.implementer,
            implementerTurn: implementerTurn.text,
            exchangeNumber: state.stage.exchangeNumber
          })
        });
      }
      case "await-implementer-outcome": {
        const activeState = requireActiveState(state);
        const judgment = await readHeadlessJudgment(ctx, state, event, {
          name: "classifyImplementerOutcome",
          failureMessage: `The implementer response for phase ${activeState.plan.currentPhase} could not be classified`,
          parse: parseImplementerOutcomeResult
        });
        if (!judgment.ok) return judgment.result;
        if (judgment.value.outcome === "phase-complete") {
          return completePhase(ctx, activeState, state.stage.implementer);
        }
        return routeImplementerTurnToPlanner(ctx, activeState, {
          implementer: state.stage.implementer,
          implementerTurn: state.stage.implementerTurn,
          exchangeNumber: state.stage.exchangeNumber
        });
      }
      case "await-planner-turn": {
        const activeState = requireActiveState(state);
        const ended = await requireEndedTurn(ctx, event, {
          role: "planner",
          phaseNumber: activeState.plan.currentPhase
        });
        if (!ended.ok) return ended.result;
        const plannerTurn = await latestAssistantTurnOrFail(ctx, {
          agentSessionId: activeState.plannerSessionId,
          label: "planner",
          phaseNumber: activeState.plan.currentPhase
        });
        if (!plannerTurn.ok) return plannerTurn.result;
        return startHeadlessJudgment(ctx, {
          judgment: "classifyPlannerOutcome",
          prompt: classifyPlannerOutcomePrompt({
            phaseNumber: activeState.plan.currentPhase,
            phaseCount: activeState.plan.phaseCount,
            plannerTurn: plannerTurn.text
          }),
          nextState: withStage(activeState, {
            kind: "await-planner-outcome",
            implementer: state.stage.implementer,
            plannerTurn: plannerTurn.text,
            exchangeNumber: state.stage.exchangeNumber
          })
        });
      }
      case "await-planner-outcome": {
        const activeState = requireActiveState(state);
        const judgment = await readHeadlessJudgment(ctx, state, event, {
          name: "classifyPlannerOutcome",
          failureMessage: `The planner response for phase ${activeState.plan.currentPhase} could not be classified`,
          parse: parsePlannerOutcomeResult
        });
        if (!judgment.ok) return judgment.result;
        if (judgment.value.outcome === "severe-flag") {
          await setWorkflowStatus(ctx, {
            kind: "severe-flag",
            phase: activeState.plan.currentPhase
          });
          await ctx.log(
            "warning",
            `Planner raised a severe flag during phase ${activeState.plan.currentPhase}; waiting for human resolution.`
          );
          return a(
            withStage(activeState, {
              kind: "await-severe-flag-resolution",
              implementer: state.stage.implementer,
              exchangeNumber: state.stage.exchangeNumber
            }),
            o.userContinue()
          );
        }
        return sendPlannerTurnToImplementer(ctx, activeState, {
          implementer: state.stage.implementer,
          plannerTurn: state.stage.plannerTurn,
          outcome: judgment.value.outcome,
          exchangeNumber: state.stage.exchangeNumber
        });
      }
      case "await-severe-flag-resolution": {
        const activeState = requireActiveState(state);
        if (!s.isUserContinue(event)) {
          return failWorkflow(
            ctx,
            `The severe flag pause for phase ${activeState.plan.currentPhase} could not be resumed`,
            "Severe flag resolution resumed with an unexpected event."
          );
        }
        const plannerTurn = await latestAssistantTurnOrFail(ctx, {
          agentSessionId: activeState.plannerSessionId,
          label: "planner",
          phaseNumber: activeState.plan.currentPhase
        });
        if (!plannerTurn.ok) return plannerTurn.result;
        await ctx.log(
          "info",
          `Human continued after the severe flag in phase ${activeState.plan.currentPhase}; sending the latest planner turn verbatim without reclassification.`
        );
        return sendRawPlannerTurnAfterHumanResolution(ctx, activeState, {
          implementer: state.stage.implementer,
          plannerTurn: plannerTurn.text,
          exchangeNumber: state.stage.exchangeNumber
        });
      }
      case "await-auto-review": {
        const activeState = requireActiveState(state);
        const reviewResult = readSuccessfulReviewChildResult(event, state.stage.runId);
        if (!reviewResult.ok) {
          return failWorkflow(
            ctx,
            `Automatic review failed for phase ${activeState.plan.currentPhase}`,
            `Automatic review child workflow ${state.stage.runId} failed: ${reviewResult.reason}`
          );
        }
        await ctx.log(
          "info",
          `Automatic review child workflow ${state.stage.runId} completed phase ${activeState.plan.currentPhase} after ${reviewResult.reviewCount} review rounds.`
        );
        return continueAfterAutoReview(ctx, activeState, state.stage.implementer);
      }
      case "await-phase-review": {
        const activeState = requireActiveState(state);
        if (!s.isUserContinue(event)) {
          return failWorkflow(
            ctx,
            `Phase ${activeState.plan.currentPhase} review could not be resumed`,
            "Phase review resumed with an unexpected event."
          );
        }
        await ctx.log("info", `Human review completed for phase ${activeState.plan.currentPhase}.`);
        return continueAfterHumanApproval(activeState, state.stage.implementer);
      }
      case "start-draft-commit": {
        const activeState = requireActiveState(state);
        await setWorkflowStatus(ctx, {
          kind: "draft-commit",
          phase: activeState.plan.currentPhase,
          phaseCount: activeState.plan.phaseCount
        });
        const op = await ctx.runHeadlessAgent({
          harness: draftCommitter.harness,
          model: draftCommitter.model,
          effort: draftCommitter.effort,
          prompt: draftCommitPrompt({
            worktreePath: ctx.worktreePath,
            phaseNumber: activeState.plan.currentPhase,
            phaseCount: activeState.plan.phaseCount,
            entryPlanPath: activeState.plan.entryPlanPath
          })
        });
        await ctx.log(
          "info",
          `Started draft commit op ${op.opId} for phase ${activeState.plan.currentPhase}.`
        );
        return a(
          withStage(activeState, {
            kind: "await-draft-commit",
            implementer: state.stage.implementer
          }),
          o.headlessAgent(op)
        );
      }
      case "await-draft-commit": {
        const activeState = requireActiveState(state);
        try {
          const result = completedSingleDraftCommitResult(event);
          const commit = parseDraftCommitResult(result.output ?? "");
          await ctx.log(
            "info",
            `Created draft commit ${commit.commit} for phase ${activeState.plan.currentPhase}: ${commit.subject}.`
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return failWorkflow(
            ctx,
            `Draft commit failed for phase ${activeState.plan.currentPhase}`,
            `Draft commit failed for phase ${activeState.plan.currentPhase}: ${message}`
          );
        }
        return i(
          withStage(activeState, {
            kind: "advance-phase",
            implementer: state.stage.implementer
          })
        );
      }
      case "advance-phase": {
        const activeState = requireActiveState(state);
        if (activeState.plan.currentPhase >= activeState.plan.phaseCount) {
          await setWorkflowStatus(ctx, { kind: "complete" });
          await ctx.log(
            "info",
            `Plan implementation completed after phase ${activeState.plan.currentPhase}/${activeState.plan.phaseCount}. Final implementer pane remains open.`
          );
          return i(
            withStage(activeState, {
              kind: "done",
              finalImplementer: state.stage.implementer
            })
          );
        }
        await ctx.log(
          "info",
          `Closing implementer pane ${state.stage.implementer.paneId} after phase ${activeState.plan.currentPhase}.`
        );
        await ctx.closePane(state.stage.implementer.paneId);
        return i({
          ...activeState,
          plan: {
            ...activeState.plan,
            currentPhase: activeState.plan.currentPhase + 1
          },
          stage: { kind: "select-implementer" }
        });
      }
      case "done": {
        const activeState = requireActiveState(state);
        return l({
          entryPlanPath: activeState.plan.entryPlanPath,
          decisionLogPath: activeState.plan.decisionLogPath,
          phaseCount: activeState.plan.phaseCount,
          completedPhaseCount: activeState.plan.completedPhaseCount,
          nextPhaseToImplement: activeState.plan.phaseCount + 1,
          finalImplementerPaneId: state.stage.finalImplementer?.paneId
        });
      }
      default:
        return assertNever2(state.stage);
    }
  }
});
function activatePlan(state, discovered) {
  return {
    stateVersion: state.stateVersion,
    autoCommit: state.autoCommit,
    autoReview: state.autoReview,
    humanInTheLoop: state.humanInTheLoop,
    plannerSessionId: state.plannerSessionId,
    plan: {
      entryPlanPath: discovered.entryPlanPath,
      decisionLogPath: discovered.decisionLogPath,
      phaseCount: discovered.phaseCount,
      completedPhaseCount: discovered.completedPhaseCount,
      currentPhase: discovered.nextPhaseToImplement
    },
    stage: { kind: "confirm-plan" }
  };
}
async function normalizeDiscoveryOrFail(ctx, result, worktreePath) {
  try {
    return {
      ok: true,
      value: normalizeDiscoveryResult({ result, worktreePath })
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      result: await failWorkflow(
        ctx,
        `The discovered plan could not be used: ${message}`,
        `Plan discovery validation failed: ${message}`
      )
    };
  }
}
async function routeImplementerTurnToPlanner(ctx, state, input) {
  await setWorkflowStatus(ctx, {
    kind: "planner-reviewing",
    phase: state.plan.currentPhase,
    phaseCount: state.plan.phaseCount
  });
  await ctx.log(
    "info",
    `Sending implementer exchange ${input.exchangeNumber} for phase ${state.plan.currentPhase} to planner session ${state.plannerSessionId}.`
  );
  const sent = await ctx.sendAgentPrompt({
    agentSessionId: state.plannerSessionId,
    prompt: plannerPrompt({
      phaseNumber: state.plan.currentPhase,
      implementerTurn: input.implementerTurn
    })
  });
  return a(
    withStage(state, {
      kind: "await-planner-turn",
      implementer: input.implementer,
      exchangeNumber: input.exchangeNumber
    }),
    o.agentTurn(sent)
  );
}
async function sendPlannerTurnToImplementer(ctx, state, input) {
  const approved = input.outcome === "approved";
  await setWorkflowStatus(ctx, {
    kind: approved ? "implementing" : "implementer-aligning",
    phase: state.plan.currentPhase,
    phaseCount: state.plan.phaseCount
  });
  await ctx.log(
    "info",
    approved ? `Planner approved phase ${state.plan.currentPhase}; sending its response verbatim to implementer session ${input.implementer.agentSessionId}.` : `Planner returned feedback for phase ${state.plan.currentPhase}; sending its response with the alignment footer to implementer session ${input.implementer.agentSessionId}.`
  );
  const sent = await ctx.sendAgentPrompt({
    agentSessionId: input.implementer.agentSessionId,
    prompt: approved ? input.plannerTurn : implementerFollowUpPrompt(input.plannerTurn)
  });
  return a(
    withStage(state, {
      kind: "await-implementer-turn",
      implementer: input.implementer,
      activity: approved ? "implementation" : "alignment",
      exchangeNumber: input.exchangeNumber + 1
    }),
    o.agentTurn(sent)
  );
}
async function sendRawPlannerTurnAfterHumanResolution(ctx, state, input) {
  await setWorkflowStatus(ctx, {
    kind: "implementing",
    phase: state.plan.currentPhase,
    phaseCount: state.plan.phaseCount
  });
  const sent = await ctx.sendAgentPrompt({
    agentSessionId: input.implementer.agentSessionId,
    prompt: input.plannerTurn
  });
  return a(
    withStage(state, {
      kind: "await-implementer-turn",
      implementer: input.implementer,
      activity: "implementation",
      exchangeNumber: input.exchangeNumber + 1
    }),
    o.agentTurn(sent)
  );
}
async function completePhase(ctx, state, implementer) {
  const completedState = {
    ...state,
    plan: {
      ...state.plan,
      completedPhaseCount: Math.max(state.plan.completedPhaseCount, state.plan.currentPhase)
    }
  };
  await ctx.log("info", `Phase ${state.plan.currentPhase}/${state.plan.phaseCount} completed.`);
  if (state.autoReview) {
    await setWorkflowStatus(ctx, {
      kind: "auto-review",
      phase: state.plan.currentPhase,
      phaseCount: state.plan.phaseCount
    });
    const context = `We are currently implementing phase ${state.plan.currentPhase} of the plan in ${state.plan.entryPlanPath}. Review all the changes since HEAD.`;
    const runId = await ctx.startWorkflow("engineering-guidance-review-loop", { context });
    await ctx.log(
      "info",
      `Started automatic review child workflow ${runId} for phase ${state.plan.currentPhase}.`
    );
    return a(
      withStage(completedState, {
        kind: "await-auto-review",
        implementer,
        runId
      }),
      o.workflow(runId)
    );
  }
  return continueAfterAutoReview(ctx, completedState, implementer);
}
async function continueAfterAutoReview(ctx, state, implementer) {
  if (state.humanInTheLoop) {
    await setWorkflowStatus(ctx, {
      kind: "phase-review",
      phase: state.plan.currentPhase,
      phaseCount: state.plan.phaseCount
    });
    return a(
      withStage(state, { kind: "await-phase-review", implementer }),
      o.userContinue()
    );
  }
  return continueAfterHumanApproval(state, implementer);
}
function continueAfterHumanApproval(state, implementer) {
  return i(
    withStage(state, {
      kind: state.autoCommit ? "start-draft-commit" : "advance-phase",
      implementer
    })
  );
}
function readSuccessfulReviewChildResult(event, expectedRunId) {
  const results = s.getWorkflowResults(event);
  if (!results) {
    return { ok: false, reason: "workflow resumed with a non-workflow event" };
  }
  if (results.length !== 1) {
    return {
      ok: false,
      reason: `expected one child result, received ${results.length}`
    };
  }
  const child = results[0];
  if (!child || child.runId !== expectedRunId) {
    return {
      ok: false,
      reason: `expected child run ${expectedRunId}, received ${child?.runId ?? "none"}`
    };
  }
  if (child.status !== "done") {
    return {
      ok: false,
      reason: `child run failed${child.error === void 0 ? "" : `: ${describeUnknown(child.error)}`}`
    };
  }
  if (!child.result || typeof child.result !== "object" || Array.isArray(child.result)) {
    return { ok: false, reason: "child result was not an object" };
  }
  const result = child.result;
  const keys = Object.keys(result).sort();
  if (keys.length !== 2 || keys[0] !== "outcome" || keys[1] !== "reviewCount") {
    return {
      ok: false,
      reason: "child result did not match the review workflow success contract"
    };
  }
  if (result.outcome !== "workflow-executed-successfully") {
    return {
      ok: false,
      reason: "child result did not report workflow-executed-successfully"
    };
  }
  if (typeof result.reviewCount !== "number" || !Number.isInteger(result.reviewCount) || result.reviewCount < 1) {
    return { ok: false, reason: "child result reviewCount was invalid" };
  }
  return { ok: true, reviewCount: result.reviewCount };
}
function describeUnknown(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
async function startHeadlessJudgment(ctx, input) {
  await ctx.log("info", `Starting ${input.judgment} headless judgment.`);
  const op = await ctx.runHeadlessAgent({
    harness: headlessJudgment.harness,
    model: headlessJudgment.model,
    effort: headlessJudgment.effort,
    prompt: input.prompt
  });
  await ctx.log("info", `Started ${input.judgment} headless judgment op ${op.opId}.`);
  return a(input.nextState, o.headlessAgent(op));
}
async function readHeadlessJudgment(ctx, state, event, input) {
  const rawOutput = headlessRawOutput(event);
  try {
    const result = completedSingleHeadlessJudgmentResult(event);
    const value = input.parse(result.output ?? "");
    await ctx.log("info", `Parsed ${input.name} result: ${JSON.stringify(value)}.`);
    return { ok: true, value };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await ctx.log("error", `${input.name} failed in ${state.stage.kind}: ${message}`);
    if (rawOutput.length > 0) {
      await ctx.log("error", `Raw ${input.name} output: ${rawOutput}`);
    }
    await setWorkflowStatus(ctx, {
      kind: "failed",
      message: input.failureMessage
    });
    return { ok: false, result: u(`${input.name} failed: ${message}`) };
  }
}
async function requireEndedTurn(ctx, event, input) {
  if (s.isAgentTurnEnded(event)) return { ok: true };
  const role = input.role === "planner" ? "Planner" : "Implementer";
  if (s.isAgentTurnFailed(event)) {
    return {
      ok: false,
      result: await failWorkflow(
        ctx,
        `${role} turn failed during phase ${input.phaseNumber}`,
        `${role} turn failed during phase ${input.phaseNumber}: ${event.reason}`
      )
    };
  }
  return {
    ok: false,
    result: await failWorkflow(
      ctx,
      `${role} turn for phase ${input.phaseNumber} could not be resumed`,
      `${role} turn wait resumed with an unexpected event.`
    )
  };
}
async function latestAssistantTurnOrFail(ctx, input) {
  const history = await ctx.getConversationHistory(input.agentSessionId);
  const text = latestAssistantTurnText(history);
  if (text) return { ok: true, text };
  return {
    ok: false,
    result: await failWorkflow(
      ctx,
      `No ${input.label} response was found for phase ${input.phaseNumber}`,
      `${input.label} session ${input.agentSessionId} has no complete assistant turn to inspect.`
    )
  };
}
async function fullConversationTextOrFail(ctx, input) {
  const history = await ctx.getConversationHistory(input.agentSessionId);
  const text = formatConversationHistory(history);
  if (text) return { ok: true, text };
  return {
    ok: false,
    result: await failWorkflow(
      ctx,
      "The planner conversation is empty",
      `${input.label} session ${input.agentSessionId} has no conversation text to inspect.`
    )
  };
}
function formatConversationHistory(history) {
  return history.map((message, index) => {
    const text = message.parts.filter((part) => part.type === "text").map((part) => part.text).join("\n").trim();
    if (!text) return "";
    return `Message ${index + 1} (${message.role}):
${text}`;
  }).filter((entry) => entry.length > 0).join("\n\n");
}
function initialImplementerPrompt(input) {
  return `Implement the phase ${input.phaseNumber} in ${input.entryPlanPath}.

${alignmentFooter()}`;
}
function implementerFollowUpPrompt(plannerTurn) {
  return `${plannerTurn}

${alignmentFooter()}`;
}
function alignmentFooter() {
  return `I want you to:

- Ask clarifying questions till we have shared understanding and complete alignment on what needs to be done. Do not use the askUserQuestion tool.
- Pushback on my ideas.
- Try to flag or highlight major shortcomings or opportunities to simplify logic.
- Clearly state your understanding
- Let me know once we have alignment to begin implementation
- Never start implementing unless I explicitly say so.`;
}
function plannerPrompt(input) {
  return `I am implementing phase ${input.phaseNumber}. Make sure that I am aligned.

${input.implementerTurn}

I want you to:

- Pushback on my understanding.
- Answer my questions. Make sure the answers are grounded in our current conversation, ADRs, and guidance.
- Feel free to refactor or update the phase scope if pushbacks make sense, are easy to implement, or simplify the logic. Remind me to document the same in the decision log instead of modifying the plan file.
- Flag major questions or decisions which were not covered by our conversation which can impact our architecture in a severe way to me. Make sure to include all necessary context so I can understand why it's a flag and how to address it. Explicitly mention "no flags" if we are good.
- Always mention the nuances and considerations that I may be missing to make sure I have deep understanding.
- Try to keep fallback logic to a minimum. Introduce new fallback logic only if absolutely necessary
- Only approve implementation once I have no clarifying questions in my most recent message.`;
}
function selectImplementerProfile(kind) {
  switch (kind) {
    case "ui-heavy":
      return implementerUiHeavy;
    case "prose-heavy":
      return implementerProseHeavy;
    case "generic":
      return implementerGeneric;
    default:
      return assertNever2(kind);
  }
}
function activateCommonState(state) {
  return {
    stateVersion: state.stateVersion,
    autoCommit: state.autoCommit,
    autoReview: state.autoReview,
    humanInTheLoop: state.humanInTheLoop,
    plannerSessionId: state.plannerSessionId
  };
}
function requireActiveState(state) {
  if (!("plan" in state)) {
    throw new Error(`Workflow stage ${state.stage.kind} requires an active plan.`);
  }
  return state;
}
function withStage(state, stage) {
  return { ...activateCommonState(state), plan: state.plan, stage };
}
function parseHumanInTheLoop(value) {
  if (value === void 0) return "yes";
  if (value === "yes" || value === "no") return value;
  throw new Error("Human in the loop must be yes or no.");
}
function parseAutoReview(value) {
  if (value === void 0) return "yes";
  if (value === "yes" || value === "no") return value;
  throw new Error("Automatic review must be yes or no.");
}
function parseAutoCommit(value) {
  if (value === void 0) return "yes";
  if (value === "yes" || value === "no") return value;
  throw new Error("Automatic draft commit must be yes or no.");
}
function headlessRawOutput(event) {
  if (!event || typeof event !== "object") return "";
  const results = event.results;
  if (!Array.isArray(results)) return "";
  const output = results[0]?.output;
  return typeof output === "string" ? output : "";
}
async function failWorkflow(ctx, userMessage, diagnostic) {
  await setWorkflowStatus(ctx, { kind: "failed", message: userMessage });
  await ctx.log("error", diagnostic);
  return u(diagnostic);
}
async function logTransition(ctx, state) {
  const phase = "plan" in state ? `${state.plan.currentPhase}/${state.plan.phaseCount}` : "unknown";
  const completed = "plan" in state ? state.plan.completedPhaseCount : "unknown";
  await ctx.log(
    "debug",
    `Workflow step stage=${state.stage.kind}, phase=${phase}, completedPhaseCount=${completed}.`
  );
}
function assertNever2(value) {
  throw new Error(`Unsupported workflow value: ${String(value)}`);
}
export {
  index_default as default
};
