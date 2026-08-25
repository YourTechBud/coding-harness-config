export const artifactKinds = ['current-state', 'architecture', 'program-design'] as const;

export type ArtifactKind = (typeof artifactKinds)[number];

export type ArtifactPaths = {
  readonly currentStatePath: string;
  readonly architecturePath: string;
  readonly programDesignPath: string;
};

export type ReviewPaths = {
  readonly reviewDirectory: string;
  readonly inventoryPaths: ArtifactPaths;
  readonly manifestPath: string;
  readonly presentationPaths: ArtifactPaths;
  readonly htmlPaths: ArtifactPaths;
  readonly defaultFeedbackPath: string;
};

export type SourceReference = {
  readonly heading: string;
  readonly locator: string;
};

export type InventoryTerm = {
  readonly term: string;
  readonly meaning: string;
};

export type InventoryTopic = {
  readonly candidateId: string;
  readonly title: string;
  readonly learningObjective: string;
  readonly whyRequired: string;
  readonly prerequisiteCandidateIds: readonly string[];
  readonly terms: readonly InventoryTerm[];
  readonly sourceReferences: readonly SourceReference[];
  readonly critical: boolean;
  readonly comprehensionObjective: string | null;
};

export type TopicInventory = {
  readonly schemaVersion: 1;
  readonly artifact: {
    readonly kind: ArtifactKind;
    readonly sourcePath: string;
  };
  readonly topics: readonly InventoryTopic[];
};

export type WalkthroughTopic = {
  readonly id: string;
  readonly artifact: ArtifactKind;
  readonly candidateId: string;
  readonly title: string;
  readonly learningObjective: string;
  readonly prerequisiteTopicIds: readonly string[];
  readonly sourceReferences: readonly SourceReference[];
  readonly critical: boolean;
  readonly comprehensionObjective: string | null;
  readonly browserAnchor: string;
};

export type Curriculum = {
  readonly schemaVersion: 1;
  readonly artifactOrder: readonly ArtifactKind[];
  readonly artifacts: Record<
    ArtifactKind,
    { readonly sourcePath: string; readonly presentationPath: string }
  >;
  readonly topics: readonly WalkthroughTopic[];
  readonly omissions: readonly {
    readonly artifact: ArtifactKind;
    readonly candidateId: string;
    readonly reason: string;
  }[];
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

export type InventoryCandidateV2 = {
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

export type TopicInventoryV2 = {
  readonly schemaVersion: 2;
  readonly artifact: {
    readonly kind: ArtifactKind;
    readonly sourcePath: string;
  };
  readonly candidates: readonly InventoryCandidateV2[];
};

export type CurriculumBeat = {
  readonly id: string;
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
  readonly id: ArtifactKind;
  readonly title: string;
  readonly purpose: string;
  readonly openingContext: string;
  readonly synthesisObjective: string;
  readonly beats: readonly CurriculumBeat[];
};

export type CurriculumV2 = {
  readonly schemaVersion: 2;
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
  };
  readonly chapters: readonly CurriculumChapter[];
  readonly omissions: readonly {
    readonly candidate: CandidateReference;
    readonly reason: string;
  }[];
};

export type DeckSlide = {
  readonly id: string;
  readonly chapterId: ArtifactKind;
  readonly beatIds: readonly string[];
  readonly title: string;
  readonly purpose: string;
  readonly contentResponsibilities: readonly string[];
  readonly representationIntent: string | null;
  readonly progressiveDisclosure: readonly string[];
};

export type RealizationUnit = {
  readonly id: string;
  readonly slideIds: readonly string[];
};

export type DeckPlan = {
  readonly schemaVersion: 1;
  readonly curriculumPath: string;
  readonly outputPath: string;
  readonly slides: readonly DeckSlide[];
  readonly realizationUnits: readonly RealizationUnit[];
};

export type LegacyDeckReview = {
  readonly schemaVersion: 1;
  readonly round: number;
  readonly outcome: 'approved' | 'revise' | 'human-decision';
  readonly findings: readonly {
    readonly id: string;
    readonly owners: readonly ('architect' | 'builder' | 'human')[];
    readonly severity: 'blocker' | 'concern' | 'suggestion';
    readonly slideIds: readonly string[];
    readonly evidence: string;
    readonly requiredOutcome: string;
  }[];
};

export type WalkthroughV2Paths = {
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
