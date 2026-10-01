import { existsSync, readdirSync, statSync } from 'node:fs';
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
} from '@yourtechbudstudio/isagi-workflow-sdk';
import {
  agentTurn,
  createJudgmentGraph,
  failStep,
  type AgentPane,
  type AgentTurnOutput,
  type JudgmentOutput,
  type JudgmentParameters,
} from 'isagi-workflow-common-graphs';

import { planner, plannerJudgment } from './constants.js';
import type { ArtifactPaths, PlanPaths } from './inputs.js';
import { latestAssistantTurnText, parsePlannerRoute, type PlannerRoute } from './judgments.js';
import { plannerPrompt, plannerRoutingPrompt } from './prompts.js';

export type PlanningParameters = { readonly story: string; readonly artifacts: ArtifactPaths; readonly plan: PlanPaths };
export type Failure = { readonly message: string; readonly diagnostic: string };
export type PlanningOutput = { readonly outcome: 'ready'; readonly planner: AgentPane } | { readonly outcome: 'failed'; readonly failure: Failure };

const PlannerJudgment = createJudgmentGraph({ key: 'ImplementStoryPlannerJudgment', title: 'Route the planner', parse: parsePlannerRoute });

type State = {
  readonly repositoryPath: string;
  readonly story: string;
  readonly artifacts: ArtifactPaths;
  readonly plan: PlanPaths;
  readonly turn: AgentTurnOutput | null;
  readonly planner: AgentPane | null;
  readonly plannerResponse: string | null;
  readonly route: PlannerRoute | null;
  /** Set when the plan needs the human to work with the planner before implementation. */
  readonly reconcile: string | null;
  readonly failure: Failure | null;
};

// The planner writes the implementation plan. A missing plan, a planner that reports it could not
// finish, or missing phase files pause so the human can reconcile with the planner. After Continue,
// an existing plan entry is trusted.
export const PlanningGraph = createGraph<State, {}, PlanningParameters, PlanningOutput>({
  key: 'ImplementStoryPlanning',
  title: 'Create the implementation plan',
  init: (destination, parameters) => ({
    repositoryPath: destination.worktreePath,
    ...parameters,
    turn: null,
    planner: null,
    plannerResponse: null,
    route: null,
    reconcile: null,
    failure: null,
  }),
  state: {
    repositoryPath: reduce.replace<string>(),
    story: reduce.replace<string>(),
    artifacts: reduce.replace<ArtifactPaths>(),
    plan: reduce.replace<PlanPaths>(),
    turn: reduce.replace<AgentTurnOutput | null>(),
    planner: reduce.replace<AgentPane | null>(),
    plannerResponse: reduce.replace<string | null>(),
    route: reduce.replace<PlannerRoute | null>(),
    reconcile: reduce.replace<string | null>(),
    failure: reduce.replace<Failure | null>(),
  },
  entry: 'writePlan',
  nodes: {
    writePlan: agentTurn<State, State>({
      title: 'Write the implementation plan',
      parameters: (state) => ({
        label: 'Implementation planner',
        session: { kind: 'spawn', ...planner },
        modifiers: [{ kind: 'command', name: 'create-implementation-plan' }],
        prompt: plannerPrompt({
          repositoryPath: state.repositoryPath,
          story: state.story,
          planDirectory: state.plan.planDirectory,
          entryPlanPath: state.plan.entryPlanPath,
          currentStatePath: state.artifacts.currentStatePath,
          architecturePath: state.artifacts.architecturePath,
          programDesignPath: state.artifacts.programDesignPath,
          uiBriefPath: state.artifacts.uiBriefPath,
        }),
        feedback: { phase: 'Creating implementation plan' },
      }),
      onResult: (_state, turn) => ({ turn, planner: turn.agent }),
    }),

    readResponse: operation<State, State>(async (ctx, state) => {
      if (!entryPlanExists(state)) {
        return complete({ update: { reconcile: `Plan entry ${state.plan.entryPlanPath} is missing. Work with the planner to resolve concerns and create the plan, then select Continue.` } });
      }
      const plannerSession = must(state.planner, 'planner');
      const plannerResponse = latestAssistantTurnText(await ctx.getConversationHistory(plannerSession.agentSessionId));
      if (plannerResponse) return complete({ update: { plannerResponse } });
      return failStep(ctx, { phase: 'Implement story failed', message: 'No implementation-plan response was found' }, `Planner session ${plannerSession.agentSessionId} has no complete assistant turn to inspect.`);
    }, { title: "Read the planner's response" }),

    judge: subgraph<State, State, JudgmentParameters, JudgmentOutput<PlannerRoute>>({
      graph: PlannerJudgment,
      title: 'Route the planner response',
      parameters: (state) => ({
        label: 'implementation-plan',
        profile: plannerJudgment,
        prompt: plannerRoutingPrompt({ plannerResponse: must(state.plannerResponse, 'planner response'), entryPlanPath: state.plan.entryPlanPath }),
      }),
      // A rejudge reads the planner's latest response again before routing it.
      onResult: (_state, { output }) => ({ route: output.outcome === 'judged' ? output.route : null }),
    }),

    validate: operation<State, State>(async (ctx, state) => {
      const route = must(state.route, 'planner route');
      await ctx.log('info', `Implementation-plan routing outcome=${route}.`);
      if (route === 'failed') {
        return complete({ update: { reconcile: `Resolve the planner's concerns and finish the plan, then select Continue. Planner response:\n${must(state.plannerResponse, 'planner response')}` } });
      }
      const validationError = planArtifactError(state.repositoryPath, state.plan);
      return validationError ? complete({ update: { reconcile: validationError } }) : complete();
    }, { title: 'Check the plan files' }),

    reconcile: operation<State, State>(async (ctx, state) => {
      const message = must(state.reconcile, 'reconciliation message');
      await ctx.setUiFeedback({ kind: 'warning', phase: 'Planner needs human reconciliation', message });
      await ctx.log('warning', message);
      return suspend({ wait: wait.userContinue() });
    }, { title: 'Reconcile the plan with the planner' }),

    recheckPlan: operation<State, State>(async (_ctx, state) => {
      if (entryPlanExists(state)) return complete();
      return complete({ update: { reconcile: `Plan entry ${state.plan.entryPlanPath} is still missing. Talk to the planner to ensure it is created, then select Continue.` } });
    }, { title: 'Check the plan entry again' }),
  },
  edges: {
    afterWritePlan: edge<State, State>({
      from: 'writePlan',
      to: ['readResponse', 'failed'],
      choose: (state) => {
        const turn = must(state.turn, 'planner turn');
        if (turn.outcome === 'ended') return { to: 'readResponse' };
        return { to: 'failed', update: { failure: { message: 'Implementation-plan writer failed', diagnostic: `Implementation-plan writer turn failed: ${turn.reason}` } } };
      },
    }),
    afterReadResponse: edge<State, State>({ from: 'readResponse', to: ['reconcile', 'judge'], choose: (state) => ({ to: state.reconcile ? 'reconcile' : 'judge' }) }),
    afterJudge: edge<State, State>({ from: 'judge', to: ['validate', 'readResponse'], choose: (state) => ({ to: state.route === null ? 'readResponse' : 'validate' }) }),
    afterValidate: edge<State, State>({ from: 'validate', to: ['reconcile', 'ready'], choose: (state) => ({ to: state.reconcile ? 'reconcile' : 'ready' }) }),
    afterReconcile: edge<State, State>({
      from: 'reconcile',
      to: ['recheckPlan'],
      choose: (_state, event) => {
        if (event.kind !== 'user_continue') throw new Error(`Planner reconciliation resumed with an unexpected ${event.kind} event.`);
        return { to: 'recheckPlan', update: { reconcile: null } };
      },
    }),
    afterRecheckPlan: edge<State, State>({ from: 'recheckPlan', to: ['reconcile', 'ready'], choose: (state) => ({ to: state.reconcile ? 'reconcile' : 'ready' }) }),
  },
  outcomes: {
    ready: outcome({ kind: 'success', title: 'Plan ready', output: (state) => ({ outcome: 'ready', planner: must(state.planner, 'planner') }) }),
    failed: outcome({ kind: 'failure', title: 'Plan not created', output: (state) => ({ outcome: 'failed', failure: must(state.failure, 'failure') }) }),
  },
});

function entryPlanExists(state: { readonly repositoryPath: string; readonly plan: PlanPaths }): boolean {
  const path = resolve(state.repositoryPath, state.plan.entryPlanPath);
  return existsSync(path) && statSync(path).isFile();
}

function planArtifactError(repositoryPath: string, plan: PlanPaths): string | null {
  const entryPath = resolve(repositoryPath, plan.entryPlanPath);
  if (!existsSync(entryPath) || !statSync(entryPath).isFile()) return `Expected implementation-plan entry file ${plan.entryPlanPath} was not created.`;
  const directoryPath = resolve(repositoryPath, plan.planDirectory);
  const phaseFiles = readdirSync(directoryPath).filter((name) => /^phase-\d{2}-.+\.md$/.test(name));
  if (phaseFiles.length === 0) return `Implementation plan ${plan.planDirectory} contains no phase files.`;
  return null;
}

export function must<Value>(value: Value | null, label: string): Value {
  if (value === null) throw new Error(`Implement story state is missing its ${label}.`);
  return value;
}
