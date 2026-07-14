import {
  cont,
  defineWorkflow,
  done,
  event as workflowEvent,
  fail,
  suspend,
  wait,
  type WorkflowContext,
  type WorkflowResult,
} from '@yourtechbudstudio/isagi-workflow-sdk';

import { fixer, reviewer, routingJudgment } from './constants.js';
import {
  completedSingleHeadlessResult,
  latestAssistantTurnText,
  parseReviewRoute,
  reviewRoutingPrompt,
  type ReviewRoute,
} from './judgments.js';
import { fixerToReviewerPrompt, reviewToFixerPrompt } from './prompts.js';

type Agent = {
  readonly agentSessionId: number;
  readonly paneId: number;
};

type Stage =
  | { readonly kind: 'spawn_reviewer' }
  | { readonly kind: 'await_initial_review'; readonly reviewer: Agent }
  | {
      readonly kind: 'await_initial_review_routing';
      readonly reviewer: Agent;
      readonly review: string;
    }
  | {
      readonly kind: 'await_initial_disagreement_resolution';
      readonly reviewer: Agent;
    }
  | {
      readonly kind: 'await_fixer_turn';
      readonly reviewer: Agent;
      readonly fixer: Agent;
      readonly reviewRound: number;
      readonly afterFixer: 'complete' | 'rereview';
    }
  | {
      readonly kind: 'await_rereview';
      readonly reviewer: Agent;
      readonly fixer: Agent;
      readonly reviewRound: number;
    }
  | {
      readonly kind: 'await_rereview_routing';
      readonly reviewer: Agent;
      readonly fixer: Agent;
      readonly review: string;
      readonly reviewRound: number;
    }
  | {
      readonly kind: 'await_disagreement_resolution';
      readonly reviewer: Agent;
      readonly fixer: Agent;
      readonly reviewRound: number;
    };

type State = {
  readonly stateVersion: 1;
  readonly context: string;
  readonly stage: Stage;
};

type Variables = {
  readonly context?: unknown;
};

export default defineWorkflow<State, Variables>({
  command: () => ({
    title: 'Engineering Guidance Review Loop',
    description: 'Route a code review between a reviewer and fixer until the reviewer closes it.',
    inputs: [
      {
        kind: 'text',
        key: 'context',
        label: 'Review scope, goal, and context',
        placeholder: 'Review the working tree changes relative to HEAD against…',
      },
    ],
  }),
  validate: (_launchCtx, variables) => {
    parseContext(variables.context);
  },
  init: (_launchCtx, variables): State => ({
    stateVersion: 1,
    context: parseContext(variables.context),
    stage: { kind: 'spawn_reviewer' },
  }),
  step: async (ctx, state, incoming) => {
    await ctx.log('debug', `Engineering guidance review loop stage=${state.stage.kind}.`);

    switch (state.stage.kind) {
      case 'spawn_reviewer': {
        await ctx.setUiFeedback({ phase: 'Starting reviewer' });
        const spawned = await ctx.spawnAgentSession({
          harness: reviewer.harness,
          model: reviewer.model,
          effort: reviewer.effort,
          modifiers: [{ kind: 'command', name: 'perform-engineering-guidance-review' }],
          prompt: state.context,
        });
        const reviewerAgent = agentFromSpawn(spawned);
        await ctx.log(
          'info',
          `Spawned reviewer in pane ${reviewerAgent.paneId}: harness=${reviewer.harness}, model=${reviewer.model}, effort=${reviewer.effort}, agentSessionId=${reviewerAgent.agentSessionId}.`,
        );
        return suspend(
          withStage(state, { kind: 'await_initial_review', reviewer: reviewerAgent }),
          wait.agentTurn(spawned),
        );
      }

      case 'await_initial_review': {
        const ended = await requireEndedTurn(ctx, incoming, 'Reviewer');
        if (!ended.ok) return ended.result;
        const review = await latestTurnOrFail(ctx, state.stage.reviewer, 'reviewer');
        if (!review.ok) return review.result;
        return startRoutingJudgment(ctx, {
          state: withStage(state, {
            kind: 'await_initial_review_routing',
            reviewer: state.stage.reviewer,
            review: review.text,
          }),
          review: review.text,
        });
      }

      case 'await_initial_review_routing': {
        const route = await readRoutingJudgment(ctx, incoming);
        if (!route.ok) return route.result;
        switch (route.value) {
          case 'complete':
            return finishReviewLoop(ctx, state.stage.reviewer, undefined, 1);
          case 'continue':
          case 'final-fixer':
            return spawnFixerForReview(ctx, state, {
              reviewer: state.stage.reviewer,
              review: state.stage.review,
              reviewRound: 1,
              afterFixer: route.value === 'final-fixer' ? 'complete' : 'rereview',
            });
          case 'human-decision': {
            await ctx.setUiFeedback({
              kind: 'warning',
              phase: 'Waiting for your decision',
              message:
                'The reviewer flagged a disagreement. Resolve it, then continue the workflow.',
            });
            await ctx.log(
              'warning',
              'Reviewer flagged a disagreement before the first fixer turn; waiting for user resolution.',
            );
            return suspend(
              withStage(state, {
                kind: 'await_initial_disagreement_resolution',
                reviewer: state.stage.reviewer,
              }),
              wait.userContinue(),
            );
          }
          default:
            return assertNever(route.value);
        }
      }

      case 'await_initial_disagreement_resolution': {
        if (!workflowEvent.isUserContinue(incoming)) {
          return failWorkflow(
            ctx,
            'The review decision could not be resumed',
            'The initial disagreement pause resumed with an unexpected event.',
          );
        }
        const latestReview = await latestTurnOrFail(ctx, state.stage.reviewer, 'reviewer');
        if (!latestReview.ok) return latestReview.result;
        await ctx.log(
          'info',
          "User continued after the initial disagreement; sending the reviewer session's latest complete turn to a new fixer.",
        );
        return spawnFixerForReview(ctx, state, {
          reviewer: state.stage.reviewer,
          review: latestReview.text,
          reviewRound: 1,
          afterFixer: 'rereview',
        });
      }

      case 'await_fixer_turn': {
        const ended = await requireEndedTurn(ctx, incoming, 'Fixer');
        if (!ended.ok) return ended.result;
        if (state.stage.afterFixer === 'complete') {
          return finishReviewLoop(
            ctx,
            state.stage.reviewer,
            state.stage.fixer,
            state.stage.reviewRound,
          );
        }
        const fixerResponse = await latestTurnOrFail(ctx, state.stage.fixer, 'fixer');
        if (!fixerResponse.ok) return fixerResponse.result;
        await ctx.setUiFeedback({ phase: 'Re-reviewing fixes' });
        const sent = await ctx.sendAgentPrompt({
          agentSessionId: state.stage.reviewer.agentSessionId,
          prompt: fixerToReviewerPrompt(fixerResponse.text),
        });
        await ctx.log(
          'info',
          `Sent fixer response from review round ${state.stage.reviewRound} to reviewer session ${state.stage.reviewer.agentSessionId}.`,
        );
        return suspend(
          withStage(state, {
            kind: 'await_rereview',
            reviewer: state.stage.reviewer,
            fixer: state.stage.fixer,
            reviewRound: state.stage.reviewRound + 1,
          }),
          wait.agentTurn(sent),
        );
      }

      case 'await_rereview': {
        const ended = await requireEndedTurn(ctx, incoming, 'Reviewer');
        if (!ended.ok) return ended.result;
        const review = await latestTurnOrFail(ctx, state.stage.reviewer, 'reviewer');
        if (!review.ok) return review.result;
        return startRoutingJudgment(ctx, {
          state: withStage(state, {
            kind: 'await_rereview_routing',
            reviewer: state.stage.reviewer,
            fixer: state.stage.fixer,
            review: review.text,
            reviewRound: state.stage.reviewRound,
          }),
          review: review.text,
        });
      }

      case 'await_rereview_routing': {
        const route = await readRoutingJudgment(ctx, incoming);
        if (!route.ok) return route.result;
        switch (route.value) {
          case 'complete':
            return finishReviewLoop(
              ctx,
              state.stage.reviewer,
              state.stage.fixer,
              state.stage.reviewRound,
            );
          case 'continue':
          case 'final-fixer':
            return sendReviewToFixer(ctx, state, {
              reviewer: state.stage.reviewer,
              fixer: state.stage.fixer,
              review: state.stage.review,
              reviewRound: state.stage.reviewRound,
              afterFixer: route.value === 'final-fixer' ? 'complete' : 'rereview',
            });
          case 'human-decision': {
            await ctx.setUiFeedback({
              kind: 'warning',
              phase: 'Waiting for your decision',
              message:
                'The reviewer still holds a disagreement. Resolve it, then continue the workflow.',
            });
            await ctx.log(
              'warning',
              `Reviewer held a disagreement in review round ${state.stage.reviewRound}; waiting for user resolution.`,
            );
            return suspend(
              withStage(state, {
                kind: 'await_disagreement_resolution',
                reviewer: state.stage.reviewer,
                fixer: state.stage.fixer,
                reviewRound: state.stage.reviewRound,
              }),
              wait.userContinue(),
            );
          }
          default:
            return assertNever(route.value);
        }
      }

      case 'await_disagreement_resolution': {
        if (!workflowEvent.isUserContinue(incoming)) {
          return failWorkflow(
            ctx,
            'The review decision could not be resumed',
            'The disagreement pause resumed with an unexpected event.',
          );
        }
        const latestReview = await latestTurnOrFail(ctx, state.stage.reviewer, 'reviewer');
        if (!latestReview.ok) return latestReview.result;
        await ctx.log(
          'info',
          `User continued review round ${state.stage.reviewRound}; sending the reviewer session's latest complete turn to the fixer.`,
        );
        return sendReviewToFixer(ctx, state, {
          reviewer: state.stage.reviewer,
          fixer: state.stage.fixer,
          review: latestReview.text,
          reviewRound: state.stage.reviewRound,
          afterFixer: 'rereview',
        });
      }

      default:
        return assertNever(state.stage);
    }
  },
});

async function startRoutingJudgment(
  ctx: WorkflowContext,
  input: {
    readonly state: State;
    readonly review: string;
  },
): Promise<WorkflowResult> {
  await ctx.setUiFeedback({ phase: 'Routing reviewer feedback' });
  const op = await ctx.runHeadlessAgent({
    harness: routingJudgment.harness,
    model: routingJudgment.model,
    effort: routingJudgment.effort,
    prompt: reviewRoutingPrompt({ review: input.review }),
  });
  await ctx.log('info', `Started review routing judgment ${op.opId}.`);
  return suspend(input.state, wait.headlessAgent(op));
}

async function readRoutingJudgment(
  ctx: WorkflowContext,
  incoming: unknown,
): Promise<
  | { readonly ok: true; readonly value: ReviewRoute }
  | { readonly ok: false; readonly result: WorkflowResult }
> {
  try {
    const result = completedSingleHeadlessResult(incoming);
    const value = parseReviewRoute(result.output ?? '');
    await ctx.log('info', `Review routing outcome=${value}.`);
    return { ok: true, value };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      result: await failWorkflow(
        ctx,
        'The reviewer response could not be routed',
        `Review routing failed: ${message}`,
      ),
    };
  }
}

async function spawnFixerForReview(
  ctx: WorkflowContext,
  state: State,
  input: {
    readonly reviewer: Agent;
    readonly review: string;
    readonly reviewRound: number;
    readonly afterFixer: 'complete' | 'rereview';
  },
): Promise<WorkflowResult> {
  await ctx.setUiFeedback({ phase: 'Fixing review findings' });
  const spawned = await ctx.spawnAgentSession({
    harness: fixer.harness,
    model: fixer.model,
    effort: fixer.effort,
    prompt: reviewToFixerPrompt(input.review),
  });
  const fixerAgent = agentFromSpawn(spawned);
  await ctx.log(
    'info',
    `Spawned fixer in pane ${fixerAgent.paneId}: harness=${fixer.harness}, model=${fixer.model}, effort=${fixer.effort}, agentSessionId=${fixerAgent.agentSessionId}.`,
  );
  return suspend(
    withStage(state, {
      kind: 'await_fixer_turn',
      reviewer: input.reviewer,
      fixer: fixerAgent,
      reviewRound: input.reviewRound,
      afterFixer: input.afterFixer,
    }),
    wait.agentTurn(spawned),
  );
}

async function sendReviewToFixer(
  ctx: WorkflowContext,
  state: State,
  input: {
    readonly reviewer: Agent;
    readonly fixer: Agent;
    readonly review: string;
    readonly reviewRound: number;
    readonly afterFixer: 'complete' | 'rereview';
  },
): Promise<WorkflowResult> {
  await ctx.setUiFeedback({ phase: 'Fixing review findings' });
  const sent = await ctx.sendAgentPrompt({
    agentSessionId: input.fixer.agentSessionId,
    prompt: reviewToFixerPrompt(input.review),
  });
  await ctx.log(
    'info',
    `Sent review round ${input.reviewRound} to fixer session ${input.fixer.agentSessionId}.`,
  );
  return suspend(
    withStage(state, {
      kind: 'await_fixer_turn',
      reviewer: input.reviewer,
      fixer: input.fixer,
      reviewRound: input.reviewRound,
      afterFixer: input.afterFixer,
    }),
    wait.agentTurn(sent),
  );
}

async function finishReviewLoop(
  ctx: WorkflowContext,
  reviewerAgent: Agent,
  fixerAgent: Agent | undefined,
  reviewCount: number,
): Promise<WorkflowResult> {
  await ctx.setUiFeedback({ phase: 'Review loop complete' });
  if (fixerAgent) await ctx.closePane(fixerAgent.paneId);
  await ctx.closePane(reviewerAgent.paneId);
  await ctx.log(
    'info',
    `Engineering guidance review loop completed after ${reviewCount} review rounds.`,
  );
  return done({ outcome: 'workflow-executed-successfully', reviewCount });
}

async function requireEndedTurn(
  ctx: WorkflowContext,
  incoming: unknown,
  role: 'Reviewer' | 'Fixer',
): Promise<{ readonly ok: true } | { readonly ok: false; readonly result: WorkflowResult }> {
  if (workflowEvent.isAgentTurnEnded(incoming)) return { ok: true };
  if (workflowEvent.isAgentTurnFailed(incoming)) {
    return {
      ok: false,
      result: await failWorkflow(
        ctx,
        `${role} turn failed`,
        `${role} turn failed: ${incoming.reason}`,
      ),
    };
  }
  return {
    ok: false,
    result: await failWorkflow(
      ctx,
      `${role} turn could not be resumed`,
      `${role} turn wait resumed with an unexpected event.`,
    ),
  };
}

async function latestTurnOrFail(
  ctx: WorkflowContext,
  agent: Agent,
  role: 'reviewer' | 'fixer',
): Promise<
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly result: WorkflowResult }
> {
  const history = await ctx.getConversationHistory(agent.agentSessionId);
  const text = latestAssistantTurnText(history);
  if (text) return { ok: true, text };
  return {
    ok: false,
    result: await failWorkflow(
      ctx,
      `No ${role} response was found`,
      `${role} session ${agent.agentSessionId} has no complete assistant turn to inspect.`,
    ),
  };
}

async function failWorkflow(
  ctx: WorkflowContext,
  userMessage: string,
  diagnostic: string,
): Promise<WorkflowResult> {
  await ctx.setUiFeedback({ kind: 'error', phase: 'Review loop failed', message: userMessage });
  await ctx.log('error', diagnostic);
  return fail(diagnostic);
}

function agentFromSpawn(input: {
  readonly agentSessionId: number;
  readonly paneId: number;
}): Agent {
  return { agentSessionId: input.agentSessionId, paneId: input.paneId };
}

function withStage(state: State, stage: Stage): State {
  return { ...state, stage };
}

function parseContext(value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  throw new Error('context must be non-empty free-form text.');
}

function assertNever(value: never): never {
  throw new Error(`Unsupported workflow value: ${String(value)}`);
}
