import { createReviewedArtifactGraph, type ReviewedArtifactOutput } from 'isagi-workflow-common-graphs';

import { reviewer, reviewerJudgment, writer, writerJudgment } from './constants.js';
import { latestAssistantTurnText, parseReviewerRoute, parseWriterRoute, reviewerRoutingPrompt, writerRoutingPrompt } from './judgments.js';
import { initialReviewerPrompt, initialWriterPrompt, restateReviewPrompt, retryWriterPrompt, reviewToWriterPrompt, writerToReviewerPrompt } from './prompts.js';

export type DesignArchitectureParameters = {
  readonly story: string;
  readonly currentStatePath: string;
  readonly artifactPath: string;
};

export type DesignArchitectureOutput = ReviewedArtifactOutput;

// A writer drafts the architecture and an independent reviewer reviews it until the reviewer closes the
// loop. The shared loop owns the routing; this workflow supplies its prompts, judgments, and wording.
export const DesignArchitectureGraph = createReviewedArtifactGraph<DesignArchitectureParameters>({
  key: 'DesignArchitecture',
  title: 'Design architecture',
  skill: 'design-architecture',
  roles: { writer: 'Architecture writer', reviewer: 'Architecture reviewer' },
  roundLabel: 'architecture review round',
  profiles: { writer, reviewer, writerJudgment, reviewerJudgment },
  phases: {
    writing: 'Designing architecture',
    checkingWriter: 'Checking architecture writer progress',
    reviewing: 'Reviewing architecture',
    routingReview: 'Routing architecture review',
    revising: 'Revising architecture',
    rereviewing: 'Re-reviewing architecture',
    restating: 'Restating architecture review with your decision',
    recoveringWriter: 'Recovering architecture writer',
    complete: 'Architecture complete',
    failed: 'Design architecture failed',
  },
  prompts: {
    initialWriter: initialWriterPrompt,
    reviewToWriter: reviewToWriterPrompt,
    retryWriter: retryWriterPrompt,
    initialReviewer: initialReviewerPrompt,
    writerToReviewer: writerToReviewerPrompt,
    restateReview: restateReviewPrompt,
    writerRouting: writerRoutingPrompt,
    reviewerRouting: reviewerRoutingPrompt,
  },
  parse: { writerRoute: parseWriterRoute, reviewerRoute: parseReviewerRoute },
  latestAssistantTurnText,
});
