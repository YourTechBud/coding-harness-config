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

test('curriculum accepts neighborhood chapters, exact contract coverage, and an optional language policy', () => {
  for (const languagePolicy of ['Use plain and precise language.', undefined]) {
    const repositoryPath = mkdtempSync(join(tmpdir(), 'walkthrough-contract-'));
    try {
      const paths = walkthroughPaths('review');
      writeInventories(repositoryPath, paths.inventoryPaths);
      writeJson(repositoryPath, paths.curriculumPath, curriculum(languagePolicy));
      const inventories = readTopicInventories(repositoryPath, sources, paths);
      const parsed = readCurriculum(repositoryPath, 'Story 42', sources, { familiarity: 'new', technicalDepth: 'system-design' }, paths, inventories);
      assert.equal(parsed.schemaVersion, 3);
      assert.equal(parsed.audienceContract.languagePolicy, languagePolicy);
      assert.deepEqual(parsed.chapters.map(({ id }) => id), ['orientation', 'request-lifecycle']);
      assert.equal(parsed.contractCoverage[0]?.contractId, 'add-walkthrough-table');
    } finally {
      rmSync(repositoryPath, { recursive: true, force: true });
    }
  }
});

test('curriculum rejects a neighborhood that separates architecture from program design', () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'walkthrough-contract-'));
  try {
    const paths = walkthroughPaths('review');
    writeInventories(repositoryPath, paths.inventoryPaths);
    const value = curriculum('Use plain language.');
    value.chapters[1]!.beats.splice(1, 0, { ...value.chapters[1]!.beats[0]!, id: 'request-lifecycle-02', facet: 'verification' });
    value.chapters[1]!.beats[2]!.id = 'request-lifecycle-03';
    value.contractCoverage[0]!.beatId = 'request-lifecycle-03';
    writeJson(repositoryPath, paths.curriculumPath, value);
    const inventories = readTopicInventories(repositoryPath, sources, paths);
    assert.throws(() => readCurriculum(repositoryPath, 'Story 42', sources, { familiarity: 'new', technicalDepth: 'system-design' }, paths, inventories), /immediately after architecture/);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test('deck plan maps every beat and changed contract exactly once to planned slides', () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'walkthrough-contract-'));
  try {
    const paths = walkthroughPaths('review');
    writeInventories(repositoryPath, paths.inventoryPaths);
    writeJson(repositoryPath, paths.curriculumPath, curriculum('Use plain and precise language.'));
    const inventories = readTopicInventories(repositoryPath, sources, paths);
    const parsedCurriculum = readCurriculum(repositoryPath, 'Story 42', sources, { familiarity: 'new', technicalDepth: 'system-design' }, paths, inventories);
    writeJson(repositoryPath, paths.deckPlanPath, deckPlan(paths.curriculumPath, paths.htmlPath));
    const parsed = readDeckPlan(repositoryPath, paths, parsedCurriculum);
    assert.equal(parsed.schemaVersion, 3);
    assert.equal(parsed.chapters[1]?.narrativeUnits[1]?.slides[0]?.contractIds[0], 'add-walkthrough-table');
    assert.match(parsed.compactnessStrategy, /one slide/);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test('deck plan rejects a changed contract omitted from its planned slides', () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'walkthrough-contract-'));
  try {
    const paths = walkthroughPaths('review');
    writeInventories(repositoryPath, paths.inventoryPaths);
    writeJson(repositoryPath, paths.curriculumPath, curriculum('Use plain and precise language.'));
    const inventories = readTopicInventories(repositoryPath, sources, paths);
    const parsedCurriculum = readCurriculum(repositoryPath, 'Story 42', sources, { familiarity: 'new', technicalDepth: 'system-design' }, paths, inventories);
    const value = deckPlan(paths.curriculumPath, paths.htmlPath);
    value.chapters[1]!.narrativeUnits[1]!.slides[0]!.contractIds = [];
    writeJson(repositoryPath, paths.deckPlanPath, value);
    assert.throws(() => readDeckPlan(repositoryPath, paths, parsedCurriculum), /map every changed contract/);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

function inventory(kind: ArtifactKind) {
  return {
    schemaVersion: 3,
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
    contracts: kind === 'program-design' ? [{
      contractId: 'add-walkthrough-table',
      kind: 'persistence',
      name: 'walkthroughs table',
      change: 'add',
      exactShape: 'walkthroughs(id uuid primary key, story_id uuid not null)',
      invariants: ['story_id references an existing story'],
      compatibilityAndMigration: 'Create the table before enabling writes.',
      sourceReferences: [{ heading: 'Schema', locator: pathFor(sources, kind) }],
    }] : [],
  };
}

function curriculum(languagePolicy: string | undefined) {
  const beat = (chapterId: string, index: number, facet: 'context' | 'architecture' | 'program-design' | 'verification', artifact: ArtifactKind) => ({
    id: `${chapterId}-${String(index).padStart(2, '0')}`,
    facet,
    title: `${artifact} beat`,
    objective: `Understand ${artifact}`,
    narrativeBridge: 'Continue the story.',
    candidateReferences: [{ artifact, candidateId: `${artifact}-candidate` }],
    prerequisiteBeatIds: [],
    requiredContent: ['A required point'],
    supportingMaterial: [],
    termsToIntroduce: [],
    realizationPoint: null,
    comprehensionObjective: null,
    representationOpportunities: [],
    sourceReferences: [{ heading: artifact, locator: pathFor(sources, artifact) }],
  });
  return {
    schemaVersion: 3,
    story: { reference: 'Story 42', title: 'Story 42', throughline: 'A clear throughline' },
    sources,
    audienceProfile: { familiarity: 'new', technicalDepth: 'system-design' },
    audienceContract: {
      assumedKnowledge: [],
      orientationPolicy: 'Orient the reader first.',
      technicalDetailPolicy: 'Keep system relationships and exact contracts.',
      evidencePolicy: 'Ground every claim.',
      ...(languagePolicy === undefined ? {} : { languagePolicy }),
    },
    chapters: [{
      id: 'orientation',
      kind: 'orientation',
      title: 'Orientation',
      purpose: 'Establish the problem.',
      openingContext: 'Start with the current behavior.',
      synthesisObjective: 'Understand why change is needed.',
      beats: [beat('orientation', 1, 'context', 'current-state')],
    }, {
      id: 'request-lifecycle',
      kind: 'neighborhood',
      title: 'Request lifecycle',
      purpose: 'Explain one coherent solution area.',
      openingContext: 'Follow one request.',
      synthesisObjective: 'Connect the boundary to its contract.',
      beats: [beat('request-lifecycle', 1, 'architecture', 'architecture'), beat('request-lifecycle', 2, 'program-design', 'program-design')],
    }],
    contractCoverage: [{ contractId: 'add-walkthrough-table', chapterId: 'request-lifecycle', beatId: 'request-lifecycle-02', presentationRequirement: 'Show the exact table shape and migration consequence.' }],
    omissions: [],
  };
}

function deckPlan(curriculumPath: string, outputPath: string) {
  const slide = (id: string, contractIds: string[] = []) => ({
    id,
    title: `Claim for ${id}`,
    uniqueContribution: `Distinct contribution from ${id}`,
    requiredContent: ['A required point'],
    contractIds,
    representationIntent: null,
    progressiveDisclosure: [],
    sourceReferences: [{ heading: id, locator: 'design/program-design.md' }],
  });
  return {
    schemaVersion: 3,
    curriculumPath,
    outputPath,
    story: { title: 'Story 42', openingPromise: 'Understand the change', throughline: 'Follow the system', endingResolution: 'Know how it works' },
    compactnessStrategy: 'Use one slide for each distinct idea and progressive disclosure for supporting detail.',
    chapters: [{
      id: 'orientation',
      kind: 'orientation',
      title: 'Orientation',
      storyRole: 'Establish the problem.',
      openingContext: 'Begin with current behavior.',
      closingSynthesis: 'The need is clear.',
      transitionToNext: 'Enter the request lifecycle.',
      narrativeUnits: [{ title: 'Problem', facet: 'context', storyPurpose: 'Orient the audience.', beatIds: ['orientation-01'], narrativeBridge: 'Begin the story.', slides: [slide('problem')] }],
    }, {
      id: 'request-lifecycle',
      kind: 'neighborhood',
      title: 'Request lifecycle',
      storyRole: 'Connect architecture to realization.',
      openingContext: 'Follow one request.',
      closingSynthesis: 'The boundary has a concrete contract.',
      transitionToNext: 'Close the story.',
      narrativeUnits: [
        { title: 'Boundary', facet: 'architecture', storyPurpose: 'Explain ownership.', beatIds: ['request-lifecycle-01'], narrativeBridge: 'Move from problem to boundary.', slides: [slide('boundary')] },
        { title: 'Schema', facet: 'program-design', storyPurpose: 'Realize ownership.', beatIds: ['request-lifecycle-02'], narrativeBridge: 'Turn the boundary into a contract.', slides: [slide('schema', ['add-walkthrough-table'])] },
      ],
    }],
  };
}

function writeInventories(repositoryPath: string, paths: ArtifactPaths): void {
  for (const kind of artifactKinds) writeJson(repositoryPath, pathFor(paths, kind), inventory(kind));
}

function writeJson(repositoryPath: string, relativePath: string, value: unknown): void {
  const absolutePath = join(repositoryPath, relativePath);
  mkdirSync(join(absolutePath, '..'), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`);
}
