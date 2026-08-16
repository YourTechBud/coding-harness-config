import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

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

import { planner, plannerJudgment, slugger } from './constants.js';
import {
  completedSingleHeadlessResult,
  latestAssistantTurnText,
  parsePlannerRoute,
  parseSlug,
} from './judgments.js';
import { plannerPrompt, plannerRoutingPrompt, slugPrompt } from './prompts.js';

type Planner = {
  readonly agentSessionId: number;
  readonly paneId: number;
};

type PlanContext = {
  readonly directory: string;
  readonly entryPlanPath: string;
  readonly currentStatePath: string;
  readonly architecturePath: string;
  readonly programDesignPath: string;
};

type ReviewContext = {
  readonly reviewDirectory: string;
  readonly artifacts: {
    readonly currentStatePath: string;
    readonly architecturePath: string;
    readonly programDesignPath: string;
  };
};

type Stage =
  | { readonly kind: 'choose_plan_directory' }
  | { readonly kind: 'await_plan_directory' }
  | { readonly kind: 'start_current_state'; readonly plan: PlanContext }
  | {
      readonly kind: 'await_current_state';
      readonly plan: PlanContext;
      readonly runId: number;
    }
  | { readonly kind: 'start_architecture'; readonly plan: PlanContext }
  | {
      readonly kind: 'await_architecture';
      readonly plan: PlanContext;
      readonly runId: number;
    }
  | { readonly kind: 'start_program_design'; readonly plan: PlanContext }
  | {
      readonly kind: 'await_program_design';
      readonly plan: PlanContext;
      readonly runId: number;
    }
  | { readonly kind: 'start_story_review'; readonly plan: PlanContext }
  | {
      readonly kind: 'await_story_review';
      readonly plan: PlanContext;
      readonly runId: number;
    }
  | { readonly kind: 'request_review_approval'; readonly plan: PlanContext }
  | { readonly kind: 'await_review_approval'; readonly plan: PlanContext }
  | { readonly kind: 'spawn_planner'; readonly plan: PlanContext }
  | {
      readonly kind: 'await_planner';
      readonly plan: PlanContext;
      readonly planner: Planner;
    }
  | {
      readonly kind: 'await_planner_judgment';
      readonly plan: PlanContext;
      readonly planner: Planner;
      readonly plannerResponse: string;
    };

type State = {
  readonly stateVersion: 1;
  readonly repositoryPath: string;
  readonly story: string;
  readonly stage: Stage;
};

type Variables = {
  readonly story?: unknown;
};

export default defineWorkflow<State, Variables>({
  command: () => ({
    title: 'Plan Story',
    description: 'Analyze, design, and create a reviewed-context implementation plan.',
    inputs: [
      {
        kind: 'text',
        key: 'story',
        label: 'Story or story URL',
        placeholder: 'https://github.com/owner/repository/issues/123',
      },
    ],
  }),
  validate: (_launchCtx, variables) => {
    parseText(variables.story, 'story');
  },
  init: (launchCtx, variables): State => ({
    stateVersion: 1,
    repositoryPath: launchCtx.worktreePath,
    story: parseText(variables.story, 'story'),
    stage: { kind: 'choose_plan_directory' },
  }),
  step: async (ctx, state, incoming) => {
    await ctx.log('debug', `Plan story stage=${state.stage.kind}.`);

    switch (state.stage.kind) {
      case 'choose_plan_directory': {
        await ctx.setUiFeedback({ phase: 'Choosing plan directory' });
        const op = await ctx.runHeadlessAgent({
          harness: slugger.harness,
          model: slugger.model,
          effort: slugger.effort,
          prompt: slugPrompt(state),
        });
        await ctx.log('info', `Started plan directory slug operation ${op.opId}.`);
        return suspend(
          withStage(state, { kind: 'await_plan_directory' }),
          wait.headlessAgent(op),
        );
      }

      case 'await_plan_directory': {
        try {
          const result = completedSingleHeadlessResult(incoming);
          const slug = parseSlug(result.output ?? '');
          const plan = choosePlanContext(state.repositoryPath, slug);
          await ctx.log('info', `Selected plan directory ${plan.directory}.`);
          return cont(withStage(state, { kind: 'start_current_state', plan }));
        } catch (error) {
          return failWorkflow(
            ctx,
            'The plan directory could not be selected',
            `Plan directory selection failed: ${errorText(error)}`,
          );
        }
      }

      case 'start_current_state': {
        await ctx.setUiFeedback({ phase: 'Analyzing current state' });
        const runId = await ctx.startWorkflow('analyze-current-state', {
          story: state.story,
          artifactPath: state.stage.plan.currentStatePath,
        });
        await ctx.log('info', `Started analyze-current-state child workflow ${runId}.`);
        return suspend(
          withStage(state, {
            kind: 'await_current_state',
            plan: state.stage.plan,
            runId,
          }),
          wait.workflow(runId),
        );
      }

      case 'await_current_state': {
        const error = childArtifactError(incoming, {
          runId: state.stage.runId,
          workflowKey: 'analyze-current-state',
          expectedPath: state.stage.plan.currentStatePath,
        });
        if (error) {
          return failWorkflow(ctx, 'Current-state analysis failed', error);
        }
        return cont(
          withStage(state, { kind: 'start_architecture', plan: state.stage.plan }),
        );
      }

      case 'start_architecture': {
        await ctx.setUiFeedback({ phase: 'Designing architecture' });
        const runId = await ctx.startWorkflow('design-architecture', {
          story: state.story,
          currentStatePath: state.stage.plan.currentStatePath,
          artifactPath: state.stage.plan.architecturePath,
        });
        await ctx.log('info', `Started design-architecture child workflow ${runId}.`);
        return suspend(
          withStage(state, {
            kind: 'await_architecture',
            plan: state.stage.plan,
            runId,
          }),
          wait.workflow(runId),
        );
      }

      case 'await_architecture': {
        const error = childArtifactError(incoming, {
          runId: state.stage.runId,
          workflowKey: 'design-architecture',
          expectedPath: state.stage.plan.architecturePath,
        });
        if (error) {
          return failWorkflow(ctx, 'Architecture design failed', error);
        }
        return cont(
          withStage(state, { kind: 'start_program_design', plan: state.stage.plan }),
        );
      }

      case 'start_program_design': {
        await ctx.setUiFeedback({ phase: 'Designing program' });
        const runId = await ctx.startWorkflow('design-program', {
          story: state.story,
          currentStatePath: state.stage.plan.currentStatePath,
          architecturePath: state.stage.plan.architecturePath,
          artifactPath: state.stage.plan.programDesignPath,
        });
        await ctx.log('info', `Started design-program child workflow ${runId}.`);
        return suspend(
          withStage(state, {
            kind: 'await_program_design',
            plan: state.stage.plan,
            runId,
          }),
          wait.workflow(runId),
        );
      }

      case 'await_program_design': {
        const error = childArtifactError(incoming, {
          runId: state.stage.runId,
          workflowKey: 'design-program',
          expectedPath: state.stage.plan.programDesignPath,
        });
        if (error) {
          return failWorkflow(ctx, 'Program design failed', error);
        }
        return cont(
          withStage(state, { kind: 'start_story_review', plan: state.stage.plan }),
        );
      }

      case 'start_story_review': {
        await ctx.setUiFeedback({ phase: 'Creating story review artifacts' });
        const review = reviewContext(state.stage.plan);
        const runId = await ctx.startWorkflow('create-story-review-artifacts', {
          story: state.story,
          currentStatePath: state.stage.plan.currentStatePath,
          architecturePath: state.stage.plan.architecturePath,
          programDesignPath: state.stage.plan.programDesignPath,
          reviewDirectory: review.reviewDirectory,
        });
        await ctx.log('info', `Started create-story-review-artifacts child workflow ${runId}.`);
        return suspend(
          withStage(state, {
            kind: 'await_story_review',
            plan: state.stage.plan,
            runId,
          }),
          wait.workflow(runId),
        );
      }

      case 'await_story_review': {
        const error = childStoryReviewError(
          incoming,
          state.stage.runId,
          reviewContext(state.stage.plan),
        );
        if (error) {
          return failWorkflow(ctx, 'Story review artifact creation failed', error);
        }
        return cont(
          withStage(state, {
            kind: 'request_review_approval',
            plan: state.stage.plan,
          }),
        );
      }

      case 'request_review_approval': {
        const review = reviewContext(state.stage.plan);
        await ctx.setUiFeedback({
          phase: 'Awaiting story review',
          message: `Start with ${review.artifacts.currentStatePath}. Review the linked HTML artifacts, update the planning sources if desired, then press Continue to approve implementation planning.`,
        });
        return suspend(
          withStage(state, {
            kind: 'await_review_approval',
            plan: state.stage.plan,
          }),
          wait.userContinue(),
        );
      }

      case 'await_review_approval': {
        if (!workflowEvent.isUserContinue(incoming)) {
          return failWorkflow(
            ctx,
            'Story review approval could not be resumed',
            'Story review approval wait resumed with an unexpected event.',
          );
        }
        return cont(withStage(state, { kind: 'spawn_planner', plan: state.stage.plan }));
      }

      case 'spawn_planner': {
        await ctx.setUiFeedback({ phase: 'Creating implementation plan' });
        const spawned = await ctx.spawnAgentSession({
          harness: planner.harness,
          model: planner.model,
          effort: planner.effort,
          modifiers: [{ kind: 'skill', name: 'create-implementation-plan' }],
          prompt: plannerPrompt({
            repositoryPath: state.repositoryPath,
            story: state.story,
            planDirectory: state.stage.plan.directory,
            entryPlanPath: state.stage.plan.entryPlanPath,
            currentStatePath: state.stage.plan.currentStatePath,
            architecturePath: state.stage.plan.architecturePath,
            programDesignPath: state.stage.plan.programDesignPath,
          }),
        });
        const plannerAgent = agentFromSpawn(spawned);
        await ctx.log(
          'info',
          `Spawned implementation planner in pane ${plannerAgent.paneId}: harness=${planner.harness}, model=${planner.model}, effort=${planner.effort}, agentSessionId=${plannerAgent.agentSessionId}.`,
        );
        return suspend(
          withStage(state, {
            kind: 'await_planner',
            plan: state.stage.plan,
            planner: plannerAgent,
          }),
          wait.agentTurn(spawned),
        );
      }

      case 'await_planner': {
        if (workflowEvent.isAgentTurnFailed(incoming)) {
          return failWorkflow(
            ctx,
            'Implementation-plan writer failed',
            `Implementation-plan writer turn failed: ${incoming.reason}`,
          );
        }
        if (!workflowEvent.isAgentTurnEnded(incoming)) {
          return failWorkflow(
            ctx,
            'The implementation-plan writer could not be resumed',
            'Implementation-plan writer wait resumed with an unexpected event.',
          );
        }
        const history = await ctx.getConversationHistory(state.stage.planner.agentSessionId);
        const plannerResponse = latestAssistantTurnText(history);
        if (!plannerResponse) {
          return failWorkflow(
            ctx,
            'No implementation-plan response was found',
            `Planner session ${state.stage.planner.agentSessionId} has no complete assistant turn to inspect.`,
          );
        }
        const op = await ctx.runHeadlessAgent({
          harness: plannerJudgment.harness,
          model: plannerJudgment.model,
          effort: plannerJudgment.effort,
          prompt: plannerRoutingPrompt({
            plannerResponse,
            entryPlanPath: state.stage.plan.entryPlanPath,
          }),
        });
        await ctx.log('info', `Started implementation-plan routing judgment ${op.opId}.`);
        return suspend(
          withStage(state, {
            kind: 'await_planner_judgment',
            plan: state.stage.plan,
            planner: state.stage.planner,
            plannerResponse,
          }),
          wait.headlessAgent(op),
        );
      }

      case 'await_planner_judgment': {
        try {
          const result = completedSingleHeadlessResult(incoming);
          const route = parsePlannerRoute(result.output ?? '');
          await ctx.log('info', `Implementation-plan routing outcome=${route}.`);
          if (route === 'failed') {
            return failWorkflow(
              ctx,
              'The implementation plan was not completed',
              `Planner session ${state.stage.planner.agentSessionId} did not complete the plan. Latest response:\n${state.stage.plannerResponse}`,
            );
          }
          const validationError = planArtifactError(state.repositoryPath, state.stage.plan);
          if (validationError) {
            return failWorkflow(ctx, 'The implementation plan is incomplete', validationError);
          }
          await ctx.setUiFeedback({
            phase: 'Implementation plan ready',
            message: `Planner remains open in pane ${state.stage.planner.paneId}.`,
          });
          await ctx.log(
            'info',
            `Implementation plan completed at ${state.stage.plan.entryPlanPath}; preserving planner pane ${state.stage.planner.paneId}.`,
          );
          return done({
            outcome: 'implementation-plan-created',
            planDirectory: state.stage.plan.directory,
            entryPlanPath: state.stage.plan.entryPlanPath,
            artifacts: {
              currentStatePath: state.stage.plan.currentStatePath,
              architecturePath: state.stage.plan.architecturePath,
              programDesignPath: state.stage.plan.programDesignPath,
            },
            review: reviewContext(state.stage.plan),
            plannerAgentSessionId: state.stage.planner.agentSessionId,
            plannerPaneId: state.stage.planner.paneId,
          });
        } catch (error) {
          return failWorkflow(
            ctx,
            'The implementation-plan response could not be routed',
            `Implementation-plan routing failed: ${errorText(error)}`,
          );
        }
      }

      default:
        return assertNever(state.stage);
    }
  },
});

function choosePlanContext(repositoryPath: string, slug: string): PlanContext {
  let candidate = slug;
  let suffix = 2;
  while (existsSync(resolve(repositoryPath, 'scratch', 'plans', candidate))) {
    candidate = `${slug}-${suffix}`;
    suffix += 1;
  }
  const directory = `scratch/plans/${candidate}`;
  return {
    directory,
    entryPlanPath: `${directory}/index.md`,
    currentStatePath: `${directory}/artifacts/current-state.md`,
    architecturePath: `${directory}/artifacts/architecture.md`,
    programDesignPath: `${directory}/artifacts/program-design.md`,
  };
}

function reviewContext(plan: PlanContext): ReviewContext {
  const reviewDirectory = `${plan.directory}/review`;
  return {
    reviewDirectory,
    artifacts: {
      currentStatePath: `${reviewDirectory}/current-state.html`,
      architecturePath: `${reviewDirectory}/architecture.html`,
      programDesignPath: `${reviewDirectory}/program-design.html`,
    },
  };
}

function childArtifactError(
  incoming: unknown,
  input: {
    readonly runId: number;
    readonly workflowKey: string;
    readonly expectedPath: string;
  },
): string | null {
  const results = workflowEvent.getWorkflowResults(incoming);
  if (!results) {
    return `${input.workflowKey} wait resumed with a non-workflow event.`;
  }
  if (results.length !== 1) {
    return `${input.workflowKey} expected one child result, received ${results.length}.`;
  }
  const child = results[0];
  if (!child || child.runId !== input.runId) {
    return `${input.workflowKey} resumed with an unexpected child run.`;
  }
  if (child.status !== 'done') {
    return `${input.workflowKey} child workflow ${input.runId} failed: ${errorText(child.error)}`;
  }
  if (!child.result || typeof child.result !== 'object' || Array.isArray(child.result)) {
    return `${input.workflowKey} child workflow ${input.runId} returned no artifact result.`;
  }
  const record = child.result as Record<string, unknown>;
  if (record.outcome !== 'artifact-reviewed') {
    return `${input.workflowKey} child workflow ${input.runId} returned outcome ${String(record.outcome)}.`;
  }
  if (record.artifactPath !== input.expectedPath) {
    return `${input.workflowKey} child workflow ${input.runId} returned artifact path ${String(record.artifactPath)} instead of ${input.expectedPath}.`;
  }
  if (!Number.isInteger(record.reviewCount) || (record.reviewCount as number) < 1) {
    return `${input.workflowKey} child workflow ${input.runId} returned an invalid review count.`;
  }
  return null;
}

function childStoryReviewError(
  incoming: unknown,
  runId: number,
  expected: ReviewContext,
): string | null {
  const workflowKey = 'create-story-review-artifacts';
  const results = workflowEvent.getWorkflowResults(incoming);
  if (!results) {
    return `${workflowKey} wait resumed with a non-workflow event.`;
  }
  if (results.length !== 1) {
    return `${workflowKey} expected one child result, received ${results.length}.`;
  }
  const child = results[0];
  if (!child || child.runId !== runId) {
    return `${workflowKey} resumed with an unexpected child run.`;
  }
  if (child.status !== 'done') {
    return `${workflowKey} child workflow ${runId} failed: ${errorText(child.error)}`;
  }
  if (!child.result || typeof child.result !== 'object' || Array.isArray(child.result)) {
    return `${workflowKey} child workflow ${runId} returned no artifact result.`;
  }
  const record = child.result as Record<string, unknown>;
  if (record.outcome !== 'story-review-artifacts-created') {
    return `${workflowKey} child workflow ${runId} returned outcome ${String(record.outcome)}.`;
  }
  if (record.reviewDirectory !== expected.reviewDirectory) {
    return `${workflowKey} child workflow ${runId} returned review directory ${String(record.reviewDirectory)} instead of ${expected.reviewDirectory}.`;
  }
  if (!record.artifacts || typeof record.artifacts !== 'object' || Array.isArray(record.artifacts)) {
    return `${workflowKey} child workflow ${runId} returned no review artifact paths.`;
  }
  const artifacts = record.artifacts as Record<string, unknown>;
  for (const [key, expectedPath] of Object.entries(expected.artifacts)) {
    if (artifacts[key] !== expectedPath) {
      return `${workflowKey} child workflow ${runId} returned ${key} ${String(artifacts[key])} instead of ${expectedPath}.`;
    }
  }
  return null;
}

function planArtifactError(repositoryPath: string, plan: PlanContext): string | null {
  const entryPath = resolve(repositoryPath, plan.entryPlanPath);
  if (!existsSync(entryPath) || !statSync(entryPath).isFile()) {
    return `Expected implementation-plan entry file ${plan.entryPlanPath} was not created.`;
  }
  const directoryPath = resolve(repositoryPath, plan.directory);
  const phaseFiles = readdirSync(directoryPath).filter((name) =>
    /^phase-\d{2}-.+\.md$/.test(name),
  );
  if (phaseFiles.length === 0) {
    return `Implementation plan ${plan.directory} contains no phase files.`;
  }
  return null;
}

async function failWorkflow(
  ctx: WorkflowContext,
  userMessage: string,
  diagnostic: string,
): Promise<WorkflowResult> {
  await ctx.setUiFeedback({
    kind: 'error',
    phase: 'Plan story failed',
    message: userMessage,
  });
  await ctx.log('error', diagnostic);
  return fail(diagnostic);
}

function agentFromSpawn(input: {
  readonly agentSessionId: number;
  readonly paneId: number;
}): Planner {
  return { agentSessionId: input.agentSessionId, paneId: input.paneId };
}

function withStage(state: State, stage: Stage): State {
  return { ...state, stage } satisfies State;
}

function parseText(value: unknown, key: string): string {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  throw new Error(`${key} must be non-empty text.`);
}

function errorText(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported workflow value: ${String(value)}`);
}
