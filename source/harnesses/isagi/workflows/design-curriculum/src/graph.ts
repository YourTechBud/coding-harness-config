import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  complete,
  createGraph,
  edge,
  operation,
  outcome,
  reduce,
} from '@yourtechbudstudio/isagi-workflow-sdk';
import { agentTurn, failStep, ownedPane, type AgentPane, type AgentTurnOutput } from 'isagi-workflow-common-graphs';

import { curriculumDesigner } from './constants.js';
import { readAnalysis, readCurriculum } from './contracts.js';
import { parseInputs, type ParsedInputs, type Variables } from './inputs.js';
import { analysisPrompt, curriculumPrompt } from './prompts.js';
import type { CurriculumAnalysis } from './types.js';

// The launch form and a parent graph both produce these parameters. The repository path is not a
// parameter: every graph works in the run's destination.
export type DesignCurriculumParameters = Omit<ParsedInputs, 'repositoryPath'>;

export type CurriculumCreated = {
  readonly outcome: 'curriculum-created';
  readonly analysisPath: string;
  readonly curriculumPath: string;
  readonly sourceCount: number;
  readonly coverageItemCount: number;
  readonly primaryCoverageCount: number;
  readonly supportingCoverageCount: number;
  readonly referenceCoverageCount: number;
  readonly requiredCoverageCount: number;
  readonly optionalCoverageCount: number;
  readonly omissionCount: number;
  readonly neighborhoodCount: number;
  readonly outcomeCount: number;
  readonly budgetExceptionCount: number;
};

export type DesignCurriculumOutput = CurriculumCreated | { readonly outcome: 'failed'; readonly reason: string };

// Validates the answers against the repository, so call it where file reads are allowed: in `parse`
// or in a parent's operation, never in a subgraph's pure `parameters` mapping.
export function designCurriculumParameters(repositoryPath: string, variables: Variables): DesignCurriculumParameters {
  const { repositoryPath: _repositoryPath, ...parameters } = parseInputs(repositoryPath, variables);
  return parameters;
}

type Failure = { readonly message: string; readonly diagnostic: string };

type State = {
  readonly input: ParsedInputs;
  readonly designer: AgentPane | null;
  readonly turn: AgentTurnOutput | null;
  readonly analysis: CurriculumAnalysis | null;
  readonly created: CurriculumCreated | null;
  readonly failure: Failure | null;
};

export const DesignCurriculumGraph = createGraph<State, {}, DesignCurriculumParameters, DesignCurriculumOutput>({
  key: 'DesignCurriculum',
  title: 'Design curriculum',
  init: (destination, parameters) => ({
    input: { ...parameters, repositoryPath: destination.worktreePath },
    designer: null,
    turn: null,
    analysis: null,
    created: null,
    failure: null,
  }),
  state: {
    input: reduce.replace<ParsedInputs>(),
    designer: reduce.replace<AgentPane | null>(),
    turn: reduce.replace<AgentTurnOutput | null>(),
    analysis: reduce.replace<CurriculumAnalysis | null>(),
    created: reduce.replace<CurriculumCreated | null>(),
    failure: reduce.replace<Failure | null>(),
  },
  entry: 'prepareOutput',
  nodes: {
    prepareOutput: operation<State, State>(async (_ctx, state) => {
      mkdirSync(resolve(state.input.repositoryPath, state.input.paths.outputDirectory), { recursive: true });
      return complete();
    }, { title: 'Prepare the output directory' }),

    analyzeSources: agentTurn<State, State>({
      title: 'Analyze the curriculum sources',
      parameters: (state) => ({
        label: 'Curriculum analysis',
        session: { kind: 'spawn', ...curriculumDesigner },
        prompt: analysisPrompt(state.input),
        feedback: { phase: 'Analyzing curriculum sources' },
      }),
      onResult: (_state, turn) => ({ designer: turn.agent, turn }),
    }),

    // An invalid artifact fails the step: fix it with the designer, then Retry reads it again.
    readAnalysis: operation<State, State>(async (ctx, state) => {
      try {
        const analysis = readAnalysis(state.input.repositoryPath, state.input.learningGoal, state.input.audience, state.input.sources, state.input.paths);
        return complete({ update: { analysis } });
      } catch (error) {
        return failStep(ctx, { phase: 'Curriculum design failed', message: 'The curriculum analysis artifact is invalid. Its pane remains open.' }, errorText(error));
      }
    }, { title: 'Read the curriculum analysis' }),

    designCurriculum: agentTurn<State, State>({
      title: 'Design the curriculum',
      parameters: (state) => ({
        label: 'Curriculum design',
        session: { kind: 'existing', ...must(state.designer, 'designer') },
        prompt: curriculumPrompt(state.input, must(state.analysis, 'analysis')),
        feedback: { phase: 'Designing the curriculum', message: 'Organizing outcomes and coverage obligations.' },
      }),
      onResult: (_state, turn) => ({ turn }),
    }),

    finish: operation<State, State>(async (ctx, state) => {
      const analysis = must(state.analysis, 'analysis');
      let created: CurriculumCreated;
      try {
        const curriculum = readCurriculum(state.input.repositoryPath, state.input.teachingBrief, state.input.paths, analysis);
        const outcomes = curriculum.neighborhoods.flatMap((neighborhood) => neighborhood.outcomes);
        const coverage = outcomes.flatMap((outcome) => outcome.coverage);
        created = {
          outcome: 'curriculum-created',
          analysisPath: state.input.paths.analysisPath,
          curriculumPath: state.input.paths.curriculumPath,
          sourceCount: state.input.sources.length,
          coverageItemCount: analysis.coverageItems.length,
          primaryCoverageCount: coverage.filter(({ role }) => role === 'primary').length,
          supportingCoverageCount: coverage.filter(({ role }) => role === 'supporting').length,
          referenceCoverageCount: coverage.filter(({ role }) => role === 'reference').length,
          requiredCoverageCount: coverage.filter(({ visibility }) => visibility === 'required').length,
          optionalCoverageCount: coverage.filter(({ visibility }) => visibility === 'optional').length,
          omissionCount: curriculum.omissions.length,
          neighborhoodCount: curriculum.neighborhoods.length,
          outcomeCount: outcomes.length,
          budgetExceptionCount: curriculum.cognitionBudget.exceptions.length,
        };
      } catch (error) {
        return failStep(ctx, { phase: 'Curriculum design failed', message: 'The curriculum artifact is invalid. Its pane remains open.' }, errorText(error));
      }
      await ctx.closePane(ownedPane(must(state.designer, 'designer')));
      return complete({ update: { created } });
    }, { title: 'Read the curriculum and close the designer' }),

    reportFailure: operation<State, State>(async (ctx, state) => {
      const failure = must(state.failure, 'failure');
      await ctx.setUiFeedback({ kind: 'error', phase: 'Curriculum design failed', message: failure.message });
      await ctx.log('error', failure.diagnostic);
      return complete();
    }, { title: 'Report the failure' }),
  },
  edges: {
    afterPrepareOutput: edge<State, State>({ from: 'prepareOutput', to: ['analyzeSources'], choose: () => ({ to: 'analyzeSources' }) }),
    afterAnalyzeSources: afterAgentTurn('analyzeSources', 'readAnalysis', 'Curriculum analysis failed because the designer session ended.'),
    afterReadAnalysis: edge<State, State>({ from: 'readAnalysis', to: ['designCurriculum'], choose: () => ({ to: 'designCurriculum' }) }),
    afterDesignCurriculum: afterAgentTurn('designCurriculum', 'finish', 'Curriculum design failed because the designer session ended.'),
    afterFinish: edge<State, State>({ from: 'finish', to: ['created'], choose: () => ({ to: 'created' }) }),
    afterReportFailure: edge<State, State>({ from: 'reportFailure', to: ['failed'], choose: () => ({ to: 'failed' }) }),
  },
  outcomes: {
    created: outcome({ kind: 'success', title: 'Curriculum created', output: (state) => must(state.created, 'created curriculum') }),
    failed: outcome({ kind: 'failure', title: 'Curriculum design failed', output: (state) => ({ outcome: 'failed', reason: must(state.failure, 'failure').diagnostic }) }),
  },
});

function afterAgentTurn(from: string, next: string, message: string) {
  return edge<State, State>({
    from,
    to: [next, 'reportFailure'],
    choose: (state) => {
      const turn = must(state.turn, 'agent turn');
      if (turn.outcome === 'interrupted') return { to: 'reportFailure', update: { failure: { message, diagnostic: turn.reason } } };
      return { to: next };
    },
  });
}

function must<Value>(value: Value | null, label: string): Value {
  if (value === null) throw new Error(`Design curriculum state is missing its ${label}.`);
  return value;
}

function errorText(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}
