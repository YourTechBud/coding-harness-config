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
