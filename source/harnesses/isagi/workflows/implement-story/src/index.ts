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

import { planner, plannerJudgment } from './constants.js';
import { completedSingleHeadlessResult, latestAssistantTurnText, parsePlannerRoute } from './judgments.js';
import { plannerPrompt, plannerRoutingPrompt } from './prompts.js';

type YesNo = 'yes' | 'no';

type ImplementationOptions = {
  readonly humanInTheLoop: YesNo;
  readonly autoReview: YesNo;
  readonly autoCommit: YesNo;
};

type ArtifactPaths = {
  readonly currentStatePath: string;
  readonly architecturePath: string;
  readonly programDesignPath: string;
};

type PlanPaths = {
  readonly planDirectory: string;
  readonly entryPlanPath: string;
};

type Planner = {
  readonly agentSessionId: number;
  readonly paneId: number;
};

type ImplementedPlan = {
  readonly entryPlanPath: string;
  readonly decisionLogPath: string;
  readonly phaseCount: number;
  readonly completedPhaseCount: number;
};

type Stage =
  | { readonly kind: 'spawn_planner' }
  | { readonly kind: 'await_planner'; readonly planner: Planner }
  | { readonly kind: 'await_planner_judgment'; readonly planner: Planner; readonly plannerResponse: string }
  | { readonly kind: 'start_implementation'; readonly planner: Planner }
  | { readonly kind: 'await_implementation'; readonly planner: Planner; readonly runId: number };

type State = {
  readonly stateVersion: 1;
  readonly repositoryPath: string;
  readonly story: string;
  readonly artifacts: ArtifactPaths;
  readonly plan: PlanPaths;
  readonly options: ImplementationOptions;
  readonly stage: Stage;
};

type Variables = {
  readonly story?: unknown;
  readonly currentStatePath?: unknown;
  readonly architecturePath?: unknown;
  readonly programDesignPath?: unknown;
  readonly planDirectory?: unknown;
  readonly entryPlanPath?: unknown;
  readonly humanInTheLoop?: unknown;
  readonly autoReview?: unknown;
  readonly autoCommit?: unknown;
};

const defaults = {
  currentStatePath: 'scratch/story/design/current-state.md',
  architecturePath: 'scratch/story/design/architecture.md',
  programDesignPath: 'scratch/story/design/program-design.md',
  planDirectory: 'scratch/story/implementation',
  entryPlanPath: 'scratch/story/implementation/index.md',
};

const humanInTheLoopInput = {
  kind: 'select' as const,
  key: 'humanInTheLoop',
  label: 'Human in the loop',
  options: [
    { value: 'yes', label: 'Yes, pause after each phase' },
    { value: 'no', label: 'No, run through phases' },
  ],
  default: 'yes',
};

const autoReviewInput = {
  kind: 'select' as const,
  key: 'autoReview',
  label: 'Automatic engineering guidance review',
  options: [
    { value: 'yes', label: 'Yes, review every completed phase' },
    { value: 'no', label: 'No, skip automatic review' },
  ],
  default: 'yes',
};

const autoCommitInput = {
  kind: 'select' as const,
  key: 'autoCommit',
  label: 'Automatic commit',
  options: [
    { value: 'yes', label: 'Yes, create a commit after each phase' },
    { value: 'no', label: 'No, leave phase changes uncommitted' },
  ],
  default: 'yes',
};

export default defineWorkflow<State, Variables>({
  command: () => ({
    title: 'Implement Story',
    description: 'Create an implementation plan from a designed story and implement it phase by phase.',
    inputs: [
      { kind: 'text', key: 'story', label: 'Story or story URL' },
      { kind: 'text', key: 'currentStatePath', label: 'Current-state source path', default: defaults.currentStatePath },
      { kind: 'text', key: 'architecturePath', label: 'Architecture source path', default: defaults.architecturePath },
      { kind: 'text', key: 'programDesignPath', label: 'Program-design source path', default: defaults.programDesignPath },
      { kind: 'text', key: 'planDirectory', label: 'Implementation-plan directory', default: defaults.planDirectory },
      { kind: 'text', key: 'entryPlanPath', label: 'Implementation-plan entry path', default: defaults.entryPlanPath },
      humanInTheLoopInput,
      autoReviewInput,
      autoCommitInput,
    ],
  }),
  validate: (_launchCtx, variables) => {
    parseVariables(variables);
  },
  init: (launchCtx, variables): State => {
    const parsed = parseVariables(variables);
    return {
      stateVersion: 1,
      repositoryPath: launchCtx.worktreePath,
      story: parsed.story,
      artifacts: parsed.artifacts,
      plan: parsed.plan,
      options: parsed.options,
      stage: { kind: 'spawn_planner' },
    };
  },
  step: async (ctx, state, incoming) => {
    await ctx.log('debug', `Implement story stage=${state.stage.kind}.`);

    switch (state.stage.kind) {
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
            planDirectory: state.plan.planDirectory,
            entryPlanPath: state.plan.entryPlanPath,
            currentStatePath: state.artifacts.currentStatePath,
            architecturePath: state.artifacts.architecturePath,
            programDesignPath: state.artifacts.programDesignPath,
          }),
        });
        const plannerAgent = agentFromSpawn(spawned);
        await ctx.log('info', `Spawned implementation planner in pane ${plannerAgent.paneId}: harness=${planner.harness}, model=${planner.model}, effort=${planner.effort}, agentSessionId=${plannerAgent.agentSessionId}.`);
        return suspend(withStage(state, { kind: 'await_planner', planner: plannerAgent }), wait.agentTurn(spawned));
      }

      case 'await_planner': {
        if (workflowEvent.isAgentTurnFailed(incoming)) return failWorkflow(ctx, 'Implementation-plan writer failed', `Implementation-plan writer turn failed: ${incoming.reason}`);
        if (!workflowEvent.isAgentTurnEnded(incoming)) return failWorkflow(ctx, 'The implementation-plan writer could not be resumed', 'Implementation-plan writer wait resumed with an unexpected event.');
        const history = await ctx.getConversationHistory(state.stage.planner.agentSessionId);
        const plannerResponse = latestAssistantTurnText(history);
        if (!plannerResponse) return failWorkflow(ctx, 'No implementation-plan response was found', `Planner session ${state.stage.planner.agentSessionId} has no complete assistant turn to inspect.`);
        const op = await ctx.runHeadlessAgent({
          harness: plannerJudgment.harness,
          model: plannerJudgment.model,
          effort: plannerJudgment.effort,
          prompt: plannerRoutingPrompt({ plannerResponse, entryPlanPath: state.plan.entryPlanPath }),
        });
        await ctx.log('info', `Started implementation-plan routing judgment ${op.opId}.`);
        return suspend(withStage(state, { kind: 'await_planner_judgment', planner: state.stage.planner, plannerResponse }), wait.headlessAgent(op));
      }

      case 'await_planner_judgment': {
        try {
          const result = completedSingleHeadlessResult(incoming);
          const route = parsePlannerRoute(result.output ?? '');
          await ctx.log('info', `Implementation-plan routing outcome=${route}.`);
          if (route === 'failed') return failWorkflow(ctx, 'The implementation plan was not completed', `Planner session ${state.stage.planner.agentSessionId} did not complete the plan. Latest response:\n${state.stage.plannerResponse}`);
          const validationError = planArtifactError(state.repositoryPath, state.plan);
          if (validationError) return failWorkflow(ctx, 'The implementation plan is incomplete', validationError);
          return cont(withStage(state, { kind: 'start_implementation', planner: state.stage.planner }));
        } catch (error) {
          return failWorkflow(ctx, 'The implementation-plan response could not be routed', `Implementation-plan routing failed: ${errorText(error)}`);
        }
      }

      case 'start_implementation': {
        await ctx.setUiFeedback({ phase: 'Preparing phase-wise implementation', message: `Plan ready at ${state.plan.entryPlanPath}.` });
        const runId = await ctx.startWorkflow('implement-phase-wise-plan', state.options, { agentSessionId: state.stage.planner.agentSessionId });
        await ctx.log('info', `Started implement-phase-wise-plan child workflow ${runId} with planner session ${state.stage.planner.agentSessionId}.`);
        return suspend(withStage(state, { kind: 'await_implementation', planner: state.stage.planner, runId }), wait.workflow(runId));
      }

      case 'await_implementation': {
        const result = readImplementedPlan(incoming, state.stage.runId, state.plan.entryPlanPath);
        if (!result.ok) return failWorkflow(ctx, 'Story implementation failed', result.reason);
        await ctx.setUiFeedback({ phase: 'Story implemented', message: `Completed ${result.value.completedPhaseCount} phases from ${result.value.entryPlanPath}. Planner remains open in pane ${state.stage.planner.paneId}.` });
        await ctx.log('info', `Story implementation completed from ${result.value.entryPlanPath} with ${result.value.completedPhaseCount}/${result.value.phaseCount} phases; preserving planner pane ${state.stage.planner.paneId}.`);
        return done({
          outcome: 'story-implemented',
          story: state.story,
          artifacts: state.artifacts,
          plan: state.plan,
          plannerAgentSessionId: state.stage.planner.agentSessionId,
          plannerPaneId: state.stage.planner.paneId,
          implementation: result.value,
        });
      }

      default:
        return assertNever(state.stage);
    }
  },
});

function parseVariables(variables: Variables): {
  readonly story: string;
  readonly artifacts: ArtifactPaths;
  readonly plan: PlanPaths;
  readonly options: ImplementationOptions;
} {
  return {
    story: parseText(variables.story, 'story'),
    artifacts: {
      currentStatePath: parsePath(variables.currentStatePath, 'currentStatePath', defaults.currentStatePath),
      architecturePath: parsePath(variables.architecturePath, 'architecturePath', defaults.architecturePath),
      programDesignPath: parsePath(variables.programDesignPath, 'programDesignPath', defaults.programDesignPath),
    },
    plan: {
      planDirectory: parsePath(variables.planDirectory, 'planDirectory', defaults.planDirectory),
      entryPlanPath: parsePath(variables.entryPlanPath, 'entryPlanPath', defaults.entryPlanPath),
    },
    options: {
      humanInTheLoop: parseYesNo(variables.humanInTheLoop, 'humanInTheLoop'),
      autoReview: parseYesNo(variables.autoReview, 'autoReview'),
      autoCommit: parseYesNo(variables.autoCommit, 'autoCommit'),
    },
  };
}

function readImplementedPlan(incoming: unknown, runId: number, expectedEntryPlanPath: string): ReadResult<ImplementedPlan> {
  const child = readSingleChild(incoming, runId, 'implement-phase-wise-plan');
  if (!child.ok) return child;
  const record = objectRecord(child.value);
  if (!record) return failure(`implement-phase-wise-plan child workflow ${runId} returned no implementation result.`);
  const entryPlanPath = nonEmptyString(record.entryPlanPath);
  const decisionLogPath = nonEmptyString(record.decisionLogPath);
  const phases = Array.isArray(record.phases) ? record.phases : null;
  const completedPhaseCount = positiveInteger(record.completedPhaseCount);
  if (entryPlanPath !== expectedEntryPlanPath) return failure(`implement-phase-wise-plan child workflow ${runId} returned entry plan path ${String(record.entryPlanPath)} instead of ${expectedEntryPlanPath}.`);
  if (!decisionLogPath) return failure(`implement-phase-wise-plan child workflow ${runId} returned an invalid decision log path.`);
  if (!phases || phases.length < 1) return failure(`implement-phase-wise-plan child workflow ${runId} returned no implemented phases.`);
  if (completedPhaseCount !== phases.length) return failure(`implement-phase-wise-plan child workflow ${runId} completed ${String(record.completedPhaseCount)} of ${phases.length} phases.`);
  return success({ entryPlanPath, decisionLogPath, phaseCount: phases.length, completedPhaseCount });
}

function readSingleChild(incoming: unknown, runId: number, workflowKey: string): ReadResult<unknown> {
  const results = workflowEvent.getWorkflowResults(incoming);
  if (!results) return failure(`${workflowKey} wait resumed with a non-workflow event.`);
  if (results.length !== 1) return failure(`${workflowKey} expected one child result, received ${results.length}.`);
  const child = results[0];
  if (!child || child.runId !== runId) return failure(`${workflowKey} resumed with an unexpected child run.`);
  if (child.status !== 'done') return failure(`${workflowKey} child workflow ${runId} failed: ${errorText(child.error)}`);
  return success(child.result);
}

function planArtifactError(repositoryPath: string, plan: PlanPaths): string | null {
  const entryPath = resolve(repositoryPath, plan.entryPlanPath);
  if (!existsSync(entryPath) || !statSync(entryPath).isFile()) return `Expected implementation-plan entry file ${plan.entryPlanPath} was not created.`;
  const directoryPath = resolve(repositoryPath, plan.planDirectory);
  const phaseFiles = readdirSync(directoryPath).filter((name) => /^phase-\d{2}-.+\.md$/.test(name));
  if (phaseFiles.length === 0) return `Implementation plan ${plan.planDirectory} contains no phase files.`;
  return null;
}

async function failWorkflow(ctx: WorkflowContext, userMessage: string, diagnostic: string): Promise<WorkflowResult> {
  await ctx.setUiFeedback({ kind: 'error', phase: 'Implement story failed', message: userMessage });
  await ctx.log('error', diagnostic);
  return fail(diagnostic);
}

function agentFromSpawn(input: { readonly agentSessionId: number; readonly paneId: number }): Planner {
  return { agentSessionId: input.agentSessionId, paneId: input.paneId };
}

function withStage(state: State, stage: Stage): State {
  return { ...state, stage } satisfies State;
}

function parseText(value: unknown, key: string): string {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  throw new Error(`${key} must be non-empty text.`);
}

function parsePath(value: unknown, key: string, fallback: string): string {
  if (value === undefined) return fallback;
  return parseText(value, key);
}

function parseYesNo(value: unknown, key: string): YesNo {
  if (value === undefined) return 'yes';
  if (value === 'yes' || value === 'no') return value;
  throw new Error(`${key} must be yes or no.`);
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function positiveInteger(value: unknown): number | null {
  return Number.isInteger(value) && (value as number) > 0 ? value as number : null;
}

type ReadResult<Value> = { readonly ok: true; readonly value: Value } | { readonly ok: false; readonly reason: string };

function success<Value>(value: Value): ReadResult<Value> {
  return { ok: true, value };
}

function failure(reason: string): ReadResult<never> {
  return { ok: false, reason };
}

function errorText(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return 'unknown error';
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported implement-story stage: ${JSON.stringify(value)}`);
}
