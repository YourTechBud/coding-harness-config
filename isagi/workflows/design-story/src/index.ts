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

type ReviewCounts = {
  readonly currentState: number;
  readonly architecture: number;
  readonly programDesign: number;
};

type Stage =
  | { readonly kind: 'start_current_state' }
  | { readonly kind: 'await_current_state'; readonly runId: number }
  | { readonly kind: 'start_architecture'; readonly reviewCounts: Pick<ReviewCounts, 'currentState'> }
  | { readonly kind: 'await_architecture'; readonly reviewCounts: Pick<ReviewCounts, 'currentState'>; readonly runId: number }
  | { readonly kind: 'start_program_design'; readonly reviewCounts: Pick<ReviewCounts, 'currentState' | 'architecture'> }
  | { readonly kind: 'await_program_design'; readonly reviewCounts: Pick<ReviewCounts, 'currentState' | 'architecture'>; readonly runId: number };

type State = {
  readonly stateVersion: 1;
  readonly story: string;
  readonly artifacts: ArtifactPaths;
  readonly stage: Stage;
};

type Variables = {
  readonly story?: unknown;
  readonly currentStatePath?: unknown;
  readonly architecturePath?: unknown;
  readonly programDesignPath?: unknown;
};

const defaults = {
  currentStatePath: 'scratch/story/design/current-state.md',
  architecturePath: 'scratch/story/design/architecture.md',
  programDesignPath: 'scratch/story/design/program-design.md',
} satisfies ArtifactPaths;

export default defineWorkflow<State, Variables>({
  command: () => ({
    title: 'Design Story',
    description: 'Analyze the current state and create the architecture and program design for a story.',
    inputs: [
      { kind: 'text', key: 'story', label: 'Story or story URL' },
      { kind: 'text', key: 'currentStatePath', label: 'Current-state output path', default: defaults.currentStatePath },
      { kind: 'text', key: 'architecturePath', label: 'Architecture output path', default: defaults.architecturePath },
      { kind: 'text', key: 'programDesignPath', label: 'Program-design output path', default: defaults.programDesignPath },
    ],
  }),
  validate: (_launchCtx, variables) => {
    parseVariables(variables);
  },
  init: (_launchCtx, variables): State => {
    const parsed = parseVariables(variables);
    return {
      stateVersion: 1,
      story: parsed.story,
      artifacts: parsed.artifacts,
      stage: { kind: 'start_current_state' },
    };
  },
  step: async (ctx, state, incoming) => {
    await ctx.log('debug', `Design story stage=${state.stage.kind}.`);

    switch (state.stage.kind) {
      case 'start_current_state': {
        await ctx.setUiFeedback({ phase: 'Analyzing current state' });
        const runId = await ctx.startWorkflow('analyze-current-state', {
          story: state.story,
          artifactPath: state.artifacts.currentStatePath,
        });
        await ctx.log('info', `Started analyze-current-state child workflow ${runId}.`);
        return suspend(withStage(state, { kind: 'await_current_state', runId }), wait.workflow(runId));
      }

      case 'await_current_state': {
        const result = readArtifactResult(incoming, state.stage.runId, 'analyze-current-state', state.artifacts.currentStatePath);
        if (!result.ok) return failWorkflow(ctx, 'Current-state analysis failed', result.reason);
        return cont(withStage(state, { kind: 'start_architecture', reviewCounts: { currentState: result.reviewCount } }));
      }

      case 'start_architecture': {
        await ctx.setUiFeedback({ phase: 'Designing architecture' });
        const runId = await ctx.startWorkflow('design-architecture', {
          story: state.story,
          currentStatePath: state.artifacts.currentStatePath,
          artifactPath: state.artifacts.architecturePath,
        });
        await ctx.log('info', `Started design-architecture child workflow ${runId}.`);
        return suspend(withStage(state, { kind: 'await_architecture', reviewCounts: state.stage.reviewCounts, runId }), wait.workflow(runId));
      }

      case 'await_architecture': {
        const result = readArtifactResult(incoming, state.stage.runId, 'design-architecture', state.artifacts.architecturePath);
        if (!result.ok) return failWorkflow(ctx, 'Architecture design failed', result.reason);
        return cont(withStage(state, {
          kind: 'start_program_design',
          reviewCounts: { ...state.stage.reviewCounts, architecture: result.reviewCount },
        }));
      }

      case 'start_program_design': {
        await ctx.setUiFeedback({ phase: 'Designing program' });
        const runId = await ctx.startWorkflow('design-program', {
          story: state.story,
          currentStatePath: state.artifacts.currentStatePath,
          architecturePath: state.artifacts.architecturePath,
          artifactPath: state.artifacts.programDesignPath,
        });
        await ctx.log('info', `Started design-program child workflow ${runId}.`);
        return suspend(withStage(state, { kind: 'await_program_design', reviewCounts: state.stage.reviewCounts, runId }), wait.workflow(runId));
      }

      case 'await_program_design': {
        const result = readArtifactResult(incoming, state.stage.runId, 'design-program', state.artifacts.programDesignPath);
        if (!result.ok) return failWorkflow(ctx, 'Program design failed', result.reason);
        const reviewCounts = { ...state.stage.reviewCounts, programDesign: result.reviewCount } satisfies ReviewCounts;
        await ctx.setUiFeedback({ phase: 'Story design complete', message: `Created the story design at ${state.artifacts.currentStatePath}, ${state.artifacts.architecturePath}, and ${state.artifacts.programDesignPath}.` });
        return done({ outcome: 'story-designed', story: state.story, artifacts: state.artifacts, reviewCounts });
      }

      default:
        return assertNever(state.stage);
    }
  },
});

function parseVariables(variables: Variables): { readonly story: string; readonly artifacts: ArtifactPaths } {
  return {
    story: parseText(variables.story, 'story'),
    artifacts: {
      currentStatePath: parsePath(variables.currentStatePath, 'currentStatePath', defaults.currentStatePath),
      architecturePath: parsePath(variables.architecturePath, 'architecturePath', defaults.architecturePath),
      programDesignPath: parsePath(variables.programDesignPath, 'programDesignPath', defaults.programDesignPath),
    },
  };
}

function readArtifactResult(incoming: unknown, runId: number, workflowKey: string, expectedPath: string):
  | { readonly ok: true; readonly reviewCount: number }
  | { readonly ok: false; readonly reason: string } {
  const results = workflowEvent.getWorkflowResults(incoming);
  if (!results) return { ok: false, reason: `${workflowKey} wait resumed with a non-workflow event.` };
  if (results.length !== 1) return { ok: false, reason: `${workflowKey} expected one child result, received ${results.length}.` };
  const child = results[0];
  if (!child || child.runId !== runId) return { ok: false, reason: `${workflowKey} resumed with an unexpected child run.` };
  if (child.status !== 'done') return { ok: false, reason: `${workflowKey} child workflow ${runId} failed: ${errorText(child.error)}` };
  const record = objectRecord(child.result);
  if (!record) return { ok: false, reason: `${workflowKey} child workflow ${runId} returned no artifact result.` };
  if (record.outcome !== 'artifact-reviewed') return { ok: false, reason: `${workflowKey} child workflow ${runId} returned outcome ${String(record.outcome)}.` };
  if (record.artifactPath !== expectedPath) return { ok: false, reason: `${workflowKey} child workflow ${runId} returned artifact path ${String(record.artifactPath)} instead of ${expectedPath}.` };
  if (!Number.isInteger(record.reviewCount) || (record.reviewCount as number) < 1) return { ok: false, reason: `${workflowKey} child workflow ${runId} returned an invalid review count.` };
  return { ok: true, reviewCount: record.reviewCount as number };
}

async function failWorkflow(ctx: WorkflowContext, userMessage: string, diagnostic: string): Promise<WorkflowResult> {
  await ctx.setUiFeedback({ kind: 'error', phase: 'Design story failed', message: userMessage });
  await ctx.log('error', diagnostic);
  return fail(diagnostic);
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

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
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
  throw new Error(`Unsupported design-story stage: ${JSON.stringify(value)}`);
}
