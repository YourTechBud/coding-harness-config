import assert from 'node:assert/strict';
import test from 'node:test';

import type { EngineeringGuidanceReviewParameters } from 'isagi-workflow-engineering-guidance-review-loop/graph';
import { assertDestinationsDeclared, subgraphParameters, visit, visitSubgraph } from 'isagi-workflow-common-graphs/testing';

import { implementerGeneric, implementerUiHeavy } from '../src/constants.js';
import { renderWorkflowStatus } from '../src/feedback.js';
import type { ImplementerOutcome } from '../src/judgments.js';
import type { ImplementerExchangeParameters, PlannerExchangeParameters } from '../src/graphs/exchanges.js';
import { PhaseGraph } from '../src/graphs/phase.js';
import type { PlannerExchanged } from '../src/graphs/context.js';
import { assertAlignmentBullets, destination, implementer, phaseParameters, workflowHarness } from './fixtures.js';

const graph = PhaseGraph;
const status = (kind: 'implementer-aligning' | 'implementing' | 'planner-reviewing' | 'human-verification' | 'phase-review') => renderWorkflowStatus({ kind, phase: 2, phaseCount: 4 });
type State = ReturnType<typeof graph.init>;
type Step = { readonly to: string; readonly state: State };

function start(input?: Parameters<typeof phaseParameters>[0]): State {
  return { ...graph.init(destination(), phaseParameters(input)), profile: implementerGeneric, implementer };
}

function implementerTurn(state: State, result: ImplementerOutcome, text = 'Implementer turn.', request = state.request): Step {
  return visitSubgraph(graph, 'exchangeWithImplementer', { ...state, request }, {
    outcomeId: 'exchanged',
    outcomeKind: 'success',
    output: { outcome: 'exchanged', implementer, implementerTurn: text, result },
  });
}

function plannerTurn(state: State, result: PlannerExchanged['result'], text = 'Planner turn.'): Step {
  return visitSubgraph(graph, 'exchangeWithPlanner', state, { outcomeId: 'exchanged', outcomeKind: 'success', output: { outcome: 'exchanged', plannerTurn: text, result } });
}

function nextImplementerRequest(step: Step): ImplementerExchangeParameters {
  assert.equal(step.to, 'exchangeWithImplementer');
  return subgraphParameters<ImplementerExchangeParameters>(graph, 'exchangeWithImplementer', step.state);
}

test('a non-mock phase starts a fresh implementer with the default alignment prompt and no modifiers', () => {
  const chosen = visitSubgraph(graph, 'chooseImplementer', graph.init(destination(), phaseParameters()), { outcomeId: 'chosen', outcomeKind: 'success', output: { outcome: 'chosen', profile: implementerGeneric } });
  const request = nextImplementerRequest(chosen);
  assert.deepEqual(request.session, { kind: 'spawn', harness: implementerGeneric.harness, model: implementerGeneric.model, effort: implementerGeneric.effort });
  assert.equal(request.modifiers, undefined);
  assert.equal(request.turnPurpose, 'alignment');
  assert.match(request.prompt, /^You are the implementer for phase 2 in docs\/plan\.md/);
  assertAlignmentBullets(request.prompt);
  assert.deepEqual(request.feedback, status('implementer-aligning'));
});

test('a mock-UI phase hands the UI-heavy implementer to the human, then checks completeness', async () => {
  const harness = workflowHarness();
  const state = { ...graph.init(destination(), phaseParameters({ phaseType: 'mock-ui' })), profile: implementerUiHeavy };
  assert.equal(visitSubgraph(graph, 'chooseImplementer', graph.init(destination(), phaseParameters({ phaseType: 'mock-ui' })), { outcomeId: 'chosen', outcomeKind: 'success', output: { outcome: 'chosen', profile: implementerUiHeavy } }).to, 'startMockUp');
  const handedOver = await visit(graph, 'startMockUp', harness.ctx, state, { kind: 'user_continue' });
  assert.deepEqual(harness.spawned[0]?.modifiers, [{ kind: 'skill', name: 'designing-ui' }]);
  assert.match(harness.spawned[0]?.prompt ?? '', /human-led mock-UI work for phase 2/);
  assert.deepEqual(harness.feedback[0], renderWorkflowStatus({ kind: 'mock-human-completion', phase: 2, phaseCount: 4, phaseSlug: 'phase-02-production-wiring', autoReview: false, autoCommit: true }));
  assert.equal(handedOver.result.type === 'suspend' ? handedOver.result.wait.kind : null, 'user_continue');
  const request = nextImplementerRequest(handedOver);
  assert.equal(request.turnPurpose, 'before-review');
  assert.deepEqual(request.session, { kind: 'existing', ...implementer });
});

test('every non-complete implementer turn returns to the planner, including after approval', () => {
  const routed = implementerTurn(start(), 'planner-response-needed', 'Implementation started, but I found another architectural question.', { kind: 'approval', plannerTurn: 'Go.' });
  assert.equal(routed.to, 'exchangeWithPlanner');
  const request = subgraphParameters<PlannerExchangeParameters>(graph, 'exchangeWithPlanner', routed.state);
  assert.equal(request.plannerSessionId, 11);
  const prompt = request.prompt;
  assert.match(prompt, /^You are the planner for phase 2, working unattended/);
  assert.match(prompt, /<implementer_response>\nImplementation started/);
  assert.match(prompt, /any question.*withhold both implementation and completion approval/);
  assert.match(prompt, /Approval becomes eligible only after a subsequent question-free implementer response/);
  assert.equal(prompt.split('\n').filter((line) => line.startsWith('- ')).length, 8);
  assert.deepEqual(request.feedback, status('planner-reviewing'));
});

test('planner feedback is attributed and preserves the alignment bullets', () => {
  const request = nextImplementerRequest(plannerTurn(start(), 'feedback', 'The boundary belongs in the runtime. Please revise your approach.'));
  assert.deepEqual(request.session, { kind: 'existing', ...implementer });
  assert.match(request.prompt, /<planner_response>\nThe boundary belongs in the runtime\. Please revise your approach\.\n<\/planner_response>/);
  assert.doesNotMatch(request.prompt, /Implement the agreed phase/);
  assertAlignmentBullets(request.prompt);
  assert.equal(request.turnPurpose, 'alignment');
});

test('planner approval is attributed without the alignment footer and reopens review', () => {
  const plannerResponse = '## Human Escalation\nNo escalation.\n\nI approve implementation.';
  const approved = plannerTurn({ ...start(), reviewComplete: true }, 'approved', plannerResponse);
  const request = nextImplementerRequest(approved);
  assert.match(request.prompt, /^The planner has approved implementation of phase 2/);
  assert.ok(request.prompt.includes(`<planner_response>\n${plannerResponse}\n</planner_response>`));
  assert.doesNotMatch(request.prompt, /Begin implementation only when/);
  assert.equal(request.turnPurpose, 'implementation');
  assert.deepEqual(request.feedback, status('implementing'));
  assert.equal(approved.state.reviewComplete, false);
});

for (const result of ['approved', 'completion-approved', 'feedback'] as const) {
  test(`planner ${result} requires confirmation while the question gate is closed`, () => {
    const request = nextImplementerRequest(plannerTurn({ ...start(), approvalBlocked: true }, result, 'Yes, omit the barrier. I approve implementation and phase completion.'));
    assert.equal(request.turnPurpose, 'confirmation');
    assert.match(request.prompt, /Approval is withheld.*regardless of approval wording/);
    assert.match(request.prompt, /Yes, omit the barrier/);
  });
}

for (const checkpoint of ['alignment', 'before-review', 'after-review'] as const) {
  test(`${checkpoint} questions block approval until a question-free confirmation is reviewed`, () => {
    const report = 'Phase complete. One non-blocking question: may I drop the barrier?';
    const first = checkpoint === 'alignment'
      ? { kind: 'start' as const }
      : { kind: 'completion-report' as const, checkpoint, plannerTurn: null };
    const state = { ...start({ autoReview: true }), reviewComplete: checkpoint === 'after-review' };
    const pending = implementerTurn(state, 'planner-questions', report, first);
    assert.equal(pending.to, 'exchangeWithPlanner');
    assert.equal(pending.state.approvalBlocked, true);

    const confirming = plannerTurn(pending.state, 'approved', 'Yes. I approve.');
    assert.equal(nextImplementerRequest(confirming).turnPurpose, 'confirmation');

    // Another question keeps the gate closed; even a completion claim must return to the planner.
    const moreQuestions = implementerTurn(confirming.state, 'planner-questions');
    assert.equal(moreQuestions.to, 'exchangeWithPlanner');
    assert.equal(moreQuestions.state.approvalBlocked, true);
    const questionFree = implementerTurn(confirming.state, 'phase-complete');
    assert.equal(questionFree.to, 'exchangeWithPlanner');
    assert.equal(questionFree.state.approvalBlocked, false);

    const accepted = nextImplementerRequest(plannerTurn(questionFree.state, 'completion-approved', 'Completion accepted.'));
    assert.equal(accepted.turnPurpose, checkpoint === 'after-review' ? 'after-review' : 'before-review');
    assert.match(accepted.prompt, /^The planner accepted phase completion\./);
  });
}

for (const approvalBlocked of [false, true]) {
  test(`human escalation continuation preserves question gate ${String(approvalBlocked)}`, () => {
    const severe = '## Human Escalation\n\nEscalation required: this changes the persistence boundary; the human must approve that change.';
    const resumed = plannerTurn({ ...start(), approvalBlocked, reviewComplete: true }, 'severe-flag-resolved', severe);
    const request = nextImplementerRequest(resumed);
    assert.match(request.prompt, /^The human has continued the workflow/);
    assert.ok(request.prompt.includes(`<planner_response>\n${severe}\n</planner_response>`));
    assert.match(request.prompt, /working unattended again/);
    assert.equal(request.turnPurpose, approvalBlocked ? 'confirmation' : 'implementation');
    if (approvalBlocked) assert.match(request.prompt, /approval remain withheld pending a question-free confirmation/);
    assert.equal(resumed.state.reviewComplete, approvalBlocked);
  });
}

test('completion approval before the first review still requires review', () => {
  const report = plannerTurn(start({ autoReview: true }), 'completion-approved', 'Accepted.');
  assert.equal(nextImplementerRequest(report).turnPurpose, 'before-review');
  assert.equal(implementerTurn(report.state, 'phase-complete').to, 'review');
});

test('review runs in the implementer session and completion is reported again afterwards', () => {
  const state = { ...start({ autoReview: true }), request: { kind: 'completion-report' as const, checkpoint: 'before-review' as const, plannerTurn: null } };
  const review = subgraphParameters<EngineeringGuidanceReviewParameters>(graph, 'review', state);
  assert.deepEqual(review, { context: 'The workflow is implementing phase 2 of the plan in docs/plan.md. Review all the changes since HEAD.', fixerSessionId: 22 });
  const reviewed = visitSubgraph(graph, 'review', state, { outcomeId: 'succeeded', outcomeKind: 'success', output: { outcome: 'workflow-executed-successfully', reviewCount: 2 } });
  assert.equal(reviewed.state.reviewComplete, true);
  const request = nextImplementerRequest(reviewed);
  assert.equal(request.turnPurpose, 'after-review');
  assert.match(request.prompt, /Automatic review has completed/);
});

test('a failed review fails the phase', () => {
  const failed = visitSubgraph(graph, 'review', start({ autoReview: true }), { outcomeId: 'failed', outcomeKind: 'failure', output: { outcome: 'failed', reason: 'Reviewer turn failed' } });
  assert.equal(failed.to, 'failed');
  assert.deepEqual(graph.outcomes.failed!.output(failed.state), { outcome: 'failed', failure: { message: 'Automatic review failed for phase 2', diagnostic: 'Automatic review failed for phase 2: Reviewer turn failed' } });
});

test('clarification feedback and an alignment completion claim retain the review checkpoint', () => {
  const clarified = plannerTurn({ ...start({ autoReview: true }), reviewComplete: true }, 'feedback');
  assert.equal(clarified.state.reviewComplete, true);
  assert.equal(nextImplementerRequest(implementerTurn(clarified.state, 'phase-complete')).turnPurpose, 'after-review');
});

test('remaining work after review goes through planner, implementation, completeness, and review again', () => {
  const afterReview = { ...start({ autoReview: true }), reviewComplete: false };
  const remaining = implementerTurn(afterReview, 'planner-response-needed', 'One test is missing.', { kind: 'completion-report', checkpoint: 'after-review', plannerTurn: null });
  assert.equal(remaining.to, 'exchangeWithPlanner');
  assert.equal(remaining.state.reviewComplete, true);
  const approved = plannerTurn(remaining.state, 'approved');
  assert.equal(approved.state.reviewComplete, false);
  const implemented = implementerTurn(approved.state, 'phase-complete');
  assert.equal(nextImplementerRequest(implemented).turnPurpose, 'before-review');
  assert.equal(implementerTurn(implemented.state, 'phase-complete').to, 'review');
});

test('a final report waits for the human when required, then commits or skips the commit', async () => {
  const report = { kind: 'completion-report' as const, checkpoint: 'after-review' as const, plannerTurn: null };
  assert.equal(implementerTurn(start(), 'phase-complete', 'Done.', report).to, 'commit');
  assert.equal(implementerTurn(start({ autoCommit: false }), 'phase-complete', 'Done.', report).to, 'closeImplementer');

  const verification = implementerTurn(start(), 'phase-complete-awaiting-human-verification', 'Verify the UI.', report);
  assert.equal(verification.to, 'awaitHumanApproval');
  const harness = workflowHarness();
  const approved = await visit(graph, 'awaitHumanApproval', harness.ctx, verification.state, { kind: 'user_continue' });
  assert.deepEqual(harness.feedback[0], status('human-verification'));
  assert.equal(approved.to, 'commit');

  const reviewed = implementerTurn(start({ humanInTheLoop: true, autoCommit: false }), 'phase-complete', 'Done.', report);
  assert.equal((await visit(graph, 'awaitHumanApproval', harness.ctx, reviewed.state, { kind: 'user_continue' })).to, 'closeImplementer');
  assert.deepEqual(harness.feedback[1], status('phase-review'));
});

test('the phase closes its implementer while preserving the planner session', async () => {
  const harness = workflowHarness();
  const closed = await visit(graph, 'closeImplementer', harness.ctx, start());
  assert.deepEqual(harness.closedPanes, [32]);
  assert.equal(closed.to, 'implemented');
});

test('every node has one edge and every destination is declared', () => {
  assertDestinationsDeclared(graph);
});
