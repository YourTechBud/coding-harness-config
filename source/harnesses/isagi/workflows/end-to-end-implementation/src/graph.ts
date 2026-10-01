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
  type GraphUpdate,
} from '@yourtechbudstudio/isagi-workflow-sdk';
import {
  ImplementStoryGraph,
  implementStoryParameters,
  type ImplementStoryOutput,
  type ImplementStoryParameters,
} from 'isagi-workflow-implement-story/graph';

import {
  decisionLogPath,
  designPaths,
  entryPlanPath,
  implementationOptions,
  must,
  planDirectory,
  storyRoot,
  uiBriefPath,
  type DeliveryMechanism,
  type DesignSummary,
  type Failure,
  type Familiarity,
  type ImplementationResult,
  type PullRequestChoice,
  type PullRequestResult,
  type TechnicalDepth,
  type WalkthroughResult,
} from './graphs/context.js';
import { DesignGraph, type DesignOutput, type DesignParameters } from './graphs/design.js';
import {
  DocumentationGraph,
  PrepareImplementationGraph,
  type DocumentationParameters,
  type PrepareImplementationParameters,
  type SessionOutput,
} from './graphs/sessions.js';
import { PullRequestGraph, type PullRequestOutput, type PullRequestParameters } from './graphs/submit-pull-request.js';
import { WalkthroughGraph, type WalkthroughOutput, type WalkthroughParameters } from './graphs/walkthrough.js';

export type EndToEndImplementationParameters = {
  readonly story: string;
  readonly familiarity: Familiarity;
  readonly technicalDepth: TechnicalDepth;
  readonly deliveryMechanism: DeliveryMechanism;
  readonly submitPullRequest: PullRequestChoice;
};

export type EndToEndImplementationOutput =
  | {
      readonly outcome: 'end-to-end-implementation-completed';
      readonly story: string;
      readonly storyRoot: string;
      readonly design: DesignSummary;
      readonly walkthrough: WalkthroughResult;
      readonly implementation: ImplementationResult;
      readonly pullRequest: PullRequestResult | null;
    }
  | {
      readonly outcome: 'end-to-end-implementation-stopped';
      readonly reason: 'solution-rejected';
      readonly story: string;
      readonly storyRoot: string;
      readonly design: DesignSummary;
      readonly walkthrough: WalkthroughResult;
    }
  | { readonly outcome: 'failed'; readonly reason: string };

type State = EndToEndImplementationParameters & {
  readonly design: DesignSummary | null;
  readonly walkthrough: WalkthroughResult | null;
  readonly implementation: ImplementationResult | null;
  readonly pullRequest: PullRequestResult | null;
  readonly failure: Failure | null;
};

// Business view: design the story, walk the user through the solution, and on approval prepare,
// implement, document, and optionally submit a pull request. Any phase failure is reported here.
export const EndToEndImplementationGraph = createGraph<State, {}, EndToEndImplementationParameters, EndToEndImplementationOutput>({
  key: 'EndToEndImplementation',
  title: 'End-to-end implementation',
  init: (_destination, parameters) => ({ ...parameters, design: null, walkthrough: null, implementation: null, pullRequest: null, failure: null }),
  state: {
    story: reduce.replace<string>(),
    familiarity: reduce.replace<Familiarity>(),
    technicalDepth: reduce.replace<TechnicalDepth>(),
    deliveryMechanism: reduce.replace<DeliveryMechanism>(),
    submitPullRequest: reduce.replace<PullRequestChoice>(),
    design: reduce.replace<DesignSummary | null>(),
    walkthrough: reduce.replace<WalkthroughResult | null>(),
    implementation: reduce.replace<ImplementationResult | null>(),
    pullRequest: reduce.replace<PullRequestResult | null>(),
    failure: reduce.replace<Failure | null>(),
  },
  entry: 'design',
  nodes: {
    design: subgraph<State, State, DesignParameters, DesignOutput>({
      graph: DesignGraph,
      title: 'Design the story',
      parameters: (state) => ({ story: state.story }),
      onResult: (_state, { output }) => (output.outcome === 'failed' ? { failure: output.failure } : { design: output.design }),
    }),

    walkthrough: subgraph<State, State, WalkthroughParameters, WalkthroughOutput>({
      graph: WalkthroughGraph,
      title: 'Walk through the solution',
      parameters: (state) => ({ story: state.story, familiarity: state.familiarity, technicalDepth: state.technicalDepth, deliveryMechanism: state.deliveryMechanism }),
      onResult: (_state, { output }) => (output.outcome === 'failed' ? { failure: output.failure } : { walkthrough: output.walkthrough }),
    }),

    approveSolution: operation<State, State>(async (ctx, state) => {
      const walkthrough = must(state.walkthrough, 'walkthrough');
      await ctx.setUiFeedback({
        phase: 'Awaiting solution approval',
        message: walkthrough.outcome === 'presentation-reused'
          ? `Review the existing presentation at ${walkthrough.presentationPath}, then approve or reject the proposed solution.`
          : 'Review the walkthrough, then approve or reject the proposed solution.',
      });
      return suspend({
        wait: wait.userInput([{
          kind: 'select',
          key: 'implementationDecision',
          label: 'Approve this solution and begin implementation?',
          options: [
            { value: 'approve', label: 'Approve and implement' },
            { value: 'reject', label: 'Reject and stop' },
          ],
        }]),
      });
    }, { title: 'Approve the solution' }),

    stopSolution: operation<State, State>(async (ctx) => {
      await ctx.setUiFeedback({ phase: 'Solution not approved', message: 'The workflow stopped before changing the implementation plan or source code.' });
      await ctx.log('info', 'The user rejected the proposed solution after the walkthrough; implementation was not started.');
      return complete();
    }, { title: 'Stop before implementation' }),

    prepareImplementation: subgraph<State, State, PrepareImplementationParameters, SessionOutput>({
      graph: PrepareImplementationGraph,
      title: 'Prepare implementation',
      parameters: (state) => ({ story: state.story }),
      onResult: (_state, { output }) => (output.outcome === 'failed' ? { failure: output.failure } : {}),
    }),

    implement: subgraph<State, State, ImplementStoryParameters, ImplementStoryOutput>({
      graph: ImplementStoryGraph,
      title: 'Implement the story',
      parameters: (state) => implementStoryParameters({ story: state.story, ...designPaths, uiBriefPath, planDirectory, entryPlanPath, ...implementationOptions }),
      onResult: (state, { output }) => readImplementationResult(output, state.story),
    }),

    document: subgraph<State, State, DocumentationParameters, SessionOutput>({
      graph: DocumentationGraph,
      title: 'Update documentation',
      parameters: (state) => ({ story: state.story, decisionLogPath: must(state.implementation, 'implementation').implementation.decisionLogPath }),
      onResult: (_state, { output }) => (output.outcome === 'failed' ? { failure: output.failure } : {}),
    }),

    submitPullRequest: subgraph<State, State, PullRequestParameters, PullRequestOutput>({
      graph: PullRequestGraph,
      title: 'Submit the pull request',
      parameters: (state) => ({ story: state.story }),
      onResult: (_state, { output }) => (output.outcome === 'failed' ? { failure: output.failure } : { pullRequest: output.pullRequest }),
    }),

    finish: operation<State, State>(async (ctx, state) => {
      if (state.pullRequest) {
        await ctx.setUiFeedback({ phase: 'End-to-end implementation complete', message: `Pull request ${state.pullRequest.url} is ready against main.` });
        return complete();
      }
      await ctx.setUiFeedback({ phase: 'End-to-end implementation complete', message: 'Implementation is complete; pull-request submission was skipped.' });
      await ctx.log('info', 'Completed end-to-end implementation without submitting a pull request.');
      return complete();
    }, { title: 'Finish' }),

    reportFailure: operation<State, State>(async (ctx, state) => {
      const failure = must(state.failure, 'failure');
      await ctx.setUiFeedback({ kind: 'error', phase: 'End-to-end implementation failed', message: failure.message });
      await ctx.log('error', failure.diagnostic);
      return complete();
    }, { title: 'Report the failure' }),
  },
  edges: {
    afterDesign: afterPhase('design', 'walkthrough'),
    afterWalkthrough: afterPhase('walkthrough', 'approveSolution'),
    afterApproveSolution: edge<State, State>({
      from: 'approveSolution',
      to: ['prepareImplementation', 'stopSolution'],
      choose: (_state, event) => {
        if (event.kind !== 'user_input') throw new Error(`The approval decision resumed with an unexpected ${event.kind} event.`);
        const decision = event.answers.implementationDecision;
        if (decision === 'approve') return { to: 'prepareImplementation' };
        if (decision === 'reject') return { to: 'stopSolution' };
        throw new Error(`Expected approve or reject, received ${String(decision)}.`);
      },
    }),
    afterStopSolution: edge<State, State>({ from: 'stopSolution', to: ['stopped'], choose: () => ({ to: 'stopped' }) }),
    afterPrepareImplementation: afterPhase('prepareImplementation', 'implement'),
    afterImplement: afterPhase('implement', 'document'),
    afterDocument: edge<State, State>({
      from: 'document',
      to: ['reportFailure', 'submitPullRequest', 'finish'],
      choose: (state) => {
        if (state.failure) return { to: 'reportFailure' };
        return { to: state.submitPullRequest === 'yes' ? 'submitPullRequest' : 'finish' };
      },
    }),
    afterSubmitPullRequest: afterPhase('submitPullRequest', 'finish'),
    afterFinish: edge<State, State>({ from: 'finish', to: ['completed'], choose: () => ({ to: 'completed' }) }),
    afterReportFailure: edge<State, State>({ from: 'reportFailure', to: ['failed'], choose: () => ({ to: 'failed' }) }),
  },
  outcomes: {
    completed: outcome({
      kind: 'success',
      title: 'Story delivered',
      output: (state) => ({
        outcome: 'end-to-end-implementation-completed',
        story: state.story,
        storyRoot,
        design: must(state.design, 'design'),
        walkthrough: must(state.walkthrough, 'walkthrough'),
        implementation: must(state.implementation, 'implementation'),
        pullRequest: state.pullRequest,
      }),
    }),
    stopped: outcome({
      kind: 'success',
      title: 'Solution rejected',
      output: (state) => ({
        outcome: 'end-to-end-implementation-stopped',
        reason: 'solution-rejected',
        story: state.story,
        storyRoot,
        design: must(state.design, 'design'),
        walkthrough: must(state.walkthrough, 'walkthrough'),
      }),
    }),
    failed: outcome({ kind: 'failure', title: 'End-to-end implementation failed', output: (state) => ({ outcome: 'failed', reason: must(state.failure, 'failure').diagnostic }) }),
  },
});

function afterPhase(from: string, next: string) {
  return edge<State, State>({ from, to: [next, 'reportFailure'], choose: (state) => ({ to: state.failure ? 'reportFailure' : next }) });
}

// The implemented story must be this story, at this story pack's paths, with every phase complete.
function readImplementationResult(output: ImplementStoryOutput, story: string): GraphUpdate<State> {
  const failed = (diagnostic: string) => ({ failure: { message: 'Story implementation failed', diagnostic } });
  if (output.outcome === 'failed') return failed(`implement-story failed: ${output.reason}`);
  if (output.story !== story) return failed('implement-story returned a different story.');
  const { artifacts, plan, implementation } = output;
  if (artifacts.currentStatePath !== designPaths.currentStatePath || artifacts.architecturePath !== designPaths.architecturePath || artifacts.programDesignPath !== designPaths.programDesignPath) {
    return failed('implement-story returned unexpected artifact paths.');
  }
  if (plan.planDirectory !== planDirectory || plan.entryPlanPath !== entryPlanPath) return failed('implement-story returned unexpected plan paths.');
  if (implementation.entryPlanPath !== entryPlanPath || implementation.decisionLogPath !== decisionLogPath || implementation.phaseCount < 1 || implementation.completedPhaseCount !== implementation.phaseCount) {
    return failed('implement-story returned an invalid implementation result.');
  }
  return {
    implementation: {
      outcome: 'story-implemented',
      story,
      artifacts: designPaths,
      plan: { planDirectory, entryPlanPath },
      plannerAgentSessionId: output.plannerAgentSessionId,
      plannerPaneId: output.plannerPaneId,
      implementation: { entryPlanPath, decisionLogPath, phaseCount: implementation.phaseCount, completedPhaseCount: implementation.completedPhaseCount },
    },
  };
}
