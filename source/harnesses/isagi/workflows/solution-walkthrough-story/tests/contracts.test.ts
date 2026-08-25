import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { readCurriculum, readDeckPlan, readTopicInventories } from '../src/contracts.js';
import { walkthroughPaths } from '../src/paths.js';
import { artifactKinds, pathFor, type ArtifactKind, type ArtifactPaths } from '../src/types.js';

const sources: ArtifactPaths = {
  currentStatePath: 'design/current-state.md',
  architecturePath: 'design/architecture.md',
  programDesignPath: 'design/program-design.md',
};

test('curriculum accepts the language policy and existing files without it', () => {
  for (const languagePolicy of ['Use plain and precise language.', undefined]) {
    const repositoryPath = mkdtempSync(join(tmpdir(), 'walkthrough-contract-'));
    try {
      const paths = walkthroughPaths('review');
      for (const kind of artifactKinds) writeJson(repositoryPath, pathFor(paths.inventoryPaths, kind), inventory(kind));
      writeJson(repositoryPath, paths.curriculumPath, curriculum(languagePolicy));
      const inventories = readTopicInventories(repositoryPath, sources, paths);
      const parsed = readCurriculum(repositoryPath, 'Story 42', sources, { familiarity: 'new', technicalDepth: 'system-design' }, paths, inventories);
      assert.equal(parsed.audienceContract.languagePolicy, languagePolicy);
    } finally {
      rmSync(repositoryPath, { recursive: true, force: true });
    }
  }
});

test('deck plan is hierarchical and maps ordered narrative units to every curriculum beat', () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'walkthrough-contract-'));
  try {
    const paths = walkthroughPaths('review');
    for (const kind of artifactKinds) writeJson(repositoryPath, pathFor(paths.inventoryPaths, kind), inventory(kind));
    writeJson(repositoryPath, paths.curriculumPath, curriculum('Use plain and precise language.'));
    const inventories = readTopicInventories(repositoryPath, sources, paths);
    const parsedCurriculum = readCurriculum(repositoryPath, 'Story 42', sources, { familiarity: 'new', technicalDepth: 'system-design' }, paths, inventories);
    writeJson(repositoryPath, paths.deckPlanPath, deckPlan(paths.curriculumPath, paths.htmlPath));
    const parsed = readDeckPlan(repositoryPath, paths, parsedCurriculum);
    assert.equal(parsed.schemaVersion, 2);
    assert.deepEqual(parsed.chapters.map(({ id }) => id), artifactKinds);
    assert.equal(parsed.chapters[0]?.narrativeUnits[0]?.realizationPoints[0], 'Understand current-state');
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test('deck plan rejects a narrative unit without a realization point', () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'walkthrough-contract-'));
  try {
    const paths = walkthroughPaths('review');
    for (const kind of artifactKinds) writeJson(repositoryPath, pathFor(paths.inventoryPaths, kind), inventory(kind));
    writeJson(repositoryPath, paths.curriculumPath, curriculum('Use plain and precise language.'));
    const inventories = readTopicInventories(repositoryPath, sources, paths);
    const parsedCurriculum = readCurriculum(repositoryPath, 'Story 42', sources, { familiarity: 'new', technicalDepth: 'system-design' }, paths, inventories);
    const value = deckPlan(paths.curriculumPath, paths.htmlPath);
    value.chapters[0]!.narrativeUnits[0]!.realizationPoints = [];
    writeJson(repositoryPath, paths.deckPlanPath, value);
    assert.throws(() => readDeckPlan(repositoryPath, paths, parsedCurriculum), /requires at least one realization point/);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

function inventory(kind: ArtifactKind) {
  return {
    schemaVersion: 2,
    artifact: { kind, sourcePath: pathFor(sources, kind) },
    candidates: [{
      candidateId: `${kind}-candidate`,
      title: `${kind} candidate`,
      learningObjective: `Understand ${kind}`,
      whyRequired: 'The walkthrough depends on it.',
      prerequisiteCandidateIds: [],
      terms: [],
      keyPoints: ['A grounded point'],
      representationOpportunities: [],
      sourceReferences: [{ heading: kind, locator: pathFor(sources, kind) }],
    }],
  };
}

function curriculum(languagePolicy: string | undefined) {
  const chapter = (id: ArtifactKind, beatId: string) => ({
    id,
    title: id,
    purpose: `Explain ${id}`,
    openingContext: `Context for ${id}`,
    synthesisObjective: `Connect ${id}`,
    beats: [{
      id: beatId,
      title: `${id} beat`,
      objective: `Understand ${id}`,
      narrativeBridge: 'Continue the story.',
      candidateReferences: [{ artifact: id, candidateId: `${id}-candidate` }],
      prerequisiteBeatIds: [],
      requiredContent: ['A required point'],
      supportingMaterial: [],
      termsToIntroduce: [],
      realizationPoint: null,
      comprehensionObjective: null,
      representationOpportunities: [],
      sourceReferences: [{ heading: id, locator: pathFor(sources, id) }],
    }],
  });
  return {
    schemaVersion: 2,
    story: { reference: 'Story 42', title: 'Story 42', throughline: 'A clear throughline' },
    sources,
    audienceProfile: { familiarity: 'new', technicalDepth: 'system-design' },
    audienceContract: {
      assumedKnowledge: [],
      orientationPolicy: 'Orient the reader first.',
      technicalDetailPolicy: 'Keep system relationships.',
      evidencePolicy: 'Ground every claim.',
      ...(languagePolicy === undefined ? {} : { languagePolicy }),
    },
    chapters: [chapter('current-state', 'cs-01'), chapter('architecture', 'ar-01'), chapter('program-design', 'pd-01')],
    omissions: [],
  };
}

function deckPlan(curriculumPath: string, outputPath: string) {
  const chapter = (id: ArtifactKind, beatId: string) => ({
    id,
    title: id,
    storyRole: `Explain ${id}`,
    openingContext: `Enter ${id}`,
    closingSynthesis: `Synthesize ${id}`,
    transitionToNext: `Continue from ${id}`,
    narrativeUnits: [{
      title: `${id} movement`,
      storyPurpose: `Teach ${id}`,
      beatIds: [beatId],
      narrativeBridge: `Move through ${id}`,
      realizationPoints: [`Understand ${id}`],
      requiredContent: ['A required point'],
      supportingContent: [],
      representationIntent: null,
      progressiveDisclosure: [],
      sourceReferences: [{ heading: id, locator: pathFor(sources, id) }],
    }],
  });
  return {
    schemaVersion: 2,
    curriculumPath,
    outputPath,
    story: { title: 'Story 42', openingPromise: 'Understand the change', throughline: 'Follow the system', endingResolution: 'Know how it works' },
    chapters: [chapter('current-state', 'cs-01'), chapter('architecture', 'ar-01'), chapter('program-design', 'pd-01')],
  };
}

function writeJson(repositoryPath: string, relativePath: string, value: unknown): void {
  const absolutePath = join(repositoryPath, relativePath);
  mkdirSync(join(absolutePath, '..'), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`);
}
