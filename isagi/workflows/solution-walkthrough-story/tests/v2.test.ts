import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import type { WorkflowContext, WorkflowConversationMessage } from '@yourtechbudstudio/isagi-workflow-sdk';

import { deckArchitect, deckBuilder, deckReviewRouting, deckVerifier, preparer } from '../src/constants.js';
import workflow from '../src/index.js';
import { deckReviewPath, legacyDeckReviewPath, walkthroughV2Paths } from '../src/paths.js';
import type { V2Stage, V2State } from '../src/v2.js';
import type { ArtifactPaths, CurriculumV2, DeckPlan } from '../src/types.js';

const sources: ArtifactPaths = {
  currentStatePath: 'design/current-state.md',
  architecturePath: 'design/architecture.md',
  programDesignPath: 'design/program-design.md',
};
const reviewDirectory = 'review';

test('v2 source analysis starts all three visible analyst sessions before waiting', async () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'walkthrough-v2-'));
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

test('deck builder uses shell, one turn per realization unit, then final assembly', async () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'walkthrough-v2-'));
  try {
    const harness = workflowHarness(repositoryPath);
    const paths = walkthroughV2Paths(reviewDirectory);
    write(repositoryPath, paths.htmlPath, '<main data-walkthrough-deck><div data-slide-viewport></div><nav data-slide-navigation></nav></main>');
    const common = { curriculum: curriculum(), plan: plan(paths.curriculumPath, paths.htmlPath), architect: agent(31, 41), builder: agent(32, 42) };
    const shell = await workflow.step(harness.ctx, state(repositoryPath, { kind: 'await_deck_shell', ...common }), ended());
    assert.equal(shell.type, 'cont');
    assert.equal(resultStage(shell).kind, 'send_realization_unit');

    const building = await workflow.step(harness.ctx, resultState(shell), null);
    assert.equal(building.type, 'suspend');
    assert.equal(harness.sent.length, 1);
    assert.match(harness.sent[0]?.prompt ?? '', /Unit: main-unit/);

    write(repositoryPath, paths.htmlPath, '<main data-walkthrough-deck><div data-slide-viewport><!-- Example: <section data-walkthrough-slide id="<exact plan slide id>"> --><section data-walkthrough-slide id="slide-one"></section><section data-walkthrough-slide id="slide-two"></section><section data-walkthrough-slide id="slide-three"></section></div><nav data-slide-navigation></nav></main>');
    const built = await workflow.step(harness.ctx, resultState(building), ended());
    assert.equal(built.type, 'cont');
    const assemblyReady = await workflow.step(harness.ctx, resultState(built), null);
    assert.equal(assemblyReady.type, 'cont');
    assert.equal(resultStage(assemblyReady).kind, 'send_final_assembly');
    const assembly = await workflow.step(harness.ctx, resultState(assemblyReady), null);
    assert.equal(assembly.type, 'suspend');
    assert.equal(harness.sent.length, 2);
    assert.match(harness.sent[1]?.prompt ?? '', /Complete and polish the assembled/);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test('Markdown verification is routed headlessly before completed review closes presentation workers', async () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'walkthrough-v2-'));
  try {
    const paths = walkthroughV2Paths(reviewDirectory);
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
  const paths = walkthroughV2Paths(reviewDirectory);
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

test('legacy JSON review is copied into routing without validating finding slide IDs', async () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'walkthrough-v2-'));
  try {
    const paths = walkthroughV2Paths(reviewDirectory);
    write(repositoryPath, legacyDeckReviewPath(paths, 1), JSON.stringify({
      schemaVersion: 1,
      round: 1,
      outcome: 'revise',
      findings: [{ id: 'finding-2', owners: ['builder'], severity: 'concern', slideIds: ['cover'], evidence: 'The opening needs work.', requiredOutcome: 'Improve it.' }],
    }));
    const harness = workflowHarness(repositoryPath);
    const result = await workflow.step(harness.ctx, state(repositoryPath, {
      kind: 'await_verification', curriculum: curriculum(), plan: plan(paths.curriculumPath, paths.htmlPath), architect: agent(31, 41), builder: agent(32, 42), verifier: agent(33, 43), round: 1,
    }), ended());
    assert.equal(result.type, 'suspend');
    assert.equal(resultStage(result).kind, 'await_review_routing');
    assert.match(harness.headless[0]?.prompt ?? '', /"cover"/);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test('verification still requires a review artifact to exist', async () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'walkthrough-v2-'));
  try {
    const paths = walkthroughV2Paths(reviewDirectory);
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
  const repositoryPath = mkdtempSync(join(tmpdir(), 'walkthrough-v2-'));
  try {
    const paths = walkthroughV2Paths(reviewDirectory);
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

test('presentation Continue finishes review rather than advancing a tutorial beat', async () => {
  const harness = workflowHarness('/workspace');
  const paths = walkthroughV2Paths(reviewDirectory);
  const result = await workflow.step(harness.ctx, state('/workspace', {
    kind: 'await_presentation_continue', curriculum: curriculum(), plan: plan(paths.curriculumPath, paths.htmlPath), guide: { agentSessionId: 11, paneId: 21 },
  }), { kind: 'user_continue' });
  assert.equal(result.type, 'done');
  assert.equal(result.type === 'done' ? (result.value as { outcome: string }).outcome : null, 'presentation-review-completed');
  assert.deepEqual(harness.closedPanes, [21]);
});

test('presentation roles keep their intended visible-session profiles', () => {
  assert.deepEqual(deckArchitect, preparer);
  assert.deepEqual(deckBuilder, { harness: 'claude', model: 'opus', effort: 'medium' });
  assert.deepEqual(deckVerifier, { harness: 'codex', model: 'gpt-5.6-sol', effort: 'medium' });
  assert.deepEqual(deckReviewRouting, { harness: 'codex', model: 'gpt-5.6-luna', effort: 'medium' });
});

function state(repositoryPath: string, stage: V2Stage): V2State {
  return {
    stateVersion: 2,
    repositoryPath,
    story: 'Story 42',
    sources,
    paths: walkthroughV2Paths(reviewDirectory),
    audienceProfile: { familiarity: 'new', technicalDepth: 'system-design' },
    deliveryMode: 'presentation-first',
    stage,
  };
}

function curriculum(): CurriculumV2 {
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
    audienceContract: { assumedKnowledge: [], orientationPolicy: 'Orient first', technicalDetailPolicy: 'System boundaries', evidencePolicy: 'Ground claims' },
    chapters: [chapter('current-state', 'cs-01'), chapter('architecture', 'ar-01'), chapter('program-design', 'pd-01')],
    omissions: [],
  };
}

function plan(curriculumPath: string, outputPath: string): DeckPlan {
  const slide = (id: string, chapterId: 'current-state' | 'architecture' | 'program-design', beatId: string) => ({
    id,
    chapterId,
    beatIds: [beatId],
    title: id,
    purpose: `Explain ${id}`,
    contentResponsibilities: ['Explain the point'],
    representationIntent: null,
    progressiveDisclosure: [],
  });
  return {
    schemaVersion: 1,
    curriculumPath,
    outputPath,
    slides: [slide('slide-one', 'current-state', 'cs-01'), slide('slide-two', 'architecture', 'ar-01'), slide('slide-three', 'program-design', 'pd-01')],
    realizationUnits: [{ id: 'main-unit', slideIds: ['slide-one', 'slide-two', 'slide-three'] }],
  };
}

function workflowHarness(repositoryPath: string, histories: ReadonlyMap<number, readonly WorkflowConversationMessage[]> = new Map()) {
  const spawned: Array<Parameters<WorkflowContext['spawnAgentSession']>[0]> = [];
  const sent: Array<Parameters<WorkflowContext['sendAgentPrompt']>[0]> = [];
  const headless: Array<{ readonly profile: { readonly harness?: string; readonly model?: string; readonly effort?: string }; readonly prompt: string }> = [];
  const closedPanes: number[] = [];
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
    setUiFeedback: async () => {},
  };
  return { ctx, spawned, sent, headless, closedPanes };
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
