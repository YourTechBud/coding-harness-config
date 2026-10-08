import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import type { OperationContext } from '@yourtechbudstudio/isagi-workflow-sdk';
import type { AgentTurnParameters } from 'isagi-workflow-common-graphs';
import { agentTurnEnded, agentTurnInterrupted, assertDestinationsDeclared, subgraphParameters, visit, visitSubgraph } from 'isagi-workflow-common-graphs/testing';
import type { ImplementPhaseWisePlanParameters } from 'isagi-workflow-implement-phase-wise-plan/graph';

import { planner } from '../src/constants.js';
import { ImplementStoryGraph, implementStoryParameters } from '../src/graph.js';
import workflow from '../src/index.js';
import { PlanningGraph } from '../src/planning.js';

const story = 'https://github.com/owner/repo/issues/42';
const parameters = implementStoryParameters({ story });
const { artifacts, plan } = parameters;
const plannerPane = { agentSessionId: 55, paneId: 66 };
const origin = { worktreeId: 1, worktreePath: '/workspace', surfaceId: 7 };
const destination = (worktreePath: string) => ({ worktreeId: 1, worktreePath, surfaceId: 7 });

test('command exposes design inputs, plan paths, and implementation choices', async () => {
  const manifest = await workflow.command(origin);
  assert.equal(manifest.title, 'Implement Story');
  assert.deepEqual((manifest.inputs ?? []).map((input) => input.key), [
    'story', 'currentStatePath', 'architecturePath', 'programDesignPath', 'uiBriefPath', 'planDirectory', 'entryPlanPath', 'humanInTheLoop', 'autoReview', 'autoCommit',
  ]);
});

test('parameters use the singular story pack and default every implementation choice to yes', async () => {
  assert.deepEqual(await workflow.parse(origin, { story }), parameters);
  assert.deepEqual(parameters.options, { humanInTheLoop: 'yes', autoReview: 'yes', autoCommit: 'yes' });
  assert.equal(plan.entryPlanPath, 'scratch/story/implementation/index.md');
  assert.throws(() => workflow.parse(origin, {}), /story must be non-empty text/);
});

test('spawns the existing planner prompt with every explicit artifact path', () => {
  const turn = subgraphParameters<AgentTurnParameters>(PlanningGraph, 'writePlan', PlanningGraph.init(destination('/workspace'), { story, artifacts, plan }));
  assert.deepEqual(turn.session, { kind: 'spawn', ...planner });
  assert.deepEqual(turn.modifiers, [{ kind: 'command', name: 'create-implementation-plan' }]);
  const prompt = turn.prompt ?? '';
  assert.match(prompt, /omit mock-UI phases and repository documentation work/);
  assert.match(prompt, /Write index.md last/);
  assert.match(prompt, /ask the human your questions and stop without writing index.md/);
  assert.match(prompt, /removal or replacement with production implementation/);
  for (const path of [...Object.values(artifacts), plan.planDirectory, plan.entryPlanPath]) assert.ok(prompt.includes(path), path);
});

test('a completed planner turn with an index and phase files is ready', async () => {
  await withRepository(async (repositoryPath) => {
    writePlan(repositoryPath, { phases: true });
    const checked = await visit(PlanningGraph, 'checkPlan', workflowHarness().ctx, planned(repositoryPath));
    assert.equal(checked.to, 'ready');
    assert.deepEqual(PlanningGraph.outcomes.ready!.output(checked.state), { outcome: 'ready', planner: plannerPane });
  });
});

test('a missing index pauses for the human, and Continue checks the plan files again', async () => {
  await withRepository(async (repositoryPath) => {
    const harness = workflowHarness();
    const missing = await visit(PlanningGraph, 'checkPlan', harness.ctx, planned(repositoryPath));
    assert.equal(missing.to, 'reconcile');
    const paused = await visit(PlanningGraph, 'reconcile', harness.ctx, missing.state, { kind: 'user_continue' });
    assert.equal(paused.to, 'checkPlan');
    assert.equal(harness.feedback.at(-1)?.phase, 'Planner needs human reconciliation');
    assert.match(harness.feedback.at(-1)?.message ?? '', /has not written scratch\/story\/implementation\/index\.md, so it likely has questions for you/);
    writePlan(repositoryPath, { phases: false });
    const incomplete = await visit(PlanningGraph, 'checkPlan', harness.ctx, paused.state);
    assert.equal(incomplete.to, 'reconcile');
    assert.match(incomplete.state.reconcile ?? '', /contains no phase files/);
    writePlan(repositoryPath, { phases: true });
    assert.equal((await visit(PlanningGraph, 'checkPlan', harness.ctx, paused.state)).to, 'ready');
  });
});

test('a dead planner session fails planning', () => {
  const died = visitSubgraph(PlanningGraph, 'writePlan', PlanningGraph.init(destination('/workspace'), { story, artifacts, plan }), agentTurnInterrupted(plannerPane, 'session_died'));
  assert.equal(died.to, 'failed');
  assert.deepEqual(PlanningGraph.outcomes.failed!.output(died.state), { outcome: 'failed', failure: { message: 'Implementation-plan writer failed', diagnostic: 'Implementation-plan writer turn failed: session_died' } });
});

test('starts phase-wise implementation with the planner session and boolean options', () => {
  const ready = visitSubgraph(ImplementStoryGraph, 'createPlan', ImplementStoryGraph.init(destination('/workspace'), { ...parameters, options: { humanInTheLoop: 'no', autoReview: 'yes', autoCommit: 'no' } }), { outcomeId: 'ready', outcomeKind: 'success', output: { outcome: 'ready', planner: plannerPane } });
  assert.equal(ready.to, 'implementPlan');
  assert.deepEqual(subgraphParameters<ImplementPhaseWisePlanParameters>(ImplementStoryGraph, 'implementPlan', ready.state), {
    options: { humanInTheLoop: false, autoReview: true, autoCommit: false },
    plannerSessionId: 55,
  });
});

test('completion preserves the planner pane and returns it to the user', async () => {
  const harness = workflowHarness();
  const implemented = visitSubgraph(ImplementStoryGraph, 'implementPlan', withPlanner(), phaseWiseResult(2, 2));
  assert.equal(implemented.to, 'finish');
  const finished = await visit(ImplementStoryGraph, 'finish', harness.ctx, implemented.state);
  assert.equal(harness.closedPanes.length, 0);
  assert.deepEqual(harness.feedback, [{ phase: 'Story implemented', message: `Completed 2 phases from ${plan.entryPlanPath}. Planner remains open in pane 66.` }]);
  assert.deepEqual(ImplementStoryGraph.outcomes.implemented!.output(finished.state), {
    outcome: 'story-implemented',
    story,
    artifacts,
    plan,
    plannerAgentSessionId: 55,
    plannerPaneId: 66,
    implementation: { entryPlanPath: plan.entryPlanPath, decisionLogPath: 'scratch/story/implementation/decisions.md', phaseCount: 2, completedPhaseCount: 2 },
  });
});

test('a failed or incomplete implementation is reported and leaves the planner open for diagnosis', async () => {
  const harness = workflowHarness();
  const failed = visitSubgraph(ImplementStoryGraph, 'implementPlan', withPlanner(), { outcomeId: 'failed', outcomeKind: 'failure', output: { outcome: 'failed', reason: 'Commit failed for phase 2' } });
  assert.equal(failed.to, 'reportFailure');
  await visit(ImplementStoryGraph, 'reportFailure', harness.ctx, failed.state);
  assert.deepEqual(harness.feedback, [{ kind: 'error', phase: 'Implement story failed', message: 'Story implementation failed' }]);
  assert.deepEqual(harness.logs, ['implement-phase-wise-plan failed: Commit failed for phase 2']);
  assert.equal(harness.closedPanes.length, 0);

  assert.match(visitSubgraph(ImplementStoryGraph, 'implementPlan', withPlanner(), phaseWiseResult(1, 2)).state.failure?.diagnostic ?? '', /completed 1 of 2 phases/);
  assert.match(visitSubgraph(ImplementStoryGraph, 'implementPlan', withPlanner(), phaseWiseResult(2, 2, 'other/index.md')).state.failure?.diagnostic ?? '', /instead of scratch\/story\/implementation\/index\.md/);
});

test('every node has one edge and every destination is declared', () => {
  assertDestinationsDeclared(ImplementStoryGraph);
  assertDestinationsDeclared(PlanningGraph);
});

function planned(repositoryPath: string) {
  return visitSubgraph(PlanningGraph, 'writePlan', PlanningGraph.init(destination(repositoryPath), { story, artifacts, plan }), agentTurnEnded(plannerPane)).state;
}

function withPlanner() {
  return { ...ImplementStoryGraph.init(destination('/workspace'), parameters), planner: plannerPane };
}

function phaseWiseResult(completedPhaseCount: number, phaseCount: number, entryPlanPath = plan.entryPlanPath) {
  return {
    outcomeId: 'implemented',
    outcomeKind: 'success' as const,
    output: {
      outcome: 'plan-implemented' as const,
      entryPlanPath,
      decisionLogPath: 'scratch/story/implementation/decisions.md',
      phases: Array.from({ length: phaseCount }, (_, index) => ({ number: index + 1, slug: `phase-0${index + 1}-work`, type: 'implementation' as const })),
      completedPhaseCount,
    },
  };
}

function writePlan(repositoryPath: string, input: { readonly phases: boolean }): void {
  const directory = join(repositoryPath, plan.planDirectory);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(repositoryPath, plan.entryPlanPath), '# Plan\n');
  if (input.phases) writeFileSync(join(directory, 'phase-01-work.md'), '# Phase 1\n');
}

async function withRepository(run: (repositoryPath: string) => Promise<void>): Promise<void> {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'implement-story-'));
  try {
    await run(repositoryPath);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
}

function workflowHarness() {
  const feedback: Array<Parameters<OperationContext['setUiFeedback']>[0]> = [];
  const logs: string[] = [];
  const closedPanes: number[] = [];
  const ctx: OperationContext = {
    destination: destination('/workspace'),
    execution: { runId: 1, graphInvocationId: 1, executionId: 1, attempt: 'initial' },
    spawnAgentSession: async () => { throw new Error('Agent turns run in the AgentTurn graph.'); },
    sendAgentPrompt: async () => { throw new Error('Agent turns run in the AgentTurn graph.'); },
    closePane: async (paneId) => { closedPanes.push(paneId); },
    getConversationHistory: async () => [],
    runHeadlessAgent: async () => { throw new Error('Judgments run in their own graph.'); },
    log: async (_level, text) => { logs.push(text); },
    setUiFeedback: async (value) => { feedback.push(value); },
  };
  return { ctx, feedback, logs, closedPanes };
}
