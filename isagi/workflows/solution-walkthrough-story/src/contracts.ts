import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  artifactDescriptors,
  artifactKinds,
  beatFacets,
  chapterKinds,
  contractChanges,
  contractKinds,
  pathFor,
  type ArtifactKind,
  type ArtifactPaths,
  type AudienceProfile,
  type Curriculum,
  type CurriculumBeat,
  type CurriculumChapter,
  type DeckPlan,
  type InventoryTerm,
  type InventoryContract,
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
  const record = exactRecord(value, ['schemaVersion', 'artifact', 'candidates', 'contracts'], label);
  if (record.schemaVersion !== 3) throw new Error(`${label} schemaVersion must be 3.`);
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
  const contracts = arrayValue(record.contracts, `${label} contracts`).map((value, index) =>
    parseInventoryContract(value, `${label} contract ${index + 1}`),
  );
  uniqueValues(contracts.map((contract) => contract.contractId), `${label} contract IDs`);
  if (expectedKind !== 'program-design' && contracts.length > 0) {
    throw new Error(`${label} contracts must be empty; exact changed contracts belong to program-design.`);
  }
  return {
    schemaVersion: 3,
    artifact: { kind: expectedKind, sourcePath: expectedSourcePath },
    candidates,
    contracts,
  };
}

function parseInventoryContract(value: unknown, label: string): InventoryContract {
  const record = exactRecord(
    value,
    ['contractId', 'kind', 'name', 'change', 'exactShape', 'invariants', 'compatibilityAndMigration', 'sourceReferences'],
    label,
  );
  const sourceReferences = sourceReferenceArray(record.sourceReferences, `${label} sourceReferences`);
  if (sourceReferences.length === 0) throw new Error(`${label} requires a source reference.`);
  return {
    contractId: kebabString(record.contractId, `${label} contractId`),
    kind: enumString(record.kind, contractKinds, `${label} kind`),
    name: nonEmptyString(record.name, `${label} name`),
    change: enumString(record.change, contractChanges, `${label} change`),
    exactShape: nonEmptyString(record.exactShape, `${label} exactShape`),
    invariants: stringArray(record.invariants, `${label} invariants`),
    compatibilityAndMigration: nullableString(record.compatibilityAndMigration, `${label} compatibilityAndMigration`),
    sourceReferences,
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
    ['schemaVersion', 'story', 'sources', 'audienceProfile', 'audienceContract', 'chapters', 'contractCoverage', 'omissions'],
    'curriculum',
  );
  if (record.schemaVersion !== 3) throw new Error('curriculum schemaVersion must be 3.');
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
  const chapters = arrayValue(record.chapters, 'curriculum chapters').map((chapter, index) => parseCurriculumChapter(chapter, index));
  if (chapters.length === 0) throw new Error('curriculum requires at least one chapter.');
  const contractCoverage = arrayValue(record.contractCoverage, 'curriculum contractCoverage').map((value, index) => {
    const label = `curriculum contract coverage ${index + 1}`;
    const coverage = exactRecord(value, ['contractId', 'chapterId', 'beatId', 'presentationRequirement'], label);
    return {
      contractId: kebabString(coverage.contractId, `${label} contractId`),
      chapterId: kebabString(coverage.chapterId, `${label} chapterId`),
      beatId: kebabString(coverage.beatId, `${label} beatId`),
      presentationRequirement: nonEmptyString(coverage.presentationRequirement, `${label} presentationRequirement`),
    };
  });
  const omissions = arrayValue(record.omissions, 'curriculum omissions').map((value, index) => {
    const omission = exactRecord(value, ['candidate', 'reason'], `curriculum omission ${index + 1}`);
    return {
      candidate: parseCandidateReference(omission.candidate, `curriculum omission ${index + 1} candidate`),
      reason: nonEmptyString(omission.reason, `curriculum omission ${index + 1} reason`),
    };
  });
  validateCurriculum(chapters, contractCoverage, omissions, inventories);
  return {
    schemaVersion: 3,
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
    contractCoverage,
    omissions,
  };
}

function isRecordWithKey(value: unknown, key: string): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, key);
}

function parseCurriculumChapter(value: unknown, index: number): CurriculumChapter {
  const label = `curriculum chapter ${index + 1}`;
  const record = exactRecord(value, ['id', 'kind', 'title', 'purpose', 'openingContext', 'synthesisObjective', 'beats'], label);
  const id = kebabString(record.id, `${label} id`);
  const kind = enumString(record.kind, chapterKinds, `${label} kind`);
  const beats = arrayValue(record.beats, `${label} beats`).map((beat, beatIndex) =>
    parseCurriculumBeat(beat, id, beatIndex),
  );
  if (beats.length === 0) throw new Error(`${label} requires at least one beat.`);
  return {
    id,
    kind,
    title: nonEmptyString(record.title, `${label} title`),
    purpose: nonEmptyString(record.purpose, `${label} purpose`),
    openingContext: nonEmptyString(record.openingContext, `${label} openingContext`),
    synthesisObjective: nonEmptyString(record.synthesisObjective, `${label} synthesisObjective`),
    beats,
  };
}

function parseCurriculumBeat(value: unknown, chapter: string, index: number): CurriculumBeat {
  const label = `${chapter} curriculum beat ${index + 1}`;
  const record = exactRecord(
    value,
    [
      'id', 'facet', 'title', 'objective', 'narrativeBridge', 'candidateReferences', 'prerequisiteBeatIds',
      'requiredContent', 'supportingMaterial', 'termsToIntroduce', 'realizationPoint',
      'comprehensionObjective', 'representationOpportunities', 'sourceReferences',
    ],
    label,
  );
  const id = kebabString(record.id, `${label} id`);
  const expectedId = `${chapter}-${String(index + 1).padStart(2, '0')}`;
  if (id !== expectedId) throw new Error(`${label} id must be ${expectedId}.`);
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
    facet: enumString(record.facet, beatFacets, `${label} facet`),
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
  contractCoverage: Curriculum['contractCoverage'],
  omissions: Curriculum['omissions'],
  inventories: Record<ArtifactKind, TopicInventory>,
): void {
  uniqueValues(chapters.map((chapter) => chapter.id), 'curriculum chapter IDs');
  if (chapters[0]?.kind !== 'orientation') throw new Error('curriculum must begin with one orientation chapter.');
  if (chapters.filter((chapter) => chapter.kind === 'orientation').length !== 1) throw new Error('curriculum requires exactly one orientation chapter.');
  if (!chapters.some((chapter) => chapter.kind === 'neighborhood')) throw new Error('curriculum requires at least one neighborhood chapter.');
  if (chapters.filter((chapter) => chapter.kind === 'synthesis').length > 1) throw new Error('curriculum allows at most one synthesis chapter.');
  if (chapters.some((chapter, index) => chapter.kind === 'synthesis' && index !== chapters.length - 1)) throw new Error('curriculum synthesis chapter must be last.');
  const beatIds = new Set<string>();
  const accounted = new Set<string>();
  const introducedTerms = new Set<string>();
  for (const chapter of chapters) {
    if (chapter.kind === 'neighborhood') validateNeighborhood(chapter);
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
  const programContracts = inventories['program-design'].contracts;
  uniqueValues(contractCoverage.map((coverage) => coverage.contractId), 'curriculum contract coverage IDs');
  if (contractCoverage.length !== programContracts.length) throw new Error('curriculum must cover every changed program-design contract exactly once.');
  for (const coverage of contractCoverage) {
    if (!programContracts.some((contract) => contract.contractId === coverage.contractId)) throw new Error(`curriculum contract coverage references unknown contract ${coverage.contractId}.`);
    const chapter = chapters.find((candidate) => candidate.id === coverage.chapterId);
    const beat = chapter?.beats.find((candidate) => candidate.id === coverage.beatId);
    if (!chapter || chapter.kind !== 'neighborhood' || !beat || beat.facet !== 'program-design') {
      throw new Error(`Contract ${coverage.contractId} must map to a program-design beat in its neighborhood chapter.`);
    }
  }
  for (const contract of programContracts) {
    if (!contractCoverage.some((coverage) => coverage.contractId === contract.contractId)) throw new Error(`Changed contract ${contract.contractId} is not covered.`);
  }
}

function validateNeighborhood(chapter: CurriculumChapter): void {
  const architectureIndexes = chapter.beats.flatMap((beat, index) => beat.facet === 'architecture' ? [index] : []);
  const programDesignIndexes = chapter.beats.flatMap((beat, index) => beat.facet === 'program-design' ? [index] : []);
  if (architectureIndexes.length === 0 || programDesignIndexes.length === 0) throw new Error(`Neighborhood ${chapter.id} requires architecture and program-design beats.`);
  const firstArchitecture = architectureIndexes[0]!;
  const lastArchitecture = architectureIndexes.at(-1)!;
  const firstProgramDesign = programDesignIndexes[0]!;
  const lastProgramDesign = programDesignIndexes.at(-1)!;
  if (firstProgramDesign !== lastArchitecture + 1) throw new Error(`Neighborhood ${chapter.id} must place program design immediately after architecture.`);
  for (const [index, beat] of chapter.beats.entries()) {
    if (index < firstArchitecture && beat.facet !== 'context') throw new Error(`Neighborhood ${chapter.id} may use only context before architecture.`);
    if (index >= firstArchitecture && index <= lastArchitecture && beat.facet !== 'architecture') throw new Error(`Neighborhood ${chapter.id} architecture beats must be contiguous.`);
    if (index >= firstProgramDesign && index <= lastProgramDesign && beat.facet !== 'program-design') throw new Error(`Neighborhood ${chapter.id} program-design beats must be contiguous.`);
    if (index > lastProgramDesign && beat.facet !== 'verification') throw new Error(`Neighborhood ${chapter.id} may use only verification after program design.`);
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
  const record = exactRecord(value, ['schemaVersion', 'curriculumPath', 'outputPath', 'story', 'compactnessStrategy', 'chapters'], 'deck plan');
  if (record.schemaVersion !== 3) throw new Error('deck plan schemaVersion must be 3.');
  if (record.curriculumPath !== paths.curriculumPath || record.outputPath !== paths.htmlPath) throw new Error('deck plan paths must match the workflow paths.');
  const story = exactRecord(record.story, ['title', 'openingPromise', 'throughline', 'endingResolution'], 'deck plan story');
  const beatOrder = curriculum.chapters.flatMap((chapter) => chapter.beats.map((beat) => beat.id));
  const mappedBeats: string[] = [];
  const mappedContracts: string[] = [];
  const slideIds: string[] = [];
  const chapters = arrayValue(record.chapters, 'deck plan chapters').map((value, chapterIndex) => {
    const expectedChapter = curriculum.chapters[chapterIndex];
    const label = `deck plan chapter ${chapterIndex + 1}`;
    const chapter = exactRecord(value, ['id', 'kind', 'title', 'storyRole', 'openingContext', 'closingSynthesis', 'transitionToNext', 'narrativeUnits'], label);
    const id = kebabString(chapter.id, `${label} id`);
    if (!expectedChapter || id !== expectedChapter.id) throw new Error(`${label} must be ${expectedChapter?.id ?? 'absent'}.`);
    const kind = enumString(chapter.kind, chapterKinds, `${label} kind`);
    if (kind !== expectedChapter.kind) throw new Error(`${label} kind must be ${expectedChapter.kind}.`);
    const chapterBeatOrder = expectedChapter.beats.map((beat) => beat.id);
    let lastBeatIndex = -1;
    const narrativeUnits = arrayValue(chapter.narrativeUnits, `${label} narrativeUnits`).map((value, unitIndex) => {
      const unitLabel = `${label} narrative unit ${unitIndex + 1}`;
      const unit = exactRecord(
        value,
        ['title', 'facet', 'storyPurpose', 'beatIds', 'narrativeBridge', 'slides'],
        unitLabel,
      );
      const facet = enumString(unit.facet, beatFacets, `${unitLabel} facet`);
      const beatIds = stringArray(unit.beatIds, `${unitLabel} beatIds`);
      if (beatIds.length === 0) throw new Error(`${unitLabel} requires at least one beatId.`);
      for (const beatId of beatIds) {
        const beatIndex = chapterBeatOrder.indexOf(beatId);
        if (beatIndex < 0) throw new Error(`${unitLabel} beat ${beatId} must belong to ${id}.`);
        if (beatIndex <= lastBeatIndex) throw new Error(`${unitLabel} must map each beat once in curriculum order.`);
        const beat = expectedChapter.beats[beatIndex]!;
        if (beat.facet !== facet) throw new Error(`${unitLabel} facet must match all mapped beats.`);
        lastBeatIndex = beatIndex;
        mappedBeats.push(beatId);
      }
      const slides = arrayValue(unit.slides, `${unitLabel} slides`).map((value, slideIndex) => {
        const slideLabel = `${unitLabel} slide ${slideIndex + 1}`;
        const slide = exactRecord(value, ['id', 'title', 'uniqueContribution', 'requiredContent', 'contractIds', 'representationIntent', 'progressiveDisclosure', 'sourceReferences'], slideLabel);
        const sourceReferences = sourceReferenceArray(slide.sourceReferences, `${slideLabel} sourceReferences`);
        if (sourceReferences.length === 0) throw new Error(`${slideLabel} requires a source reference.`);
        const requiredContent = stringArray(slide.requiredContent, `${slideLabel} requiredContent`);
        if (requiredContent.length === 0) throw new Error(`${slideLabel} requires requiredContent.`);
        const contractIds = stringArray(slide.contractIds, `${slideLabel} contractIds`);
        for (const contractId of contractIds) {
          if (!curriculum.contractCoverage.some((coverage) => coverage.contractId === contractId && coverage.chapterId === id && beatIds.includes(coverage.beatId))) {
            throw new Error(`${slideLabel} contract ${contractId} must belong to a mapped program-design beat in this neighborhood.`);
          }
          mappedContracts.push(contractId);
        }
        const slideId = kebabString(slide.id, `${slideLabel} id`);
        slideIds.push(slideId);
        return {
          id: slideId,
          title: nonEmptyString(slide.title, `${slideLabel} title`),
          uniqueContribution: nonEmptyString(slide.uniqueContribution, `${slideLabel} uniqueContribution`),
          requiredContent,
          contractIds,
          representationIntent: nullableString(slide.representationIntent, `${slideLabel} representationIntent`),
          progressiveDisclosure: stringArray(slide.progressiveDisclosure, `${slideLabel} progressiveDisclosure`),
          sourceReferences,
        };
      });
      if (slides.length === 0) throw new Error(`${unitLabel} requires at least one planned slide.`);
      return {
        title: nonEmptyString(unit.title, `${unitLabel} title`),
        facet,
        storyPurpose: nonEmptyString(unit.storyPurpose, `${unitLabel} storyPurpose`),
        beatIds,
        narrativeBridge: nonEmptyString(unit.narrativeBridge, `${unitLabel} narrativeBridge`),
        slides,
      };
    });
    if (narrativeUnits.length === 0) throw new Error(`${label} requires at least one narrative unit.`);
    return {
      id,
      kind,
      title: nonEmptyString(chapter.title, `${label} title`),
      storyRole: nonEmptyString(chapter.storyRole, `${label} storyRole`),
      openingContext: nonEmptyString(chapter.openingContext, `${label} openingContext`),
      closingSynthesis: nonEmptyString(chapter.closingSynthesis, `${label} closingSynthesis`),
      transitionToNext: nonEmptyString(chapter.transitionToNext, `${label} transitionToNext`),
      narrativeUnits,
    };
  });
  if (chapters.length !== curriculum.chapters.length) throw new Error('deck plan requires exactly the curriculum chapters.');
  if (!sameValues(mappedBeats, beatOrder)) throw new Error('deck plan must map every curriculum beat exactly once in order.');
  uniqueValues(slideIds, 'deck plan slide IDs');
  uniqueValues(mappedContracts, 'deck plan contract IDs');
  const expectedContracts = curriculum.contractCoverage.map((coverage) => coverage.contractId);
  if (mappedContracts.length !== expectedContracts.length || expectedContracts.some((contractId) => !mappedContracts.includes(contractId))) throw new Error('deck plan must map every changed contract to exactly one planned slide.');
  return {
    schemaVersion: 3,
    curriculumPath: paths.curriculumPath,
    outputPath: paths.htmlPath,
    story: {
      title: nonEmptyString(story.title, 'deck plan story title'),
      openingPromise: nonEmptyString(story.openingPromise, 'deck plan story openingPromise'),
      throughline: nonEmptyString(story.throughline, 'deck plan story throughline'),
      endingResolution: nonEmptyString(story.endingResolution, 'deck plan story endingResolution'),
    },
    compactnessStrategy: nonEmptyString(record.compactnessStrategy, 'deck plan compactnessStrategy'),
    chapters,
  };
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
