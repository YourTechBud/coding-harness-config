import { existsSync, realpathSync, statSync } from 'node:fs';
import { basename, extname, isAbsolute, relative, resolve } from 'node:path';

import type { AudienceDescription, CurriculumPaths, CurriculumSource } from './types.js';

export type Variables = {
  readonly sources?: unknown;
  readonly learningGoal?: unknown;
  readonly audienceFamiliarity?: unknown;
  readonly audienceDepth?: unknown;
  readonly teachingBrief?: unknown;
  readonly outputDirectory?: unknown;
};

export type ParsedInputs = {
  readonly repositoryPath: string;
  readonly sources: readonly CurriculumSource[];
  readonly learningGoal: string;
  readonly audience: AudienceDescription;
  readonly teachingBrief: string;
  readonly paths: CurriculumPaths;
};

export function parseInputs(repositoryPath: string, variables: Variables): ParsedInputs {
  const sources = parseSources(variables.sources);
  for (const source of sources) assertSourceFile(repositoryPath, source.path);
  const outputDirectory = relativePath(variables.outputDirectory, 'outputDirectory', 'scratch/story/curriculum');
  assertInsideRepository(repositoryPath, outputDirectory, 'outputDirectory');
  return {
    repositoryPath,
    sources,
    learningGoal: text(variables.learningGoal, 'learningGoal'),
    audience: {
      familiarity: text(variables.audienceFamiliarity, 'audienceFamiliarity'),
      depth: text(variables.audienceDepth, 'audienceDepth'),
    },
    teachingBrief: optionalText(variables.teachingBrief) ?? 'Choose the clearest storyline for this audience and learning goal.',
    paths: {
      outputDirectory,
      analysisPath: `${outputDirectory}/curriculum-analysis.json`,
      curriculumPath: `${outputDirectory}/curriculum.json`,
    },
  };
}

function parseSources(value: unknown): readonly CurriculumSource[] {
  const raw = typeof value === 'string'
    ? value.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean)
    : value;
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('sources must contain at least one Markdown path.');
  const sources = raw.map((item, index) => parseSource(item, index));
  unique(sources.map(({ id }) => id), 'source IDs');
  unique(sources.map(({ path }) => path), 'source paths');
  return sources;
}

function parseSource(value: unknown, index: number): CurriculumSource {
  if (typeof value === 'string') {
    const path = relativePath(value, `sources[${index}]`);
    return { id: sourceId(path), path, description: null };
  }
  const record = exactRecord(value, ['id', 'path', 'description'], `sources[${index}]`);
  return {
    id: kebab(record.id, `sources[${index}].id`),
    path: relativePath(record.path, `sources[${index}].path`),
    description: nullableText(record.description, `sources[${index}].description`),
  };
}

function assertSourceFile(repositoryPath: string, path: string): void {
  assertInsideRepository(repositoryPath, path, 'source path');
  if (extname(path).toLocaleLowerCase('en-US') !== '.md') throw new Error(`Source ${path} must be a Markdown file.`);
  const absolute = resolve(repositoryPath, path);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) throw new Error(`Source Markdown file ${path} does not exist.`);
  const repositoryRealPath = realpathSync(repositoryPath);
  const sourceRealPath = realpathSync(absolute);
  const fromRepository = relative(repositoryRealPath, sourceRealPath);
  if (fromRepository === '..' || fromRepository.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(fromRepository)) throw new Error(`Source ${path} resolves outside the repository.`);
}

function assertInsideRepository(repositoryPath: string, path: string, label: string): void {
  const fromRepository = relative(resolve(repositoryPath), resolve(repositoryPath, path));
  if (fromRepository === '..' || fromRepository.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(fromRepository)) throw new Error(`${label} must stay inside the repository.`);
}

function sourceId(path: string): string {
  const stem = basename(path, extname(path)).toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '');
  if (!stem) throw new Error(`Could not derive a source ID from ${path}. Pass an object with an explicit id.`);
  return stem;
}

function relativePath(value: unknown, label: string, fallback?: string): string {
  const path = value === undefined ? fallback : value;
  const result = text(path, label);
  if (isAbsolute(result)) throw new Error(`${label} must be workspace-relative.`);
  return result.replaceAll('\\', '/').replace(/\/$/u, '');
}

function text(value: unknown, label: string): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  throw new Error(`${label} must be non-empty text.`);
}

function optionalText(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  return text(value, 'teachingBrief');
}

function nullableText(value: unknown, label: string): string | null {
  if (value === null) return null;
  return text(value, label);
}

function kebab(value: unknown, label: string): string {
  const result = text(value, label);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(result)) throw new Error(`${label} must be kebab-case ASCII.`);
  return result;
}

function exactRecord(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record);
  if (actual.length !== keys.length || keys.some((key) => !Object.hasOwn(record, key))) throw new Error(`${label} must contain exactly: ${keys.join(', ')}.`);
  return record;
}

function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique.`);
}
