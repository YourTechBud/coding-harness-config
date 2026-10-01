import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  complete,
  createGraph,
  edge,
  operation,
  outcome,
  reduce,
  subgraph,
  type EdgeDecision,
  type GraphUpdate,
} from '@yourtechbudstudio/isagi-workflow-sdk';
import { AnalyzeCurrentStateGraph, type AnalyzeCurrentStateParameters } from 'isagi-workflow-analyze-current-state/graph';
import type { ReviewedArtifactOutput } from 'isagi-workflow-common-graphs';
import { DesignArchitectureGraph, type DesignArchitectureParameters } from 'isagi-workflow-design-architecture/graph';
import { DesignProgramGraph, type DesignProgramParameters } from 'isagi-workflow-design-program/graph';

import { designPaths, must, type DesignStepResult, type DesignSummary, type Failed, type Failure } from './context.js';

export type DesignParameters = { readonly story: string };
export type DesignOutput = { readonly outcome: 'designed'; readonly design: DesignSummary } | Failed;

type Step = 'currentState' | 'architecture' | 'programDesign';

type State = {
  readonly repositoryPath: string;
  readonly story: string;
  readonly currentState: DesignStepResult | null;
  readonly architecture: DesignStepResult | null;
  readonly programDesign: DesignStepResult | null;
  readonly failure: Failure | null;
};

const steps: readonly { readonly step: Step; readonly node: string; readonly path: string; readonly workflow: string; readonly ready: string; readonly failed: string }[] = [
  { step: 'currentState', node: 'analyzeCurrentState', path: designPaths.currentStatePath, workflow: 'analyze-current-state', ready: 'Current-state analysis ready', failed: 'Current-state analysis failed' },
  { step: 'architecture', node: 'designArchitecture', path: designPaths.architecturePath, workflow: 'design-architecture', ready: 'Architecture ready', failed: 'Architecture design failed' },
  { step: 'programDesign', node: 'designProgram', path: designPaths.programDesignPath, workflow: 'design-program', ready: 'Program design ready', failed: 'Program design failed' },
];

// Each design artifact that already exists is reused; the missing ones are written and reviewed in
// order, each by its own writer/reviewer workflow.
export const DesignGraph = createGraph<State, {}, DesignParameters, DesignOutput>({
  key: 'EndToEndImplementationDesign',
  title: 'Design the story',
  init: (destination, parameters) => ({ repositoryPath: destination.worktreePath, ...parameters, currentState: null, architecture: null, programDesign: null, failure: null }),
  state: {
    repositoryPath: reduce.replace<string>(),
    story: reduce.replace<string>(),
    currentState: reduce.replace<DesignStepResult | null>(),
    architecture: reduce.replace<DesignStepResult | null>(),
    programDesign: reduce.replace<DesignStepResult | null>(),
    failure: reduce.replace<Failure | null>(),
  },
  entry: 'checkArtifacts',
  nodes: {
    checkArtifacts: operation<State, State>(async (ctx, state) => {
      const reused: Partial<Record<Step, DesignStepResult>> = {};
      for (const each of steps) {
        if (!artifactFileExists(state.repositoryPath, each.path)) continue;
        await ctx.setUiFeedback({ phase: each.ready, message: `Reusing ${each.path}.` });
        await ctx.log('info', `Skipped ${each.workflow} because ${each.path} already exists.`);
        reused[each.step] = { outcome: 'reused' };
      }
      return complete({ update: reused });
    }, { title: 'Reuse existing design artifacts' }),

    analyzeCurrentState: subgraph<State, State, AnalyzeCurrentStateParameters, ReviewedArtifactOutput>({
      graph: AnalyzeCurrentStateGraph,
      title: 'Analyze the current state',
      parameters: (state) => ({ story: state.story, artifactPath: designPaths.currentStatePath }),
      onResult: (_state, { output }) => readArtifactResult(steps[0]!, output),
    }),
    designArchitecture: subgraph<State, State, DesignArchitectureParameters, ReviewedArtifactOutput>({
      graph: DesignArchitectureGraph,
      title: 'Design the architecture',
      parameters: (state) => ({ story: state.story, currentStatePath: designPaths.currentStatePath, artifactPath: designPaths.architecturePath }),
      onResult: (_state, { output }) => readArtifactResult(steps[1]!, output),
    }),
    designProgram: subgraph<State, State, DesignProgramParameters, ReviewedArtifactOutput>({
      graph: DesignProgramGraph,
      title: 'Design the program',
      parameters: (state) => ({ story: state.story, currentStatePath: designPaths.currentStatePath, architecturePath: designPaths.architecturePath, artifactPath: designPaths.programDesignPath }),
      onResult: (_state, { output }) => readArtifactResult(steps[2]!, output),
    }),
  },
  edges: {
    afterCheckArtifacts: edge<State, State>({ from: 'checkArtifacts', to: ['analyzeCurrentState', 'designArchitecture', 'designProgram', 'designed'], choose: nextStep }),
    afterAnalyzeCurrentState: edge<State, State>({ from: 'analyzeCurrentState', to: ['failed', 'designArchitecture', 'designProgram', 'designed'], choose: nextStep }),
    afterDesignArchitecture: edge<State, State>({ from: 'designArchitecture', to: ['failed', 'designProgram', 'designed'], choose: nextStep }),
    afterDesignProgram: edge<State, State>({ from: 'designProgram', to: ['failed', 'designed'], choose: nextStep }),
  },
  outcomes: {
    designed: outcome({
      kind: 'success',
      title: 'Story designed',
      output: (state) => ({
        outcome: 'designed',
        design: { artifacts: designPaths, steps: { currentState: must(state.currentState, 'current state'), architecture: must(state.architecture, 'architecture'), programDesign: must(state.programDesign, 'program design') } },
      }),
    }),
    failed: outcome({ kind: 'failure', title: 'Design failed', output: (state) => ({ outcome: 'failed', failure: must(state.failure, 'failure') }) }),
  },
});

function nextStep(state: State): EdgeDecision<GraphUpdate<State>> {
  if (state.failure) return { to: 'failed' };
  const next = steps.find(({ step }) => state[step] === null);
  return { to: next ? next.node : 'designed' };
}

// A reviewed artifact must be the one this story asked for.
function readArtifactResult(step: (typeof steps)[number], output: ReviewedArtifactOutput): GraphUpdate<State> {
  if (output.outcome === 'failed') return { failure: { message: step.failed, diagnostic: `${step.workflow} failed: ${output.reason}` } };
  if (output.artifactPath !== step.path) return { failure: { message: step.failed, diagnostic: `${step.workflow} returned artifact path ${output.artifactPath} instead of ${step.path}.` } };
  return { [step.step]: { outcome: 'created', reviewCount: output.reviewCount } };
}

function artifactFileExists(repositoryPath: string, artifactPath: string): boolean {
  const absolutePath = resolve(repositoryPath, artifactPath);
  return existsSync(absolutePath) && statSync(absolutePath).isFile();
}
