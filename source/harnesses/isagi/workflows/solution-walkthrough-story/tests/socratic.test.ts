import assert from 'node:assert/strict';
import test from 'node:test';

import type { AgentTurnParameters } from 'isagi-workflow-common-graphs';
import { agentTurnEnded, agentTurnInterrupted, assertDestinationsDeclared, subgraphParameters, visit, visitSubgraph } from 'isagi-workflow-common-graphs/testing';

import { guide, lessonPlanner } from '../src/constants.js';
import { WalkthroughSocraticGraph } from '../src/graphs/socratic.js';
import { context, destination, withRepository, workflowHarness, writeLessonPlan } from './fixtures.js';

const graph = WalkthroughSocraticGraph;
const { paths } = context();

test('Socratic mode plans the lesson, starts a Show Me guide, waits for Continue, and returns its canonical outcome', async () => {
  await withRepository(async (repositoryPath) => {
    const harness = workflowHarness(repositoryPath);
    const start = graph.init(destination(repositoryPath), context());

    const inspected = await visit(graph, 'inspectLessonPlan', harness.ctx, start);
    assert.equal(inspected.to, 'planLesson');

    const planner = subgraphParameters<AgentTurnParameters>(graph, 'planLesson', inspected.state);
    assert.deepEqual(planner.session, { kind: 'spawn', ...lessonPlanner });
    assert.match(planner.prompt ?? '', new RegExp(`Output: ${paths.lessonPlanPath}`));
    const planned = visitSubgraph(graph, 'planLesson', inspected.state, agentTurnEnded({ agentSessionId: 10, paneId: 20 }));
    assert.equal(planned.to, 'readLessonPlan');

    writeLessonPlan(repositoryPath);
    const read = await visit(graph, 'readLessonPlan', harness.ctx, planned.state);
    assert.equal(read.to, 'startGuide');

    const turn = subgraphParameters<AgentTurnParameters>(graph, 'startGuide', read.state);
    assert.deepEqual(turn.session, { kind: 'spawn', ...guide });
    assert.deepEqual(turn.modifiers, [{ kind: 'skill', name: 'show-me' }]);
    assert.match(turn.prompt ?? '', new RegExp(`Lesson plan: ${paths.lessonPlanPath}`));
    const started = visitSubgraph(graph, 'startGuide', read.state, agentTurnEnded({ agentSessionId: 11, paneId: 21 }));
    assert.equal(started.to, 'awaitDiscussion');

    const discussing = await visit(graph, 'awaitDiscussion', harness.ctx, started.state, { kind: 'user_continue' });
    assert.equal(discussing.result.type === 'suspend' ? discussing.result.wait.kind : null, 'user_continue');
    assert.equal(discussing.to, 'closeGuide');

    const finished = await visit(graph, 'closeGuide', harness.ctx, discussing.state);
    assert.equal(finished.to, 'completed');
    assert.deepEqual(harness.closedPanes, [20, 21]);
    assert.deepEqual(graph.outcomes.completed!.output(finished.state), {
      outcome: 'socratic-walkthrough-completed',
      curriculumPath: paths.curriculumPath,
    });
  });
});

test('an existing lesson plan is reused without planning again', async () => {
  await withRepository(async (repositoryPath) => {
    writeLessonPlan(repositoryPath);
    const inspected = await visit(graph, 'inspectLessonPlan', workflowHarness(repositoryPath).ctx, graph.init(destination(repositoryPath), context()));
    assert.equal(inspected.to, 'startGuide');
  });
});

test('a planner that writes no lesson plan fails the step with its pane left open', async () => {
  await withRepository(async (repositoryPath) => {
    const harness = workflowHarness(repositoryPath);
    const planned = visitSubgraph(graph, 'planLesson', graph.init(destination(repositoryPath), context()), agentTurnEnded({ agentSessionId: 10, paneId: 20 }));
    await assert.rejects(visit(graph, 'readLessonPlan', harness.ctx, planned.state), /lesson plan/);
    assert.deepEqual(harness.closedPanes, []);
  });
});

test('an interrupted planner fails the walkthrough', () => {
  const interrupted = visitSubgraph(graph, 'planLesson', graph.init(destination('/workspace'), context()), agentTurnInterrupted({ agentSessionId: 10, paneId: 20 }));
  assert.equal(interrupted.to, 'failed');
  assert.match(interrupted.state.failure?.message ?? '', /Lesson planning failed/);
});

test('every node has one edge and every destination is declared', () => {
  assertDestinationsDeclared(graph);
});
