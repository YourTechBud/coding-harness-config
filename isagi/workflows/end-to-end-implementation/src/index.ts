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

type WalkthroughResult = {
  readonly outcome: 'story-walkthrough-completed';
  readonly reviewDirectory: string;
  readonly manifestPath: string;
  readonly completedTopicCount: number;
  readonly artifacts: ArtifactPaths;
};

type Stage =
  | { readonly kind: 'start_design' }
  | { readonly kind: 'await_design'; readonly runId: number }
  | { readonly kind: 'start_walkthrough'; readonly design: DesignResult }
  | { readonly kind: 'await_walkthrough'; readonly design: DesignResult; readonly runId: number }
  | { readonly kind: 'start_implementation'; readonly design: DesignResult; readonly walkthrough: WalkthroughResult }
  | { readonly kind: 'await_implementation'; readonly design: DesignResult; readonly walkthrough: WalkthroughResult; readonly runId: number };

type State = {
  readonly stateVersion: 1;
  readonly story: string;
  readonly stage: Stage;
};

type Variables = {
  readonly story?: unknown;
};

const storyRoot = 'scratch/story';

const designPaths = {
  currentStatePath: `${storyRoot}/design/current-state.md`,
  architecturePath: `${storyRoot}/design/architecture.md`,
  programDesignPath: `${storyRoot}/design/program-design.md`,
} satisfies ArtifactPaths;

const reviewDirectory = `${storyRoot}/walkthrough`;
const reviewPaths = {
  currentStatePath: `${reviewDirectory}/current-state.html`,
  architecturePath: `${reviewDirectory}/architecture.html`,
  programDesignPath: `${reviewDirectory}/program-design.html`,
} satisfies ArtifactPaths;
const manifestPath = `${reviewDirectory}/.walkthrough/manifest.json`;

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
    description: 'Design, walk through, plan, and implement one story.',
    inputs: [{ kind: 'text', key: 'story', label: 'Story or story URL' }],
  }),
  validate: (_launchCtx, variables) => {
    parseStory(variables.story);
  },
  init: (_launchCtx, variables): State => ({
    stateVersion: 1,
    story: parseStory(variables.story),
    stage: { kind: 'start_design' },
  }),
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
        const runId = await ctx.startWorkflow('solution-walkthrough-story', {
          story: state.story,
          ...designPaths,
          reviewDirectory,
        });
        await ctx.log('info', `Started solution-walkthrough-story child workflow ${runId}.`);
        return suspend(withStage(state, { kind: 'await_walkthrough', design: state.stage.design, runId }), wait.workflow(runId));
      }

      case 'await_walkthrough': {
        const result = readWalkthroughResult(incoming, state.stage.runId);
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
        await ctx.setUiFeedback({ phase: 'End-to-end implementation complete', message: `Story artifacts are available under ${storyRoot}.` });
        return done({
          outcome: 'end-to-end-implementation-completed',
          story: state.story,
          storyRoot,
          design: state.stage.design,
          walkthrough: state.stage.walkthrough,
          implementation: result.value,
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

function readWalkthroughResult(incoming: unknown, runId: number): ReadResult<WalkthroughResult> {
  const child = readChildResult(incoming, runId, 'solution-walkthrough-story');
  if (!child.ok) return child;
  const record = objectRecord(child.value);
  if (!record || record.outcome !== 'story-walkthrough-completed') return failure(`solution-walkthrough-story child workflow ${runId} returned an invalid outcome.`);
  if (record.reviewDirectory !== reviewDirectory) return failure(`solution-walkthrough-story child workflow ${runId} returned an unexpected review directory.`);
  if (record.manifestPath !== manifestPath) return failure(`solution-walkthrough-story child workflow ${runId} returned an unexpected manifest path.`);
  if (!positiveInteger(record.completedTopicCount)) return failure(`solution-walkthrough-story child workflow ${runId} returned an invalid completed topic count.`);
  if (!samePaths(record.artifacts, reviewPaths)) return failure(`solution-walkthrough-story child workflow ${runId} returned unexpected review artifact paths.`);
  return success({
    outcome: 'story-walkthrough-completed',
    reviewDirectory,
    manifestPath,
    completedTopicCount: record.completedTopicCount as number,
    artifacts: reviewPaths,
  });
}

function readImplementationResult(incoming: unknown, runId: number, story: string): ReadResult<Record<string, unknown>> {
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

function parseStory(value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  throw new Error('story must be non-empty text.');
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
