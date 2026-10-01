import assert from 'node:assert/strict';
import test from 'node:test';

import { assertDestinationsDeclared, subgraphParameters, visit, visitSubgraph } from 'isagi-workflow-common-graphs/testing';

import { SolutionWalkthroughGraph, type SolutionWalkthroughParameters } from '../src/graph.js';
import type { DeckBuildParameters } from '../src/graphs/deck-build.js';
import { context, destination, plan, reviewDirectory, sources, workflowHarness } from './fixtures.js';

const graph = SolutionWalkthroughGraph;
const { paths } = context();
const failure = { message: 'The existing deck plan cannot be reused.', diagnostic: 'deck plan schemaVersion must be 7.' };
const presentation = {
  outcome: 'presentation-created',
  curriculumPath: paths.curriculumPath,
  deckPlanPath: paths.deckPlanPath,
  presentationPath: paths.htmlPath,
  neighborhoodCount: 1,
  contentMomentCount: 1,
  substantiveSlideCount: 1,
  totalSlideCount: 2,
  coverageItemCount: 2,
} as const;

function start(deliveryMechanism: SolutionWalkthroughParameters['deliveryMechanism'] = 'presentation') {
  return graph.init(destination('/workspace'), {
    story: 'Story 42',
    sources,
    reviewDirectory,
    audienceProfile: { familiarity: 'new', technicalDepth: 'system-design' },
    deliveryMechanism,
  });
}

test('the business graph is four phases and a failure report', () => {
  assert.deepEqual(Object.keys(graph.nodes), ['prepareCurriculum', 'planDeck', 'buildDeck', 'runSocratic', 'reportFailure']);
  assertDestinationsDeclared(graph);
});

test('a presentation prepares the curriculum, plans the deck, and builds it from that plan', () => {
  const prepared = visitSubgraph(graph, 'prepareCurriculum', start(), { outcomeId: 'ready', outcomeKind: 'success', output: { outcome: 'ready' } });
  assert.equal(prepared.to, 'planDeck');
  const planned = visitSubgraph(graph, 'planDeck', prepared.state, { outcomeId: 'planned', outcomeKind: 'success', output: { outcome: 'planned', plan: plan() } });
  assert.equal(planned.to, 'buildDeck');
  assert.deepEqual(subgraphParameters<DeckBuildParameters>(graph, 'buildDeck', planned.state), { context: context(), plan: plan() });
  const built = visitSubgraph(graph, 'buildDeck', planned.state, { outcomeId: 'created', outcomeKind: 'success', output: presentation });
  assert.equal(built.to, 'presentationCreated');
  assert.deepEqual(graph.outcomes.presentationCreated!.output(built.state), presentation);
});

test('a Socratic walkthrough skips the deck and returns its canonical outcome', () => {
  const prepared = visitSubgraph(graph, 'prepareCurriculum', start('socratic-walkthrough'), { outcomeId: 'ready', outcomeKind: 'success', output: { outcome: 'ready' } });
  assert.equal(prepared.to, 'runSocratic');
  const completed = { outcome: 'socratic-walkthrough-completed', curriculumPath: paths.curriculumPath } as const;
  const finished = visitSubgraph(graph, 'runSocratic', prepared.state, { outcomeId: 'completed', outcomeKind: 'success', output: completed });
  assert.equal(finished.to, 'socraticCompleted');
  assert.deepEqual(graph.outcomes.socraticCompleted!.output(finished.state), completed);
});

test('a failed phase is reported once and ends in the failure outcome', async () => {
  const harness = workflowHarness('/workspace');
  const failed = visitSubgraph(graph, 'planDeck', start(), { outcomeId: 'failed', outcomeKind: 'failure', output: { outcome: 'failed', failure } });
  assert.equal(failed.to, 'reportFailure');
  const reported = await visit(graph, 'reportFailure', harness.ctx, failed.state);
  assert.equal(reported.to, 'failed');
  assert.deepEqual(harness.feedback, [{ kind: 'error', phase: 'Solution walkthrough failed', message: failure.message }]);
  assert.deepEqual(harness.logs, [failure.diagnostic]);
  assert.deepEqual(graph.outcomes.failed!.output(reported.state), { outcome: 'failed', reason: failure.diagnostic });
});
