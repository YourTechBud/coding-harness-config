import type { WalkthroughPaths } from './types.js';

export function walkthroughPaths(reviewDirectory: string): WalkthroughPaths {
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

export function deckReviewPath(paths: WalkthroughPaths, round: number): string {
  return `${paths.reviewsDirectory}/round-${String(round).padStart(2, '0')}.md`;
}
