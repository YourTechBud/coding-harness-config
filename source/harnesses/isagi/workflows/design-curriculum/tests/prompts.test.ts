import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { parseInputs } from '../src/inputs.js';
import { analysisPrompt, curriculumPrompt, CURRICULUM_CONVENTIONS } from '../src/prompts.js';
import { analysis, variables, writeSources } from './fixtures.js';

test('the two turns make distinct analysis and curriculum decisions', () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'curriculum-prompt-'));
  try {
    writeSources(repositoryPath);
    const input = parseInputs(repositoryPath, variables());
    const first = analysisPrompt(input);
    const second = curriculumPrompt(input, analysis(input));
    assert.match(first, /complete coverage inventory/);
    assert.match(first, /database schemas, APIs, wire contracts/);
    assert.match(first, /does not choose neighborhoods, learning outcomes, roles, visibility, or omissions/);
    assert.doesNotMatch(first, new RegExp(escapeRegExp(CURRICULUM_CONVENTIONS)));
    assert.match(second, new RegExp(escapeRegExp(CURRICULUM_CONVENTIONS)));
    assert.match(second, /Role and visibility answer different questions/);
    assert.match(second, /Consequential contracts and decision evidence are normally required/);
    assert.match(second, /"role": "reference"/);
    assert.match(second, /"visibility": "required"/);
    assert.match(second, /cognitionBudget/);
    assert.match(second, /without applying a predetermined teaching template/);
    assert.doesNotMatch(second, /problem →|whole →|compare and contrast/i);
  } finally {
    rmSync(repositoryPath, { recursive: true, force: true });
  }
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
