import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { readAnalysis, readCurriculum } from '../src/contracts.js';
import { parseInputs } from '../src/inputs.js';
import { analysis, curriculum, variables, writeJson, writeSources } from './fixtures.js';

test('analysis and curriculum preserve outcomes, complete coverage, and required reference artifacts', () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'curriculum-contract-'));
  try {
    writeSources(repositoryPath);
    const input = parseInputs(repositoryPath, variables());
    writeJson(repositoryPath, input.paths.analysisPath, analysis(input));
    const parsedAnalysis = readAnalysis(repositoryPath, input.learningGoal, input.audience, input.sources, input.paths);
    writeJson(repositoryPath, input.paths.curriculumPath, curriculum(input));
    const parsed = readCurriculum(repositoryPath, input.teachingBrief, input.paths, parsedAnalysis);
    assert.equal(parsedAnalysis.coverageItems.length, 6);
    assert.equal(parsed.neighborhoods.length, 2);
    const proposalCoverage = parsed.neighborhoods[1]?.outcomes[0]?.coverage ?? [];
    assert.deepEqual(proposalCoverage.filter(({ role }) => role === 'reference').map(({ itemId, visibility }) => ({ itemId, visibility })), [
      { itemId: 'editor-contexts-table', visibility: 'required' },
      { itemId: 'open-editor-api', visibility: 'required' },
    ]);
    assert.deepEqual(parsed.omissions.map(({ itemId }) => itemId), ['repeated-background']);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test('contracts tolerate extra descriptive fields and normalize richer source reference objects', () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'curriculum-contract-'));
  try {
    writeSources(repositoryPath);
    const input = parseInputs(repositoryPath, variables());
    const analysisValue = analysis(input);
    (analysisValue as unknown as Record<string, unknown>).planningNote = 'Useful context that does not affect the workflow.';
    (analysisValue.coverageItems[0]!.sourceReferences as unknown[])[0] = {
      sourceId: 'current',
      heading: 'A heading that is not verified',
      locator: 'An approximate locator that is not verified',
    };
    writeJson(repositoryPath, input.paths.analysisPath, analysisValue);
    const parsedAnalysis = readAnalysis(repositoryPath, input.learningGoal, input.audience, input.sources, input.paths);
    assert.deepEqual(parsedAnalysis.coverageItems[0]?.sourceReferences[0], { sourceId: 'current' });
    const curriculumValue = curriculum(input);
    (curriculumValue as unknown as Record<string, unknown>).architectNote = 'The parser ignores useful extension fields.';
    writeJson(repositoryPath, input.paths.curriculumPath, curriculumValue);
    assert.doesNotThrow(() => readCurriculum(repositoryPath, input.teachingBrief, input.paths, parsedAnalysis));
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test('cognition budget numbers guide the model without rejecting an otherwise coherent curriculum', () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'curriculum-contract-'));
  try {
    writeSources(repositoryPath);
    const input = parseInputs(repositoryPath, variables());
    writeJson(repositoryPath, input.paths.analysisPath, analysis(input));
    const parsedAnalysis = readAnalysis(repositoryPath, input.learningGoal, input.audience, input.sources, input.paths);
    const value = curriculum(input);
    value.cognitionBudget.outcomeLimit = 1;
    value.cognitionBudget.neighborhoodLimit = 1;
    writeJson(repositoryPath, input.paths.curriculumPath, value);
    const parsed = readCurriculum(repositoryPath, input.teachingBrief, input.paths, parsedAnalysis);
    assert.equal(parsed.neighborhoods.length, 2);
    assert.equal(parsed.neighborhoods.flatMap(({ outcomes }) => outcomes).length, 2);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test('curriculum requires every analyzed coverage item to be mapped or omitted exactly once', () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'curriculum-contract-'));
  try {
    writeSources(repositoryPath);
    const input = parseInputs(repositoryPath, variables());
    writeJson(repositoryPath, input.paths.analysisPath, analysis(input));
    const parsedAnalysis = readAnalysis(repositoryPath, input.learningGoal, input.audience, input.sources, input.paths);
    const value = curriculum(input);
    value.neighborhoods[1]!.outcomes[0]!.coverage.pop();
    writeJson(repositoryPath, input.paths.curriculumPath, value);
    assert.throws(() => readCurriculum(repositoryPath, input.teachingBrief, input.paths, parsedAnalysis), /map or omit every analysis coverage item/);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test('curriculum rejects unknown coverage item references', () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'curriculum-contract-'));
  try {
    writeSources(repositoryPath);
    const input = parseInputs(repositoryPath, variables());
    writeJson(repositoryPath, input.paths.analysisPath, analysis(input));
    const parsedAnalysis = readAnalysis(repositoryPath, input.learningGoal, input.audience, input.sources, input.paths);
    const value = curriculum(input);
    value.neighborhoods[1]!.outcomes[0]!.coverage[0]!.itemId = 'invented-item';
    writeJson(repositoryPath, input.paths.curriculumPath, value);
    assert.throws(() => readCurriculum(repositoryPath, input.teachingBrief, input.paths, parsedAnalysis), /unknown coverage item invented-item/);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

test('outcome prerequisites must point backward through the curriculum', () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'curriculum-contract-'));
  try {
    writeSources(repositoryPath);
    const input = parseInputs(repositoryPath, variables());
    writeJson(repositoryPath, input.paths.analysisPath, analysis(input));
    const parsedAnalysis = readAnalysis(repositoryPath, input.learningGoal, input.audience, input.sources, input.paths);
    const value = curriculum(input);
    value.neighborhoods[0]!.outcomes[0]!.prerequisiteOutcomeIds.push('judge-proposed-boundary');
    writeJson(repositoryPath, input.paths.curriculumPath, value);
    assert.throws(() => readCurriculum(repositoryPath, input.teachingBrief, input.paths, parsedAnalysis), /must appear earlier/);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});
