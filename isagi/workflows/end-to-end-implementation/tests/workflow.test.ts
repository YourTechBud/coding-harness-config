import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test, { type TestContext } from 'node:test';

import type { OperationContext, WorkflowConversationMessage } from '@yourtechbudstudio/isagi-workflow-sdk';
import type { AgentTurnParameters } from 'isagi-workflow-common-graphs';
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
import type { ImplementStoryParameters } from 'isagi-workflow-implement-story/graph';
import type { SolutionWalkthroughParameters } from 'isagi-workflow-solution-walkthrough-story/graph';

import { checkpointPrompt } from '../src/checkpoint.js';
import { commitAgent, documentationAgent, uiAgent, uiReadinessJudgment } from '../src/constants.js';
import { EndToEndImplementationGraph } from '../src/graph.js';
import { CheckpointGraph } from '../src/graphs/checkpoint-commit.js';
import {
  curriculumPath,
  deckPlanPath,
  decisionLogPath,
  designPaths,
  entryPlanPath,
  planDirectory,
  presentationPath,
  reviewDirectory,
  uiBriefPath,
  type DesignSummary,
  type ImplementationResult,
  type WalkthroughResult,
} from '../src/graphs/context.js';
import { DesignGraph } from '../src/graphs/design.js';
import { DocumentationGraph, PrepareImplementationGraph } from '../src/graphs/sessions.js';
import { PullRequestGraph } from '../src/graphs/submit-pull-request.js';
import { WalkthroughGraph } from '../src/graphs/walkthrough.js';
import workflow from '../src/index.js';
import { uiReadinessJudgmentPrompt } from '../src/judgments.js';
import { uiBriefPrompt, uiDesignAmendmentPrompt, uiReadinessPrompt } from '../src/prompts.js';

const story = 'https://github.com/owner/repository/issues/123';
const session = { agentSessionId: 21, paneId: 31 };
const origin = { worktreeId: 1, worktreePath: '/workspace', surfaceId: 7 };
const destination = (worktreePath = '/workspace') => ({ worktreeId: 1, worktreePath, surfaceId: 7 });
const root = EndToEndImplementationGraph;
const controls = { story, familiarity: 'familiar', technicalDepth: 'implementation', deliveryMechanism: 'presentation', submitPullRequest: 'yes' } as const;

test('command and parse capture the complete end-to-end controls', async () => {
  const manifest = await workflow.command(origin);
  assert.deepEqual(manifest.inputs?.map(({ key }) => key), ['story', 'familiarity', 'technicalDepth', 'deliveryMechanism', 'submitPullRequest']);
  assert.deepEqual(await workflow.parse(origin, { story: ` ${story} ` }), { story, familiarity: 'new', technicalDepth: 'system-design', deliveryMechanism: 'presentation', submitPullRequest: 'yes' });
  assert.throws(() => workflow.parse(origin, { story, submitPullRequest: 'maybe' }), /submitPullRequest must be one of yes, no/);
});

test('the business graph shows each delivery phase and every graph is well formed', () => {
  assert.deepEqual(Object.keys(root.nodes), ['design', 'walkthrough', 'approveSolution', 'stopSolution', 'prepareImplementation', 'implement', 'document', 'submitPullRequest', 'finish', 'reportFailure']);
  for (const graph of [root, DesignGraph, WalkthroughGraph, PrepareImplementationGraph, DocumentationGraph, CheckpointGraph, PullRequestGraph]) assertDestinationsDeclared(graph);
});

test('missing design artifacts run in order and preserve their reviewed results', async (t) => {
  const worktreePath = tempWorktree(t);
  const harness = workflowHarness(worktreePath);
  let step: { readonly to: string; readonly state: ReturnType<typeof DesignGraph.init> } = await visit(DesignGraph, 'checkArtifacts', harness.ctx, DesignGraph.init(destination(worktreePath), { story }));
  assert.equal(step.to, 'analyzeCurrentState');
  assert.deepEqual(subgraphParameters(DesignGraph, 'analyzeCurrentState', step.state), { story, artifactPath: designPaths.currentStatePath });
  step = visitSubgraph(DesignGraph, 'analyzeCurrentState', step.state, reviewed(designPaths.currentStatePath, 2));
  assert.equal(step.to, 'designArchitecture');
  assert.deepEqual(subgraphParameters(DesignGraph, 'designArchitecture', step.state), { story, currentStatePath: designPaths.currentStatePath, artifactPath: designPaths.architecturePath });
  step = visitSubgraph(DesignGraph, 'designArchitecture', step.state, reviewed(designPaths.architecturePath, 1));
  step = visitSubgraph(DesignGraph, 'designProgram', step.state, reviewed(designPaths.programDesignPath, 3));
  assert.equal(step.to, 'designed');
  assert.deepEqual(DesignGraph.outcomes.designed!.output(step.state), { outcome: 'designed', design: designResult() });
});

test('existing design artifacts are reused and only the missing ones run', async (t) => {
  const worktreePath = tempWorktree(t);
  writeArtifact(worktreePath, designPaths.currentStatePath, '# Current state');
  const harness = workflowHarness(worktreePath);
  const step = await visit(DesignGraph, 'checkArtifacts', harness.ctx, DesignGraph.init(destination(worktreePath), { story }));
  assert.equal(step.to, 'designArchitecture');
  assert.deepEqual(harness.feedback, [{ phase: 'Current-state analysis ready', message: `Reusing ${designPaths.currentStatePath}.` }]);
  assert.deepEqual(step.state.currentState, { outcome: 'reused' });
});

test('a failed or misplaced design artifact fails the design with its diagnostic', () => {
  const start = DesignGraph.init(destination(), { story });
  const failed = visitSubgraph(DesignGraph, 'analyzeCurrentState', start, { outcomeId: 'failed', outcomeKind: 'failure', output: { outcome: 'failed', reason: 'Writer session died' } });
  assert.deepEqual(DesignGraph.outcomes.failed!.output(failed.state), { outcome: 'failed', failure: { message: 'Current-state analysis failed', diagnostic: 'analyze-current-state failed: Writer session died' } });
  const misplaced = visitSubgraph(DesignGraph, 'analyzeCurrentState', start, reviewed('elsewhere.md', 1));
  assert.match(misplaced.state.failure?.diagnostic ?? '', /returned artifact path elsewhere\.md/);
});

test('an existing walkthrough HTML skips the presentation child and waits for approval', async (t) => {
  const worktreePath = tempWorktree(t);
  writeArtifact(worktreePath, presentationPath, '<main></main>');
  const harness = workflowHarness(worktreePath);
  const checked = await visit(WalkthroughGraph, 'checkPresentation', harness.ctx, WalkthroughGraph.init(destination(worktreePath), walkthroughControls('presentation')));
  assert.equal(checked.to, 'walkedThrough');
  const walkthrough = { outcome: 'presentation-reused', presentationPath } as const;
  assert.deepEqual(WalkthroughGraph.outcomes.walkedThrough!.output(checked.state), { outcome: 'walked-through', walkthrough });

  const approval = await visit(root, 'approveSolution', harness.ctx, { ...root.init(destination(), controls), design: designResult(), walkthrough }, { kind: 'user_input', answers: { implementationDecision: 'approve' } });
  assert.equal(approval.result.type === 'suspend' ? approval.result.wait.kind : null, 'user_input');
  assert.match(harness.feedback.at(-1)?.message ?? '', new RegExp(`Review the existing presentation at ${presentationPath}`));
  assert.equal(approval.to, 'prepareImplementation');
});

test('Socratic mode does not treat an existing HTML presentation as its walkthrough', async (t) => {
  const worktreePath = tempWorktree(t);
  writeArtifact(worktreePath, presentationPath, '<main></main>');
  const checked = await visit(WalkthroughGraph, 'checkPresentation', workflowHarness(worktreePath).ctx, WalkthroughGraph.init(destination(worktreePath), walkthroughControls('socratic-walkthrough')));
  assert.equal(checked.to, 'runWalkthrough');
  assert.deepEqual(subgraphParameters<SolutionWalkthroughParameters>(WalkthroughGraph, 'runWalkthrough', checked.state), {
    story,
    sources: designPaths,
    reviewDirectory,
    audienceProfile: { familiarity: 'familiar', technicalDepth: 'implementation' },
    deliveryMechanism: 'socratic-walkthrough',
  });
});

test('presentation and Socratic results are kept, and obsolete result shapes are rejected', () => {
  const presentation = WalkthroughGraph.init(destination(), walkthroughControls('presentation'));
  const created = visitSubgraph(WalkthroughGraph, 'runWalkthrough', presentation, walkthroughResult(presentationResult()));
  assert.deepEqual(created.state.walkthrough, presentationResult());
  const socratic = WalkthroughGraph.init(destination(), walkthroughControls('socratic-walkthrough'));
  const discussed = visitSubgraph(WalkthroughGraph, 'runWalkthrough', socratic, walkthroughResult({ outcome: 'socratic-walkthrough-completed', curriculumPath }));
  assert.deepEqual(discussed.state.walkthrough, { outcome: 'socratic-walkthrough-completed', curriculumPath });

  assert.match(visitSubgraph(WalkthroughGraph, 'runWalkthrough', socratic, walkthroughResult(presentationResult())).state.failure?.diagnostic ?? '', /does not match Socratic mode/);
  assert.match(visitSubgraph(WalkthroughGraph, 'runWalkthrough', presentation, walkthroughResult({ ...presentationResult(), deckPlanPath: 'old/deck.json' })).state.failure?.diagnostic ?? '', /unexpected presentation paths/);
  assert.match(visitSubgraph(WalkthroughGraph, 'runWalkthrough', presentation, walkthroughResult({ ...presentationResult(), curriculumPath: 'old/curriculum.json' })).state.failure?.diagnostic ?? '', /unexpected curriculum path/);
});

test('rejection stops cleanly before touching the implementation plan', async (t) => {
  const worktreePath = tempWorktree(t);
  writeArtifact(worktreePath, entryPlanPath, '# Existing plan');
  const harness = workflowHarness(worktreePath);
  const state = { ...root.init(destination(worktreePath), controls), design: designResult(), walkthrough: presentationResult() };
  const decided = await visit(root, 'approveSolution', harness.ctx, state, { kind: 'user_input', answers: { implementationDecision: 'reject' } });
  assert.equal(decided.to, 'stopSolution');
  const stopped = await visit(root, 'stopSolution', harness.ctx, decided.state);
  assert.equal(stopped.to, 'stopped');
  assert.equal(existsSync(join(worktreePath, entryPlanPath)), true);
  assert.deepEqual(root.outcomes.stopped!.output(stopped.state), {
    outcome: 'end-to-end-implementation-stopped',
    reason: 'solution-rejected',
    story,
    storyRoot: 'scratch/story',
    design: designResult(),
    walkthrough: presentationResult(),
  });
});

test('approval resets the implementation plan, then UI discovery brainstorms, settles open items, amends the design, and writes a brief in the same session', async (t) => {
  const worktreePath = tempWorktree(t);
  initGit(worktreePath);
  writeArtifact(worktreePath, entryPlanPath, '# Old plan');
  commitAll(worktreePath, 'initial');
  const harness = workflowHarness(worktreePath);
  const graph = PrepareImplementationGraph;
  const reset = await visit(graph, 'resetPlan', harness.ctx, graph.init(destination(worktreePath), { story }));
  assert.equal(existsSync(join(worktreePath, planDirectory)), false);
  assert.equal(reset.to, 'discoverUi');

  const discovery = subgraphParameters<AgentTurnParameters>(graph, 'discoverUi', reset.state);
  assert.deepEqual(discovery.session, { kind: 'spawn', ...uiAgent });
  assert.deepEqual(discovery.modifiers, [{ kind: 'skill', name: 'brainstorming' }]);
  const discovered = visitSubgraph(graph, 'discoverUi', reset.state, agentTurnEnded(session));
  assert.equal(discovered.to, 'steerUi');
  const steered = await visit(graph, 'steerUi', harness.ctx, discovered.state, { kind: 'user_continue' });
  assert.equal(steered.to, 'checkReadiness');

  // Open items go back to the user, and Continue asks the same session again.
  const readiness = subgraphParameters<AgentTurnParameters>(graph, 'checkReadiness', steered.state);
  assert.deepEqual(readiness.session, { kind: 'existing', ...session });
  assert.equal(readiness.prompt, uiReadinessPrompt());
  const checkedOnce = visitSubgraph(graph, 'checkReadiness', steered.state, agentTurnEnded(session));
  assert.equal(checkedOnce.to, 'readReadiness');
  harness.history.push(message('user', uiReadinessPrompt()), message('assistant', 'The empty-state layout is still undecided.'));
  const readOnce = await visit(graph, 'readReadiness', harness.ctx, checkedOnce.state);
  assert.equal(readOnce.to, 'judgeReadiness');
  assert.deepEqual(subgraphParameters(graph, 'judgeReadiness', readOnce.state), { label: 'UI readiness', profile: uiReadinessJudgment, prompt: uiReadinessJudgmentPrompt('The empty-state layout is still undecided.') });
  const pending = visitSubgraph(graph, 'judgeReadiness', readOnce.state, judged({ outcome: 'pending', reason: 'Choose the empty-state layout.' }));
  assert.equal(pending.to, 'resolveOpenItems');
  const resolved = await visit(graph, 'resolveOpenItems', harness.ctx, pending.state, { kind: 'user_continue' });
  assert.deepEqual(harness.feedback.at(-1), { kind: 'warning', phase: 'UI session has open items', message: 'Choose the empty-state layout. Resolve them in the UI session, then select Continue.' });
  assert.equal(resolved.to, 'checkReadiness');

  const checkedAgain = visitSubgraph(graph, 'checkReadiness', resolved.state, agentTurnEnded(session));
  harness.history.push(message('user', uiReadinessPrompt()), message('assistant', 'Nothing is open.'));
  const readAgain = await visit(graph, 'readReadiness', harness.ctx, checkedAgain.state);
  assert.equal(readAgain.state.readinessReply, 'Nothing is open.');
  const ready = visitSubgraph(graph, 'judgeReadiness', readAgain.state, judged({ outcome: 'ready', reason: 'Nothing is open.' }));
  assert.equal(ready.to, 'amendDesign');

  const amendment = subgraphParameters<AgentTurnParameters>(graph, 'amendDesign', ready.state);
  assert.deepEqual(amendment.session, { kind: 'existing', ...session });
  assert.equal(amendment.prompt, uiDesignAmendmentPrompt(designPaths));
  const amended = visitSubgraph(graph, 'amendDesign', ready.state, agentTurnEnded(session));
  assert.equal(amended.to, 'writeBrief');
  const brief = subgraphParameters<AgentTurnParameters>(graph, 'writeBrief', amended.state);
  assert.deepEqual(brief.session, { kind: 'existing', ...session });
  assert.equal(brief.prompt, uiBriefPrompt({ ...designPaths, uiBriefPath }));

  const written = visitSubgraph(graph, 'writeBrief', amended.state, agentTurnEnded(session));
  writeArtifact(worktreePath, uiBriefPath, '# UI brief');
  commitAll(worktreePath, 'draft: UI brief');
  const checked = await visit(graph, 'checkBrief', harness.ctx, written.state);
  assert.equal(checked.to, 'commit');
  assert.deepEqual(subgraphParameters(graph, 'commit', checked.state), { draft: true, phase: 'Committing UI session changes', failureMessage: 'UI commit checkpoint failed' });

  const clean = await visit(CheckpointGraph, 'commit', harness.ctx, CheckpointGraph.init(destination(worktreePath), { draft: true, phase: 'Committing UI session changes', failureMessage: 'UI commit checkpoint failed' }));
  assert.equal(clean.to, 'committed');
  assert.equal(harness.headless.length, 0);

  const closed = await visit(graph, 'closeUi', harness.ctx, visitSubgraph(graph, 'commit', checked.state, { outcomeId: 'committed', outcomeKind: 'success', output: { outcome: 'committed' } }).state);
  assert.deepEqual(harness.closed, [31]);
  assert.equal(closed.to, 'ready');
});

test('a missing UI brief pauses and a dead UI session fails, both without closing the pane', async (t) => {
  const worktreePath = tempWorktree(t);
  const harness = workflowHarness(worktreePath);
  const graph = PrepareImplementationGraph;
  const written = visitSubgraph(graph, 'writeBrief', { ...graph.init(destination(worktreePath), { story }), turn: { outcome: 'ended' as const, agent: session } }, agentTurnEnded(session));
  const missing = await visit(graph, 'checkBrief', harness.ctx, written.state);
  assert.equal(missing.to, 'askForBrief');
  const asked = await visit(graph, 'askForBrief', harness.ctx, missing.state, { kind: 'user_continue' });
  assert.equal(asked.to, 'checkBrief');
  writeArtifact(worktreePath, uiBriefPath, '# UI brief');
  assert.equal((await visit(graph, 'checkBrief', harness.ctx, asked.state)).to, 'commit');

  const died = visitSubgraph(graph, 'discoverUi', graph.init(destination(worktreePath), { story }), agentTurnInterrupted(session, 'UI discovery was interrupted in pane 31: session_died'));
  assert.deepEqual(graph.outcomes.failed!.output(died.state), { outcome: 'failed', failure: { message: 'UI discovery failed', diagnostic: 'UI discovery was interrupted in pane 31: session_died' } });
  assert.deepEqual(harness.closed, []);
});

test('a UI readiness reply that cannot be judged is read again, and a missing reply fails the step', async (t) => {
  const worktreePath = tempWorktree(t);
  const harness = workflowHarness(worktreePath);
  const graph = PrepareImplementationGraph;
  const checked = visitSubgraph(graph, 'checkReadiness', { ...graph.init(destination(worktreePath), { story }), turn: { outcome: 'ended' as const, agent: session } }, agentTurnEnded(session));
  await assert.rejects(visit(graph, 'readReadiness', harness.ctx, checked.state), /UI session 21 has no complete assistant turn/);

  harness.history.push(message('user', uiReadinessPrompt()), message('assistant', 'Nothing is open.'));
  const read = await visit(graph, 'readReadiness', harness.ctx, checked.state);
  const rejudge = visitSubgraph(graph, 'judgeReadiness', read.state, rejudged());
  assert.equal(rejudge.to, 'readReadiness');
  assert.equal(rejudge.state.readiness, null);

  const amendmentDied = visitSubgraph(graph, 'amendDesign', read.state, agentTurnInterrupted(session, 'Design amendment was interrupted in pane 31: session_died'));
  assert.deepEqual(graph.outcomes.failed!.output(amendmentDied.state), { outcome: 'failed', failure: { message: 'Design amendment failed', diagnostic: 'Design amendment was interrupted in pane 31: session_died' } });
});

for (const checkpoint of ['ui', 'documentation'] as const) {
  test(`${checkpoint} checkpoint commits outstanding changes and verifies the commit against Git`, async (t) => {
    const worktreePath = tempWorktree(t);
    initGit(worktreePath);
    writeArtifact(worktreePath, 'temporary-route.ts', 'export const mock = true;');
    const harness = workflowHarness(worktreePath);
    const draft = checkpoint === 'ui';
    const launched = await visit(CheckpointGraph, 'commit', harness.ctx, CheckpointGraph.init(destination(worktreePath), { draft, phase: 'Committing changes', failureMessage: 'Commit checkpoint failed' }), headlessFailed('op-1'));
    assert.deepEqual(harness.headless[0], { ...commitAgent, prompt: checkpointPrompt(worktreePath, draft) });
    if (draft) assert.match(harness.headless[0]?.prompt ?? '', /draft: /);

    // The commit agent commits; the workflow verifies its report against Git.
    const subject = draft ? 'draft: UI exploration' : 'docs: architecture overview';
    commitAll(worktreePath, subject);
    const commit = git(worktreePath, ['rev-parse', 'HEAD']).trim();
    const verified = await visit(CheckpointGraph, 'verify', harness.ctx, { ...launched.state, result: { operationId: 'op-1', status: 'completed', output: JSON.stringify({ outcome: 'commit-created', commit, subject }) } });
    assert.equal(verified.to, 'committed');
  });

  test(`${checkpoint} checkpoint rejects an unverified commit, and Retry verifies the same result once Git matches`, async (t) => {
    const worktreePath = tempWorktree(t);
    initGit(worktreePath);
    writeArtifact(worktreePath, 'temporary-route.ts', 'export const mock = true;');
    const harness = workflowHarness(worktreePath);
    const draft = checkpoint === 'ui';
    const launched = await visit(CheckpointGraph, 'commit', harness.ctx, CheckpointGraph.init(destination(worktreePath), { draft, phase: 'Committing changes', failureMessage: 'Commit checkpoint failed' }), headlessFailed('op-1'));

    // The agent commits but leaves a stray file behind: verification fails the step.
    const subject = draft ? 'draft: UI exploration' : 'docs: architecture overview';
    commitAll(worktreePath, subject);
    writeArtifact(worktreePath, 'stray.ts', 'export const stray = true;');
    const reported = { ...launched.state, result: { operationId: 'op-1', status: 'completed' as const, output: JSON.stringify({ outcome: 'commit-created', commit: git(worktreePath, ['rev-parse', 'HEAD']).trim(), subject }) } };
    await assert.rejects(visit(CheckpointGraph, 'verify', harness.ctx, reported), /left outstanding working-tree or index changes/);
    assert.deepEqual(harness.feedback.at(-1), { kind: 'error', phase: 'End-to-end implementation failed', message: 'Commit checkpoint failed' });
    assert.deepEqual(harness.closed, []);

    // The user removes the stray file; Retry verifies the same saved result against Git again.
    rmSync(join(worktreePath, 'stray.ts'));
    assert.equal((await visit(CheckpointGraph, 'verify', harness.ctx, reported)).to, 'committed');
    assert.equal(harness.headless.length, 1);
  });

}

test('implementation passes the canonical story pack and always enters documentation discovery', () => {
  const state = { ...root.init(destination(), controls), design: designResult(), walkthrough: presentationResult() };
  assert.deepEqual(subgraphParameters<ImplementStoryParameters>(root, 'implement', state), {
    story,
    artifacts: { ...designPaths, uiBriefPath },
    plan: { planDirectory, entryPlanPath },
    options: { humanInTheLoop: 'no', autoReview: 'yes', autoCommit: 'yes' },
  });
  const implemented = visitSubgraph(root, 'implement', state, { outcomeId: 'implemented', outcomeKind: 'success', output: implementStoryResult() });
  assert.equal(implemented.to, 'document');
  assert.deepEqual(implemented.state.implementation, implementationResult());
  assert.deepEqual(subgraphParameters(root, 'document', implemented.state), { story, decisionLogPath });

  const wrongStory = visitSubgraph(root, 'implement', state, { outcomeId: 'implemented', outcomeKind: 'success', output: { ...implementStoryResult(), story: 'other' } });
  assert.equal(wrongStory.to, 'reportFailure');
  assert.match(wrongStory.state.failure?.diagnostic ?? '', /different story/);
});

test('documentation brainstorms, waits for Continue, commits normally, and closes its pane', async () => {
  const harness = workflowHarness('/workspace');
  const graph = DocumentationGraph;
  const start = graph.init(destination(), { story, decisionLogPath });
  const discovery = subgraphParameters<AgentTurnParameters>(graph, 'discover', start);
  assert.deepEqual(discovery.session, { kind: 'spawn', ...documentationAgent });
  assert.match(discovery.prompt ?? '', new RegExp(decisionLogPath));
  const discovered = visitSubgraph(graph, 'discover', start, agentTurnEnded(session));
  const steered = await visit(graph, 'steer', harness.ctx, discovered.state, { kind: 'user_continue' });
  assert.equal(steered.to, 'commit');
  assert.deepEqual(subgraphParameters(graph, 'commit', steered.state), { draft: false, phase: 'Committing documentation session changes', failureMessage: 'Documentation commit checkpoint failed' });
  const closed = await visit(graph, 'closeDocs', harness.ctx, steered.state);
  assert.deepEqual(harness.closed, [31]);
  assert.equal(closed.to, 'ready');
});

test('delivery submits the pull request when asked, or finishes without one', async () => {
  const delivered = { ...root.init(destination(), controls), design: designResult(), walkthrough: presentationResult(), implementation: implementationResult() };
  assert.equal(visitSubgraph(root, 'document', delivered, { outcomeId: 'ready', outcomeKind: 'success', output: { outcome: 'ready' } }).to, 'submitPullRequest');
  const skipped = visitSubgraph(root, 'document', { ...delivered, submitPullRequest: 'no' as const }, { outcomeId: 'ready', outcomeKind: 'success', output: { outcome: 'ready' } });
  assert.equal(skipped.to, 'finish');
  const harness = workflowHarness('/workspace');
  const finished = await visit(root, 'finish', harness.ctx, skipped.state);
  assert.deepEqual(harness.feedback, [{ phase: 'End-to-end implementation complete', message: 'Implementation is complete; pull-request submission was skipped.' }]);
  assert.deepEqual(root.outcomes.completed!.output(finished.state), {
    outcome: 'end-to-end-implementation-completed',
    story,
    storyRoot: 'scratch/story',
    design: designResult(),
    walkthrough: presentationResult(),
    implementation: implementationResult(),
    pullRequest: null,
  });
});

test('a verified pull request is recorded; an unverifiable submission fails', async () => {
  const harness = workflowHarness('/workspace');
  const graph = PullRequestGraph;
  const pullRequest = {
    outcome: 'pull-request-submitted',
    number: 7,
    url: 'https://github.com/owner/repository/pull/7',
    title: 'Deliver story',
    body: 'Closes owner/repository#123',
    baseBranch: 'main',
    headBranch: 'story-123',
    state: 'OPEN',
  } as const;
  const submitted = await visit(graph, 'submit', harness.ctx, graph.init(destination(), { story }), headlessCompleted('op-1', JSON.stringify(pullRequest)));
  assert.equal(submitted.to, 'record');
  assert.deepEqual(graph.outcomes.submitted!.output(submitted.state), { outcome: 'submitted', pullRequest });
  const rejected = await visit(graph, 'submit', harness.ctx, graph.init(destination(), { story }), headlessCompleted('op-2', JSON.stringify({ ...pullRequest, state: 'CLOSED' })));
  assert.equal(rejected.to, 'failed');
  assert.deepEqual(graph.outcomes.failed!.output(rejected.state), { outcome: 'failed', failure: { message: 'Pull-request submission failed', diagnostic: 'Pull request must be open.' } });
});

test('a failed phase stops the wrapper with its diagnostic', async () => {
  const harness = workflowHarness('/workspace');
  const failed = visitSubgraph(root, 'design', root.init(destination(), controls), { outcomeId: 'failed', outcomeKind: 'failure', output: { outcome: 'failed', failure: { message: 'Architecture design failed', diagnostic: 'design-architecture failed: reviewer died' } } });
  assert.equal(failed.to, 'reportFailure');
  const reported = await visit(root, 'reportFailure', harness.ctx, failed.state);
  assert.deepEqual(harness.feedback, [{ kind: 'error', phase: 'End-to-end implementation failed', message: 'Architecture design failed' }]);
  assert.deepEqual(root.outcomes.failed!.output(reported.state), { outcome: 'failed', reason: 'design-architecture failed: reviewer died' });
});

function walkthroughControls(deliveryMechanism: 'presentation' | 'socratic-walkthrough') {
  return { story, familiarity: 'familiar', technicalDepth: 'implementation', deliveryMechanism } as const;
}

function reviewed(artifactPath: string, reviewCount: number) {
  return { outcomeId: 'reviewed', outcomeKind: 'success' as const, output: { outcome: 'artifact-reviewed' as const, artifactPath, reviewCount } };
}

function walkthroughResult(output: object) {
  return { outcomeId: 'done', outcomeKind: 'success' as const, output };
}

function designResult(): DesignSummary {
  return {
    artifacts: designPaths,
    steps: {
      currentState: { outcome: 'created', reviewCount: 2 },
      architecture: { outcome: 'created', reviewCount: 1 },
      programDesign: { outcome: 'created', reviewCount: 3 },
    },
  };
}

function presentationResult(): Extract<WalkthroughResult, { outcome: 'presentation-created' }> {
  return {
    outcome: 'presentation-created',
    curriculumPath,
    deckPlanPath,
    presentationPath,
    neighborhoodCount: 2,
    contentMomentCount: 4,
    substantiveSlideCount: 5,
    totalSlideCount: 7,
    coverageItemCount: 9,
  };
}

function implementStoryResult() {
  return {
    outcome: 'story-implemented' as const,
    story,
    artifacts: { ...designPaths, uiBriefPath },
    plan: { planDirectory, entryPlanPath },
    plannerAgentSessionId: 41,
    plannerPaneId: 51,
    implementation: { entryPlanPath, decisionLogPath, phaseCount: 3, completedPhaseCount: 3 },
  };
}

function implementationResult(): ImplementationResult {
  return {
    outcome: 'story-implemented',
    story,
    artifacts: designPaths,
    plan: { planDirectory, entryPlanPath },
    plannerAgentSessionId: 41,
    plannerPaneId: 51,
    implementation: { entryPlanPath, decisionLogPath, phaseCount: 3, completedPhaseCount: 3 },
  };
}

function workflowHarness(worktreePath: string) {
  const feedback: Array<Parameters<OperationContext['setUiFeedback']>[0]> = [];
  const headless: Array<Parameters<OperationContext['runHeadlessAgent']>[0]> = [];
  const closed: number[] = [];
  const history: WorkflowConversationMessage[] = [];
  const ctx: OperationContext = {
    destination: destination(worktreePath),
    execution: { runId: 1, graphInvocationId: 1, executionId: 1, attempt: 'initial' },
    spawnAgentSession: async () => { throw new Error('Agent turns run in the AgentTurn graph.'); },
    sendAgentPrompt: async () => { throw new Error('Agent turns run in the AgentTurn graph.'); },
    closePane: async (paneId) => { closed.push(paneId); },
    getConversationHistory: async () => history,
    runHeadlessAgent: async (request) => {
      headless.push(request);
      return { operationId: `op-${headless.length}` };
    },
    log: async () => {},
    setUiFeedback: async (value) => { feedback.push(value); },
  };
  return { ctx, feedback, headless, closed, history };
}

function message(role: WorkflowConversationMessage['role'], text: string): WorkflowConversationMessage {
  return { role, parts: [{ type: 'text', text, state: 'done' }] };
}

function tempWorktree(t: TestContext): string {
  const path = mkdtempSync(join(tmpdir(), 'end-to-end-'));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}

function writeArtifact(worktreePath: string, relativePath: string, text: string): void {
  const path = join(worktreePath, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function git(worktreePath: string, args: string[]): string {
  return execFileSync('git', args, { cwd: worktreePath, encoding: 'utf8' });
}

function initGit(worktreePath: string): void {
  git(worktreePath, ['init', '-q']);
  git(worktreePath, ['config', 'user.name', 'Workflow Test']);
  git(worktreePath, ['config', 'user.email', 'test@example.invalid']);
  git(worktreePath, ['config', 'commit.gpgsign', 'false']);
  git(worktreePath, ['config', 'core.hooksPath', '/dev/null']);
}

function commitAll(worktreePath: string, subject: string): void {
  git(worktreePath, ['add', '-A']);
  git(worktreePath, ['commit', '-q', '--allow-empty', '-m', subject]);
}
