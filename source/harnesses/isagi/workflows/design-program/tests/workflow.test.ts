import assert from 'node:assert/strict';
import test from 'node:test';

import type { WorkflowOrigin } from '@yourtechbudstudio/isagi-workflow-sdk';
import type { AgentTurnParameters, JudgmentParameters } from 'isagi-workflow-common-graphs';
import { assertDestinationsDeclared, destination, subgraphOf, subgraphParameters } from 'isagi-workflow-common-graphs/testing';

import { reviewer, reviewerJudgment, writer, writerJudgment } from '../src/constants.js';
import { DesignProgramGraph, type DesignProgramParameters } from '../src/graph.js';
import workflow from '../src/index.js';
import { reviewerRoutingPrompt, writerRoutingPrompt } from '../src/judgments.js';
import { continueWriterPrompt, initialReviewerPrompt, initialWriterPrompt, PROMPT_FOOTER, retryWriterPrompt } from '../src/prompts.js';

// The writer/reviewer loop itself is tested in isagi-workflow-common-graphs. These tests prove this
// workflow hands the loop its own launch form, profiles, skill, prompts, judgments, and wording.

const origin: WorkflowOrigin = { worktreeId: 1, worktreePath: '/workspace', surfaceId: 7 };
const parameters: DesignProgramParameters = {
  story: 'https://github.com/owner/repo/issues/2',
  currentStatePath: 'scratch/current-state/issue-2.md',
  architecturePath: 'scratch/architecture/issue-2.md',
  artifactPath: 'scratch/program-design/issue-2.md',
};
const input = { ...parameters, repositoryPath: destination.worktreePath };
const graph = DesignProgramGraph;
const writerGraph = subgraphOf(graph, 'write');
const reviewGraph = subgraphOf(graph, 'review');

test('command captures the story, predecessor paths, and program-design path', async () => {
  const manifest = await workflow.command(origin);
  assert.deepEqual((manifest.inputs ?? []).map((field) => field.key), ['story', 'currentStatePath', 'architecturePath', 'artifactPath']);
  assert.deepEqual(await workflow.parse(origin, parameters), parameters);
  assert.throws(() => workflow.parse(origin, { ...parameters, story: '   ' }), /story must be non-empty text/);
});

test('spawns the configured writer with the skill and required footer', () => {
  const turn = subgraphParameters<AgentTurnParameters>(writerGraph, 'prompt', writerGraph.init(destination, { context: parameters, writer: null, review: null }));
  assert.deepEqual(turn, {
    label: 'Program-design writer',
    session: { kind: 'spawn', ...writer },
    modifiers: [{ kind: 'skill', name: 'design-program' }],
    prompt: initialWriterPrompt(input),
    feedback: { phase: 'Designing program' },
    resubmitOnHarnessError: 1,
  });
  assert.equal(turn.prompt?.endsWith(PROMPT_FOOTER), true);
});

test('a ready writer starts the independently configured reviewer with the same skill', () => {
  const turn = subgraphParameters<AgentTurnParameters>(reviewGraph, 'prompt', reviewGraph.init(destination, { context: parameters, reviewer: null, writerResponse: null, round: 1 }));
  assert.deepEqual(turn, {
    label: 'Program-design reviewer',
    session: { kind: 'spawn', ...reviewer },
    modifiers: [{ kind: 'skill', name: 'design-program' }],
    prompt: initialReviewerPrompt(input),
    feedback: { phase: 'Reviewing program design' },
    resubmitOnHarnessError: 1,
  });
});

test('writer and reviewer replies are judged with their configured profiles and routing prompts', () => {
  const writerState = { ...writerGraph.init(destination, { context: parameters, writer: null, review: null }), response: 'Done.', artifactExists: true };
  assert.deepEqual(subgraphParameters<JudgmentParameters>(writerGraph, 'judge', writerState), {
    label: 'writer',
    profile: writerJudgment,
    prompt: writerRoutingPrompt({ writerResponse: 'Done.', artifactPath: parameters.artifactPath, artifactExists: true }),
    feedback: { phase: 'Checking program-design writer progress' },
  });
  const reviewState = { ...reviewGraph.init(destination, { context: parameters, reviewer: null, writerResponse: null, round: 1 }), review: 'No re-review needed.' };
  assert.deepEqual(subgraphParameters<JudgmentParameters>(reviewGraph, 'judge', reviewState), {
    label: 'reviewer',
    profile: reviewerJudgment,
    prompt: reviewerRoutingPrompt({ review: 'No re-review needed.' }),
    feedback: { phase: 'Routing program-design review' },
  });
});

test('recovering the writer sends the retry prompt to the same session', () => {
  const writerPane = { agentSessionId: 11, paneId: 21 };
  const turn = subgraphParameters<AgentTurnParameters>(writerGraph, 'nudge', writerGraph.init(destination, { context: parameters, writer: writerPane, review: 'Review' }));
  assert.deepEqual(turn.session, { kind: 'existing', ...writerPane });
  assert.equal(turn.prompt, retryWriterPrompt());
  assert.equal(turn.feedback?.phase, 'Recovering program-design writer');
});

test('the loop is keyed for this workflow and returns the reviewed artifact', () => {
  assert.deepEqual([graph.key, writerGraph.key, reviewGraph.key], ['DesignProgram', 'DesignProgramWriter', 'DesignProgramReview']);
  for (const each of [graph, writerGraph, reviewGraph]) assertDestinationsDeclared(each);
  const finished = { ...graph.init(destination, parameters), reviewRound: 2 };
  assert.deepEqual(graph.outcomes.reviewed!.output(finished), { outcome: 'artifact-reviewed', artifactPath: parameters.artifactPath, reviewCount: 2 });
});

test('Continue uses the shared decision-incorporation prompt with this workflow footer', () => {
  const pane = { agentSessionId: 11, paneId: 21 };
  const state = writerGraph.init(destination, { context: parameters, writer: pane, review: 'Choose U1.' });
  const turn = subgraphParameters<AgentTurnParameters>(writerGraph, 'replay', state);
  assert.deepEqual(turn.session, { kind: 'existing', ...pane });
  assert.equal(turn.prompt, continueWriterPrompt('Choose U1.'));
  assert.match(turn.prompt ?? '', /fresh response for the reviewer/);
  assert.match(turn.prompt ?? '', /Choose U1/);
  assert.equal(turn.prompt?.endsWith(PROMPT_FOOTER), true);
});
