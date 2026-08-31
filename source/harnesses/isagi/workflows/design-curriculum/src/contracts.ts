import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { cognitionBudgetConstraints, coverageRoles, coverageVisibilities, type AudienceDescription, type CognitionBudgetConstraint, type CoverageItem, type Curriculum, type CurriculumAnalysis, type CurriculumPaths, type CurriculumSource, type GuidingQuestion, type SourceReference } from './types.js';

export function readAnalysis(repositoryPath: string, learningGoal: string, audience: AudienceDescription, sources: readonly CurriculumSource[], paths: CurriculumPaths): CurriculumAnalysis {
  const value = object(readJson(repositoryPath, paths.analysisPath), 'curriculum analysis');
  if (value.schemaVersion !== 3) throw new Error('curriculum analysis schemaVersion must be 3.');
  if (value.learningGoal !== learningGoal) throw new Error('curriculum analysis learningGoal must match the workflow input.');
  const parsedAudience = parseAudience(value.audience, 'curriculum analysis audience');
  if (!sameAudience(parsedAudience, audience)) throw new Error('curriculum analysis audience must match the workflow input.');
  const parsedSources = parseSources(value.sources, 'curriculum analysis sources');
  if (JSON.stringify(parsedSources) !== JSON.stringify(sources)) throw new Error('curriculum analysis sources must match the workflow inputs.');
  const guidingQuestions = parseGuidingQuestions(value.guidingQuestions, 'curriculum analysis guidingQuestions');
  if (guidingQuestions.length === 0) throw new Error('curriculum analysis requires at least one guiding question.');
  const questionIds = new Set(guidingQuestions.map(({ id }) => id));
  const coverageItems = array(value.coverageItems, 'curriculum analysis coverageItems').map((item, index) => parseCoverageItem(item, index, sources, questionIds));
  if (coverageItems.length === 0) throw new Error('curriculum analysis requires at least one coverage item.');
  unique(coverageItems.map(({ id }) => id), 'curriculum coverage item IDs');
  const itemIds = new Set(coverageItems.map(({ id }) => id));
  for (const item of coverageItems) {
    for (const prerequisite of item.prerequisiteItemIds) if (!itemIds.has(prerequisite)) throw new Error(`Coverage item ${item.id} references unknown prerequisite ${prerequisite}.`);
  }
  for (const question of guidingQuestions) {
    if (!coverageItems.some((item) => item.guidingQuestionIds.includes(question.id))) throw new Error(`Guiding question ${question.id} is not represented by any coverage item.`);
  }
  return { schemaVersion: 3, learningGoal, audience, sources, guidingQuestions, coverageItems };
}

export function readCurriculum(repositoryPath: string, teachingBrief: string, paths: CurriculumPaths, analysis: CurriculumAnalysis): Curriculum {
  const value = object(readJson(repositoryPath, paths.curriculumPath), 'curriculum');
  if (value.schemaVersion !== 3) throw new Error('curriculum schemaVersion must be 3.');
  if (value.analysisPath !== paths.analysisPath || value.learningGoal !== analysis.learningGoal || value.teachingBrief !== teachingBrief) throw new Error('curriculum inputs must match the workflow inputs.');
  const audience = parseAudience(value.audience, 'curriculum audience');
  if (!sameAudience(audience, analysis.audience)) throw new Error('curriculum audience must match the analysis.');
  const guidingQuestions = parseGuidingQuestions(value.guidingQuestions, 'curriculum guidingQuestions');
  if (JSON.stringify(guidingQuestions) !== JSON.stringify(analysis.guidingQuestions)) throw new Error('curriculum guidingQuestions must match the analysis.');
  const storylineValue = object(value.storyline, 'curriculum storyline');
  const cognitionBudget = parseCognitionBudget(value.cognitionBudget);
  const neighborhoods = array(value.neighborhoods, 'curriculum neighborhoods').map((neighborhood, index) => parseNeighborhood(neighborhood, index, analysis));
  if (neighborhoods.length === 0) throw new Error('curriculum requires at least one neighborhood.');
  unique(neighborhoods.map(({ id }) => id), 'curriculum neighborhood IDs');
  const omissions = array(value.omissions, 'curriculum omissions').map((omission, index) => {
    const parsed = object(omission, `curriculum omission ${index + 1}`);
    return { itemId: kebab(parsed.itemId, `curriculum omission ${index + 1} itemId`), reason: text(parsed.reason, `curriculum omission ${index + 1} reason`) };
  });
  validateCurriculum(neighborhoods, omissions, analysis);
  return {
    schemaVersion: 3,
    analysisPath: paths.analysisPath,
    learningGoal: analysis.learningGoal,
    audience,
    teachingBrief,
    guidingQuestions,
    storyline: {
      title: text(storylineValue.title, 'curriculum storyline title'),
      throughline: text(storylineValue.throughline, 'curriculum storyline throughline'),
      rationale: text(storylineValue.rationale, 'curriculum storyline rationale'),
    },
    cognitionBudget,
    neighborhoods,
    omissions,
  };
}

export function assertArtifact(repositoryPath: string, artifactPath: string): void {
  const absolutePath = resolve(repositoryPath, artifactPath);
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) throw new Error(`Expected curriculum artifact ${artifactPath} was not created.`);
}

function parseCoverageItem(value: unknown, index: number, sources: readonly CurriculumSource[], questionIds: ReadonlySet<string>): CoverageItem {
  const label = `curriculum coverage item ${index + 1}`;
  const item = object(value, label);
  const guidingQuestionIds = strings(item.guidingQuestionIds, `${label} guidingQuestionIds`);
  if (guidingQuestionIds.length === 0) throw new Error(`${label} requires guidingQuestionIds.`);
  unique(guidingQuestionIds, `${label} guidingQuestionIds`);
  for (const questionId of guidingQuestionIds) if (!questionIds.has(questionId)) throw new Error(`${label} references unknown guiding question ${questionId}.`);
  const details = strings(item.details, `${label} details`);
  if (details.length === 0) throw new Error(`${label} requires details.`);
  const sourceReferences = sourceReferencesFor(item.sourceReferences, `${label} sourceReferences`, sources);
  if (sourceReferences.length === 0) throw new Error(`${label} requires sourceReferences.`);
  return {
    id: kebab(item.id, `${label} id`),
    title: text(item.title, `${label} title`),
    kind: text(item.kind, `${label} kind`),
    significance: text(item.significance, `${label} significance`),
    details,
    guidingQuestionIds,
    prerequisiteItemIds: strings(item.prerequisiteItemIds, `${label} prerequisiteItemIds`),
    sourceReferences,
  };
}

function parseCognitionBudget(value: unknown): Curriculum['cognitionBudget'] {
  const budget = object(value, 'curriculum cognitionBudget');
  const exceptions = array(budget.exceptions, 'curriculum cognitionBudget exceptions').map((exception, index) => {
    const parsed = object(exception, `curriculum cognitionBudget exception ${index + 1}`);
    return { constraint: enumeration(parsed.constraint, cognitionBudgetConstraints, `curriculum cognitionBudget exception ${index + 1} constraint`), reason: text(parsed.reason, `curriculum cognitionBudget exception ${index + 1} reason`) };
  });
  unique(exceptions.map(({ constraint }) => constraint), 'curriculum cognitionBudget exception constraints');
  return {
    outcomeLimit: positiveInteger(budget.outcomeLimit, 'curriculum cognitionBudget outcomeLimit'),
    neighborhoodLimit: positiveInteger(budget.neighborhoodLimit, 'curriculum cognitionBudget neighborhoodLimit'),
    exceptions,
  };
}

function parseNeighborhood(value: unknown, neighborhoodIndex: number, analysis: CurriculumAnalysis): Curriculum['neighborhoods'][number] {
  const label = `curriculum neighborhood ${neighborhoodIndex + 1}`;
  const neighborhood = object(value, label);
  const knownQuestionIds = new Set(analysis.guidingQuestions.map(({ id }) => id));
  const knownItemIds = new Set(analysis.coverageItems.map(({ id }) => id));
  const outcomes = array(neighborhood.outcomes, `${label} outcomes`).map((value, outcomeIndex) => {
    const outcomeLabel = `${label} outcome ${outcomeIndex + 1}`;
    const outcome = object(value, outcomeLabel);
    const guidingQuestionIds = strings(outcome.guidingQuestionIds, `${outcomeLabel} guidingQuestionIds`);
    if (guidingQuestionIds.length === 0) throw new Error(`${outcomeLabel} requires guidingQuestionIds.`);
    unique(guidingQuestionIds, `${outcomeLabel} guidingQuestionIds`);
    for (const questionId of guidingQuestionIds) if (!knownQuestionIds.has(questionId)) throw new Error(`${outcomeLabel} references unknown guiding question ${questionId}.`);
    const coverage = array(outcome.coverage, `${outcomeLabel} coverage`).map((entry, coverageIndex) => {
      const coverageLabel = `${outcomeLabel} coverage ${coverageIndex + 1}`;
      const parsed = object(entry, coverageLabel);
      const itemId = kebab(parsed.itemId, `${coverageLabel} itemId`);
      if (!knownItemIds.has(itemId)) throw new Error(`${coverageLabel} references unknown coverage item ${itemId}.`);
      return {
        itemId,
        role: enumeration(parsed.role, coverageRoles, `${coverageLabel} role`),
        visibility: enumeration(parsed.visibility, coverageVisibilities, `${coverageLabel} visibility`),
        rationale: text(parsed.rationale, `${coverageLabel} rationale`),
      };
    });
    if (coverage.length === 0) throw new Error(`${outcomeLabel} requires coverage.`);
    return {
      id: kebab(outcome.id, `${outcomeLabel} id`),
      title: text(outcome.title, `${outcomeLabel} title`),
      objective: text(outcome.objective, `${outcomeLabel} objective`),
      guidingQuestionIds,
      prerequisiteOutcomeIds: strings(outcome.prerequisiteOutcomeIds, `${outcomeLabel} prerequisiteOutcomeIds`),
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
}

function validateCurriculum(neighborhoods: Curriculum['neighborhoods'], omissions: Curriculum['omissions'], analysis: CurriculumAnalysis): void {
  const outcomes = neighborhoods.flatMap((neighborhood) => neighborhood.outcomes);
  unique(outcomes.map(({ id }) => id), 'curriculum outcome IDs');
  const encounteredOutcomeIds = new Set<string>();
  for (const outcome of outcomes) {
    for (const prerequisiteId of outcome.prerequisiteOutcomeIds) if (!encounteredOutcomeIds.has(prerequisiteId)) throw new Error(`Outcome ${outcome.id} prerequisite ${prerequisiteId} must appear earlier.`);
    encounteredOutcomeIds.add(outcome.id);
  }
  const accountedItemIds = [
    ...outcomes.flatMap((outcome) => outcome.coverage.map(({ itemId }) => itemId)),
    ...omissions.map(({ itemId }) => itemId),
  ];
  unique(accountedItemIds, 'accounted curriculum coverage item IDs');
  const expectedItemIds = analysis.coverageItems.map(({ id }) => id);
  if (accountedItemIds.length !== expectedItemIds.length || expectedItemIds.some((id) => !accountedItemIds.includes(id))) throw new Error('curriculum must map or omit every analysis coverage item exactly once.');
  for (const omission of omissions) if (!expectedItemIds.includes(omission.itemId)) throw new Error(`Curriculum omission references unknown coverage item ${omission.itemId}.`);
  const representedQuestions = new Set(outcomes.flatMap((outcome) => outcome.guidingQuestionIds));
  for (const question of analysis.guidingQuestions) if (!representedQuestions.has(question.id)) throw new Error(`Curriculum does not address guiding question ${question.id}.`);
}

function sourceReferencesFor(value: unknown, label: string, sources: readonly CurriculumSource[]): readonly SourceReference[] {
  return array(value, label).map((reference, index) => {
    const sourceId = typeof reference === 'string'
      ? text(reference, `${label}[${index}]`)
      : text(object(reference, `${label}[${index}]`).sourceId, `${label}[${index}].sourceId`);
    if (!sources.some(({ id }) => id === sourceId)) throw new Error(`${label}[${index}] references unknown source ${sourceId}.`);
    return { sourceId };
  });
}

function parseGuidingQuestions(value: unknown, label: string): readonly GuidingQuestion[] {
  const questions = array(value, label).map((question, index) => {
    const parsed = object(question, `${label}[${index}]`);
    return { id: kebab(parsed.id, `${label}[${index}].id`), question: text(parsed.question, `${label}[${index}].question`), whyItMatters: text(parsed.whyItMatters, `${label}[${index}].whyItMatters`) };
  });
  unique(questions.map(({ id }) => id), `${label} IDs`);
  return questions;
}

function parseAudience(value: unknown, label: string): AudienceDescription {
  const audience = object(value, label);
  return { familiarity: text(audience.familiarity, `${label} familiarity`), depth: text(audience.depth, `${label} depth`) };
}

function parseSources(value: unknown, label: string): readonly CurriculumSource[] {
  return array(value, label).map((source, index) => {
    const parsed = object(source, `${label}[${index}]`);
    return { id: kebab(parsed.id, `${label}[${index}].id`), path: text(parsed.path, `${label}[${index}].path`), description: nullableText(parsed.description, `${label}[${index}].description`) };
  });
}

function readJson(repositoryPath: string, artifactPath: string): unknown {
  assertArtifact(repositoryPath, artifactPath);
  try {
    return JSON.parse(readFileSync(resolve(repositoryPath, artifactPath), 'utf8')) as unknown;
  } catch (error) {
    throw new Error(`${artifactPath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
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

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be non-empty text.`);
  return value;
}

function nullableText(value: unknown, label: string): string | null {
  if (value === null) return null;
  return text(value, label);
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) throw new Error(`${label} must be a positive integer.`);
  return value as number;
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

function sameAudience(left: AudienceDescription, right: AudienceDescription): boolean {
  return left.familiarity === right.familiarity && left.depth === right.depth;
}

function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique.`);
}
