import assert from 'node:assert/strict';
import test from 'node:test';

import type { AgentTurnParameters } from 'isagi-workflow-common-graphs';
import {
  agentTurnEnded,
  agentTurnInterrupted,
  assertDestinationsDeclared,
  subgraphParameters,
  visit,
  visitSubgraph,
} from 'isagi-workflow-common-graphs/testing';

import { deckArchitect, deckBuilder } from '../src/constants.js';
import { WalkthroughDeckBuildGraph } from '../src/graphs/deck-build.js';
import { WalkthroughDeckNeighborhoodsGraph } from '../src/graphs/deck-neighborhoods.js';
import { WalkthroughDeckPlanGraph } from '../src/graphs/deck-plan.js';
import { assembledHtml, context, destination, plan, withRepository, workflowHarness, write, writeDeckPlan, writeGenericCurriculum } from './fixtures.js';

const { paths } = context();
const showMe = [{ kind: 'skill', name: 'show-me' }];
const pane = (id: number) => ({ agentSessionId: id - 10, paneId: id });

test('a valid deck plan is reused without an architect', async () => {
  await withRepository(async (repositoryPath) => {
    writeGenericCurriculum(repositoryPath);
    writeDeckPlan(repositoryPath);
    const graph = WalkthroughDeckPlanGraph;
    const inspected = await visit(graph, 'inspectDeckPlan', workflowHarness(repositoryPath).ctx, graph.init(destination(repositoryPath), context()));
    assert.equal(inspected.to, 'planned');
    assert.deepEqual(graph.outcomes.planned!.output(inspected.state), { outcome: 'planned', plan: plan() });
  });
});

test('a missing deck plan is architected, read, and its architect closed', async () => {
  await withRepository(async (repositoryPath) => {
    writeGenericCurriculum(repositoryPath);
    const graph = WalkthroughDeckPlanGraph;
    const harness = workflowHarness(repositoryPath);
    const inspected = await visit(graph, 'inspectDeckPlan', harness.ctx, graph.init(destination(repositoryPath), context()));
    assert.equal(inspected.to, 'architectDeck');

    const turn = subgraphParameters<AgentTurnParameters>(graph, 'architectDeck', inspected.state);
    assert.deepEqual(turn.session, { kind: 'spawn', ...deckArchitect });
    const architected = visitSubgraph(graph, 'architectDeck', inspected.state, agentTurnEnded(pane(21)));
    assert.equal(architected.to, 'readDeckPlan');

    writeDeckPlan(repositoryPath);
    const read = await visit(graph, 'readDeckPlan', harness.ctx, architected.state);
    assert.equal(read.to, 'planned');
    assert.deepEqual(harness.closedPanes, [21]);
  });
});

test('presentation construction uses a fresh Show Me session per neighborhood and validates final assembly', async () => {
  await withRepository(async (repositoryPath) => {
    writeGenericCurriculum(repositoryPath);
    const harness = workflowHarness(repositoryPath);
    const build = WalkthroughDeckBuildGraph;
    const start = build.init(destination(repositoryPath), { context: context(), plan: plan() });

    const shellTurn = subgraphParameters<AgentTurnParameters>(build, 'buildShell', start);
    assert.deepEqual(shellTurn.session, { kind: 'spawn', ...deckBuilder });
    const shell = visitSubgraph(build, 'buildShell', start, agentTurnEnded(pane(21)));
    write(repositoryPath, paths.htmlPath, '<main data-walkthrough-deck><div data-slide-viewport><section id="opening" data-walkthrough-slide></section><!-- walkthrough-content-end --></div><nav data-slide-navigation></nav></main>');
    const shellChecked = await visit(build, 'checkShell', harness.ctx, shell.state);
    assert.equal(shellChecked.to, 'buildNeighborhoods');

    const neighborhoods = WalkthroughDeckNeighborhoodsGraph;
    const first = neighborhoods.init(destination(repositoryPath), subgraphParameters(build, 'buildNeighborhoods', shellChecked.state));
    const neighborhoodTurn = subgraphParameters<AgentTurnParameters>(neighborhoods, 'buildNeighborhood', first);
    assert.deepEqual(neighborhoodTurn.modifiers, showMe);
    assert.equal(neighborhoodTurn.feedback?.phase, 'Creating System boundary');
    const built = visitSubgraph(neighborhoods, 'buildNeighborhood', first, agentTurnEnded(pane(22)));
    const checked = await visit(neighborhoods, 'checkNeighborhood', harness.ctx, built.state);
    assert.equal(checked.to, 'built');

    const assemblyReady = visitSubgraph(build, 'buildNeighborhoods', shellChecked.state, { outcomeId: 'built', outcomeKind: 'success', output: { outcome: 'built' } });
    assert.equal(assemblyReady.to, 'assemble');
    assert.deepEqual(subgraphParameters<AgentTurnParameters>(build, 'assemble', assemblyReady.state).modifiers, showMe);
    const assembled = visitSubgraph(build, 'assemble', assemblyReady.state, agentTurnEnded(pane(23)));

    write(repositoryPath, paths.htmlPath, assembledHtml());
    const finished = await visit(build, 'finishPresentation', harness.ctx, assembled.state);
    assert.equal(finished.to, 'created');
    assert.deepEqual(build.outcomes.created!.output(finished.state), {
      outcome: 'presentation-created',
      curriculumPath: paths.curriculumPath,
      deckPlanPath: paths.deckPlanPath,
      presentationPath: paths.htmlPath,
      neighborhoodCount: 1,
      contentMomentCount: 1,
      substantiveSlideCount: 1,
      totalSlideCount: 2,
      coverageItemCount: 2,
    });
    assert.deepEqual(harness.closedPanes, [21, 22, 23]);
  });
});

test('a dead builder session and a failed neighborhood both fail the build with their diagnostics', () => {
  const build = WalkthroughDeckBuildGraph;
  const start = build.init(destination('/workspace'), { context: context(), plan: plan() });
  const died = visitSubgraph(build, 'buildShell', start, agentTurnInterrupted(pane(21), 'Deck shell creation was interrupted in pane 21: session_died'));
  assert.equal(died.to, 'failed');
  assert.deepEqual(build.outcomes.failed!.output(died.state), {
    outcome: 'failed',
    failure: { message: 'Deck shell creation failed because its agent session ended.', diagnostic: 'Deck shell creation was interrupted in pane 21: session_died' },
  });

  const failure = { message: 'The walkthrough deck is missing after neighborhood construction. Its pane remains open.', diagnostic: 'Expected walkthrough deck.' };
  const neighborhoodFailed = visitSubgraph(build, 'buildNeighborhoods', start, { outcomeId: 'failed', outcomeKind: 'failure', output: { outcome: 'failed', failure } });
  assert.equal(neighborhoodFailed.to, 'failed');
  assert.deepEqual(neighborhoodFailed.state.failure, failure);
});

test('every node has one edge and every destination is declared', () => {
  assertDestinationsDeclared(WalkthroughDeckPlanGraph);
  assertDestinationsDeclared(WalkthroughDeckBuildGraph);
  assertDestinationsDeclared(WalkthroughDeckNeighborhoodsGraph);
});

test('missing or invalid deck files fail the step so Retry reads them again', async () => {
  await withRepository(async (repositoryPath) => {
    const harness = workflowHarness(repositoryPath);
    await assert.rejects(visit(WalkthroughDeckPlanGraph, 'inspectDeckPlan', harness.ctx, WalkthroughDeckPlanGraph.init(destination(repositoryPath), context())), /./);
    assert.deepEqual(harness.feedback.at(-1), { kind: 'error', phase: 'Solution walkthrough failed', message: 'Presentation creation cannot start because the curriculum is invalid.' });

    const build = WalkthroughDeckBuildGraph;
    const shellBuilt = visitSubgraph(build, 'buildShell', build.init(destination(repositoryPath), { context: context(), plan: plan() }), agentTurnEnded(pane(21)));
    await assert.rejects(visit(build, 'checkShell', harness.ctx, shellBuilt.state), /Expected walkthrough deck shell/);
    assert.deepEqual(harness.closedPanes, []);
    write(repositoryPath, paths.htmlPath, '<main data-walkthrough-deck></main>');
    assert.equal((await visit(build, 'checkShell', harness.ctx, shellBuilt.state)).to, 'buildNeighborhoods');
  });
});
