import { createReviewedArtifactGraph, type ReviewedArtifactOutput } from 'isagi-workflow-common-graphs';

import { reviewer, reviewerJudgment, writer, writerJudgment } from './constants.js';
import { latestAssistantTurnText, parseReviewerRoute, parseWriterRoute, reviewerRoutingPrompt, writerRoutingPrompt } from './judgments.js';
import { initialReviewerPrompt, initialWriterPrompt, restateReviewPrompt, retryWriterPrompt, reviewToWriterPrompt, writerToReviewerPrompt } from './prompts.js';

export type AnalyzeCurrentStateParameters = {
  readonly story: string;
  readonly artifactPath: string;
};

export type AnalyzeCurrentStateOutput = ReviewedArtifactOutput;

// A writer drafts the current-state analysis and an independent reviewer reviews it until the reviewer closes the
// loop. The shared loop owns the routing; this workflow supplies its prompts, judgments, and wording.
export const AnalyzeCurrentStateGraph = createReviewedArtifactGraph<AnalyzeCurrentStateParameters>({
  key: 'AnalyzeCurrentState',
  title: 'Analyze current state',
  skill: 'analyze-current-state',
  roles: { writer: 'Current-state writer', reviewer: 'Current-state reviewer' },
  roundLabel: 'review round',
  profiles: { writer, reviewer, writerJudgment, reviewerJudgment },
  phases: {
    writing: 'Analyzing current state',
    checkingWriter: 'Checking writer progress',
    reviewing: 'Reviewing current-state analysis',
    routingReview: 'Routing reviewer feedback',
    revising: 'Revising current-state analysis',
    rereviewing: 'Re-reviewing current-state analysis',
    restating: 'Restating current-state analysis review with your decision',
    recoveringWriter: 'Recovering current-state writer',
    complete: 'Current-state analysis complete',
    failed: 'Analyze current state failed',
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
