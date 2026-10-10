import { existsSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  complete,
  createGraph,
  edge,
  operation,
  outcome,
  reduce,
  subgraph,
  suspend,
  wait,
  type EdgeDecision,
  type GraphUpdate,
} from '@yourtechbudstudio/isagi-workflow-sdk';
import { agentTurn, createJudgmentGraph, failStep, ownedPane, type AgentTurnOutput, type JudgmentOutput, type JudgmentParameters } from 'isagi-workflow-common-graphs';

import { documentationAgent, uiAgent, uiReadinessJudgment } from '../constants.js';
import { latestAssistantTurnText, parseUiReadiness, uiReadinessJudgmentPrompt, type UiReadiness } from '../judgments.js';
import { documentationDiscoveryPrompt, uiBriefPrompt, uiDesignAmendmentPrompt, uiDiscoveryPrompt, uiReadinessPrompt } from '../prompts.js';
import { CheckpointGraph, type CheckpointOutput, type CheckpointParameters } from './checkpoint-commit.js';
import { designPaths, entryPlanPath, errorText, must, planDirectory, uiBriefPath, type Failed, type Failure } from './context.js';

const BRAINSTORMING = [{ kind: 'skill', name: 'brainstorming' }] as const;

export type SessionOutput = { readonly outcome: 'ready' } | Failed;

// Prepare implementation: the old plan is removed so the planner recreates it, then a UI agent
// brainstorms mocks with the user. On Continue the same session is asked what is still open; open
// items go back to the user until nothing is, then the agent amends the design documents, writes the
// UI brief, and its changes are committed as a draft.

const UiReadinessJudgment = createJudgmentGraph({ key: 'EndToEndImplementationUiReadiness', title: 'Judge UI readiness', parse: parseUiReadiness });

export type PrepareImplementationParameters = { readonly story: string };

type PrepareState = {
  readonly repositoryPath: string;
  readonly story: string;
  readonly turn: AgentTurnOutput | null;
  readonly readinessReply: string | null;
  readonly readiness: UiReadiness | null;
  readonly briefMissing: boolean;
  readonly failure: Failure | null;
};

export const PrepareImplementationGraph = createGraph<PrepareState, {}, PrepareImplementationParameters, SessionOutput>({
  key: 'EndToEndImplementationPrepare',
  title: 'Prepare implementation',
  init: (destination, parameters) => ({ repositoryPath: destination.worktreePath, ...parameters, turn: null, readinessReply: null, readiness: null, briefMissing: false, failure: null }),
  state: {
    repositoryPath: reduce.replace<string>(),
    story: reduce.replace<string>(),
    turn: reduce.replace<AgentTurnOutput | null>(),
    readinessReply: reduce.replace<string | null>(),
    readiness: reduce.replace<UiReadiness | null>(),
    briefMissing: reduce.replace<boolean>(),
    failure: reduce.replace<Failure | null>(),
  },
  entry: 'resetPlan',
  nodes: {
    resetPlan: operation<PrepareState, PrepareState>(async (ctx, state) => {
      await ctx.setUiFeedback({ phase: 'Preparing implementation plan' });
      let removed: boolean;
      try {
        removed = removeImplementationPlan(state.repositoryPath);
      } catch (error) {
        return failStep(ctx, { phase: 'End-to-end implementation failed', message: 'The existing implementation plan could not be removed' }, `Failed to remove ${planDirectory}: ${errorText(error)}`);
      }
      await ctx.log('info', removed
        ? `Removed the existing implementation plan at ${planDirectory} so a new planner session can recreate it.`
        : `No existing implementation plan was found at ${planDirectory}.`);
      return complete();
    }, { title: 'Remove the previous implementation plan' }),

    discoverUi: agentTurn<PrepareState, PrepareState>({
      title: 'Discover UI mocks',
      parameters: (state) => ({
        label: 'UI discovery',
        session: { kind: 'spawn', ...uiAgent },
        modifiers: BRAINSTORMING,
        prompt: uiDiscoveryPrompt({ story: state.story, ...designPaths }),
        feedback: { phase: 'Discovering UI mocks' },
      }),
      onResult: (_state, turn) => ({ turn }),
    }),

    steerUi: operation<PrepareState, PrepareState>(async (ctx) => {
      await ctx.setUiFeedback({ phase: 'Explore UI with the agent', message: 'Steer the UI session, then select Continue to check for open items, amend the design documents, and capture the brief.' });
      return suspend({ wait: wait.userContinue() });
    }, { title: 'Explore the UI with the agent' }),

    checkReadiness: agentTurn<PrepareState, PrepareState>({
      title: 'Check for open UI items',
      parameters: (state) => ({
        label: 'UI readiness check',
        session: { kind: 'existing', ...must(state.turn, 'UI session').agent },
        prompt: uiReadinessPrompt(),
        feedback: { phase: 'Checking for open UI items' },
      }),
      onResult: (_state, turn) => ({ turn }),
    }),

    readReadiness: operation<PrepareState, PrepareState>(async (ctx, state) => {
      const { agentSessionId } = must(state.turn, 'UI session').agent;
      const readinessReply = latestAssistantTurnText(await ctx.getConversationHistory(agentSessionId));
      if (!readinessReply) return failStep(ctx, { phase: 'End-to-end implementation failed', message: 'No UI readiness response was found' }, `UI session ${agentSessionId} has no complete assistant turn to inspect.`);
      return complete({ update: { readinessReply } });
    }, { title: "Read the UI agent's readiness reply" }),

    judgeReadiness: subgraph<PrepareState, PrepareState, JudgmentParameters, JudgmentOutput<UiReadiness>>({
      graph: UiReadinessJudgment,
      title: 'Judge UI readiness',
      parameters: (state) => ({
        label: 'UI readiness',
        profile: uiReadinessJudgment,
        prompt: uiReadinessJudgmentPrompt(must(state.readinessReply, 'UI readiness reply')),
      }),
      // A rejudge reads the UI agent's latest reply again before judging it.
      onResult: (_state, { output }) => ({ readiness: output.outcome === 'judged' ? output.route : null }),
    }),

    resolveOpenItems: operation<PrepareState, PrepareState>(async (ctx, state) => {
      const { reason } = must(state.readiness, 'UI readiness');
      await ctx.setUiFeedback({ kind: 'warning', phase: 'UI session has open items', message: `${reason} Resolve them in the UI session, then select Continue.` });
      await ctx.log('info', `UI session has open items: ${reason}`);
      return suspend({ wait: wait.userContinue('The UI session has open items. Resolve them, then Continue.') });
    }, { title: 'Ask the user to resolve open UI items' }),

    amendDesign: agentTurn<PrepareState, PrepareState>({
      title: 'Amend the design documents',
      parameters: (state) => ({
        label: 'Design amendment',
        session: { kind: 'existing', ...must(state.turn, 'UI session').agent },
        prompt: uiDesignAmendmentPrompt(designPaths),
        feedback: { phase: 'Amending design documents' },
      }),
      onResult: (_state, turn) => ({ turn }),
    }),

    writeBrief: agentTurn<PrepareState, PrepareState>({
      title: 'Write the UI brief',
      parameters: (state) => ({
        label: 'UI brief writing',
        session: { kind: 'existing', ...must(state.turn, 'UI session').agent },
        prompt: uiBriefPrompt({ ...designPaths, uiBriefPath }),
        feedback: { phase: 'Writing UI brief' },
      }),
      onResult: (_state, turn) => ({ turn }),
    }),

    checkBrief: operation<PrepareState, PrepareState>(async (_ctx, state) => complete({ update: { briefMissing: !artifactFileExists(state.repositoryPath, uiBriefPath) } }), { title: 'Check the UI brief' }),

    askForBrief: operation<PrepareState, PrepareState>(async (ctx) => {
      await ctx.setUiFeedback({ kind: 'warning', phase: 'UI brief is missing', message: `Expected ${uiBriefPath}. Finish writing the brief in the UI session, then select Continue.` });
      await ctx.log('warning', `Expected ${uiBriefPath}. Finish writing the brief in the UI session before continuing.`);
      return suspend({ wait: wait.userContinue('The UI brief is missing. Finish it in the UI session, then Continue.') });
    }, { title: 'Ask the user to finish the UI brief' }),

    commit: subgraph<PrepareState, PrepareState, CheckpointParameters, CheckpointOutput>({
      graph: CheckpointGraph,
      title: 'Commit the UI session',
      parameters: () => ({ draft: true, phase: 'Committing UI session changes', failureMessage: 'UI commit checkpoint failed' }),
      onResult: () => ({}),
    }),

    closeUi: operation<PrepareState, PrepareState>(async (ctx, state) => {
      await ctx.closePane(ownedPane(must(state.turn, 'UI session').agent));
      return complete();
    }, { title: 'Close the UI session' }),
  },
  edges: {
    afterResetPlan: edge<PrepareState, PrepareState>({ from: 'resetPlan', to: ['discoverUi'], choose: () => ({ to: 'discoverUi' }) }),
    afterDiscoverUi: edge<PrepareState, PrepareState>({ from: 'discoverUi', to: ['steerUi', 'failed'], choose: (state) => afterTurn(state, 'steerUi', 'UI discovery failed') }),
    afterSteerUi: afterContinue<PrepareState>('steerUi', 'checkReadiness', 'UI session could not continue'),
    afterCheckReadiness: edge<PrepareState, PrepareState>({ from: 'checkReadiness', to: ['readReadiness', 'failed'], choose: (state) => afterTurn(state, 'readReadiness', 'UI readiness check failed') }),
    afterReadReadiness: edge<PrepareState, PrepareState>({ from: 'readReadiness', to: ['judgeReadiness'], choose: () => ({ to: 'judgeReadiness' }) }),
    afterJudgeReadiness: edge<PrepareState, PrepareState>({
      from: 'judgeReadiness',
      to: ['readReadiness', 'resolveOpenItems', 'amendDesign'],
      choose: (state) => {
        if (state.readiness === null) return { to: 'readReadiness' };
        return { to: state.readiness.outcome === 'pending' ? 'resolveOpenItems' : 'amendDesign' };
      },
    }),
    afterResolveOpenItems: afterContinue<PrepareState>('resolveOpenItems', 'checkReadiness', 'Open UI items could not continue'),
    afterAmendDesign: edge<PrepareState, PrepareState>({ from: 'amendDesign', to: ['writeBrief', 'failed'], choose: (state) => afterTurn(state, 'writeBrief', 'Design amendment failed') }),
    afterWriteBrief: edge<PrepareState, PrepareState>({ from: 'writeBrief', to: ['checkBrief', 'failed'], choose: (state) => afterTurn(state, 'checkBrief', 'UI brief writing failed') }),
    afterCheckBrief: edge<PrepareState, PrepareState>({ from: 'checkBrief', to: ['askForBrief', 'commit'], choose: (state) => ({ to: state.briefMissing ? 'askForBrief' : 'commit' }) }),
    afterAskForBrief: afterContinue<PrepareState>('askForBrief', 'checkBrief', 'UI brief check could not continue'),
    afterCommit: edge<PrepareState, PrepareState>({ from: 'commit', to: ['closeUi'], choose: () => ({ to: 'closeUi' }) }),
    afterCloseUi: edge<PrepareState, PrepareState>({ from: 'closeUi', to: ['ready'], choose: () => ({ to: 'ready' }) }),
  },
  outcomes: {
    ready: outcome({ kind: 'success', title: 'Ready to implement', output: () => ({ outcome: 'ready' }) }),
    failed: outcome({ kind: 'failure', title: 'Preparation failed', output: (state) => ({ outcome: 'failed', failure: must(state.failure, 'failure') }) }),
  },
});

// Documentation: an agent brainstorms documentation updates with the user, then the session's
// changes are committed normally.

export type DocumentationParameters = { readonly story: string; readonly decisionLogPath: string };

type DocumentationState = {
  readonly story: string;
  readonly decisionLogPath: string;
  readonly turn: AgentTurnOutput | null;
  readonly failure: Failure | null;
};

export const DocumentationGraph = createGraph<DocumentationState, {}, DocumentationParameters, SessionOutput>({
  key: 'EndToEndImplementationDocumentation',
  title: 'Update documentation',
  init: (_destination, parameters) => ({ ...parameters, turn: null, failure: null }),
  state: {
    story: reduce.replace<string>(),
    decisionLogPath: reduce.replace<string>(),
    turn: reduce.replace<AgentTurnOutput | null>(),
    failure: reduce.replace<Failure | null>(),
  },
  entry: 'discover',
  nodes: {
    discover: agentTurn<DocumentationState, DocumentationState>({
      title: 'Discover documentation updates',
      parameters: (state) => ({
        label: 'Documentation discovery',
        session: { kind: 'spawn', ...documentationAgent },
        modifiers: BRAINSTORMING,
        prompt: documentationDiscoveryPrompt({ story: state.story, ...designPaths, entryPlanPath, decisionLogPath: state.decisionLogPath }),
        feedback: { phase: 'Discovering documentation updates' },
      }),
      onResult: (_state, turn) => ({ turn }),
    }),

    steer: operation<DocumentationState, DocumentationState>(async (ctx) => {
      await ctx.setUiFeedback({ phase: 'Work on documentation with the agent', message: 'Steer documentation updates, then select Continue to commit outstanding changes and finish.' });
      return suspend({ wait: wait.userContinue() });
    }, { title: 'Work on documentation with the agent' }),

    commit: subgraph<DocumentationState, DocumentationState, CheckpointParameters, CheckpointOutput>({
      graph: CheckpointGraph,
      title: 'Commit the documentation session',
      parameters: () => ({ draft: false, phase: 'Committing documentation session changes', failureMessage: 'Documentation commit checkpoint failed' }),
      onResult: () => ({}),
    }),

    closeDocs: operation<DocumentationState, DocumentationState>(async (ctx, state) => {
      await ctx.closePane(ownedPane(must(state.turn, 'documentation session').agent));
      return complete();
    }, { title: 'Close the documentation session' }),
  },
  edges: {
    afterDiscover: edge<DocumentationState, DocumentationState>({ from: 'discover', to: ['steer', 'failed'], choose: (state) => afterTurn(state, 'steer', 'Documentation discovery failed') }),
    afterSteer: afterContinue<DocumentationState>('steer', 'commit', 'Documentation session could not continue'),
    afterCommit: edge<DocumentationState, DocumentationState>({ from: 'commit', to: ['closeDocs'], choose: () => ({ to: 'closeDocs' }) }),
    afterCloseDocs: edge<DocumentationState, DocumentationState>({ from: 'closeDocs', to: ['ready'], choose: () => ({ to: 'ready' }) }),
  },
  outcomes: {
    ready: outcome({ kind: 'success', title: 'Documentation updated', output: () => ({ outcome: 'ready' }) }),
    failed: outcome({ kind: 'failure', title: 'Documentation failed', output: (state) => ({ outcome: 'failed', failure: must(state.failure, 'failure') }) }),
  },
});

// A dead agent session fails the step with its reason, as an unexpected turn did before.
function afterTurn<State extends { readonly turn: AgentTurnOutput | null }>(state: State, next: string, message: string): EdgeDecision<GraphUpdate<State>> {
  const turn = must(state.turn, 'agent turn');
  if (turn.outcome === 'ended') return { to: next };
  return { to: 'failed', update: { failure: { message, diagnostic: turn.reason } } as unknown as GraphUpdate<State> };
}

function afterContinue<State>(from: string, next: string, label: string) {
  return edge<State, State>({
    from,
    to: [next],
    choose: (_state, event) => {
      if (event.kind !== 'user_continue') throw new Error(`${label}: expected user Continue, received ${event.kind}.`);
      return { to: next };
    },
  });
}

function artifactFileExists(repositoryPath: string, artifactPath: string): boolean {
  const absolutePath = resolve(repositoryPath, artifactPath);
  return existsSync(absolutePath) && statSync(absolutePath).isFile();
}

function removeImplementationPlan(repositoryPath: string): boolean {
  const absolutePath = resolve(repositoryPath, planDirectory);
  if (!existsSync(absolutePath)) return false;
  rmSync(absolutePath, { recursive: true, force: true });
  return true;
}
