// The launch form's answers, also passed by parent workflows that embed this one.

export type YesNo = 'yes' | 'no';

export type ImplementationOptions = {
  readonly humanInTheLoop: YesNo;
  readonly autoReview: YesNo;
  readonly autoCommit: YesNo;
};

export type ArtifactPaths = {
  readonly currentStatePath: string;
  readonly architecturePath: string;
  readonly programDesignPath: string;
  readonly uiBriefPath: string;
};

export type PlanPaths = {
  readonly planDirectory: string;
  readonly entryPlanPath: string;
};

export type ImplementedPlan = {
  readonly entryPlanPath: string;
  readonly decisionLogPath: string;
  readonly phaseCount: number;
  readonly completedPhaseCount: number;
};

export type Variables = {
  readonly story?: unknown;
  readonly currentStatePath?: unknown;
  readonly architecturePath?: unknown;
  readonly programDesignPath?: unknown;
  readonly uiBriefPath?: unknown;
  readonly planDirectory?: unknown;
  readonly entryPlanPath?: unknown;
  readonly humanInTheLoop?: unknown;
  readonly autoReview?: unknown;
  readonly autoCommit?: unknown;
};

export const defaults = {
  currentStatePath: 'scratch/story/design/current-state.md',
  architecturePath: 'scratch/story/design/architecture.md',
  programDesignPath: 'scratch/story/design/program-design.md',
  uiBriefPath: 'scratch/story/design/ui-brief.md',
  planDirectory: 'scratch/story/implementation',
  entryPlanPath: 'scratch/story/implementation/index.md',
};

export const humanInTheLoopInput = {
  kind: 'select' as const,
  key: 'humanInTheLoop',
  label: 'Human in the loop',
  options: [
    { value: 'yes', label: 'Yes, pause after each phase' },
    { value: 'no', label: 'No, run through phases' },
  ],
  default: 'yes',
};

export const autoReviewInput = {
  kind: 'select' as const,
  key: 'autoReview',
  label: 'Automatic engineering guidance review',
  options: [
    { value: 'yes', label: 'Yes, review every completed phase' },
    { value: 'no', label: 'No, skip automatic review' },
  ],
  default: 'yes',
};

export const autoCommitInput = {
  kind: 'select' as const,
  key: 'autoCommit',
  label: 'Automatic commit',
  options: [
    { value: 'yes', label: 'Yes, create a commit after each phase' },
    { value: 'no', label: 'No, leave phase changes uncommitted' },
  ],
  default: 'yes',
};

export type ImplementStoryParameters = ReturnType<typeof parseVariables>;

export function parseVariables(variables: Variables): {
  readonly story: string;
  readonly artifacts: ArtifactPaths;
  readonly plan: PlanPaths;
  readonly options: ImplementationOptions;
} {
  return {
    story: parseText(variables.story, 'story'),
    artifacts: {
      currentStatePath: parsePath(variables.currentStatePath, 'currentStatePath', defaults.currentStatePath),
      architecturePath: parsePath(variables.architecturePath, 'architecturePath', defaults.architecturePath),
      programDesignPath: parsePath(variables.programDesignPath, 'programDesignPath', defaults.programDesignPath),
      uiBriefPath: parsePath(variables.uiBriefPath, 'uiBriefPath', defaults.uiBriefPath),
    },
    plan: {
      planDirectory: parsePath(variables.planDirectory, 'planDirectory', defaults.planDirectory),
      entryPlanPath: parsePath(variables.entryPlanPath, 'entryPlanPath', defaults.entryPlanPath),
    },
    options: {
      humanInTheLoop: parseYesNo(variables.humanInTheLoop, 'humanInTheLoop'),
      autoReview: parseYesNo(variables.autoReview, 'autoReview'),
      autoCommit: parseYesNo(variables.autoCommit, 'autoCommit'),
    },
  };
}

function parseText(value: unknown, key: string): string {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  throw new Error(`${key} must be non-empty text.`);
}

function parsePath(value: unknown, key: string, fallback: string): string {
  if (value === undefined) return fallback;
  return parseText(value, key);
}

function parseYesNo(value: unknown, key: string): YesNo {
  if (value === undefined) return 'yes';
  if (value === 'yes' || value === 'no') return value;
  throw new Error(`${key} must be yes or no.`);
}
