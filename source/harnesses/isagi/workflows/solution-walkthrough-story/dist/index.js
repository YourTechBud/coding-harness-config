// node_modules/.pnpm/@yourtechbudstudio+isagi-workflow-sdk@0.0.1/node_modules/@yourtechbudstudio/isagi-workflow-sdk/dist/index.js
function r(e) {
  return e;
}
function i(e) {
  return {
    type: "cont",
    state: e
  };
}
function a(e, t) {
  return {
    type: "suspend",
    state: e,
    condition: t
  };
}
var o = {
  agentTurn(e) {
    return {
      kind: "agent_turn",
      agentSessionId: e.agentSessionId,
      sentAt: e.sentAt
    };
  },
  userContinue() {
    return { kind: "user_continue" };
  },
  userInput(e) {
    return {
      kind: "user_input",
      questions: e
    };
  },
  workflow(e) {
    let t = Array.isArray(e) ? e : [e];
    if (t.length === 0) throw Error("Workflow wait requires at least one run id.");
    return {
      kind: "workflow",
      runIds: t
    };
  },
  headlessAgent(e) {
    let t = Array.isArray(e) ? e : [e];
    if (t.length === 0) throw Error("Headless agent wait requires at least one operation.");
    return {
      kind: "headless_agent",
      ops: t
    };
  }
};
var s = {
  isUserContinue(e) {
    return c(e) && e.kind === "user_continue";
  },
  isUserInput(e) {
    return c(e) && e.kind === "user_input" && c(e.answers);
  },
  isAgentTurnEnded(e) {
    return c(e) && e.outcome === "ended" && typeof e.recordedAt == "string";
  },
  isAgentTurnFailed(e) {
    return c(e) && e.outcome === "failed" && typeof e.recordedAt == "string" && typeof e.reason == "string";
  },
  requireAgentTurnEnded(e) {
    if (s.isAgentTurnEnded(e)) return e;
    throw Error("Expected an ended agent turn event.");
  },
  requireAgentTurnFailed(e) {
    if (s.isAgentTurnFailed(e)) return e;
    throw Error("Expected a failed agent turn event.");
  },
  getAgentTurnResult(e) {
    return s.isAgentTurnEnded(e) || s.isAgentTurnFailed(e) ? e : null;
  },
  getWorkflowResults(e) {
    return c(e) && e.kind === "workflow" && Array.isArray(e.results) ? e.results : null;
  },
  getHeadlessAgentResults(e) {
    return c(e) && e.kind === "headless_agent" && Array.isArray(e.results) ? e.results : null;
  }
};
function c(e) {
  return typeof e == "object" && !!e;
}
function l(e) {
  return {
    type: "done",
    value: e
  };
}
function u(e) {
  return {
    type: "fail",
    reason: e
  };
}

// src/paths.ts
function walkthroughPaths(reviewDirectory) {
  const walkthroughDirectory = `${reviewDirectory}/.walkthrough`;
  return {
    reviewDirectory,
    walkthroughDirectory,
    curriculumAnalysisPath: `${walkthroughDirectory}/curriculum-analysis.json`,
    curriculumPath: `${walkthroughDirectory}/curriculum.json`,
    deckPlanPath: `${walkthroughDirectory}/deck-plan.json`,
    htmlPath: `${reviewDirectory}/walkthrough.html`
  };
}

// src/types.ts
var familiarityLevels = ["new", "familiar"];
var technicalDepthLevels = ["product", "system-design", "implementation"];
var deliveryMechanisms = ["presentation", "socratic-walkthrough"];

// src/constants.ts
var deckBuilder = {
  harness: "claude",
  model: "opus",
  effort: "medium"
};
var guide = {
  harness: "codex",
  model: "gpt-5.6-sol",
  effort: "low"
};
var deckArchitect = {
  harness: "claude",
  model: "fable",
  effort: "high"
};

// src/curriculum-v3.ts
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";
var coverageRoles = ["primary", "supporting", "reference"];
var coverageVisibilities = ["required", "optional"];
function deckPlanExists(repositoryPath, paths) {
  return artifactExists(repositoryPath, paths.deckPlanPath);
}
function inspectPlanningArtifacts(repositoryPath, paths) {
  const analysisExists = artifactExists(repositoryPath, paths.curriculumAnalysisPath);
  const curriculumExists = artifactExists(repositoryPath, paths.curriculumPath);
  const planExists = artifactExists(repositoryPath, paths.deckPlanPath);
  if (!analysisExists && !curriculumExists) {
    if (planExists) throw new Error("deck plan exists without its curriculum artifacts.");
    return { curriculum: false, deckPlan: false };
  }
  if (analysisExists !== curriculumExists) throw new Error("curriculum analysis and curriculum must either both exist or both be absent.");
  const bundle = readGenericCurriculumBundle(repositoryPath, paths);
  if (!planExists) return { curriculum: true, deckPlan: false };
  readArchitectedDeckPlan(repositoryPath, paths, bundle);
  return { curriculum: true, deckPlan: true };
}
function removePlanningArtifacts(repositoryPath, paths) {
  const removed = [];
  for (const artifactPath of [paths.curriculumAnalysisPath, paths.curriculumPath, paths.deckPlanPath]) {
    const absolutePath = resolve(repositoryPath, artifactPath);
    if (!existsSync(absolutePath)) continue;
    rmSync(absolutePath, { force: true });
    removed.push(artifactPath);
  }
  return removed;
}
function readGenericCurriculumBundle(repositoryPath, paths) {
  const curriculum = parseCurriculum(readJson(repositoryPath, paths.curriculumPath), paths);
  const analysis = parseAnalysis(readJson(repositoryPath, curriculum.analysisPath));
  validateCurriculum(curriculum, analysis);
  return { curriculum, analysis };
}
function readArchitectedDeckPlan(repositoryPath, paths, bundle) {
  return parseDeckPlan(readJson(repositoryPath, paths.deckPlanPath), paths, bundle);
}
function parseAnalysis(value) {
  const record = object(value, "curriculum analysis");
  if (record.schemaVersion !== 3) throw new Error("curriculum analysis schemaVersion must be 3.");
  const coverageItems = array(record.coverageItems, "curriculum analysis coverageItems").map((value2, index) => {
    const label = `curriculum analysis coverage item ${index + 1}`;
    const item = object(value2, label);
    const sourceReferences = array(item.sourceReferences, `${label} sourceReferences`).map((value3, referenceIndex) => {
      const reference = typeof value3 === "string" ? { sourceId: value3 } : object(value3, `${label} source reference ${referenceIndex + 1}`);
      return { sourceId: text(reference.sourceId, `${label} source reference ${referenceIndex + 1} sourceId`) };
    });
    if (sourceReferences.length === 0) throw new Error(`${label} requires source references.`);
    return {
      id: kebab(item.id, `${label} id`),
      title: text(item.title, `${label} title`),
      kind: text(item.kind, `${label} kind`),
      significance: text(item.significance, `${label} significance`),
      details: nonEmptyStrings(item.details, `${label} details`),
      sourceReferences
    };
  });
  if (coverageItems.length === 0) throw new Error("curriculum analysis requires coverage items.");
  unique(coverageItems.map(({ id }) => id), "curriculum analysis coverage item IDs");
  return { schemaVersion: 3, coverageItems };
}
function parseCurriculum(value, paths) {
  const record = object(value, "curriculum");
  if (record.schemaVersion !== 3) throw new Error("curriculum schemaVersion must be 3.");
  const analysisPath = text(record.analysisPath, "curriculum analysisPath");
  if (analysisPath !== paths.curriculumAnalysisPath) {
    throw new Error(`curriculum analysisPath must be ${paths.curriculumAnalysisPath}.`);
  }
  const storyline = object(record.storyline, "curriculum storyline");
  const neighborhoods = array(record.neighborhoods, "curriculum neighborhoods").map((value2, neighborhoodIndex) => {
    const label = `curriculum neighborhood ${neighborhoodIndex + 1}`;
    const neighborhood = object(value2, label);
    const outcomes = array(neighborhood.outcomes, `${label} outcomes`).map((value3, outcomeIndex) => {
      const outcomeLabel = `${label} outcome ${outcomeIndex + 1}`;
      const outcome = object(value3, outcomeLabel);
      const coverage = array(outcome.coverage, `${outcomeLabel} coverage`).map((value4, coverageIndex) => {
        const coverageLabel = `${outcomeLabel} coverage ${coverageIndex + 1}`;
        const entry = object(value4, coverageLabel);
        return {
          itemId: kebab(entry.itemId, `${coverageLabel} itemId`),
          role: enumeration(entry.role, coverageRoles, `${coverageLabel} role`),
          visibility: enumeration(entry.visibility, coverageVisibilities, `${coverageLabel} visibility`),
          rationale: text(entry.rationale, `${coverageLabel} rationale`)
        };
      });
      if (coverage.length === 0) throw new Error(`${outcomeLabel} requires coverage.`);
      return {
        id: kebab(outcome.id, `${outcomeLabel} id`),
        title: text(outcome.title, `${outcomeLabel} title`),
        objective: text(outcome.objective, `${outcomeLabel} objective`),
        coverage
      };
    });
    if (outcomes.length === 0) throw new Error(`${label} requires outcomes.`);
    return {
      id: kebab(neighborhood.id, `${label} id`),
      title: text(neighborhood.title, `${label} title`),
      purpose: text(neighborhood.purpose, `${label} purpose`),
      narrativeBridge: text(neighborhood.narrativeBridge, `${label} narrativeBridge`),
      outcomes
    };
  });
  if (neighborhoods.length === 0) throw new Error("curriculum requires neighborhoods.");
  unique(neighborhoods.map(({ id }) => id), "curriculum neighborhood IDs");
  const outcomeIds = neighborhoods.flatMap(({ outcomes }) => outcomes.map(({ id }) => id));
  unique(outcomeIds, "curriculum outcome IDs");
  const omissions = array(record.omissions, "curriculum omissions").map((value2, index) => {
    const omission = object(value2, `curriculum omission ${index + 1}`);
    return { itemId: kebab(omission.itemId, `curriculum omission ${index + 1} itemId`), reason: text(omission.reason, `curriculum omission ${index + 1} reason`) };
  });
  return {
    schemaVersion: 3,
    analysisPath,
    learningGoal: text(record.learningGoal, "curriculum learningGoal"),
    storyline: {
      title: text(storyline.title, "curriculum storyline title"),
      throughline: text(storyline.throughline, "curriculum storyline throughline"),
      rationale: text(storyline.rationale, "curriculum storyline rationale")
    },
    neighborhoods,
    omissions
  };
}
function validateCurriculum(curriculum, analysis) {
  const accounted = [
    ...curriculum.neighborhoods.flatMap(({ outcomes }) => outcomes.flatMap(({ coverage }) => coverage.map(({ itemId }) => itemId))),
    ...curriculum.omissions.map(({ itemId }) => itemId)
  ];
  unique(accounted, "curriculum coverage and omission item IDs");
  const expected = analysis.coverageItems.map(({ id }) => id);
  if (accounted.length !== expected.length || expected.some((id) => !accounted.includes(id))) {
    throw new Error("curriculum must map or omit every analysis coverage item exactly once.");
  }
}
function parseDeckPlan(value, paths, bundle) {
  const record = object(value, "deck plan");
  if (record.schemaVersion !== 7) throw new Error("deck plan schemaVersion must be 7.");
  if (record.curriculumPath !== paths.curriculumPath || record.analysisPath !== bundle.curriculum.analysisPath || record.outputPath !== paths.htmlPath) {
    throw new Error("deck plan paths must match the curriculum and workflow outputs.");
  }
  const story = object(record.story, "deck plan story");
  const strategy = object(record.presentationStrategy, "deck plan presentationStrategy");
  const opening = object(record.openingSlide, "deck plan openingSlide");
  const momentIds = [kebab(opening.id, "deck plan openingSlide id")];
  const mappedOutcomes = [];
  const mappedItems = [];
  const neighborhoods = array(record.neighborhoods, "deck plan neighborhoods").map((value2, neighborhoodIndex) => {
    const label = `deck plan neighborhood ${neighborhoodIndex + 1}`;
    const neighborhood = object(value2, label);
    const expectedNeighborhood = bundle.curriculum.neighborhoods[neighborhoodIndex];
    if (!expectedNeighborhood || neighborhood.curriculumNeighborhoodId !== expectedNeighborhood.id) {
      throw new Error(`${label} must map curriculum neighborhood ${expectedNeighborhood?.id ?? "absent"}.`);
    }
    const contentMoments = array(neighborhood.contentMoments, `${label} contentMoments`).map((value3, momentIndex) => {
      const momentLabel = `${label} content moment ${momentIndex + 1}`;
      const moment = object(value3, momentLabel);
      const outcomeIds = nonEmptyStrings(moment.outcomeIds, `${momentLabel} outcomeIds`);
      for (const outcomeId of outcomeIds) {
        if (!expectedNeighborhood.outcomes.some(({ id: id2 }) => id2 === outcomeId)) throw new Error(`${momentLabel} outcome ${outcomeId} does not belong to ${expectedNeighborhood.id}.`);
        mappedOutcomes.push(outcomeId);
      }
      const coverageItemIds = nonEmptyStrings(moment.coverageItemIds, `${momentLabel} coverageItemIds`).map((value4, coverageIndex) => {
        const itemId = kebab(value4, `${momentLabel} coverageItemIds ${coverageIndex + 1}`);
        const expectedCoverage = expectedNeighborhood.outcomes.flatMap(({ coverage }) => coverage).find((candidate) => candidate.itemId === itemId);
        if (!expectedCoverage) throw new Error(`${momentLabel} coverage item ${itemId} does not belong to ${expectedNeighborhood.id}.`);
        mappedItems.push(itemId);
        return itemId;
      });
      const id = kebab(moment.id, `${momentLabel} id`);
      momentIds.push(id);
      return {
        id,
        audienceConclusion: text(moment.audienceConclusion, `${momentLabel} audienceConclusion`),
        outcomeIds,
        coverageItemIds
      };
    });
    if (contentMoments.length === 0) throw new Error(`${label} requires contentMoments.`);
    return {
      id: kebab(neighborhood.id, `${label} id`),
      curriculumNeighborhoodId: expectedNeighborhood.id,
      title: text(neighborhood.title, `${label} title`),
      purpose: text(neighborhood.purpose, `${label} purpose`),
      transition: text(neighborhood.transition, `${label} transition`),
      contentMoments
    };
  });
  if (neighborhoods.length !== bundle.curriculum.neighborhoods.length) throw new Error("deck plan must preserve every curriculum neighborhood in order.");
  unique(momentIds, "deck plan opening and content moment IDs");
  const expectedOutcomeIds = bundle.curriculum.neighborhoods.flatMap(({ outcomes }) => outcomes.map(({ id }) => id));
  if (expectedOutcomeIds.some((id) => !mappedOutcomes.includes(id))) {
    throw new Error("deck plan must represent every curriculum outcome.");
  }
  unique(mappedItems, "deck plan coverage item IDs");
  const expectedItemIds = bundle.curriculum.neighborhoods.flatMap(({ outcomes }) => outcomes.flatMap(({ coverage }) => coverage.map(({ itemId }) => itemId)));
  if (mappedItems.length !== expectedItemIds.length || expectedItemIds.some((id) => !mappedItems.includes(id))) {
    throw new Error("deck plan must map every retained curriculum coverage item exactly once.");
  }
  return {
    schemaVersion: 7,
    curriculumPath: paths.curriculumPath,
    analysisPath: bundle.curriculum.analysisPath,
    outputPath: paths.htmlPath,
    story: {
      title: text(story.title, "deck plan story title"),
      openingPromise: text(story.openingPromise, "deck plan story openingPromise"),
      throughline: text(story.throughline, "deck plan story throughline"),
      endingResolution: text(story.endingResolution, "deck plan story endingResolution")
    },
    presentationStrategy: {
      audienceExperience: text(strategy.audienceExperience, "deck plan presentationStrategy audienceExperience"),
      compactnessRationale: text(strategy.compactnessRationale, "deck plan presentationStrategy compactnessRationale")
    },
    openingSlide: {
      id: momentIds[0],
      titleIntent: text(opening.titleIntent, "deck plan openingSlide titleIntent"),
      decisionPromise: text(opening.decisionPromise, "deck plan openingSlide decisionPromise")
    },
    neighborhoods
  };
}
function readJson(repositoryPath, artifactPath) {
  const absolutePath = resolve(repositoryPath, artifactPath);
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) throw new Error(`Expected ${artifactPath} to exist.`);
  try {
    return JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch (error) {
    throw new Error(`${artifactPath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function artifactExists(repositoryPath, artifactPath) {
  const absolutePath = resolve(repositoryPath, artifactPath);
  return existsSync(absolutePath) && statSync(absolutePath).isFile();
}
function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}
function array(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}
function strings(value, label) {
  return array(value, label).map((item, index) => text(item, `${label}[${index}]`));
}
function nonEmptyStrings(value, label) {
  const values = strings(value, label);
  if (values.length === 0) throw new Error(`${label} must not be empty.`);
  return values;
}
function text(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be non-empty text.`);
  return value;
}
function kebab(value, label) {
  const result = text(value, label);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(result)) throw new Error(`${label} must be kebab-case ASCII.`);
  return result;
}
function enumeration(value, allowed, label) {
  if (typeof value === "string" && allowed.includes(value)) return value;
  throw new Error(`${label} must be one of: ${allowed.join(", ")}.`);
}
function unique(values, label) {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique.`);
}

// src/contracts.ts
import { existsSync as existsSync2, readFileSync as readFileSync2, statSync as statSync2 } from "node:fs";
import { resolve as resolve2 } from "node:path";
function assertExpectedFile(repositoryPath, artifactPath, label) {
  const absolutePath = resolve2(repositoryPath, artifactPath);
  if (!existsSync2(absolutePath) || !statSync2(absolutePath).isFile()) {
    throw new Error(`Expected ${label} at ${artifactPath}.`);
  }
}
function validatePresentation(repositoryPath, htmlPath, plan) {
  assertExpectedFile(repositoryPath, htmlPath, "walkthrough presentation");
  const rawHtml = readFileSync2(resolve2(repositoryPath, htmlPath), "utf8");
  const html = rawHtml.replace(/<!--[\s\S]*?-->/g, "");
  requireElementCount(html, "data-walkthrough-deck", 1, "presentation root");
  requireElementCount(html, "data-slide-viewport", 1, "slide viewport");
  requireElementCount(html, "data-slide-navigation", 1, "slide navigation");
  if (rawHtml.includes("<!-- walkthrough-content-end -->")) {
    throw new Error("The completed presentation still contains the neighborhood insertion marker.");
  }
  const slideTags = elementsWithAttribute(html, "data-walkthrough-slide");
  if (slideTags.length < 2) {
    throw new Error("The completed presentation requires an opening slide and at least one substantive slide.");
  }
  const slideIds = slideTags.map((tag, index) => requiredAttribute(tag, "id", `slide ${index + 1}`));
  unique2(slideIds, "walkthrough slide IDs");
  if (slideIds[0] !== plan.openingSlide.id) {
    throw new Error(`The first slide must be the planned opening slide ${plan.openingSlide.id}.`);
  }
  if (slideIds.filter((id) => id === plan.openingSlide.id).length !== 1) {
    throw new Error(`The planned opening slide ${plan.openingSlide.id} must appear exactly once.`);
  }
  const plannedMomentIds = plan.neighborhoods.flatMap((neighborhood) => neighborhood.contentMoments.map((moment) => moment.id));
  const realizedMomentIds = slideTags.flatMap((tag) => optionalAttribute(tag, "data-content-moments")?.split(/\s+/).filter(Boolean) ?? []);
  const planned = new Set(plannedMomentIds);
  const unknown = [...new Set(realizedMomentIds.filter((id) => !planned.has(id)))];
  if (unknown.length > 0) {
    throw new Error(`The presentation contains unknown content moment IDs: ${unknown.join(", ")}.`);
  }
  const missing = plannedMomentIds.filter((id) => !realizedMomentIds.includes(id));
  if (missing.length > 0) {
    throw new Error(`The presentation does not realize these planned content moments: ${missing.join(", ")}.`);
  }
  return {
    neighborhoodCount: plan.neighborhoods.length,
    contentMomentCount: plannedMomentIds.length,
    substantiveSlideCount: slideTags.length - 1,
    totalSlideCount: slideTags.length,
    coverageItemCount: plan.neighborhoods.reduce(
      (count, neighborhood) => count + neighborhood.contentMoments.reduce(
        (momentCount, moment) => momentCount + moment.coverageItemIds.length,
        0
      ),
      0
    )
  };
}
function requireElementCount(html, attribute, expected, label) {
  const count = elementsWithAttribute(html, attribute).length;
  if (count !== expected) throw new Error(`Expected exactly ${expected} ${label}, found ${count}.`);
}
function elementsWithAttribute(html, attribute) {
  const expression = new RegExp("<[a-z][^>]*\\b" + escapeRegExp(attribute) + `(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+))?[^>]*>`, "gi");
  return html.match(expression) ?? [];
}
function requiredAttribute(tag, attribute, label) {
  const value = optionalAttribute(tag, attribute);
  if (!value) throw new Error(`${label} requires a non-empty ${attribute} attribute.`);
  return value;
}
function optionalAttribute(tag, attribute) {
  const expression = new RegExp("(?:^|\\s)" + escapeRegExp(attribute) + `\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`, "i");
  const match = expression.exec(tag);
  return match ? match[1] ?? match[2] ?? match[3] ?? "" : null;
}
function unique2(values, label) {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique.`);
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&");
}

// src/prompts.ts
var PREPARATION_FOOTER = "Work unattended and finish the requested file in this turn. Do not run tasks or shell commands in the background, but you may run them in the foreground.";
var PLAIN_LANGUAGE_STANDARD = "Use direct, plain language. Lead with behavior or consequence, define unfamiliar terms before use, and keep exact identifiers where they add precision. Omit or merge material that does not change understanding.";
var DECK_EXPERIENCE = `Create a self-paced presentation whose main narrative is understandable at a glance. Each slide should feel like a composed presentation canvas rather than a document section. Show all primary content immediately; Next and Back move between slides and never reveal fragments within a slide. Keep exact contracts available without crowding the main narrative, using accessible details or dependable scrolling for optional evidence. Choose typography, composition, visual language, and representations that suit the material. Keep the result readable, responsive, non-overlapping, accessible, and coherent.`;
var VISUAL_STORYTELLING_STANDARD = `Use diagrams as the primary explanation when the material is fundamentally relational, sequential, or stateful. Sequence, state, flow, dependency, and data-model diagrams are especially useful. Mermaid is available when it produces the cleanest result; render diagrams in the finished deck rather than showing their source. Reuse or evolve a diagram across adjacent slides when that preserves context. Do not substitute a grid of prose cards for a relationship that one clear diagram can show directly.`;
function unattended(body) {
  return `${body}

${PREPARATION_FOOTER}`;
}
function genericDeckArchitecturePrompt(input) {
  return unattended(`Turn the approved curriculum into a concise narrative and coverage brief for a presentation.

Story: ${input.story}
Curriculum: ${input.paths.curriculumPath}
Curriculum analysis: ${input.paths.curriculumAnalysisPath}
Future deck: ${input.paths.htmlPath}
Output plan: ${input.paths.deckPlanPath}

Read both curriculum files. The curriculum decides what the audience must understand and the analysis is the authority for grounded facts, details, and source references. Preserve the curriculum's storyline, neighborhood order, outcomes, coverage roles, visibility choices, and omissions.

This is narrative architecture, not slide allocation, copywriting, visual design, or HTML construction. Identify the sequence of conclusions the audience needs to reach and map every retained coverage item to that sequence. A content moment is one teaching move, not an eventual slide or a compressed summary of its evidence. State its audienceConclusion as one short, direct sentence. The coverage IDs carry the supporting facts and exact contracts, so do not repeat those details in the conclusion. Combine related outcomes when they support the same teaching move.

${PLAIN_LANGUAGE_STANDARD}

Create the smallest useful sequence of content moments without dropping load-bearing context or exact contracts such as schemas, APIs, events, state machines, security boundaries, and other reviewable system or implementation contracts. The deck creator will decide how many slides to use and how to represent the material. Describe the grouping logic in compactnessRationale without asserting a content-moment or slide count that could drift from the arrays.

Write exactly this JSON shape:
{
  "schemaVersion": 7,
  "curriculumPath": ${JSON.stringify(input.paths.curriculumPath)},
  "analysisPath": ${JSON.stringify(input.paths.curriculumAnalysisPath)},
  "outputPath": ${JSON.stringify(input.paths.htmlPath)},
  "story": {
    "title": "Presentation title",
    "openingPromise": "What the audience will be able to decide",
    "throughline": "The idea connecting the presentation",
    "endingResolution": "The approval-ready conclusion"
  },
  "presentationStrategy": {
    "audienceExperience": "How the presentation should feel and be consumed",
    "compactnessRationale": "Why this is the smallest useful sequence of audience conclusions"
  },
  "openingSlide": {
    "id": "opening",
    "titleIntent": "What the opening title should establish",
    "decisionPromise": "What the audience will be ready to decide"
  },
  "neighborhoods": [{
    "id": "presentation-neighborhood-id",
    "curriculumNeighborhoodId": "curriculum-neighborhood-id",
    "title": "Neighborhood title",
    "purpose": "What this movement establishes",
    "transition": "How it connects to the next movement",
    "contentMoments": [{
      "id": "unique-content-moment-id",
      "audienceConclusion": "The distinct conclusion the audience needs to reach",
      "outcomeIds": ["curriculum-outcome-id"],
      "coverageItemIds": ["curriculum-coverage-item-id"]
    }]
  }]
}

Create exactly the curriculum neighborhoods in order. Represent every curriculum outcome and map every retained coverage item exactly once within its neighborhood. The opening slide stays minimal and does not absorb curriculum outcomes or coverage. Do not prescribe slide boundaries, representations, layouts, typography, interactions, or overflow behavior. Write only ${input.paths.deckPlanPath}.`);
}
function genericDeckShellPrompt(input) {
  return unattended(`Create the opening slide and lightweight working shell for the approved standalone presentation.

Story: ${input.story}
Curriculum: ${input.paths.curriculumPath}
Deck plan: ${input.paths.deckPlanPath}
Output: ${input.paths.htmlPath}

Read the deck plan and create one self-contained HTML file with embedded CSS and JavaScript. The presentation should use the full available browser viewport so diagrams and composed layouts have room to breathe. Constrain prose where that improves reading, but do not constrain the slide canvas or visual field. Make overflow and scrolling dependable wherever a slide needs more vertical space.

Create the minimal opening slide from openingSlide and establish an initial visual tone without imposing a rigid component system on later neighborhoods. Provide coherent navigation, progress, responsive and print behavior, accessibility, and focus behavior. Set up Mermaid so later creators can use it when it is the clearest way to express a sequence, state, flow, dependency, or data model. Make every rendered diagram independently inspectable with discoverable zoom, pan, and reset behavior that does not disrupt slide navigation or ordinary slide scrolling.

The workflow integration contract is small: place data-walkthrough-deck on the root, data-slide-viewport on the slide viewport, data-walkthrough-slide and the planned opening id on the opening section, and data-slide-navigation on the navigation. Leave <!-- walkthrough-content-end --> inside the slide viewport as the insertion point for neighborhoods. Derive displayed numbers, totals, and progress from the rendered slides.

${PLAIN_LANGUAGE_STANDARD}
${DECK_EXPERIENCE}

Write ${input.paths.htmlPath}. This turn creates the opening and shared presentation environment, not any neighborhood content.`);
}
function genericDeckNeighborhoodPrompt(input, plan, neighborhood, neighborhoodIndex) {
  return unattended(`Create one complete neighborhood of the standalone presentation.

Story: ${input.story}
Curriculum: ${input.paths.curriculumPath}
Curriculum analysis: ${input.paths.curriculumAnalysisPath}
Deck plan: ${input.paths.deckPlanPath}
Canonical sources: ${JSON.stringify(input.sources)}
Deck: ${input.paths.htmlPath}
Neighborhood ${neighborhoodIndex + 1} of ${plan.neighborhoods.length}:
${JSON.stringify(neighborhood, null, 2)}

Use the Show Me skill to turn this neighborhood into a compelling visual explanation. The content moments define the conclusions and coverage that must survive; they are not prescribed slides. Decide the number and order of slides, their titles, representations, layouts, and visual rhythm. Use the smallest sequence that communicates the neighborhood clearly.

Treat each content moment as one visual teaching movement by default. A slide may carry adjacent moments when one representation explains them together. Split a moment only when its primary understanding genuinely requires distinct steps; an exact contract is not by itself a reason for another slide.

Resolve coverage item IDs through the curriculum and analysis. Preserve exact schemas, APIs, events, state transitions, security boundaries, and other contracts needed for approval. Consult the canonical Markdown only when an exact detail remains ambiguous. Do not turn source references or the plan into audience-facing prose.

Inspect the opening and earlier neighborhoods. Preserve their content and mechanics while extending the visual language when this material calls for it. Add this neighborhood's sections immediately before <!-- walkthrough-content-end --> in story order. Give every section data-walkthrough-slide, a unique id, and data-walkthrough-neighborhood="${neighborhood.id}". Record the content moments realized by each slide as space-separated IDs in data-content-moments. Every content moment in this neighborhood must appear on at least one slide.

${PLAIN_LANGUAGE_STANDARD}
${DECK_EXPERIENCE}
${VISUAL_STORYTELLING_STANDARD}

Modify only ${input.paths.htmlPath}. Complete the entire neighborhood in this turn and leave deck-wide assembly for the final turn.`);
}
function genericDeckAssemblyPrompt(input) {
  return unattended(`Complete the assembled neighborhoods as one polished standalone presentation.

Curriculum: ${input.paths.curriculumPath}
Curriculum analysis: ${input.paths.curriculumAnalysisPath}
Deck plan: ${input.paths.deckPlanPath}
Deck: ${input.paths.htmlPath}

Inspect the complete deck and make the editorial and visual decisions needed for it to feel like one intentional presentation. Begin with a compression pass: compare the substantive slide count with the content moments in the plan and challenge every expansion. Merge adjacent slides that realize the same moment, let one strong visual carry adjacent moments when appropriate, and fold reference-only slides into inspectable detail. A large expansion is a diagnostic signal, not a hard quota. Split or redesign slides only when clarity genuinely requires it.

Preserve the opening promise, neighborhood order, every content moment, every retained coverage item, and the exact contracts needed for approval. Preserve and correct data-content-moments mappings as slides are merged or redesigned. Remove the insertion marker and finish neighborhood transitions, the ending, navigation, progress, focus behavior, accessibility, responsive behavior, scrolling, and print behavior.

${PLAIN_LANGUAGE_STANDARD}
${DECK_EXPERIENCE}
${VISUAL_STORYTELLING_STANDARD}

No model reviewer follows this assembly. Render and inspect the completed deck at 1440\xD7900, 1280\xD7720, and 1024\xD7768. Exercise navigation and optional-detail controls, then correct overlap, clipping, unreadable content, broken scrolling, stale numbering, hidden primary content, and visible stacking between slides. Modify only ${input.paths.htmlPath}.`);
}
function genericSocraticPrompt(input) {
  return `Guide a self-paced Socratic walkthrough from the approved curriculum.

Story: ${input.story}
Curriculum: ${input.paths.curriculumPath}
Curriculum analysis: ${input.paths.curriculumAnalysisPath}
Canonical sources: ${JSON.stringify(input.sources)}

Read the curriculum and analysis. Use the curriculum's storyline, neighborhoods, outcomes, coverage roles, and visibility choices as the teaching contract. Use the analysis for grounded details and source references. Help the user build the intended model and reach their own approval judgment through concise explanations, focused questions, and checks for understanding. Preserve exact schemas, APIs, events, state transitions, and other contracts when they matter to the judgment.

Begin with a brief orientation and the first useful question. Let the user's answers determine clarification and pacing inside this pane. Group related obligations around the curriculum outcomes instead of turning every coverage item into a separate lesson. Use the Show Me skill when a focused representation materially helps.

${PLAIN_LANGUAGE_STANDARD}`;
}

// src/workflow.ts
var SHOW_ME_MODIFIER = [{ kind: "skill", name: "show-me" }];
async function step(ctx, state, incoming) {
  const input = promptInput(state);
  switch (state.stage.kind) {
    case "start_curriculum_workflow": {
      let reusableArtifacts;
      try {
        reusableArtifacts = inspectPlanningArtifacts(state.repositoryPath, state.paths);
      } catch (error) {
        try {
          const removed = removePlanningArtifacts(state.repositoryPath, state.paths);
          await ctx.log("warning", `Reset walkthrough planning artifacts after deterministic validation failed: ${errorText(error)} Removed: ${removed.join(", ") || "none"}.`);
          reusableArtifacts = { curriculum: false, deckPlan: false };
        } catch (removalError) {
          return failed(ctx, "Invalid walkthrough planning artifacts could not be reset.", errorText(removalError));
        }
      }
      if (reusableArtifacts.curriculum) {
        const deckMessage = state.deliveryMechanism === "presentation" ? reusableArtifacts.deckPlan ? "The approved deck plan will also be reused." : "A new deck plan will be created." : "Continuing directly to Socratic learning.";
        await ctx.log("info", `Reusing existing curriculum ${state.paths.curriculumPath}; curriculum design is skipped.`);
        await ctx.setUiFeedback({ phase: "Reusing the approved curriculum", message: deckMessage });
        return i(withStage(state, nextDeliveryStage(state.deliveryMechanism)));
      }
      await ctx.setUiFeedback({ phase: "Designing the walkthrough curriculum", message: "Creating the analysis and curriculum before continuing to the selected delivery mode." });
      const runId = await ctx.startWorkflow("design-curriculum", {
        sources: [
          { id: "current-state", path: state.sources.currentStatePath, description: "The current-state map and evidence the proposal changes." },
          { id: "architecture", path: state.sources.architecturePath, description: "The proposed architecture and its consequential decisions." },
          { id: "program-design", path: state.sources.programDesignPath, description: "The proposed program design and exact changed contracts." }
        ],
        learningGoal: "Understand the current-state map, proposed architecture, and program design well enough to approve or reject the proposed solution.",
        audienceFamiliarity: curriculumFamiliarity(state.audienceProfile),
        audienceDepth: curriculumDepth(state.audienceProfile),
        teachingBrief: "Establish enough of the current-state map to evaluate the proposal. Connect architecture and program realization wherever teaching them together preserves context. Keep exact changed contracts available as reference material needed for approval. Choose the final storyline from the actual sources when a different grouping is clearer.",
        outputDirectory: state.paths.walkthroughDirectory
      });
      await ctx.log("info", `Started design-curriculum child workflow ${runId}.`);
      return a(withStage(state, { kind: "await_curriculum_workflow", runId }), o.workflow(runId));
    }
    case "await_curriculum_workflow": {
      try {
        completedCurriculumResult(incoming, state.stage.runId, state.paths);
        readGenericCurriculumBundle(state.repositoryPath, state.paths);
        return i(withStage(state, nextDeliveryStage(state.deliveryMechanism)));
      } catch (error) {
        return failed(ctx, "The curriculum workflow did not complete successfully.", errorText(error));
      }
    }
    case "start_presentation": {
      let bundle;
      try {
        bundle = readGenericCurriculumBundle(state.repositoryPath, state.paths);
      } catch (error) {
        return failed(ctx, "Presentation creation cannot start because the curriculum is invalid.", errorText(error));
      }
      if (!deckPlanExists(state.repositoryPath, state.paths)) {
        return i(withStage(state, { kind: "start_deck_architecture" }));
      }
      try {
        const plan = readArchitectedDeckPlan(state.repositoryPath, state.paths, bundle);
        await ctx.log("info", `Reusing existing deck plan ${state.paths.deckPlanPath}; deck architecture is skipped.`);
        await ctx.setUiFeedback({ phase: "Reusing the approved deck plan", message: `Rebuilding ${state.paths.htmlPath} neighborhood by neighborhood.` });
        return i(withStage(state, { kind: "start_deck_shell", plan }));
      } catch (error) {
        return failed(ctx, "The existing deck plan cannot be reused.", errorText(error));
      }
    }
    case "start_deck_architecture": {
      try {
        readGenericCurriculumBundle(state.repositoryPath, state.paths);
      } catch (error) {
        return failed(ctx, "Deck architecture cannot start because the curriculum is invalid.", errorText(error));
      }
      await ctx.setUiFeedback({ phase: "Architecting the presentation", message: "Planning the narrative, audience conclusions, and complete coverage before visual construction." });
      const architect = visible(await ctx.spawnAgentSession({ ...deckArchitect, prompt: genericDeckArchitecturePrompt(input) }));
      return a(withStage(state, { kind: "await_deck_architecture", architect }), o.agentTurn(architect));
    }
    case "await_deck_architecture": {
      const turnFailure = turnError(incoming, "Deck architecture", state.stage.architect);
      if (turnFailure) return failed(ctx, "Deck architecture failed. Its pane remains open.", turnFailure);
      try {
        const bundle = readGenericCurriculumBundle(state.repositoryPath, state.paths);
        const plan = readArchitectedDeckPlan(state.repositoryPath, state.paths, bundle);
        await ctx.closePane(state.stage.architect.paneId);
        return i(withStage(state, { kind: "start_deck_shell", plan }));
      } catch (error) {
        return failed(ctx, "The deck architecture plan is invalid. Its pane remains open.", errorText(error));
      }
    }
    case "start_deck_shell": {
      await ctx.setUiFeedback({ phase: "Establishing the presentation design", message: "Creating the shared presentation environment and opening slide." });
      const builder = visible(await ctx.spawnAgentSession({ ...deckBuilder, prompt: genericDeckShellPrompt(input) }));
      return a(withStage(state, { kind: "await_deck_shell", plan: state.stage.plan, builder }), o.agentTurn(builder));
    }
    case "await_deck_shell": {
      const turnFailure = turnError(incoming, "Deck shell creation", state.stage.builder);
      if (turnFailure) return failed(ctx, "Deck shell creation failed. Its pane remains open.", turnFailure);
      try {
        assertExpectedFile(state.repositoryPath, state.paths.htmlPath, "walkthrough deck shell");
        await ctx.closePane(state.stage.builder.paneId);
        return i(withStage(state, { kind: "start_neighborhood", plan: state.stage.plan, neighborhoodIndex: 0 }));
      } catch (error) {
        return failed(ctx, "The deck shell is missing. Its pane remains open.", errorText(error));
      }
    }
    case "start_neighborhood": {
      const neighborhood = neighborhoodAt(state.stage.plan, state.stage.neighborhoodIndex);
      await ctx.setUiFeedback({ phase: `Creating ${neighborhood.title}`, message: `Neighborhood ${state.stage.neighborhoodIndex + 1} of ${state.stage.plan.neighborhoods.length} in a fresh Show Me session.` });
      const builder = visible(await ctx.spawnAgentSession({
        ...deckBuilder,
        modifiers: SHOW_ME_MODIFIER,
        prompt: genericDeckNeighborhoodPrompt(input, state.stage.plan, neighborhood, state.stage.neighborhoodIndex)
      }));
      return a(withStage(state, { ...state.stage, kind: "await_neighborhood", builder }), o.agentTurn(builder));
    }
    case "await_neighborhood": {
      const turnFailure = turnError(incoming, "Neighborhood construction", state.stage.builder);
      if (turnFailure) return failed(ctx, "Neighborhood construction failed. Its pane remains open.", turnFailure);
      try {
        assertExpectedFile(state.repositoryPath, state.paths.htmlPath, "walkthrough deck");
        await ctx.closePane(state.stage.builder.paneId);
        if (state.stage.neighborhoodIndex + 1 < state.stage.plan.neighborhoods.length) {
          return i(withStage(state, {
            kind: "start_neighborhood",
            plan: state.stage.plan,
            neighborhoodIndex: state.stage.neighborhoodIndex + 1
          }));
        }
        return i(withStage(state, { kind: "start_presentation_assembly", plan: state.stage.plan }));
      } catch (error) {
        return failed(ctx, "The walkthrough deck is missing after neighborhood construction. Its pane remains open.", errorText(error));
      }
    }
    case "start_presentation_assembly": {
      await ctx.setUiFeedback({ phase: "Assembling the walkthrough presentation", message: "Making the neighborhood work feel like one polished presentation." });
      const builder = visible(await ctx.spawnAgentSession({ ...deckBuilder, modifiers: SHOW_ME_MODIFIER, prompt: genericDeckAssemblyPrompt(input) }));
      return a(withStage(state, { kind: "await_presentation_assembly", plan: state.stage.plan, builder }), o.agentTurn(builder));
    }
    case "await_presentation_assembly": {
      const turnFailure = turnError(incoming, "Final deck assembly", state.stage.builder);
      if (turnFailure) return failed(ctx, "Final deck assembly failed. Its pane remains open.", turnFailure);
      try {
        const metrics = validatePresentation(state.repositoryPath, state.paths.htmlPath, state.stage.plan);
        await ctx.closePane(state.stage.builder.paneId);
        await ctx.setUiFeedback({ phase: "Walkthrough presentation created", message: `Open ${state.paths.htmlPath}.` });
        return l({
          outcome: "presentation-created",
          curriculumPath: state.paths.curriculumPath,
          deckPlanPath: state.paths.deckPlanPath,
          presentationPath: state.paths.htmlPath,
          ...metrics
        });
      } catch (error) {
        return failed(ctx, "The assembled walkthrough deck does not satisfy the presentation contract. Its pane remains open.", errorText(error));
      }
    }
    case "start_socratic_walkthrough": {
      try {
        readGenericCurriculumBundle(state.repositoryPath, state.paths);
      } catch (error) {
        return failed(ctx, "Socratic learning cannot start because the curriculum is invalid.", errorText(error));
      }
      await ctx.setUiFeedback({ phase: "Starting the Socratic walkthrough", message: "The guide will use the approved curriculum and grounded coverage analysis." });
      const spawned = visible(await ctx.spawnAgentSession({ ...guide, modifiers: SHOW_ME_MODIFIER, prompt: genericSocraticPrompt(input) }));
      return a(withStage(state, { kind: "await_socratic_walkthrough", guide: spawned }), o.agentTurn(spawned));
    }
    case "await_socratic_walkthrough": {
      const turnFailure = turnError(incoming, "Socratic walkthrough", state.stage.guide);
      if (turnFailure) return failed(ctx, "The Socratic guide failed.", turnFailure);
      await ctx.setUiFeedback({ phase: "Socratic walkthrough in progress", message: "Continue the discussion in the guide pane. Press workflow Continue when you are finished." });
      return a(withStage(state, { kind: "await_socratic_completion", guide: state.stage.guide }), o.userContinue());
    }
    case "await_socratic_completion": {
      if (!s.isUserContinue(incoming)) {
        return failed(ctx, "The Socratic walkthrough could not finish.", "Expected user Continue.");
      }
      await ctx.closePane(state.stage.guide.paneId);
      return l({ outcome: "socratic-walkthrough-completed", curriculumPath: state.paths.curriculumPath });
    }
    default:
      return assertNever(state.stage);
  }
}
function nextDeliveryStage(deliveryMechanism) {
  return deliveryMechanism === "presentation" ? { kind: "start_presentation" } : { kind: "start_socratic_walkthrough" };
}
function promptInput(state) {
  return {
    repositoryPath: state.repositoryPath,
    story: state.story,
    sources: state.sources,
    paths: state.paths,
    audienceProfile: state.audienceProfile
  };
}
function visible(input) {
  return input;
}
function turnError(incoming, label, agent) {
  if (s.isAgentTurnFailed(incoming)) return `${label} failed in pane ${agent.paneId}: ${incoming.reason}`;
  if (!s.isAgentTurnEnded(incoming)) return `${label} resumed with an unexpected event in pane ${agent.paneId}.`;
  return null;
}
function neighborhoodAt(plan, index) {
  const neighborhood = plan.neighborhoods[index];
  if (!neighborhood) throw new Error(`No deck neighborhood exists at index ${index}.`);
  return neighborhood;
}
function curriculumFamiliarity(profile) {
  return profile.familiarity === "new" ? "The audience is new to this codebase and needs the essential context required to evaluate the proposal." : "The audience is familiar with this codebase; emphasize consequential changes and include context only when it changes evaluation of the proposal.";
}
function curriculumDepth(profile) {
  switch (profile.technicalDepth) {
    case "product":
      return "Explain behavior, user and operational consequences, and tradeoffs while keeping exact technical evidence available for inspection.";
    case "system-design":
      return "Explain system boundaries, ownership, flows, state changes, tradeoffs, and the consequential contracts needed to evaluate the design.";
    case "implementation":
      return "Explain system intent together with implementation mechanics, exact changed contracts, failure behavior, and migration consequences.";
  }
}
function completedCurriculumResult(incoming, runId, paths) {
  const results = s.getWorkflowResults(incoming);
  if (!results || results.length !== 1 || results[0]?.runId !== runId) {
    throw new Error(`Expected completion result for design-curriculum workflow run ${runId}.`);
  }
  const joined = results[0];
  if (joined.status !== "done") throw new Error(`Design-curriculum workflow run ${runId} failed: ${errorText(joined.error)}`);
  if (!joined.result || typeof joined.result !== "object" || Array.isArray(joined.result)) {
    throw new Error(`Design-curriculum workflow run ${runId} returned no result object.`);
  }
  const result = joined.result;
  if (result.outcome !== "curriculum-created" || result.analysisPath !== paths.curriculumAnalysisPath || result.curriculumPath !== paths.curriculumPath) {
    throw new Error(`Design-curriculum workflow run ${runId} returned an invalid result.`);
  }
}
async function failed(ctx, message, diagnostic) {
  await ctx.setUiFeedback({ kind: "error", phase: "Solution walkthrough failed", message });
  await ctx.log("error", diagnostic);
  return u(diagnostic);
}
function withStage(state, stage) {
  return { ...state, stage };
}
function errorText(value) {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value;
    if (record.reason !== void 0) return errorText(record.reason);
    if (record.message !== void 0) return errorText(record.message);
    if (record.error !== void 0) return errorText(record.error);
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}
function assertNever(value) {
  throw new Error(`Unsupported workflow stage: ${JSON.stringify(value)}`);
}

// src/index.ts
var index_default = r({
  command: () => ({
    title: "Solution Walkthrough Story",
    description: "Reuse or create the curriculum and deck plan, then build a presentation or start a Socratic walkthrough.",
    inputs: [
      { kind: "text", key: "story", label: "Story or story URL" },
      { kind: "text", key: "currentStatePath", label: "Current-state source path", default: "scratch/story/design/current-state.md" },
      { kind: "text", key: "architecturePath", label: "Architecture source path", default: "scratch/story/design/architecture.md" },
      { kind: "text", key: "programDesignPath", label: "Program-design source path", default: "scratch/story/design/program-design.md" },
      { kind: "text", key: "reviewDirectory", label: "Walkthrough output directory", default: "scratch/story/walkthrough" },
      {
        kind: "select",
        key: "familiarity",
        label: "Codebase familiarity",
        options: [
          { value: "new", label: "New to this codebase" },
          { value: "familiar", label: "Familiar with this codebase" }
        ],
        default: "new"
      },
      {
        kind: "select",
        key: "technicalDepth",
        label: "Technical depth",
        options: [
          { value: "product", label: "Product overview" },
          { value: "system-design", label: "System design" },
          { value: "implementation", label: "Implementation detail" }
        ],
        default: "system-design"
      },
      {
        kind: "select",
        key: "deliveryMechanism",
        label: "How should this walkthrough be delivered?",
        options: [
          { value: "presentation", label: "Presentation", hint: "Reuse approved planning artifacts when present and rebuild the standalone deck." },
          { value: "socratic-walkthrough", label: "Socratic walkthrough", hint: "Explore the approved curriculum through an interactive guide." }
        ],
        default: "presentation"
      }
    ]
  }),
  validate: (_launchCtx, variables) => {
    parseVariables(variables);
  },
  init: (launchCtx, variables) => {
    const parsed = parseVariables(variables);
    return {
      stateVersion: 1,
      repositoryPath: launchCtx.worktreePath,
      story: parsed.story,
      sources: parsed.sources,
      paths: walkthroughPaths(parsed.reviewDirectory),
      audienceProfile: {
        familiarity: parsed.familiarity,
        technicalDepth: parsed.technicalDepth
      },
      deliveryMechanism: parsed.deliveryMechanism,
      stage: { kind: "start_curriculum_workflow" }
    };
  },
  step: async (ctx, state, incoming) => {
    await ctx.log("debug", `Solution walkthrough stage=${state.stage.kind}.`);
    return step(ctx, state, incoming);
  }
});
function parseVariables(variables) {
  return {
    story: parseText(variables.story, "story"),
    sources: {
      currentStatePath: parsePath(variables.currentStatePath, "currentStatePath", "scratch/story/design/current-state.md"),
      architecturePath: parsePath(variables.architecturePath, "architecturePath", "scratch/story/design/architecture.md"),
      programDesignPath: parsePath(variables.programDesignPath, "programDesignPath", "scratch/story/design/program-design.md")
    },
    reviewDirectory: parsePath(variables.reviewDirectory, "reviewDirectory", "scratch/story/walkthrough"),
    familiarity: parseEnum(variables.familiarity, "familiarity", familiarityLevels, "new"),
    technicalDepth: parseEnum(variables.technicalDepth, "technicalDepth", technicalDepthLevels, "system-design"),
    deliveryMechanism: parseEnum(variables.deliveryMechanism, "deliveryMechanism", deliveryMechanisms, "presentation")
  };
}
function parseText(value, key) {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  throw new Error(`${key} must be non-empty text.`);
}
function parsePath(value, key, fallback) {
  if (value === void 0) return fallback;
  return parseText(value, key);
}
function parseEnum(value, key, options, fallback) {
  const candidate = value === void 0 ? fallback : value;
  if (typeof candidate === "string" && options.includes(candidate)) return candidate;
  throw new Error(`${key} must be one of ${options.join(", ")}.`);
}
export {
  index_default as default
};
