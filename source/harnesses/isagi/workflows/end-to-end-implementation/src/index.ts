import { existsSync, rmSync, statSync } from 'node:fs';
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

type DesignStepResult =
  | { readonly outcome: 'created'; readonly reviewCount: number }
  | { readonly outcome: 'reused' };

type DesignSteps = {
  readonly currentState: DesignStepResult;
  readonly architecture: DesignStepResult;
  readonly programDesign: DesignStepResult;
};

type DesignSummary = {
  readonly artifacts: ArtifactPaths;
  readonly steps: DesignSteps;
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
  readonly chapterCount: number;
  readonly narrativeUnitCount: number;
};

type ReusedWalkthroughResult = {
  readonly outcome: 'solution-walkthrough-reused';
  readonly reviewDirectory: string;
  readonly walkthroughDirectory: string;
  readonly presentationPath: string;
  readonly reusedArtifacts: readonly ('walkthrough-directory' | 'presentation')[];
};

type WalkthroughResult = GuidedWalkthroughResult | PresentationWalkthroughResult | ReusedWalkthroughResult;
type ImplementationResult = {
  readonly outcome: 'story-implemented';
  readonly story: string;
  readonly artifacts: ArtifactPaths;
  readonly plan: {
    readonly planDirectory: string;
    readonly entryPlanPath: string;
  };
  readonly plannerAgentSessionId: number;
  readonly plannerPaneId: number;
  readonly implementation: {
    readonly entryPlanPath: string;
    readonly decisionLogPath: string;
    readonly phaseCount: number;
    readonly completedPhaseCount: number;
  };
};

const familiarityLevels = ['new', 'familiar'] as const;
type Familiarity = (typeof familiarityLevels)[number];

const technicalDepthLevels = ['product', 'system-design', 'implementation'] as const;
type TechnicalDepth = (typeof technicalDepthLevels)[number];

const deliveryMechanisms = ['presentation', 'socratic-walkthrough'] as const;
type DeliveryMechanism = (typeof deliveryMechanisms)[number];

const pullRequestChoices = ['yes', 'no'] as const;
type PullRequestChoice = (typeof pullRequestChoices)[number];

type RunControls = {
  readonly familiarity: Familiarity;
  readonly technicalDepth: TechnicalDepth;
  readonly deliveryMechanism: DeliveryMechanism;
  readonly submitPullRequest: PullRequestChoice;
};

type Stage =
  | { readonly kind: 'start_current_state' }
  | { readonly kind: 'await_current_state'; readonly runId: number }
  | { readonly kind: 'start_architecture'; readonly designSteps: Pick<DesignSteps, 'currentState'> }
  | { readonly kind: 'await_architecture'; readonly designSteps: Pick<DesignSteps, 'currentState'>; readonly runId: number }
  | { readonly kind: 'start_program_design'; readonly designSteps: Pick<DesignSteps, 'currentState' | 'architecture'> }
  | { readonly kind: 'await_program_design'; readonly designSteps: Pick<DesignSteps, 'currentState' | 'architecture'>; readonly runId: number }
  | { readonly kind: 'start_walkthrough'; readonly design: DesignSummary }
  | { readonly kind: 'await_walkthrough'; readonly design: DesignSummary; readonly runId: number }
  | { readonly kind: 'reset_implementation_plan'; readonly design: DesignSummary; readonly walkthrough: WalkthroughResult }
  | { readonly kind: 'start_implementation'; readonly design: DesignSummary; readonly walkthrough: WalkthroughResult }
  | { readonly kind: 'await_implementation'; readonly design: DesignSummary; readonly walkthrough: WalkthroughResult; readonly runId: number }
  | { readonly kind: 'start_pull_request'; readonly design: DesignSummary; readonly walkthrough: WalkthroughResult; readonly implementation: ImplementationResult }
  | { readonly kind: 'await_pull_request'; readonly design: DesignSummary; readonly walkthrough: WalkthroughResult; readonly implementation: ImplementationResult; readonly opId: string };

type State = {
  readonly stateVersion: 1;
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
  readonly submitPullRequest?: unknown;
};

const storyRoot = 'scratch/story';

const designPaths = {
  currentStatePath: `${storyRoot}/design/current-state.md`,
  architecturePath: `${storyRoot}/design/architecture.md`,
  programDesignPath: `${storyRoot}/design/program-design.md`,
} satisfies ArtifactPaths;

const reviewDirectory = `${storyRoot}/walkthrough`;
const walkthroughDirectory = `${reviewDirectory}/.walkthrough`;
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
      stateVersion: 1,
      story: parsed.story,
      familiarity: parsed.familiarity,
      technicalDepth: parsed.technicalDepth,
      deliveryMechanism: parsed.deliveryMechanism,
      submitPullRequest: parsed.submitPullRequest,
      stage: { kind: 'start_current_state' },
    };
  },
  step: async (ctx, state, incoming) => {
    await ctx.log('debug', `End-to-end implementation stage=${state.stage.kind}.`);

    switch (state.stage.kind) {
      case 'start_current_state': {
        if (artifactFileExists(ctx.worktreePath, designPaths.currentStatePath)) {
          await ctx.setUiFeedback({ phase: 'Current-state analysis ready', message: `Reusing ${designPaths.currentStatePath}.` });
          await ctx.log('info', `Skipped analyze-current-state because ${designPaths.currentStatePath} already exists.`);
          return cont(withStage(state, { kind: 'start_architecture', designSteps: { currentState: { outcome: 'reused' } } }));
        }
        await ctx.setUiFeedback({ phase: 'Analyzing current state' });
        const runId = await ctx.startWorkflow('analyze-current-state', {
          story: state.story,
          artifactPath: designPaths.currentStatePath,
        });
        await ctx.log('info', `Started analyze-current-state child workflow ${runId}.`);
        return suspend(withStage(state, { kind: 'await_current_state', runId }), wait.workflow(runId));
      }

      case 'await_current_state': {
        const result = readArtifactResult(incoming, state.stage.runId, 'analyze-current-state', designPaths.currentStatePath);
        if (!result.ok) return failWorkflow(ctx, 'Current-state analysis failed', result.reason);
        return cont(withStage(state, {
          kind: 'start_architecture',
          designSteps: { currentState: { outcome: 'created', reviewCount: result.value } },
        }));
      }

      case 'start_architecture': {
        if (artifactFileExists(ctx.worktreePath, designPaths.architecturePath)) {
          await ctx.setUiFeedback({ phase: 'Architecture ready', message: `Reusing ${designPaths.architecturePath}.` });
          await ctx.log('info', `Skipped design-architecture because ${designPaths.architecturePath} already exists.`);
          return cont(withStage(state, {
            kind: 'start_program_design',
            designSteps: { ...state.stage.designSteps, architecture: { outcome: 'reused' } },
          }));
        }
        await ctx.setUiFeedback({ phase: 'Designing architecture' });
        const runId = await ctx.startWorkflow('design-architecture', {
          story: state.story,
          currentStatePath: designPaths.currentStatePath,
          artifactPath: designPaths.architecturePath,
        });
        await ctx.log('info', `Started design-architecture child workflow ${runId}.`);
        return suspend(withStage(state, {
          kind: 'await_architecture',
          designSteps: state.stage.designSteps,
          runId,
        }), wait.workflow(runId));
      }

      case 'await_architecture': {
        const result = readArtifactResult(incoming, state.stage.runId, 'design-architecture', designPaths.architecturePath);
        if (!result.ok) return failWorkflow(ctx, 'Architecture design failed', result.reason);
        return cont(withStage(state, {
          kind: 'start_program_design',
          designSteps: { ...state.stage.designSteps, architecture: { outcome: 'created', reviewCount: result.value } },
        }));
      }

      case 'start_program_design': {
        if (artifactFileExists(ctx.worktreePath, designPaths.programDesignPath)) {
          await ctx.setUiFeedback({ phase: 'Program design ready', message: `Reusing ${designPaths.programDesignPath}.` });
          await ctx.log('info', `Skipped design-program because ${designPaths.programDesignPath} already exists.`);
          const designSteps = { ...state.stage.designSteps, programDesign: { outcome: 'reused' } } satisfies DesignSteps;
          return cont(withStage(state, { kind: 'start_walkthrough', design: designSummary(designSteps) }));
        }
        await ctx.setUiFeedback({ phase: 'Designing program' });
        const runId = await ctx.startWorkflow('design-program', {
          story: state.story,
          currentStatePath: designPaths.currentStatePath,
          architecturePath: designPaths.architecturePath,
          artifactPath: designPaths.programDesignPath,
        });
        await ctx.log('info', `Started design-program child workflow ${runId}.`);
        return suspend(withStage(state, {
          kind: 'await_program_design',
          designSteps: state.stage.designSteps,
          runId,
        }), wait.workflow(runId));
      }

      case 'await_program_design': {
        const result = readArtifactResult(incoming, state.stage.runId, 'design-program', designPaths.programDesignPath);
        if (!result.ok) return failWorkflow(ctx, 'Program design failed', result.reason);
        const designSteps = { ...state.stage.designSteps, programDesign: { outcome: 'created', reviewCount: result.value } } satisfies DesignSteps;
        return cont(withStage(state, { kind: 'start_walkthrough', design: designSummary(designSteps) }));
      }

      case 'start_walkthrough': {
        const reused = reusedWalkthrough(ctx.worktreePath);
        if (reused) {
          await ctx.setUiFeedback({ phase: 'Solution walkthrough ready', message: `Reusing walkthrough artifacts under ${reviewDirectory}.` });
          await ctx.log('info', `Skipped solution-walkthrough-story because these walkthrough artifacts already exist: ${reused.reusedArtifacts.join(', ')}.`);
          return cont(withStage(state, {
            kind: 'reset_implementation_plan',
            design: state.stage.design,
            walkthrough: reused,
          }));
        }
        await ctx.setUiFeedback({ phase: 'Starting solution walkthrough' });
        const runId = await ctx.startWorkflow('solution-walkthrough-story', {
          story: state.story,
          ...designPaths,
          reviewDirectory,
          familiarity: state.familiarity,
          technicalDepth: state.technicalDepth,
          deliveryMechanism: state.deliveryMechanism,
        });
        await ctx.log('info', `Started solution-walkthrough-story child workflow ${runId}.`);
        return suspend(withStage(state, { kind: 'await_walkthrough', design: state.stage.design, runId }), wait.workflow(runId));
      }

      case 'await_walkthrough': {
        const result = readWalkthroughResult(incoming, state.stage.runId, state.deliveryMechanism);
        if (!result.ok) return failWorkflow(ctx, 'Solution walkthrough failed', result.reason);
        return cont(withStage(state, {
          kind: 'reset_implementation_plan',
          design: state.stage.design,
          walkthrough: result.value,
        }));
      }

      case 'reset_implementation_plan': {
        await ctx.setUiFeedback({ phase: 'Preparing implementation plan' });
        try {
          const removed = removeImplementationPlan(ctx.worktreePath);
          await ctx.log('info', removed
            ? `Removed the existing implementation plan at ${planDirectory} so a new planner session can recreate it.`
            : `No existing implementation plan was found at ${planDirectory}.`);
        } catch (error) {
          return failWorkflow(ctx, 'The existing implementation plan could not be removed', `Failed to remove ${planDirectory}: ${errorText(error)}`);
        }
        return cont(withStage(state, {
          kind: 'start_implementation',
          design: state.stage.design,
          walkthrough: state.stage.walkthrough,
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
        if (state.submitPullRequest === 'no') {
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
        return suspend(withStage(state, {
          kind: 'await_pull_request',
          design: state.stage.design,
          walkthrough: state.stage.walkthrough,
          implementation: state.stage.implementation,
          opId: op.opId,
        }), wait.headlessAgent(op));
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

function readArtifactResult(incoming: unknown, runId: number, workflowKey: string, expectedPath: string): ReadResult<number> {
  const child = readChildResult(incoming, runId, workflowKey);
  if (!child.ok) return child;
  const record = objectRecord(child.value);
  if (!record || record.outcome !== 'artifact-reviewed') return failure(`${workflowKey} child workflow ${runId} returned an invalid outcome.`);
  if (record.artifactPath !== expectedPath) return failure(`${workflowKey} child workflow ${runId} returned artifact path ${String(record.artifactPath)} instead of ${expectedPath}.`);
  if (!positiveInteger(record.reviewCount)) return failure(`${workflowKey} child workflow ${runId} returned an invalid review count.`);
  return success(record.reviewCount as number);
}

function designSummary(steps: DesignSteps): DesignSummary {
  return {
    artifacts: designPaths,
    steps,
  };
}

function readWalkthroughResult(incoming: unknown, runId: number, deliveryMechanism: DeliveryMechanism): ReadResult<WalkthroughResult> {
  const child = readChildResult(incoming, runId, 'solution-walkthrough-story');
  if (!child.ok) return child;
  const record = objectRecord(child.value);
  if (!record) return failure(`solution-walkthrough-story child workflow ${runId} returned an invalid result.`);
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
  if (!positiveInteger(record.chapterCount) || !positiveInteger(record.narrativeUnitCount)) return failure(`solution-walkthrough-story child workflow ${runId} returned invalid presentation counts.`);
  return success({
    outcome: 'presentation-review-completed',
    curriculumPath,
    deckPlanPath,
    presentationPath,
    chapterCount: record.chapterCount as number,
    narrativeUnitCount: record.narrativeUnitCount as number,
  });
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
  const decisionLogPath = `${planDirectory}/decisions.md`;
  if (!implementation
    || implementation.entryPlanPath !== entryPlanPath
    || implementation.decisionLogPath !== decisionLogPath
    || !positiveInteger(implementation.phaseCount)
    || implementation.completedPhaseCount !== implementation.phaseCount) {
    return failure(`implement-story child workflow ${runId} returned an invalid implementation result.`);
  }
  return success({
    outcome: 'story-implemented',
    story,
    artifacts: designPaths,
    plan: { planDirectory, entryPlanPath },
    plannerAgentSessionId: record.plannerAgentSessionId as number,
    plannerPaneId: record.plannerPaneId as number,
    implementation: {
      entryPlanPath,
      decisionLogPath,
      phaseCount: implementation.phaseCount as number,
      completedPhaseCount: implementation.completedPhaseCount as number,
    },
  });
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
    deliveryMechanism: parseEnum(variables.deliveryMechanism, 'deliveryMechanism', deliveryMechanisms, 'presentation'),
    submitPullRequest: parseEnum(variables.submitPullRequest, 'submitPullRequest', pullRequestChoices, 'yes'),
  };
}

function reusedWalkthrough(repositoryPath: string): ReusedWalkthroughResult | null {
  const reusedArtifacts: ('walkthrough-directory' | 'presentation')[] = [];
  if (artifactDirectoryExists(repositoryPath, walkthroughDirectory)) reusedArtifacts.push('walkthrough-directory');
  if (artifactFileExists(repositoryPath, presentationPath)) reusedArtifacts.push('presentation');
  if (reusedArtifacts.length === 0) return null;
  return {
    outcome: 'solution-walkthrough-reused',
    reviewDirectory,
    walkthroughDirectory,
    presentationPath,
    reusedArtifacts,
  };
}

function artifactFileExists(repositoryPath: string, artifactPath: string): boolean {
  const absolutePath = resolve(repositoryPath, artifactPath);
  return existsSync(absolutePath) && statSync(absolutePath).isFile();
}

function artifactDirectoryExists(repositoryPath: string, artifactPath: string): boolean {
  const absolutePath = resolve(repositoryPath, artifactPath);
  return existsSync(absolutePath) && statSync(absolutePath).isDirectory();
}

function removeImplementationPlan(repositoryPath: string): boolean {
  const absolutePath = resolve(repositoryPath, planDirectory);
  if (!existsSync(absolutePath)) return false;
  rmSync(absolutePath, { recursive: true, force: true });
  return true;
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
