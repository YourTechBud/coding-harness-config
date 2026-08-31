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

// src/inputs.ts
import { existsSync, realpathSync, statSync } from "node:fs";
import { basename, extname, isAbsolute, relative, resolve } from "node:path";
function parseInputs(repositoryPath, variables) {
  const sources = parseSources(variables.sources);
  for (const source of sources) assertSourceFile(repositoryPath, source.path);
  const outputDirectory = relativePath(variables.outputDirectory, "outputDirectory", "scratch/story/curriculum");
  assertInsideRepository(repositoryPath, outputDirectory, "outputDirectory");
  return {
    repositoryPath,
    sources,
    learningGoal: text(variables.learningGoal, "learningGoal"),
    audience: {
      familiarity: text(variables.audienceFamiliarity, "audienceFamiliarity"),
      depth: text(variables.audienceDepth, "audienceDepth")
    },
    teachingBrief: optionalText(variables.teachingBrief) ?? "Choose the clearest storyline for this audience and learning goal.",
    paths: {
      outputDirectory,
      analysisPath: `${outputDirectory}/curriculum-analysis.json`,
      curriculumPath: `${outputDirectory}/curriculum.json`
    }
  };
}
function parseSources(value) {
  const raw = typeof value === "string" ? value.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean) : value;
  if (!Array.isArray(raw) || raw.length === 0) throw new Error("sources must contain at least one Markdown path.");
  const sources = raw.map((item, index) => parseSource(item, index));
  unique(sources.map(({ id }) => id), "source IDs");
  unique(sources.map(({ path }) => path), "source paths");
  return sources;
}
function parseSource(value, index) {
  if (typeof value === "string") {
    const path = relativePath(value, `sources[${index}]`);
    return { id: sourceId(path), path, description: null };
  }
  const record = exactRecord(value, ["id", "path", "description"], `sources[${index}]`);
  return {
    id: kebab(record.id, `sources[${index}].id`),
    path: relativePath(record.path, `sources[${index}].path`),
    description: nullableText(record.description, `sources[${index}].description`)
  };
}
function assertSourceFile(repositoryPath, path) {
  assertInsideRepository(repositoryPath, path, "source path");
  if (extname(path).toLocaleLowerCase("en-US") !== ".md") throw new Error(`Source ${path} must be a Markdown file.`);
  const absolute = resolve(repositoryPath, path);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) throw new Error(`Source Markdown file ${path} does not exist.`);
  const repositoryRealPath = realpathSync(repositoryPath);
  const sourceRealPath = realpathSync(absolute);
  const fromRepository = relative(repositoryRealPath, sourceRealPath);
  if (fromRepository === ".." || fromRepository.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(fromRepository)) throw new Error(`Source ${path} resolves outside the repository.`);
}
function assertInsideRepository(repositoryPath, path, label) {
  const fromRepository = relative(resolve(repositoryPath), resolve(repositoryPath, path));
  if (fromRepository === ".." || fromRepository.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(fromRepository)) throw new Error(`${label} must stay inside the repository.`);
}
function sourceId(path) {
  const stem = basename(path, extname(path)).toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
  if (!stem) throw new Error(`Could not derive a source ID from ${path}. Pass an object with an explicit id.`);
  return stem;
}
function relativePath(value, label, fallback) {
  const path = value === void 0 ? fallback : value;
  const result = text(path, label);
  if (isAbsolute(result)) throw new Error(`${label} must be workspace-relative.`);
  return result.replaceAll("\\", "/").replace(/\/$/u, "");
}
function text(value, label) {
  if (typeof value === "string" && value.trim()) return value.trim();
  throw new Error(`${label} must be non-empty text.`);
}
function optionalText(value) {
  if (value === void 0 || value === null || value === "") return null;
  return text(value, "teachingBrief");
}
function nullableText(value, label) {
  if (value === null) return null;
  return text(value, label);
}
function kebab(value, label) {
  const result = text(value, label);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(result)) throw new Error(`${label} must be kebab-case ASCII.`);
  return result;
}
function exactRecord(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const record = value;
  const actual = Object.keys(record);
  if (actual.length !== keys.length || keys.some((key) => !Object.hasOwn(record, key))) throw new Error(`${label} must contain exactly: ${keys.join(", ")}.`);
  return record;
}
function unique(values, label) {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique.`);
}

// src/workflow.ts
import { mkdirSync } from "node:fs";
import { resolve as resolve3 } from "node:path";

// src/contracts.ts
import { existsSync as existsSync2, readFileSync, statSync as statSync2 } from "node:fs";
import { resolve as resolve2 } from "node:path";

// src/types.ts
var coverageRoles = ["primary", "supporting", "reference"];
var coverageVisibilities = ["required", "optional"];
var cognitionBudgetConstraints = ["outcome-limit", "neighborhood-limit"];

// src/contracts.ts
function readAnalysis(repositoryPath, learningGoal, audience, sources, paths) {
  const value = object(readJson(repositoryPath, paths.analysisPath), "curriculum analysis");
  if (value.schemaVersion !== 3) throw new Error("curriculum analysis schemaVersion must be 3.");
  if (value.learningGoal !== learningGoal) throw new Error("curriculum analysis learningGoal must match the workflow input.");
  const parsedAudience = parseAudience(value.audience, "curriculum analysis audience");
  if (!sameAudience(parsedAudience, audience)) throw new Error("curriculum analysis audience must match the workflow input.");
  const parsedSources = parseSources2(value.sources, "curriculum analysis sources");
  if (JSON.stringify(parsedSources) !== JSON.stringify(sources)) throw new Error("curriculum analysis sources must match the workflow inputs.");
  const guidingQuestions = parseGuidingQuestions(value.guidingQuestions, "curriculum analysis guidingQuestions");
  if (guidingQuestions.length === 0) throw new Error("curriculum analysis requires at least one guiding question.");
  const questionIds = new Set(guidingQuestions.map(({ id }) => id));
  const coverageItems = array(value.coverageItems, "curriculum analysis coverageItems").map((item, index) => parseCoverageItem(item, index, sources, questionIds));
  if (coverageItems.length === 0) throw new Error("curriculum analysis requires at least one coverage item.");
  unique2(coverageItems.map(({ id }) => id), "curriculum coverage item IDs");
  const itemIds = new Set(coverageItems.map(({ id }) => id));
  for (const item of coverageItems) {
    for (const prerequisite of item.prerequisiteItemIds) if (!itemIds.has(prerequisite)) throw new Error(`Coverage item ${item.id} references unknown prerequisite ${prerequisite}.`);
  }
  for (const question of guidingQuestions) {
    if (!coverageItems.some((item) => item.guidingQuestionIds.includes(question.id))) throw new Error(`Guiding question ${question.id} is not represented by any coverage item.`);
  }
  return { schemaVersion: 3, learningGoal, audience, sources, guidingQuestions, coverageItems };
}
function readCurriculum(repositoryPath, teachingBrief, paths, analysis) {
  const value = object(readJson(repositoryPath, paths.curriculumPath), "curriculum");
  if (value.schemaVersion !== 3) throw new Error("curriculum schemaVersion must be 3.");
  if (value.analysisPath !== paths.analysisPath || value.learningGoal !== analysis.learningGoal || value.teachingBrief !== teachingBrief) throw new Error("curriculum inputs must match the workflow inputs.");
  const audience = parseAudience(value.audience, "curriculum audience");
  if (!sameAudience(audience, analysis.audience)) throw new Error("curriculum audience must match the analysis.");
  const guidingQuestions = parseGuidingQuestions(value.guidingQuestions, "curriculum guidingQuestions");
  if (JSON.stringify(guidingQuestions) !== JSON.stringify(analysis.guidingQuestions)) throw new Error("curriculum guidingQuestions must match the analysis.");
  const storylineValue = object(value.storyline, "curriculum storyline");
  const cognitionBudget = parseCognitionBudget(value.cognitionBudget);
  const neighborhoods = array(value.neighborhoods, "curriculum neighborhoods").map((neighborhood, index) => parseNeighborhood(neighborhood, index, analysis));
  if (neighborhoods.length === 0) throw new Error("curriculum requires at least one neighborhood.");
  unique2(neighborhoods.map(({ id }) => id), "curriculum neighborhood IDs");
  const omissions = array(value.omissions, "curriculum omissions").map((omission, index) => {
    const parsed = object(omission, `curriculum omission ${index + 1}`);
    return { itemId: kebab2(parsed.itemId, `curriculum omission ${index + 1} itemId`), reason: text2(parsed.reason, `curriculum omission ${index + 1} reason`) };
  });
  validateCurriculum(neighborhoods, omissions, analysis);
  return {
    schemaVersion: 3,
    analysisPath: paths.analysisPath,
    learningGoal: analysis.learningGoal,
    audience,
    teachingBrief,
    guidingQuestions,
    storyline: {
      title: text2(storylineValue.title, "curriculum storyline title"),
      throughline: text2(storylineValue.throughline, "curriculum storyline throughline"),
      rationale: text2(storylineValue.rationale, "curriculum storyline rationale")
    },
    cognitionBudget,
    neighborhoods,
    omissions
  };
}
function assertArtifact(repositoryPath, artifactPath) {
  const absolutePath = resolve2(repositoryPath, artifactPath);
  if (!existsSync2(absolutePath) || !statSync2(absolutePath).isFile()) throw new Error(`Expected curriculum artifact ${artifactPath} was not created.`);
}
function parseCoverageItem(value, index, sources, questionIds) {
  const label = `curriculum coverage item ${index + 1}`;
  const item = object(value, label);
  const guidingQuestionIds = strings(item.guidingQuestionIds, `${label} guidingQuestionIds`);
  if (guidingQuestionIds.length === 0) throw new Error(`${label} requires guidingQuestionIds.`);
  unique2(guidingQuestionIds, `${label} guidingQuestionIds`);
  for (const questionId of guidingQuestionIds) if (!questionIds.has(questionId)) throw new Error(`${label} references unknown guiding question ${questionId}.`);
  const details = strings(item.details, `${label} details`);
  if (details.length === 0) throw new Error(`${label} requires details.`);
  const sourceReferences = sourceReferencesFor(item.sourceReferences, `${label} sourceReferences`, sources);
  if (sourceReferences.length === 0) throw new Error(`${label} requires sourceReferences.`);
  return {
    id: kebab2(item.id, `${label} id`),
    title: text2(item.title, `${label} title`),
    kind: text2(item.kind, `${label} kind`),
    significance: text2(item.significance, `${label} significance`),
    details,
    guidingQuestionIds,
    prerequisiteItemIds: strings(item.prerequisiteItemIds, `${label} prerequisiteItemIds`),
    sourceReferences
  };
}
function parseCognitionBudget(value) {
  const budget = object(value, "curriculum cognitionBudget");
  const exceptions = array(budget.exceptions, "curriculum cognitionBudget exceptions").map((exception, index) => {
    const parsed = object(exception, `curriculum cognitionBudget exception ${index + 1}`);
    return { constraint: enumeration(parsed.constraint, cognitionBudgetConstraints, `curriculum cognitionBudget exception ${index + 1} constraint`), reason: text2(parsed.reason, `curriculum cognitionBudget exception ${index + 1} reason`) };
  });
  unique2(exceptions.map(({ constraint }) => constraint), "curriculum cognitionBudget exception constraints");
  return {
    outcomeLimit: positiveInteger(budget.outcomeLimit, "curriculum cognitionBudget outcomeLimit"),
    neighborhoodLimit: positiveInteger(budget.neighborhoodLimit, "curriculum cognitionBudget neighborhoodLimit"),
    exceptions
  };
}
function parseNeighborhood(value, neighborhoodIndex, analysis) {
  const label = `curriculum neighborhood ${neighborhoodIndex + 1}`;
  const neighborhood = object(value, label);
  const knownQuestionIds = new Set(analysis.guidingQuestions.map(({ id }) => id));
  const knownItemIds = new Set(analysis.coverageItems.map(({ id }) => id));
  const outcomes = array(neighborhood.outcomes, `${label} outcomes`).map((value2, outcomeIndex) => {
    const outcomeLabel = `${label} outcome ${outcomeIndex + 1}`;
    const outcome = object(value2, outcomeLabel);
    const guidingQuestionIds = strings(outcome.guidingQuestionIds, `${outcomeLabel} guidingQuestionIds`);
    if (guidingQuestionIds.length === 0) throw new Error(`${outcomeLabel} requires guidingQuestionIds.`);
    unique2(guidingQuestionIds, `${outcomeLabel} guidingQuestionIds`);
    for (const questionId of guidingQuestionIds) if (!knownQuestionIds.has(questionId)) throw new Error(`${outcomeLabel} references unknown guiding question ${questionId}.`);
    const coverage = array(outcome.coverage, `${outcomeLabel} coverage`).map((entry, coverageIndex) => {
      const coverageLabel = `${outcomeLabel} coverage ${coverageIndex + 1}`;
      const parsed = object(entry, coverageLabel);
      const itemId = kebab2(parsed.itemId, `${coverageLabel} itemId`);
      if (!knownItemIds.has(itemId)) throw new Error(`${coverageLabel} references unknown coverage item ${itemId}.`);
      return {
        itemId,
        role: enumeration(parsed.role, coverageRoles, `${coverageLabel} role`),
        visibility: enumeration(parsed.visibility, coverageVisibilities, `${coverageLabel} visibility`),
        rationale: text2(parsed.rationale, `${coverageLabel} rationale`)
      };
    });
    if (coverage.length === 0) throw new Error(`${outcomeLabel} requires coverage.`);
    return {
      id: kebab2(outcome.id, `${outcomeLabel} id`),
      title: text2(outcome.title, `${outcomeLabel} title`),
      objective: text2(outcome.objective, `${outcomeLabel} objective`),
      guidingQuestionIds,
      prerequisiteOutcomeIds: strings(outcome.prerequisiteOutcomeIds, `${outcomeLabel} prerequisiteOutcomeIds`),
      coverage
    };
  });
  if (outcomes.length === 0) throw new Error(`${label} requires outcomes.`);
  return {
    id: kebab2(neighborhood.id, `${label} id`),
    title: text2(neighborhood.title, `${label} title`),
    purpose: text2(neighborhood.purpose, `${label} purpose`),
    narrativeBridge: text2(neighborhood.narrativeBridge, `${label} narrativeBridge`),
    outcomes
  };
}
function validateCurriculum(neighborhoods, omissions, analysis) {
  const outcomes = neighborhoods.flatMap((neighborhood) => neighborhood.outcomes);
  unique2(outcomes.map(({ id }) => id), "curriculum outcome IDs");
  const encounteredOutcomeIds = /* @__PURE__ */ new Set();
  for (const outcome of outcomes) {
    for (const prerequisiteId of outcome.prerequisiteOutcomeIds) if (!encounteredOutcomeIds.has(prerequisiteId)) throw new Error(`Outcome ${outcome.id} prerequisite ${prerequisiteId} must appear earlier.`);
    encounteredOutcomeIds.add(outcome.id);
  }
  const accountedItemIds = [
    ...outcomes.flatMap((outcome) => outcome.coverage.map(({ itemId }) => itemId)),
    ...omissions.map(({ itemId }) => itemId)
  ];
  unique2(accountedItemIds, "accounted curriculum coverage item IDs");
  const expectedItemIds = analysis.coverageItems.map(({ id }) => id);
  if (accountedItemIds.length !== expectedItemIds.length || expectedItemIds.some((id) => !accountedItemIds.includes(id))) throw new Error("curriculum must map or omit every analysis coverage item exactly once.");
  for (const omission of omissions) if (!expectedItemIds.includes(omission.itemId)) throw new Error(`Curriculum omission references unknown coverage item ${omission.itemId}.`);
  const representedQuestions = new Set(outcomes.flatMap((outcome) => outcome.guidingQuestionIds));
  for (const question of analysis.guidingQuestions) if (!representedQuestions.has(question.id)) throw new Error(`Curriculum does not address guiding question ${question.id}.`);
}
function sourceReferencesFor(value, label, sources) {
  return array(value, label).map((reference, index) => {
    const sourceId2 = typeof reference === "string" ? text2(reference, `${label}[${index}]`) : text2(object(reference, `${label}[${index}]`).sourceId, `${label}[${index}].sourceId`);
    if (!sources.some(({ id }) => id === sourceId2)) throw new Error(`${label}[${index}] references unknown source ${sourceId2}.`);
    return { sourceId: sourceId2 };
  });
}
function parseGuidingQuestions(value, label) {
  const questions = array(value, label).map((question, index) => {
    const parsed = object(question, `${label}[${index}]`);
    return { id: kebab2(parsed.id, `${label}[${index}].id`), question: text2(parsed.question, `${label}[${index}].question`), whyItMatters: text2(parsed.whyItMatters, `${label}[${index}].whyItMatters`) };
  });
  unique2(questions.map(({ id }) => id), `${label} IDs`);
  return questions;
}
function parseAudience(value, label) {
  const audience = object(value, label);
  return { familiarity: text2(audience.familiarity, `${label} familiarity`), depth: text2(audience.depth, `${label} depth`) };
}
function parseSources2(value, label) {
  return array(value, label).map((source, index) => {
    const parsed = object(source, `${label}[${index}]`);
    return { id: kebab2(parsed.id, `${label}[${index}].id`), path: text2(parsed.path, `${label}[${index}].path`), description: nullableText2(parsed.description, `${label}[${index}].description`) };
  });
}
function readJson(repositoryPath, artifactPath) {
  assertArtifact(repositoryPath, artifactPath);
  try {
    return JSON.parse(readFileSync(resolve2(repositoryPath, artifactPath), "utf8"));
  } catch (error) {
    throw new Error(`${artifactPath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
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
  return array(value, label).map((item, index) => text2(item, `${label}[${index}]`));
}
function text2(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be non-empty text.`);
  return value;
}
function nullableText2(value, label) {
  if (value === null) return null;
  return text2(value, label);
}
function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive integer.`);
  return value;
}
function kebab2(value, label) {
  const result = text2(value, label);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(result)) throw new Error(`${label} must be kebab-case ASCII.`);
  return result;
}
function enumeration(value, allowed, label) {
  if (typeof value === "string" && allowed.includes(value)) return value;
  throw new Error(`${label} must be one of: ${allowed.join(", ")}.`);
}
function sameAudience(left, right) {
  return left.familiarity === right.familiarity && left.depth === right.depth;
}
function unique2(values, label) {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique.`);
}

// src/prompts.ts
var CURRICULUM_CONVENTIONS = `Curriculum conventions:
- Produce a planning handoff for a downstream technical architect or content architect, not audience-facing copy.
- Keep the learning path small while preserving a complete inventory of consequential concepts, artifacts, contracts, evidence, and decisions.
- Organize related coverage into contextual neighborhoods and outcomes. The source-file boundaries do not determine the curriculum.
- Role and visibility answer different questions. Primary coverage creates an outcome, supporting coverage helps explain it, and reference coverage is a concrete artifact or evidence to inspect. Required coverage must reach the audience in some form; optional coverage may remain available as additional detail.
- A consequential contract can be reference coverage and still be required. Database schemas, APIs, wire contracts, events, state machines, security policies, and similar decision evidence do not need separate outcomes, but they must not disappear.
- Aim to stay within 6 outcomes and 5 neighborhoods. These are cognition guides for the learning path, not quotas or limits on the coverage inventory.
- Choose the clearest storyline for the learning goal, audience, sources, and teaching brief. Explain the choice without applying a predetermined teaching template.`;
var UNATTENDED_FOOTER = `Work unattended and finish the requested file in this turn. Inspect the actual Markdown sources and audit the completed JSON against the requested shape before reporting completion.`;
function analysisPrompt(input) {
  return `Analyze the supplied Markdown sources for a curriculum handoff.

Repository: ${input.repositoryPath}
Learning goal: ${input.learningGoal}
Audience familiarity: ${input.audience.familiarity}
Audience depth: ${input.audience.depth}
Sources: ${JSON.stringify(input.sources, null, 2)}
Output: ${input.paths.analysisPath}

Derive the smallest useful set of questions whose answers would satisfy the learning goal. Then build a complete coverage inventory of the source-supported concepts, artifacts, evidence, and decisions a downstream architect may need.

Each coverage item should be distinct enough that its downstream representation obligation is unambiguous. Consolidate repeated explanation, but do not hide consequential artifacts inside a broad topic. For technical sources, identify consequential database schemas, APIs, wire contracts, events, state machines, configuration boundaries, security policies, operational flows, tradeoffs, and verification evidence by name when they affect understanding or approval. Use a concise descriptive kind appropriate to the subject rather than treating those examples as a universal checklist.

This turn identifies coverage. It does not choose neighborhoods, learning outcomes, roles, visibility, or omissions.

Write one JSON object using this shape:
{
  "schemaVersion": 3,
  "learningGoal": ${JSON.stringify(input.learningGoal)},
  "audience": ${JSON.stringify(input.audience)},
  "sources": ${JSON.stringify(input.sources)},
  "guidingQuestions": [{
    "id": "short-kebab-id",
    "question": "Question the audience must be able to answer",
    "whyItMatters": "How the answer contributes to the learning goal"
  }],
  "coverageItems": [{
    "id": "short-kebab-id",
    "title": "Concept or artifact name",
    "kind": "A concise subject-appropriate kind",
    "significance": "Why this item affects understanding or judgment",
    "details": ["Enough grounded detail for a downstream architect to know what must be represented"],
    "guidingQuestionIds": ["guiding-question-id"],
    "prerequisiteItemIds": [],
    "sourceReferences": ["source-id"]
  }]
}

IDs are unique kebab-case. Every coverage item contributes to at least one guiding question and cites at least one supplied source ID. Prerequisites reference items in this file. Every guiding question is represented by at least one coverage item. The repeated learningGoal, audience, and sources keep the artifact self-describing and protect against stale output. Write only ${input.paths.analysisPath}.

${UNATTENDED_FOOTER}`;
}
function curriculumPrompt(input, analysis) {
  return `Create the final curriculum handoff from the completed coverage analysis.

Learning goal: ${input.learningGoal}
Audience familiarity: ${input.audience.familiarity}
Audience depth: ${input.audience.depth}
Teaching brief: ${input.teachingBrief}
Analysis: ${input.paths.analysisPath}
Analysis scope: ${analysis.guidingQuestions.length} guiding questions and ${analysis.coverageItems.length} coverage items
Output: ${input.paths.curriculumPath}

${CURRICULUM_CONVENTIONS}

Choose the storyline, neighborhoods, outcomes, and disposition of every coverage item together. Give each mapped item one contextual home. The downstream architect can combine several required items into one representation; required does not mean a dedicated outcome or slide.

Use role to describe how an item contributes to its outcome:
- primary: creates the understanding or judgment expressed by the outcome
- supporting: helps explain or substantiate the primary understanding
- reference: a concrete artifact, contract, evidence set, or exact detail to inspect

Use visibility independently:
- required: the downstream artifact must make it available to the audience
- optional: it may remain additional detail without weakening the learning goal

Consequential contracts and decision evidence are normally required even when their role is reference. Omit an item only when it does not affect this audience's learning goal.

Write one JSON object using this shape:
{
  "schemaVersion": 3,
  "analysisPath": ${JSON.stringify(input.paths.analysisPath)},
  "learningGoal": ${JSON.stringify(input.learningGoal)},
  "audience": ${JSON.stringify(input.audience)},
  "teachingBrief": ${JSON.stringify(input.teachingBrief)},
  "guidingQuestions": ${JSON.stringify(analysis.guidingQuestions)},
  "storyline": {
    "title": "Curriculum title",
    "throughline": "The idea connecting the learning path",
    "rationale": "Why this storyline fits the inputs"
  },
  "cognitionBudget": {
    "outcomeLimit": 6,
    "neighborhoodLimit": 5,
    "exceptions": [{ "constraint": "outcome-limit", "reason": "Why an additional outcome protects understanding" }]
  },
  "neighborhoods": [{
    "id": "short-kebab-id",
    "title": "Contextual neighborhood",
    "purpose": "What this neighborhood establishes",
    "narrativeBridge": "How it follows and prepares what comes next",
    "outcomes": [{
      "id": "short-kebab-id",
      "title": "Outcome title",
      "objective": "The understanding or judgment this outcome creates",
      "guidingQuestionIds": ["question addressed by this outcome"],
      "prerequisiteOutcomeIds": [],
      "coverage": [{
        "itemId": "coverage-item-id",
        "role": "reference",
        "visibility": "required",
        "rationale": "Why this item belongs here and must remain inspectable"
      }]
    }]
  }],
  "omissions": [{ "itemId": "coverage-item-id", "reason": "Why it does not affect the learning goal" }]
}

Copy guidingQuestions unchanged from the analysis. Budget exceptions use outcome-limit or neighborhood-limit and are needed only when the corresponding guide is exceeded. Neighborhood and outcome IDs are unique kebab-case. Prerequisite outcomes appear earlier. Map every analysis coverage item exactly once through one outcome or one omission. Preserve the analysis details by reference rather than rewriting them into presentation copy. Write only ${input.paths.curriculumPath}.

${UNATTENDED_FOOTER}`;
}

// src/workflow.ts
var curriculumDesigner = {
  harness: "codex",
  model: "gpt-5.6-sol",
  effort: "medium"
};
async function step(ctx, state, incoming) {
  switch (state.stage.kind) {
    case "start_analysis": {
      mkdirSync(resolve3(state.input.repositoryPath, state.input.paths.outputDirectory), { recursive: true });
      await ctx.setUiFeedback({ phase: "Analyzing curriculum sources" });
      const designer = await ctx.spawnAgentSession({ ...curriculumDesigner, prompt: analysisPrompt(state.input) });
      return a(withStage(state, { kind: "await_analysis", designer }), o.agentTurn(designer));
    }
    case "await_analysis": {
      const error = turnError(incoming, "Curriculum analysis", state.stage.designer);
      if (error) return failed(ctx, "Curriculum analysis failed. Its pane remains open.", error);
      try {
        const analysis = readAnalysis(state.input.repositoryPath, state.input.learningGoal, state.input.audience, state.input.sources, state.input.paths);
        return i(withStage(state, { kind: "send_curriculum", designer: state.stage.designer, analysis }));
      } catch (error2) {
        return failed(ctx, "The curriculum analysis artifact is invalid. Its pane remains open.", errorText(error2));
      }
    }
    case "send_curriculum": {
      await ctx.setUiFeedback({ phase: "Designing the curriculum", message: "Organizing outcomes and coverage obligations." });
      const sent = await ctx.sendAgentPrompt({ agentSessionId: state.stage.designer.agentSessionId, prompt: curriculumPrompt(state.input, state.stage.analysis) });
      return a(withStage(state, { ...state.stage, kind: "await_curriculum" }), o.agentTurn(sent));
    }
    case "await_curriculum": {
      const error = turnError(incoming, "Curriculum design", state.stage.designer);
      if (error) return failed(ctx, "Curriculum design failed. Its pane remains open.", error);
      try {
        const curriculum = readCurriculum(state.input.repositoryPath, state.input.teachingBrief, state.input.paths, state.stage.analysis);
        await ctx.closePane(state.stage.designer.paneId);
        const outcomes = curriculum.neighborhoods.flatMap((neighborhood) => neighborhood.outcomes);
        const coverage = outcomes.flatMap((outcome) => outcome.coverage);
        return l({
          outcome: "curriculum-created",
          analysisPath: state.input.paths.analysisPath,
          curriculumPath: state.input.paths.curriculumPath,
          sourceCount: state.input.sources.length,
          coverageItemCount: state.stage.analysis.coverageItems.length,
          primaryCoverageCount: coverage.filter(({ role }) => role === "primary").length,
          supportingCoverageCount: coverage.filter(({ role }) => role === "supporting").length,
          referenceCoverageCount: coverage.filter(({ role }) => role === "reference").length,
          requiredCoverageCount: coverage.filter(({ visibility }) => visibility === "required").length,
          optionalCoverageCount: coverage.filter(({ visibility }) => visibility === "optional").length,
          omissionCount: curriculum.omissions.length,
          neighborhoodCount: curriculum.neighborhoods.length,
          outcomeCount: outcomes.length,
          budgetExceptionCount: curriculum.cognitionBudget.exceptions.length
        });
      } catch (error2) {
        return failed(ctx, "The curriculum artifact is invalid. Its pane remains open.", errorText(error2));
      }
    }
    default:
      return assertNever(state.stage);
  }
}
function turnError(incoming, label, designer) {
  if (s.isAgentTurnFailed(incoming)) return `${label} failed in pane ${designer.paneId}: ${incoming.reason}`;
  if (!s.isAgentTurnEnded(incoming)) return `${label} resumed with an unexpected event in pane ${designer.paneId}.`;
  return null;
}
async function failed(ctx, message, diagnostic) {
  await ctx.setUiFeedback({ kind: "error", phase: "Curriculum design failed", message });
  await ctx.log("error", diagnostic);
  return u(diagnostic);
}
function withStage(state, stage) {
  return { ...state, stage };
}
function errorText(value) {
  return value instanceof Error ? value.message : String(value);
}
function assertNever(value) {
  throw new Error(`Unsupported curriculum workflow stage: ${String(value)}`);
}

// src/index.ts
var index_default = r({
  command: () => ({
    title: "Design Curriculum",
    description: "Create a focused curriculum from one or more Markdown sources.",
    inputs: [
      { kind: "text", key: "sources", label: "Markdown source paths, one per line", placeholder: "docs/source-one.md\ndocs/source-two.md" },
      { kind: "text", key: "learningGoal", label: "What should the audience understand or be able to decide?" },
      { kind: "text", key: "audienceFamiliarity", label: "Describe what the audience already knows", default: "The audience is new to the subject and needs essential context." },
      { kind: "text", key: "audienceDepth", label: "Describe the depth of understanding needed", default: "The audience needs enough depth to understand and make the decision described by the learning goal." },
      { kind: "text", key: "teachingBrief", label: "Optional teaching guidance", default: "Choose the clearest storyline for this audience and learning goal." },
      { kind: "text", key: "outputDirectory", label: "Curriculum output directory", default: "scratch/story/curriculum" }
    ]
  }),
  validate: (launchCtx, variables) => {
    parseInputs(launchCtx.worktreePath, variables);
  },
  init: (launchCtx, variables) => ({
    stateVersion: 1,
    input: parseInputs(launchCtx.worktreePath, variables),
    stage: { kind: "start_analysis" }
  }),
  step: async (ctx, state, incoming) => {
    await ctx.log("debug", `Design curriculum stage=${state.stage.kind}.`);
    return step(ctx, state, incoming);
  }
});
export {
  index_default as default
};
