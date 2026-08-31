export type ArtifactPaths = {
  readonly currentStatePath: string;
  readonly architecturePath: string;
  readonly programDesignPath: string;
};

export type VisibleAgent = {
  readonly agentSessionId: number;
  readonly paneId: number;
  readonly sentAt: string;
};

export type Guide = Pick<VisibleAgent, 'agentSessionId' | 'paneId'>;

export const familiarityLevels = ['new', 'familiar'] as const;
export type Familiarity = (typeof familiarityLevels)[number];

export const technicalDepthLevels = ['product', 'system-design', 'implementation'] as const;
export type TechnicalDepth = (typeof technicalDepthLevels)[number];

export const deliveryMechanisms = ['presentation', 'socratic-walkthrough'] as const;
export type DeliveryMechanism = (typeof deliveryMechanisms)[number];

export type AudienceProfile = {
  readonly familiarity: Familiarity;
  readonly technicalDepth: TechnicalDepth;
};

export type WalkthroughPaths = {
  readonly reviewDirectory: string;
  readonly walkthroughDirectory: string;
  readonly curriculumAnalysisPath: string;
  readonly curriculumPath: string;
  readonly deckPlanPath: string;
  readonly htmlPath: string;
};
