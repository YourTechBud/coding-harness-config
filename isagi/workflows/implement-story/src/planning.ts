import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  complete,
  createGraph,
  edge,
  operation,
  outcome,
  reduce,
  suspend,
  wait,
} from '@yourtechbudstudio/isagi-workflow-sdk';
import { agentTurn, type AgentPane, type AgentTurnOutput } from 'isagi-workflow-common-graphs';

import { planner } from './constants.js';
import type { ArtifactPaths, PlanPaths } from './inputs.js';
import { plannerPrompt } from './prompts.js';

export type PlanningParameters = { readonly story: string; readonly artifacts: ArtifactPaths; readonly plan: PlanPaths };
export type Failure = { readonly message: string; readonly diagnostic: string };
export type PlanningOutput = { readonly outcome: 'ready'; readonly planner: AgentPane } | { readonly outcome: 'failed'; readonly failure: Failure };

type State = {
  readonly repositoryPath: string;
  readonly story: string;
  readonly artifacts: ArtifactPaths;
  readonly plan: PlanPaths;
  readonly turn: AgentTurnOutput | null;
  readonly planner: AgentPane | null;
  /** Set when the plan needs the human to work with the planner before implementation. */
  readonly reconcile: string | null;
  readonly failure: Failure | null;
};

// The planner writes the implementation plan and holds back index.md while it has questions for the
// human. A missing index.md or missing phase files pause so the human can work with the planner, and
// Continue checks the plan files again.
export const PlanningGraph = createGraph<State, {}, PlanningParameters, PlanningOutput>({
  key: 'ImplementStoryPlanning',
  title: 'Create the implementation plan',
  init: (destination, parameters) => ({
    repositoryPath: destination.worktreePath,
    ...parameters,
    turn: null,
    planner: null,
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

    checkPlan: operation<State, State>(async (_ctx, state) => {
      const planError = planArtifactError(state.repositoryPath, state.plan);
      return planError ? complete({ update: { reconcile: planError } }) : complete();
    }, { title: 'Check the plan files' }),

    reconcile: operation<State, State>(async (ctx, state) => {
      const message = must(state.reconcile, 'reconciliation message');
      await ctx.setUiFeedback({ kind: 'warning', phase: 'Planner needs human reconciliation', message });
      await ctx.log('warning', message);
      return suspend({ wait: wait.userContinue() });
    }, { title: 'Reconcile the plan with the planner' }),
  },
  edges: {
    afterWritePlan: edge<State, State>({
      from: 'writePlan',
      to: ['checkPlan', 'failed'],
      choose: (state) => {
        const turn = must(state.turn, 'planner turn');
        if (turn.outcome === 'ended') return { to: 'checkPlan' };
        return { to: 'failed', update: { failure: { message: 'Implementation-plan writer failed', diagnostic: `Implementation-plan writer turn failed: ${turn.reason}` } } };
      },
    }),
    afterCheckPlan: edge<State, State>({ from: 'checkPlan', to: ['reconcile', 'ready'], choose: (state) => ({ to: state.reconcile ? 'reconcile' : 'ready' }) }),
    afterReconcile: edge<State, State>({
      from: 'reconcile',
      to: ['checkPlan'],
      choose: (_state, event) => {
        if (event.kind !== 'user_continue') throw new Error(`Planner reconciliation resumed with an unexpected ${event.kind} event.`);
        return { to: 'checkPlan', update: { reconcile: null } };
      },
    }),
  },
  outcomes: {
    ready: outcome({ kind: 'success', title: 'Plan ready', output: (state) => ({ outcome: 'ready', planner: must(state.planner, 'planner') }) }),
    failed: outcome({ kind: 'failure', title: 'Plan not created', output: (state) => ({ outcome: 'failed', failure: must(state.failure, 'failure') }) }),
  },
});

function planArtifactError(repositoryPath: string, plan: PlanPaths): string | null {
  const entryPath = resolve(repositoryPath, plan.entryPlanPath);
  if (!existsSync(entryPath) || !statSync(entryPath).isFile()) return `The planner has not written ${plan.entryPlanPath}, so it likely has questions for you. Work with the planner until it writes the plan, then select Continue.`;
  const directoryPath = resolve(repositoryPath, plan.planDirectory);
  const phaseFiles = readdirSync(directoryPath).filter((name) => /^phase-\d{2}-.+\.md$/.test(name));
  if (phaseFiles.length === 0) return `Implementation plan ${plan.planDirectory} contains no phase files. Work with the planner until it writes them, then select Continue.`;
  return null;
}

export function must<Value>(value: Value | null, label: string): Value {
  if (value === null) throw new Error(`Implement story state is missing its ${label}.`);
  return value;
}
