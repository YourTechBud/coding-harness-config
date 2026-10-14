import type { WalkthroughPaths } from './types.js';

export function walkthroughPaths(reviewDirectory: string): WalkthroughPaths {
  const walkthroughDirectory = `${reviewDirectory}/.walkthrough`;
  return {
    reviewDirectory,
    walkthroughDirectory,
    curriculumAnalysisPath: `${walkthroughDirectory}/curriculum-analysis.json`,
    curriculumPath: `${walkthroughDirectory}/curriculum.json`,
    deckPlanPath: `${walkthroughDirectory}/deck-plan.json`,
    lessonPlanPath: `${walkthroughDirectory}/lesson-plan.md`,
    htmlPath: `${reviewDirectory}/walkthrough.html`,
  };
}
