import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { cont, done, event as workflowEvent, fail, suspend, wait, type WorkflowContext, type WorkflowResult } from '@yourtechbudstudio/isagi-workflow-sdk';

import { readAnalysis, readCurriculum } from './contracts.js';
import type { ParsedInputs } from './inputs.js';
import { analysisPrompt, curriculumPrompt } from './prompts.js';
import type { CurriculumAnalysis } from './types.js';

const curriculumDesigner = {
  harness: 'codex',
  model: 'gpt-5.6-sol',
  effort: 'medium',
} as const;

type Designer = {
  readonly agentSessionId: number;
  readonly paneId: number;
  readonly sentAt: string;
};

export type Stage =
  | { readonly kind: 'start_analysis' }
  | { readonly kind: 'await_analysis'; readonly designer: Designer }
  | { readonly kind: 'send_curriculum'; readonly designer: Designer; readonly analysis: CurriculumAnalysis }
  | { readonly kind: 'await_curriculum'; readonly designer: Designer; readonly analysis: CurriculumAnalysis };

export type State = {
  readonly stateVersion: 1;
  readonly input: ParsedInputs;
  readonly stage: Stage;
};

export async function step(ctx: WorkflowContext, state: State, incoming: unknown): Promise<WorkflowResult> {
  switch (state.stage.kind) {
    case 'start_analysis': {
      mkdirSync(resolve(state.input.repositoryPath, state.input.paths.outputDirectory), { recursive: true });
      await ctx.setUiFeedback({ phase: 'Analyzing curriculum sources' });
      const designer = await ctx.spawnAgentSession({ ...curriculumDesigner, prompt: analysisPrompt(state.input) });
      return suspend(withStage(state, { kind: 'await_analysis', designer }), wait.agentTurn(designer));
    }
    case 'await_analysis': {
      const error = turnError(incoming, 'Curriculum analysis', state.stage.designer);
      if (error) return failed(ctx, 'Curriculum analysis failed. Its pane remains open.', error);
      try {
        const analysis = readAnalysis(state.input.repositoryPath, state.input.learningGoal, state.input.audience, state.input.sources, state.input.paths);
        return cont(withStage(state, { kind: 'send_curriculum', designer: state.stage.designer, analysis }));
      } catch (error) {
        return failed(ctx, 'The curriculum analysis artifact is invalid. Its pane remains open.', errorText(error));
      }
    }
    case 'send_curriculum': {
      await ctx.setUiFeedback({ phase: 'Designing the curriculum', message: 'Organizing outcomes and coverage obligations.' });
      const sent = await ctx.sendAgentPrompt({ agentSessionId: state.stage.designer.agentSessionId, prompt: curriculumPrompt(state.input, state.stage.analysis) });
      return suspend(withStage(state, { ...state.stage, kind: 'await_curriculum' }), wait.agentTurn(sent));
    }
    case 'await_curriculum': {
      const error = turnError(incoming, 'Curriculum design', state.stage.designer);
      if (error) return failed(ctx, 'Curriculum design failed. Its pane remains open.', error);
      try {
        const curriculum = readCurriculum(state.input.repositoryPath, state.input.teachingBrief, state.input.paths, state.stage.analysis);
        await ctx.closePane(state.stage.designer.paneId);
        const outcomes = curriculum.neighborhoods.flatMap((neighborhood) => neighborhood.outcomes);
        const coverage = outcomes.flatMap((outcome) => outcome.coverage);
        return done({
          outcome: 'curriculum-created',
          analysisPath: state.input.paths.analysisPath,
          curriculumPath: state.input.paths.curriculumPath,
          sourceCount: state.input.sources.length,
          coverageItemCount: state.stage.analysis.coverageItems.length,
          primaryCoverageCount: coverage.filter(({ role }) => role === 'primary').length,
          supportingCoverageCount: coverage.filter(({ role }) => role === 'supporting').length,
          referenceCoverageCount: coverage.filter(({ role }) => role === 'reference').length,
          requiredCoverageCount: coverage.filter(({ visibility }) => visibility === 'required').length,
          optionalCoverageCount: coverage.filter(({ visibility }) => visibility === 'optional').length,
          omissionCount: curriculum.omissions.length,
          neighborhoodCount: curriculum.neighborhoods.length,
          outcomeCount: outcomes.length,
          budgetExceptionCount: curriculum.cognitionBudget.exceptions.length,
        });
      } catch (error) {
        return failed(ctx, 'The curriculum artifact is invalid. Its pane remains open.', errorText(error));
      }
    }
    default:
      return assertNever(state.stage);
  }
}

function turnError(incoming: unknown, label: string, designer: Designer): string | null {
  if (workflowEvent.isAgentTurnFailed(incoming)) return `${label} failed in pane ${designer.paneId}: ${incoming.reason}`;
  if (!workflowEvent.isAgentTurnEnded(incoming)) return `${label} resumed with an unexpected event in pane ${designer.paneId}.`;
  return null;
}

async function failed(ctx: WorkflowContext, message: string, diagnostic: string): Promise<WorkflowResult> {
  await ctx.setUiFeedback({ kind: 'error', phase: 'Curriculum design failed', message });
  await ctx.log('error', diagnostic);
  return fail(diagnostic);
}

function withStage(state: State, stage: Stage): State {
  return { ...state, stage };
}

function errorText(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

function assertNever(value: never): never {
  throw new Error(`Unsupported curriculum workflow stage: ${String(value)}`);
}
