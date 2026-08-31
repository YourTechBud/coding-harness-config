import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import type { WalkthroughPaths } from './types.js';

export const coverageRoles = ['primary', 'supporting', 'reference'] as const;
export type CoverageRole = (typeof coverageRoles)[number];

export const coverageVisibilities = ['required', 'optional'] as const;
export type CoverageVisibility = (typeof coverageVisibilities)[number];

export type GenericCurriculumAnalysis = {
  readonly schemaVersion: 3;
  readonly coverageItems: readonly {
    readonly id: string;
    readonly title: string;
    readonly kind: string;
    readonly significance: string;
    readonly details: readonly string[];
    readonly sourceReferences: readonly { readonly sourceId: string }[];
  }[];
};

export type GenericCurriculum = {
  readonly schemaVersion: 3;
  readonly analysisPath: string;
  readonly learningGoal: string;
  readonly storyline: {
    readonly title: string;
    readonly throughline: string;
    readonly rationale: string;
  };
  readonly neighborhoods: readonly {
    readonly id: string;
    readonly title: string;
    readonly purpose: string;
    readonly narrativeBridge: string;
    readonly outcomes: readonly {
      readonly id: string;
      readonly title: string;
      readonly objective: string;
      readonly coverage: readonly {
        readonly itemId: string;
        readonly role: CoverageRole;
        readonly visibility: CoverageVisibility;
        readonly rationale: string;
      }[];
    }[];
  }[];
  readonly omissions: readonly { readonly itemId: string; readonly reason: string }[];
};

export type GenericCurriculumBundle = {
  readonly curriculum: GenericCurriculum;
  readonly analysis: GenericCurriculumAnalysis;
};

export type ArchitectedDeckPlan = {
  readonly schemaVersion: 7;
  readonly curriculumPath: string;
  readonly analysisPath: string;
  readonly outputPath: string;
  readonly story: {
    readonly title: string;
    readonly openingPromise: string;
    readonly throughline: string;
    readonly endingResolution: string;
  };
  readonly presentationStrategy: {
    readonly audienceExperience: string;
    readonly compactnessRationale: string;
  };
  readonly openingSlide: {
    readonly id: string;
    readonly titleIntent: string;
    readonly decisionPromise: string;
  };
  readonly neighborhoods: readonly {
    readonly id: string;
    readonly curriculumNeighborhoodId: string;
    readonly title: string;
    readonly purpose: string;
    readonly transition: string;
    readonly contentMoments: readonly {
      readonly id: string;
      readonly audienceConclusion: string;
      readonly outcomeIds: readonly string[];
      readonly coverageItemIds: readonly string[];
    }[];
  }[];
};

export function deckPlanExists(repositoryPath: string, paths: WalkthroughPaths): boolean {
  return artifactExists(repositoryPath, paths.deckPlanPath);
}

export type ReusablePlanningArtifacts = {
  readonly curriculum: boolean;
  readonly deckPlan: boolean;
};

export function inspectPlanningArtifacts(
  repositoryPath: string,
  paths: WalkthroughPaths,
): ReusablePlanningArtifacts {
  const analysisExists = artifactExists(repositoryPath, paths.curriculumAnalysisPath);
  const curriculumExists = artifactExists(repositoryPath, paths.curriculumPath);
  const planExists = artifactExists(repositoryPath, paths.deckPlanPath);

  if (!analysisExists && !curriculumExists) {
    if (planExists) throw new Error('deck plan exists without its curriculum artifacts.');
    return { curriculum: false, deckPlan: false };
  }
  if (analysisExists !== curriculumExists) throw new Error('curriculum analysis and curriculum must either both exist or both be absent.');

  const bundle = readGenericCurriculumBundle(repositoryPath, paths);
  if (!planExists) return { curriculum: true, deckPlan: false };
  readArchitectedDeckPlan(repositoryPath, paths, bundle);
  return { curriculum: true, deckPlan: true };
}

export function removePlanningArtifacts(repositoryPath: string, paths: WalkthroughPaths): readonly string[] {
  const removed: string[] = [];
  for (const artifactPath of [paths.curriculumAnalysisPath, paths.curriculumPath, paths.deckPlanPath]) {
    const absolutePath = resolve(repositoryPath, artifactPath);
    if (!existsSync(absolutePath)) continue;
    rmSync(absolutePath, { force: true });
    removed.push(artifactPath);
  }
  return removed;
}

export function readGenericCurriculumBundle(repositoryPath: string, paths: WalkthroughPaths): GenericCurriculumBundle {
  const curriculum = parseCurriculum(readJson(repositoryPath, paths.curriculumPath), paths);
  const analysis = parseAnalysis(readJson(repositoryPath, curriculum.analysisPath));
  validateCurriculum(curriculum, analysis);
  return { curriculum, analysis };
}

export function readArchitectedDeckPlan(
  repositoryPath: string,
  paths: WalkthroughPaths,
  bundle: GenericCurriculumBundle,
): ArchitectedDeckPlan {
  return parseDeckPlan(readJson(repositoryPath, paths.deckPlanPath), paths, bundle);
}

function parseAnalysis(value: unknown): GenericCurriculumAnalysis {
  const record = object(value, 'curriculum analysis');
  if (record.schemaVersion !== 3) throw new Error('curriculum analysis schemaVersion must be 3.');
  const coverageItems = array(record.coverageItems, 'curriculum analysis coverageItems').map((value, index) => {
    const label = `curriculum analysis coverage item ${index + 1}`;
    const item = object(value, label);
    const sourceReferences = array(item.sourceReferences, `${label} sourceReferences`).map((value, referenceIndex) => {
      const reference = typeof value === 'string' ? { sourceId: value } : object(value, `${label} source reference ${referenceIndex + 1}`);
      return { sourceId: text(reference.sourceId, `${label} source reference ${referenceIndex + 1} sourceId`) };
    });
    if (sourceReferences.length === 0) throw new Error(`${label} requires source references.`);
    return {
      id: kebab(item.id, `${label} id`),
      title: text(item.title, `${label} title`),
      kind: text(item.kind, `${label} kind`),
      significance: text(item.significance, `${label} significance`),
      details: nonEmptyStrings(item.details, `${label} details`),
      sourceReferences,
    };
  });
  if (coverageItems.length === 0) throw new Error('curriculum analysis requires coverage items.');
  unique(coverageItems.map(({ id }) => id), 'curriculum analysis coverage item IDs');
  return { schemaVersion: 3, coverageItems };
}

function parseCurriculum(value: unknown, paths: WalkthroughPaths): GenericCurriculum {
  const record = object(value, 'curriculum');
  if (record.schemaVersion !== 3) throw new Error('curriculum schemaVersion must be 3.');
  const analysisPath = text(record.analysisPath, 'curriculum analysisPath');
  if (analysisPath !== paths.curriculumAnalysisPath) {
    throw new Error(`curriculum analysisPath must be ${paths.curriculumAnalysisPath}.`);
  }
  const storyline = object(record.storyline, 'curriculum storyline');
  const neighborhoods = array(record.neighborhoods, 'curriculum neighborhoods').map((value, neighborhoodIndex) => {
    const label = `curriculum neighborhood ${neighborhoodIndex + 1}`;
    const neighborhood = object(value, label);
    const outcomes = array(neighborhood.outcomes, `${label} outcomes`).map((value, outcomeIndex) => {
      const outcomeLabel = `${label} outcome ${outcomeIndex + 1}`;
      const outcome = object(value, outcomeLabel);
      const coverage = array(outcome.coverage, `${outcomeLabel} coverage`).map((value, coverageIndex) => {
        const coverageLabel = `${outcomeLabel} coverage ${coverageIndex + 1}`;
        const entry = object(value, coverageLabel);
        return {
          itemId: kebab(entry.itemId, `${coverageLabel} itemId`),
          role: enumeration(entry.role, coverageRoles, `${coverageLabel} role`),
          visibility: enumeration(entry.visibility, coverageVisibilities, `${coverageLabel} visibility`),
          rationale: text(entry.rationale, `${coverageLabel} rationale`),
        };
      });
      if (coverage.length === 0) throw new Error(`${outcomeLabel} requires coverage.`);
      return {
        id: kebab(outcome.id, `${outcomeLabel} id`),
        title: text(outcome.title, `${outcomeLabel} title`),
        objective: text(outcome.objective, `${outcomeLabel} objective`),
        coverage,
      };
    });
    if (outcomes.length === 0) throw new Error(`${label} requires outcomes.`);
    return {
      id: kebab(neighborhood.id, `${label} id`),
      title: text(neighborhood.title, `${label} title`),
      purpose: text(neighborhood.purpose, `${label} purpose`),
      narrativeBridge: text(neighborhood.narrativeBridge, `${label} narrativeBridge`),
      outcomes,
    };
  });
  if (neighborhoods.length === 0) throw new Error('curriculum requires neighborhoods.');
  unique(neighborhoods.map(({ id }) => id), 'curriculum neighborhood IDs');
  const outcomeIds = neighborhoods.flatMap(({ outcomes }) => outcomes.map(({ id }) => id));
  unique(outcomeIds, 'curriculum outcome IDs');
  const omissions = array(record.omissions, 'curriculum omissions').map((value, index) => {
    const omission = object(value, `curriculum omission ${index + 1}`);
    return { itemId: kebab(omission.itemId, `curriculum omission ${index + 1} itemId`), reason: text(omission.reason, `curriculum omission ${index + 1} reason`) };
  });
  return {
    schemaVersion: 3,
    analysisPath,
    learningGoal: text(record.learningGoal, 'curriculum learningGoal'),
    storyline: {
      title: text(storyline.title, 'curriculum storyline title'),
      throughline: text(storyline.throughline, 'curriculum storyline throughline'),
      rationale: text(storyline.rationale, 'curriculum storyline rationale'),
    },
    neighborhoods,
    omissions,
  };
}

function validateCurriculum(curriculum: GenericCurriculum, analysis: GenericCurriculumAnalysis): void {
  const accounted = [
    ...curriculum.neighborhoods.flatMap(({ outcomes }) => outcomes.flatMap(({ coverage }) => coverage.map(({ itemId }) => itemId))),
    ...curriculum.omissions.map(({ itemId }) => itemId),
  ];
  unique(accounted, 'curriculum coverage and omission item IDs');
  const expected = analysis.coverageItems.map(({ id }) => id);
  if (accounted.length !== expected.length || expected.some((id) => !accounted.includes(id))) {
    throw new Error('curriculum must map or omit every analysis coverage item exactly once.');
  }
}

function parseDeckPlan(value: unknown, paths: WalkthroughPaths, bundle: GenericCurriculumBundle): ArchitectedDeckPlan {
  const record = object(value, 'deck plan');
  if (record.schemaVersion !== 7) throw new Error('deck plan schemaVersion must be 7.');
  if (record.curriculumPath !== paths.curriculumPath || record.analysisPath !== bundle.curriculum.analysisPath || record.outputPath !== paths.htmlPath) {
    throw new Error('deck plan paths must match the curriculum and workflow outputs.');
  }
  const story = object(record.story, 'deck plan story');
  const strategy = object(record.presentationStrategy, 'deck plan presentationStrategy');
  const opening = object(record.openingSlide, 'deck plan openingSlide');
  const momentIds = [kebab(opening.id, 'deck plan openingSlide id')];
  const mappedOutcomes: string[] = [];
  const mappedItems: string[] = [];
  const neighborhoods = array(record.neighborhoods, 'deck plan neighborhoods').map((value, neighborhoodIndex) => {
    const label = `deck plan neighborhood ${neighborhoodIndex + 1}`;
    const neighborhood = object(value, label);
    const expectedNeighborhood = bundle.curriculum.neighborhoods[neighborhoodIndex];
    if (!expectedNeighborhood || neighborhood.curriculumNeighborhoodId !== expectedNeighborhood.id) {
      throw new Error(`${label} must map curriculum neighborhood ${expectedNeighborhood?.id ?? 'absent'}.`);
    }
    const contentMoments = array(neighborhood.contentMoments, `${label} contentMoments`).map((value, momentIndex) => {
      const momentLabel = `${label} content moment ${momentIndex + 1}`;
      const moment = object(value, momentLabel);
      const outcomeIds = nonEmptyStrings(moment.outcomeIds, `${momentLabel} outcomeIds`);
      for (const outcomeId of outcomeIds) {
        if (!expectedNeighborhood.outcomes.some(({ id }) => id === outcomeId)) throw new Error(`${momentLabel} outcome ${outcomeId} does not belong to ${expectedNeighborhood.id}.`);
        mappedOutcomes.push(outcomeId);
      }
      const coverageItemIds = nonEmptyStrings(moment.coverageItemIds, `${momentLabel} coverageItemIds`).map((value, coverageIndex) => {
        const itemId = kebab(value, `${momentLabel} coverageItemIds ${coverageIndex + 1}`);
        const expectedCoverage = expectedNeighborhood.outcomes.flatMap(({ coverage }) => coverage).find((candidate) => candidate.itemId === itemId);
        if (!expectedCoverage) throw new Error(`${momentLabel} coverage item ${itemId} does not belong to ${expectedNeighborhood.id}.`);
        mappedItems.push(itemId);
        return itemId;
      });
      const id = kebab(moment.id, `${momentLabel} id`);
      momentIds.push(id);
      return {
        id,
        audienceConclusion: text(moment.audienceConclusion, `${momentLabel} audienceConclusion`),
        outcomeIds,
        coverageItemIds,
      };
    });
    if (contentMoments.length === 0) throw new Error(`${label} requires contentMoments.`);
    return {
      id: kebab(neighborhood.id, `${label} id`),
      curriculumNeighborhoodId: expectedNeighborhood.id,
      title: text(neighborhood.title, `${label} title`),
      purpose: text(neighborhood.purpose, `${label} purpose`),
      transition: text(neighborhood.transition, `${label} transition`),
      contentMoments,
    };
  });
  if (neighborhoods.length !== bundle.curriculum.neighborhoods.length) throw new Error('deck plan must preserve every curriculum neighborhood in order.');
  unique(momentIds, 'deck plan opening and content moment IDs');
  const expectedOutcomeIds = bundle.curriculum.neighborhoods.flatMap(({ outcomes }) => outcomes.map(({ id }) => id));
  if (expectedOutcomeIds.some((id) => !mappedOutcomes.includes(id))) {
    throw new Error('deck plan must represent every curriculum outcome.');
  }
  unique(mappedItems, 'deck plan coverage item IDs');
  const expectedItemIds = bundle.curriculum.neighborhoods.flatMap(({ outcomes }) => outcomes.flatMap(({ coverage }) => coverage.map(({ itemId }) => itemId)));
  if (mappedItems.length !== expectedItemIds.length || expectedItemIds.some((id) => !mappedItems.includes(id))) {
    throw new Error('deck plan must map every retained curriculum coverage item exactly once.');
  }
  return {
    schemaVersion: 7,
    curriculumPath: paths.curriculumPath,
    analysisPath: bundle.curriculum.analysisPath,
    outputPath: paths.htmlPath,
    story: {
      title: text(story.title, 'deck plan story title'),
      openingPromise: text(story.openingPromise, 'deck plan story openingPromise'),
      throughline: text(story.throughline, 'deck plan story throughline'),
      endingResolution: text(story.endingResolution, 'deck plan story endingResolution'),
    },
    presentationStrategy: {
      audienceExperience: text(strategy.audienceExperience, 'deck plan presentationStrategy audienceExperience'),
      compactnessRationale: text(strategy.compactnessRationale, 'deck plan presentationStrategy compactnessRationale'),
    },
    openingSlide: {
      id: momentIds[0]!,
      titleIntent: text(opening.titleIntent, 'deck plan openingSlide titleIntent'),
      decisionPromise: text(opening.decisionPromise, 'deck plan openingSlide decisionPromise'),
    },
    neighborhoods,
  };
}

function readJson(repositoryPath: string, artifactPath: string): unknown {
  const absolutePath = resolve(repositoryPath, artifactPath);
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) throw new Error(`Expected ${artifactPath} to exist.`);
  try {
    return JSON.parse(readFileSync(absolutePath, 'utf8')) as unknown;
  } catch (error) {
    throw new Error(`${artifactPath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function artifactExists(repositoryPath: string, artifactPath: string): boolean {
  const absolutePath = resolve(repositoryPath, artifactPath);
  return existsSync(absolutePath) && statSync(absolutePath).isFile();
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

function strings(value: unknown, label: string): readonly string[] {
  return array(value, label).map((item, index) => text(item, `${label}[${index}]`));
}

function nonEmptyStrings(value: unknown, label: string): readonly string[] {
  const values = strings(value, label);
  if (values.length === 0) throw new Error(`${label} must not be empty.`);
  return values;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be non-empty text.`);
  return value;
}

function kebab(value: unknown, label: string): string {
  const result = text(value, label);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(result)) throw new Error(`${label} must be kebab-case ASCII.`);
  return result;
}

function enumeration<const Value extends string>(value: unknown, allowed: readonly Value[], label: string): Value {
  if (typeof value === 'string' && allowed.includes(value as Value)) return value as Value;
  throw new Error(`${label} must be one of: ${allowed.join(', ')}.`);
}

function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique.`);
}
