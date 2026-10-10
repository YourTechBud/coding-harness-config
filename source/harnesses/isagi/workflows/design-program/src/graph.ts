import { createReviewedArtifactGraph, type ReviewedArtifactOutput } from 'isagi-workflow-common-graphs';

import { reviewer, reviewerJudgment, writer, writerJudgment } from './constants.js';
import { latestAssistantTurnText, parseReviewerRoute, parseWriterRoute, reviewerRoutingPrompt, writerRoutingPrompt } from './judgments.js';
import { initialReviewerPrompt, initialWriterPrompt, restateReviewPrompt, retryWriterPrompt, reviewToWriterPrompt, writerToReviewerPrompt } from './prompts.js';

export type DesignProgramParameters = {
  readonly story: string;
  readonly currentStatePath: string;
  readonly architecturePath: string;
  readonly artifactPath: string;
};

export type DesignProgramOutput = ReviewedArtifactOutput;

// A writer drafts the program design and an independent reviewer reviews it until the reviewer closes the
// loop. The shared loop owns the routing; this workflow supplies its prompts, judgments, and wording.
export const DesignProgramGraph = createReviewedArtifactGraph<DesignProgramParameters>({
  key: 'DesignProgram',
  title: 'Design program',
  skill: 'design-program',
  roles: { writer: 'Program-design writer', reviewer: 'Program-design reviewer' },
  roundLabel: 'program-design review round',
  profiles: { writer, reviewer, writerJudgment, reviewerJudgment },
  // A harness error resends the previous message once before asking the user.
  resubmitOnHarnessError: 1,
  phases: {
    writing: 'Designing program',
    checkingWriter: 'Checking program-design writer progress',
    reviewing: 'Reviewing program design',
    routingReview: 'Routing program-design review',
    revising: 'Revising program design',
    rereviewing: 'Re-reviewing program design',
    restating: 'Restating program design review with your decision',
    recoveringWriter: 'Recovering program-design writer',
    complete: 'Program design complete',
    failed: 'Design program failed',
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
