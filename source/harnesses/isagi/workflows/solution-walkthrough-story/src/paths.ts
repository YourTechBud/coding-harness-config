import type { ReviewPaths } from './types.js';

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
