import {
  defineWorkflow,
  done,
  event as workflowEvent,
  fail,
  suspend,
  wait,
  type WorkflowContext,
  type WorkflowPromptInput,
  type WorkflowResult,
} from '@yourtechbudstudio/isagi-workflow-sdk';

import {
  reviewer,
  reviewerJudgment,
  writer,
  writerJudgment,
} from './constants.js';
import {
  completedSingleHeadlessResult,
  latestAssistantTurnText,
  parseReviewerRoute,
  parseWriterRoute,
  reviewerRoutingPrompt,
  writerRoutingPrompt,
  type ReviewerRoute,
  type WriterRoute,
} from './judgments.js';
import {
  initialReviewerPrompt,
  initialWriterPrompt,
  reviewToWriterPrompt,
  retryWriterPrompt,
  writerToReviewerPrompt,
} from './prompts.js';

type Agent = {
  readonly agentSessionId: number;
  readonly paneId: number;
};

type WriterJudgmentMode = 'normal' | 'retry_recheck';

type HarnessErrorRetryState = {
  readonly harnessErrorRetries?: number;
  readonly lastAgentInput?: WorkflowPromptInput;
};

const MAX_HARNESS_ERROR_RETRIES = 1;

type Stage =
  | { readonly kind: 'spawn_writer' }
  | ({ readonly kind: 'await_initial_writer'; readonly writer: Agent } & HarnessErrorRetryState)
  | {
      readonly kind: 'await_initial_writer_judgment';
      readonly writer: Agent;
      readonly writerResponse: string;
      readonly mode: WriterJudgmentMode;
    }
  | ({
      readonly kind: 'await_review';
      readonly writer: Agent;
      readonly reviewer: Agent;
      readonly reviewRound: number;
    } & HarnessErrorRetryState)
  | {
      readonly kind: 'await_reviewer_judgment';
      readonly writer: Agent;
      readonly reviewer: Agent;
      readonly review: string;
      readonly reviewRound: number;
    }
  | ({
      readonly kind: 'await_revision';
      readonly writer: Agent;
      readonly reviewer: Agent;
      readonly reviewRound: number;
    } & HarnessErrorRetryState)
  | {
      readonly kind: 'await_revision_judgment';
      readonly writer: Agent;
      readonly reviewer: Agent;
      readonly writerResponse: string;
      readonly reviewRound: number;
      readonly mode: WriterJudgmentMode;
    }
  | {
      readonly kind: 'await_human_decision';
      readonly writer: Agent;
      readonly reviewer: Agent;
      readonly reviewRound: number;
    };

type State = {
  readonly stateVersion: 1;
  readonly repositoryPath: string;
  readonly story: string;
  readonly currentStatePath: string;
  readonly architecturePath: string;
  readonly artifactPath: string;
  readonly stage: Stage;
};

type Variables = {
  readonly story?: unknown;
  readonly currentStatePath?: unknown;
  readonly architecturePath?: unknown;
  readonly artifactPath?: unknown;
};

export default defineWorkflow<State, Variables>({
  command: () => ({
    title: 'Design Program',
    description: 'Create and independently review a story-scoped program design.',
    inputs: [
      {
        kind: 'text',
        key: 'story',
        label: 'Story or story URL',
        placeholder: 'https://github.com/owner/repository/issues/123',
      },
      {
        kind: 'text',
        key: 'currentStatePath',
        label: 'Current-state analysis path',
        placeholder: 'scratch/current-state/issue-123.md',
      },
      {
        kind: 'text',
        key: 'architecturePath',
        label: 'Architecture path',
        placeholder: 'scratch/architecture/issue-123.md',
      },
      {
        kind: 'text',
        key: 'artifactPath',
        label: 'Program-design artifact path',
        placeholder: 'scratch/program-design/issue-123.md',
      },
    ],
  }),
  validate: (_launchCtx, variables) => {
    parseText(variables.story, 'story');
    parseText(variables.currentStatePath, 'currentStatePath');
    parseText(variables.architecturePath, 'architecturePath');
    parseText(variables.artifactPath, 'artifactPath');
  },
  init: (launchCtx, variables): State => ({
    stateVersion: 1,
    repositoryPath: launchCtx.worktreePath,
    story: parseText(variables.story, 'story'),
    currentStatePath: parseText(variables.currentStatePath, 'currentStatePath'),
    architecturePath: parseText(variables.architecturePath, 'architecturePath'),
    artifactPath: parseText(variables.artifactPath, 'artifactPath'),
    stage: { kind: 'spawn_writer' },
  }),
  step: async (ctx, state, incoming) => {
    await ctx.log('debug', `Design program stage=${state.stage.kind}.`);

    switch (state.stage.kind) {
      case 'spawn_writer': {
        await ctx.setUiFeedback({ phase: 'Designing program' });
        const agentInput = {
          modifiers: [{ kind: 'skill', name: 'design-program' }],
          prompt: initialWriterPrompt(state),
        } satisfies WorkflowPromptInput;
        const spawned = await ctx.spawnAgentSession({
          harness: writer.harness,
          model: writer.model,
          effort: writer.effort,
          ...agentInput,
        });
        const writerAgent = agentFromSpawn(spawned);
        await logSpawn(ctx, 'writer', writerAgent, writer);
        return suspend(
          withStage(state, {
            kind: 'await_initial_writer',
            writer: writerAgent,
            harnessErrorRetries: 0,
            lastAgentInput: agentInput,
          }),
          wait.agentTurn(spawned),
        );
      }

      case 'await_initial_writer': {
        const ended = await requireEndedTurn(
          ctx,
          state,
          state.stage,
          state.stage.writer,
          incoming,
          'Writer',
        );
        if (!ended.ok) return ended.result;
        const response = await latestTurnOrFail(ctx, state.stage.writer, 'writer');
        if (!response.ok) return response.result;
        return startWriterJudgment(ctx, {
          state: withStage(state, {
            kind: 'await_initial_writer_judgment',
            writer: state.stage.writer,
            writerResponse: response.text,
            mode: 'normal',
          }),
          writerResponse: response.text,
        });
      }

      case 'await_initial_writer_judgment': {
        if (isRetryInvocation(ctx)) return recoverWriterJudgment(ctx, state, state.stage);
        const route = await readWriterJudgment(ctx, incoming);
        if (!route.ok) return route.result;
        if (route.value === 'failed') {
          if (state.stage.mode === 'retry_recheck') {
            return continueWriterAfterRetry(ctx, state, state.stage);
          }
          return failIncompleteWriter(ctx, state.stage.writer, state.stage.writerResponse);
        }
        return spawnReviewer(ctx, state, state.stage.writer);
      }

      case 'await_review': {
        const ended = await requireEndedTurn(
          ctx,
          state,
          state.stage,
          state.stage.reviewer,
          incoming,
          'Reviewer',
        );
        if (!ended.ok) return ended.result;
        const review = await latestTurnOrFail(ctx, state.stage.reviewer, 'reviewer');
        if (!review.ok) return review.result;
        return startReviewerJudgment(ctx, {
          state: withStage(state, {
            kind: 'await_reviewer_judgment',
            writer: state.stage.writer,
            reviewer: state.stage.reviewer,
            review: review.text,
            reviewRound: state.stage.reviewRound,
          }),
          review: review.text,
        });
      }

      case 'await_reviewer_judgment': {
        const route = await readReviewerJudgment(ctx, incoming);
        if (!route.ok) return route.result;
        switch (route.value) {
          case 'complete':
            return finishWorkflow(
              ctx,
              state,
              state.stage.writer,
              state.stage.reviewer,
              state.stage.reviewRound,
            );
          case 'revise':
            return sendReviewToWriter(ctx, state, {
              writer: state.stage.writer,
              reviewer: state.stage.reviewer,
              review: state.stage.review,
              reviewRound: state.stage.reviewRound,
            });
          case 'human-decision': {
            await ctx.setUiFeedback({
              kind: 'warning',
              phase: 'Waiting for your decision',
              message:
                'The reviewer raised a human escalation. Resolve it with the reviewer, then continue the workflow.',
            });
            await ctx.log(
              'warning',
              `Reviewer raised a human escalation in program-design review round ${state.stage.reviewRound}.`,
            );
            return suspend(
              withStage(state, {
                kind: 'await_human_decision',
                writer: state.stage.writer,
                reviewer: state.stage.reviewer,
                reviewRound: state.stage.reviewRound,
              }),
              wait.userContinue(),
            );
          }
          default:
            return assertNever(route.value);
        }
      }

      case 'await_revision': {
        const ended = await requireEndedTurn(
          ctx,
          state,
          state.stage,
          state.stage.writer,
          incoming,
          'Writer',
        );
        if (!ended.ok) return ended.result;
        const response = await latestTurnOrFail(ctx, state.stage.writer, 'writer');
        if (!response.ok) return response.result;
        return startWriterJudgment(ctx, {
          state: withStage(state, {
            kind: 'await_revision_judgment',
            writer: state.stage.writer,
            reviewer: state.stage.reviewer,
            writerResponse: response.text,
            reviewRound: state.stage.reviewRound,
            mode: 'normal',
          }),
          writerResponse: response.text,
        });
      }

      case 'await_revision_judgment': {
        if (isRetryInvocation(ctx)) return recoverWriterJudgment(ctx, state, state.stage);
        const route = await readWriterJudgment(ctx, incoming);
        if (!route.ok) return route.result;
        if (route.value === 'failed') {
          if (state.stage.mode === 'retry_recheck') {
            return continueWriterAfterRetry(ctx, state, state.stage);
          }
          return failIncompleteWriter(ctx, state.stage.writer, state.stage.writerResponse);
        }
        await ctx.setUiFeedback({ phase: 'Re-reviewing program design' });
        const agentInput = {
          prompt: writerToReviewerPrompt(state.stage.writerResponse),
        } satisfies WorkflowPromptInput;
        const sent = await ctx.sendAgentPrompt({
          agentSessionId: state.stage.reviewer.agentSessionId,
          ...agentInput,
        });
        await ctx.log(
          'info',
          `Sent writer response from program-design review round ${state.stage.reviewRound} to reviewer session ${state.stage.reviewer.agentSessionId}.`,
        );
        return suspend(
          withStage(state, {
            kind: 'await_review',
            writer: state.stage.writer,
            reviewer: state.stage.reviewer,
            reviewRound: state.stage.reviewRound + 1,
            harnessErrorRetries: 0,
            lastAgentInput: agentInput,
          }),
          wait.agentTurn(sent),
        );
      }

      case 'await_human_decision': {
        if (!workflowEvent.isUserContinue(incoming)) {
          return failWorkflow(
            ctx,
            'The human decision could not be resumed',
            'The program-design human-decision wait resumed with an unexpected event.',
          );
        }
        const review = await latestTurnOrFail(ctx, state.stage.reviewer, 'reviewer');
        if (!review.ok) return review.result;
        await ctx.log(
          'info',
          `User continued program-design review round ${state.stage.reviewRound}; routing the reviewer session's latest complete turn.`,
        );
        return startReviewerJudgment(ctx, {
          state: withStage(state, {
            kind: 'await_reviewer_judgment',
            writer: state.stage.writer,
            reviewer: state.stage.reviewer,
            review: review.text,
            reviewRound: state.stage.reviewRound,
          }),
          review: review.text,
        });
      }

      default:
        return assertNever(state.stage);
    }
  },
});

type WriterJudgmentStage = Extract<
  Stage,
  { readonly kind: 'await_initial_writer_judgment' | 'await_revision_judgment' }
>;

async function recoverWriterJudgment(
  ctx: WorkflowContext,
  state: State,
  stage: WriterJudgmentStage,
): Promise<WorkflowResult> {
  const history = await ctx.getConversationHistory(stage.writer.agentSessionId);
  const latestResponse = latestAssistantTurnText(history);
  if (latestResponse && latestResponse !== stage.writerResponse) {
    await ctx.log(
      'info',
      `Retry found a newer complete turn in program-design writer session ${stage.writer.agentSessionId}; routing the latest response.`,
    );
    return startWriterJudgment(ctx, {
      state: withStage(state, { ...stage, writerResponse: latestResponse, mode: 'retry_recheck' }),
      writerResponse: latestResponse,
    });
  }
  return continueWriterAfterRetry(ctx, state, stage);
}

async function continueWriterAfterRetry(
  ctx: WorkflowContext,
  state: State,
  stage: WriterJudgmentStage,
): Promise<WorkflowResult> {
  await ctx.setUiFeedback({ phase: 'Recovering program-design writer' });
  const agentInput = { prompt: retryWriterPrompt() } satisfies WorkflowPromptInput;
  const sent = await ctx.sendAgentPrompt({
    agentSessionId: stage.writer.agentSessionId,
    ...agentInput,
  });
  await ctx.log(
    'info',
    `Sent one retry continuation to program-design writer session ${stage.writer.agentSessionId}.`,
  );
  if (stage.kind === 'await_initial_writer_judgment') {
    return suspend(
      withStage(state, {
        kind: 'await_initial_writer',
        writer: stage.writer,
        harnessErrorRetries: 0,
        lastAgentInput: agentInput,
      }),
      wait.agentTurn(sent),
    );
  }
  return suspend(
    withStage(state, {
      kind: 'await_revision',
      writer: stage.writer,
      reviewer: stage.reviewer,
      reviewRound: stage.reviewRound,
      harnessErrorRetries: 0,
      lastAgentInput: agentInput,
    }),
    wait.agentTurn(sent),
  );
}

async function startWriterJudgment(
  ctx: WorkflowContext,
  input: { readonly state: State; readonly writerResponse: string },
): Promise<WorkflowResult> {
  await ctx.setUiFeedback({ phase: 'Checking program-design writer progress' });
  const op = await ctx.runHeadlessAgent({
    harness: writerJudgment.harness,
    model: writerJudgment.model,
    effort: writerJudgment.effort,
    prompt: writerRoutingPrompt({
      writerResponse: input.writerResponse,
      artifactPath: input.state.artifactPath,
    }),
  });
  await ctx.log('info', `Started program-design writer routing judgment ${op.opId}.`);
  return suspend(input.state, wait.headlessAgent(op));
}

async function startReviewerJudgment(
  ctx: WorkflowContext,
  input: { readonly state: State; readonly review: string },
): Promise<WorkflowResult> {
  await ctx.setUiFeedback({ phase: 'Routing program-design review' });
  const op = await ctx.runHeadlessAgent({
    harness: reviewerJudgment.harness,
    model: reviewerJudgment.model,
    effort: reviewerJudgment.effort,
    prompt: reviewerRoutingPrompt({ review: input.review }),
  });
  await ctx.log('info', `Started program-design reviewer routing judgment ${op.opId}.`);
  return suspend(input.state, wait.headlessAgent(op));
}

async function readWriterJudgment(
  ctx: WorkflowContext,
  incoming: unknown,
): Promise<
  | { readonly ok: true; readonly value: WriterRoute }
  | { readonly ok: false; readonly result: WorkflowResult }
> {
  return readJudgment(ctx, incoming, 'writer', parseWriterRoute);
}

async function readReviewerJudgment(
  ctx: WorkflowContext,
  incoming: unknown,
): Promise<
  | { readonly ok: true; readonly value: ReviewerRoute }
  | { readonly ok: false; readonly result: WorkflowResult }
> {
  return readJudgment(ctx, incoming, 'reviewer', parseReviewerRoute);
}

async function readJudgment<Route extends string>(
  ctx: WorkflowContext,
  incoming: unknown,
  label: string,
  parse: (output: string) => Route,
): Promise<
  | { readonly ok: true; readonly value: Route }
  | { readonly ok: false; readonly result: WorkflowResult }
> {
  try {
    const result = completedSingleHeadlessResult(incoming);
    const value = parse(result.output ?? '');
    await ctx.log('info', `program-design ${label} routing outcome=${value}.`);
    return { ok: true, value };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      result: await failWorkflow(
        ctx,
        `The ${label} response could not be routed`,
        `Program-design ${label} routing failed: ${message}`,
      ),
    };
  }
}

async function spawnReviewer(
  ctx: WorkflowContext,
  state: State,
  writerAgent: Agent,
): Promise<WorkflowResult> {
  await ctx.setUiFeedback({ phase: 'Reviewing program design' });
  const agentInput = {
    modifiers: [{ kind: 'skill', name: 'design-program' }],
    prompt: initialReviewerPrompt(state),
  } satisfies WorkflowPromptInput;
  const spawned = await ctx.spawnAgentSession({
    harness: reviewer.harness,
    model: reviewer.model,
    effort: reviewer.effort,
    ...agentInput,
  });
  const reviewerAgent = agentFromSpawn(spawned);
  await logSpawn(ctx, 'reviewer', reviewerAgent, reviewer);
  return suspend(
    withStage(state, {
      kind: 'await_review',
      writer: writerAgent,
      reviewer: reviewerAgent,
      reviewRound: 1,
      harnessErrorRetries: 0,
      lastAgentInput: agentInput,
    }),
    wait.agentTurn(spawned),
  );
}

async function sendReviewToWriter(
  ctx: WorkflowContext,
  state: State,
  input: {
    readonly writer: Agent;
    readonly reviewer: Agent;
    readonly review: string;
    readonly reviewRound: number;
  },
): Promise<WorkflowResult> {
  await ctx.setUiFeedback({ phase: 'Revising program design' });
  const agentInput = {
    prompt: reviewToWriterPrompt(input.review),
  } satisfies WorkflowPromptInput;
  const sent = await ctx.sendAgentPrompt({
    agentSessionId: input.writer.agentSessionId,
    ...agentInput,
  });
  await ctx.log(
    'info',
    `Sent program-design review round ${input.reviewRound} to writer session ${input.writer.agentSessionId}.`,
  );
  return suspend(
    withStage(state, {
      kind: 'await_revision',
      writer: input.writer,
      reviewer: input.reviewer,
      reviewRound: input.reviewRound,
      harnessErrorRetries: 0,
      lastAgentInput: agentInput,
    }),
    wait.agentTurn(sent),
  );
}

async function failIncompleteWriter(
  ctx: WorkflowContext,
  writerAgent: Agent,
  writerResponse: string,
): Promise<WorkflowResult> {
  return failWorkflow(
    ctx,
    'The writer did not produce a reviewable program design',
    `Program-design writer session ${writerAgent.agentSessionId} did not complete its artifact turn. Latest response:\n${writerResponse}`,
  );
}

async function finishWorkflow(
  ctx: WorkflowContext,
  state: State,
  writerAgent: Agent,
  reviewerAgent: Agent,
  reviewCount: number,
): Promise<WorkflowResult> {
  await ctx.setUiFeedback({ phase: 'Program design complete' });
  await ctx.closePane(writerAgent.paneId);
  await ctx.closePane(reviewerAgent.paneId);
  await ctx.log('info', `Program design completed after ${reviewCount} review rounds.`);
  return done({
    outcome: 'artifact-reviewed',
    artifactPath: state.artifactPath,
    reviewCount,
  });
}

async function requireEndedTurn(
  ctx: WorkflowContext,
  state: State,
  stage: AgentTurnStage,
  agent: Agent,
  incoming: unknown,
  role: 'Writer' | 'Reviewer',
): Promise<{ readonly ok: true } | { readonly ok: false; readonly result: WorkflowResult }> {
  if (workflowEvent.isAgentTurnEnded(incoming)) return { ok: true };
  if (workflowEvent.isAgentTurnFailed(incoming)) {
    const retryCount = stage.harnessErrorRetries ?? 0;
    if (incoming.reason === 'harness_error' && retryCount < MAX_HARNESS_ERROR_RETRIES) {
      const lastAgentInput =
        stage.lastAgentInput ?? (await recoverLegacyAgentInput(ctx, state, stage, agent));
      if (!lastAgentInput) {
        return {
          ok: false,
          result: await failWorkflow(
            ctx,
            `${role} turn failed`,
            `${role} turn failed with harness_error, but its previous message could not be recovered.`,
          ),
        };
      }
      await ctx.setUiFeedback({
        kind: 'warning',
        phase: `Retrying program-design ${role.toLowerCase()}`,
        message: `The ${role.toLowerCase()} harness turn failed. Resubmitting its previous message once.`,
      });
      const sent = await ctx.sendAgentPrompt({
        agentSessionId: agent.agentSessionId,
        ...lastAgentInput,
      });
      await ctx.log(
        'warning',
        `Resubmitted the previous message after harness_error ${retryCount + 1}/${MAX_HARNESS_ERROR_RETRIES} to program-design ${role.toLowerCase()} session ${agent.agentSessionId}.`,
      );
      const nextStage = {
        ...stage,
        harnessErrorRetries: retryCount + 1,
        lastAgentInput,
      } satisfies AgentTurnStage;
      return {
        ok: false,
        result: suspend(withStage(state, nextStage), wait.agentTurn(sent)),
      };
    }
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

type AgentTurnStage = Extract<
  Stage,
  { readonly kind: 'await_initial_writer' | 'await_review' | 'await_revision' }
>;

async function recoverLegacyAgentInput(
  ctx: WorkflowContext,
  state: State,
  stage: AgentTurnStage,
  agent: Agent,
): Promise<WorkflowPromptInput | null> {
  if (stage.kind === 'await_initial_writer') {
    return {
      modifiers: [{ kind: 'skill', name: 'design-program' }],
      prompt: initialWriterPrompt(state),
    };
  }
  if (stage.kind === 'await_review' && stage.reviewRound === 1) {
    return {
      modifiers: [{ kind: 'skill', name: 'design-program' }],
      prompt: initialReviewerPrompt(state),
    };
  }
  const history = await ctx.getConversationHistory(agent.agentSessionId);
  const prompt = latestCompleteUserMessageText(history);
  return prompt ? { prompt } : null;
}

function latestCompleteUserMessageText(
  history: Awaited<ReturnType<WorkflowContext['getConversationHistory']>>,
): string | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message?.role !== 'user') continue;
    const text = message.parts
      .filter((part) => part.type === 'text' && part.state !== 'streaming')
      .map((part) => part.text)
      .join('\n')
      .trim();
    if (text) return text;
  }
  return null;
}

async function latestTurnOrFail(
  ctx: WorkflowContext,
  agent: Agent,
  role: 'writer' | 'reviewer',
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
  await ctx.setUiFeedback({
    kind: 'error',
    phase: 'Design program failed',
    message: userMessage,
  });
  await ctx.log('error', diagnostic);
  return fail(diagnostic);
}

async function logSpawn(
  ctx: WorkflowContext,
  role: string,
  agent: Agent,
  profile: { readonly harness: string; readonly model: string; readonly effort: string },
) {
  await ctx.log(
    'info',
    `Spawned program-design ${role} in pane ${agent.paneId}: harness=${profile.harness}, model=${profile.model}, effort=${profile.effort}, agentSessionId=${agent.agentSessionId}.`,
  );
}

function agentFromSpawn(input: {
  readonly agentSessionId: number;
  readonly paneId: number;
}): Agent {
  return { agentSessionId: input.agentSessionId, paneId: input.paneId };
}

function withStage(state: State, stage: Stage): State {
  return { ...state, stage } satisfies State;
}

function parseText(value: unknown, key: string): string {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  throw new Error(`${key} must be non-empty text.`);
}

function assertNever(value: never): never {
  throw new Error(`Unsupported workflow value: ${String(value)}`);
}

function isRetryInvocation(ctx: WorkflowContext): boolean {
  return (
    ctx as WorkflowContext & {
      readonly invocation?: { readonly kind?: unknown } | undefined;
    }
  ).invocation?.kind === 'retry';
}
