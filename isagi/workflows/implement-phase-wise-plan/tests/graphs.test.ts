import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import type { AgentTurnParameters, JudgmentParameters } from 'isagi-workflow-common-graphs';
import {
  agentTurnEnded,
  agentTurnInterrupted,
  assertDestinationsDeclared,
  headlessCompleted,
  headlessFailed,
  judged,
  rejudged,
  subgraphParameters,
  visit,
  visitSubgraph,
} from 'isagi-workflow-common-graphs/testing';

import { commitPrompt } from '../src/commit.js';
import { commitAgent, headlessJudgment, implementerProseHeavy, implementerUiHeavy } from '../src/constants.js';
import { renderWorkflowStatus } from '../src/feedback.js';
import { ImplementPhaseWisePlanGraph } from '../src/graph.js';
import { ChooseImplementerGraph } from '../src/graphs/choose-implementer.js';
import { CommitGraph } from '../src/graphs/commit-phase.js';
import { DiscoveryGraph } from '../src/graphs/discovery.js';
import { ImplementerExchangeGraph, PlannerExchangeGraph } from '../src/graphs/exchanges.js';
import workflow from '../src/index.js';
import { destination, discoveryResult, implementer, message, phases, plannerSessionId, workflowHarness, writePlanFixture } from './fixtures.js';

const phase = phases()[1]!;

test('the launch form defaults automatic review and commit to yes and needs the planner pane', async () => {
  const origin = { worktreeId: 1, worktreePath: '/workspace', surfaceId: 7, agentSessionId: 11 };
  assert.deepEqual((await workflow.command(origin)).inputs?.map(({ key }) => key), ['humanInTheLoop', 'autoReview', 'autoCommit']);
  assert.deepEqual(await workflow.parse(origin, {}), { options: { autoCommit: true, autoReview: true, humanInTheLoop: true }, plannerSessionId: 11 });
  assert.deepEqual(await workflow.parse(origin, { autoCommit: 'no', autoReview: 'no', humanInTheLoop: 'no' }), { options: { autoCommit: false, autoReview: false, humanInTheLoop: false }, plannerSessionId: 11 });
  assert.throws(() => workflow.parse({ ...origin, agentSessionId: null }, {}), /Start this workflow from the planner agent pane/);
  assert.throws(() => workflow.parse(origin, { autoCommit: 'maybe' }), /Automatic commit must be yes or no/);
});

test('the business graph discovers the plan, implements each remaining phase, and finishes', async () => {
  const graph = ImplementPhaseWisePlanGraph;
  assert.deepEqual(Object.keys(graph.nodes), ['discoverPlan', 'implementPhase', 'finish', 'reportFailure']);
  const options = { autoCommit: true, autoReview: true, humanInTheLoop: false };
  const plan = { entryPlanPath: 'docs/plan.md', decisionLogPath: 'docs/decisions.md', phases: phases(), currentPhaseIndex: 2 };
  const discovered = visitSubgraph(graph, 'discoverPlan', graph.init(destination(), { options, plannerSessionId }), { outcomeId: 'found', outcomeKind: 'success', output: { outcome: 'found', plan } });
  assert.equal(discovered.to, 'implementPhase');
  assert.equal(subgraphParameters<{ phaseIndex: number }>(graph, 'implementPhase', discovered.state).phaseIndex, 2);
  const third = visitSubgraph(graph, 'implementPhase', discovered.state, { outcomeId: 'implemented', outcomeKind: 'success', output: { outcome: 'implemented' } });
  assert.equal(third.to, 'implementPhase');
  const fourth = visitSubgraph(graph, 'implementPhase', third.state, { outcomeId: 'implemented', outcomeKind: 'success', output: { outcome: 'implemented' } });
  assert.equal(fourth.to, 'finish');
  const harness = workflowHarness();
  const finished = await visit(graph, 'finish', harness.ctx, fourth.state);
  assert.deepEqual(harness.feedback, [renderWorkflowStatus({ kind: 'complete' })]);
  assert.deepEqual(graph.outcomes.implemented!.output(finished.state), { outcome: 'plan-implemented', entryPlanPath: 'docs/plan.md', decisionLogPath: 'docs/decisions.md', phases: phases(), completedPhaseCount: 4 });

  const done = visitSubgraph(graph, 'discoverPlan', graph.init(destination(), { options, plannerSessionId }), { outcomeId: 'found', outcomeKind: 'success', output: { outcome: 'found', plan: { ...plan, currentPhaseIndex: 4 } } });
  assert.equal(done.to, 'finish');

  const failure = { message: 'Commit failed for phase 3', diagnostic: 'Commit failed for phase 3: no commit.' };
  const failed = visitSubgraph(graph, 'implementPhase', discovered.state, { outcomeId: 'failed', outcomeKind: 'failure', output: { outcome: 'failed', failure } });
  assert.equal(failed.to, 'reportFailure');
  const reported = await visit(graph, 'reportFailure', harness.ctx, failed.state);
  assert.deepEqual(harness.feedback.at(-1), renderWorkflowStatus({ kind: 'failed', message: failure.message }));
  assert.deepEqual(graph.outcomes.failed!.output(reported.state), { outcome: 'failed', reason: failure.diagnostic });
  for (const each of [graph, DiscoveryGraph, ChooseImplementerGraph, ImplementerExchangeGraph, PlannerExchangeGraph, CommitGraph]) assertDestinationsDeclared(each);
});

test('plan discovery reads the planner conversation and checks the discovered plan', async () => {
  const worktreePath = mkdtempSync(join(tmpdir(), 'phase-wise-plan-'));
  try {
    writePlanFixture(worktreePath);
    const graph = DiscoveryGraph;
    const harness = workflowHarness({ worktreePath, conversationHistory: [message('assistant', 'The plan is at scratch/plans/current-plan/index.md.')] });
    const read = await visit(graph, 'readConversation', harness.ctx, graph.init(destination(worktreePath), { plannerSessionId }));
    assert.equal(read.to, 'discover');
    const judgment = subgraphParameters<JudgmentParameters>(graph, 'discover', read.state);
    assert.deepEqual(judgment.profile, headlessJudgment);
    assert.match(judgment.prompt, /Message 1 \(assistant\):\nThe plan is at scratch\/plans\/current-plan\/index\.md\./);
    const discovered = visitSubgraph(graph, 'discover', read.state, judged(discoveryResult(0)));
    const normalized = await visit(graph, 'normalize', harness.ctx, discovered.state);
    assert.equal(normalized.to, 'found');
    assert.equal(harness.feedback.at(-1)?.phase, 'plan-ready');
    assert.deepEqual(graph.outcomes.found!.output(normalized.state).plan.currentPhaseIndex, 0);
  } finally {
    rmSync(worktreePath, { recursive: true, force: true });
  }
});

test('an unusable discovery pauses, and Continue reads the conversation again and rediscovers', async () => {
  const graph = DiscoveryGraph;
  const harness = workflowHarness({ conversationHistory: [message('assistant', 'No plan yet.')] });
  const read = await visit(graph, 'readConversation', harness.ctx, graph.init(destination(), { plannerSessionId }));
  const discovered = visitSubgraph(graph, 'discover', read.state, judged({ planReferenceFound: false as const }));
  const missing = await visit(graph, 'normalize', harness.ctx, discovered.state);
  assert.equal(missing.to, 'askUser');
  const asked = await visit(graph, 'askUser', harness.ctx, missing.state, { kind: 'user_continue' });
  assert.equal(harness.logs.at(-1), 'No phase-wise plan was found during discovery.');
  assert.equal(asked.to, 'readConversation');
  assert.equal(asked.state.failure, null);

  harness.setHistory([message('assistant', 'The current plan is at scratch/plans/current-plan/index.md.')]);
  const reread = await visit(graph, 'readConversation', harness.ctx, asked.state);
  assert.match(subgraphParameters<JudgmentParameters>(graph, 'discover', reread.state).prompt, /The current plan is at/);
});

test('mock-UI phases use the UI-heavy implementer without a classifier; others are classified', async () => {
  const graph = ChooseImplementerGraph;
  const harness = workflowHarness();
  const mock = await visit(graph, 'prepare', harness.ctx, graph.init(destination(), { phase: { ...phase, type: 'mock-ui' }, phaseCount: 4, entryPlanPath: 'docs/plan.md' }));
  assert.equal(mock.to, 'chosen');
  assert.deepEqual(graph.outcomes.chosen!.output(mock.state), { outcome: 'chosen', profile: implementerUiHeavy });

  const other = await visit(graph, 'prepare', harness.ctx, graph.init(destination(), { phase, phaseCount: 4, entryPlanPath: 'docs/plan.md' }));
  assert.equal(other.to, 'classify');
  assert.match(subgraphParameters<JudgmentParameters>(graph, 'classify', other.state).prompt, /phase 2/i);
  const classified = visitSubgraph(graph, 'classify', other.state, judged('prose-heavy'));
  assert.deepEqual(graph.outcomes.chosen!.output(classified.state), { outcome: 'chosen', profile: implementerProseHeavy });
});

test('an implementer exchange prompts, reads the latest turn, and classifies it for its purpose', async () => {
  const graph = ImplementerExchangeGraph;
  const harness = workflowHarness({ conversationHistory: [message('user', 'Go.'), message('assistant', 'Alignment established; ready to implement.')] });
  const request = {
    phase,
    phaseCount: 4,
    entryPlanPath: 'docs/plan.md',
    session: { kind: 'existing' as const, ...implementer },
    prompt: 'Continue aligning.',
    feedback: { phase: 'phase-alignment' },
    turnPurpose: 'alignment' as const,
  };
  const start = graph.init(destination(), request);
  assert.deepEqual(subgraphParameters<AgentTurnParameters>(graph, 'turn', start), { label: 'Implementer', session: request.session, prompt: 'Continue aligning.', feedback: request.feedback });
  const read = await visit(graph, 'readTurn', harness.ctx, visitSubgraph(graph, 'turn', start, agentTurnEnded(implementer)).state);
  const classify = subgraphParameters<JudgmentParameters>(graph, 'classify', read.state);
  assert.match(classify.prompt, /Alignment established; ready to implement\./);
  assert.match(classify.prompt, /alignment/);
  const exchanged = visitSubgraph(graph, 'classify', read.state, judged('phase-complete'));
  assert.deepEqual(graph.outcomes.exchanged!.output(exchanged.state), { outcome: 'exchanged', implementer, implementerTurn: 'Alignment established; ready to implement.', result: 'phase-complete' });

  const died = visitSubgraph(graph, 'turn', start, agentTurnInterrupted(implementer, 'session_died'));
  assert.deepEqual(graph.outcomes.failed!.output(died.state), { outcome: 'failed', failure: { message: 'Implementer turn failed during phase 2', diagnostic: 'Implementer turn failed during phase 2: session_died' } });
});

test('a severe flag waits for the human, then returns the planner’s latest turn as resolved', async () => {
  const graph = PlannerExchangeGraph;
  const severe = '## Human Escalation\n\nEscalation required: the human must approve the persistence change.';
  const harness = workflowHarness({ conversationHistory: [message('assistant', severe)] });
  const start = graph.init(destination(), { phase, phaseCount: 4, plannerSessionId, prompt: 'Planner prompt.', feedback: { phase: 'planner-review' } });
  assert.deepEqual(subgraphParameters<AgentTurnParameters>(graph, 'turn', start).session, { kind: 'existing', agentSessionId: 11, paneId: null });
  const read = await visit(graph, 'readTurn', harness.ctx, visitSubgraph(graph, 'turn', start, agentTurnEnded({ agentSessionId: 11, paneId: null })).state);
  const flagged = visitSubgraph(graph, 'classify', read.state, judged('severe-flag'));
  assert.equal(flagged.to, 'askHuman');
  const asked = await visit(graph, 'askHuman', harness.ctx, flagged.state, { kind: 'user_continue' });
  assert.deepEqual(harness.feedback.at(-1), renderWorkflowStatus({ kind: 'severe-flag', phase: 2 }));
  harness.setHistory([message('assistant', severe), message('user', 'Approved by the human.'), message('assistant', 'Resolution: keep the boundary.')]);
  const reread = await visit(graph, 'rereadTurn', harness.ctx, asked.state);
  assert.deepEqual(graph.outcomes.exchanged!.output(reread.state), { outcome: 'exchanged', plannerTurn: 'Resolution: keep the boundary.', result: 'severe-flag-resolved' });
});

test('a verified commit is recorded; a failed one pauses and Continue runs one Git-checking recovery', async () => {
  const graph = CommitGraph;
  const harness = workflowHarness();
  const request = { phase, phaseCount: 4, entryPlanPath: 'docs/plan.md' };
  const valid = JSON.stringify({ outcome: 'commit-created', commit: 'a'.repeat(40), subject: 'feat: production wiring' });
  const committed = await visit(graph, 'commit', harness.ctx, graph.init(destination(), request), headlessCompleted('op-1', valid));
  assert.deepEqual(harness.headless[0], { ...commitAgent, prompt: commitPrompt({ worktreePath: '/workspace', ...request }) });
  assert.equal(committed.to, 'recordCommit');

  const malformed = await visit(graph, 'commit', harness.ctx, graph.init(destination(), request), headlessCompleted('op-2', 'I committed it.'));
  assert.equal(malformed.to, 'askUser');
  const failedRun = await visit(graph, 'commit', harness.ctx, graph.init(destination(), request), headlessFailed('op-3'));
  assert.equal(failedRun.to, 'askUser');

  const asked = await visit(graph, 'askUser', harness.ctx, malformed.state, { kind: 'user_continue' });
  assert.equal(asked.to, 'recover');
  for (const outcome of ['commit-existing', 'commit-created']) {
    const result = JSON.stringify({ outcome, commit: 'b'.repeat(40), subject: 'feat: production wiring' });
    const recovered = await visit(graph, 'recover', harness.ctx, asked.state, headlessCompleted(`op-${harness.headless.length + 1}`, result));
    assert.equal(recovered.to, 'recordCommit');
  }
  assert.match(harness.headless.at(-1)?.prompt ?? '', /inspect Git before making any changes/i);
  assert.match(harness.headless.at(-1)?.prompt ?? '', /I committed it\./);

  const exhausted = await visit(graph, 'recover', harness.ctx, asked.state, headlessCompleted(`op-${harness.headless.length + 1}`, 'still ambiguous'));
  assert.equal(exhausted.to, 'failed');
  assert.match(exhausted.state.failure?.diagnostic ?? '', /Recovery attempt exhausted/);
});

test('a rejudge reads the latest reply or conversation again before judging', async () => {
  const harness = workflowHarness({ conversationHistory: [message('assistant', 'Reply.')] });
  const implementerRequest = { phase, phaseCount: 4, entryPlanPath: 'docs/plan.md', session: { kind: 'existing' as const, ...implementer }, prompt: 'Go.', feedback: { phase: 'phase-alignment' }, turnPurpose: 'alignment' as const };
  const implementerRead = await visit(ImplementerExchangeGraph, 'readTurn', harness.ctx, visitSubgraph(ImplementerExchangeGraph, 'turn', ImplementerExchangeGraph.init(destination(), implementerRequest), agentTurnEnded(implementer)).state);
  assert.equal(visitSubgraph(ImplementerExchangeGraph, 'classify', implementerRead.state, rejudged()).to, 'readTurn');

  const plannerStart = PlannerExchangeGraph.init(destination(), { phase, phaseCount: 4, plannerSessionId, prompt: 'Planner prompt.', feedback: { phase: 'planner-review' } });
  const plannerRead = await visit(PlannerExchangeGraph, 'readTurn', harness.ctx, visitSubgraph(PlannerExchangeGraph, 'turn', plannerStart, agentTurnEnded({ agentSessionId: 11, paneId: null })).state);
  assert.equal(visitSubgraph(PlannerExchangeGraph, 'classify', plannerRead.state, rejudged()).to, 'readTurn');

  const kind = await visit(ChooseImplementerGraph, 'prepare', harness.ctx, ChooseImplementerGraph.init(destination(), { phase, phaseCount: 4, entryPlanPath: 'docs/plan.md' }));
  assert.equal(visitSubgraph(ChooseImplementerGraph, 'classify', kind.state, rejudged()).to, 'classify');

  const conversation = await visit(DiscoveryGraph, 'readConversation', harness.ctx, DiscoveryGraph.init(destination(), { plannerSessionId }));
  const rediscover = visitSubgraph(DiscoveryGraph, 'discover', conversation.state, rejudged());
  assert.equal(rediscover.to, 'readConversation');
  assert.equal(rediscover.state.conversation, null);
});

test('a missing implementer or planner reply fails the step so Retry reads it again', async () => {
  const harness = workflowHarness({ conversationHistory: [] });
  const implementerRequest = { phase, phaseCount: 4, entryPlanPath: 'docs/plan.md', session: { kind: 'existing' as const, ...implementer }, prompt: 'Go.', feedback: { phase: 'phase-alignment' }, turnPurpose: 'alignment' as const };
  const turned = visitSubgraph(ImplementerExchangeGraph, 'turn', ImplementerExchangeGraph.init(destination(), implementerRequest), agentTurnEnded(implementer));
  await assert.rejects(visit(ImplementerExchangeGraph, 'readTurn', harness.ctx, turned.state), /implementer session 22 has no complete assistant turn to inspect\./);
  assert.deepEqual(harness.feedback.at(-1), renderWorkflowStatus({ kind: 'failed', message: 'No implementer response was found for phase 2' }));

  const plannerStart = PlannerExchangeGraph.init(destination(), { phase, phaseCount: 4, plannerSessionId, prompt: 'Planner prompt.', feedback: { phase: 'planner-review' } });
  const plannerTurned = visitSubgraph(PlannerExchangeGraph, 'turn', plannerStart, agentTurnEnded({ agentSessionId: 11, paneId: null }));
  await assert.rejects(visit(PlannerExchangeGraph, 'readTurn', harness.ctx, plannerTurned.state), /planner session 11 has no complete assistant turn to inspect\./);
});
