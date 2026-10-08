import { stat } from 'node:fs/promises';
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
  type GraphDefinition,
  type GraphUpdate,
  type WorkflowAgentHarness,
  type WorkflowConversationMessage,
} from '@yourtechbudstudio/isagi-workflow-sdk';

import { agentTurn, ownedPane, type AgentPane, type AgentTurnOutput, type AgentTurnParameters } from './agent-turn.js';
import { failStep } from './fail-step.js';
import { createJudgmentGraph, type JudgmentOutput, type JudgmentParameters } from './judgment.js';
import type { ArtifactJudgment, ReviewerRoute, WriterRoute } from './artifact-routing.js';

// A writer drafts a Markdown artifact and an independent reviewer reviews it until the reviewer
// closes the loop. Headless judgments route every writer and reviewer reply. The workflow supplies
// its prompts, parsers, profiles, and wording; this module owns the loop.
//
// root:    write → review ⇄ revise → finish
// writer:  prompt → read reply and check file → judge → ready | bounded recovery | human wait
// review:  prompt → read reply → judge → complete | revise | human decision
// Continue after either human wait asks the writer for a fresh reply incorporating the discussion.

export type ArtifactContext = { readonly story: string; readonly artifactPath: string };
const MAX_WRITER_RECOVERIES = 1;

type Profile = { readonly harness: WorkflowAgentHarness; readonly model: string; readonly effort: string };
type WithRepository<Context> = Context & { readonly repositoryPath: string };

export type ReviewedArtifactConfig<Context extends ArtifactContext> = {
  /** Root graph key; phase and judgment graphs append to it. Unique across the composed workflow. */
  readonly key: string;
  readonly title: string;
  /** Skill modifier given to the writer and reviewer when they are spawned. */
  readonly skill: string;
  /** Agent-turn labels, for example "Writer" or "Program-design writer". */
  readonly roles: { readonly writer: string; readonly reviewer: string };
  /** How logs name a review round, for example "architecture review round". */
  readonly roundLabel: string;
  readonly profiles: { readonly writer: Profile; readonly reviewer: Profile; readonly writerJudgment: Profile; readonly reviewerJudgment: Profile };
  readonly resubmitOnHarnessError?: number;
  /** UI feedback phases, verbatim. */
  readonly phases: {
    readonly writing: string;
    readonly checkingWriter: string;
    readonly reviewing: string;
    readonly routingReview: string;
    readonly revising: string;
    readonly rereviewing: string;
    readonly recoveringWriter: string;
    readonly complete: string;
    readonly failed: string;
  };
  readonly prompts: {
    readonly initialWriter: (input: WithRepository<Context>) => string;
    readonly reviewToWriter: (review: string) => string;
    readonly retryWriter: () => string;
    readonly continueWriter: (review: string | null) => string;
    readonly initialReviewer: (input: WithRepository<Context>) => string;
    readonly writerToReviewer: (writerResponse: string) => string;
    readonly writerRouting: (input: { readonly writerResponse: string; readonly artifactPath: string; readonly artifactExists: boolean }) => string;
    readonly reviewerRouting: (input: { readonly review: string }) => string;
  };
  readonly parse: {
    readonly writerRoute: (output: string) => ArtifactJudgment<WriterRoute>;
    readonly reviewerRoute: (output: string) => ArtifactJudgment<ReviewerRoute>;
  };
  readonly latestAssistantTurnText: (history: readonly WorkflowConversationMessage[]) => string | null;
};

export type ReviewedArtifactOutput =
  | { readonly outcome: 'artifact-reviewed'; readonly artifactPath: string; readonly reviewCount: number }
  | { readonly outcome: 'failed'; readonly reason: string };

type Failure = { readonly message: string; readonly diagnostic: string };
type Failed = { readonly outcome: 'failed'; readonly failure: Failure };

export function createReviewedArtifactGraph<Context extends ArtifactContext>(
  config: ReviewedArtifactConfig<Context>,
): GraphDefinition<RootState<Context>, RootState<Context>, Context, ReviewedArtifactOutput> {
  const writer = createWriterGraph(config);
  const review = createReviewGraph(config);
  type S = RootState<Context>;

  return createGraph<S, {}, Context, ReviewedArtifactOutput>({
    key: config.key,
    title: config.title,
    init: (_destination, context) => ({ context, writer: null, reviewer: null, writerResponse: null, review: null, reviewRound: 0, verdict: null, reviewReason: null, failure: null }),
    state: {
      context: reduce.replace<Context>(),
      writer: reduce.replace<AgentPane | null>(),
      reviewer: reduce.replace<AgentPane | null>(),
      writerResponse: reduce.replace<string | null>(),
      review: reduce.replace<string | null>(),
      reviewRound: reduce.replace<number>(),
      verdict: reduce.replace<ReviewerRoute | null>(),
      reviewReason: reduce.replace<string | null>(),
      failure: reduce.replace<Failure | null>(),
    },
    entry: 'write',
    nodes: {
      write: subgraph<S, S, WriterParameters<Context>, WriterOutput>({
        graph: writer,
        title: 'Write the artifact',
        parameters: (state) => ({ context: state.context, writer: null, review: null }),
        onResult: (_state, { output }) => (output.outcome === 'failed' ? { failure: output.failure } : { writer: output.writer, writerResponse: output.response }),
      }),
      review: subgraph<S, S, ReviewParameters<Context>, ReviewOutput>({
        graph: review,
        title: 'Review the artifact',
        label: (state) => `Review round ${state.reviewer ? state.reviewRound + 1 : 1}`,
        parameters: (state) => ({ context: state.context, reviewer: state.reviewer, writerResponse: state.writerResponse, round: state.reviewer ? state.reviewRound + 1 : 1 }),
        onResult: (_state, { output }) =>
          output.outcome === 'failed'
            ? { failure: output.failure }
            : { reviewer: output.reviewer, review: output.review, verdict: output.verdict, reviewReason: output.reason, reviewRound: output.round },
      }),
      revise: subgraph<S, S, WriterParameters<Context>, WriterOutput>({
        graph: writer,
        title: 'Revise the artifact',
        parameters: (state) => ({ context: state.context, writer: must(state.writer, 'writer'), review: must(state.review, 'review') }),
        onResult: (_state, { output }) => (output.outcome === 'failed' ? { failure: output.failure } : { writerResponse: output.response }),
      }),
      askHuman: operation<S, S>(async (ctx, state) => {
        const reason = must(state.reviewReason, 'review decision');
        const message = `${reason} Resolve it with ${config.roles.writer.toLowerCase()}, then select Continue.`;
        await ctx.setUiFeedback({ kind: 'warning', phase: 'Waiting for your decision', message });
        await ctx.log('warning', `${config.roundLabel} ${state.reviewRound} needs a human decision: ${reason}\n${must(state.review, 'review')}`);
        return suspend({ wait: wait.userContinue(message) });
      }, { title: 'Wait for your decision' }),
      replay: subgraph<S, S, WriterParameters<Context>, WriterOutput>({
        graph: writer,
        title: 'Incorporate your decision',
        parameters: (state) => ({ context: state.context, writer: must(state.writer, 'writer'), review: must(state.review, 'review'), afterHumanDecision: true }),
        onResult: (_state, { output }) => (output.outcome === 'failed' ? { failure: output.failure } : { writerResponse: output.response }),
      }),
      finish: operation<S, S>(async (ctx, state) => {
        await ctx.setUiFeedback({ phase: config.phases.complete });
        await ctx.closePane(ownedPane(must(state.writer, 'writer')));
        await ctx.closePane(ownedPane(must(state.reviewer, 'reviewer')));
        await ctx.log('info', `${config.phases.complete} after ${state.reviewRound} review rounds.`);
        return complete();
      }, { title: 'Close the writer and reviewer' }),
      reportFailure: operation<S, S>(async (ctx, state) => {
        const failure = must(state.failure, 'failure');
        await ctx.setUiFeedback({ kind: 'error', phase: config.phases.failed, message: failure.message });
        await ctx.log('error', failure.diagnostic);
        return complete();
      }, { title: 'Report the failure' }),
    },
    edges: {
      afterWrite: edge<S, S>({ from: 'write', to: ['review', 'reportFailure'], choose: (state) => ({ to: state.failure ? 'reportFailure' : 'review' }) }),
      afterReview: edge<S, S>({
        from: 'review',
        to: ['finish', 'revise', 'askHuman', 'reportFailure'],
        choose: (state) => {
          if (state.failure) return { to: 'reportFailure' };
          if (state.verdict === 'human-decision') return { to: 'askHuman' };
          return { to: state.verdict === 'complete' ? 'finish' : 'revise' };
        },
      }),
      afterRevise: edge<S, S>({ from: 'revise', to: ['review', 'reportFailure'], choose: (state) => ({ to: state.failure ? 'reportFailure' : 'review' }) }),
      afterAskHuman: edge<S, S>({ from: 'askHuman', to: ['replay'], choose: (_state, event) => {
        if (event.kind !== 'user_continue') throw new Error(`The human decision resumed with an unexpected ${event.kind} event.`);
        return { to: 'replay' };
      } }),
      afterReplay: edge<S, S>({ from: 'replay', to: ['review', 'reportFailure'], choose: (state) => ({ to: state.failure ? 'reportFailure' : 'review' }) }),
      afterFinish: edge<S, S>({ from: 'finish', to: ['reviewed'], choose: () => ({ to: 'reviewed' }) }),
      afterReportFailure: edge<S, S>({ from: 'reportFailure', to: ['failed'], choose: () => ({ to: 'failed' }) }),
    },
    outcomes: {
      reviewed: outcome({ kind: 'success', title: 'Artifact reviewed', output: (state) => ({ outcome: 'artifact-reviewed', artifactPath: state.context.artifactPath, reviewCount: state.reviewRound }) }),
      failed: outcome({ kind: 'failure', title: 'Artifact not reviewed', output: (state) => ({ outcome: 'failed', reason: must(state.failure, 'failure').diagnostic }) }),
    },
  });
}

export type RootState<Context> = {
  readonly context: Context;
  readonly writer: AgentPane | null;
  readonly reviewer: AgentPane | null;
  readonly writerResponse: string | null;
  readonly review: string | null;
  readonly reviewRound: number;
  readonly verdict: ReviewerRoute | null;
  readonly reviewReason: string | null;
  readonly failure: Failure | null;
};

// Writer: the first visit spawns the writer; a revision visit sends the review to the same writer.

type WriterParameters<Context> = { readonly context: Context; readonly writer: AgentPane | null; readonly review: string | null; readonly afterHumanDecision?: boolean };
type WriterOutput = { readonly outcome: 'ready'; readonly writer: AgentPane; readonly response: string } | Failed;
type WriterState<Context> = {
  readonly repositoryPath: string;
  readonly context: Context;
  readonly writer: AgentPane | null;
  readonly review: string | null;
  readonly turn: AgentTurnOutput | null;
  readonly response: string | null;
  readonly afterHumanDecision: boolean;
  readonly artifactExists: boolean;
  readonly recoveryAttempts: number;
  readonly route: WriterRoute | null;
  readonly routingReason: string | null;
  readonly failure: Failure | null;
};

function createWriterGraph<Context extends ArtifactContext>(config: ReviewedArtifactConfig<Context>) {
  type S = WriterState<Context>;
  const judgment = createJudgmentGraph({ key: `${config.key}WriterJudgment`, title: 'Route the writer', parse: config.parse.writerRoute });
  const role = config.roles.writer;
  const resubmit = config.resubmitOnHarnessError ? { resubmitOnHarnessError: config.resubmitOnHarnessError } : {};

  return createGraph<S, {}, WriterParameters<Context>, WriterOutput>({
    key: `${config.key}Writer`,
    title: 'Writer turn',
    label: (parameters) => (parameters.writer ? 'Revise the artifact' : 'Write the artifact'),
    init: (destination, parameters) => ({
      repositoryPath: destination.worktreePath,
      ...parameters,
      turn: null,
      response: null,
      afterHumanDecision: parameters.afterHumanDecision ?? false,
      artifactExists: false,
      recoveryAttempts: 0,
      route: null,
      routingReason: null,
      failure: null,
    }),
    state: {
      repositoryPath: reduce.replace<string>(),
      context: reduce.replace<Context>(),
      writer: reduce.replace<AgentPane | null>(),
      review: reduce.replace<string | null>(),
      turn: reduce.replace<AgentTurnOutput | null>(),
      response: reduce.replace<string | null>(),
      afterHumanDecision: reduce.replace<boolean>(),
      artifactExists: reduce.replace<boolean>(),
      recoveryAttempts: reduce.replace<number>(),
      route: reduce.replace<WriterRoute | null>(),
      routingReason: reduce.replace<string | null>(),
      failure: reduce.replace<Failure | null>(),
    },
    entry: 'prompt',
    nodes: {
      prompt: agentTurn<S, S>({
        title: 'Prompt the writer',
        parameters: (state): AgentTurnParameters =>
          state.writer === null
            ? {
                label: role,
                session: { kind: 'spawn', ...config.profiles.writer },
                modifiers: [{ kind: 'skill', name: config.skill }],
                prompt: config.prompts.initialWriter({ ...state.context, repositoryPath: state.repositoryPath }),
                feedback: { phase: config.phases.writing },
                ...resubmit,
              }
            : {
                label: role,
                session: { kind: 'existing', ...state.writer },
                prompt: state.afterHumanDecision ? continuationPrompt(state) : config.prompts.reviewToWriter(must(state.review, 'review')),
                feedback: { phase: config.phases.revising },
                ...resubmit,
              },
        onResult: (_state, turn) => ({ turn, writer: turn.agent }),
      }),
      readResponse: operation<S, S>(async (ctx, state) => {
        const writer = must(state.writer, 'writer');
        const response = config.latestAssistantTurnText(await ctx.getConversationHistory(writer.agentSessionId));
        if (response) {
          const artifactExists = await artifactFileExists(resolve(state.repositoryPath, state.context.artifactPath));
          return complete({ update: { response, artifactExists } });
        }
        return failStep(ctx, { phase: config.phases.failed, message: 'No writer response was found' }, `writer session ${writer.agentSessionId} has no complete assistant turn to inspect.`);
      }, { title: "Read the writer's reply" }),
      judge: subgraph<S, S, JudgmentParameters, JudgmentOutput<ArtifactJudgment<WriterRoute>>>({
        graph: judgment,
        title: 'Route the writer',
        parameters: (state) => ({
          label: 'writer',
          profile: config.profiles.writerJudgment,
          prompt: config.prompts.writerRouting({ writerResponse: must(state.response, 'writer response'), artifactPath: state.context.artifactPath, artifactExists: state.artifactExists }),
          feedback: { phase: config.phases.checkingWriter },
        }),
        onResult: (_state, { output }) => output.outcome === 'judged' ? { route: output.route.outcome, routingReason: output.route.reason } : { route: null, routingReason: null },
      }),
      askUser: operation<S, S>(async (ctx, state) => {
        const writer = must(state.writer, 'writer');
        const phase = state.route === 'human-decision' ? 'Waiting for your decision' : 'The writer needs help finishing the artifact';
        const reason = state.artifactExists || state.route === 'human-decision' ? must(state.routingReason, 'writer routing reason') : `The artifact file is missing or empty at ${state.context.artifactPath}.`;
        const message = `${reason} Resolve it with ${role.toLowerCase()}, then select Continue.`;
        await ctx.setUiFeedback({ kind: 'warning', phase, message });
        await ctx.log('warning', `Writer session ${writer.agentSessionId}: ${phase}. ${reason}\nLatest response:\n${must(state.response, 'writer response')}`);
        return suspend({ wait: wait.userContinue(message) });
      }, { title: 'Ask the user to resolve the writer' }),
      recover: operation<S, S>(async () => complete({ update: { recoveryAttempts: 0 } }), { title: 'Prepare the updated writer response' }),
      replay: agentTurn<S, S>({
        title: 'Incorporate your decision and reply to the reviewer',
        parameters: (state) => ({
          label: role,
          session: { kind: 'existing', ...must(state.writer, 'writer') },
          prompt: continuationPrompt(state),
          feedback: { phase: config.phases.revising },
          ...resubmit,
        }),
        onResult: (_state, turn) => ({ turn }),
      }),
      nudge: agentTurn<S, S>({
        title: 'Nudge the writer once',
        parameters: (state) => ({
          label: role,
          session: { kind: 'existing', ...must(state.writer, 'writer') },
          prompt: config.prompts.retryWriter(),
          feedback: { phase: config.phases.recoveringWriter },
          ...resubmit,
        }),
        onResult: (state, turn) => ({ turn, recoveryAttempts: state.recoveryAttempts + 1 }),
      }),
    },
    edges: {
      afterPrompt: afterWriterTurn('prompt', role),
      afterReadResponse: edge<S, S>({ from: 'readResponse', to: ['judge'], choose: () => ({ to: 'judge' }) }),
      afterJudge: edge<S, S>({
        from: 'judge',
        to: ['ready', 'nudge', 'askUser', 'readResponse'],
        choose: (state) => {
          if (state.route === null) return { to: 'readResponse' };
          if (state.route === 'human-decision') return { to: 'askUser' };
          if (state.route === 'ready' && state.artifactExists) return { to: 'ready' };
          return { to: state.recoveryAttempts < MAX_WRITER_RECOVERIES ? 'nudge' : 'askUser' };
        },
      }),
      afterAskUser: edge<S, S>({
        from: 'askUser',
        to: ['recover'],
        choose: (_state, event) => {
          if (event.kind !== 'user_continue') throw new Error(`The writer recovery resumed with an unexpected ${event.kind} event.`);
          return { to: 'recover' };
        },
      }),
      afterRecover: edge<S, S>({ from: 'recover', to: ['replay'], choose: () => ({ to: 'replay' }) }),
      afterReplay: afterWriterTurn('replay', role, 'readResponse'),
      afterNudge: afterWriterTurn('nudge', role, 'readResponse'),
    },
    outcomes: {
      ready: outcome({ kind: 'success', title: 'Writer ready', output: (state) => ({ outcome: 'ready', writer: must(state.writer, 'writer'), response: must(state.response, 'writer response') }) }),
      failed: outcome({ kind: 'failure', title: 'Writer failed', output: (state) => ({ outcome: 'failed', failure: must(state.failure, 'failure') }) }),
    },
  });

  function continuationPrompt(state: S): string {
    return config.prompts.continueWriter(state.review);
  }

  function afterWriterTurn(from: 'prompt' | 'nudge' | 'replay', label: string, next = 'readResponse') {
    return edge<S, S>({ from, to: [next, 'failed'], choose: (state) => afterTurn<S>(state, label, next) });
  }
}

// Review: the first visit spawns the reviewer; later rounds send the writer's reply to it.

type ReviewParameters<Context> = { readonly context: Context; readonly reviewer: AgentPane | null; readonly writerResponse: string | null; readonly round: number };
type ReviewOutput = { readonly outcome: 'reviewed'; readonly verdict: ReviewerRoute; readonly reason: string; readonly reviewer: AgentPane; readonly review: string; readonly round: number } | Failed;
type ReviewState<Context> = {
  readonly repositoryPath: string;
  readonly context: Context;
  readonly reviewer: AgentPane | null;
  readonly writerResponse: string | null;
  readonly round: number;
  readonly turn: AgentTurnOutput | null;
  readonly review: string | null;
  readonly verdict: ReviewerRoute | null;
  readonly routingReason: string | null;
  readonly failure: Failure | null;
};

function createReviewGraph<Context extends ArtifactContext>(config: ReviewedArtifactConfig<Context>) {
  type S = ReviewState<Context>;
  const judgment = createJudgmentGraph({ key: `${config.key}ReviewJudgment`, title: 'Route the review', parse: config.parse.reviewerRoute });
  const role = config.roles.reviewer;
  const resubmit = config.resubmitOnHarnessError ? { resubmitOnHarnessError: config.resubmitOnHarnessError } : {};

  return createGraph<S, {}, ReviewParameters<Context>, ReviewOutput>({
    key: `${config.key}Review`,
    title: 'Review round',
    label: (parameters) => `Review round ${parameters.round}`,
    init: (destination, parameters) => ({ repositoryPath: destination.worktreePath, ...parameters, turn: null, review: null, verdict: null, routingReason: null, failure: null }),
    state: {
      repositoryPath: reduce.replace<string>(),
      context: reduce.replace<Context>(),
      reviewer: reduce.replace<AgentPane | null>(),
      writerResponse: reduce.replace<string | null>(),
      round: reduce.replace<number>(),
      turn: reduce.replace<AgentTurnOutput | null>(),
      review: reduce.replace<string | null>(),
      verdict: reduce.replace<ReviewerRoute | null>(),
      routingReason: reduce.replace<string | null>(),
      failure: reduce.replace<Failure | null>(),
    },
    entry: 'prompt',
    nodes: {
      prompt: agentTurn<S, S>({
        title: 'Prompt the reviewer',
        parameters: (state): AgentTurnParameters =>
          state.reviewer === null
            ? {
                label: role,
                session: { kind: 'spawn', ...config.profiles.reviewer },
                modifiers: [{ kind: 'skill', name: config.skill }],
                prompt: config.prompts.initialReviewer({ ...state.context, repositoryPath: state.repositoryPath }),
                feedback: { phase: config.phases.reviewing },
                ...resubmit,
              }
            : {
                label: role,
                session: { kind: 'existing', ...state.reviewer },
                prompt: config.prompts.writerToReviewer(must(state.writerResponse, 'writer response')),
                feedback: { phase: config.phases.rereviewing },
                ...resubmit,
              },
        onResult: (_state, turn) => ({ turn, reviewer: turn.agent }),
      }),
      readReview: operation<S, S>(async (ctx, state) => {
        const reviewer = must(state.reviewer, 'reviewer');
        const review = config.latestAssistantTurnText(await ctx.getConversationHistory(reviewer.agentSessionId));
        if (review) return complete({ update: { review } });
        return failStep(ctx, { phase: config.phases.failed, message: 'No reviewer response was found' }, `reviewer session ${reviewer.agentSessionId} has no complete assistant turn to inspect.`);
      }, { title: "Read the reviewer's reply" }),
      judge: subgraph<S, S, JudgmentParameters, JudgmentOutput<ArtifactJudgment<ReviewerRoute>>>({
        graph: judgment,
        title: 'Route the review',
        parameters: (state) => ({
          label: 'reviewer',
          profile: config.profiles.reviewerJudgment,
          prompt: config.prompts.reviewerRouting({ review: must(state.review, 'review') }),
          feedback: { phase: config.phases.routingReview },
        }),
        onResult: (_state, { output }) => output.outcome === 'judged' ? { verdict: output.route.outcome, routingReason: output.route.reason } : { verdict: null, routingReason: null },
      }),
    },
    edges: {
      afterPrompt: edge<S, S>({ from: 'prompt', to: ['readReview', 'failed'], choose: (state) => afterTurn<S>(state, role, 'readReview') }),
      afterReadReview: edge<S, S>({ from: 'readReview', to: ['judge'], choose: () => ({ to: 'judge' }) }),
      afterJudge: edge<S, S>({
        from: 'judge',
        to: ['reviewed', 'readReview'],
        choose: (state) => {
          // After a judgment the user had to look at, the reviewer's latest reply is read and judged again.
          if (state.verdict === null) return { to: 'readReview' };
          return { to: 'reviewed' };
        },
      }),
    },
    outcomes: {
      reviewed: outcome({
        kind: 'success',
        title: 'Reviewed',
        output: (state) => {
          const verdict = must(state.verdict, 'verdict');
          return { outcome: 'reviewed', verdict, reason: must(state.routingReason, 'review routing reason'), reviewer: must(state.reviewer, 'reviewer'), review: must(state.review, 'review'), round: state.round };
        },
      }),
      failed: outcome({ kind: 'failure', title: 'Review failed', output: (state) => ({ outcome: 'failed', failure: must(state.failure, 'failure') }) }),
    },
  });
}

async function artifactFileExists(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    return info.isFile() && info.size > 0;
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) return false;
    throw error;
  }
}

function afterTurn<S extends { readonly turn: AgentTurnOutput | null }>(state: S, label: string, next: string): EdgeDecision<GraphUpdate<S>> {
  const turn = must(state.turn, 'agent turn');
  if (turn.outcome === 'interrupted') return { to: 'failed', update: { failure: { message: `${label} failed because its agent session ended.`, diagnostic: turn.reason } } as unknown as GraphUpdate<S> };
  return { to: next };
}

function must<Value>(value: Value | null, label: string): Value {
  if (value === null) throw new Error(`Reviewed artifact state is missing its ${label}.`);
  return value;
}
