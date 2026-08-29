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
    inventoryPaths: {
      currentStatePath: `${walkthroughDirectory}/inventories/current-state.json`,
      architecturePath: `${walkthroughDirectory}/inventories/architecture.json`,
      programDesignPath: `${walkthroughDirectory}/inventories/program-design.json`
    },
    curriculumPath: `${walkthroughDirectory}/curriculum.json`,
    deckPlanPath: `${walkthroughDirectory}/deck-plan.json`,
    htmlPath: `${reviewDirectory}/walkthrough.html`,
    reviewsDirectory: `${walkthroughDirectory}/reviews`,
    defaultFeedbackPath: `${reviewDirectory}/feedback.md`
  };
}
function deckReviewPath(paths, round) {
  return `${paths.reviewsDirectory}/round-${String(round).padStart(2, "0")}.md`;
}

// src/types.ts
var artifactKinds = ["current-state", "architecture", "program-design"];
var familiarityLevels = ["new", "familiar"];
var technicalDepthLevels = [
  "product",
  "system-design",
  "implementation"
];
var deliveryModes = ["presentation-first", "guided-tutorial"];
var artifactDescriptors = [
  {
    kind: "current-state",
    label: "current state",
    pathKey: "currentStatePath",
    topicPrefix: "cs"
  },
  {
    kind: "architecture",
    label: "architecture",
    pathKey: "architecturePath",
    topicPrefix: "ar"
  },
  {
    kind: "program-design",
    label: "program design",
    pathKey: "programDesignPath",
    topicPrefix: "pd"
  }
];
function pathFor(paths, kind) {
  const descriptor = artifactDescriptors.find((candidate) => candidate.kind === kind);
  if (!descriptor) throw new Error(`Unsupported artifact kind: ${kind}`);
  return paths[descriptor.pathKey];
}
function descriptorFor(kind) {
  const descriptor = artifactDescriptors.find((candidate) => candidate.kind === kind);
  if (!descriptor) throw new Error(`Unsupported artifact kind: ${kind}`);
  return descriptor;
}

// src/workflow.ts
import { mkdirSync } from "node:fs";
import { resolve as resolve2 } from "node:path";

// src/constants.ts
var preparer = {
  harness: "codex",
  model: "gpt-5.6-sol",
  effort: "low"
};
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
var deckVerifier = {
  harness: "codex",
  model: "gpt-5.6-sol",
  effort: "medium"
};
var deckReviewRouting = {
  harness: "codex",
  model: "gpt-5.6-luna",
  effort: "medium"
};

// src/contracts.ts
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
function readTopicInventories(repositoryPath, sources, paths) {
  return Object.fromEntries(
    artifactDescriptors.map((descriptor) => [
      descriptor.kind,
      parseTopicInventory(
        readJsonFile(repositoryPath, pathFor(paths.inventoryPaths, descriptor.kind)),
        descriptor.kind,
        pathFor(sources, descriptor.kind)
      )
    ])
  );
}
function readCurriculum(repositoryPath, story, sources, audienceProfile, paths, inventories) {
  return parseCurriculum(
    readJsonFile(repositoryPath, paths.curriculumPath),
    story,
    sources,
    audienceProfile,
    inventories
  );
}
function readDeckPlan(repositoryPath, paths, curriculum) {
  return parseDeckPlan(readJsonFile(repositoryPath, paths.deckPlanPath), paths, curriculum);
}
function assertExpectedFile(repositoryPath, artifactPath, label) {
  const absolutePath = resolve(repositoryPath, artifactPath);
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    throw new Error(`Expected ${label} file ${artifactPath} was not created.`);
  }
}
function readArtifactText(repositoryPath, artifactPath) {
  return readTextFile(repositoryPath, artifactPath);
}
function parseTopicInventory(value, expectedKind, expectedSourcePath) {
  const label = `${expectedKind} inventory`;
  const record = exactRecord(value, ["schemaVersion", "artifact", "candidates"], label);
  if (record.schemaVersion !== 2) throw new Error(`${label} schemaVersion must be 2.`);
  const artifact = exactRecord(record.artifact, ["kind", "sourcePath"], `${label} artifact`);
  if (artifact.kind !== expectedKind || artifact.sourcePath !== expectedSourcePath) {
    throw new Error(`${label} artifact must identify ${expectedKind} at ${expectedSourcePath}.`);
  }
  const candidates = arrayValue(record.candidates, `${label} candidates`).map((value2, index) => {
    const candidateLabel = `${label} candidate ${index + 1}`;
    const candidate = exactRecord(
      value2,
      [
        "candidateId",
        "title",
        "learningObjective",
        "whyRequired",
        "prerequisiteCandidateIds",
        "terms",
        "keyPoints",
        "representationOpportunities",
        "sourceReferences"
      ],
      candidateLabel
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
      sourceReferences
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
    candidates
  };
}
function parseCurriculum(value, expectedStory, expectedSources, expectedProfile, inventories) {
  const record = exactRecord(
    value,
    ["schemaVersion", "story", "sources", "audienceProfile", "audienceContract", "chapters", "omissions"],
    "curriculum"
  );
  if (record.schemaVersion !== 2) throw new Error("curriculum schemaVersion must be 2.");
  const story = exactRecord(record.story, ["reference", "title", "throughline"], "curriculum story");
  if (story.reference !== expectedStory) throw new Error(`curriculum story reference must be ${expectedStory}.`);
  const sources = parseArtifactPaths(record.sources, "curriculum sources");
  if (!sameArtifactPaths(sources, expectedSources)) throw new Error("curriculum sources must match the workflow inputs.");
  const profile = exactRecord(record.audienceProfile, ["familiarity", "technicalDepth"], "curriculum audienceProfile");
  if (profile.familiarity !== expectedProfile.familiarity || profile.technicalDepth !== expectedProfile.technicalDepth) {
    throw new Error("curriculum audienceProfile must match the workflow inputs.");
  }
  const hasLanguagePolicy = isRecordWithKey(record.audienceContract, "languagePolicy");
  const contract = exactRecord(
    record.audienceContract,
    hasLanguagePolicy ? ["assumedKnowledge", "orientationPolicy", "technicalDetailPolicy", "evidencePolicy", "languagePolicy"] : ["assumedKnowledge", "orientationPolicy", "technicalDetailPolicy", "evidencePolicy"],
    "curriculum audienceContract"
  );
  const chapters = arrayValue(record.chapters, "curriculum chapters").map(
    (chapter, index) => parseCurriculumChapter(chapter, artifactKinds[index], index)
  );
  if (chapters.length !== artifactKinds.length) throw new Error("curriculum requires exactly three chapters.");
  const omissions = arrayValue(record.omissions, "curriculum omissions").map((value2, index) => {
    const omission = exactRecord(value2, ["candidate", "reason"], `curriculum omission ${index + 1}`);
    return {
      candidate: parseCandidateReference(omission.candidate, `curriculum omission ${index + 1} candidate`),
      reason: nonEmptyString(omission.reason, `curriculum omission ${index + 1} reason`)
    };
  });
  validateCurriculum(chapters, omissions, inventories);
  return {
    schemaVersion: 2,
    story: {
      reference: expectedStory,
      title: nonEmptyString(story.title, "curriculum story title"),
      throughline: nonEmptyString(story.throughline, "curriculum story throughline")
    },
    sources,
    audienceProfile: expectedProfile,
    audienceContract: {
      assumedKnowledge: stringArray(contract.assumedKnowledge, "curriculum assumedKnowledge"),
      orientationPolicy: nonEmptyString(contract.orientationPolicy, "curriculum orientationPolicy"),
      technicalDetailPolicy: nonEmptyString(contract.technicalDetailPolicy, "curriculum technicalDetailPolicy"),
      evidencePolicy: nonEmptyString(contract.evidencePolicy, "curriculum evidencePolicy"),
      ...hasLanguagePolicy ? { languagePolicy: nonEmptyString(contract.languagePolicy, "curriculum languagePolicy") } : {}
    },
    chapters,
    omissions
  };
}
function isRecordWithKey(value, key) {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, key);
}
function parseCurriculumChapter(value, expectedId, index) {
  const label = `curriculum chapter ${index + 1}`;
  const record = exactRecord(value, ["id", "title", "purpose", "openingContext", "synthesisObjective", "beats"], label);
  const id = artifactKind(record.id, `${label} id`);
  if (id !== expectedId) throw new Error(`${label} must be ${expectedId}.`);
  const beats = arrayValue(record.beats, `${label} beats`).map(
    (beat, beatIndex) => parseCurriculumBeat(beat, id, beatIndex)
  );
  if (beats.length === 0) throw new Error(`${label} requires at least one beat.`);
  return {
    id,
    title: nonEmptyString(record.title, `${label} title`),
    purpose: nonEmptyString(record.purpose, `${label} purpose`),
    openingContext: nonEmptyString(record.openingContext, `${label} openingContext`),
    synthesisObjective: nonEmptyString(record.synthesisObjective, `${label} synthesisObjective`),
    beats
  };
}
function parseCurriculumBeat(value, chapter, index) {
  const label = `${chapter} curriculum beat ${index + 1}`;
  const record = exactRecord(
    value,
    [
      "id",
      "title",
      "objective",
      "narrativeBridge",
      "candidateReferences",
      "prerequisiteBeatIds",
      "requiredContent",
      "supportingMaterial",
      "termsToIntroduce",
      "realizationPoint",
      "comprehensionObjective",
      "representationOpportunities",
      "sourceReferences"
    ],
    label
  );
  const id = nonEmptyString(record.id, `${label} id`);
  const prefix = descriptorFor(chapter).topicPrefix;
  if (id !== `${prefix}-${String(index + 1).padStart(2, "0")}`) throw new Error(`${label} id must be ${prefix}-NN in sequence.`);
  const candidateReferences = arrayValue(record.candidateReferences, `${label} candidateReferences`).map(
    (reference, referenceIndex) => parseCandidateReference(reference, `${label} candidate reference ${referenceIndex + 1}`)
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
    sourceReferences
  };
}
function validateCurriculum(chapters, omissions, inventories) {
  const beatIds = /* @__PURE__ */ new Set();
  const accounted = /* @__PURE__ */ new Set();
  const introducedTerms = /* @__PURE__ */ new Set();
  for (const chapter of chapters) {
    for (const beat of chapter.beats) {
      if (beatIds.has(beat.id)) throw new Error(`curriculum has duplicate beat ${beat.id}.`);
      for (const prerequisite of beat.prerequisiteBeatIds) {
        if (!beatIds.has(prerequisite)) throw new Error(`Beat ${beat.id} prerequisite ${prerequisite} must appear earlier.`);
      }
      for (const reference of beat.candidateReferences) accountCandidate(reference, inventories, accounted, `beat ${beat.id}`);
      for (const term of beat.termsToIntroduce) {
        const normalized = term.term.toLocaleLowerCase("en-US");
        if (introducedTerms.has(normalized)) throw new Error(`Term ${term.term} is introduced more than once.`);
        introducedTerms.add(normalized);
      }
      beatIds.add(beat.id);
    }
  }
  for (const omission of omissions) accountCandidate(omission.candidate, inventories, accounted, "omission");
  for (const kind of artifactKinds) {
    for (const candidate of inventories[kind].candidates) {
      const key = `${kind}:${candidate.candidateId}`;
      if (!accounted.has(key)) throw new Error(`Inventory candidate ${key} is not represented or omitted.`);
    }
  }
}
function accountCandidate(reference, inventories, accounted, label) {
  const key = `${reference.artifact}:${reference.candidateId}`;
  if (!inventories[reference.artifact].candidates.some((candidate) => candidate.candidateId === reference.candidateId)) {
    throw new Error(`${label} references unknown candidate ${key}.`);
  }
  if (accounted.has(key)) throw new Error(`Inventory candidate ${key} is accounted for twice.`);
  accounted.add(key);
}
function parseDeckPlan(value, paths, curriculum) {
  const record = exactRecord(value, ["schemaVersion", "curriculumPath", "outputPath", "story", "chapters"], "deck plan");
  if (record.schemaVersion !== 2) throw new Error("deck plan schemaVersion must be 2.");
  if (record.curriculumPath !== paths.curriculumPath || record.outputPath !== paths.htmlPath) throw new Error("deck plan paths must match the workflow paths.");
  const story = exactRecord(record.story, ["title", "openingPromise", "throughline", "endingResolution"], "deck plan story");
  const beatOrder = curriculum.chapters.flatMap((chapter) => chapter.beats.map((beat) => beat.id));
  const chapters = arrayValue(record.chapters, "deck plan chapters").map((value2, chapterIndex) => {
    const expectedChapter = curriculum.chapters[chapterIndex];
    const label = `deck plan chapter ${chapterIndex + 1}`;
    const chapter = exactRecord(value2, ["id", "title", "storyRole", "openingContext", "closingSynthesis", "transitionToNext", "narrativeUnits"], label);
    const id = artifactKind(chapter.id, `${label} id`);
    if (!expectedChapter || id !== expectedChapter.id) throw new Error(`${label} must be ${expectedChapter?.id ?? "absent"}.`);
    const chapterBeatOrder = expectedChapter.beats.map((beat) => beat.id);
    let lastBeatIndex = -1;
    const narrativeUnits = arrayValue(chapter.narrativeUnits, `${label} narrativeUnits`).map((value3, unitIndex) => {
      const unitLabel = `${label} narrative unit ${unitIndex + 1}`;
      const unit = exactRecord(
        value3,
        ["title", "storyPurpose", "beatIds", "narrativeBridge", "realizationPoints", "requiredContent", "supportingContent", "representationIntent", "progressiveDisclosure", "sourceReferences"],
        unitLabel
      );
      const beatIds = stringArray(unit.beatIds, `${unitLabel} beatIds`);
      if (beatIds.length === 0) throw new Error(`${unitLabel} requires at least one beatId.`);
      for (const beatId of beatIds) {
        const beatIndex = chapterBeatOrder.indexOf(beatId);
        if (beatIndex < 0) throw new Error(`${unitLabel} beat ${beatId} must belong to ${id}.`);
        if (beatIndex < lastBeatIndex) throw new Error(`${unitLabel} beats must follow curriculum order.`);
        lastBeatIndex = beatIndex;
      }
      const realizationPoints = stringArray(unit.realizationPoints, `${unitLabel} realizationPoints`);
      if (realizationPoints.length === 0) throw new Error(`${unitLabel} requires at least one realization point.`);
      const requiredContent = stringArray(unit.requiredContent, `${unitLabel} requiredContent`);
      if (requiredContent.length === 0) throw new Error(`${unitLabel} requires requiredContent.`);
      const sourceReferences = sourceReferenceArray(unit.sourceReferences, `${unitLabel} sourceReferences`);
      if (sourceReferences.length === 0) throw new Error(`${unitLabel} requires a source reference.`);
      return {
        title: nonEmptyString(unit.title, `${unitLabel} title`),
        storyPurpose: nonEmptyString(unit.storyPurpose, `${unitLabel} storyPurpose`),
        beatIds,
        narrativeBridge: nonEmptyString(unit.narrativeBridge, `${unitLabel} narrativeBridge`),
        realizationPoints,
        requiredContent,
        supportingContent: stringArray(unit.supportingContent, `${unitLabel} supportingContent`),
        representationIntent: nullableString(unit.representationIntent, `${unitLabel} representationIntent`),
        progressiveDisclosure: stringArray(unit.progressiveDisclosure, `${unitLabel} progressiveDisclosure`),
        sourceReferences
      };
    });
    if (narrativeUnits.length === 0) throw new Error(`${label} requires at least one narrative unit.`);
    return {
      id,
      title: nonEmptyString(chapter.title, `${label} title`),
      storyRole: nonEmptyString(chapter.storyRole, `${label} storyRole`),
      openingContext: nonEmptyString(chapter.openingContext, `${label} openingContext`),
      closingSynthesis: nonEmptyString(chapter.closingSynthesis, `${label} closingSynthesis`),
      transitionToNext: nonEmptyString(chapter.transitionToNext, `${label} transitionToNext`),
      narrativeUnits
    };
  });
  if (chapters.length !== curriculum.chapters.length) throw new Error("deck plan requires exactly the curriculum chapters.");
  const mappedBeats = new Set(chapters.flatMap((chapter) => chapter.narrativeUnits.flatMap((unit) => unit.beatIds)));
  if (mappedBeats.size !== beatOrder.length || beatOrder.some((beatId) => !mappedBeats.has(beatId))) {
    throw new Error("deck plan must map every curriculum beat.");
  }
  return {
    schemaVersion: 2,
    curriculumPath: paths.curriculumPath,
    outputPath: paths.htmlPath,
    story: {
      title: nonEmptyString(story.title, "deck plan story title"),
      openingPromise: nonEmptyString(story.openingPromise, "deck plan story openingPromise"),
      throughline: nonEmptyString(story.throughline, "deck plan story throughline"),
      endingResolution: nonEmptyString(story.endingResolution, "deck plan story endingResolution")
    },
    chapters
  };
}
function parseCandidateReference(value, label) {
  const record = exactRecord(value, ["artifact", "candidateId"], label);
  return {
    artifact: artifactKind(record.artifact, `${label} artifact`),
    candidateId: nonEmptyString(record.candidateId, `${label} candidateId`)
  };
}
function parseArtifactPaths(value, label) {
  const record = exactRecord(value, ["currentStatePath", "architecturePath", "programDesignPath"], label);
  return {
    currentStatePath: nonEmptyString(record.currentStatePath, `${label} currentStatePath`),
    architecturePath: nonEmptyString(record.architecturePath, `${label} architecturePath`),
    programDesignPath: nonEmptyString(record.programDesignPath, `${label} programDesignPath`)
  };
}
function sameArtifactPaths(left, right) {
  return left.currentStatePath === right.currentStatePath && left.architecturePath === right.architecturePath && left.programDesignPath === right.programDesignPath;
}
function sourceReferenceArray(value, label) {
  return arrayValue(value, label).map((item, index) => parseSourceReference(item, `${label}[${index}]`));
}
function termArray(value, label) {
  return arrayValue(value, label).map((item, index) => parseTerm(item, `${label}[${index}]`));
}
function kebabString(value, label) {
  const result = nonEmptyString(value, label);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result)) throw new Error(`${label} must be kebab-case ASCII.`);
  return result;
}
function parseSourceReference(value, label) {
  const record = exactRecord(value, ["heading", "locator"], label);
  return {
    heading: nonEmptyString(record.heading, `${label} heading`),
    locator: nonEmptyString(record.locator, `${label} locator`)
  };
}
function parseTerm(value, label) {
  const record = exactRecord(value, ["term", "meaning"], label);
  return {
    term: nonEmptyString(record.term, `${label} term`),
    meaning: nonEmptyString(record.meaning, `${label} meaning`)
  };
}
function readJsonFile(repositoryPath, artifactPath) {
  const text = readTextFile(repositoryPath, artifactPath);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${artifactPath} is not valid JSON: ${errorText(error)}`);
  }
}
function readTextFile(repositoryPath, artifactPath) {
  assertExpectedFile(repositoryPath, artifactPath, "walkthrough");
  return readFileSync(resolve(repositoryPath, artifactPath), "utf8");
}
function exactRecord(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const record = value;
  const actualKeys = Object.keys(record);
  if (actualKeys.length !== keys.length || keys.some((key) => !Object.prototype.hasOwnProperty.call(record, key))) {
    throw new Error(`${label} must contain exactly these keys: ${keys.join(", ")}.`);
  }
  return record;
}
function nonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be non-empty text.`);
  }
  return value;
}
function nullableString(value, label) {
  if (value === null) return null;
  return nonEmptyString(value, label);
}
function arrayValue(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}
function stringArray(value, label) {
  return arrayValue(value, label).map((item, index) => nonEmptyString(item, `${label}[${index}]`));
}
function artifactKind(value, label) {
  if (typeof value === "string" && artifactKinds.some((kind) => kind === value)) {
    return value;
  }
  throw new Error(`${label} must be one of: ${artifactKinds.join(", ")}.`);
}
function errorText(value) {
  return value instanceof Error ? value.message : String(value);
}

// src/judgments.ts
function deckReviewRoutingPrompt(review) {
  return `You are an unattended routing judgment for an Isagi walkthrough deck review.

Classify the complete review below into exactly one outgoing workflow edge. Judge the review's meaning rather than its formatting. Every outcome is valid on every round.

Review:
${review}

Return exactly one JSON object with exactly this field:
{"outcome":"complete"}

Apply this precedence:
1. Return "human-decision" when the review explicitly identifies a product, narrative, scope, or tradeoff decision that only the user can make. An explicit human decision takes precedence over every other outcome.
2. Return "architect-and-builder" when any required finding needs the curriculum or detailed deck brief changed, including the storyline, chapter or narrative-unit order, content responsibility, realization points, or narrative-unit boundaries. This also wins when architect and builder work are both required.
3. Return "builder" when required findings remain but the current curriculum and deck plan are sufficient, so the HTML presentation can be corrected directly.
4. Return "complete" when no required findings remain. Suggestions alone do not require another revision round.

Treat blockers and concerns as required findings. Use the finding evidence, responsibility, required outcome, prior-finding verification, human-decision section, and conclusion together; do not route from one word in isolation. Do not include confidence, commentary, Markdown, or extra JSON fields.`;
}
function completedSingleHeadlessResult(incoming) {
  const results = s.getHeadlessAgentResults(incoming);
  if (!results) throw new Error("Workflow resumed with a non-headless deck-review routing event.");
  if (results.length !== 1) throw new Error(`Expected exactly one deck-review routing result, received ${results.length}.`);
  const result = results[0];
  if (!result || result.status !== "completed") {
    const detail = result?.error ? `: ${result.error}` : "";
    throw new Error(`Deck-review routing judgment did not complete${detail}.`);
  }
  return result;
}
function parseDeckReviewRoute(output) {
  const value = JSON.parse(extractJsonObject(output));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Deck-review routing result must be a JSON object.");
  const record = value;
  const keys = Object.keys(record);
  if (keys.length !== 1 || keys[0] !== "outcome") throw new Error("Deck-review routing result must contain exactly one field: outcome.");
  if (record.outcome !== "complete" && record.outcome !== "builder" && record.outcome !== "architect-and-builder" && record.outcome !== "human-decision") {
    throw new Error("Deck-review routing outcome must be complete, builder, architect-and-builder, or human-decision.");
  }
  return record.outcome;
}
function latestAssistantTurnText(history) {
  let finalAssistantIndex = -1;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message?.role === "assistant" && completeMessageText(message)) {
      finalAssistantIndex = index;
      break;
    }
  }
  if (finalAssistantIndex < 0) return null;
  let precedingUserIndex = -1;
  for (let index = finalAssistantIndex - 1; index >= 0; index -= 1) {
    if (history[index]?.role === "user") {
      precedingUserIndex = index;
      break;
    }
  }
  const turn = history.slice(precedingUserIndex + 1, finalAssistantIndex + 1).filter((message) => message.role === "assistant").map(completeMessageText).filter((text) => text.length > 0).join("\n\n").trim();
  return turn.length > 0 ? turn : null;
}
function completeMessageText(message) {
  return message.parts.filter((part) => part.type === "text" && part.state !== "streaming").map((part) => part.text).join("\n").trim();
}
function extractJsonObject(output) {
  const first = output.indexOf("{");
  const last = output.lastIndexOf("}");
  if (first < 0 || last < first) throw new Error("Deck-review routing output did not contain a JSON object.");
  return output.slice(first, last + 1);
}

// src/prompts.ts
var PREPARATION_FOOTER = "Work unattended and finish the requested file in this turn. Do not run tasks or shell commands in the background, but you may run them in the foreground.";
function withPreparationFooter(body) {
  return `${body}

${PREPARATION_FOOTER}`;
}
var PLAIN_LANGUAGE_STANDARD = `Use plain language at every technical depth. Technical depth controls which facts and representations belong, not how difficult the sentences sound. Lead with concrete behavior, consequence, or user impact, then introduce a technical term when it adds precision. Define unfamiliar repository terms in the same context before relying on them. Write with clear verbs and complete sentences. Replace noun stacks, compressed slogans, arrow-chain shorthand, and invented labels with direct explanations. Keep exact identifiers in code, diagrams, or supporting labels when the audience needs them. Prefer clarity over brevity, and omit detail that does not change the reader's understanding. When the material needs more room, split it across slides or use progressive disclosure instead of compressing the prose.`;
function sourceInventoryPrompt(input, kind) {
  const sourcePath = pathFor(input.sources, kind);
  const outputPath = pathFor(input.paths.inventoryPaths, kind);
  return withPreparationFooter(`Analyze one canonical source for reusable walkthrough material.

Story: ${input.story}
Repository: ${input.repositoryPath}
Artifact: ${kind}
Source: ${sourcePath}
Output: ${outputPath}

Inventory the distinct mental models, factual points, prerequisite relationships, vocabulary, source evidence, and useful visual or code-shaped representations. This analysis is audience-neutral: capture what the source contains without choosing how much a particular reader should see.

Write exactly one JSON object:
{
  "schemaVersion": 2,
  "artifact": { "kind": "${kind}", "sourcePath": "${sourcePath}" },
  "candidates": [{
    "candidateId": "short-kebab-id",
    "title": "Concept title",
    "learningObjective": "What can be understood",
    "whyRequired": "Why it matters",
    "prerequisiteCandidateIds": [],
    "terms": [{ "term": "Term", "meaning": "Plain meaning" }],
    "keyPoints": ["Grounded fact or relationship"],
    "representationOpportunities": ["A useful diagram, code shape, or comparison"],
    "sourceReferences": [{ "heading": "Source heading", "locator": "Retrievable locator" }]
  }]
}

Candidate IDs are unique within this artifact and prerequisites reference candidates in this file. Write only ${outputPath}.`);
}
function curriculumPrompt(input) {
  const inventories = artifactDescriptors.map(({ kind }) => `${kind}: ${pathFor(input.paths.inventoryPaths, kind)}`).join("\n");
  return withPreparationFooter(`Create the delivery-neutral curriculum for a solution walkthrough.

Story: ${input.story}
Repository: ${input.repositoryPath}
Audience familiarity: ${input.audienceProfile.familiarity}
Technical depth: ${input.audienceProfile.technicalDepth}
Inventories:
${inventories}
Output: ${input.paths.curriculumPath}

Apply the audience profile here and only here. For familiarity=new, establish concepts from first principles; for familiarity=familiar, use compact refreshers and emphasize deltas and consequences. Product depth prioritizes user value, behavior, and tradeoffs; system-design depth prioritizes boundaries, data flow, responsibilities, and tradeoffs; implementation depth includes exact mechanics, symbols, failure modes, and verification evidence.

Language policy:
${PLAIN_LANGUAGE_STANDARD}

Select the smallest set of beats and required content that preserves the audience's needed mental models. Move useful evidence that does not change the central understanding into supportingMaterial, and omit inventory candidates whose detail is unnecessary for this audience with a specific reason.

Build a coherent narrative through current state, architecture, and program design. A beat is a meaningful teaching movement, not a predetermined slide or turn. Preserve every selected candidate exactly once or explain its omission. Introduce prerequisites before dependents and introduce each term once. realizationPoint is the insight that presentation content must highlight or guided questioning should help the reader reach; use null when no distinct realization is needed.

Write exactly one JSON object with this shape:
{
  "schemaVersion": 2,
  "story": { "reference": ${JSON.stringify(input.story)}, "title": "Title", "throughline": "Narrative throughline" },
  "sources": ${JSON.stringify(input.sources)},
  "audienceProfile": ${JSON.stringify(input.audienceProfile)},
  "audienceContract": {
    "assumedKnowledge": [],
    "orientationPolicy": "How context is established",
    "technicalDetailPolicy": "How detail is selected",
    "evidencePolicy": "What evidence is retained",
    "languagePolicy": "How every delivery mode keeps the selected material plain and precise"
  },
  "chapters": [{
    "id": "current-state",
    "title": "Chapter title",
    "purpose": "Why this chapter exists",
    "openingContext": "Standalone briefing",
    "synthesisObjective": "What the reader should connect after its beats",
    "beats": [{
      "id": "cs-01",
      "title": "Beat title",
      "objective": "Learner outcome",
      "narrativeBridge": "How this follows and leads onward",
      "candidateReferences": [{ "artifact": "current-state", "candidateId": "candidate-id" }],
      "prerequisiteBeatIds": [],
      "requiredContent": ["Audience-selected point"],
      "supportingMaterial": [],
      "termsToIntroduce": [{ "term": "Term", "meaning": "Meaning" }],
      "realizationPoint": "Optional key insight",
      "comprehensionObjective": "Optional Socratic objective",
      "representationOpportunities": [],
      "sourceReferences": [{ "heading": "Heading", "locator": "Locator" }]
    }]
  }],
  "omissions": [{ "candidate": { "artifact": "architecture", "candidateId": "candidate-id" }, "reason": "Audience-specific reason" }]
}

Create exactly three chapters in this order with IDs current-state, architecture, program-design. Use sequential cs-NN, ar-NN, and pd-NN beat IDs. Write only ${input.paths.curriculumPath}.`);
}
function deckArchitecturePrompt(input) {
  return withPreparationFooter(`Create the detailed narrative brief for one standalone slide presentation from the finalized curriculum.

Story: ${input.story}
Curriculum: ${input.paths.curriculumPath}
Output deck: ${input.paths.htmlPath}
Output plan: ${input.paths.deckPlanPath}

Own the storytelling before construction begins. Define the opening promise, the throughline, the ending resolution, each chapter's role and transitions, and the ordered narrative units that carry the audience from one understanding to the next. Preserve the curriculum's narrative and content obligations. A narrative unit is one focused construction turn and one coherent movement in the story, not a predetermined slide. The builder may realize it with one or several slides.

Writing standard:
${PLAIN_LANGUAGE_STANDARD}

Use the Show Me skill to choose representations that carry real explanatory work. ${representationGuidance(input.audienceProfile.technicalDepth)} Keep each representation focused on the narrative unit's realization points and place it beside the short explanation it supports. When prose is clearer than a visual, use prose.

Give every narrative unit enough detail that building it is the act of making the presentation rather than discovering the story. Its realizationPoints are the ordered insights the audience should reach together. Keep insights in one unit when they form one coherent chain; separate them when they require different narrative movements. Let the number of narrative units follow the story rather than a quota.

Write exactly one JSON object:
{
  "schemaVersion": 2,
  "curriculumPath": ${JSON.stringify(input.paths.curriculumPath)},
  "outputPath": ${JSON.stringify(input.paths.htmlPath)},
  "story": {
    "title": "Presentation title",
    "openingPromise": "What the audience is about to understand",
    "throughline": "The idea connecting the complete presentation",
    "endingResolution": "What the audience should understand when the story closes"
  },
  "chapters": [{
    "id": "current-state",
    "title": "Chapter title",
    "storyRole": "What this chapter contributes to the whole story",
    "openingContext": "Where the audience is when the chapter begins",
    "closingSynthesis": "What should be established when the chapter ends",
    "transitionToNext": "How this understanding leads into the next chapter or ending",
    "narrativeUnits": [{
      "title": "Working title for this narrative movement",
      "storyPurpose": "Why this movement exists in the story",
      "beatIds": ["cs-01"],
      "narrativeBridge": "How it follows the previous movement and prepares the next",
      "realizationPoints": ["The insight the audience should reach"],
      "requiredContent": ["Content that must be conveyed"],
      "supportingContent": ["Useful secondary detail"],
      "representationIntent": "Optional visual relationship",
      "progressiveDisclosure": [],
      "sourceReferences": [{ "heading": "Source heading", "locator": "Retrievable locator" }]
    }]
  }]
}

Create exactly three chapters in curriculum order. Every beat must map to at least one narrative unit in its chapter, and the units must follow curriculum order. Write only ${input.paths.deckPlanPath}.`);
}
function deckShellPrompt(input) {
  return withPreparationFooter(`Create the reusable shell for the planned standalone slide deck.

Curriculum: ${input.paths.curriculumPath}
Deck plan: ${input.paths.deckPlanPath}
Output: ${input.paths.htmlPath}

Create one self-contained HTML file with embedded CSS and JavaScript. Establish a polished, responsive, viewport-based slide experience with keyboard and visible previous/next navigation, progress, accessible semantics, and printable fallback. Include the literal markers data-walkthrough-deck, data-slide-viewport, and data-slide-navigation. Do not realize planned content slides yet; leave a clear insertion area for later turns. This is a presentation, not a vertically scrolling document.

Write only ${input.paths.htmlPath}.`);
}
function narrativeUnitPrompt(input, plan, chapter, unit, unitIndex) {
  return withPreparationFooter(`Realize one narrative unit in the existing standalone deck.

Curriculum: ${input.paths.curriculumPath}
Deck plan: ${input.paths.deckPlanPath}
Deck: ${input.paths.htmlPath}
Story: ${JSON.stringify(plan.story)}
Chapter: ${JSON.stringify({ id: chapter.id, title: chapter.title, storyRole: chapter.storyRole, openingContext: chapter.openingContext, closingSynthesis: chapter.closingSynthesis, transitionToNext: chapter.transitionToNext })}
Narrative unit ${unitIndex + 1} of ${chapter.narrativeUnits.length}:
${JSON.stringify(unit, null, 2)}

Continue the established presentation and realize only this narrative movement. Decide how many slides it needs and how they should be composed. Each added slide is a section carrying data-walkthrough-slide, a unique id, and data-walkthrough-chapter="${chapter.id}". Fulfill the unit's story purpose, realization points, required content, and narrative bridge. Supply enough briefing prose and source-grounded context for the deck to stand alone. Use focused diagrams, code shapes, comparisons, or sequences when the representation intent warrants them. Keep slides scannable and place genuine secondary detail behind accessible progressive disclosure. Preserve the shell and every previously built slide.

Writing standard:
${PLAIN_LANGUAGE_STANDARD}

Use the Show Me skill to realize focused representations that reduce explanation rather than decorate it. ${representationGuidance(input.audienceProfile.technicalDepth)} Make labels and relationships understandable without requiring the reader to decode internal shorthand.

Modify only ${input.paths.htmlPath}.`);
}
function finalAssemblyPrompt(input) {
  return withPreparationFooter(`Complete and polish the assembled standalone presentation.

Curriculum: ${input.paths.curriculumPath}
Deck plan: ${input.paths.deckPlanPath}
Deck: ${input.paths.htmlPath}

All narrative units are present. Integrate the opening promise, chapter transitions, ending resolution, navigation state, progress behavior, responsive layout, accessibility, and visual consistency so the file reads as one presentation. Preserve the completed narrative order and content while using your judgment to add structural slides where they improve the story. Run a deck-wide editorial pass using this writing standard:

${PLAIN_LANGUAGE_STANDARD}

Remove repeated explanations, keep terminology consistent, and make transitions re-establish enough context for a reader moving at their own pace. Confirm every curriculum obligation is represented, the prose makes sense in isolation, controls work, and the default experience does not become a scrolling page.

Modify only ${input.paths.htmlPath}.`);
}
function verifierPrompt(input, round, previous) {
  const output = deckReviewPath(input.paths, round);
  const previousContext = previous ? `
Previous review:
<previous_review>
${previous.review}
</previous_review>

Architect response:
<architect_response>
${previous.architectResponse ?? "No architect turn was required."}
</architect_response>

Builder response:
<builder_response>
${previous.builderResponse}
</builder_response>
` : "";
  return withPreparationFooter(`Verify the built walkthrough deck against its authoritative inputs.

Round: ${round}
Curriculum: ${input.paths.curriculumPath}
Deck plan: ${input.paths.deckPlanPath}
Deck: ${input.paths.htmlPath}
Output: ${output}
${previousContext}

Review the curriculum, detailed deck brief, and HTML as source artifacts. Prioritize standalone comprehension, curriculum coverage, narrative continuity, factual grounding, preservation of the planned narrative units, navigation semantics, progressive disclosure, accessibility, and obvious content-density or legibility problems. Browser inspection is not required.

Review the visible copy as an editor using this standard:
${PLAIN_LANGUAGE_STANDARD}

Technical depth never excuses difficult wording. Verify that titles communicate concrete claims, unfamiliar terms are defined before use, sentences remain direct, representations reduce prose, and required detail is distributed without turning slides into compressed documents. Treat readability metrics only as diagnostic signals; base findings on specific copy and the intended audience. A deck can be factually complete and still require revision for unclear language.

This is read-only review: do not edit the curriculum, plan, or deck.

Write a complete standalone Markdown review for this round with these sections:

# Deck Review \u2014 Round ${round}

## Review scope
State what you inspected, the viewport and interaction checks you performed, and anything you could not verify.

## Prior finding verification
For round one, state that this is the initial review. On later rounds, account for every prior blocker and concern with a status of Verified, Incomplete, Not addressed, or Withdrawn, followed by current evidence and any remaining required outcome. Verify the files and browser behavior yourself rather than trusting agent summaries.

## Findings
Report every current finding under a heading in the form "### F-NN \u2014 [Severity] Short title", where severity is Blocker, Concern, or Suggestion. Keep a finding's stable ID across rounds while it remains relevant. For each finding, include responsibility, affected area, evidence, consequence, required outcome, and how the next review can verify it. Responsibility names one or more of: Deck architecture when the curriculum or detailed brief must change, including the storyline, narrative-unit purpose, ordering, content responsibility, or realization points; Deck implementation when the current brief can be realized with clearer slides, copy, or representations; or Human decision when only the user can choose the product, narrative, scope, or tradeoff direction. Use "No findings" when there are none. Suggestions are optional and never require another revision round.

## Human decision
Write "No human decision required" unless a genuine user decision is necessary. When one is necessary, state the decision, why agents cannot decide it safely, the available options, and their material tradeoffs.

## Conclusion
State plainly whether required work remains and whether it belongs to deck architecture, deck implementation, both, or the user. A review with no blockers or concerns is complete even when it contains suggestions.

The Markdown must carry the full review evidence; do not emit a JSON verdict or machine-routing fields. Write only ${output}.`);
}
function architectRevisionPrompt(input, round, review) {
  return withPreparationFooter(`Resolve the deck-architecture findings from review round ${round}.

Curriculum: ${input.paths.curriculumPath}
Deck plan: ${input.paths.deckPlanPath}
Review: ${deckReviewPath(input.paths, round)}

<deck_review>
${review}
</deck_review>

Update the detailed deck brief where the review requires architectural changes while preserving the curriculum contract, chapter order, narrative-unit coherence, and beat coverage. Evaluate every finding on its evidence. In your response, summarize what changed, explain any finding you declined with evidence, and clearly identify any genuine decision that only the user can make.

Keep every revised title, purpose, and content responsibility aligned with this writing standard:
${PLAIN_LANGUAGE_STANDARD}

Modify only ${input.paths.deckPlanPath}.`);
}
function builderRevisionPrompt(input, round, review, architectResponse) {
  const architectureContext = architectResponse ? `
Architect response:
<architect_response>
${architectResponse}
</architect_response>
` : "";
  return withPreparationFooter(`Bring the deck into conformance after review round ${round}.

Curriculum: ${input.paths.curriculumPath}
Current deck plan: ${input.paths.deckPlanPath}
Review: ${deckReviewPath(input.paths, round)}
Deck: ${input.paths.htmlPath}
${architectureContext}
<deck_review>
${review}
</deck_review>

Apply the deck-implementation findings and realize the current plan, including any architect changes. Evaluate every finding on its evidence and preserve correct content while making the complete presentation conform. In your response, summarize what changed, explain any finding you declined with evidence, and clearly identify any genuine decision that only the user can make.

Apply this writing standard to revised copy and any nearby copy affected by the change:
${PLAIN_LANGUAGE_STANDARD}

Modify only ${input.paths.htmlPath}.`);
}
function guidedBeatPrompt(input, curriculum, chapter, beat) {
  return `Guide one curriculum beat of the solution walkthrough.

Story: ${curriculum.story.title} \u2014 ${curriculum.story.throughline}
Audience contract: ${JSON.stringify(curriculum.audienceContract)}
Chapter: ${chapter.title}
Chapter context: ${chapter.openingContext}
Beat: ${beat.title}
Objective: ${beat.objective}
Narrative bridge: ${beat.narrativeBridge}
Required content: ${beat.requiredContent.join("; ")}
Supporting material: ${beat.supportingMaterial.join("; ") || "None required"}
Terms: ${beat.termsToIntroduce.map(({ term, meaning }) => `${term}: ${meaning}`).join("; ") || "None"}
Realization point: ${beat.realizationPoint ?? "No separate realization point"}
Source references: ${beat.sourceReferences.map(({ heading, locator }) => `${heading}: ${locator}`).join("; ")}

Teach this beat as an adaptive, Socratic tutorial. Establish enough context for this turn to stand alone, explain directly where useful, and use focused questions to help the user form the intended model. Follow the curriculum's language policy, or the plain-language standard below when an older curriculum has no languagePolicy.

${PLAIN_LANGUAGE_STANDARD}

Keep replies brief and use the Show Me skill when a visual representation materially helps. The user controls dialogue inside the agent pane; the workflow Continue control advances to the next curriculum checkpoint. Treat sources as read-only.`;
}
function guidedChapterReviewPrompt(curriculum, chapter) {
  const checks = chapter.beats.map((beat) => `- ${beat.title}: ${beat.comprehensionObjective ?? beat.objective}`).join("\n");
  return `Run the Socratic synthesis for the completed ${chapter.title} chapter.

Story throughline: ${curriculum.story.throughline}
Synthesis objective: ${chapter.synthesisObjective}
Completed beats:
${checks}

Ask the user to connect, predict, or apply the important ideas. Let their answers determine brief clarification or reteaching. Stay with this chapter until the workflow Continue control is pressed. Keep replies concise and use the Show Me skill when a focused visual helps.`;
}
function presentationGuidePrompt(input, curriculum) {
  return `Support the user's self-paced review of a completed walkthrough presentation.

Story: ${curriculum.story.title} \u2014 ${curriculum.story.throughline}
Audience: ${JSON.stringify(curriculum.audienceProfile)}
Curriculum: ${input.paths.curriculumPath}
Deck plan: ${input.paths.deckPlanPath}
Presentation: ${input.paths.htmlPath}
Canonical sources: ${JSON.stringify(input.sources)}

The presentation is the primary standalone experience and the user controls its pace. Answer questions briefly and precisely from the curriculum and canonical sources. Follow the curriculum's language policy, or the plain-language standard below when an older curriculum has no languagePolicy.

${PLAIN_LANGUAGE_STANDARD}

Use the Show Me skill when a focused visual or code-shape explanation helps. If the user says \u201Cwalk me through it\u201D without naming a slide or starting point, begin at the first curriculum beat and guide all selected material conversationally in this pane; do not rely on the workflow Continue control to advance that chat-driven walkthrough. If they name a slide or ask to start from a point, honor that starting point. The workflow Continue control means they are finished reviewing and want to end this workflow.`;
}
function representationGuidance(depth) {
  switch (depth) {
    case "product":
      return "Use a user journey, before-and-after comparison, or tradeoff view when it explains the product consequence more clearly than prose.";
    case "system-design":
      return "Prefer boundary maps, ownership views, data or control flow, sequences, and state transitions that make system relationships visible.";
    case "implementation":
      return "Prefer code-shape sketches, call trees, state transitions, diffs, algorithms, and failure paths that keep exact mechanics connected to their purpose.";
  }
}

// src/workflow.ts
var MAX_REVIEW_ROUNDS = 5;
var SHOW_ME_MODIFIER = [{ kind: "skill", name: "show-me" }];
async function step(ctx, state, incoming) {
  const input = promptInput(state);
  switch (state.stage.kind) {
    case "start_source_analysis": {
      ensureDirectories(state);
      await ctx.setUiFeedback({ phase: "Analyzing walkthrough sources" });
      const agents = [];
      for (const { kind } of artifactDescriptors) {
        agents.push(visible(await ctx.spawnAgentSession({ ...preparer, prompt: sourceInventoryPrompt(input, kind) })));
      }
      await ctx.log("info", `Started three visible source analysts in panes ${agents.map(({ paneId }) => paneId).join(", ")}.`);
      return a(withStage(state, { kind: "await_source_analysis", agents, agentIndex: 0 }), o.agentTurn(at(agents, 0)));
    }
    case "await_source_analysis": {
      const error = turnError(incoming, "Source analysis", at(state.stage.agents, state.stage.agentIndex));
      if (error) return failed(ctx, "Source analysis failed. Analyst panes remain open.", error);
      const next = state.stage.agentIndex + 1;
      if (next < state.stage.agents.length) return a(withStage(state, { ...state.stage, agentIndex: next }), o.agentTurn(at(state.stage.agents, next)));
      try {
        readTopicInventories(state.repositoryPath, state.sources, state.paths);
        await closeAll(ctx, state.stage.agents, "source analysts");
        return i(withStage(state, { kind: "start_curriculum_integration" }));
      } catch (error2) {
        return failed(ctx, "Source inventories are invalid. Analyst panes remain open.", errorText2(error2));
      }
    }
    case "start_curriculum_integration": {
      await ctx.setUiFeedback({ phase: "Shaping the audience curriculum" });
      const agent = visible(await ctx.spawnAgentSession({ ...preparer, prompt: curriculumPrompt(input) }));
      return a(withStage(state, { kind: "await_curriculum_integration", agent }), o.agentTurn(agent));
    }
    case "await_curriculum_integration": {
      const error = turnError(incoming, "Curriculum integration", state.stage.agent);
      if (error) return failed(ctx, "Curriculum integration failed. Its pane remains open.", error);
      try {
        const inventories = readTopicInventories(state.repositoryPath, state.sources, state.paths);
        const curriculum = readCurriculum(state.repositoryPath, state.story, state.sources, state.audienceProfile, state.paths, inventories);
        await closeAll(ctx, [state.stage.agent], "curriculum integrator");
        return i(withStage(state, state.deliveryMode === "guided-tutorial" ? { kind: "start_guided_tutorial", curriculum } : { kind: "start_deck_architecture", curriculum }));
      } catch (error2) {
        return failed(ctx, "The audience curriculum is invalid. Its pane remains open.", errorText2(error2));
      }
    }
    case "start_guided_tutorial": {
      const chapterIndex = 0;
      const beatIndex = 0;
      const chapter = chapterAt(state.stage.curriculum, chapterIndex);
      const beat = beatAt(chapter, beatIndex);
      await ctx.setUiFeedback({ phase: `Guided tutorial: ${chapter.title}`, message: beat.title });
      const spawned = await ctx.spawnAgentSession({ ...guide, prompt: guidedBeatPrompt(input, state.stage.curriculum, chapter, beat) });
      const guideSession = visible(spawned);
      return a(withStage(state, { kind: "await_guided_beat", curriculum: state.stage.curriculum, chapterIndex, beatIndex, guide: guideSession }), o.agentTurn(spawned));
    }
    case "send_guided_beat": {
      const chapter = chapterAt(state.stage.curriculum, state.stage.chapterIndex);
      const beat = beatAt(chapter, state.stage.beatIndex);
      await ctx.setUiFeedback({ phase: `Guided tutorial: ${chapter.title}`, message: beat.title });
      const sent = await ctx.sendAgentPrompt({ agentSessionId: state.stage.guide.agentSessionId, prompt: guidedBeatPrompt(input, state.stage.curriculum, chapter, beat) });
      return a(withStage(state, { ...state.stage, kind: "await_guided_beat" }), o.agentTurn(sent));
    }
    case "await_guided_beat": {
      const error = guideError(incoming, "Guided tutorial");
      if (error) return failed(ctx, "The tutorial guide failed.", error);
      const chapter = chapterAt(state.stage.curriculum, state.stage.chapterIndex);
      const beat = beatAt(chapter, state.stage.beatIndex);
      await ctx.setUiFeedback({ phase: `Guided tutorial: ${chapter.title}`, message: `${beat.title}. Press Continue when this checkpoint is complete.` });
      return a(withStage(state, { ...state.stage, kind: "await_guided_continue" }), o.userContinue());
    }
    case "await_guided_continue": {
      if (!s.isUserContinue(incoming)) return failed(ctx, "The tutorial could not advance.", "Expected user Continue.");
      const chapter = chapterAt(state.stage.curriculum, state.stage.chapterIndex);
      if (state.stage.beatIndex + 1 < chapter.beats.length) return i(withStage(state, { ...state.stage, kind: "send_guided_beat", beatIndex: state.stage.beatIndex + 1 }));
      return i(withStage(state, { kind: "send_chapter_review", curriculum: state.stage.curriculum, chapterIndex: state.stage.chapterIndex, guide: state.stage.guide }));
    }
    case "send_chapter_review": {
      const chapter = chapterAt(state.stage.curriculum, state.stage.chapterIndex);
      const sent = await ctx.sendAgentPrompt({ agentSessionId: state.stage.guide.agentSessionId, prompt: guidedChapterReviewPrompt(state.stage.curriculum, chapter) });
      return a(withStage(state, { ...state.stage, kind: "await_chapter_review" }), o.agentTurn(sent));
    }
    case "await_chapter_review": {
      const error = guideError(incoming, "Chapter review");
      if (error) return failed(ctx, "The tutorial guide failed.", error);
      const chapter = chapterAt(state.stage.curriculum, state.stage.chapterIndex);
      await ctx.setUiFeedback({ phase: `Reviewing ${chapter.title}`, message: "Press Continue when you understand this chapter." });
      return a(withStage(state, { ...state.stage, kind: "await_chapter_continue" }), o.userContinue());
    }
    case "await_chapter_continue": {
      if (!s.isUserContinue(incoming)) return failed(ctx, "The tutorial could not advance.", "Expected user Continue.");
      if (state.stage.chapterIndex + 1 < state.stage.curriculum.chapters.length) return i(withStage(state, { kind: "send_guided_beat", curriculum: state.stage.curriculum, chapterIndex: state.stage.chapterIndex + 1, beatIndex: 0, guide: state.stage.guide }));
      await ctx.closePane(state.stage.guide.paneId);
      return l({ outcome: "guided-tutorial-completed", curriculumPath: state.paths.curriculumPath, chapterCount: state.stage.curriculum.chapters.length, beatCount: beatCount(state.stage.curriculum) });
    }
    case "start_deck_architecture": {
      await ctx.setUiFeedback({ phase: "Architecting the walkthrough deck" });
      const architect = visible(await ctx.spawnAgentSession({ ...deckArchitect, modifiers: SHOW_ME_MODIFIER, prompt: deckArchitecturePrompt(input) }));
      return a(withStage(state, { kind: "await_deck_architecture", curriculum: state.stage.curriculum, architect }), o.agentTurn(architect));
    }
    case "await_deck_architecture": {
      const error = turnError(incoming, "Deck architecture", state.stage.architect);
      if (error) return failed(ctx, "Deck architecture failed. Its pane remains open.", error);
      try {
        const plan = readDeckPlan(state.repositoryPath, state.paths, state.stage.curriculum);
        return i(withStage(state, { kind: "start_deck_shell", curriculum: state.stage.curriculum, plan, architect: state.stage.architect }));
      } catch (error2) {
        return failed(ctx, "The deck plan is invalid. Its pane remains open.", errorText2(error2));
      }
    }
    case "start_deck_shell": {
      await ctx.setUiFeedback({ phase: "Building the deck shell" });
      const builder = visible(await ctx.spawnAgentSession({ ...deckBuilder, prompt: deckShellPrompt(input) }));
      return a(withStage(state, { kind: "await_deck_shell", curriculum: state.stage.curriculum, plan: state.stage.plan, architect: state.stage.architect, builder }), o.agentTurn(builder));
    }
    case "await_deck_shell": {
      const error = turnError(incoming, "Deck shell", state.stage.builder);
      if (error) return failed(ctx, "Deck shell creation failed. Build panes remain open.", error);
      try {
        assertExpectedFile(state.repositoryPath, state.paths.htmlPath, "walkthrough deck");
        await ctx.closePane(state.stage.builder.paneId);
        return i(withStage(state, { kind: "start_chapter_build", curriculum: state.stage.curriculum, plan: state.stage.plan, architect: state.stage.architect, chapterIndex: 0 }));
      } catch (error2) {
        return failed(ctx, "The deck shell is missing. Build panes remain open.", errorText2(error2));
      }
    }
    case "start_chapter_build": {
      const chapter = deckChapterAt(state.stage.plan, state.stage.chapterIndex);
      const unitIndex = 0;
      const unit = narrativeUnitAt(chapter, unitIndex);
      await ctx.setUiFeedback({ phase: `Building ${chapter.title}`, message: `Narrative unit 1 of ${chapter.narrativeUnits.length}: ${unit.title}.` });
      const builder = visible(await ctx.spawnAgentSession({ ...deckBuilder, modifiers: SHOW_ME_MODIFIER, prompt: narrativeUnitPrompt(input, state.stage.plan, chapter, unit, unitIndex) }));
      return a(withStage(state, { ...state.stage, kind: "await_narrative_unit", builder, unitIndex }), o.agentTurn(builder));
    }
    case "send_narrative_unit": {
      const chapter = deckChapterAt(state.stage.plan, state.stage.chapterIndex);
      const unit = narrativeUnitAt(chapter, state.stage.unitIndex);
      await ctx.setUiFeedback({ phase: `Building ${chapter.title}`, message: `Narrative unit ${state.stage.unitIndex + 1} of ${chapter.narrativeUnits.length}: ${unit.title}.` });
      const sent = await ctx.sendAgentPrompt({ agentSessionId: state.stage.builder.agentSessionId, modifiers: SHOW_ME_MODIFIER, prompt: narrativeUnitPrompt(input, state.stage.plan, chapter, unit, state.stage.unitIndex) });
      return a(withStage(state, { ...state.stage, kind: "await_narrative_unit" }), o.agentTurn(sent));
    }
    case "await_narrative_unit": {
      const error = turnError(incoming, "Narrative-unit construction", state.stage.builder);
      if (error) return failed(ctx, "Narrative-unit construction failed. Build panes remain open.", error);
      try {
        assertExpectedFile(state.repositoryPath, state.paths.htmlPath, "walkthrough deck");
        const chapter = deckChapterAt(state.stage.plan, state.stage.chapterIndex);
        if (state.stage.unitIndex + 1 < chapter.narrativeUnits.length) {
          return i(withStage(state, { ...state.stage, kind: "send_narrative_unit", unitIndex: state.stage.unitIndex + 1 }));
        }
        await ctx.closePane(state.stage.builder.paneId);
        if (state.stage.chapterIndex + 1 < state.stage.plan.chapters.length) {
          return i(withStage(state, { kind: "start_chapter_build", curriculum: state.stage.curriculum, plan: state.stage.plan, architect: state.stage.architect, chapterIndex: state.stage.chapterIndex + 1 }));
        }
        return i(withStage(state, { kind: "start_final_assembly", curriculum: state.stage.curriculum, plan: state.stage.plan, architect: state.stage.architect }));
      } catch (error2) {
        return failed(ctx, "The walkthrough deck is missing after narrative-unit construction. Build panes remain open.", errorText2(error2));
      }
    }
    case "start_final_assembly": {
      await ctx.setUiFeedback({ phase: "Assembling the unified walkthrough deck" });
      const builder = visible(await ctx.spawnAgentSession({ ...deckBuilder, prompt: finalAssemblyPrompt(input) }));
      return a(withStage(state, { ...state.stage, kind: "await_final_assembly", builder }), o.agentTurn(builder));
    }
    case "await_final_assembly": {
      const error = turnError(incoming, "Final deck assembly", state.stage.builder);
      if (error) return failed(ctx, "Final deck assembly failed. Build panes remain open.", error);
      try {
        assertExpectedFile(state.repositoryPath, state.paths.htmlPath, "walkthrough deck");
        return i(withStage(state, { kind: "start_verification", curriculum: state.stage.curriculum, plan: state.stage.plan, architect: state.stage.architect, builder: state.stage.builder, round: 1 }));
      } catch (error2) {
        return failed(ctx, "The assembled deck is missing. Build panes remain open.", errorText2(error2));
      }
    }
    case "start_verification": {
      await ctx.setUiFeedback({ phase: "Verifying the walkthrough deck", message: `Review round ${state.stage.round}.` });
      const verifier = visible(await ctx.spawnAgentSession({ ...deckVerifier, prompt: verifierPrompt(input, state.stage.round) }));
      return a(withStage(state, { ...state.stage, kind: "await_verification", verifier }), o.agentTurn(verifier));
    }
    case "send_reverification": {
      await ctx.setUiFeedback({ phase: "Re-verifying the walkthrough deck", message: `Review round ${state.stage.round}.` });
      const previous = state.stage.previousReview && state.stage.builderResponse ? { review: state.stage.previousReview, architectResponse: state.stage.architectResponse, builderResponse: state.stage.builderResponse } : void 0;
      const sent = await ctx.sendAgentPrompt({ agentSessionId: state.stage.verifier.agentSessionId, prompt: verifierPrompt(input, state.stage.round, previous) });
      return a(withStage(state, { ...state.stage, kind: "await_verification" }), o.agentTurn(sent));
    }
    case "await_verification": {
      const error = turnError(incoming, "Deck verification", state.stage.verifier);
      if (error) return failed(ctx, "Deck verification failed. Presentation panes remain open.", error);
      try {
        const review = readDeckReview(state.repositoryPath, state.paths, state.stage.round);
        return startDeckReviewRouting(ctx, state, { ...state.stage, kind: "await_review_routing", review });
      } catch (error2) {
        return failed(ctx, "The deck review file is missing. Presentation panes remain open.", errorText2(error2));
      }
    }
    case "await_review_routing": {
      let route;
      try {
        const result = completedSingleHeadlessResult(incoming);
        route = parseDeckReviewRoute(result.output ?? "");
        await ctx.log("info", `Deck review round ${state.stage.round} routing outcome=${route}.`);
      } catch (error) {
        return failed(ctx, "The deck review could not be routed. Presentation panes remain open.", errorText2(error));
      }
      switch (route) {
        case "complete":
          await closeAll(ctx, [state.stage.architect, state.stage.builder, state.stage.verifier], "deck architect, builder, and verifier");
          return i(withStage(state, { kind: "start_presentation_review", curriculum: state.stage.curriculum, plan: state.stage.plan }));
        case "human-decision":
          await ctx.setUiFeedback({ kind: "warning", phase: "Waiting for your decision", message: `Review ${deckReviewPath(state.paths, state.stage.round)}, resolve the decision with the verifier, then press Continue.` });
          return a(withStage(state, { ...state.stage, kind: "await_human_decision" }), o.userContinue());
        case "builder":
        case "architect-and-builder": {
          const common = { curriculum: state.stage.curriculum, plan: state.stage.plan, review: state.stage.review, architect: state.stage.architect, builder: state.stage.builder, verifier: state.stage.verifier, round: state.stage.round };
          return i(withStage(state, route === "architect-and-builder" ? { kind: "send_architect_revision", ...common } : { kind: "send_builder_revision", ...common }));
        }
        default:
          return assertNever(route);
      }
    }
    case "await_human_decision": {
      if (!s.isUserContinue(incoming)) return failed(ctx, "The deck review decision could not be resumed.", "Expected user Continue after a deck review decision.");
      try {
        const resolution = await latestCompleteTurn(ctx, state.stage.verifier, "verifier");
        const review = `${state.stage.review}

## Human decision follow-up

${resolution}`;
        return startDeckReviewRouting(ctx, state, { ...state.stage, kind: "await_review_routing", review });
      } catch (error) {
        return failed(ctx, "No completed decision response was found. Presentation panes remain open.", errorText2(error));
      }
    }
    case "send_architect_revision": {
      const sent = await ctx.sendAgentPrompt({ agentSessionId: state.stage.architect.agentSessionId, modifiers: SHOW_ME_MODIFIER, prompt: architectRevisionPrompt(input, state.stage.round, state.stage.review) });
      return a(withStage(state, { ...state.stage, kind: "await_architect_revision" }), o.agentTurn(sent));
    }
    case "await_architect_revision": {
      const error = turnError(incoming, "Architect revision", state.stage.architect);
      if (error) return failed(ctx, "Deck architecture revision failed. Presentation panes remain open.", error);
      try {
        const response = await latestCompleteTurn(ctx, state.stage.architect, "architect");
        const plan = readDeckPlan(state.repositoryPath, state.paths, state.stage.curriculum);
        return i(withStage(state, { ...state.stage, kind: "send_builder_revision", plan, architectResponse: response }));
      } catch (error2) {
        return failed(ctx, "The architect revision could not be handed off. Presentation panes remain open.", errorText2(error2));
      }
    }
    case "send_builder_revision": {
      const sent = await ctx.sendAgentPrompt({ agentSessionId: state.stage.builder.agentSessionId, modifiers: SHOW_ME_MODIFIER, prompt: builderRevisionPrompt(input, state.stage.round, state.stage.review, state.stage.architectResponse) });
      return a(withStage(state, { ...state.stage, kind: "await_builder_revision" }), o.agentTurn(sent));
    }
    case "await_builder_revision": {
      const error = turnError(incoming, "Builder revision", state.stage.builder);
      if (error) return failed(ctx, "Deck build revision failed. Presentation panes remain open.", error);
      try {
        const response = await latestCompleteTurn(ctx, state.stage.builder, "builder");
        assertExpectedFile(state.repositoryPath, state.paths.htmlPath, "walkthrough deck");
        if (state.stage.round >= MAX_REVIEW_ROUNDS) {
          await ctx.log("info", `Deck review loop stopped after the final fixes from round ${state.stage.round}.`);
          await closeAll(ctx, [state.stage.architect, state.stage.builder, state.stage.verifier], "deck architect, builder, and verifier");
          return i(withStage(state, { kind: "start_presentation_review", curriculum: state.stage.curriculum, plan: state.stage.plan }));
        }
        return i(withStage(state, { kind: "send_reverification", curriculum: state.stage.curriculum, plan: state.stage.plan, architect: state.stage.architect, builder: state.stage.builder, verifier: state.stage.verifier, round: state.stage.round + 1, previousReview: state.stage.review, architectResponse: state.stage.architectResponse, builderResponse: response }));
      } catch (error2) {
        return failed(ctx, "The builder revision could not be handed off. Presentation panes remain open.", errorText2(error2));
      }
    }
    case "start_presentation_review": {
      await ctx.setUiFeedback({ phase: "Reviewing the walkthrough presentation", message: `Open ${state.paths.htmlPath}. Continue ends the walkthrough review.` });
      const spawned = await ctx.spawnAgentSession({ ...guide, prompt: presentationGuidePrompt(input, state.stage.curriculum) });
      const guideSession = visible(spawned);
      return a(withStage(state, { kind: "await_presentation_guide", curriculum: state.stage.curriculum, plan: state.stage.plan, guide: guideSession }), o.agentTurn(spawned));
    }
    case "await_presentation_guide": {
      const error = guideError(incoming, "Presentation guide");
      if (error) return failed(ctx, "The presentation guide failed.", error);
      await ctx.setUiFeedback({ phase: "Reviewing the walkthrough presentation", message: `Review ${state.paths.htmlPath} at your own pace. Ask the guide questions, or press Continue when finished.` });
      return a(withStage(state, { ...state.stage, kind: "await_presentation_continue" }), o.userContinue());
    }
    case "await_presentation_continue": {
      if (!s.isUserContinue(incoming)) return failed(ctx, "Presentation review could not finish.", "Expected user Continue.");
      await ctx.closePane(state.stage.guide.paneId);
      return l({ outcome: "presentation-review-completed", curriculumPath: state.paths.curriculumPath, deckPlanPath: state.paths.deckPlanPath, presentationPath: state.paths.htmlPath, ...deckPlanMetrics(state.stage.plan) });
    }
    default:
      return assertNever(state.stage);
  }
}
function promptInput(state) {
  return { repositoryPath: state.repositoryPath, story: state.story, sources: state.sources, paths: state.paths, audienceProfile: state.audienceProfile };
}
function ensureDirectories(state) {
  for (const path of [state.paths.reviewDirectory, `${state.paths.reviewDirectory}/.walkthrough/inventories`, state.paths.reviewsDirectory]) mkdirSync(resolve2(state.repositoryPath, path), { recursive: true });
}
function visible(input) {
  return { agentSessionId: input.agentSessionId, paneId: input.paneId, sentAt: input.sentAt };
}
function at(agents, index) {
  const agent = agents[index];
  if (!agent) throw new Error(`No visible agent at index ${index}.`);
  return agent;
}
function turnError(incoming, label, agent) {
  if (s.isAgentTurnFailed(incoming)) return `${label} failed in pane ${agent.paneId}: ${incoming.reason}`;
  if (!s.isAgentTurnEnded(incoming)) return `${label} resumed with an unexpected event in pane ${agent.paneId}.`;
  return null;
}
function guideError(incoming, label) {
  if (s.isAgentTurnFailed(incoming)) return `${label} failed: ${incoming.reason}`;
  if (!s.isAgentTurnEnded(incoming)) return `${label} resumed with an unexpected event.`;
  return null;
}
async function startDeckReviewRouting(ctx, state, stage) {
  await ctx.setUiFeedback({ phase: "Routing deck review", message: `Review round ${stage.round}.` });
  const op = await ctx.runHeadlessAgent({ ...deckReviewRouting, prompt: deckReviewRoutingPrompt(stage.review) });
  await ctx.log("info", `Started deck review routing judgment ${op.opId} for round ${stage.round}.`);
  return a(withStage(state, stage), o.headlessAgent(op));
}
function readDeckReview(repositoryPath, paths, round) {
  return readArtifactText(repositoryPath, deckReviewPath(paths, round));
}
async function latestCompleteTurn(ctx, agent, label) {
  const history = await ctx.getConversationHistory(agent.agentSessionId);
  const text = latestAssistantTurnText(history);
  if (!text) throw new Error(`${label} session ${agent.agentSessionId} has no complete assistant turn to hand off.`);
  return text;
}
async function closeAll(ctx, agents, label) {
  for (const agent of agents) await ctx.closePane(agent.paneId);
  await ctx.log("info", `Closed ${label} panes ${agents.map(({ paneId }) => paneId).join(", ")}.`);
}
async function failed(ctx, message, diagnostic) {
  await ctx.setUiFeedback({ kind: "error", phase: "Story walkthrough failed", message });
  await ctx.log("error", diagnostic);
  return u(diagnostic);
}
function chapterAt(curriculum, index) {
  const chapter = curriculum.chapters[index];
  if (!chapter) throw new Error(`No curriculum chapter at index ${index}.`);
  return chapter;
}
function beatAt(chapter, index) {
  const beat = chapter.beats[index];
  if (!beat) throw new Error(`No curriculum beat at index ${index} in ${chapter.id}.`);
  return beat;
}
function deckChapterAt(plan, index) {
  const chapter = plan.chapters[index];
  if (!chapter) throw new Error(`No deck chapter at index ${index}.`);
  return chapter;
}
function narrativeUnitAt(chapter, index) {
  const unit = chapter.narrativeUnits[index];
  if (!unit) throw new Error(`No narrative unit at index ${index} in ${chapter.id}.`);
  return unit;
}
function deckPlanMetrics(plan) {
  const legacy = plan;
  if (legacy.slides) return { slideCount: legacy.slides.length };
  return {
    chapterCount: plan.chapters.length,
    narrativeUnitCount: plan.chapters.reduce((count, chapter) => count + chapter.narrativeUnits.length, 0)
  };
}
function beatCount(curriculum) {
  return curriculum.chapters.reduce((count, chapter) => count + chapter.beats.length, 0);
}
function withStage(state, stage) {
  return { ...state, stage };
}
function errorText2(value) {
  return value instanceof Error ? value.message : String(value);
}
function assertNever(value) {
  throw new Error(`Unsupported workflow stage: ${String(value)}`);
}

// src/index.ts
var deliveryMechanisms = ["presentation", "socratic-walkthrough"];
var index_default = r({
  command: () => ({
    title: "Solution Walkthrough Story",
    description: "Prepare and interactively guide the user through a designed story solution.",
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
        label: "Walkthrough delivery mechanism?",
        options: [
          { value: "presentation", label: "Presentation" },
          { value: "socratic-walkthrough", label: "Socratic walkthrough" }
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
      stateVersion: 2,
      repositoryPath: launchCtx.worktreePath,
      story: parsed.story,
      sources: parsed.sources,
      paths: walkthroughPaths(parsed.reviewDirectory),
      audienceProfile: {
        familiarity: parsed.familiarity,
        technicalDepth: parsed.technicalDepth
      },
      deliveryMode: parsed.deliveryMode,
      stage: { kind: "start_source_analysis" }
    };
  },
  step: async (ctx, state, incoming) => {
    await ctx.log("debug", `Walk through story stage=${state.stage.kind}.`);
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
    deliveryMode: parseDeliveryMechanism(variables.deliveryMechanism, variables.presentationMode, variables.deliveryMode)
  };
}
function parseText(value, key) {
  if (typeof value === "string" && value.trim().length > 0) return value;
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
function parseDeliveryMechanism(value, legacyPresentationMode, legacyDeliveryMode) {
  if (value !== void 0) return deliveryModeFor(parseEnum(value, "deliveryMechanism", deliveryMechanisms, "presentation"));
  if (legacyPresentationMode !== void 0) {
    if (typeof legacyPresentationMode === "boolean") return legacyPresentationMode ? "presentation-first" : "guided-tutorial";
    throw new Error("presentationMode must be a boolean.");
  }
  return parseEnum(legacyDeliveryMode, "deliveryMode", deliveryModes, "presentation-first");
}
function deliveryModeFor(deliveryMechanism) {
  return deliveryMechanism === "presentation" ? "presentation-first" : "guided-tutorial";
}
export {
  index_default as default
};
