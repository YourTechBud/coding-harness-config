import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import type { WorkflowContext, WorkflowConversationMessage } from '@yourtechbudstudio/isagi-workflow-sdk';

import { deckArchitect, deckBuilder, deckReviewRouting, deckVerifier, preparer } from '../src/constants.js';
import workflow from '../src/index.js';
import { deckReviewPath, walkthroughPaths } from '../src/paths.js';
import type { Stage, State } from '../src/workflow.js';
import type { ArtifactPaths, Curriculum, DeckPlan } from '../src/types.js';

const sources: ArtifactPaths = {
  currentStatePath: 'design/current-state.md',
  architecturePath: 'design/architecture.md',
  programDesignPath: 'design/program-design.md',
};
const reviewDirectory = 'review';

test('source analysis starts all three visible analyst sessions before waiting', async () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'walkthrough-'));
  try {
    const harness = workflowHarness(repositoryPath);
    const result = await workflow.step(harness.ctx, state(repositoryPath, { kind: 'start_source_analysis' }), null);
    assert.equal(result.type, 'suspend');
    assert.equal(harness.spawned.length, 3);
    assert.deepEqual(harness.spawned.map(({ harness, model, effort }) => ({ harness, model, effort })), [preparer, preparer, preparer]);
    assert.equal(result.type === 'suspend' ? result.condition.kind : null, 'agent_turn');
    assert.equal(harness.spawned.every((call) => call.prompt?.includes('audience-neutral')), true);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test('deck architecture invokes Show Me for depth-aware representation planning', async () => {
  const harness = workflowHarness('/workspace');
  const result = await workflow.step(harness.ctx, state('/workspace', { kind: 'start_deck_architecture', curriculum: curriculum() }), null);
  assert.equal(result.type, 'suspend');
  assert.deepEqual(harness.spawned[0]?.modifiers, [{ kind: 'skill', name: 'show-me' }]);
  assert.match(harness.spawned[0]?.prompt ?? '', /boundary maps, ownership views, data or control flow/);
});

test('deck construction uses a fresh session per chapter and one turn per narrative unit', async () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'walkthrough-'));
  try {
    const harness = workflowHarness(repositoryPath);
    const paths = walkthroughPaths(reviewDirectory);
    write(repositoryPath, paths.htmlPath, '<main data-walkthrough-deck><div data-slide-viewport></div><nav data-slide-navigation></nav></main>');
    const common = { curriculum: curriculum(), plan: plan(paths.curriculumPath, paths.htmlPath), architect: agent(31, 41), builder: agent(32, 42) };
    const shell = await workflow.step(harness.ctx, state(repositoryPath, { kind: 'await_deck_shell', ...common }), ended());
    assert.equal(shell.type, 'cont');
    assert.equal(resultStage(shell).kind, 'start_chapter_build');
    assert.deepEqual(harness.closedPanes, [42]);

    const firstUnit = await workflow.step(harness.ctx, resultState(shell), null);
    assert.equal(firstUnit.type, 'suspend');
    assert.equal(resultStage(firstUnit).kind, 'await_narrative_unit');
    assert.equal(harness.spawned.length, 1);
    assert.match(harness.spawned[0]?.prompt ?? '', /Chapter: .*current-state/);
    assert.match(harness.spawned[0]?.prompt ?? '', /Narrative unit 1 of 2/);
    assert.deepEqual(harness.spawned[0]?.modifiers, [{ kind: 'skill', name: 'show-me' }]);

    const nextUnitReady = await workflow.step(harness.ctx, resultState(firstUnit), ended());
    assert.equal(resultStage(nextUnitReady).kind, 'send_narrative_unit');
    const secondUnit = await workflow.step(harness.ctx, resultState(nextUnitReady), null);
    assert.equal(secondUnit.type, 'suspend');
    assert.equal(harness.sent.length, 1);
    assert.equal(harness.sent[0]?.agentSessionId, 11);
    assert.match(harness.sent[0]?.prompt ?? '', /Narrative unit 2 of 2/);

    const nextChapterReady = await workflow.step(harness.ctx, resultState(secondUnit), ended());
    assert.equal(resultStage(nextChapterReady).kind, 'start_chapter_build');
    assert.deepEqual(harness.closedPanes, [42, 21]);
    const architecture = await workflow.step(harness.ctx, resultState(nextChapterReady), null);
    assert.equal(architecture.type, 'suspend');
    assert.equal(harness.spawned.length, 2);
    assert.match(harness.spawned[1]?.prompt ?? '', /Chapter: .*architecture/);

    const programReady = await workflow.step(harness.ctx, resultState(architecture), ended());
    assert.equal(resultStage(programReady).kind, 'start_chapter_build');
    const program = await workflow.step(harness.ctx, resultState(programReady), null);
    assert.equal(program.type, 'suspend');
    assert.equal(harness.spawned.length, 3);
    assert.match(harness.spawned[2]?.prompt ?? '', /Chapter: .*program-design/);

    const assemblyReady = await workflow.step(harness.ctx, resultState(program), ended());
    assert.equal(resultStage(assemblyReady).kind, 'start_final_assembly');
    assert.deepEqual(harness.closedPanes, [42, 21, 22, 23]);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test('final assembly starts a fresh builder session that continues into deck review', async () => {
  const paths = walkthroughPaths(reviewDirectory);
  const harness = workflowHarness('/workspace');
  const result = await workflow.step(harness.ctx, state('/workspace', {
    kind: 'start_final_assembly', curriculum: curriculum(), plan: plan(paths.curriculumPath, paths.htmlPath), architect: agent(31, 41),
  }), null);
  assert.equal(result.type, 'suspend');
  assert.equal(resultStage(result).kind, 'await_final_assembly');
  assert.deepEqual(harness.spawned[0] && { harness: harness.spawned[0].harness, model: harness.spawned[0].model, effort: harness.spawned[0].effort }, deckBuilder);
  assert.match(harness.spawned[0]?.prompt ?? '', /Complete and polish the assembled/);
});

test('Markdown verification is routed headlessly before completed review closes presentation workers', async () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'walkthrough-'));
  try {
    const paths = walkthroughPaths(reviewDirectory);
    const deckPlan = plan(paths.curriculumPath, paths.htmlPath);
    const review = '# Deck Review — Round 1\n\n## Findings\n\nNo findings.\n\n## Conclusion\n\nNo required work remains.';
    write(repositoryPath, deckReviewPath(paths, 1), review);
    const harness = workflowHarness(repositoryPath);
    const routing = await workflow.step(harness.ctx, state(repositoryPath, {
      kind: 'await_verification', curriculum: curriculum(), plan: deckPlan, architect: agent(31, 41), builder: agent(32, 42), verifier: agent(33, 43), round: 1,
    }), ended());
    assert.equal(routing.type, 'suspend');
    assert.equal(resultStage(routing).kind, 'await_review_routing');
    assert.equal(routing.type === 'suspend' ? routing.condition.kind : null, 'headless_agent');
    assert.equal(harness.headless.length, 1);
    assert.deepEqual(harness.headless[0]?.profile, deckReviewRouting);
    assert.match(harness.headless[0]?.prompt ?? '', /No required work remains/);

    const result = await workflow.step(harness.ctx, resultState(routing), headlessResult('complete'));
    assert.equal(result.type, 'cont');
    assert.equal(resultStage(result).kind, 'start_presentation_review');
    assert.deepEqual(harness.closedPanes, [41, 42, 43]);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test('review routing supports all four workflow outcomes', async () => {
  const paths = walkthroughPaths(reviewDirectory);
  const routes = [
    ['complete', 'start_presentation_review', 'cont'],
    ['builder', 'send_builder_revision', 'cont'],
    ['architect-and-builder', 'send_architect_revision', 'cont'],
    ['human-decision', 'await_human_decision', 'suspend'],
  ] as const;

  for (const [outcome, expectedStage, expectedType] of routes) {
    const harness = workflowHarness('/workspace');
    const result = await workflow.step(harness.ctx, state('/workspace', {
      kind: 'await_review_routing',
      curriculum: curriculum(),
      plan: plan(paths.curriculumPath, paths.htmlPath),
      review: `Review requesting ${outcome}.`,
      architect: agent(31, 41),
      builder: agent(32, 42),
      verifier: agent(33, 43),
      round: 1,
    }), headlessResult(outcome));
    assert.equal(result.type, expectedType, outcome);
    assert.equal(resultStage(result).kind, expectedStage, outcome);
    if (outcome === 'human-decision') assert.equal(result.type === 'suspend' ? result.condition.kind : null, 'user_continue');
  }
});

test('fifth review routes remaining findings to the usual fixers', async () => {
  const paths = walkthroughPaths(reviewDirectory);
  const routes = [
    ['builder', 'send_builder_revision'],
    ['architect-and-builder', 'send_architect_revision'],
  ] as const;

  for (const [outcome, expectedStage] of routes) {
    const harness = workflowHarness('/workspace');
    const result = await workflow.step(harness.ctx, state('/workspace', {
      kind: 'await_review_routing',
      curriculum: curriculum(),
      plan: plan(paths.curriculumPath, paths.htmlPath),
      review: `Round five review requesting ${outcome}.`,
      architect: agent(31, 41),
      builder: agent(32, 42),
      verifier: agent(33, 43),
      round: 5,
    }), headlessResult(outcome));
    assert.equal(result.type, 'cont', outcome);
    assert.equal(resultStage(result).kind, expectedStage, outcome);
  }
});

test('a final audit with remaining agent work pauses for a human decision', async () => {
  const paths = walkthroughPaths(reviewDirectory);
  const harness = workflowHarness('/workspace');
  const result = await workflow.step(harness.ctx, state('/workspace', {
    kind: 'await_review_routing',
    curriculum: curriculum(),
    plan: plan(paths.curriculumPath, paths.htmlPath),
    review: 'Round six still finds repetition.',
    architect: agent(31, 41),
    builder: agent(32, 42),
    verifier: agent(33, 43),
    round: 6,
  }), headlessResult('builder'));
  assert.equal(result.type, 'suspend');
  assert.equal(resultStage(result).kind, 'await_human_decision');
  assert.equal(result.type === 'suspend' ? result.condition.kind : null, 'user_continue');
  assert.match(harness.feedback.at(-1)?.message ?? '', /final audit/i);
});

 test('verification still requires a review artifact to exist', async () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'walkthrough-'));
  try {
    const paths = walkthroughPaths(reviewDirectory);
    const harness = workflowHarness(repositoryPath);
    const result = await workflow.step(harness.ctx, state(repositoryPath, {
      kind: 'await_verification', curriculum: curriculum(), plan: plan(paths.curriculumPath, paths.htmlPath), architect: agent(31, 41), builder: agent(32, 42), verifier: agent(33, 43), round: 1,
    }), ended());
    assert.equal(result.type, 'fail');
    assert.match(result.type === 'fail' ? result.reason : '', /round-01\.md/);
    assert.equal(harness.headless.length, 0);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test('builder response is handed to the next review directly from conversation history', async () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'walkthrough-'));
  try {
    const paths = walkthroughPaths(reviewDirectory);
    const review = '# Deck Review — Round 1\n\n### F-01 — [Concern] Navigation\n\nRequired outcome: preserve focus.';
    const histories = new Map<number, readonly WorkflowConversationMessage[]>([
      [32, [message('user', 'Apply the review.'), message('assistant', 'Applied F-01 and verified keyboard focus.')]],
    ]);
    write(repositoryPath, paths.htmlPath, '<main>Revised deck</main>');
    const harness = workflowHarness(repositoryPath, histories);
    const revised = await workflow.step(harness.ctx, state(repositoryPath, {
      kind: 'await_builder_revision', curriculum: curriculum(), plan: plan(paths.curriculumPath, paths.htmlPath), review, architect: agent(31, 41), builder: agent(32, 42), verifier: agent(33, 43), round: 1,
    }), ended());
    assert.equal(revised.type, 'cont');
    assert.equal(resultStage(revised).kind, 'send_reverification');

    const reverifying = await workflow.step(harness.ctx, resultState(revised), null);
    assert.equal(reverifying.type, 'suspend');
    assert.equal(resultStage(reverifying).kind, 'await_verification');
    assert.match(harness.sent[0]?.prompt ?? '', /Applied F-01 and verified keyboard focus/);
    assert.match(harness.sent[0]?.prompt ?? '', /Required outcome: preserve focus/);
    assert.match(harness.sent[0]?.prompt ?? '', /round-02\.md/);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test('fifth-round builder fixes receive a sixth and final verification', async () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'walkthrough-'));
  try {
    const paths = walkthroughPaths(reviewDirectory);
    const review = '# Deck Review — Round 5\n\n### F-01 — [Concern] Navigation\n\nRequired outcome: preserve focus.';
    const histories = new Map<number, readonly WorkflowConversationMessage[]>([
      [32, [message('user', 'Apply the review.'), message('assistant', 'Applied the remaining findings.')]],
    ]);
    write(repositoryPath, paths.htmlPath, '<main>Final revised deck</main>');
    const harness = workflowHarness(repositoryPath, histories);
    const result = await workflow.step(harness.ctx, state(repositoryPath, {
      kind: 'await_builder_revision', curriculum: curriculum(), plan: plan(paths.curriculumPath, paths.htmlPath), review, architect: agent(31, 41), builder: agent(32, 42), verifier: agent(33, 43), round: 5,
    }), ended());
    assert.equal(result.type, 'cont');
    const nextStage = resultStage(result);
    assert.equal(nextStage.kind, 'send_reverification');
    if (nextStage.kind !== 'send_reverification') throw new Error('Expected final re-verification.');
    assert.equal(nextStage.round, 6);
    assert.deepEqual(harness.closedPanes, []);
    assert.equal(harness.sent.length, 0);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test('presentation Continue finishes review rather than advancing a tutorial beat', async () => {
  const harness = workflowHarness('/workspace');
  const paths = walkthroughPaths(reviewDirectory);
  const result = await workflow.step(harness.ctx, state('/workspace', {
    kind: 'await_presentation_continue', curriculum: curriculum(), plan: plan(paths.curriculumPath, paths.htmlPath), guide: { agentSessionId: 11, paneId: 21 },
  }), { kind: 'user_continue' });
  assert.equal(result.type, 'done');
  assert.equal(result.type === 'done' ? (result.value as { outcome: string }).outcome : null, 'presentation-review-completed');
  assert.deepEqual(harness.closedPanes, [21]);
});

test('a waiting presentation created with the previous deck-plan shape can still complete', async () => {
  const harness = workflowHarness('/workspace');
  const legacyPlan = { schemaVersion: 1, slides: [{ id: 'one' }, { id: 'two' }] } as unknown as DeckPlan;
  const result = await workflow.step(harness.ctx, state('/workspace', {
    kind: 'await_presentation_continue', curriculum: curriculum(), plan: legacyPlan, guide: { agentSessionId: 11, paneId: 21 },
  }), { kind: 'user_continue' });
  assert.equal(result.type, 'done');
  assert.equal(result.type === 'done' ? (result.value as { slideCount: number }).slideCount : null, 2);
});

test('presentation roles keep their intended visible-session profiles', () => {
  assert.deepEqual(deckArchitect, { harness: 'claude', model: 'fable', effort: 'high' });
  assert.deepEqual(deckBuilder, { harness: 'claude', model: 'opus', effort: 'medium' });
  assert.deepEqual(deckVerifier, { harness: 'codex', model: 'gpt-5.6-sol', effort: 'medium' });
  assert.deepEqual(deckReviewRouting, { harness: 'codex', model: 'gpt-5.6-luna', effort: 'medium' });
});

function state(repositoryPath: string, stage: Stage): State {
  return {
    stateVersion: 2,
    repositoryPath,
    story: 'Story 42',
    sources,
    paths: walkthroughPaths(reviewDirectory),
    audienceProfile: { familiarity: 'new', technicalDepth: 'system-design' },
    deliveryMode: 'presentation-first',
    stage,
  };
}

function curriculum(): Curriculum {
  const chapter = (id: 'current-state' | 'architecture' | 'program-design', beatId: string) => ({
    id,
    title: id,
    purpose: `Purpose of ${id}`,
    openingContext: `Context for ${id}`,
    synthesisObjective: `Synthesize ${id}`,
    beats: [{
      id: beatId,
      title: `${id} beat`,
      objective: `Understand ${id}`,
      narrativeBridge: 'Continue the story',
      candidateReferences: [{ artifact: id, candidateId: `${id}-candidate` }],
      prerequisiteBeatIds: [],
      requiredContent: ['Required point'],
      supportingMaterial: [],
      termsToIntroduce: [],
      realizationPoint: `Realize ${id}`,
      comprehensionObjective: `Explain ${id}`,
      representationOpportunities: [],
      sourceReferences: [{ heading: id, locator: id }],
    }],
  });
  return {
    schemaVersion: 2,
    story: { reference: 'Story 42', title: 'Story 42', throughline: 'From current state to implementation' },
    sources,
    audienceProfile: { familiarity: 'new', technicalDepth: 'system-design' },
    audienceContract: { assumedKnowledge: [], orientationPolicy: 'Orient first', technicalDetailPolicy: 'System boundaries', evidencePolicy: 'Ground claims', languagePolicy: 'Use plain and precise language.' },
    chapters: [chapter('current-state', 'cs-01'), chapter('architecture', 'ar-01'), chapter('program-design', 'pd-01')],
    omissions: [],
  } as unknown as Curriculum;
}

function plan(curriculumPath: string, outputPath: string): DeckPlan {
  const chapter = (id: 'current-state' | 'architecture' | 'program-design', beatId: string) => ({
    id,
    title: id,
    storyRole: `Explain ${id}`,
    openingContext: `Enter ${id}`,
    closingSynthesis: `Synthesize ${id}`,
    transitionToNext: `Continue from ${id}`,
    narrativeUnits: [{
      title: `${id} first movement`,
      storyPurpose: `Explain the first part of ${id}`,
      beatIds: [beatId],
      narrativeBridge: `Continue through ${id}`,
      realizationPoints: [`Understand ${id}`],
      requiredContent: ['Explain the point'],
      supportingContent: [],
      representationIntent: null,
      progressiveDisclosure: [],
      sourceReferences: [{ heading: id, locator: id }],
    }, ...(id === 'current-state' ? [{
      title: `${id} synthesis`,
      storyPurpose: `Synthesize ${id}`,
      beatIds: [beatId],
      narrativeBridge: `Conclude ${id}`,
      realizationPoints: [`Connect ${id}`],
      requiredContent: ['Connect the point'],
      supportingContent: [],
      representationIntent: null,
      progressiveDisclosure: [],
      sourceReferences: [{ heading: id, locator: id }],
    }] : [])],
  });
  return {
    schemaVersion: 2,
    curriculumPath,
    outputPath,
    story: { title: 'Story 42', openingPromise: 'Understand the change', throughline: 'Follow the system', endingResolution: 'Know how it works' },
    chapters: [chapter('current-state', 'cs-01'), chapter('architecture', 'ar-01'), chapter('program-design', 'pd-01')],
  } as unknown as DeckPlan;
}

function workflowHarness(repositoryPath: string, histories: ReadonlyMap<number, readonly WorkflowConversationMessage[]> = new Map()) {
  const spawned: Array<Parameters<WorkflowContext['spawnAgentSession']>[0]> = [];
  const sent: Array<Parameters<WorkflowContext['sendAgentPrompt']>[0]> = [];
  const headless: Array<{ readonly profile: { readonly harness?: string; readonly model?: string; readonly effort?: string }; readonly prompt: string }> = [];
  const closedPanes: number[] = [];
  const feedback: Array<Parameters<WorkflowContext['setUiFeedback']>[0]> = [];
  const ctx: WorkflowContext = {
    worktreePath: repositoryPath,
    spawnAgentSession: async (input) => {
      spawned.push(input);
      const index = spawned.length;
      return { agentSessionId: 10 + index, paneId: 20 + index, sentAt: `2026-08-21T00:00:0${index}.000Z` };
    },
    sendAgentPrompt: async (input) => {
      sent.push(input);
      return { agentSessionId: input.agentSessionId, sentAt: '2026-08-21T00:00:00.000Z' };
    },
    closePane: async (paneId) => { closedPanes.push(paneId); },
    getConversationHistory: async (agentSessionId) => histories.get(agentSessionId) ?? [],
    runHeadlessAgent: async (input) => {
      headless.push({ profile: { harness: input.harness, model: input.model, effort: input.effort }, prompt: input.prompt ?? '' });
      return { opId: `route-${headless.length}`, launch: { prompt: input.prompt ?? '', harness: input.harness, model: input.model, effort: input.effort, timeoutMs: input.timeoutMs ?? 900_000 } };
    },
    startWorkflow: async () => { throw new Error('Unexpected child workflow.'); },
    log: async () => {},
    setUiFeedback: async (input) => { feedback.push(input); },
  };
  return { ctx, spawned, sent, headless, closedPanes, feedback };
}

function agent(agentSessionId: number, paneId: number) {
  return { agentSessionId, paneId, sentAt: '2026-08-21T00:00:00.000Z' };
}

function ended() {
  return { outcome: 'ended' as const, recordedAt: '2026-08-21T00:00:00.000Z' };
}

function headlessResult(outcome: 'complete' | 'builder' | 'architect-and-builder' | 'human-decision') {
  return { kind: 'headless_agent', results: [{ opId: 'route-1', status: 'completed', output: JSON.stringify({ outcome }) }] };
}

function message(role: 'user' | 'assistant', text: string): WorkflowConversationMessage {
  return { role, parts: [{ type: 'text', text, state: 'done' }] };
}

function resultState(result: Awaited<ReturnType<typeof workflow.step>>): Parameters<typeof workflow.step>[1] {
  if (result.type !== 'cont' && result.type !== 'suspend') throw new Error(`Expected state result, got ${result.type}.`);
  return result.state as Parameters<typeof workflow.step>[1];
}

function resultStage(result: Awaited<ReturnType<typeof workflow.step>>) {
  return resultState(result).stage;
}

function write(repositoryPath: string, relativePath: string, text: string): void {
  const absolutePath = join(repositoryPath, relativePath);
  mkdirSync(join(absolutePath, '..'), { recursive: true });
  writeFileSync(absolutePath, text);
}
