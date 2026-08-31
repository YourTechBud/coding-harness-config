export type CurriculumSource = {
  readonly id: string;
  readonly path: string;
  readonly description: string | null;
};

export type AudienceDescription = {
  readonly familiarity: string;
  readonly depth: string;
};

export type SourceReference = {
  readonly sourceId: string;
};

export type GuidingQuestion = {
  readonly id: string;
  readonly question: string;
  readonly whyItMatters: string;
};

export type CoverageItem = {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
  readonly significance: string;
  readonly details: readonly string[];
  readonly guidingQuestionIds: readonly string[];
  readonly prerequisiteItemIds: readonly string[];
  readonly sourceReferences: readonly SourceReference[];
};

export type CurriculumAnalysis = {
  readonly schemaVersion: 3;
  readonly learningGoal: string;
  readonly audience: AudienceDescription;
  readonly sources: readonly CurriculumSource[];
  readonly guidingQuestions: readonly GuidingQuestion[];
  readonly coverageItems: readonly CoverageItem[];
};

export const coverageRoles = ['primary', 'supporting', 'reference'] as const;
export type CoverageRole = (typeof coverageRoles)[number];

export const coverageVisibilities = ['required', 'optional'] as const;
export type CoverageVisibility = (typeof coverageVisibilities)[number];

export const cognitionBudgetConstraints = ['outcome-limit', 'neighborhood-limit'] as const;
export type CognitionBudgetConstraint = (typeof cognitionBudgetConstraints)[number];

export type Curriculum = {
  readonly schemaVersion: 3;
  readonly analysisPath: string;
  readonly learningGoal: string;
  readonly audience: AudienceDescription;
  readonly teachingBrief: string;
  readonly guidingQuestions: readonly GuidingQuestion[];
  readonly storyline: {
    readonly title: string;
    readonly throughline: string;
    readonly rationale: string;
  };
  readonly cognitionBudget: {
    readonly outcomeLimit: number;
    readonly neighborhoodLimit: number;
    readonly exceptions: readonly {
      readonly constraint: CognitionBudgetConstraint;
      readonly reason: string;
    }[];
  };
  readonly neighborhoods: readonly {
    readonly id: string;
    readonly title: string;
    readonly purpose: string;
    readonly narrativeBridge: string;
    readonly outcomes: readonly {
      readonly id: string;
      readonly title: string;
      readonly objective: string;
      readonly guidingQuestionIds: readonly string[];
      readonly prerequisiteOutcomeIds: readonly string[];
      readonly coverage: readonly {
        readonly itemId: string;
        readonly role: CoverageRole;
        readonly visibility: CoverageVisibility;
        readonly rationale: string;
      }[];
    }[];
  }[];
  readonly omissions: readonly {
    readonly itemId: string;
    readonly reason: string;
  }[];
};

export type CurriculumPaths = {
  readonly outputDirectory: string;
  readonly analysisPath: string;
  readonly curriculumPath: string;
};
