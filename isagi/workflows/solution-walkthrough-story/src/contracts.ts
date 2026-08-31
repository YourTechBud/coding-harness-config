import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import type { ArchitectedDeckPlan } from './curriculum-v3.js';

export type PresentationMetrics = {
  readonly neighborhoodCount: number;
  readonly contentMomentCount: number;
  readonly substantiveSlideCount: number;
  readonly totalSlideCount: number;
  readonly coverageItemCount: number;
};

export function assertExpectedFile(repositoryPath: string, artifactPath: string, label: string): void {
  const absolutePath = resolve(repositoryPath, artifactPath);
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    throw new Error(`Expected ${label} at ${artifactPath}.`);
  }
}

export function validatePresentation(
  repositoryPath: string,
  htmlPath: string,
  plan: ArchitectedDeckPlan,
): PresentationMetrics {
  assertExpectedFile(repositoryPath, htmlPath, 'walkthrough presentation');
  const rawHtml = readFileSync(resolve(repositoryPath, htmlPath), 'utf8');
  const html = rawHtml.replace(/<!--[\s\S]*?-->/g, '');

  requireElementCount(html, 'data-walkthrough-deck', 1, 'presentation root');
  requireElementCount(html, 'data-slide-viewport', 1, 'slide viewport');
  requireElementCount(html, 'data-slide-navigation', 1, 'slide navigation');
  if (rawHtml.includes('<!-- walkthrough-content-end -->')) {
    throw new Error('The completed presentation still contains the neighborhood insertion marker.');
  }

  const slideTags = elementsWithAttribute(html, 'data-walkthrough-slide');
  if (slideTags.length < 2) {
    throw new Error('The completed presentation requires an opening slide and at least one substantive slide.');
  }

  const slideIds = slideTags.map((tag, index) => requiredAttribute(tag, 'id', `slide ${index + 1}`));
  unique(slideIds, 'walkthrough slide IDs');
  if (slideIds[0] !== plan.openingSlide.id) {
    throw new Error(`The first slide must be the planned opening slide ${plan.openingSlide.id}.`);
  }
  if (slideIds.filter((id) => id === plan.openingSlide.id).length !== 1) {
    throw new Error(`The planned opening slide ${plan.openingSlide.id} must appear exactly once.`);
  }

  const plannedMomentIds = plan.neighborhoods.flatMap((neighborhood) => neighborhood.contentMoments.map((moment) => moment.id));
  const realizedMomentIds = slideTags.flatMap((tag) => optionalAttribute(tag, 'data-content-moments')?.split(/\s+/).filter(Boolean) ?? []);
  const planned = new Set(plannedMomentIds);
  const unknown = [...new Set(realizedMomentIds.filter((id) => !planned.has(id)))];
  if (unknown.length > 0) {
    throw new Error(`The presentation contains unknown content moment IDs: ${unknown.join(', ')}.`);
  }
  const missing = plannedMomentIds.filter((id) => !realizedMomentIds.includes(id));
  if (missing.length > 0) {
    throw new Error(`The presentation does not realize these planned content moments: ${missing.join(', ')}.`);
  }

  return {
    neighborhoodCount: plan.neighborhoods.length,
    contentMomentCount: plannedMomentIds.length,
    substantiveSlideCount: slideTags.length - 1,
    totalSlideCount: slideTags.length,
    coverageItemCount: plan.neighborhoods.reduce(
      (count, neighborhood) => count + neighborhood.contentMoments.reduce(
        (momentCount, moment) => momentCount + moment.coverageItemIds.length,
        0,
      ),
      0,
    ),
  };
}

function requireElementCount(html: string, attribute: string, expected: number, label: string): void {
  const count = elementsWithAttribute(html, attribute).length;
  if (count !== expected) throw new Error(`Expected exactly ${expected} ${label}, found ${count}.`);
}

function elementsWithAttribute(html: string, attribute: string): string[] {
  const expression = new RegExp('<[a-z][^>]*\\b' + escapeRegExp(attribute) + '(?:\\s*=\\s*(?:"[^"]*"|\'[^\']*\'|[^\\s>]+))?[^>]*>', 'gi');
  return html.match(expression) ?? [];
}

function requiredAttribute(tag: string, attribute: string, label: string): string {
  const value = optionalAttribute(tag, attribute);
  if (!value) throw new Error(`${label} requires a non-empty ${attribute} attribute.`);
  return value;
}

function optionalAttribute(tag: string, attribute: string): string | null {
  const expression = new RegExp('(?:^|\\s)' + escapeRegExp(attribute) + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s"\'=<>]+))', 'i');
  const match = expression.exec(tag);
  return match ? (match[1] ?? match[2] ?? match[3] ?? '') : null;
}

function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique.`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&');
}
