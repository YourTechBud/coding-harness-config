import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type {
  WorkflowContext,
  WorkflowHeadlessResult,
  WorkflowLaunchContext,
  WorkflowResult,
} from "@yourtechbudstudio/isagi-workflow-sdk";

import { guide, pageBuilder, preparer } from "../src/constants.js";
import workflow from "../src/index.js";
import { reviewPaths } from "../src/paths.js";
import {
  curriculumIntegrationPrompt,
  htmlRealizationPrompt,
  liveTopicPrompt,
  phaseComprehensionPrompt,
  presentationDesignPrompt,
  topicDiscoveryPrompt,
} from "../src/prompts.js";
import type { ArtifactPaths, Curriculum, VisibleAgent } from "../src/types.js";

type State = Parameters<typeof workflow.step>[1];

const launchCtx: WorkflowLaunchContext = {
  worktreeId: 1,
  worktreePath: "/workspace",
  surfaceId: 7,
};

const sources: ArtifactPaths = {
  currentStatePath: "scratch/plans/example/artifacts/current-state.md",
  architecturePath: "scratch/plans/example/artifacts/architecture.md",
  programDesignPath: "scratch/plans/example/artifacts/program-design.md",
};

const reviewDirectory = "scratch/plans/example/review";

test("command captures all technical sources and starts topic discovery", async () => {
  const variables = {
    story: "https://github.com/owner/repo/issues/2",
    ...sources,
    reviewDirectory,
  };
  const manifest = await workflow.command(launchCtx);
  assert.equal(manifest.title, "Solution Walkthrough Story");
  assert.deepEqual(
    (manifest.inputs ?? []).map((input) => input.key),
    [
      "story",
      "currentStatePath",
      "architecturePath",
      "programDesignPath",
      "reviewDirectory",
    ],
  );
  await workflow.validate(launchCtx, variables);
  assert.deepEqual(await workflow.init(launchCtx, variables), {
    stateVersion: 1,
    repositoryPath: "/workspace",
    story: variables.story,
    sources,
    review: reviewPaths(reviewDirectory),
    stage: { kind: "start_topic_discovery" },
  });
});

test("command defaults compose with the singular story pack", async () => {
  const state = await workflow.init(launchCtx, { story: "Story" });
  assert.deepEqual(state.sources, {
    currentStatePath: "scratch/story/design/current-state.md",
    architecturePath: "scratch/story/design/architecture.md",
    programDesignPath: "scratch/story/design/program-design.md",
  });
  assert.equal(state.review.reviewDirectory, "scratch/story/walkthrough");
});

test("topic discovery launches one visible pane per artifact and waits for the first turn", async () => {
  const repositoryPath = temporaryRepository();
  try {
    const harness = workflowHarness(repositoryPath);
    const state = baseState(repositoryPath, { kind: "start_topic_discovery" });
    const result = await workflow.step(harness.ctx, state, null);

    assert.equal(result.type, "suspend");
    assert.equal(harness.spawned.length, 3);
    assert.equal(harness.headless.length, 0);
    assert.deepEqual(
      harness.spawned.map(({ harness, model, effort }) => ({
        harness,
        model,
        effort,
      })),
      [preparer, preparer, preparer],
    );
    assert.equal(
      harness.spawned[0]?.prompt,
      topicDiscoveryPrompt(sharedPromptInput(state), "current-state"),
    );
    assert.deepEqual(result.type === "suspend" ? result.condition : undefined, {
      kind: "agent_turn",
      agentSessionId: 11,
      sentAt: "2026-08-17T00:00:00.000Z",
    });
    assert.equal(
      harness.spawned.every((call) => call.modifiers === undefined),
      true,
    );
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test("walkthrough profiles reserve Opus for HTML page creation", () => {
  const sol = {
    harness: "codex",
    model: "gpt-5.6-sol",
    effort: "low",
  } as const;
  assert.deepEqual(preparer, sol);
  assert.deepEqual(guide, sol);
  assert.deepEqual(pageBuilder, {
    harness: "claude",
    model: "opus",
    effort: "medium",
  });
});

test("visible topic discovery joins each turn, validates once, and closes the phase panes together", async () => {
  const repositoryPath = temporaryRepository();
  try {
    writeInventories(repositoryPath);
    const harness = workflowHarness(repositoryPath);
    const agents = visibleAgents();
    const first = await workflow.step(
      harness.ctx,
      baseState(repositoryPath, {
        kind: "await_topic_discovery_turn",
        agents,
        agentIndex: 0,
      }),
      endedTurn(),
    );
    assert.deepEqual(first.type === "suspend" ? first.condition : undefined, {
      kind: "agent_turn",
      agentSessionId: 12,
      sentAt: "2026-08-17T00:00:01.000Z",
    });
    const second = await workflow.step(
      harness.ctx,
      resultState(first),
      endedTurn(),
    );
    assert.deepEqual(second.type === "suspend" ? second.condition : undefined, {
      kind: "agent_turn",
      agentSessionId: 13,
      sentAt: "2026-08-17T00:00:02.000Z",
    });
    const result = await workflow.step(
      harness.ctx,
      resultState(second),
      endedTurn(),
    );

    assert.equal(result.type, "cont");
    assert.equal(
      resultState(result).stage.kind,
      "start_curriculum_integration",
    );
    assert.deepEqual(harness.closedPanes, [21, 22, 23]);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test("a failed visible preparation turn preserves every phase pane for inspection", async () => {
  const harness = workflowHarness("/workspace");
  const result = await workflow.step(
    harness.ctx,
    baseState("/workspace", {
      kind: "await_topic_discovery_turn",
      agents: visibleAgents(),
      agentIndex: 1,
    }),
    {
      outcome: "failed",
      recordedAt: "2026-08-17T00:00:04.000Z",
      reason: "provider exited",
    },
  );

  assert.equal(result.type, "fail");
  assert.match(harness.logs.at(-1)?.message ?? "", /provider exited/);
  assert.match(harness.logs.at(-1)?.message ?? "", /preserved/);
  assert.deepEqual(harness.closedPanes, []);
});

test("invalid visible preparation artifacts preserve the panes for inspection", async () => {
  const repositoryPath = temporaryRepository();
  try {
    const harness = workflowHarness(repositoryPath);
    const result = await workflow.step(
      harness.ctx,
      baseState(repositoryPath, {
        kind: "await_topic_discovery_turn",
        agents: visibleAgents(),
        agentIndex: 2,
      }),
      endedTurn(),
    );

    assert.equal(result.type, "fail");
    assert.match(harness.logs.at(-1)?.message ?? "", /preserved/);
    assert.deepEqual(harness.closedPanes, []);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test("a run already waiting on the former headless discovery phase can still resume", async () => {
  const repositoryPath = temporaryRepository();
  try {
    writeInventories(repositoryPath);
    const harness = workflowHarness(repositoryPath);
    const result = await workflow.step(
      harness.ctx,
      baseState(repositoryPath, {
        kind: "await_topic_discovery",
        opIds: ["op-1", "op-2", "op-3"],
      }),
      completedOps("op-1", "op-2", "op-3"),
    );

    assert.equal(result.type, "cont");
    assert.equal(
      resultState(result).stage.kind,
      "start_curriculum_integration",
    );
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test("curriculum integration runs visibly, then parses and freezes the validated manifest", async () => {
  const repositoryPath = temporaryRepository();
  try {
    writeInventories(repositoryPath);
    writeManifest(repositoryPath);
    const harness = workflowHarness(repositoryPath);
    const startingState = baseState(repositoryPath, {
      kind: "start_curriculum_integration",
    });
    const started = await workflow.step(harness.ctx, startingState, null);
    assert.equal(started.type, "suspend");
    assert.equal(harness.spawned.length, 1);
    assert.equal(harness.headless.length, 0);
    assert.deepEqual(harness.spawned[0], {
      ...preparer,
      prompt: curriculumIntegrationPrompt(sharedPromptInput(startingState)),
    });
    const result = await workflow.step(
      harness.ctx,
      resultState(started),
      endedTurn(),
    );

    assert.equal(result.type, "cont");
    const stage = resultState(result).stage;
    assert.equal(stage.kind, "start_presentation_design");
    if (stage.kind === "start_presentation_design") {
      assert.deepEqual(stage.curriculum, curriculumFixture());
    }
    assert.deepEqual(harness.closedPanes, [21]);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test("curriculum validation preserves distinct mental models beyond six checkpoints", async () => {
  const repositoryPath = temporaryRepository();
  try {
    writeOverBudgetCurriculum(repositoryPath, 7, 0);
    const harness = workflowHarness(repositoryPath);
    const result = await workflow.step(
      harness.ctx,
      baseState(repositoryPath, {
        kind: "await_curriculum_integration_turn",
        agent: visibleAgents()[0]!,
      }),
      endedTurn(),
    );

    assert.equal(result.type, "cont");
    const stage = resultState(result).stage;
    assert.equal(stage.kind, "start_presentation_design");
    if (stage.kind === "start_presentation_design") {
      assert.equal(
        stage.curriculum.topics.filter(
          (topic) => topic.artifact === "current-state",
        ).length,
        7,
      );
    }
    assert.deepEqual(harness.closedPanes, [21]);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test("curriculum validation allows every genuinely critical checkpoint to reach phase comprehension", async () => {
  const repositoryPath = temporaryRepository();
  try {
    writeOverBudgetCurriculum(repositoryPath, 4, 4);
    const harness = workflowHarness(repositoryPath);
    const result = await workflow.step(
      harness.ctx,
      baseState(repositoryPath, {
        kind: "await_curriculum_integration_turn",
        agent: visibleAgents()[0]!,
      }),
      endedTurn(),
    );

    assert.equal(result.type, "cont");
    const stage = resultState(result).stage;
    assert.equal(stage.kind, "start_presentation_design");
    if (stage.kind === "start_presentation_design") {
      assert.equal(
        stage.curriculum.topics.filter(
          (topic) => topic.artifact === "current-state" && topic.critical,
        ).length,
        4,
      );
    }
    assert.deepEqual(harness.closedPanes, [21]);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test("curriculum validation rejects paragraph-sized learning objectives", async () => {
  const repositoryPath = temporaryRepository();
  try {
    writeInventories(repositoryPath);
    const curriculum = curriculumFixture();
    const first = curriculum.topics[0]!;
    writeJson(repositoryPath, reviewPaths(reviewDirectory).manifestPath, {
      ...curriculum,
      topics: [
        {
          ...first,
          learningObjective: Array.from({ length: 41 }, () => "detail").join(
            " ",
          ),
        },
        ...curriculum.topics.slice(1),
      ],
    });
    const harness = workflowHarness(repositoryPath);
    const result = await workflow.step(
      harness.ctx,
      baseState(repositoryPath, {
        kind: "await_curriculum_integration_turn",
        agent: visibleAgents()[0]!,
      }),
      endedTurn(),
    );

    assert.equal(result.type, "fail");
    assert.match(
      harness.logs.at(-1)?.message ?? "",
      /learningObjective allows at most 40 words/,
    );
    assert.deepEqual(harness.closedPanes, []);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test("presentation design asks three visible panes to use the implicitly available Show Me skill", async () => {
  const harness = workflowHarness("/workspace");
  const state = baseState("/workspace", {
    kind: "start_presentation_design",
    curriculum: curriculumFixture(),
  });
  const result = await workflow.step(harness.ctx, state, null);

  assert.equal(result.type, "suspend");
  assert.equal(harness.spawned.length, 3);
  assert.equal(harness.headless.length, 0);
  assert.deepEqual(
    harness.spawned.map(({ harness, model, effort }) => ({ harness, model, effort })),
    [preparer, preparer, preparer],
  );
  assert.equal(harness.spawned[0]?.modifiers, undefined);
  assert.equal(
    harness.spawned[0]?.prompt,
    presentationDesignPrompt(sharedPromptInput(state), "current-state"),
  );
  assert.match(harness.spawned[0]?.prompt ?? "", /Use the Show Me skill/);
});

test("valid visible presentation specifications close their panes and advance to HTML realization", async () => {
  const repositoryPath = temporaryRepository();
  try {
    writePresentationSpecifications(repositoryPath);
    const harness = workflowHarness(repositoryPath);
    const result = await workflow.step(
      harness.ctx,
      baseState(repositoryPath, {
        kind: "await_presentation_design_turn",
        curriculum: curriculumFixture(),
        agents: visibleAgents(),
        agentIndex: 2,
      }),
      endedTurn(),
    );

    assert.equal(result.type, "cont");
    assert.equal(resultState(result).stage.kind, "start_html_realization");
    assert.deepEqual(harness.closedPanes, [21, 22, 23]);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test("HTML realization launches three visible bounded renderer panes", async () => {
  const harness = workflowHarness("/workspace");
  const state = baseState("/workspace", {
    kind: "start_html_realization",
    curriculum: curriculumFixture(),
  });
  await workflow.step(harness.ctx, state, null);

  assert.equal(harness.spawned.length, 3);
  assert.equal(harness.headless.length, 0);
  assert.deepEqual(
    harness.spawned.map(({ harness, model, effort }) => ({ harness, model, effort })),
    [pageBuilder, pageBuilder, pageBuilder],
  );
  assert.equal(
    harness.spawned[0]?.prompt,
    htmlRealizationPrompt(sharedPromptInput(state), "current-state"),
  );
  assert.equal(harness.spawned[0]?.modifiers, undefined);
  assert.match(harness.spawned[0]?.prompt ?? "", /Use the Show Me skill/);
});

test("valid visible HTML with exact anchors closes its panes and advances to the walkthrough", async () => {
  const repositoryPath = temporaryRepository();
  try {
    writeHtmlArtifacts(repositoryPath);
    const harness = workflowHarness(repositoryPath);
    const result = await workflow.step(
      harness.ctx,
      baseState(repositoryPath, {
        kind: "await_html_realization_turn",
        curriculum: curriculumFixture(),
        agents: visibleAgents(),
        agentIndex: 2,
      }),
      endedTurn(),
    );

    assert.equal(result.type, "cont");
    assert.equal(resultState(result).stage.kind, "start_walkthrough");
    assert.deepEqual(harness.closedPanes, [21, 22, 23]);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test("HTML validation rejects internal guide-production notes", async () => {
  const repositoryPath = temporaryRepository();
  try {
    writeHtmlArtifacts(repositoryPath);
    const review = reviewPaths(reviewDirectory);
    writeText(
      repositoryPath,
      review.htmlPaths.currentStatePath,
      '<section id="topic-cs-01">Left to the guide</section><a href="./architecture.html">Architecture</a>',
    );
    const harness = workflowHarness(repositoryPath);
    const result = await workflow.step(
      harness.ctx,
      baseState(repositoryPath, {
        kind: "await_html_realization_turn",
        curriculum: curriculumFixture(),
        agents: visibleAgents(),
        agentIndex: 2,
      }),
      endedTurn(),
    );

    assert.equal(result.type, "fail");
    assert.match(
      harness.logs.at(-1)?.message ?? "",
      /exposes internal production label/,
    );
    assert.deepEqual(harness.closedPanes, []);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test("the walkthrough spawns one persistent Socratic guide with a self-contained first-topic prompt", async () => {
  const harness = workflowHarness("/workspace");
  const state = baseState("/workspace", {
    kind: "start_walkthrough",
    curriculum: curriculumFixture(),
  });
  const result = await workflow.step(harness.ctx, state, null);

  assert.equal(result.type, "suspend");
  assert.deepEqual(guide, {
    harness: "codex",
    model: "gpt-5.6-sol",
    effort: "low",
  });
  assert.deepEqual(harness.spawned[0], {
    ...guide,
    prompt: liveTopicPrompt({
      ...sharedPromptInput(state),
      curriculum: curriculumFixture(),
      topic: curriculumFixture().topics[0]!,
    }),
  });
  assert.match(harness.spawned[0]?.prompt ?? "", /Teach this subject Socratically/);
  assert.match(
    harness.spawned[0]?.prompt ?? "",
    /under 300 words of explanatory prose/,
  );
  assert.match(
    harness.spawned[0]?.prompt ?? "",
    /diagrams, code sketches, and compact tables do not count/,
  );
  assert.match(
    harness.spawned[0]?.prompt ?? "",
    /Stay with this subject's central mental model/,
  );
  assert.match(
    harness.spawned[0]?.prompt ?? "",
    /Use the browser for stable structure and evidence/,
  );
  assert.match(
    harness.spawned[0]?.prompt ?? "",
    /Use the Show Me skill when a focused visual would help/,
  );
  assert.match(
    harness.spawned[0]?.prompt ?? "",
    /Record feedback only when the human asks/,
  );
  assert.match(
    harness.spawned[0]?.prompt ?? "",
    /internal IDs and anchors are navigation only/,
  );
  assert.match(
    harness.spawned[0]?.prompt ?? "",
    /Briefly restate any earlier concept/,
  );
  assert.doesNotMatch(harness.spawned[0]?.prompt ?? "", /Critical topic:/);
  assert.doesNotMatch(
    harness.spawned[0]?.prompt ?? "",
    /Phase comprehension priority:/,
  );
  assert.doesNotMatch(harness.spawned[0]?.prompt ?? "", /Work unattended/);
});

test("preparation prompts preserve one mental model per checkpoint and first-frame density", () => {
  const state = baseState("/workspace", { kind: "start_topic_discovery" });
  const input = sharedPromptInput(state);
  const discovery = topicDiscoveryPrompt(input, "current-state");
  const curriculum = curriculumIntegrationPrompt(input);
  const presentation = presentationDesignPrompt(input, "current-state");
  const html = htmlRealizationPrompt(input, "current-state");

  assert.match(discovery, /one candidate for each novel mental model/);
  assert.match(curriculum, /one novel mental model/);
  assert.match(curriculum, /distinct mental models in distinct checkpoints/);
  assert.doesNotMatch(curriculum, /no more than six topics/);
  assert.doesNotMatch(curriculum, /no more than eighteen topics/);
  assert.match(
    curriculum,
    /learningObjective as one sentence of no more than forty words/,
  );
  assert.match(presentation, /fit comfortably in one ordinary laptop viewport/);
  assert.match(
    html,
    /visible prose before the first disclosure under roughly 150 words/,
  );
  assert.match(html, /Do not render those labels or internal notes/);
});

test("a completed guide turn exposes a human Continue wait without sending another prompt", async () => {
  const harness = workflowHarness("/workspace");
  const result = await workflow.step(
    harness.ctx,
    baseState("/workspace", {
      kind: "await_topic_turn",
      curriculum: curriculumFixture(),
      topicIndex: 0,
      guide: { agentSessionId: 11, paneId: 21 },
    }),
    endedTurn(),
  );

  assert.equal(result.type, "suspend");
  assert.deepEqual(result.type === "suspend" ? result.condition : undefined, {
    kind: "user_continue",
  });
  assert.equal(harness.sent.length, 0);
  assert.match(harness.feedback.at(-1)?.message ?? "", /Topic 1 of 3/);
  assert.match(harness.feedback.at(-1)?.message ?? "", /#topic-cs-01/);
});

test("Continue advances directly when another teaching checkpoint remains in the same phase", async () => {
  const curriculum = curriculumWithTwoCurrentStateTopics();
  const harness = workflowHarness("/workspace");
  const advanced = await workflow.step(
    harness.ctx,
    baseState("/workspace", {
      kind: "await_topic_continue",
      curriculum,
      topicIndex: 0,
      guide: { agentSessionId: 11, paneId: 21 },
    }),
    { kind: "user_continue" },
  );

  assert.equal(advanced.type, "cont");
  const advancedState = resultState(advanced);
  assert.equal(advancedState.stage.kind, "send_topic");
  const sent = await workflow.step(harness.ctx, advancedState, null);
  assert.equal(sent.type, "suspend");
  assert.equal(harness.sent[0]?.agentSessionId, 11);
  assert.equal(harness.sent[0]?.modifiers, undefined);
  assert.equal(
    harness.sent[0]?.prompt,
    liveTopicPrompt({
      ...sharedPromptInput(advancedState),
      curriculum,
      topic: curriculum.topics[1]!,
    }),
  );
  assert.match(
    harness.sent[0]?.prompt ?? "",
    /Current teaching subject: current-state follow-up topic/,
  );
  assert.match(
    harness.sent[0]?.prompt ?? "",
    /What this builds on:\n- current-state topic: Understand current-state\./,
  );
  assert.doesNotMatch(
    harness.sent[0]?.prompt ?? "",
    /Previously covered prerequisites: cs-01/,
  );
});

test("a phase boundary injects a self-contained Socratic comprehension prompt", async () => {
  const curriculum = curriculumFixture();
  const harness = workflowHarness("/workspace");
  const advanced = await workflow.step(
    harness.ctx,
    baseState("/workspace", {
      kind: "await_topic_continue",
      curriculum,
      topicIndex: 0,
      guide: { agentSessionId: 11, paneId: 21 },
    }),
    { kind: "user_continue" },
  );

  assert.equal(advanced.type, "cont");
  const advancedState = resultState(advanced);
  assert.equal(advancedState.stage.kind, "send_phase_comprehension");
  const sent = await workflow.step(harness.ctx, advancedState, null);
  assert.equal(sent.type, "suspend");
  assert.equal(harness.sent[0]?.agentSessionId, 11);
  assert.equal(
    harness.sent[0]?.prompt,
    phaseComprehensionPrompt({
      ...sharedPromptInput(advancedState),
      artifact: "current-state",
      curriculum,
    }),
  );
  assert.match(harness.sent[0]?.prompt ?? "", /phase-level comprehension dialogue/);
  assert.doesNotMatch(harness.sent[0]?.prompt ?? "", /cs-01/);
  assert.match(
    harness.sent[0]?.prompt ?? "",
    /current-state topic: Understand current-state\./,
  );
  assert.match(
    harness.sent[0]?.prompt ?? "",
    /Keep the dialogue concrete and understandable without remembering earlier turns/,
  );
  assert.match(harness.sent[0]?.prompt ?? "", /under 300 words of explanatory prose/);
  assert.match(harness.sent[0]?.prompt ?? "", /Use the Show Me skill/);
  assert.match(
    harness.sent[0]?.prompt ?? "",
    /Record feedback only when the human asks/,
  );
});

test("phase comprehension waits for the human before sending the next teaching checkpoint", async () => {
  const curriculum = curriculumFixture();
  const harness = workflowHarness("/workspace");
  const reviewed = await workflow.step(
    harness.ctx,
    baseState("/workspace", {
      kind: "await_phase_comprehension_turn",
      curriculum,
      artifact: "current-state",
      nextTopicIndex: 1,
      guide: { agentSessionId: 11, paneId: 21 },
    }),
    endedTurn(),
  );

  assert.equal(reviewed.type, "suspend");
  assert.deepEqual(reviewed.type === "suspend" ? reviewed.condition : undefined, {
    kind: "user_continue",
  });
  const advanced = await workflow.step(
    harness.ctx,
    resultState(reviewed),
    { kind: "user_continue" },
  );
  assert.equal(advanced.type, "cont");
  const stage = resultState(advanced).stage;
  assert.equal(stage.kind, "send_topic");
  if (stage.kind === "send_topic") assert.equal(stage.topicIndex, 1);
});

test("the final phase comprehension Continue closes the guide and completes the child", async () => {
  const curriculum = curriculumFixture();
  const harness = workflowHarness("/workspace");
  const result = await workflow.step(
    harness.ctx,
    baseState("/workspace", {
      kind: "await_phase_comprehension_continue",
      curriculum,
      artifact: "program-design",
      nextTopicIndex: null,
      guide: { agentSessionId: 11, paneId: 21 },
    }),
    { kind: "user_continue" },
  );

  assert.equal(result.type, "done");
  assert.deepEqual(result.type === "done" ? result.value : undefined, {
    outcome: "story-walkthrough-completed",
    reviewDirectory,
    manifestPath: `${reviewDirectory}/.walkthrough/manifest.json`,
    completedTopicCount: 3,
    artifacts: reviewPaths(reviewDirectory).htmlPaths,
  });
  assert.deepEqual(harness.closedPanes, [21]);
});

function workflowHarness(repositoryPath: string) {
  const headless: Array<{
    readonly profile: {
      readonly harness: string;
      readonly model?: string;
      readonly effort?: string;
    };
    readonly prompt: string;
    readonly modifiers: unknown;
    readonly op: {
      readonly opId: string;
      readonly launch: {
        readonly prompt: string;
        readonly harness: "pi" | "opencode" | "claude" | "codex";
        readonly model?: string;
        readonly effort?: string;
        readonly timeoutMs: number;
      };
    };
  }> = [];
  const spawned: Array<Parameters<WorkflowContext["spawnAgentSession"]>[0]> =
    [];
  const sent: Array<Parameters<WorkflowContext["sendAgentPrompt"]>[0]> = [];
  const closedPanes: number[] = [];
  const feedback: Array<Parameters<WorkflowContext["setUiFeedback"]>[0]> = [];
  const logs: Array<{ readonly level: string; readonly message: string }> = [];
  const ctx: WorkflowContext = {
    worktreePath: repositoryPath,
    spawnAgentSession: async (input) => {
      const index = spawned.length;
      spawned.push(input);
      return {
        agentSessionId: 11 + index,
        paneId: 21 + index,
        sentAt: `2026-08-17T00:00:0${index}.000Z`,
      };
    },
    sendAgentPrompt: async (input) => {
      sent.push(input);
      return {
        agentSessionId: input.agentSessionId,
        sentAt: "2026-08-17T00:00:00.000Z",
      };
    },
    closePane: async (paneId) => {
      closedPanes.push(paneId);
    },
    getConversationHistory: async () => [],
    runHeadlessAgent: async (input) => {
      const op = {
        opId: `op-${headless.length + 1}`,
        launch: {
          prompt: input.prompt ?? "",
          harness: input.harness,
          model: input.model,
          effort: input.effort,
          timeoutMs: input.timeoutMs ?? 900_000,
        },
      };
      headless.push({
        profile: {
          harness: input.harness,
          model: input.model,
          effort: input.effort,
        },
        prompt: input.prompt ?? "",
        modifiers: input.modifiers,
        op,
      });
      return op;
    },
    startWorkflow: async () => unexpected("startWorkflow"),
    log: async (level, message) => {
      logs.push({ level, message });
    },
    setUiFeedback: async (value) => {
      feedback.push(value);
    },
  };
  return { ctx, headless, spawned, sent, closedPanes, feedback, logs };
}

function baseState(repositoryPath: string, stage: State["stage"]): State {
  return {
    stateVersion: 1,
    repositoryPath,
    story: "https://github.com/owner/repo/issues/2",
    sources,
    review: reviewPaths(reviewDirectory),
    stage,
  };
}

function sharedPromptInput(state: State) {
  return {
    repositoryPath: state.repositoryPath,
    story: state.story,
    sources: state.sources,
    review: state.review,
  };
}

function temporaryRepository(): string {
  return mkdtempSync(join(tmpdir(), "solution-walkthrough-story-"));
}

function writeInventories(repositoryPath: string): void {
  const review = reviewPaths(reviewDirectory);
  const candidates = {
    "current-state": { candidateId: "current-model", title: "Current model" },
    architecture: { candidateId: "target-shape", title: "Target shape" },
    "program-design": {
      candidateId: "implementation-contract",
      title: "Implementation contract",
    },
  } as const;
  for (const [kind, candidate] of Object.entries(candidates)) {
    const typedKind = kind as keyof typeof candidates;
    writeJson(
      repositoryPath,
      pathForFixture(review.inventoryPaths, typedKind),
      {
        schemaVersion: 1,
        artifact: {
          kind: typedKind,
          sourcePath: pathForFixture(sources, typedKind),
        },
        topics: [
          {
            candidateId: candidate.candidateId,
            title: candidate.title,
            learningObjective: `Understand ${candidate.title}.`,
            whyRequired: "Later material depends on it.",
            prerequisiteCandidateIds: [],
            terms: [],
            sourceReferences: [
              {
                heading: candidate.title,
                locator: pathForFixture(sources, typedKind),
              },
            ],
            critical: typedKind === "current-state",
            comprehensionObjective:
              typedKind === "current-state"
                ? "The user can distinguish the current model."
                : null,
          },
        ],
      },
    );
  }
}

function writeManifest(repositoryPath: string): void {
  writeJson(
    repositoryPath,
    reviewPaths(reviewDirectory).manifestPath,
    curriculumFixture(),
  );
}

function writeOverBudgetCurriculum(
  repositoryPath: string,
  currentStateTopicCount: number,
  criticalTopicCount: number,
): void {
  writeInventories(repositoryPath);
  const review = reviewPaths(reviewDirectory);
  const currentStateCandidates = Array.from(
    { length: currentStateTopicCount },
    (_, index) => {
      const candidateId = `current-${index + 1}`;
      const critical = index < criticalTopicCount;
      return {
        candidateId,
        title: `Current-state concept ${index + 1}`,
        learningObjective: `Understand current-state concept ${index + 1}.`,
        whyRequired: "Later material depends on it.",
        prerequisiteCandidateIds: [],
        terms: [],
        sourceReferences: [
          { heading: candidateId, locator: sources.currentStatePath },
        ],
        critical,
        comprehensionObjective: critical
          ? `The user can explain ${candidateId}.`
          : null,
      };
    },
  );
  writeJson(repositoryPath, review.inventoryPaths.currentStatePath, {
    schemaVersion: 1,
    artifact: { kind: "current-state", sourcePath: sources.currentStatePath },
    topics: currentStateCandidates,
  });
  const curriculum = curriculumFixture();
  writeJson(repositoryPath, review.manifestPath, {
    ...curriculum,
    topics: [
      ...currentStateCandidates.map((candidate, index) =>
        topic(
          `cs-${String(index + 1).padStart(2, "0")}`,
          "current-state",
          candidate.candidateId,
          candidate.critical,
        ),
      ),
      ...curriculum.topics.filter(
        (candidate) => candidate.artifact !== "current-state",
      ),
    ],
  });
}

function curriculumFixture(): Curriculum {
  const review = reviewPaths(reviewDirectory);
  return {
    schemaVersion: 1,
    artifactOrder: ["current-state", "architecture", "program-design"],
    artifacts: {
      "current-state": {
        sourcePath: sources.currentStatePath,
        presentationPath: review.htmlPaths.currentStatePath,
      },
      architecture: {
        sourcePath: sources.architecturePath,
        presentationPath: review.htmlPaths.architecturePath,
      },
      "program-design": {
        sourcePath: sources.programDesignPath,
        presentationPath: review.htmlPaths.programDesignPath,
      },
    },
    topics: [
      topic("cs-01", "current-state", "current-model", true),
      topic("ar-01", "architecture", "target-shape", false, ["cs-01"]),
      topic("pd-01", "program-design", "implementation-contract", false, [
        "ar-01",
      ]),
    ],
    omissions: [],
  };
}

function curriculumWithTwoCurrentStateTopics(): Curriculum {
  const curriculum = curriculumFixture();
  const first = curriculum.topics[0]!;
  return {
    ...curriculum,
    topics: [
      first,
      {
        ...first,
        id: "cs-02",
        candidateId: "current-model-details",
        title: "current-state follow-up topic",
        prerequisiteTopicIds: ["cs-01"],
        browserAnchor: "topic-cs-02",
      },
      ...curriculum.topics.slice(1),
    ],
  };
}

function topic(
  id: string,
  artifact: "current-state" | "architecture" | "program-design",
  candidateId: string,
  critical: boolean,
  prerequisiteTopicIds: readonly string[] = [],
) {
  return {
    id,
    artifact,
    candidateId,
    title: `${artifact} topic`,
    learningObjective: `Understand ${artifact}.`,
    prerequisiteTopicIds,
    sourceReferences: [
      {
        heading: `${artifact} heading`,
        locator: pathForFixture(sources, artifact),
      },
    ],
    critical,
    comprehensionObjective: critical
      ? `The user can explain ${artifact}.`
      : null,
    browserAnchor: `topic-${id}`,
  };
}

function writePresentationSpecifications(repositoryPath: string): void {
  const curriculum = curriculumFixture();
  const review = reviewPaths(reviewDirectory);
  for (const topic of curriculum.topics) {
    const content = `# Presentation specification

## Topic \`${topic.id}\`: ${topic.title}

Anchor: \`${topic.browserAnchor}\`

### Browser responsibility

Browser support.

### Guide responsibility

Guide explanation.

### First visible frame

First frame.

### Supporting representation

Diagram.

### Progressive disclosure

Evidence details.

### Required content

- Required claim.

### Source grounding

- Source section.
`;
    writeText(
      repositoryPath,
      pathForFixture(review.presentationPaths, topic.artifact),
      content,
    );
  }
}

function writeHtmlArtifacts(repositoryPath: string): void {
  const review = reviewPaths(reviewDirectory);
  writeText(
    repositoryPath,
    review.htmlPaths.currentStatePath,
    '<section id="topic-cs-01"></section><a href="./architecture.html">Architecture</a>',
  );
  writeText(
    repositoryPath,
    review.htmlPaths.architecturePath,
    '<section id="topic-ar-01"></section><a href="./current-state.html">Current</a><a href="./program-design.html">Program</a>',
  );
  writeText(
    repositoryPath,
    review.htmlPaths.programDesignPath,
    '<section id="topic-pd-01"></section><a href="./current-state.html">Current</a><a href="./architecture.html">Architecture</a>',
  );
}

function writeJson(
  repositoryPath: string,
  relativePath: string,
  value: unknown,
): void {
  writeText(
    repositoryPath,
    relativePath,
    `${JSON.stringify(value, null, 2)}\n`,
  );
}

function writeText(
  repositoryPath: string,
  relativePath: string,
  text: string,
): void {
  const absolutePath = join(repositoryPath, relativePath);
  mkdirSync(join(absolutePath, ".."), { recursive: true });
  writeFileSync(absolutePath, text);
}

function pathForFixture(
  paths: ArtifactPaths,
  kind: "current-state" | "architecture" | "program-design",
): string {
  switch (kind) {
    case "current-state":
      return paths.currentStatePath;
    case "architecture":
      return paths.architecturePath;
    case "program-design":
      return paths.programDesignPath;
  }
}

function completedOps(...opIds: readonly string[]) {
  return { kind: "headless_agent", results: opIds.map(completedResult) };
}

function completedResult(opId: string): WorkflowHeadlessResult {
  return { opId, status: "completed", output: "done" };
}

function visibleAgents(): readonly VisibleAgent[] {
  return [
    { agentSessionId: 11, paneId: 21, sentAt: "2026-08-17T00:00:00.000Z" },
    { agentSessionId: 12, paneId: 22, sentAt: "2026-08-17T00:00:01.000Z" },
    { agentSessionId: 13, paneId: 23, sentAt: "2026-08-17T00:00:02.000Z" },
  ];
}

function endedTurn() {
  return { outcome: "ended", recordedAt: "2026-08-17T00:00:00.000Z" };
}

function resultState(result: WorkflowResult): State {
  assert.ok(result.type === "cont" || result.type === "suspend");
  return result.state as State;
}

function unexpected(name: string): never {
  throw new Error(`Unexpected ${name} call.`);
}
