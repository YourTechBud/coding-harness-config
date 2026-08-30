export const artifactKinds = ['current-state', 'architecture', 'program-design'] as const;

export type ArtifactKind = (typeof artifactKinds)[number];

export type ArtifactPaths = {
  readonly currentStatePath: string;
  readonly architecturePath: string;
  readonly programDesignPath: string;
};

export type SourceReference = {
  readonly heading: string;
  readonly locator: string;
};

export type InventoryTerm = {
  readonly term: string;
  readonly meaning: string;
};

export type Guide = {
  readonly agentSessionId: number;
  readonly paneId: number;
};

export type VisibleAgent = {
  readonly agentSessionId: number;
  readonly paneId: number;
  readonly sentAt: string;
};

export const familiarityLevels = ['new', 'familiar'] as const;
export type Familiarity = (typeof familiarityLevels)[number];

export const technicalDepthLevels = [
  'product',
  'system-design',
  'implementation',
] as const;
export type TechnicalDepth = (typeof technicalDepthLevels)[number];

export const deliveryModes = ['presentation-first', 'guided-tutorial'] as const;
export type DeliveryMode = (typeof deliveryModes)[number];

export type AudienceProfile = {
  readonly familiarity: Familiarity;
  readonly technicalDepth: TechnicalDepth;
};

export type CandidateReference = {
  readonly artifact: ArtifactKind;
  readonly candidateId: string;
};

export const contractKinds = [
  'api',
  'persistence',
  'event',
  'query',
  'wire',
  'configuration',
  'cross-module',
  'state-model',
] as const;
export type ContractKind = (typeof contractKinds)[number];

export const contractChanges = ['add', 'modify', 'remove'] as const;
export type ContractChange = (typeof contractChanges)[number];

export type InventoryContract = {
  readonly contractId: string;
  readonly kind: ContractKind;
  readonly name: string;
  readonly change: ContractChange;
  readonly exactShape: string;
  readonly invariants: readonly string[];
  readonly compatibilityAndMigration: string | null;
  readonly sourceReferences: readonly SourceReference[];
};

export type InventoryCandidate = {
  readonly candidateId: string;
  readonly title: string;
  readonly learningObjective: string;
  readonly whyRequired: string;
  readonly prerequisiteCandidateIds: readonly string[];
  readonly terms: readonly InventoryTerm[];
  readonly keyPoints: readonly string[];
  readonly representationOpportunities: readonly string[];
  readonly sourceReferences: readonly SourceReference[];
};

export type TopicInventory = {
  readonly schemaVersion: 3;
  readonly artifact: {
    readonly kind: ArtifactKind;
    readonly sourcePath: string;
  };
  readonly candidates: readonly InventoryCandidate[];
  readonly contracts: readonly InventoryContract[];
};

export const chapterKinds = ['orientation', 'neighborhood', 'synthesis'] as const;
export type ChapterKind = (typeof chapterKinds)[number];

export const beatFacets = ['context', 'architecture', 'program-design', 'verification'] as const;
export type BeatFacet = (typeof beatFacets)[number];

export type CurriculumBeat = {
  readonly id: string;
  readonly facet: BeatFacet;
  readonly title: string;
  readonly objective: string;
  readonly narrativeBridge: string;
  readonly candidateReferences: readonly CandidateReference[];
  readonly prerequisiteBeatIds: readonly string[];
  readonly requiredContent: readonly string[];
  readonly supportingMaterial: readonly string[];
  readonly termsToIntroduce: readonly InventoryTerm[];
  readonly realizationPoint: string | null;
  readonly comprehensionObjective: string | null;
  readonly representationOpportunities: readonly string[];
  readonly sourceReferences: readonly SourceReference[];
};

export type CurriculumChapter = {
  readonly id: string;
  readonly kind: ChapterKind;
  readonly title: string;
  readonly purpose: string;
  readonly openingContext: string;
  readonly synthesisObjective: string;
  readonly beats: readonly CurriculumBeat[];
};

export type Curriculum = {
  readonly schemaVersion: 3;
  readonly story: {
    readonly reference: string;
    readonly title: string;
    readonly throughline: string;
  };
  readonly sources: ArtifactPaths;
  readonly audienceProfile: AudienceProfile;
  readonly audienceContract: {
    readonly assumedKnowledge: readonly string[];
    readonly orientationPolicy: string;
    readonly technicalDetailPolicy: string;
    readonly evidencePolicy: string;
    readonly languagePolicy?: string | undefined;
  };
  readonly chapters: readonly CurriculumChapter[];
  readonly contractCoverage: readonly {
    readonly contractId: string;
    readonly chapterId: string;
    readonly beatId: string;
    readonly presentationRequirement: string;
  }[];
  readonly omissions: readonly {
    readonly candidate: CandidateReference;
    readonly reason: string;
  }[];
};

export type PlannedSlide = {
  readonly id: string;
  readonly title: string;
  readonly uniqueContribution: string;
  readonly requiredContent: readonly string[];
  readonly contractIds: readonly string[];
  readonly representationIntent: string | null;
  readonly progressiveDisclosure: readonly string[];
  readonly sourceReferences: readonly SourceReference[];
};

export type NarrativeUnit = {
  readonly title: string;
  readonly facet: BeatFacet;
  readonly storyPurpose: string;
  readonly beatIds: readonly string[];
  readonly narrativeBridge: string;
  readonly slides: readonly PlannedSlide[];
};

export type DeckChapter = {
  readonly id: string;
  readonly kind: ChapterKind;
  readonly title: string;
  readonly storyRole: string;
  readonly openingContext: string;
  readonly closingSynthesis: string;
  readonly transitionToNext: string;
  readonly narrativeUnits: readonly NarrativeUnit[];
};

export type DeckPlan = {
  readonly schemaVersion: 3;
  readonly curriculumPath: string;
  readonly outputPath: string;
  readonly story: {
    readonly title: string;
    readonly openingPromise: string;
    readonly throughline: string;
    readonly endingResolution: string;
  };
  readonly compactnessStrategy: string;
  readonly chapters: readonly DeckChapter[];
};

export type WalkthroughPaths = {
  readonly reviewDirectory: string;
  readonly inventoryPaths: ArtifactPaths;
  readonly curriculumPath: string;
  readonly deckPlanPath: string;
  readonly htmlPath: string;
  readonly reviewsDirectory: string;
  readonly defaultFeedbackPath: string;
};

export const artifactDescriptors = [
  {
    kind: 'current-state',
    label: 'current state',
    pathKey: 'currentStatePath',
    topicPrefix: 'cs',
  },
  {
    kind: 'architecture',
    label: 'architecture',
    pathKey: 'architecturePath',
    topicPrefix: 'ar',
  },
  {
    kind: 'program-design',
    label: 'program design',
    pathKey: 'programDesignPath',
    topicPrefix: 'pd',
  },
] as const;

export function pathFor(paths: ArtifactPaths, kind: ArtifactKind): string {
  const descriptor = artifactDescriptors.find((candidate) => candidate.kind === kind);
  if (!descriptor) throw new Error(`Unsupported artifact kind: ${kind}`);
  return paths[descriptor.pathKey];
}

export function descriptorFor(kind: ArtifactKind) {
  const descriptor = artifactDescriptors.find((candidate) => candidate.kind === kind);
  if (!descriptor) throw new Error(`Unsupported artifact kind: ${kind}`);
  return descriptor;
}
