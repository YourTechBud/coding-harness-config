import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type {
  WorkflowContext,
  WorkflowResult,
} from "@yourtechbudstudio/isagi-workflow-sdk";

import workflow from "../src/index.js";
import { implementerGeneric, implementerUiHeavy } from "../src/constants.js";

type WorkflowState = Parameters<typeof workflow.step>[1];

test("rejects persisted state from an unsupported workflow version", async () => {
  const harness = workflowHarness();

  await assert.rejects(
    workflow.step(
      harness.ctx,
      {
        ...activeState({ kind: "select-implementer" }),
        stateVersion: 4,
      } as unknown as WorkflowState,
      undefined,
    ),
    /Unsupported implement-phase-wise-plan state version: expected 5, received 4/,
  );
});

test("plan discovery proceeds directly to implementer selection", async () => {
  const worktreePath = mkdtempSync(join(tmpdir(), "phase-wise-plan-"));
  try {
    writePlanFixture(worktreePath);
    const harness = workflowHarness({ worktreePath });
    const result = await workflow.step(
      harness.ctx,
      discoveryState(),
      discoveryResult(0),
    );

    assert.equal(result.type, "cont");
    assert.equal(
      result.type === "cont"
        ? (result.state as WorkflowState).stage.kind
        : undefined,
      "select-implementer",
    );
    assert.equal(harness.feedback.at(-1)?.phase, "plan-ready");
  } finally {
    rmSync(worktreePath, { recursive: true, force: true });
  }
});

test("a fully completed discovered plan proceeds directly to completion", async () => {
  const worktreePath = mkdtempSync(join(tmpdir(), "phase-wise-plan-"));
  try {
    writePlanFixture(worktreePath, true);
    const harness = workflowHarness({ worktreePath });
    const result = await workflow.step(
      harness.ctx,
      discoveryState(),
      discoveryResult(1),
    );

    assert.equal(result.type, "cont");
    assert.equal(
      result.type === "cont"
        ? (result.state as WorkflowState).stage.kind
        : undefined,
      "done",
    );
    assert.equal(harness.feedback.at(-1)?.phase, "complete");
  } finally {
    rmSync(worktreePath, { recursive: true, force: true });
  }
});

test("every non-complete implementer turn returns to the planner, including after approval", async () => {
  const harness = workflowHarness();
  const result = await workflow.step(
    harness.ctx,
    activeState({
      kind: "await-implementer-outcome",
      implementer: { agentSessionId: 22, paneId: 32 },
      implementerTurn:
        "Implementation started, but I found another architectural question.",
      exchangeNumber: 3,
    }),
    headlessResult('{"outcome":"planner-response-needed"}'),
  );

  assert.equal(result.type, "suspend");
  assert.equal(
    result.type === "suspend" ? result.condition.kind : undefined,
    "agent_turn",
  );
  assert.equal(harness.sentPrompts.length, 1);
  assert.equal(harness.sentPrompts[0]?.agentSessionId, 11);
  assert.match(
    harness.sentPrompts[0]?.text ?? "",
    /^I am implementing phase 2\./,
  );
  assert.match(
    harness.sentPrompts[0]?.text ?? "",
    /another architectural question/,
  );
});

test("planner feedback is sent with only the alignment footer", async () => {
  const harness = workflowHarness();
  const result = await workflow.step(
    harness.ctx,
    activeState({
      kind: "await-planner-outcome",
      implementer: { agentSessionId: 22, paneId: 32 },
      plannerTurn:
        "The boundary belongs in the runtime. Please revise your approach.",
      exchangeNumber: 1,
    }),
    headlessResult('{"outcome":"feedback"}'),
  );

  assert.equal(result.type, "suspend");
  assert.equal(harness.sentPrompts[0]?.agentSessionId, 22);
  assert.match(
    harness.sentPrompts[0]?.text ?? "",
    /^The boundary belongs in the runtime\. Please revise your approach\.\n\nI want you to:/,
  );
  assert.doesNotMatch(
    harness.sentPrompts[0]?.text ?? "",
    /Implement the phase/,
  );
});

test("planner approval is sent verbatim without the alignment footer", async () => {
  const harness = workflowHarness();
  const plannerTurn = "No flags. I approve implementation.";
  await workflow.step(
    harness.ctx,
    activeState({
      kind: "await-planner-outcome",
      implementer: { agentSessionId: 22, paneId: 32 },
      plannerTurn,
      exchangeNumber: 1,
    }),
    headlessResult('{"outcome":"approved"}'),
  );

  assert.equal(harness.sentPrompts[0]?.text, plannerTurn);
});

test("severe flag continuation sends the latest planner turn verbatim without reclassification", async () => {
  const severePlannerTurn =
    "FLAGS\n\nSevere: this changes the persistence boundary.";
  const harness = workflowHarness({
    conversationHistory: [
      message("user", "Resolve this flag."),
      message("assistant", severePlannerTurn),
    ],
  });
  const paused = await workflow.step(
    harness.ctx,
    activeState({
      kind: "await-planner-outcome",
      implementer: { agentSessionId: 22, paneId: 32 },
      plannerTurn: severePlannerTurn,
      exchangeNumber: 2,
    }),
    headlessResult('{"outcome":"severe-flag"}'),
  );

  assert.equal(paused.type, "suspend");
  assert.equal(
    paused.type === "suspend" ? paused.condition.kind : undefined,
    "user_continue",
  );
  assert.equal(harness.sentPrompts.length, 0);

  const resumed = await workflow.step(harness.ctx, suspendedState(paused), {
    kind: "user_continue",
  });

  assert.equal(resumed.type, "suspend");
  assert.equal(harness.sentPrompts.length, 1);
  assert.deepEqual(harness.sentPrompts[0], {
    agentSessionId: 22,
    text: severePlannerTurn,
  });
  assert.equal(harness.headlessLaunchCount, 0);
});

test("automatic review and commit inputs default to yes", async () => {
  const launchCtx = {
    worktreeId: 1,
    worktreePath: "/workspace",
    surfaceId: 7,
    agentSessionId: 11,
  };
  const manifest = await workflow.command(launchCtx);
  assert.deepEqual(
    (manifest.inputs ?? []).map((input) => input.key),
    ["humanInTheLoop", "autoReview", "autoCommit"],
  );
  const initialized = await workflow.init(launchCtx, { humanInTheLoop: "no" });
  assert.equal(initialized.options.autoReview, true);
  assert.equal(initialized.options.autoCommit, true);
});

test("mock-ui phase selects the UI-heavy profile without a classifier", async () => {
  const harness = workflowHarness();
  const result = await workflow.step(
    harness.ctx,
    activeState({ kind: "select-implementer" }, { phaseType: "mock-ui" }),
    null,
  );

  assert.equal(result.type, "cont");
  const nextState =
    result.type === "cont" ? (result.state as WorkflowState) : undefined;
  assert.equal(nextState?.stage.kind, "spawn-implementer");
  assert.equal(
    nextState?.stage.kind === "spawn-implementer"
      ? nextState.stage.profile.kind
      : undefined,
    "ui-heavy",
  );
  assert.equal(harness.headlessLaunchCount, 0);

  const spawned = await workflow.step(harness.ctx, nextState!, null);
  assert.equal(spawned.type, "suspend");
  assert.equal(
    spawned.type === "suspend" ? spawned.condition.kind : undefined,
    "agent_turn",
  );
  const { kind: _kind, ...expectedProfile } = implementerUiHeavy;
  const launched = harness.spawnedSessions[0];
  assert.deepEqual(
    launched && { harness: launched.harness, model: launched.model, effort: launched.effort },
    expectedProfile,
  );
  assert.deepEqual(harness.spawnedSessions[0]?.modifiers, [
    { kind: "skill", name: "designing-ui" },
  ]);
  assert.equal(
    harness.spawnedSessions[0]?.prompt,
    "I want to start designing mock UIs for phase 2 in docs/plan.md. Before creating any mockups, walk me through what the phase is about and what we need to achieve, ask me questions so we can establish a shared understanding.",
  );
});

test("non-mock phase keeps the default alignment prompt without modifiers", async () => {
  const harness = workflowHarness();
  const result = await workflow.step(
    harness.ctx,
    activeState({
      kind: "spawn-implementer",
      profile: implementerGeneric,
    }),
    null,
  );

  assert.equal(result.type, "suspend");
  assert.equal(harness.spawnedSessions[0]?.modifiers, undefined);
  assert.match(
    harness.spawnedSessions[0]?.prompt ?? "",
    /^Implement the phase 2 in docs\/plan\.md\./,
  );
  assert.match(
    harness.spawnedSessions[0]?.prompt ?? "",
    /Never start implementing unless I explicitly say so/,
  );
});

test("non-mock phase still uses the implementer-kind classifier", async () => {
  const harness = workflowHarness();
  const result = await workflow.step(
    harness.ctx,
    activeState({ kind: "select-implementer" }),
    null,
  );

  assert.equal(result.type, "suspend");
  assert.equal(
    result.type === "suspend" ? result.condition.kind : undefined,
    "headless_agent",
  );
  assert.equal(
    result.type === "suspend"
      ? (result.state as WorkflowState).stage.kind
      : undefined,
    "await-implementer-selection",
  );
  assert.match(
    harness.headlessLaunches[0]?.prompt ?? "",
    /classifyPhaseImplementationKind/,
  );
});

const implementer = { agentSessionId: 22, paneId: 32 };
const endedTurn = { outcome: "ended", recordedAt: "2026-07-10T00:00:00.000Z" };
const completeOutcome = headlessResult('{"outcome":"phase-complete"}');
const verificationOutcome = headlessResult('{"outcome":"phase-complete-awaiting-human-verification"}');

function completionState(checkpoint: "before-review" | "after-review", options?: Parameters<typeof activeState>[1]) {
  return activeState({
    kind: "await-completion-outcome", implementer, checkpoint,
    implementerTurn: "Implementation complete; verify manually.", exchangeNumber: 3,
  }, options);
}

function stageOf(result: WorkflowResult) {
  assert.ok(result.type === "suspend" || result.type === "cont");
  return (result.state as WorkflowState).stage;
}

for (const activity of ["alignment", "implementation"] as const) {
  test(`${activity} turn uses its requested purpose to select the completion gate`, async () => {
    const harness = workflowHarness({ conversationHistory: [message("assistant", "Only half implemented.")] });
    const result = await workflow.step(harness.ctx, activeState({
      kind: "await-implementer-turn", implementer, activity, exchangeNumber: 3,
    }), endedTurn);
    assert.equal(stageOf(result).kind, activity === "implementation" ? "await-completion-report" : "await-implementer-outcome");
    assert.equal(harness.sentPrompts.length, activity === "implementation" ? 1 : 0);
    assert.equal(harness.headlessLaunchCount, activity === "implementation" ? 0 : 1);
  });
}

for (const outcome of [completeOutcome, verificationOutcome]) {
  test(`alignment completion claim gets an explicit check: ${JSON.stringify(outcome)}`, async () => {
    const harness = workflowHarness();
    const result = await workflow.step(harness.ctx, activeState({
      kind: "await-implementer-outcome", implementer,
      implementerTurn: "Phase complete", exchangeNumber: 3,
    }), outcome);
    assert.equal(stageOf(result).kind, "await-completion-report");
    assert.equal(harness.startedWorkflows.length, 0);
  });
}

for (const checkpoint of ["before-review", "after-review"] as const) {
  test(`${checkpoint} reads the complete report and uses the shared classifier`, async () => {
    const harness = workflowHarness({ conversationHistory: [
      message("assistant", "## Anything left in the phase\nImplementation complete."),
      message("assistant", "## Anything the human needs to verify\nVerify on device."),
    ] });
    const result = await workflow.step(harness.ctx, activeState({
      kind: "await-completion-report", implementer, checkpoint, exchangeNumber: 3,
    }), endedTurn);
    const stage = stageOf(result);
    assert.equal(stage.kind, "await-completion-outcome");
    assert.match(harness.headlessLaunches[0]?.prompt ?? "", new RegExp(`Turn purpose: ${checkpoint}`));
    assert.match(harness.headlessLaunches[0]?.prompt ?? "", /Verify on device/);
    assert.match(harness.headlessLaunches[0]?.prompt ?? "", /Implementation complete/);
  });

  test(`${checkpoint} remaining work and questions return the full report to the planner`, async () => {
    const harness = workflowHarness();
    const report = "Half remains. My understanding is X. Should we use Y? Human verification also remains.";
    const state = completionState(checkpoint);
    const result = await workflow.step(harness.ctx, {
      ...state, stage: { ...state.stage, implementerTurn: report },
    } as WorkflowState, headlessResult('{"outcome":"planner-response-needed"}'));
    assert.equal(stageOf(result).kind, "await-planner-turn");
    assert.equal(harness.sentPrompts[0]?.agentSessionId, 11);
    assert.ok(harness.sentPrompts[0]?.text.includes(report));
    assert.equal(harness.startedWorkflows.length, 0);
  });

  test(`${checkpoint} failed report turn stops without advancing`, async () => {
    const harness = workflowHarness();
    const result = await workflow.step(harness.ctx, activeState({
      kind: "await-completion-report", implementer, checkpoint, exchangeNumber: 3,
    }), { outcome: "failed", recordedAt: endedTurn.recordedAt, reason: "transport failed" });
    assert.equal(result.type, "fail");
    assert.equal(harness.startedWorkflows.length, 0);
  });
}

for (const autoReview of [false, true]) {
  for (const outcome of [completeOutcome, verificationOutcome]) {
    test(`pre-review completion honors autoReview=${autoReview}: ${JSON.stringify(outcome)}`, async () => {
      const harness = workflowHarness();
      const result = await workflow.step(harness.ctx, completionState("before-review", { autoReview }), outcome);
      assert.equal(stageOf(result).kind, autoReview ? "await-auto-review" : "await-completion-report");
      assert.equal(harness.startedWorkflows.length, autoReview ? 1 : 0);
      if (autoReview) {
        assert.deepEqual(harness.workflowContexts, [{ agentSessionId: 22 }]);
        assert.match(String(harness.startedWorkflows[0]?.variables?.context), /phase 2.*docs\/plan.md.*since HEAD/);
      } else {
        assert.match(harness.sentPrompts[0]?.text ?? "", /Automatic review is disabled/);
      }
    });
  }
}

test("review completion requests a fresh final report, including for older persisted states", async () => {
  const harness = workflowHarness();
  const result = await workflow.step(harness.ctx, activeState({
    kind: "await-auto-review", implementer, runId: 44, requiresHumanVerification: true,
  }, { autoReview: true }), workflowResult(44, { outcome: "workflow-executed-successfully", reviewCount: 2 }));
  assert.equal(stageOf(result).kind, "await-completion-report");
  assert.match(harness.sentPrompts[0]?.text ?? "", /Automatic review has completed/);
});

for (const phaseType of ["implementation", "mock-ui", "docs"] as const) {
  for (const autoCommit of [false, true]) {
    test(`${phaseType} final completion honors autoCommit=${autoCommit} without forced approval`, async () => {
      const harness = workflowHarness();
      const result = await workflow.step(harness.ctx, completionState("after-review", {
        phaseType, autoCommit, humanInTheLoop: false,
      }), completeOutcome);
      assert.equal(stageOf(result).kind, autoCommit ? "start-commit" : "advance-phase");
      assert.equal(harness.startedWorkflows.length, 0);
      assert.equal(harness.headlessLaunchCount, 0);
    });
  }
  for (const requiredVerification of [false, true]) {
    test(`${phaseType} pauses for ${requiredVerification ? "required verification" : "configured approval"}`, async () => {
      const harness = workflowHarness();
      const result = await workflow.step(harness.ctx, completionState("after-review", {
        phaseType, humanInTheLoop: !requiredVerification,
      }), requiredVerification ? verificationOutcome : completeOutcome);
      assert.equal(result.type, "suspend");
      assert.equal(result.type === "suspend" && result.condition.kind, "user_continue");
      assert.equal(stageOf(result).kind, phaseType === "mock-ui" ? "await-mock-human-approval" : "await-human-completion");
      assert.equal(harness.feedback.at(-1)?.phase, requiredVerification ? "phase-human-verification" : "phase-review");
      const approved = await workflow.step(harness.ctx, suspendedState(result), { kind: "user_continue" });
      assert.equal(stageOf(approved).kind, "start-commit");
    });
  }
}

test("mock-ui retains its initial human work period, then checks completeness", async () => {
  const harness = workflowHarness();
  const paused = await workflow.step(harness.ctx, activeState({
    kind: "await-implementer-turn", implementer, activity: "alignment", exchangeNumber: 1,
  }, { phaseType: "mock-ui" }), endedTurn);
  assert.equal(stageOf(paused).kind, "await-human-completion");
  const checked = await workflow.step(harness.ctx, suspendedState(paused), { kind: "user_continue" });
  assert.equal(stageOf(checked).kind, "await-completion-report");
  assert.equal(harness.startedWorkflows.length, 0);
});

test("remaining work after review goes through planner, implementation, completeness, and review again", async () => {
  const harness = workflowHarness({ conversationHistory: [message("assistant", "Implementation complete.")] });
  const pending = await workflow.step(harness.ctx, completionState("after-review", { phaseType: "mock-ui", autoReview: true }),
    headlessResult('{"outcome":"planner-response-needed"}'));
  const plannerTurn = await workflow.step(harness.ctx, suspendedState(pending), endedTurn);
  const implementing = await workflow.step(harness.ctx, suspendedState(plannerTurn), headlessResult('{"outcome":"approved"}'));
  const checking = await workflow.step(harness.ctx, suspendedState(implementing), endedTurn);
  assert.equal(stageOf(checking).kind, "await-completion-report");
  const judging = await workflow.step(harness.ctx, suspendedState(checking), endedTurn);
  const reviewing = await workflow.step(harness.ctx, suspendedState(judging), completeOutcome);
  assert.equal(stageOf(reviewing).kind, "await-auto-review");
  assert.equal(harness.startedWorkflows.length, 1);
});

test("malformed review child success stops the parent workflow", async () => {
  const harness = workflowHarness();
  const result = await workflow.step(
    harness.ctx,
    activeState({
      kind: "await-auto-review",
      implementer: { agentSessionId: 22, paneId: 32 },
      runId: 44,
    }),
    workflowResult(44, { reviewCount: 2 }),
  );

  assert.equal(result.type, "fail");
  assert.match(result.type === "fail" ? result.reason : "", /success contract/);
});

test("human approval proceeds to the commit stage", async () => {
  const harness = workflowHarness();
  const result = await workflow.step(
    harness.ctx,
    activeState(
      {
        kind: "await-human-completion",
        implementer: { agentSessionId: 22, paneId: 32 },
      },
      { humanInTheLoop: true },
    ),
    { kind: "user_continue" },
  );

  assert.equal(result.type, "cont");
  assert.equal(
    result.type === "cont"
      ? (result.state as WorkflowState).stage.kind
      : undefined,
    "start-commit",
  );
});

test("human approval respects disabled auto commit", async () => {
  const harness = workflowHarness();
  const result = await workflow.step(
    harness.ctx,
    activeState(
      {
        kind: "await-human-completion",
        implementer: { agentSessionId: 22, paneId: 32 },
      },
      { autoCommit: false, humanInTheLoop: true },
    ),
    { kind: "user_continue" },
  );

  assert.equal(result.type, "cont");
  assert.equal(
    result.type === "cont"
      ? (result.state as WorkflowState).stage.kind
      : undefined,
    "advance-phase",
  );
});

test("commit stage launches the operational agent with strong commit instructions", async () => {
  const harness = workflowHarness();
  const result = await workflow.step(
    harness.ctx,
    activeState({
      kind: "start-commit",
      implementer: { agentSessionId: 22, paneId: 32 },
    }),
    null,
  );

  assert.equal(result.type, "suspend");
  assert.equal(
    result.type === "suspend" ? result.condition.kind : undefined,
    "headless_agent",
  );
  assert.match(
    harness.headlessLaunches[0]?.prompt ?? "",
    /Create the Git commit yourself now/,
  );
  assert.match(harness.headlessLaunches[0]?.prompt ?? "", /git add -A/);
  assert.match(harness.headlessLaunches[0]?.prompt ?? "", /untracked files/);
  assert.match(harness.headlessLaunches[0]?.prompt ?? "", /`feat: `/);
  assert.match(
    harness.headlessLaunches[0]?.prompt ?? "",
    /phase-02-production-wiring/,
  );
});

test("verified commit advances the phase", async () => {
  const harness = workflowHarness();
  const commit = "a".repeat(40);
  const result = await workflow.step(
    harness.ctx,
    activeState({
      kind: "await-commit",
      implementer: { agentSessionId: 22, paneId: 32 },
    }),
    headlessResult(
      `{"outcome":"commit-created","commit":"${commit}","subject":"feat: wire production behavior"}`,
    ),
  );

  assert.equal(result.type, "cont");
  assert.equal(
    result.type === "cont"
      ? (result.state as WorkflowState).stage.kind
      : undefined,
    "advance-phase",
  );
});

test("the final phase closes its implementer while preserving the planner session", async () => {
  const harness = workflowHarness();
  const state = activeState({
    kind: "advance-phase",
    implementer: { agentSessionId: 22, paneId: 32 },
  });
  const phases = [
    { number: 1, slug: "phase-01-foundations", type: "prep" as const },
    { number: 2, slug: "phase-02-production-wiring", type: "implementation" as const },
    { number: 3, slug: "phase-03-docs", type: "docs" as const },
    { number: 4, slug: "phase-04-release", type: "release" as const },
  ];
  const finalState = {
    ...state,
    plan: {
      entryPlanPath: "docs/plan.md",
      decisionLogPath: "docs/plan-decisions.md",
      phases,
      currentPhaseIndex: 3,
    },
  } as WorkflowState;

  const advanced = await workflow.step(harness.ctx, finalState, null);
  assert.equal(advanced.type, "cont");
  assert.deepEqual(harness.closedPanes, [32]);
  assert.equal(advanced.type === "cont" ? (advanced.state as WorkflowState).stage.kind : undefined, "done");

  const completed = await workflow.step(harness.ctx, advanced.type === "cont" ? advanced.state as WorkflowState : finalState, null);
  assert.equal(completed.type, "done");
  assert.deepEqual(completed.type === "done" ? completed.value : undefined, {
    entryPlanPath: "docs/plan.md",
    decisionLogPath: "docs/plan-decisions.md",
    phases,
    completedPhaseCount: 4,
  });
  assert.deepEqual(harness.closedPanes, [32]);
});

function activeState(
  stage: WorkflowState["stage"],
  input?: {
    readonly autoCommit?: boolean;
    readonly autoReview?: boolean;
    readonly humanInTheLoop?: boolean;
    readonly phaseType?: "prep" | "mock-ui" | "implementation" | "docs" | "release";
  },
): WorkflowState {
  return {
    stateVersion: 5,
    options: {
      autoCommit: input?.autoCommit ?? true,
      autoReview: input?.autoReview ?? false,
      humanInTheLoop: input?.humanInTheLoop ?? false,
    },
    plannerSessionId: 11,
    plan: {
      entryPlanPath: "docs/plan.md",
      decisionLogPath: "docs/plan-decisions.md",
      phases: [
        { number: 1, slug: "phase-01-foundations", type: "prep" },
        {
          number: 2,
          slug: "phase-02-production-wiring",
          type: input?.phaseType ?? "implementation",
        },
        { number: 3, slug: "phase-03-docs", type: "docs" },
        { number: 4, slug: "phase-04-release", type: "release" },
      ],
      currentPhaseIndex: 1,
    },
    stage,
  } as WorkflowState;
}

function workflowHarness(input?: {
  readonly conversationHistory?: Awaited<
    ReturnType<WorkflowContext["getConversationHistory"]>
  >;
  readonly worktreePath?: string;
}) {
  const sentPrompts: Array<{
    readonly agentSessionId: number;
    readonly text: string;
  }> = [];
  const headlessLaunches: Array<
    Parameters<WorkflowContext["runHeadlessAgent"]>[0]
  > = [];
  const spawnedSessions: Array<
    Parameters<WorkflowContext["spawnAgentSession"]>[0]
  > = [];
  const startedWorkflows: Array<{
    readonly workflowKey: string;
    readonly variables: Record<string, unknown> | undefined;
  }> = [];
  const workflowContexts: Array<Parameters<WorkflowContext["startWorkflow"]>[2]> = [];
  const closedPanes: number[] = [];
  const feedback: Array<Parameters<WorkflowContext["setUiFeedback"]>[0]> = [];
  let headlessLaunchCount = 0;
  const ctx: WorkflowContext = {
    worktreePath: input?.worktreePath ?? "/workspace",
    spawnAgentSession: async (spawnInput) => {
      spawnedSessions.push(spawnInput);
      return {
        agentSessionId: 22,
        paneId: 32,
        sentAt: "2026-07-10T00:00:00.000Z",
      };
    },
    sendAgentPrompt: async ({ agentSessionId, prompt }) => {
      if (prompt === undefined)
        return unexpected("sendAgentPrompt without prompt");
      sentPrompts.push({ agentSessionId, text: prompt });
      return { agentSessionId, sentAt: "2026-07-10T00:00:00.000Z" };
    },
    closePane: async (paneId) => {
      closedPanes.push(paneId);
    },
    getConversationHistory: async () => input?.conversationHistory ?? [],
    runHeadlessAgent: async (headlessInput) => {
      headlessLaunchCount += 1;
      headlessLaunches.push(headlessInput);
      return {
        opId: "op-1",
        launch: {
          prompt: headlessInput.prompt ?? "",
          harness: headlessInput.harness,
          model: headlessInput.model,
          effort: headlessInput.effort,
          timeoutMs: headlessInput.timeoutMs ?? 900_000,
        },
      };
    },
    startWorkflow: async (workflowKey, variables, context) => {
      startedWorkflows.push({ workflowKey, variables });
      workflowContexts.push(context);
      return 44;
    },
    log: async () => {},
    setUiFeedback: async (value) => {
      feedback.push(value);
    },
  };
  return {
    ctx,
    sentPrompts,
    spawnedSessions,
    headlessLaunches,
    startedWorkflows,
    workflowContexts,
    closedPanes,
    feedback,
    get headlessLaunchCount() {
      return headlessLaunchCount;
    },
  };
}

function headlessResult(output: string) {
  return {
    kind: "headless_agent",
    results: [{ opId: "op-1", status: "completed", output }],
  };
}

function discoveryState(): WorkflowState {
  return {
    stateVersion: 5,
    options: {
      autoCommit: true,
      autoReview: true,
      humanInTheLoop: true,
    },
    plannerSessionId: 11,
    stage: { kind: "await-plan-discovery" },
  };
}

function discoveryResult(completedPhaseCount: number) {
  return headlessResult(JSON.stringify({
    planReferenceFound: true,
    entryPlanPath: "scratch/plans/current-plan/index.md",
    decisionLogPath: "scratch/plans/current-plan/decisions.md",
    phases: [{ number: 1, slug: "phase-01-foundations", type: "prep" }],
    completedPhaseCount,
  }));
}

function writePlanFixture(worktreePath: string, withDecisionLog = false): void {
  const planDirectory = join(worktreePath, "scratch/plans/current-plan");
  mkdirSync(planDirectory, { recursive: true });
  writeFileSync(join(planDirectory, "index.md"), "[Foundations](phase-01-foundations.md)\n");
  writeFileSync(join(planDirectory, "phase-01-foundations.md"), "---\ntype: prep\n---\n\n# Foundations\n");
  if (withDecisionLog) {
    writeFileSync(join(planDirectory, "decisions.md"), "# Decisions\n\nPhase 1 complete.\n");
  }
}

function workflowResult(runId: number, result: unknown) {
  return {
    kind: "workflow",
    results: [{ runId, status: "done", result }],
  };
}

function suspendedState(result: WorkflowResult): WorkflowState {
  assert.equal(result.type, "suspend");
  return (result as Extract<WorkflowResult, { readonly type: "suspend" }>)
    .state as WorkflowState;
}

function message(role: "user" | "assistant", text: string) {
  return {
    role,
    parts: [{ type: "text" as const, text, state: "done" as const }],
  };
}

function unexpected(name: string): never {
  throw new Error(`Unexpected ${name} call.`);
}
