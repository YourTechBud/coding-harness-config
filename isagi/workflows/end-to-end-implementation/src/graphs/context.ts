import type { PullRequestResult } from '../pull-request.js';

export type ArtifactPaths = {
  readonly currentStatePath: string;
  readonly architecturePath: string;
  readonly programDesignPath: string;
};

export type DesignStepResult =
  | { readonly outcome: 'created'; readonly reviewCount: number }
  | { readonly outcome: 'reused' };

export type DesignSteps = {
  readonly currentState: DesignStepResult;
  readonly architecture: DesignStepResult;
  readonly programDesign: DesignStepResult;
};

export type DesignSummary = {
  readonly artifacts: ArtifactPaths;
  readonly steps: DesignSteps;
};

export type WalkthroughResult =
  | { readonly outcome: 'socratic-walkthrough-completed'; readonly curriculumPath: string }
  | {
      readonly outcome: 'presentation-created';
      readonly curriculumPath: string;
      readonly deckPlanPath: string;
      readonly presentationPath: string;
      readonly neighborhoodCount: number;
      readonly contentMomentCount: number;
      readonly substantiveSlideCount: number;
      readonly totalSlideCount: number;
      readonly coverageItemCount: number;
    }
  | { readonly outcome: 'presentation-reused'; readonly presentationPath: string };

export type ImplementationResult = {
  readonly outcome: 'story-implemented';
  readonly story: string;
  readonly artifacts: ArtifactPaths;
  readonly plan: { readonly planDirectory: string; readonly entryPlanPath: string };
  readonly plannerAgentSessionId: number;
  readonly plannerPaneId: number;
  readonly implementation: {
    readonly entryPlanPath: string;
    readonly decisionLogPath: string;
    readonly phaseCount: number;
    readonly completedPhaseCount: number;
  };
};

export type { PullRequestResult };

export type Failure = { readonly message: string; readonly diagnostic: string };
export type Failed = { readonly outcome: 'failed'; readonly failure: Failure };

export const familiarityLevels = ['new', 'familiar'] as const;
export type Familiarity = (typeof familiarityLevels)[number];

export const technicalDepthLevels = ['product', 'system-design', 'implementation'] as const;
export type TechnicalDepth = (typeof technicalDepthLevels)[number];

export const deliveryMechanisms = ['presentation', 'socratic-walkthrough'] as const;
export type DeliveryMechanism = (typeof deliveryMechanisms)[number];

export const pullRequestChoices = ['yes', 'no'] as const;
export type PullRequestChoice = (typeof pullRequestChoices)[number];

// The story pack lives at fixed paths so every embedded workflow agrees on them.
export const storyRoot = 'scratch/story';

export const designPaths = {
  currentStatePath: `${storyRoot}/design/current-state.md`,
  architecturePath: `${storyRoot}/design/architecture.md`,
  programDesignPath: `${storyRoot}/design/program-design.md`,
} satisfies ArtifactPaths;

export const reviewDirectory = `${storyRoot}/walkthrough`;
export const curriculumPath = `${reviewDirectory}/.walkthrough/curriculum.json`;
export const deckPlanPath = `${reviewDirectory}/.walkthrough/deck-plan.json`;
export const presentationPath = `${reviewDirectory}/walkthrough.html`;

export const uiBriefPath = `${storyRoot}/design/ui-brief.md`;
export const planDirectory = `${storyRoot}/implementation`;
export const entryPlanPath = `${planDirectory}/index.md`;
export const decisionLogPath = `${planDirectory}/decisions.md`;
export const implementationOptions = {
  humanInTheLoop: 'no',
  autoReview: 'yes',
  autoCommit: 'yes',
} as const;

export function must<Value>(value: Value | null, label: string): Value {
  if (value === null) throw new Error(`End-to-end implementation state is missing its ${label}.`);
  return value;
}

export function errorText(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return 'unknown error';
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
