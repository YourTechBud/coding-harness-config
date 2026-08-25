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
  type CurriculumV2,
  type DeckPlan,
  type InventoryTerm,
  type ReviewPaths,
  type SourceReference,
  type TopicInventory,
  type TopicInventoryV2,
  type WalkthroughV2Paths,
  type WalkthroughTopic,
} from './types.js';

const MAX_LEARNING_OBJECTIVE_WORDS = 40;
const MAX_COMPREHENSION_OBJECTIVE_WORDS = 25;

export function readTopicInventories(
  repositoryPath: string,
  sources: ArtifactPaths,
  review: ReviewPaths,
): Record<ArtifactKind, TopicInventory> {
  return Object.fromEntries(
    artifactDescriptors.map((descriptor) => [
      descriptor.kind,
      parseTopicInventory(
        readJsonFile(repositoryPath, pathFor(review.inventoryPaths, descriptor.kind)),
        descriptor.kind,
        pathFor(sources, descriptor.kind),
      ),
    ]),
  ) as Record<ArtifactKind, TopicInventory>;
}

export function readCurriculum(
  repositoryPath: string,
  sources: ArtifactPaths,
  review: ReviewPaths,
  inventories: Record<ArtifactKind, TopicInventory>,
): Curriculum {
  return parseCurriculum(
    readJsonFile(repositoryPath, review.manifestPath),
    sources,
    review,
    inventories,
  );
}

export function validatePresentationSpecifications(
  repositoryPath: string,
  review: ReviewPaths,
  curriculum: Curriculum,
): void {
  for (const descriptor of artifactDescriptors) {
    const specificationPath = pathFor(review.presentationPaths, descriptor.kind);
    const text = readTextFile(repositoryPath, specificationPath);
    const ownedTopics = curriculum.topics.filter((topic) => topic.artifact === descriptor.kind);
    const declaredIds = [...text.matchAll(/^## Topic `([^`]+)`:/gm)].map((match) => match[1]);
    const expectedIds = ownedTopics.map((topic) => topic.id);
    if (!sameValues(declaredIds, expectedIds)) {
      throw new Error(
        `${specificationPath} must declare topics in this exact order: ${expectedIds.join(', ')}.`,
      );
    }
    for (const [index, topic] of ownedTopics.entries()) {
      const sectionStart = text.indexOf(`## Topic \`${topic.id}\`:`);
      const nextTopic = ownedTopics[index + 1];
      const sectionEnd = nextTopic ? text.indexOf(`## Topic \`${nextTopic.id}\`:`, sectionStart) : text.length;
      const section = text.slice(sectionStart, sectionEnd);
      requireOccurrence(section, `Anchor: \`${topic.browserAnchor}\``, 1, specificationPath);
      for (const heading of [
        '### Browser responsibility',
        '### Guide responsibility',
        '### First visible frame',
        '### Supporting representation',
        '### Progressive disclosure',
        '### Required content',
        '### Source grounding',
      ]) {
        if (!section.includes(heading)) {
          throw new Error(`${specificationPath} topic ${topic.id} is missing required heading ${heading}.`);
        }
      }
    }
  }
}

export function validateHtmlArtifacts(
  repositoryPath: string,
  review: ReviewPaths,
  curriculum: Curriculum,
): void {
  for (const descriptor of artifactDescriptors) {
    const htmlPath = pathFor(review.htmlPaths, descriptor.kind);
    const text = readTextFile(repositoryPath, htmlPath);
    const normalizedText = text.toLocaleLowerCase('en-US');
    for (const internalLabel of [
      'left to the guide',
      'guide responsibility',
      'browser responsibility',
      'required content',
    ]) {
      if (normalizedText.includes(internalLabel)) {
        throw new Error(`${htmlPath} exposes internal production label ${internalLabel}.`);
      }
    }
    const ownedTopics = curriculum.topics.filter((topic) => topic.artifact === descriptor.kind);
    let previousIndex = -1;
    for (const topic of ownedTopics) {
      const doubleQuoted = `id="${topic.browserAnchor}"`;
      const singleQuoted = `id='${topic.browserAnchor}'`;
      const count = occurrenceCount(text, doubleQuoted) + occurrenceCount(text, singleQuoted);
      if (count !== 1) {
        throw new Error(
          `${htmlPath} must contain browser anchor ${topic.browserAnchor} exactly once; found ${count}.`,
        );
      }
      const index = Math.max(text.indexOf(doubleQuoted), text.indexOf(singleQuoted));
      if (index <= previousIndex) {
        throw new Error(`${htmlPath} topic anchors are not in manifest order.`);
      }
      previousIndex = index;
    }
    for (const href of expectedNavigation(descriptor.kind)) {
      if (!text.includes(`href="${href}"`) && !text.includes(`href='${href}'`)) {
        throw new Error(`${htmlPath} is missing navigation link ${href}.`);
      }
    }
  }
}

export function readTopicInventoriesV2(
  repositoryPath: string,
  sources: ArtifactPaths,
  paths: WalkthroughV2Paths,
): Record<ArtifactKind, TopicInventoryV2> {
  return Object.fromEntries(
    artifactDescriptors.map((descriptor) => [
      descriptor.kind,
      parseTopicInventoryV2(
        readJsonFile(repositoryPath, pathFor(paths.inventoryPaths, descriptor.kind)),
        descriptor.kind,
        pathFor(sources, descriptor.kind),
      ),
    ]),
  ) as Record<ArtifactKind, TopicInventoryV2>;
}

export function readCurriculumV2(
  repositoryPath: string,
  story: string,
  sources: ArtifactPaths,
  audienceProfile: AudienceProfile,
  paths: WalkthroughV2Paths,
  inventories: Record<ArtifactKind, TopicInventoryV2>,
): CurriculumV2 {
  return parseCurriculumV2(
    readJsonFile(repositoryPath, paths.curriculumPath),
    story,
    sources,
    audienceProfile,
    inventories,
  );
}

export function readDeckPlan(
  repositoryPath: string,
  paths: WalkthroughV2Paths,
  curriculum: CurriculumV2,
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

export function artifactFileExists(repositoryPath: string, artifactPath: string): boolean {
  const absolutePath = resolve(repositoryPath, artifactPath);
  return existsSync(absolutePath) && statSync(absolutePath).isFile();
}

export function readArtifactText(repositoryPath: string, artifactPath: string): string {
  return readTextFile(repositoryPath, artifactPath);
}

function parseTopicInventoryV2(
  value: unknown,
  expectedKind: ArtifactKind,
  expectedSourcePath: string,
): TopicInventoryV2 {
  const label = `${expectedKind} v2 inventory`;
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

function parseCurriculumV2(
  value: unknown,
  expectedStory: string,
  expectedSources: ArtifactPaths,
  expectedProfile: AudienceProfile,
  inventories: Record<ArtifactKind, TopicInventoryV2>,
): CurriculumV2 {
  const record = exactRecord(
    value,
    ['schemaVersion', 'story', 'sources', 'audienceProfile', 'audienceContract', 'chapters', 'omissions'],
    'v2 curriculum',
  );
  if (record.schemaVersion !== 2) throw new Error('v2 curriculum schemaVersion must be 2.');
  const story = exactRecord(record.story, ['reference', 'title', 'throughline'], 'v2 curriculum story');
  if (story.reference !== expectedStory) throw new Error(`v2 curriculum story reference must be ${expectedStory}.`);
  const sources = parseArtifactPaths(record.sources, 'v2 curriculum sources');
  if (!sameArtifactPaths(sources, expectedSources)) throw new Error('v2 curriculum sources must match the workflow inputs.');
  const profile = exactRecord(record.audienceProfile, ['familiarity', 'technicalDepth'], 'v2 curriculum audienceProfile');
  if (profile.familiarity !== expectedProfile.familiarity || profile.technicalDepth !== expectedProfile.technicalDepth) {
    throw new Error('v2 curriculum audienceProfile must match the workflow inputs.');
  }
  const contract = exactRecord(
    record.audienceContract,
    ['assumedKnowledge', 'orientationPolicy', 'technicalDetailPolicy', 'evidencePolicy'],
    'v2 curriculum audienceContract',
  );
  const chapters = arrayValue(record.chapters, 'v2 curriculum chapters').map((chapter, index) =>
    parseCurriculumChapter(chapter, artifactKinds[index], index),
  );
  if (chapters.length !== artifactKinds.length) throw new Error('v2 curriculum requires exactly three chapters.');
  const omissions = arrayValue(record.omissions, 'v2 curriculum omissions').map((value, index) => {
    const omission = exactRecord(value, ['candidate', 'reason'], `v2 curriculum omission ${index + 1}`);
    return {
      candidate: parseCandidateReference(omission.candidate, `v2 curriculum omission ${index + 1} candidate`),
      reason: nonEmptyString(omission.reason, `v2 curriculum omission ${index + 1} reason`),
    };
  });
  validateCurriculumV2(chapters, omissions, inventories);
  return {
    schemaVersion: 2,
    story: {
      reference: expectedStory,
      title: nonEmptyString(story.title, 'v2 curriculum story title'),
      throughline: nonEmptyString(story.throughline, 'v2 curriculum story throughline'),
    },
    sources,
    audienceProfile: expectedProfile,
    audienceContract: {
      assumedKnowledge: stringArray(contract.assumedKnowledge, 'v2 curriculum assumedKnowledge'),
      orientationPolicy: nonEmptyString(contract.orientationPolicy, 'v2 curriculum orientationPolicy'),
      technicalDetailPolicy: nonEmptyString(contract.technicalDetailPolicy, 'v2 curriculum technicalDetailPolicy'),
      evidencePolicy: nonEmptyString(contract.evidencePolicy, 'v2 curriculum evidencePolicy'),
    },
    chapters,
    omissions,
  };
}

function parseCurriculumChapter(value: unknown, expectedId: ArtifactKind | undefined, index: number): CurriculumChapter {
  const label = `v2 curriculum chapter ${index + 1}`;
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

function validateCurriculumV2(
  chapters: readonly CurriculumChapter[],
  omissions: CurriculumV2['omissions'],
  inventories: Record<ArtifactKind, TopicInventoryV2>,
): void {
  const beatIds = new Set<string>();
  const accounted = new Set<string>();
  const introducedTerms = new Set<string>();
  for (const chapter of chapters) {
    for (const beat of chapter.beats) {
      if (beatIds.has(beat.id)) throw new Error(`v2 curriculum has duplicate beat ${beat.id}.`);
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
  inventories: Record<ArtifactKind, TopicInventoryV2>,
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

function parseDeckPlan(value: unknown, paths: WalkthroughV2Paths, curriculum: CurriculumV2): DeckPlan {
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

function parseTopicInventory(
  value: unknown,
  expectedKind: ArtifactKind,
  expectedSourcePath: string,
): TopicInventory {
  const record = exactRecord(value, ['schemaVersion', 'artifact', 'topics'], `${expectedKind} inventory`);
  if (record.schemaVersion !== 1) throw new Error(`${expectedKind} inventory schemaVersion must be 1.`);
  const artifact = exactRecord(record.artifact, ['kind', 'sourcePath'], `${expectedKind} inventory artifact`);
  if (artifact.kind !== expectedKind) {
    throw new Error(`${expectedKind} inventory artifact kind must be ${expectedKind}.`);
  }
  if (artifact.sourcePath !== expectedSourcePath) {
    throw new Error(`${expectedKind} inventory sourcePath must be ${expectedSourcePath}.`);
  }
  const topicsInput = arrayValue(record.topics, `${expectedKind} inventory topics`);
  if (topicsInput.length === 0) throw new Error(`${expectedKind} inventory must contain at least one topic.`);
  const topics = topicsInput.map((topic, index) => parseInventoryTopic(topic, expectedKind, index));
  const ids = new Set(topics.map((topic) => topic.candidateId));
  if (ids.size !== topics.length) throw new Error(`${expectedKind} inventory candidate IDs must be unique.`);
  for (const topic of topics) {
    for (const prerequisite of topic.prerequisiteCandidateIds) {
      if (!ids.has(prerequisite)) {
        throw new Error(
          `${expectedKind} inventory topic ${topic.candidateId} references unknown prerequisite ${prerequisite}.`,
        );
      }
    }
  }
  return {
    schemaVersion: 1,
    artifact: { kind: expectedKind, sourcePath: expectedSourcePath },
    topics,
  };
}

function parseInventoryTopic(value: unknown, kind: ArtifactKind, index: number) {
  const label = `${kind} inventory topic ${index + 1}`;
  const record = exactRecord(
    value,
    [
      'candidateId',
      'title',
      'learningObjective',
      'whyRequired',
      'prerequisiteCandidateIds',
      'terms',
      'sourceReferences',
      'critical',
      'comprehensionObjective',
    ],
    label,
  );
  const candidateId = nonEmptyString(record.candidateId, `${label} candidateId`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidateId)) {
    throw new Error(`${label} candidateId must be kebab-case ASCII.`);
  }
  const critical = booleanValue(record.critical, `${label} critical`);
  const comprehensionObjective = nullableString(
    record.comprehensionObjective,
    `${label} comprehensionObjective`,
  );
  if (critical && comprehensionObjective === null) {
    throw new Error(`${label} requires a comprehensionObjective because it is critical.`);
  }
  if (!critical && comprehensionObjective !== null) {
    throw new Error(`${label} comprehensionObjective must be null when the topic is not critical.`);
  }
  const sourceReferences = arrayValue(record.sourceReferences, `${label} sourceReferences`).map(
    (reference, referenceIndex) => parseSourceReference(reference, `${label} source reference ${referenceIndex + 1}`),
  );
  if (sourceReferences.length === 0) throw new Error(`${label} requires at least one source reference.`);
  const terms = arrayValue(record.terms, `${label} terms`).map((term, termIndex) =>
    parseTerm(term, `${label} term ${termIndex + 1}`),
  );
  return {
    candidateId,
    title: nonEmptyString(record.title, `${label} title`),
    learningObjective: nonEmptyString(record.learningObjective, `${label} learningObjective`),
    whyRequired: nonEmptyString(record.whyRequired, `${label} whyRequired`),
    prerequisiteCandidateIds: stringArray(
      record.prerequisiteCandidateIds,
      `${label} prerequisiteCandidateIds`,
    ),
    terms,
    sourceReferences,
    critical,
    comprehensionObjective,
  } satisfies InventoryTopicShape;
}

type InventoryTopicShape = {
  readonly candidateId: string;
  readonly title: string;
  readonly learningObjective: string;
  readonly whyRequired: string;
  readonly prerequisiteCandidateIds: readonly string[];
  readonly terms: readonly InventoryTerm[];
  readonly sourceReferences: readonly SourceReference[];
  readonly critical: boolean;
  readonly comprehensionObjective: string | null;
};

function parseCurriculum(
  value: unknown,
  sources: ArtifactPaths,
  review: ReviewPaths,
  inventories: Record<ArtifactKind, TopicInventory>,
): Curriculum {
  const record = exactRecord(
    value,
    ['schemaVersion', 'artifactOrder', 'artifacts', 'topics', 'omissions'],
    'walkthrough manifest',
  );
  if (record.schemaVersion !== 1) throw new Error('Walkthrough manifest schemaVersion must be 1.');
  const artifactOrder = stringArray(record.artifactOrder, 'walkthrough manifest artifactOrder');
  if (!sameValues(artifactOrder, artifactKinds)) {
    throw new Error(`Walkthrough manifest artifactOrder must be ${artifactKinds.join(', ')}.`);
  }
  const artifactsRecord = exactRecord(record.artifacts, artifactKinds, 'walkthrough manifest artifacts');
  const artifacts = Object.fromEntries(
    artifactDescriptors.map((descriptor) => {
      const item = exactRecord(
        artifactsRecord[descriptor.kind],
        ['sourcePath', 'presentationPath'],
        `walkthrough manifest ${descriptor.kind} artifact`,
      );
      const expectedSource = pathFor(sources, descriptor.kind);
      const expectedPresentation = pathFor(review.htmlPaths, descriptor.kind);
      if (item.sourcePath !== expectedSource || item.presentationPath !== expectedPresentation) {
        throw new Error(
          `Walkthrough manifest ${descriptor.kind} paths must be ${expectedSource} and ${expectedPresentation}.`,
        );
      }
      return [
        descriptor.kind,
        { sourcePath: expectedSource, presentationPath: expectedPresentation },
      ];
    }),
  ) as Curriculum['artifacts'];
  const topics = arrayValue(record.topics, 'walkthrough manifest topics').map((topic, index) =>
    parseWalkthroughTopic(topic, index),
  );
  if (topics.length === 0) throw new Error('Walkthrough manifest must contain at least one topic.');
  const omissions = arrayValue(record.omissions, 'walkthrough manifest omissions').map(
    (omission, index) => {
      const item = exactRecord(
        omission,
        ['artifact', 'candidateId', 'reason'],
        `walkthrough manifest omission ${index + 1}`,
      );
      return {
        artifact: artifactKind(item.artifact, `walkthrough manifest omission ${index + 1} artifact`),
        candidateId: nonEmptyString(
          item.candidateId,
          `walkthrough manifest omission ${index + 1} candidateId`,
        ),
        reason: nonEmptyString(item.reason, `walkthrough manifest omission ${index + 1} reason`),
      };
    },
  );
  validateCurriculumTopics(topics, omissions, inventories);
  return { schemaVersion: 1, artifactOrder: artifactKinds, artifacts, topics, omissions };
}

function parseWalkthroughTopic(value: unknown, index: number): WalkthroughTopic {
  const label = `walkthrough manifest topic ${index + 1}`;
  const record = exactRecord(
    value,
    [
      'id',
      'artifact',
      'candidateId',
      'title',
      'learningObjective',
      'prerequisiteTopicIds',
      'sourceReferences',
      'critical',
      'comprehensionObjective',
      'browserAnchor',
    ],
    label,
  );
  const artifact = artifactKind(record.artifact, `${label} artifact`);
  const id = nonEmptyString(record.id, `${label} id`);
  const prefix = descriptorFor(artifact).topicPrefix;
  if (!new RegExp(`^${prefix}-\\d{2}$`).test(id)) {
    throw new Error(`${label} id must match ${prefix}-NN.`);
  }
  const browserAnchor = nonEmptyString(record.browserAnchor, `${label} browserAnchor`);
  if (browserAnchor !== `topic-${id}`) {
    throw new Error(`${label} browserAnchor must be topic-${id}.`);
  }
  const critical = booleanValue(record.critical, `${label} critical`);
  const comprehensionObjective = nullableString(
    record.comprehensionObjective,
    `${label} comprehensionObjective`,
  );
  if (critical !== (comprehensionObjective !== null)) {
    throw new Error(`${label} critical and comprehensionObjective must agree.`);
  }
  const sourceReferences = arrayValue(record.sourceReferences, `${label} sourceReferences`).map(
    (reference, referenceIndex) => parseSourceReference(reference, `${label} source reference ${referenceIndex + 1}`),
  );
  if (sourceReferences.length === 0) throw new Error(`${label} requires at least one source reference.`);
  const learningObjective = nonEmptyString(record.learningObjective, `${label} learningObjective`);
  if (wordCount(learningObjective) > MAX_LEARNING_OBJECTIVE_WORDS) {
    throw new Error(
      `${label} learningObjective allows at most ${MAX_LEARNING_OBJECTIVE_WORDS} words; found ${wordCount(learningObjective)}.`,
    );
  }
  if (
    comprehensionObjective !== null &&
    wordCount(comprehensionObjective) > MAX_COMPREHENSION_OBJECTIVE_WORDS
  ) {
    throw new Error(
      `${label} comprehensionObjective allows at most ${MAX_COMPREHENSION_OBJECTIVE_WORDS} words; found ${wordCount(comprehensionObjective)}.`,
    );
  }
  return {
    id,
    artifact,
    candidateId: nonEmptyString(record.candidateId, `${label} candidateId`),
    title: nonEmptyString(record.title, `${label} title`),
    learningObjective,
    prerequisiteTopicIds: stringArray(record.prerequisiteTopicIds, `${label} prerequisiteTopicIds`),
    sourceReferences,
    critical,
    comprehensionObjective,
    browserAnchor,
  };
}

function validateCurriculumTopics(
  topics: readonly WalkthroughTopic[],
  omissions: Curriculum['omissions'],
  inventories: Record<ArtifactKind, TopicInventory>,
): void {
  const topicIds = new Set<string>();
  const anchors = new Set<string>();
  const accounted = new Set<string>();
  let previousArtifactIndex = 0;
  const counts = new Map<ArtifactKind, number>();
  for (const topic of topics) {
    if (topicIds.has(topic.id)) throw new Error(`Walkthrough manifest has duplicate topic ID ${topic.id}.`);
    if (anchors.has(topic.browserAnchor)) {
      throw new Error(`Walkthrough manifest has duplicate browser anchor ${topic.browserAnchor}.`);
    }
    const artifactIndex = artifactKinds.indexOf(topic.artifact);
    if (artifactIndex < previousArtifactIndex) {
      throw new Error('Walkthrough manifest topics must follow artifactOrder.');
    }
    previousArtifactIndex = artifactIndex;
    for (const prerequisite of topic.prerequisiteTopicIds) {
      if (!topicIds.has(prerequisite)) {
        throw new Error(`Walkthrough topic ${topic.id} prerequisite ${prerequisite} must appear earlier.`);
      }
    }
    const candidateKey = `${topic.artifact}:${topic.candidateId}`;
    if (!inventoryCandidateExists(inventories, topic.artifact, topic.candidateId)) {
      throw new Error(`Walkthrough topic ${topic.id} references unknown candidate ${candidateKey}.`);
    }
    if (accounted.has(candidateKey)) throw new Error(`Inventory candidate ${candidateKey} is accounted for twice.`);
    accounted.add(candidateKey);
    topicIds.add(topic.id);
    anchors.add(topic.browserAnchor);
    counts.set(topic.artifact, (counts.get(topic.artifact) ?? 0) + 1);
  }
  for (const omission of omissions) {
    const candidateKey = `${omission.artifact}:${omission.candidateId}`;
    if (!inventoryCandidateExists(inventories, omission.artifact, omission.candidateId)) {
      throw new Error(`Walkthrough omission references unknown candidate ${candidateKey}.`);
    }
    if (accounted.has(candidateKey)) throw new Error(`Inventory candidate ${candidateKey} is accounted for twice.`);
    accounted.add(candidateKey);
  }
  for (const kind of artifactKinds) {
    if ((counts.get(kind) ?? 0) === 0) {
      throw new Error(`Walkthrough manifest requires at least one ${kind} topic.`);
    }
    for (const candidate of inventories[kind].topics) {
      const key = `${kind}:${candidate.candidateId}`;
      if (!accounted.has(key)) throw new Error(`Inventory candidate ${key} is not represented or omitted.`);
    }
  }
}

function inventoryCandidateExists(
  inventories: Record<ArtifactKind, TopicInventory>,
  kind: ArtifactKind,
  candidateId: string,
): boolean {
  return inventories[kind].topics.some((topic) => topic.candidateId === candidateId);
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

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be a boolean.`);
  return value;
}

function arrayValue(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

function stringArray(value: unknown, label: string): readonly string[] {
  return arrayValue(value, label).map((item, index) => nonEmptyString(item, `${label}[${index}]`));
}

function wordCount(value: string): number {
  return value.trim().split(/\s+/u).length;
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

function requireOccurrence(text: string, value: string, expected: number, label: string): void {
  const count = occurrenceCount(text, value);
  if (count !== expected) throw new Error(`${label} must contain ${value} exactly ${expected} time; found ${count}.`);
}

function occurrenceCount(text: string, value: string): number {
  if (value.length === 0) return 0;
  return text.split(value).length - 1;
}

function expectedNavigation(kind: ArtifactKind): readonly string[] {
  switch (kind) {
    case 'current-state':
      return ['./architecture.html'];
    case 'architecture':
      return ['./current-state.html', './program-design.html'];
    case 'program-design':
      return ['./current-state.html', './architecture.html'];
  }
}

function errorText(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}
