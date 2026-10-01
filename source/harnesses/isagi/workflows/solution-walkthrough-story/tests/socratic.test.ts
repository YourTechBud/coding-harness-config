import assert from 'node:assert/strict';
import test from 'node:test';

import type { AgentTurnParameters } from 'isagi-workflow-common-graphs';
import { agentTurnEnded, assertDestinationsDeclared, subgraphParameters, visit, visitSubgraph } from 'isagi-workflow-common-graphs/testing';

import { guide } from '../src/constants.js';
import { WalkthroughSocraticGraph } from '../src/graphs/socratic.js';
import { context, destination, workflowHarness } from './fixtures.js';

const graph = WalkthroughSocraticGraph;

test('Socratic mode starts a Show Me guide, waits for Continue, and returns its canonical outcome', async () => {
  const harness = workflowHarness('/workspace');
  const start = graph.init(destination('/workspace'), context());

  const turn = subgraphParameters<AgentTurnParameters>(graph, 'startGuide', start);
  assert.deepEqual(turn.session, { kind: 'spawn', ...guide });
  assert.deepEqual(turn.modifiers, [{ kind: 'skill', name: 'show-me' }]);
  const started = visitSubgraph(graph, 'startGuide', start, agentTurnEnded({ agentSessionId: 11, paneId: 21 }));
  assert.equal(started.to, 'awaitDiscussion');

  const discussing = await visit(graph, 'awaitDiscussion', harness.ctx, started.state, { kind: 'user_continue' });
  assert.equal(discussing.result.type === 'suspend' ? discussing.result.wait.kind : null, 'user_continue');
  assert.equal(discussing.to, 'closeGuide');

  const finished = await visit(graph, 'closeGuide', harness.ctx, discussing.state);
  assert.equal(finished.to, 'completed');
  assert.deepEqual(harness.closedPanes, [21]);
  assert.deepEqual(graph.outcomes.completed!.output(finished.state), {
    outcome: 'socratic-walkthrough-completed',
    curriculumPath: context().paths.curriculumPath,
  });
});

test('every node has one edge and every destination is declared', () => {
  assertDestinationsDeclared(graph);
});
