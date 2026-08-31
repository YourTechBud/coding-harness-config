import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { WorkflowContext, WorkflowResult } from '@yourtechbudstudio/isagi-workflow-sdk';

import type { ArchitectedDeckPlan } from '../src/curriculum-v3.js';
import { walkthroughPaths } from '../src/paths.js';
import type { Stage, State } from '../src/workflow.js';
import type { ArtifactPaths } from '../src/types.js';

export const reviewDirectory = 'review';

export const sources: ArtifactPaths = {
  currentStatePath: 'design/current-state.md',
  architecturePath: 'design/architecture.md',
  programDesignPath: 'design/program-design.md',
};

export function state(repositoryPath: string, stage: Stage, deliveryMechanism: State['deliveryMechanism'] = 'presentation'): State {
  return {
    stateVersion: 1,
    repositoryPath,
    story: 'Story 42',
    sources,
    paths: walkthroughPaths(reviewDirectory),
    audienceProfile: { familiarity: 'new', technicalDepth: 'system-design' },
    deliveryMechanism,
    stage,
  };
}

export function plan(): ArchitectedDeckPlan {
  const paths = walkthroughPaths(reviewDirectory);
  return {
    schemaVersion: 7,
    curriculumPath: paths.curriculumPath,
    analysisPath: paths.curriculumAnalysisPath,
    outputPath: paths.htmlPath,
    story: {
      title: 'System story',
      openingPromise: 'Reach an approval judgment.',
      throughline: 'Follow the boundary.',
      endingResolution: 'Judge the contract.',
    },
    presentationStrategy: {
      audienceExperience: 'Self-paced and visible at a glance.',
      compactnessRationale: 'One decision needs one substantive slide.',
    },
    openingSlide: {
      id: 'opening',
      titleIntent: 'Introduce the system boundary decision.',
      decisionPromise: 'Reach an approval judgment.',
    },
    neighborhoods: [{
      id: 'system-boundary-presentation',
      curriculumNeighborhoodId: 'system-boundary',
      title: 'System boundary',
      purpose: 'Make the boundary reviewable.',
      transition: 'Finish with the decision.',
      contentMoments: [{
        id: 'system-contract',
        audienceConclusion: 'The API makes durable identity explicit and traceable to storage.',
        outcomeIds: ['judge-system-boundary'],
        coverageItemIds: ['system-contract', 'system-schema'],
      }],
    }],
  };
}

export function writeGenericCurriculum(repositoryPath: string): void {
  const paths = walkthroughPaths(reviewDirectory);
  write(repositoryPath, paths.curriculumAnalysisPath, JSON.stringify({
    schemaVersion: 3,
    coverageItems: [
      {
        id: 'system-contract',
        title: 'System contract',
        kind: 'API contract',
        significance: 'The audience must understand the boundary before approval.',
        details: ['POST /systems returns the durable system identity.'],
        sourceReferences: [{ sourceId: 'architecture' }],
      },
      {
        id: 'system-schema',
        title: 'System schema',
        kind: 'Persistence contract',
        significance: 'The exact schema must remain available for inspection.',
        details: ['systems.id is the durable identity returned by the API.'],
        sourceReferences: [{ sourceId: 'program-design' }],
      },
    ],
  }));
  write(repositoryPath, paths.curriculumPath, JSON.stringify({
    schemaVersion: 3,
    analysisPath: paths.curriculumAnalysisPath,
    learningGoal: 'Approve or reject the solution.',
    storyline: {
      title: 'System story',
      throughline: 'Follow the boundary.',
      rationale: 'The boundary carries the decision.',
    },
    neighborhoods: [{
      id: 'system-boundary',
      title: 'System boundary',
      purpose: 'Understand the changed boundary.',
      narrativeBridge: 'Move from intent to contract.',
      outcomes: [{
        id: 'judge-system-boundary',
        title: 'Judge the system boundary',
        objective: 'Explain and evaluate the changed contract.',
        coverage: [
          { itemId: 'system-contract', role: 'primary', visibility: 'required', rationale: 'The boundary behavior is decision-critical.' },
          { itemId: 'system-schema', role: 'reference', visibility: 'required', rationale: 'The persistence contract must remain reviewable.' },
        ],
      }],
    }],
    omissions: [],
  }));
}

export function writeDeckPlan(repositoryPath: string): void {
  write(repositoryPath, walkthroughPaths(reviewDirectory).deckPlanPath, JSON.stringify(plan()));
}

export function assembledHtml(momentId = 'system-contract'): string {
  return `<!doctype html>
<html>
<body>
  <!-- Example only: <section data-walkthrough-slide id="not-a-slide"></section> -->
  <main data-walkthrough-deck>
    <div data-slide-viewport>
      <section id="opening" data-walkthrough-slide></section>
      <section id="system-contract-slide" data-walkthrough-slide data-content-moments="${momentId}"></section>
    </div>
    <nav data-slide-navigation></nav>
  </main>
</body>
</html>`;
}

export function write(repositoryPath: string, relativePath: string, text: string): void {
  const absolutePath = join(repositoryPath, relativePath);
  mkdirSync(join(absolutePath, '..'), { recursive: true });
  writeFileSync(absolutePath, text);
}

export function workflowHarness(repositoryPath: string) {
  const spawned: Array<Parameters<WorkflowContext['spawnAgentSession']>[0]> = [];
  const closedPanes: number[] = [];
  const feedback: Array<Parameters<WorkflowContext['setUiFeedback']>[0]> = [];
  const workflows: Array<{ readonly key: string; readonly variables: Record<string, unknown> }> = [];
  const ctx: WorkflowContext = {
    worktreePath: repositoryPath,
    spawnAgentSession: async (input) => {
      spawned.push(input);
      const index = spawned.length;
      return { agentSessionId: 10 + index, paneId: 20 + index, sentAt: `2026-08-21T00:00:0${index}.000Z` };
    },
    sendAgentPrompt: async (input) => ({ agentSessionId: input.agentSessionId, sentAt: '2026-08-21T00:00:00.000Z' }),
    closePane: async (paneId) => { closedPanes.push(paneId); },
    getConversationHistory: async () => [],
    runHeadlessAgent: async (input) => ({
      opId: 'unused',
      launch: {
        prompt: input.prompt ?? '',
        harness: input.harness,
        model: input.model,
        effort: input.effort,
        timeoutMs: input.timeoutMs ?? 900_000,
      },
    }),
    startWorkflow: async (key, variables = {}) => {
      workflows.push({ key, variables });
      return 100 + workflows.length;
    },
    log: async () => {},
    setUiFeedback: async (input) => { feedback.push(input); },
  };
  return { ctx, spawned, closedPanes, feedback, workflows };
}

export function ended() {
  return { outcome: 'ended' as const, recordedAt: '2026-08-21T00:00:00.000Z' };
}

export function resultState(result: WorkflowResult): State {
  if (result.type !== 'cont' && result.type !== 'suspend') throw new Error(`Expected state result, got ${result.type}.`);
  return result.state as State;
}

export function resultStage(result: WorkflowResult): Stage {
  return resultState(result).stage;
}
