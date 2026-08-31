import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ParsedInputs } from '../src/inputs.js';
import type { Curriculum, CurriculumAnalysis } from '../src/types.js';

export function writeSources(repositoryPath: string): void {
  write(repositoryPath, 'docs/current.md', '# Current map\n\nThe request crosses the gateway.\n');
  write(repositoryPath, 'docs/proposal.md', '# Proposed boundary\n\nThe gateway delegates persistence.\n\n## Storage contract\n\nRecords use a stable identifier.\n');
}

export function variables() {
  return {
    sources: [
      { id: 'current', path: 'docs/current.md', description: 'The current state map' },
      { id: 'proposal', path: 'docs/proposal.md', description: 'The proposed design' },
    ],
    learningGoal: 'Understand the current map and proposal well enough to approve or reject it.',
    audienceFamiliarity: 'The audience knows the product but not this implementation.',
    audienceDepth: 'The audience needs system relationships and consequential contracts.',
    teachingBrief: 'Establish the current map, then connect each proposed boundary to its realization.',
    outputDirectory: 'review/.curriculum',
  };
}

export function analysis(input: ParsedInputs) {
  return {
    schemaVersion: 3,
    learningGoal: input.learningGoal,
    audience: input.audience,
    sources: input.sources,
    guidingQuestions: [
      {
        id: 'how-does-it-work-now',
        question: 'How does the request work today?',
        whyItMatters: 'The current path is the baseline for judging the change.',
      },
      {
        id: 'should-we-approve',
        question: 'Does the proposed ownership boundary justify approval?',
        whyItMatters: 'The audience must judge the proposal and its consequential contracts.',
      },
    ],
    coverageItems: [
      {
        id: 'current-request-map',
        title: 'Current request map',
        kind: 'system concept',
        significance: 'Establishes the baseline being changed.',
        details: ['The request crosses the gateway.'],
        guidingQuestionIds: ['how-does-it-work-now'],
        prerequisiteItemIds: [],
        sourceReferences: [{ sourceId: 'current' }],
      },
      {
        id: 'proposed-boundary',
        title: 'Proposed boundary',
        kind: 'architecture decision',
        significance: 'Defines the ownership change being evaluated.',
        details: ['The gateway delegates persistence.'],
        guidingQuestionIds: ['should-we-approve'],
        prerequisiteItemIds: ['current-request-map'],
        sourceReferences: [{ sourceId: 'proposal' }],
      },
      {
        id: 'delegation-example',
        title: 'Delegation example',
        kind: 'example',
        significance: 'Makes the proposed boundary concrete.',
        details: ['Trace one request through the delegation.'],
        guidingQuestionIds: ['should-we-approve'],
        prerequisiteItemIds: ['proposed-boundary'],
        sourceReferences: [{ sourceId: 'proposal' }],
      },
      {
        id: 'editor-contexts-table',
        title: 'Editor contexts table',
        kind: 'database schema',
        significance: 'Makes durable ownership and identity reviewable.',
        details: ['The table stores a stable identifier and ownership state.'],
        guidingQuestionIds: ['should-we-approve'],
        prerequisiteItemIds: ['proposed-boundary'],
        sourceReferences: [{ sourceId: 'proposal' }],
      },
      {
        id: 'open-editor-api',
        title: 'Open editor API',
        kind: 'API contract',
        significance: 'Defines the operation that creates or returns editor placement.',
        details: ['The response identifies the stable record and its placement.'],
        guidingQuestionIds: ['should-we-approve'],
        prerequisiteItemIds: ['proposed-boundary'],
        sourceReferences: [{ sourceId: 'proposal' }],
      },
      {
        id: 'repeated-background',
        title: 'Repeated background',
        kind: 'background',
        significance: 'Repeats context already captured by the current request map.',
        details: ['The request crosses the gateway.'],
        guidingQuestionIds: ['how-does-it-work-now'],
        prerequisiteItemIds: [],
        sourceReferences: [{ sourceId: 'current' }],
      },
    ],
  } satisfies CurriculumAnalysis;
}

export function curriculum(input: ParsedInputs) {
  const sourceAnalysis = analysis(input);
  return {
    schemaVersion: 3,
    analysisPath: input.paths.analysisPath,
    learningGoal: input.learningGoal,
    audience: input.audience,
    teachingBrief: input.teachingBrief,
    guidingQuestions: sourceAnalysis.guidingQuestions,
    storyline: {
      title: 'From request map to owned storage',
      throughline: 'Follow the request from its current path into the proposed ownership boundary.',
      rationale: 'The audience needs the baseline before evaluating the proposed boundary and its contracts.',
    },
    cognitionBudget: {
      outcomeLimit: 6,
      neighborhoodLimit: 5,
      exceptions: [],
    },
    neighborhoods: [
      {
        id: 'baseline',
        title: 'Current request map',
        purpose: 'Establish the baseline.',
        narrativeBridge: 'Use the baseline to evaluate the proposed ownership change.',
        outcomes: [{
          id: 'understand-current-path',
          title: 'Understand the current path',
          objective: 'Understand how the request works before judging its replacement.',
          guidingQuestionIds: ['how-does-it-work-now'],
          prerequisiteOutcomeIds: [],
          coverage: [{
            itemId: 'current-request-map',
            role: 'primary',
            visibility: 'required',
            rationale: 'It creates the baseline mental model.',
          }],
        }],
      },
      {
        id: 'proposal',
        title: 'Proposed ownership',
        purpose: 'Connect the boundary to its concrete contracts.',
        narrativeBridge: 'Use the architecture and contracts to reach an approval decision.',
        outcomes: [{
          id: 'judge-proposed-boundary',
          title: 'Judge the proposed boundary',
          objective: 'Understand and evaluate the ownership change and its realization.',
          guidingQuestionIds: ['should-we-approve'],
          prerequisiteOutcomeIds: ['understand-current-path'],
          coverage: [
            {
              itemId: 'proposed-boundary',
              role: 'primary',
              visibility: 'required',
              rationale: 'It creates the proposed ownership model.',
            },
            {
              itemId: 'delegation-example',
              role: 'supporting',
              visibility: 'optional',
              rationale: 'It can clarify the boundary without being necessary to the decision.',
            },
            {
              itemId: 'editor-contexts-table',
              role: 'reference',
              visibility: 'required',
              rationale: 'The database contract must remain inspectable even though it does not create another outcome.',
            },
            {
              itemId: 'open-editor-api',
              role: 'reference',
              visibility: 'required',
              rationale: 'The API contract must remain inspectable even though it does not create another outcome.',
            },
          ],
        }],
      },
    ],
    omissions: [{ itemId: 'repeated-background', reason: 'It repeats the current request map without changing the audience judgment.' }],
  } satisfies Curriculum;
}

export function writeJson(repositoryPath: string, relativePath: string, value: unknown): void {
  write(repositoryPath, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function write(repositoryPath: string, relativePath: string, value: string): void {
  const absolutePath = join(repositoryPath, relativePath);
  mkdirSync(join(absolutePath, '..'), { recursive: true });
  writeFileSync(absolutePath, value);
}
