import type { ReviewPaths, WalkthroughV2Paths } from './types.js';

export function reviewPaths(reviewDirectory: string): ReviewPaths {
  const walkthroughDirectory = `${reviewDirectory}/.walkthrough`;
  return {
    reviewDirectory,
    inventoryPaths: {
      currentStatePath: `${walkthroughDirectory}/inventories/current-state.json`,
      architecturePath: `${walkthroughDirectory}/inventories/architecture.json`,
      programDesignPath: `${walkthroughDirectory}/inventories/program-design.json`,
    },
    manifestPath: `${walkthroughDirectory}/manifest.json`,
    presentationPaths: {
      currentStatePath: `${walkthroughDirectory}/presentations/current-state.md`,
      architecturePath: `${walkthroughDirectory}/presentations/architecture.md`,
      programDesignPath: `${walkthroughDirectory}/presentations/program-design.md`,
    },
    htmlPaths: {
      currentStatePath: `${reviewDirectory}/current-state.html`,
      architecturePath: `${reviewDirectory}/architecture.html`,
      programDesignPath: `${reviewDirectory}/program-design.html`,
    },
    defaultFeedbackPath: `${reviewDirectory}/feedback.md`,
  };
}

export function walkthroughV2Paths(reviewDirectory: string): WalkthroughV2Paths {
  const walkthroughDirectory = `${reviewDirectory}/.walkthrough`;
  return {
    reviewDirectory,
    inventoryPaths: {
      currentStatePath: `${walkthroughDirectory}/inventories/current-state.json`,
      architecturePath: `${walkthroughDirectory}/inventories/architecture.json`,
      programDesignPath: `${walkthroughDirectory}/inventories/program-design.json`,
    },
    curriculumPath: `${walkthroughDirectory}/curriculum.json`,
    deckPlanPath: `${walkthroughDirectory}/deck-plan.json`,
    htmlPath: `${reviewDirectory}/walkthrough.html`,
    reviewsDirectory: `${walkthroughDirectory}/reviews`,
    defaultFeedbackPath: `${reviewDirectory}/feedback.md`,
  };
}

export function deckReviewPath(paths: WalkthroughV2Paths, round: number): string {
  return `${paths.reviewsDirectory}/round-${String(round).padStart(2, '0')}.md`;
}

export function legacyDeckReviewPath(paths: WalkthroughV2Paths, round: number): string {
  return `${paths.reviewsDirectory}/round-${String(round).padStart(2, '0')}.json`;
}
