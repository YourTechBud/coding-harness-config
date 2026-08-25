import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  artifactDescriptors,
  artifactKinds,
  descriptorFor,
  pathFor,
  type ArtifactKind,
  type ArtifactPaths,
  type AudienceProfile,
  type Curriculum,
  type CurriculumBeat,
  type CurriculumChapter,
  type DeckPlan,
  type InventoryTerm,
  type SourceReference,
  type TopicInventory,
  type WalkthroughPaths,
} from './types.js';

export function readTopicInventories(
  repositoryPath: string,
  sources: ArtifactPaths,
  paths: WalkthroughPaths,
): Record<ArtifactKind, TopicInventory> {
  return Object.fromEntries(
    artifactDescriptors.map((descriptor) => [
      descriptor.kind,
      parseTopicInventory(
        readJsonFile(repositoryPath, pathFor(paths.inventoryPaths, descriptor.kind)),
        descriptor.kind,
        pathFor(sources, descriptor.kind),
      ),
    ]),
  ) as Record<ArtifactKind, TopicInventory>;
}

export function readCurriculum(
  repositoryPath: string,
  story: string,
  sources: ArtifactPaths,
  audienceProfile: AudienceProfile,
  paths: WalkthroughPaths,
  inventories: Record<ArtifactKind, TopicInventory>,
): Curriculum {
  return parseCurriculum(
    readJsonFile(repositoryPath, paths.curriculumPath),
    story,
    sources,
    audienceProfile,
    inventories,
  );
}

export function readDeckPlan(
  repositoryPath: string,
  paths: WalkthroughPaths,
  curriculum: Curriculum,
): DeckPlan {
  return parseDeckPlan(readJsonFile(repositoryPath, paths.deckPlanPath), paths, curriculum);
}

export function assertExpectedFile(
  repositoryPath: string,
  artifactPath: string,
  label: string,
): void {
  const absolutePath = resolve(repositoryPath, artifactPath);
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    throw new Error(`Expected ${label} file ${artifactPath} was not created.`);
  }
}

export function readArtifactText(repositoryPath: string, artifactPath: string): string {
  return readTextFile(repositoryPath, artifactPath);
}

function parseTopicInventory(
  value: unknown,
  expectedKind: ArtifactKind,
  expectedSourcePath: string,
): TopicInventory {
  const label = `${expectedKind} inventory`;
  const record = exactRecord(value, ['schemaVersion', 'artifact', 'candidates'], label);
  if (record.schemaVersion !== 2) throw new Error(`${label} schemaVersion must be 2.`);
  const artifact = exactRecord(record.artifact, ['kind', 'sourcePath'], `${label} artifact`);
  if (artifact.kind !== expectedKind || artifact.sourcePath !== expectedSourcePath) {
    throw new Error(`${label} artifact must identify ${expectedKind} at ${expectedSourcePath}.`);
  }
  const candidates = arrayValue(record.candidates, `${label} candidates`).map((value, index) => {
    const candidateLabel = `${label} candidate ${index + 1}`;
    const candidate = exactRecord(
      value,
      [
        'candidateId',
        'title',
        'learningObjective',
        'whyRequired',
        'prerequisiteCandidateIds',
        'terms',
        'keyPoints',
        'representationOpportunities',
        'sourceReferences',
      ],
      candidateLabel,
    );
    const candidateId = kebabString(candidate.candidateId, `${candidateLabel} candidateId`);
    const sourceReferences = sourceReferenceArray(candidate.sourceReferences, `${candidateLabel} sourceReferences`);
    if (sourceReferences.length === 0) throw new Error(`${candidateLabel} requires a source reference.`);
    const keyPoints = stringArray(candidate.keyPoints, `${candidateLabel} keyPoints`);
    if (keyPoints.length === 0) throw new Error(`${candidateLabel} requires at least one key point.`);
    return {
      candidateId,
      title: nonEmptyString(candidate.title, `${candidateLabel} title`),
      learningObjective: nonEmptyString(candidate.learningObjective, `${candidateLabel} learningObjective`),
      whyRequired: nonEmptyString(candidate.whyRequired, `${candidateLabel} whyRequired`),
      prerequisiteCandidateIds: stringArray(candidate.prerequisiteCandidateIds, `${candidateLabel} prerequisiteCandidateIds`),
      terms: termArray(candidate.terms, `${candidateLabel} terms`),
      keyPoints,
      representationOpportunities: stringArray(candidate.representationOpportunities, `${candidateLabel} representationOpportunities`),
      sourceReferences,
    };
  });
  if (candidates.length === 0) throw new Error(`${label} requires at least one candidate.`);
  const ids = new Set(candidates.map((candidate) => candidate.candidateId));
  if (ids.size !== candidates.length) throw new Error(`${label} candidate IDs must be unique.`);
  for (const candidate of candidates) {
    for (const prerequisite of candidate.prerequisiteCandidateIds) {
      if (!ids.has(prerequisite)) throw new Error(`${label} candidate ${candidate.candidateId} references unknown prerequisite ${prerequisite}.`);
    }
  }
  return {
    schemaVersion: 2,
    artifact: { kind: expectedKind, sourcePath: expectedSourcePath },
    candidates,
  };
}

function parseCurriculum(
  value: unknown,
  expectedStory: string,
  expectedSources: ArtifactPaths,
  expectedProfile: AudienceProfile,
  inventories: Record<ArtifactKind, TopicInventory>,
): Curriculum {
  const record = exactRecord(
    value,
    ['schemaVersion', 'story', 'sources', 'audienceProfile', 'audienceContract', 'chapters', 'omissions'],
    'curriculum',
  );
  if (record.schemaVersion !== 2) throw new Error('curriculum schemaVersion must be 2.');
  const story = exactRecord(record.story, ['reference', 'title', 'throughline'], 'curriculum story');
  if (story.reference !== expectedStory) throw new Error(`curriculum story reference must be ${expectedStory}.`);
  const sources = parseArtifactPaths(record.sources, 'curriculum sources');
  if (!sameArtifactPaths(sources, expectedSources)) throw new Error('curriculum sources must match the workflow inputs.');
  const profile = exactRecord(record.audienceProfile, ['familiarity', 'technicalDepth'], 'curriculum audienceProfile');
  if (profile.familiarity !== expectedProfile.familiarity || profile.technicalDepth !== expectedProfile.technicalDepth) {
    throw new Error('curriculum audienceProfile must match the workflow inputs.');
  }
  const hasLanguagePolicy = isRecordWithKey(record.audienceContract, 'languagePolicy');
  const contract = exactRecord(
    record.audienceContract,
    hasLanguagePolicy
      ? ['assumedKnowledge', 'orientationPolicy', 'technicalDetailPolicy', 'evidencePolicy', 'languagePolicy']
      : ['assumedKnowledge', 'orientationPolicy', 'technicalDetailPolicy', 'evidencePolicy'],
    'curriculum audienceContract',
  );
  const chapters = arrayValue(record.chapters, 'curriculum chapters').map((chapter, index) =>
    parseCurriculumChapter(chapter, artifactKinds[index], index),
  );
  if (chapters.length !== artifactKinds.length) throw new Error('curriculum requires exactly three chapters.');
  const omissions = arrayValue(record.omissions, 'curriculum omissions').map((value, index) => {
    const omission = exactRecord(value, ['candidate', 'reason'], `curriculum omission ${index + 1}`);
    return {
      candidate: parseCandidateReference(omission.candidate, `curriculum omission ${index + 1} candidate`),
      reason: nonEmptyString(omission.reason, `curriculum omission ${index + 1} reason`),
    };
  });
  validateCurriculum(chapters, omissions, inventories);
  return {
    schemaVersion: 2,
    story: {
      reference: expectedStory,
      title: nonEmptyString(story.title, 'curriculum story title'),
      throughline: nonEmptyString(story.throughline, 'curriculum story throughline'),
    },
    sources,
    audienceProfile: expectedProfile,
    audienceContract: {
      assumedKnowledge: stringArray(contract.assumedKnowledge, 'curriculum assumedKnowledge'),
      orientationPolicy: nonEmptyString(contract.orientationPolicy, 'curriculum orientationPolicy'),
      technicalDetailPolicy: nonEmptyString(contract.technicalDetailPolicy, 'curriculum technicalDetailPolicy'),
      evidencePolicy: nonEmptyString(contract.evidencePolicy, 'curriculum evidencePolicy'),
      ...(hasLanguagePolicy
        ? { languagePolicy: nonEmptyString(contract.languagePolicy, 'curriculum languagePolicy') }
        : {}),
    },
    chapters,
    omissions,
  };
}

function isRecordWithKey(value: unknown, key: string): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, key);
}

function parseCurriculumChapter(value: unknown, expectedId: ArtifactKind | undefined, index: number): CurriculumChapter {
  const label = `curriculum chapter ${index + 1}`;
  const record = exactRecord(value, ['id', 'title', 'purpose', 'openingContext', 'synthesisObjective', 'beats'], label);
  const id = artifactKind(record.id, `${label} id`);
  if (id !== expectedId) throw new Error(`${label} must be ${expectedId}.`);
  const beats = arrayValue(record.beats, `${label} beats`).map((beat, beatIndex) =>
    parseCurriculumBeat(beat, id, beatIndex),
  );
  if (beats.length === 0) throw new Error(`${label} requires at least one beat.`);
  return {
    id,
    title: nonEmptyString(record.title, `${label} title`),
    purpose: nonEmptyString(record.purpose, `${label} purpose`),
    openingContext: nonEmptyString(record.openingContext, `${label} openingContext`),
    synthesisObjective: nonEmptyString(record.synthesisObjective, `${label} synthesisObjective`),
    beats,
  };
}

function parseCurriculumBeat(value: unknown, chapter: ArtifactKind, index: number): CurriculumBeat {
  const label = `${chapter} curriculum beat ${index + 1}`;
  const record = exactRecord(
    value,
    [
      'id', 'title', 'objective', 'narrativeBridge', 'candidateReferences', 'prerequisiteBeatIds',
      'requiredContent', 'supportingMaterial', 'termsToIntroduce', 'realizationPoint',
      'comprehensionObjective', 'representationOpportunities', 'sourceReferences',
    ],
    label,
  );
  const id = nonEmptyString(record.id, `${label} id`);
  const prefix = descriptorFor(chapter).topicPrefix;
  if (id !== `${prefix}-${String(index + 1).padStart(2, '0')}`) throw new Error(`${label} id must be ${prefix}-NN in sequence.`);
  const candidateReferences = arrayValue(record.candidateReferences, `${label} candidateReferences`).map((reference, referenceIndex) =>
    parseCandidateReference(reference, `${label} candidate reference ${referenceIndex + 1}`),
  );
  if (candidateReferences.length === 0) throw new Error(`${label} requires a candidate reference.`);
  const requiredContent = stringArray(record.requiredContent, `${label} requiredContent`);
  if (requiredContent.length === 0) throw new Error(`${label} requires requiredContent.`);
  const sourceReferences = sourceReferenceArray(record.sourceReferences, `${label} sourceReferences`);
  if (sourceReferences.length === 0) throw new Error(`${label} requires a source reference.`);
  return {
    id,
    title: nonEmptyString(record.title, `${label} title`),
    objective: nonEmptyString(record.objective, `${label} objective`),
    narrativeBridge: nonEmptyString(record.narrativeBridge, `${label} narrativeBridge`),
    candidateReferences,
    prerequisiteBeatIds: stringArray(record.prerequisiteBeatIds, `${label} prerequisiteBeatIds`),
    requiredContent,
    supportingMaterial: stringArray(record.supportingMaterial, `${label} supportingMaterial`),
    termsToIntroduce: termArray(record.termsToIntroduce, `${label} termsToIntroduce`),
    realizationPoint: nullableString(record.realizationPoint, `${label} realizationPoint`),
    comprehensionObjective: nullableString(record.comprehensionObjective, `${label} comprehensionObjective`),
    representationOpportunities: stringArray(record.representationOpportunities, `${label} representationOpportunities`),
    sourceReferences,
  };
}

function validateCurriculum(
  chapters: readonly CurriculumChapter[],
  omissions: Curriculum['omissions'],
  inventories: Record<ArtifactKind, TopicInventory>,
): void {
  const beatIds = new Set<string>();
  const accounted = new Set<string>();
  const introducedTerms = new Set<string>();
  for (const chapter of chapters) {
    for (const beat of chapter.beats) {
      if (beatIds.has(beat.id)) throw new Error(`curriculum has duplicate beat ${beat.id}.`);
      for (const prerequisite of beat.prerequisiteBeatIds) {
        if (!beatIds.has(prerequisite)) throw new Error(`Beat ${beat.id} prerequisite ${prerequisite} must appear earlier.`);
      }
      for (const reference of beat.candidateReferences) accountCandidate(reference, inventories, accounted, `beat ${beat.id}`);
      for (const term of beat.termsToIntroduce) {
        const normalized = term.term.toLocaleLowerCase('en-US');
        if (introducedTerms.has(normalized)) throw new Error(`Term ${term.term} is introduced more than once.`);
        introducedTerms.add(normalized);
      }
      beatIds.add(beat.id);
    }
  }
  for (const omission of omissions) accountCandidate(omission.candidate, inventories, accounted, 'omission');
  for (const kind of artifactKinds) {
    for (const candidate of inventories[kind].candidates) {
      const key = `${kind}:${candidate.candidateId}`;
      if (!accounted.has(key)) throw new Error(`Inventory candidate ${key} is not represented or omitted.`);
    }
  }
}

function accountCandidate(
  reference: { readonly artifact: ArtifactKind; readonly candidateId: string },
  inventories: Record<ArtifactKind, TopicInventory>,
  accounted: Set<string>,
  label: string,
): void {
  const key = `${reference.artifact}:${reference.candidateId}`;
  if (!inventories[reference.artifact].candidates.some((candidate) => candidate.candidateId === reference.candidateId)) {
    throw new Error(`${label} references unknown candidate ${key}.`);
  }
  if (accounted.has(key)) throw new Error(`Inventory candidate ${key} is accounted for twice.`);
  accounted.add(key);
}

function parseDeckPlan(value: unknown, paths: WalkthroughPaths, curriculum: Curriculum): DeckPlan {
  const record = exactRecord(value, ['schemaVersion', 'curriculumPath', 'outputPath', 'slides', 'realizationUnits'], 'deck plan');
  if (record.schemaVersion !== 1) throw new Error('deck plan schemaVersion must be 1.');
  if (record.curriculumPath !== paths.curriculumPath || record.outputPath !== paths.htmlPath) throw new Error('deck plan paths must match the workflow paths.');
  const beatOrder = curriculum.chapters.flatMap((chapter) => chapter.beats.map((beat) => beat.id));
  const beatChapter = new Map(curriculum.chapters.flatMap((chapter) => chapter.beats.map((beat) => [beat.id, chapter.id] as const)));
  const slides = arrayValue(record.slides, 'deck plan slides').map((value, index) => {
    const label = `deck plan slide ${index + 1}`;
    const slide = exactRecord(value, ['id', 'chapterId', 'beatIds', 'title', 'purpose', 'contentResponsibilities', 'representationIntent', 'progressiveDisclosure'], label);
    const beatIds = stringArray(slide.beatIds, `${label} beatIds`);
    if (beatIds.length === 0) throw new Error(`${label} requires a beatId.`);
    const chapterId = artifactKind(slide.chapterId, `${label} chapterId`);
    for (const beatId of beatIds) {
      if (!beatChapter.has(beatId) || beatChapter.get(beatId) !== chapterId) throw new Error(`${label} beat ${beatId} must belong to ${chapterId}.`);
    }
    return {
      id: kebabString(slide.id, `${label} id`),
      chapterId,
      beatIds,
      title: nonEmptyString(slide.title, `${label} title`),
      purpose: nonEmptyString(slide.purpose, `${label} purpose`),
      contentResponsibilities: stringArray(slide.contentResponsibilities, `${label} contentResponsibilities`),
      representationIntent: nullableString(slide.representationIntent, `${label} representationIntent`),
      progressiveDisclosure: stringArray(slide.progressiveDisclosure, `${label} progressiveDisclosure`),
    };
  });
  if (slides.length === 0) throw new Error('deck plan requires at least one slide.');
  uniqueValues(slides.map((slide) => slide.id), 'deck plan slide IDs');
  const mappedBeats = new Set(slides.flatMap((slide) => slide.beatIds));
  if (!sameValues(beatOrder, beatOrder.filter((beatId) => mappedBeats.has(beatId))) || mappedBeats.size !== beatOrder.length) {
    throw new Error('deck plan must map every curriculum beat.');
  }
  let lastBeatIndex = -1;
  for (const slide of slides) {
    const firstIndex = beatOrder.indexOf(slide.beatIds[0]!);
    if (firstIndex < lastBeatIndex) throw new Error('deck plan slides must follow curriculum order.');
    lastBeatIndex = firstIndex;
  }
  const units = arrayValue(record.realizationUnits, 'deck plan realizationUnits').map((value, index) => {
    const label = `deck plan realization unit ${index + 1}`;
    const unit = exactRecord(value, ['id', 'slideIds'], label);
    const slideIds = stringArray(unit.slideIds, `${label} slideIds`);
    if (slideIds.length === 0) throw new Error(`${label} requires a slideId.`);
    return { id: kebabString(unit.id, `${label} id`), slideIds };
  });
  if (units.length === 0) throw new Error('deck plan requires at least one realization unit.');
  uniqueValues(units.map((unit) => unit.id), 'deck plan realization unit IDs');
  const plannedSlideIds = slides.map((slide) => slide.id);
  const unitSlideIds = units.flatMap((unit) => unit.slideIds);
  if (!sameValues(unitSlideIds, plannedSlideIds)) throw new Error('realization units must assign every slide exactly once in deck order.');
  return { schemaVersion: 1, curriculumPath: paths.curriculumPath, outputPath: paths.htmlPath, slides, realizationUnits: units };
}

function parseCandidateReference(value: unknown, label: string) {
  const record = exactRecord(value, ['artifact', 'candidateId'], label);
  return {
    artifact: artifactKind(record.artifact, `${label} artifact`),
    candidateId: nonEmptyString(record.candidateId, `${label} candidateId`),
  };
}

function parseArtifactPaths(value: unknown, label: string): ArtifactPaths {
  const record = exactRecord(value, ['currentStatePath', 'architecturePath', 'programDesignPath'], label);
  return {
    currentStatePath: nonEmptyString(record.currentStatePath, `${label} currentStatePath`),
    architecturePath: nonEmptyString(record.architecturePath, `${label} architecturePath`),
    programDesignPath: nonEmptyString(record.programDesignPath, `${label} programDesignPath`),
  };
}

function sameArtifactPaths(left: ArtifactPaths, right: ArtifactPaths): boolean {
  return left.currentStatePath === right.currentStatePath && left.architecturePath === right.architecturePath && left.programDesignPath === right.programDesignPath;
}

function sourceReferenceArray(value: unknown, label: string): readonly SourceReference[] {
  return arrayValue(value, label).map((item, index) => parseSourceReference(item, `${label}[${index}]`));
}

function termArray(value: unknown, label: string): readonly InventoryTerm[] {
  return arrayValue(value, label).map((item, index) => parseTerm(item, `${label}[${index}]`));
}

function kebabString(value: unknown, label: string): string {
  const result = nonEmptyString(value, label);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result)) throw new Error(`${label} must be kebab-case ASCII.`);
  return result;
}

function enumString<const Value extends string>(
  value: unknown,
  allowed: readonly Value[],
  label: string,
): Value {
  if (typeof value === 'string' && allowed.includes(value as Value)) return value as Value;
  throw new Error(`${label} must be one of: ${allowed.join(', ')}.`);
}

function uniqueValues(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique.`);
}

function parseSourceReference(value: unknown, label: string): SourceReference {
  const record = exactRecord(value, ['heading', 'locator'], label);
  return {
    heading: nonEmptyString(record.heading, `${label} heading`),
    locator: nonEmptyString(record.locator, `${label} locator`),
  };
}

function parseTerm(value: unknown, label: string): InventoryTerm {
  const record = exactRecord(value, ['term', 'meaning'], label);
  return {
    term: nonEmptyString(record.term, `${label} term`),
    meaning: nonEmptyString(record.meaning, `${label} meaning`),
  };
}

function readJsonFile(repositoryPath: string, artifactPath: string): unknown {
  const text = readTextFile(repositoryPath, artifactPath);
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`${artifactPath} is not valid JSON: ${errorText(error)}`);
  }
}

function readTextFile(repositoryPath: string, artifactPath: string): string {
  assertExpectedFile(repositoryPath, artifactPath, 'walkthrough');
  return readFileSync(resolve(repositoryPath, artifactPath), 'utf8');
}

function exactRecord(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const record = value as Record<string, unknown>;
  const actualKeys = Object.keys(record);
  if (
    actualKeys.length !== keys.length ||
    keys.some((key) => !Object.prototype.hasOwnProperty.call(record, key))
  ) {
    throw new Error(`${label} must contain exactly these keys: ${keys.join(', ')}.`);
  }
  return record;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be non-empty text.`);
  }
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return nonEmptyString(value, label);
}

function arrayValue(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

function stringArray(value: unknown, label: string): readonly string[] {
  return arrayValue(value, label).map((item, index) => nonEmptyString(item, `${label}[${index}]`));
}

function artifactKind(value: unknown, label: string): ArtifactKind {
  if (typeof value === 'string' && artifactKinds.some((kind) => kind === value)) {
    return value as ArtifactKind;
  }
  throw new Error(`${label} must be one of: ${artifactKinds.join(', ')}.`);
}

function sameValues(left: readonly unknown[], right: readonly unknown[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function errorText(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}
