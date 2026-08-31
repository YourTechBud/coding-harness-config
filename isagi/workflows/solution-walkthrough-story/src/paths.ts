import type { WalkthroughPaths } from './types.js';

export function walkthroughPaths(reviewDirectory: string): WalkthroughPaths {
  const walkthroughDirectory = `${reviewDirectory}/.walkthrough`;
  return {
    reviewDirectory,
    walkthroughDirectory,
    curriculumAnalysisPath: `${walkthroughDirectory}/curriculum-analysis.json`,
    curriculumPath: `${walkthroughDirectory}/curriculum.json`,
    deckPlanPath: `${walkthroughDirectory}/deck-plan.json`,
    htmlPath: `${reviewDirectory}/walkthrough.html`,
  };
}
