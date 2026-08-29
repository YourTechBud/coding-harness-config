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

import {
  pullRequestAgent,
  pullRequestPrompt,
  readPullRequestResult,
  type PullRequestResult,
} from './pull-request.js';

type ArtifactPaths = {
  readonly currentStatePath: string;
  readonly architecturePath: string;
  readonly programDesignPath: string;
};

type DesignResult = {
  readonly outcome: 'story-designed';
  readonly story: string;
  readonly artifacts: ArtifactPaths;
  readonly reviewCounts: {
    readonly currentState: number;
    readonly architecture: number;
    readonly programDesign: number;
  };
};

type GuidedWalkthroughResult = {
  readonly outcome: 'guided-tutorial-completed';
  readonly curriculumPath: string;
  readonly chapterCount: number;
  readonly beatCount: number;
};

type PresentationWalkthroughResult = {
  readonly outcome: 'presentation-review-completed';
  readonly curriculumPath: string;
  readonly deckPlanPath: string;
  readonly presentationPath: string;
} & ({ readonly chapterCount: number; readonly narrativeUnitCount: number } | { readonly slideCount: number });

type LegacyWalkthroughResult = {
  readonly outcome: 'story-walkthrough-completed';
  readonly reviewDirectory: string;
  readonly manifestPath: string;
  readonly completedTopicCount: number;
  readonly artifacts: ArtifactPaths;
};

type WalkthroughResult = GuidedWalkthroughResult | PresentationWalkthroughResult | LegacyWalkthroughResult;
type ImplementationResult = Record<string, unknown>;

const familiarityLevels = ['new', 'familiar'] as const;
type Familiarity = (typeof familiarityLevels)[number];

const technicalDepthLevels = ['product', 'system-design', 'implementation'] as const;
type TechnicalDepth = (typeof technicalDepthLevels)[number];

const deliveryMechanisms = ['presentation', 'socratic-walkthrough'] as const;
type DeliveryMechanism = (typeof deliveryMechanisms)[number];

type WalkthroughControls = {
  readonly familiarity: Familiarity;
  readonly technicalDepth: TechnicalDepth;
  readonly deliveryMechanism: DeliveryMechanism;
};

const pullRequestChoices = ['yes', 'no'] as const;
type PullRequestChoice = (typeof pullRequestChoices)[number];

type RunControls = WalkthroughControls & {
  readonly submitPullRequest: PullRequestChoice;
};

type Stage =
  | { readonly kind: 'start_design' }
  | { readonly kind: 'await_design'; readonly runId: number }
  | { readonly kind: 'start_walkthrough'; readonly design: DesignResult }
  | { readonly kind: 'await_walkthrough'; readonly design: DesignResult; readonly runId: number }
  | { readonly kind: 'start_implementation'; readonly design: DesignResult; readonly walkthrough: WalkthroughResult }
  | { readonly kind: 'await_implementation'; readonly design: DesignResult; readonly walkthrough: WalkthroughResult; readonly runId: number }
  | { readonly kind: 'start_pull_request'; readonly design: DesignResult; readonly walkthrough: WalkthroughResult; readonly implementation: ImplementationResult }
  | { readonly kind: 'await_pull_request'; readonly design: DesignResult; readonly walkthrough: WalkthroughResult; readonly implementation: ImplementationResult; readonly opId: string };

type LegacyState = {
  readonly stateVersion: 1;
  readonly story: string;
  readonly stage: Stage;
};

type VersionTwoState = {
  readonly stateVersion: 2;
  readonly story: string;
  readonly familiarity: Familiarity;
  readonly technicalDepth: TechnicalDepth;
  readonly presentationMode: boolean;
  readonly stage: Stage;
};

type VersionThreeState = {
  readonly stateVersion: 3;
  readonly story: string;
  readonly familiarity: Familiarity;
  readonly technicalDepth: TechnicalDepth;
  readonly deliveryMechanism: DeliveryMechanism;
  readonly stage: Stage;
};

type State = LegacyState | VersionTwoState | VersionThreeState | {
  readonly stateVersion: 4;
  readonly story: string;
  readonly familiarity: Familiarity;
  readonly technicalDepth: TechnicalDepth;
  readonly deliveryMechanism: DeliveryMechanism;
  readonly submitPullRequest: PullRequestChoice;
  readonly stage: Stage;
};

type Variables = {
  readonly story?: unknown;
  readonly familiarity?: unknown;
  readonly technicalDepth?: unknown;
  readonly deliveryMechanism?: unknown;
  readonly presentationMode?: unknown;
  readonly submitPullRequest?: unknown;
};

const storyRoot = 'scratch/story';

const designPaths = {
  currentStatePath: `${storyRoot}/design/current-state.md`,
  architecturePath: `${storyRoot}/design/architecture.md`,
  programDesignPath: `${storyRoot}/design/program-design.md`,
} satisfies ArtifactPaths;

const reviewDirectory = `${storyRoot}/walkthrough`;
const legacyReviewPaths = {
  currentStatePath: `${reviewDirectory}/current-state.html`,
  architecturePath: `${reviewDirectory}/architecture.html`,
  programDesignPath: `${reviewDirectory}/program-design.html`,
} satisfies ArtifactPaths;
const legacyManifestPath = `${reviewDirectory}/.walkthrough/manifest.json`;
const curriculumPath = `${reviewDirectory}/.walkthrough/curriculum.json`;
const deckPlanPath = `${reviewDirectory}/.walkthrough/deck-plan.json`;
const presentationPath = `${reviewDirectory}/walkthrough.html`;

const planDirectory = `${storyRoot}/implementation`;
const entryPlanPath = `${planDirectory}/index.md`;
const implementationOptions = {
  humanInTheLoop: 'no',
  autoReview: 'yes',
  autoCommit: 'yes',
} as const;

export default defineWorkflow<State, Variables>({
  command: () => ({
    title: 'End-to-End Implementation',
    description: 'Design, walk through, and implement one story, with optional pull-request submission.',
    inputs: [
      { kind: 'text', key: 'story', label: 'Story or story URL' },
      {
        kind: 'select',
        key: 'familiarity',
        label: 'Codebase familiarity',
        options: [
          { value: 'new', label: 'New to this codebase' },
          { value: 'familiar', label: 'Familiar with this codebase' },
        ],
        default: 'new',
      },
      {
        kind: 'select',
        key: 'technicalDepth',
        label: 'Technical depth',
        options: [
          { value: 'product', label: 'Product overview' },
          { value: 'system-design', label: 'System design' },
          { value: 'implementation', label: 'Implementation detail' },
        ],
        default: 'system-design',
      },
      {
        kind: 'select',
        key: 'deliveryMechanism',
        label: 'Walkthrough delivery mechanism?',
        options: [
          { value: 'presentation', label: 'Presentation' },
          { value: 'socratic-walkthrough', label: 'Socratic walkthrough' },
        ],
        default: 'presentation',
      },
      {
        kind: 'select',
        key: 'submitPullRequest',
        label: 'Submit pull request?',
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ],
        default: 'yes',
      },
    ],
  }),
  validate: (_launchCtx, variables) => {
    parseVariables(variables);
  },
  init: (_launchCtx, variables): State => {
    const parsed = parseVariables(variables);
    return {
      stateVersion: 4,
      story: parsed.story,
      familiarity: parsed.familiarity,
      technicalDepth: parsed.technicalDepth,
      deliveryMechanism: parsed.deliveryMechanism,
      submitPullRequest: parsed.submitPullRequest,
      stage: { kind: 'start_design' },
    };
  },
  step: async (ctx, state, incoming) => {
    await ctx.log('debug', `End-to-end implementation stage=${state.stage.kind}.`);

    switch (state.stage.kind) {
      case 'start_design': {
        await ctx.setUiFeedback({ phase: 'Designing story solution' });
        const runId = await ctx.startWorkflow('design-story', {
          story: state.story,
          ...designPaths,
        });
        await ctx.log('info', `Started design-story child workflow ${runId}.`);
        return suspend(withStage(state, { kind: 'await_design', runId }), wait.workflow(runId));
      }

      case 'await_design': {
        const result = readDesignResult(incoming, state.stage.runId, state.story);
        if (!result.ok) return failWorkflow(ctx, 'Story design failed', result.reason);
        return cont(withStage(state, { kind: 'start_walkthrough', design: result.value }));
      }

      case 'start_walkthrough': {
        await ctx.setUiFeedback({ phase: 'Starting solution walkthrough' });
        const controls = walkthroughControls(state);
        const runId = await ctx.startWorkflow('solution-walkthrough-story', {
          story: state.story,
          ...designPaths,
          reviewDirectory,
          ...controls,
        });
        await ctx.log('info', `Started solution-walkthrough-story child workflow ${runId}.`);
        return suspend(withStage(state, { kind: 'await_walkthrough', design: state.stage.design, runId }), wait.workflow(runId));
      }

      case 'await_walkthrough': {
        const result = readWalkthroughResult(incoming, state.stage.runId, walkthroughControls(state).deliveryMechanism, state.stateVersion === 1);
        if (!result.ok) return failWorkflow(ctx, 'Solution walkthrough failed', result.reason);
        return cont(withStage(state, {
          kind: 'start_implementation',
          design: state.stage.design,
          walkthrough: result.value,
        }));
      }

      case 'start_implementation': {
        await ctx.setUiFeedback({ phase: 'Implementing story' });
        const runId = await ctx.startWorkflow('implement-story', {
          story: state.story,
          ...designPaths,
          planDirectory,
          entryPlanPath,
          ...implementationOptions,
        });
        await ctx.log('info', `Started implement-story child workflow ${runId}.`);
        return suspend(withStage(state, {
          kind: 'await_implementation',
          design: state.stage.design,
          walkthrough: state.stage.walkthrough,
          runId,
        }), wait.workflow(runId));
      }

      case 'await_implementation': {
        const result = readImplementationResult(incoming, state.stage.runId, state.story);
        if (!result.ok) return failWorkflow(ctx, 'Story implementation failed', result.reason);
        if (!shouldSubmitPullRequest(state)) {
          await ctx.setUiFeedback({ phase: 'End-to-end implementation complete', message: 'Implementation is complete; pull-request submission was skipped.' });
          await ctx.log('info', 'Completed end-to-end implementation without submitting a pull request.');
          return done({
            outcome: 'end-to-end-implementation-completed',
            story: state.story,
            storyRoot,
            design: state.stage.design,
            walkthrough: state.stage.walkthrough,
            implementation: result.value,
            pullRequest: null,
          });
        }
        return cont(withStage(state, {
          kind: 'start_pull_request',
          design: state.stage.design,
          walkthrough: state.stage.walkthrough,
          implementation: result.value,
        }));
      }

      case 'start_pull_request': {
        await ctx.setUiFeedback({ phase: 'Submitting pull request', message: 'Preparing the description and targeting main.' });
        const op = await ctx.runHeadlessAgent({
          ...pullRequestAgent,
          prompt: pullRequestPrompt({
            worktreePath: ctx.worktreePath,
            story: state.story,
            ...designPaths,
            entryPlanPath,
          }),
        });
        await ctx.log('info', `Started pull-request submission operation ${op.opId} with ${pullRequestAgent.model}.`);
        return suspend(withStage(state, { ...state.stage, kind: 'await_pull_request', opId: op.opId }), wait.headlessAgent(op));
      }

      case 'await_pull_request': {
        let pullRequest: PullRequestResult;
        try {
          pullRequest = readPullRequestResult(incoming, state.stage.opId, state.story);
        } catch (error) {
          return failWorkflow(ctx, 'Pull-request submission failed', errorText(error));
        }
        await ctx.setUiFeedback({ phase: 'End-to-end implementation complete', message: `Pull request ${pullRequest.url} is ready against main.` });
        await ctx.log('info', `Pull request #${pullRequest.number} submitted from ${pullRequest.headBranch} to main: ${pullRequest.url}.`);
        return done({
          outcome: 'end-to-end-implementation-completed',
          story: state.story,
          storyRoot,
          design: state.stage.design,
          walkthrough: state.stage.walkthrough,
          implementation: state.stage.implementation,
          pullRequest,
        });
      }

      default:
        return assertNever(state.stage);
    }
  },
});

function readDesignResult(incoming: unknown, runId: number, story: string): ReadResult<DesignResult> {
  const child = readChildResult(incoming, runId, 'design-story');
  if (!child.ok) return child;
  const record = objectRecord(child.value);
  if (!record || record.outcome !== 'story-designed') return failure(`design-story child workflow ${runId} returned an invalid outcome.`);
  if (record.story !== story) return failure(`design-story child workflow ${runId} returned a different story.`);
  if (!samePaths(record.artifacts, designPaths)) return failure(`design-story child workflow ${runId} returned unexpected artifact paths.`);
  const reviewCounts = objectRecord(record.reviewCounts);
  if (!reviewCounts || !positiveInteger(reviewCounts.currentState) || !positiveInteger(reviewCounts.architecture) || !positiveInteger(reviewCounts.programDesign)) {
    return failure(`design-story child workflow ${runId} returned invalid review counts.`);
  }
  return success({
    outcome: 'story-designed',
    story,
    artifacts: designPaths,
    reviewCounts: {
      currentState: reviewCounts.currentState as number,
      architecture: reviewCounts.architecture as number,
      programDesign: reviewCounts.programDesign as number,
    },
  });
}

function readWalkthroughResult(incoming: unknown, runId: number, deliveryMechanism: DeliveryMechanism, allowLegacyResult: boolean): ReadResult<WalkthroughResult> {
  const child = readChildResult(incoming, runId, 'solution-walkthrough-story');
  if (!child.ok) return child;
  const record = objectRecord(child.value);
  if (!record) return failure(`solution-walkthrough-story child workflow ${runId} returned an invalid result.`);
  if (allowLegacyResult && record.outcome === 'story-walkthrough-completed') {
    if (record.reviewDirectory !== reviewDirectory || record.manifestPath !== legacyManifestPath) return failure(`solution-walkthrough-story child workflow ${runId} returned unexpected legacy review paths.`);
    if (!positiveInteger(record.completedTopicCount) || !samePaths(record.artifacts, legacyReviewPaths)) return failure(`solution-walkthrough-story child workflow ${runId} returned an invalid legacy walkthrough result.`);
    return success({
      outcome: 'story-walkthrough-completed',
      reviewDirectory,
      manifestPath: legacyManifestPath,
      completedTopicCount: record.completedTopicCount as number,
      artifacts: legacyReviewPaths,
    });
  }
  if (record.curriculumPath !== curriculumPath) return failure(`solution-walkthrough-story child workflow ${runId} returned an unexpected curriculum path.`);
  if (deliveryMechanism === 'socratic-walkthrough') {
    if (record.outcome !== 'guided-tutorial-completed') return failure(`solution-walkthrough-story child workflow ${runId} returned an outcome that does not match guided mode.`);
    if (!positiveInteger(record.chapterCount) || !positiveInteger(record.beatCount)) return failure(`solution-walkthrough-story child workflow ${runId} returned invalid guided tutorial counts.`);
    return success({
      outcome: 'guided-tutorial-completed',
      curriculumPath,
      chapterCount: record.chapterCount as number,
      beatCount: record.beatCount as number,
    });
  }
  if (record.outcome !== 'presentation-review-completed') return failure(`solution-walkthrough-story child workflow ${runId} returned an outcome that does not match presentation mode.`);
  if (record.deckPlanPath !== deckPlanPath || record.presentationPath !== presentationPath) return failure(`solution-walkthrough-story child workflow ${runId} returned unexpected presentation paths.`);
  if (positiveInteger(record.chapterCount) && positiveInteger(record.narrativeUnitCount)) {
    return success({
      outcome: 'presentation-review-completed',
      curriculumPath,
      deckPlanPath,
      presentationPath,
      chapterCount: record.chapterCount as number,
      narrativeUnitCount: record.narrativeUnitCount as number,
    });
  }
  if (positiveInteger(record.slideCount)) {
    return success({
      outcome: 'presentation-review-completed',
      curriculumPath,
      deckPlanPath,
      presentationPath,
      slideCount: record.slideCount as number,
    });
  }
  return failure(`solution-walkthrough-story child workflow ${runId} returned invalid presentation counts.`);
}

function readImplementationResult(incoming: unknown, runId: number, story: string): ReadResult<ImplementationResult> {
  const child = readChildResult(incoming, runId, 'implement-story');
  if (!child.ok) return child;
  const record = objectRecord(child.value);
  if (!record || record.outcome !== 'story-implemented') return failure(`implement-story child workflow ${runId} returned an invalid outcome.`);
  if (record.story !== story) return failure(`implement-story child workflow ${runId} returned a different story.`);
  if (!samePaths(record.artifacts, designPaths)) return failure(`implement-story child workflow ${runId} returned unexpected artifact paths.`);
  const plan = objectRecord(record.plan);
  if (!plan || plan.planDirectory !== planDirectory || plan.entryPlanPath !== entryPlanPath) return failure(`implement-story child workflow ${runId} returned unexpected plan paths.`);
  if (!positiveInteger(record.plannerAgentSessionId) || !positiveInteger(record.plannerPaneId)) return failure(`implement-story child workflow ${runId} returned invalid planner identifiers.`);
  const implementation = objectRecord(record.implementation);
  if (!implementation || implementation.entryPlanPath !== entryPlanPath || !positiveInteger(implementation.completedPhaseCount)) {
    return failure(`implement-story child workflow ${runId} returned an invalid implementation result.`);
  }
  return success(record);
}

function readChildResult(incoming: unknown, runId: number, workflowKey: string): ReadResult<unknown> {
  const results = workflowEvent.getWorkflowResults(incoming);
  if (!results) return failure(`${workflowKey} wait resumed with a non-workflow event.`);
  if (results.length !== 1) return failure(`${workflowKey} expected one child result, received ${results.length}.`);
  const child = results[0];
  if (!child || child.runId !== runId) return failure(`${workflowKey} resumed with an unexpected child run.`);
  if (child.status !== 'done') return failure(`${workflowKey} child workflow ${runId} failed: ${errorText(child.error)}`);
  return success(child.result);
}

async function failWorkflow(ctx: WorkflowContext, userMessage: string, diagnostic: string): Promise<WorkflowResult> {
  await ctx.setUiFeedback({ kind: 'error', phase: 'End-to-end implementation failed', message: userMessage });
  await ctx.log('error', diagnostic);
  return fail(diagnostic);
}

function withStage(state: State, stage: Stage): State {
  return { ...state, stage } satisfies State;
}

function parseVariables(variables: Variables): { readonly story: string } & RunControls {
  return {
    story: parseStory(variables.story),
    familiarity: parseEnum(variables.familiarity, 'familiarity', familiarityLevels, 'new'),
    technicalDepth: parseEnum(variables.technicalDepth, 'technicalDepth', technicalDepthLevels, 'system-design'),
    deliveryMechanism: parseDeliveryMechanism(variables.deliveryMechanism, variables.presentationMode),
    submitPullRequest: parseEnum(variables.submitPullRequest, 'submitPullRequest', pullRequestChoices, 'yes'),
  };
}

function walkthroughControls(state: State): WalkthroughControls {
  if (state.stateVersion === 3 || state.stateVersion === 4) {
    return {
      familiarity: state.familiarity,
      technicalDepth: state.technicalDepth,
      deliveryMechanism: state.deliveryMechanism,
    };
  }
  if (state.stateVersion === 2) {
    return {
      familiarity: state.familiarity,
      technicalDepth: state.technicalDepth,
      deliveryMechanism: state.presentationMode ? 'presentation' : 'socratic-walkthrough',
    };
  }
  return { familiarity: 'new', technicalDepth: 'system-design', deliveryMechanism: 'presentation' };
}

function shouldSubmitPullRequest(state: State): boolean {
  return state.stateVersion !== 4 || state.submitPullRequest === 'yes';
}

function parseStory(value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  throw new Error('story must be non-empty text.');
}

function parseEnum<const T extends readonly string[]>(
  value: unknown,
  key: string,
  options: T,
  fallback: T[number],
): T[number] {
  const candidate = value === undefined ? fallback : value;
  if (typeof candidate === 'string' && options.includes(candidate)) return candidate;
  throw new Error(`${key} must be one of ${options.join(', ')}.`);
}

function parseDeliveryMechanism(value: unknown, legacyPresentationMode: unknown): DeliveryMechanism {
  if (value !== undefined) return parseEnum(value, 'deliveryMechanism', deliveryMechanisms, 'presentation');
  if (legacyPresentationMode === undefined) return 'presentation';
  if (typeof legacyPresentationMode === 'boolean') return legacyPresentationMode ? 'presentation' : 'socratic-walkthrough';
  throw new Error('presentationMode must be a boolean.');
}

function samePaths(value: unknown, expected: ArtifactPaths): boolean {
  const record = objectRecord(value);
  return record !== null
    && record.currentStatePath === expected.currentStatePath
    && record.architecturePath === expected.architecturePath
    && record.programDesignPath === expected.programDesignPath;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function positiveInteger(value: unknown): boolean {
  return Number.isInteger(value) && (value as number) > 0;
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
  throw new Error(`Unsupported end-to-end implementation stage: ${JSON.stringify(value)}`);
}
