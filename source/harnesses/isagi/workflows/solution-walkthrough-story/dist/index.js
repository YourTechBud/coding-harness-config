// src/index.ts
import { mkdirSync as mkdirSync2 } from "node:fs";
import { resolve as resolve3 } from "node:path";

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

// src/constants.ts
var preparer = {
  harness: "codex",
  model: "gpt-5.6-sol",
  effort: "low"
};
var pageBuilder = {
  harness: "claude",
  model: "opus",
  effort: "medium"
};
var guide = {
  harness: "codex",
  model: "gpt-5.6-sol",
  effort: "low"
};
var deckArchitect = preparer;
var deckBuilder = pageBuilder;
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

// src/contracts.ts
var MAX_LEARNING_OBJECTIVE_WORDS = 40;
var MAX_COMPREHENSION_OBJECTIVE_WORDS = 25;
function readTopicInventories(repositoryPath, sources, review) {
  return Object.fromEntries(
    artifactDescriptors.map((descriptor) => [
      descriptor.kind,
      parseTopicInventory(
        readJsonFile(repositoryPath, pathFor(review.inventoryPaths, descriptor.kind)),
        descriptor.kind,
        pathFor(sources, descriptor.kind)
      )
    ])
  );
}
function readCurriculum(repositoryPath, sources, review, inventories) {
  return parseCurriculum(
    readJsonFile(repositoryPath, review.manifestPath),
    sources,
    review,
    inventories
  );
}
function validatePresentationSpecifications(repositoryPath, review, curriculum) {
  for (const descriptor of artifactDescriptors) {
    const specificationPath = pathFor(review.presentationPaths, descriptor.kind);
    const text = readTextFile(repositoryPath, specificationPath);
    const ownedTopics = curriculum.topics.filter((topic) => topic.artifact === descriptor.kind);
    const declaredIds = [...text.matchAll(/^## Topic `([^`]+)`:/gm)].map((match) => match[1]);
    const expectedIds = ownedTopics.map((topic) => topic.id);
    if (!sameValues(declaredIds, expectedIds)) {
      throw new Error(
        `${specificationPath} must declare topics in this exact order: ${expectedIds.join(", ")}.`
      );
    }
    for (const [index, topic] of ownedTopics.entries()) {
      const sectionStart = text.indexOf(`## Topic \`${topic.id}\`:`);
      const nextTopic = ownedTopics[index + 1];
      const sectionEnd = nextTopic ? text.indexOf(`## Topic \`${nextTopic.id}\`:`, sectionStart) : text.length;
      const section = text.slice(sectionStart, sectionEnd);
      requireOccurrence(section, `Anchor: \`${topic.browserAnchor}\``, 1, specificationPath);
      for (const heading of [
        "### Browser responsibility",
        "### Guide responsibility",
        "### First visible frame",
        "### Supporting representation",
        "### Progressive disclosure",
        "### Required content",
        "### Source grounding"
      ]) {
        if (!section.includes(heading)) {
          throw new Error(`${specificationPath} topic ${topic.id} is missing required heading ${heading}.`);
        }
      }
    }
  }
}
function validateHtmlArtifacts(repositoryPath, review, curriculum) {
  for (const descriptor of artifactDescriptors) {
    const htmlPath = pathFor(review.htmlPaths, descriptor.kind);
    const text = readTextFile(repositoryPath, htmlPath);
    const normalizedText = text.toLocaleLowerCase("en-US");
    for (const internalLabel of [
      "left to the guide",
      "guide responsibility",
      "browser responsibility",
      "required content"
    ]) {
      if (normalizedText.includes(internalLabel)) {
        throw new Error(`${htmlPath} exposes internal production label ${internalLabel}.`);
      }
    }
    const ownedTopics = curriculum.topics.filter((topic) => topic.artifact === descriptor.kind);
    let previousIndex = -1;
    for (const topic of ownedTopics) {
      const doubleQuoted = `id="${topic.browserAnchor}"`;
      const singleQuoted = `id='${topic.browserAnchor}'`;
      const count = occurrenceCount(text, doubleQuoted) + occurrenceCount(text, singleQuoted);
      if (count !== 1) {
        throw new Error(
          `${htmlPath} must contain browser anchor ${topic.browserAnchor} exactly once; found ${count}.`
        );
      }
      const index = Math.max(text.indexOf(doubleQuoted), text.indexOf(singleQuoted));
      if (index <= previousIndex) {
        throw new Error(`${htmlPath} topic anchors are not in manifest order.`);
      }
      previousIndex = index;
    }
    for (const href of expectedNavigation(descriptor.kind)) {
      if (!text.includes(`href="${href}"`) && !text.includes(`href='${href}'`)) {
        throw new Error(`${htmlPath} is missing navigation link ${href}.`);
      }
    }
  }
}
function readTopicInventoriesV2(repositoryPath, sources, paths) {
  return Object.fromEntries(
    artifactDescriptors.map((descriptor) => [
      descriptor.kind,
      parseTopicInventoryV2(
        readJsonFile(repositoryPath, pathFor(paths.inventoryPaths, descriptor.kind)),
        descriptor.kind,
        pathFor(sources, descriptor.kind)
      )
    ])
  );
}
function readCurriculumV2(repositoryPath, story, sources, audienceProfile, paths, inventories) {
  return parseCurriculumV2(
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
function artifactFileExists(repositoryPath, artifactPath) {
  const absolutePath = resolve(repositoryPath, artifactPath);
  return existsSync(absolutePath) && statSync(absolutePath).isFile();
}
function readArtifactText(repositoryPath, artifactPath) {
  return readTextFile(repositoryPath, artifactPath);
}
function parseTopicInventoryV2(value, expectedKind, expectedSourcePath) {
  const label = `${expectedKind} v2 inventory`;
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
function parseCurriculumV2(value, expectedStory, expectedSources, expectedProfile, inventories) {
  const record = exactRecord(
    value,
    ["schemaVersion", "story", "sources", "audienceProfile", "audienceContract", "chapters", "omissions"],
    "v2 curriculum"
  );
  if (record.schemaVersion !== 2) throw new Error("v2 curriculum schemaVersion must be 2.");
  const story = exactRecord(record.story, ["reference", "title", "throughline"], "v2 curriculum story");
  if (story.reference !== expectedStory) throw new Error(`v2 curriculum story reference must be ${expectedStory}.`);
  const sources = parseArtifactPaths(record.sources, "v2 curriculum sources");
  if (!sameArtifactPaths(sources, expectedSources)) throw new Error("v2 curriculum sources must match the workflow inputs.");
  const profile = exactRecord(record.audienceProfile, ["familiarity", "technicalDepth"], "v2 curriculum audienceProfile");
  if (profile.familiarity !== expectedProfile.familiarity || profile.technicalDepth !== expectedProfile.technicalDepth) {
    throw new Error("v2 curriculum audienceProfile must match the workflow inputs.");
  }
  const contract = exactRecord(
    record.audienceContract,
    ["assumedKnowledge", "orientationPolicy", "technicalDetailPolicy", "evidencePolicy"],
    "v2 curriculum audienceContract"
  );
  const chapters = arrayValue(record.chapters, "v2 curriculum chapters").map(
    (chapter, index) => parseCurriculumChapter(chapter, artifactKinds[index], index)
  );
  if (chapters.length !== artifactKinds.length) throw new Error("v2 curriculum requires exactly three chapters.");
  const omissions = arrayValue(record.omissions, "v2 curriculum omissions").map((value2, index) => {
    const omission = exactRecord(value2, ["candidate", "reason"], `v2 curriculum omission ${index + 1}`);
    return {
      candidate: parseCandidateReference(omission.candidate, `v2 curriculum omission ${index + 1} candidate`),
      reason: nonEmptyString(omission.reason, `v2 curriculum omission ${index + 1} reason`)
    };
  });
  validateCurriculumV2(chapters, omissions, inventories);
  return {
    schemaVersion: 2,
    story: {
      reference: expectedStory,
      title: nonEmptyString(story.title, "v2 curriculum story title"),
      throughline: nonEmptyString(story.throughline, "v2 curriculum story throughline")
    },
    sources,
    audienceProfile: expectedProfile,
    audienceContract: {
      assumedKnowledge: stringArray(contract.assumedKnowledge, "v2 curriculum assumedKnowledge"),
      orientationPolicy: nonEmptyString(contract.orientationPolicy, "v2 curriculum orientationPolicy"),
      technicalDetailPolicy: nonEmptyString(contract.technicalDetailPolicy, "v2 curriculum technicalDetailPolicy"),
      evidencePolicy: nonEmptyString(contract.evidencePolicy, "v2 curriculum evidencePolicy")
    },
    chapters,
    omissions
  };
}
function parseCurriculumChapter(value, expectedId, index) {
  const label = `v2 curriculum chapter ${index + 1}`;
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
function validateCurriculumV2(chapters, omissions, inventories) {
  const beatIds = /* @__PURE__ */ new Set();
  const accounted = /* @__PURE__ */ new Set();
  const introducedTerms = /* @__PURE__ */ new Set();
  for (const chapter of chapters) {
    for (const beat of chapter.beats) {
      if (beatIds.has(beat.id)) throw new Error(`v2 curriculum has duplicate beat ${beat.id}.`);
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
  const record = exactRecord(value, ["schemaVersion", "curriculumPath", "outputPath", "slides", "realizationUnits"], "deck plan");
  if (record.schemaVersion !== 1) throw new Error("deck plan schemaVersion must be 1.");
  if (record.curriculumPath !== paths.curriculumPath || record.outputPath !== paths.htmlPath) throw new Error("deck plan paths must match the workflow paths.");
  const beatOrder = curriculum.chapters.flatMap((chapter) => chapter.beats.map((beat) => beat.id));
  const beatChapter = new Map(curriculum.chapters.flatMap((chapter) => chapter.beats.map((beat) => [beat.id, chapter.id])));
  const slides = arrayValue(record.slides, "deck plan slides").map((value2, index) => {
    const label = `deck plan slide ${index + 1}`;
    const slide = exactRecord(value2, ["id", "chapterId", "beatIds", "title", "purpose", "contentResponsibilities", "representationIntent", "progressiveDisclosure"], label);
    const beatIds = stringArray(slide.beatIds, `${label} beatIds`);
    if (beatIds.length === 0) throw new Error(`${label} requires a beatId.`);
    const chapterId = artifactKind(slide.chapterId, `${label} chapterId`);
    for (const beatId of beatIds) {
      if (!beatChapter.has(beatId) || beatChapter.get(beatId) !== chapterId) throw new Error(`${label} beat ${beatId} must belong to ${chapterId}.`);
    }
    return {
      id: kebabString(slide.id, `${label} id`),
      chapterId,
      beatIds,
      title: nonEmptyString(slide.title, `${label} title`),
      purpose: nonEmptyString(slide.purpose, `${label} purpose`),
      contentResponsibilities: stringArray(slide.contentResponsibilities, `${label} contentResponsibilities`),
      representationIntent: nullableString(slide.representationIntent, `${label} representationIntent`),
      progressiveDisclosure: stringArray(slide.progressiveDisclosure, `${label} progressiveDisclosure`)
    };
  });
  if (slides.length === 0) throw new Error("deck plan requires at least one slide.");
  uniqueValues(slides.map((slide) => slide.id), "deck plan slide IDs");
  const mappedBeats = new Set(slides.flatMap((slide) => slide.beatIds));
  if (!sameValues(beatOrder, beatOrder.filter((beatId) => mappedBeats.has(beatId))) || mappedBeats.size !== beatOrder.length) {
    throw new Error("deck plan must map every curriculum beat.");
  }
  let lastBeatIndex = -1;
  for (const slide of slides) {
    const firstIndex = beatOrder.indexOf(slide.beatIds[0]);
    if (firstIndex < lastBeatIndex) throw new Error("deck plan slides must follow curriculum order.");
    lastBeatIndex = firstIndex;
  }
  const units = arrayValue(record.realizationUnits, "deck plan realizationUnits").map((value2, index) => {
    const label = `deck plan realization unit ${index + 1}`;
    const unit = exactRecord(value2, ["id", "slideIds"], label);
    const slideIds = stringArray(unit.slideIds, `${label} slideIds`);
    if (slideIds.length === 0) throw new Error(`${label} requires a slideId.`);
    return { id: kebabString(unit.id, `${label} id`), slideIds };
  });
  if (units.length === 0) throw new Error("deck plan requires at least one realization unit.");
  uniqueValues(units.map((unit) => unit.id), "deck plan realization unit IDs");
  const plannedSlideIds = slides.map((slide) => slide.id);
  const unitSlideIds = units.flatMap((unit) => unit.slideIds);
  if (!sameValues(unitSlideIds, plannedSlideIds)) throw new Error("realization units must assign every slide exactly once in deck order.");
  return { schemaVersion: 1, curriculumPath: paths.curriculumPath, outputPath: paths.htmlPath, slides, realizationUnits: units };
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
function uniqueValues(values, label) {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique.`);
}
function parseTopicInventory(value, expectedKind, expectedSourcePath) {
  const record = exactRecord(value, ["schemaVersion", "artifact", "topics"], `${expectedKind} inventory`);
  if (record.schemaVersion !== 1) throw new Error(`${expectedKind} inventory schemaVersion must be 1.`);
  const artifact = exactRecord(record.artifact, ["kind", "sourcePath"], `${expectedKind} inventory artifact`);
  if (artifact.kind !== expectedKind) {
    throw new Error(`${expectedKind} inventory artifact kind must be ${expectedKind}.`);
  }
  if (artifact.sourcePath !== expectedSourcePath) {
    throw new Error(`${expectedKind} inventory sourcePath must be ${expectedSourcePath}.`);
  }
  const topicsInput = arrayValue(record.topics, `${expectedKind} inventory topics`);
  if (topicsInput.length === 0) throw new Error(`${expectedKind} inventory must contain at least one topic.`);
  const topics = topicsInput.map((topic, index) => parseInventoryTopic(topic, expectedKind, index));
  const ids = new Set(topics.map((topic) => topic.candidateId));
  if (ids.size !== topics.length) throw new Error(`${expectedKind} inventory candidate IDs must be unique.`);
  for (const topic of topics) {
    for (const prerequisite of topic.prerequisiteCandidateIds) {
      if (!ids.has(prerequisite)) {
        throw new Error(
          `${expectedKind} inventory topic ${topic.candidateId} references unknown prerequisite ${prerequisite}.`
        );
      }
    }
  }
  return {
    schemaVersion: 1,
    artifact: { kind: expectedKind, sourcePath: expectedSourcePath },
    topics
  };
}
function parseInventoryTopic(value, kind, index) {
  const label = `${kind} inventory topic ${index + 1}`;
  const record = exactRecord(
    value,
    [
      "candidateId",
      "title",
      "learningObjective",
      "whyRequired",
      "prerequisiteCandidateIds",
      "terms",
      "sourceReferences",
      "critical",
      "comprehensionObjective"
    ],
    label
  );
  const candidateId = nonEmptyString(record.candidateId, `${label} candidateId`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidateId)) {
    throw new Error(`${label} candidateId must be kebab-case ASCII.`);
  }
  const critical = booleanValue(record.critical, `${label} critical`);
  const comprehensionObjective = nullableString(
    record.comprehensionObjective,
    `${label} comprehensionObjective`
  );
  if (critical && comprehensionObjective === null) {
    throw new Error(`${label} requires a comprehensionObjective because it is critical.`);
  }
  if (!critical && comprehensionObjective !== null) {
    throw new Error(`${label} comprehensionObjective must be null when the topic is not critical.`);
  }
  const sourceReferences = arrayValue(record.sourceReferences, `${label} sourceReferences`).map(
    (reference, referenceIndex) => parseSourceReference(reference, `${label} source reference ${referenceIndex + 1}`)
  );
  if (sourceReferences.length === 0) throw new Error(`${label} requires at least one source reference.`);
  const terms = arrayValue(record.terms, `${label} terms`).map(
    (term, termIndex) => parseTerm(term, `${label} term ${termIndex + 1}`)
  );
  return {
    candidateId,
    title: nonEmptyString(record.title, `${label} title`),
    learningObjective: nonEmptyString(record.learningObjective, `${label} learningObjective`),
    whyRequired: nonEmptyString(record.whyRequired, `${label} whyRequired`),
    prerequisiteCandidateIds: stringArray(
      record.prerequisiteCandidateIds,
      `${label} prerequisiteCandidateIds`
    ),
    terms,
    sourceReferences,
    critical,
    comprehensionObjective
  };
}
function parseCurriculum(value, sources, review, inventories) {
  const record = exactRecord(
    value,
    ["schemaVersion", "artifactOrder", "artifacts", "topics", "omissions"],
    "walkthrough manifest"
  );
  if (record.schemaVersion !== 1) throw new Error("Walkthrough manifest schemaVersion must be 1.");
  const artifactOrder = stringArray(record.artifactOrder, "walkthrough manifest artifactOrder");
  if (!sameValues(artifactOrder, artifactKinds)) {
    throw new Error(`Walkthrough manifest artifactOrder must be ${artifactKinds.join(", ")}.`);
  }
  const artifactsRecord = exactRecord(record.artifacts, artifactKinds, "walkthrough manifest artifacts");
  const artifacts = Object.fromEntries(
    artifactDescriptors.map((descriptor) => {
      const item = exactRecord(
        artifactsRecord[descriptor.kind],
        ["sourcePath", "presentationPath"],
        `walkthrough manifest ${descriptor.kind} artifact`
      );
      const expectedSource = pathFor(sources, descriptor.kind);
      const expectedPresentation = pathFor(review.htmlPaths, descriptor.kind);
      if (item.sourcePath !== expectedSource || item.presentationPath !== expectedPresentation) {
        throw new Error(
          `Walkthrough manifest ${descriptor.kind} paths must be ${expectedSource} and ${expectedPresentation}.`
        );
      }
      return [
        descriptor.kind,
        { sourcePath: expectedSource, presentationPath: expectedPresentation }
      ];
    })
  );
  const topics = arrayValue(record.topics, "walkthrough manifest topics").map(
    (topic, index) => parseWalkthroughTopic(topic, index)
  );
  if (topics.length === 0) throw new Error("Walkthrough manifest must contain at least one topic.");
  const omissions = arrayValue(record.omissions, "walkthrough manifest omissions").map(
    (omission, index) => {
      const item = exactRecord(
        omission,
        ["artifact", "candidateId", "reason"],
        `walkthrough manifest omission ${index + 1}`
      );
      return {
        artifact: artifactKind(item.artifact, `walkthrough manifest omission ${index + 1} artifact`),
        candidateId: nonEmptyString(
          item.candidateId,
          `walkthrough manifest omission ${index + 1} candidateId`
        ),
        reason: nonEmptyString(item.reason, `walkthrough manifest omission ${index + 1} reason`)
      };
    }
  );
  validateCurriculumTopics(topics, omissions, inventories);
  return { schemaVersion: 1, artifactOrder: artifactKinds, artifacts, topics, omissions };
}
function parseWalkthroughTopic(value, index) {
  const label = `walkthrough manifest topic ${index + 1}`;
  const record = exactRecord(
    value,
    [
      "id",
      "artifact",
      "candidateId",
      "title",
      "learningObjective",
      "prerequisiteTopicIds",
      "sourceReferences",
      "critical",
      "comprehensionObjective",
      "browserAnchor"
    ],
    label
  );
  const artifact = artifactKind(record.artifact, `${label} artifact`);
  const id = nonEmptyString(record.id, `${label} id`);
  const prefix = descriptorFor(artifact).topicPrefix;
  if (!new RegExp(`^${prefix}-\\d{2}$`).test(id)) {
    throw new Error(`${label} id must match ${prefix}-NN.`);
  }
  const browserAnchor = nonEmptyString(record.browserAnchor, `${label} browserAnchor`);
  if (browserAnchor !== `topic-${id}`) {
    throw new Error(`${label} browserAnchor must be topic-${id}.`);
  }
  const critical = booleanValue(record.critical, `${label} critical`);
  const comprehensionObjective = nullableString(
    record.comprehensionObjective,
    `${label} comprehensionObjective`
  );
  if (critical !== (comprehensionObjective !== null)) {
    throw new Error(`${label} critical and comprehensionObjective must agree.`);
  }
  const sourceReferences = arrayValue(record.sourceReferences, `${label} sourceReferences`).map(
    (reference, referenceIndex) => parseSourceReference(reference, `${label} source reference ${referenceIndex + 1}`)
  );
  if (sourceReferences.length === 0) throw new Error(`${label} requires at least one source reference.`);
  const learningObjective = nonEmptyString(record.learningObjective, `${label} learningObjective`);
  if (wordCount(learningObjective) > MAX_LEARNING_OBJECTIVE_WORDS) {
    throw new Error(
      `${label} learningObjective allows at most ${MAX_LEARNING_OBJECTIVE_WORDS} words; found ${wordCount(learningObjective)}.`
    );
  }
  if (comprehensionObjective !== null && wordCount(comprehensionObjective) > MAX_COMPREHENSION_OBJECTIVE_WORDS) {
    throw new Error(
      `${label} comprehensionObjective allows at most ${MAX_COMPREHENSION_OBJECTIVE_WORDS} words; found ${wordCount(comprehensionObjective)}.`
    );
  }
  return {
    id,
    artifact,
    candidateId: nonEmptyString(record.candidateId, `${label} candidateId`),
    title: nonEmptyString(record.title, `${label} title`),
    learningObjective,
    prerequisiteTopicIds: stringArray(record.prerequisiteTopicIds, `${label} prerequisiteTopicIds`),
    sourceReferences,
    critical,
    comprehensionObjective,
    browserAnchor
  };
}
function validateCurriculumTopics(topics, omissions, inventories) {
  const topicIds = /* @__PURE__ */ new Set();
  const anchors = /* @__PURE__ */ new Set();
  const accounted = /* @__PURE__ */ new Set();
  let previousArtifactIndex = 0;
  const counts = /* @__PURE__ */ new Map();
  for (const topic of topics) {
    if (topicIds.has(topic.id)) throw new Error(`Walkthrough manifest has duplicate topic ID ${topic.id}.`);
    if (anchors.has(topic.browserAnchor)) {
      throw new Error(`Walkthrough manifest has duplicate browser anchor ${topic.browserAnchor}.`);
    }
    const artifactIndex = artifactKinds.indexOf(topic.artifact);
    if (artifactIndex < previousArtifactIndex) {
      throw new Error("Walkthrough manifest topics must follow artifactOrder.");
    }
    previousArtifactIndex = artifactIndex;
    for (const prerequisite of topic.prerequisiteTopicIds) {
      if (!topicIds.has(prerequisite)) {
        throw new Error(`Walkthrough topic ${topic.id} prerequisite ${prerequisite} must appear earlier.`);
      }
    }
    const candidateKey = `${topic.artifact}:${topic.candidateId}`;
    if (!inventoryCandidateExists(inventories, topic.artifact, topic.candidateId)) {
      throw new Error(`Walkthrough topic ${topic.id} references unknown candidate ${candidateKey}.`);
    }
    if (accounted.has(candidateKey)) throw new Error(`Inventory candidate ${candidateKey} is accounted for twice.`);
    accounted.add(candidateKey);
    topicIds.add(topic.id);
    anchors.add(topic.browserAnchor);
    counts.set(topic.artifact, (counts.get(topic.artifact) ?? 0) + 1);
  }
  for (const omission of omissions) {
    const candidateKey = `${omission.artifact}:${omission.candidateId}`;
    if (!inventoryCandidateExists(inventories, omission.artifact, omission.candidateId)) {
      throw new Error(`Walkthrough omission references unknown candidate ${candidateKey}.`);
    }
    if (accounted.has(candidateKey)) throw new Error(`Inventory candidate ${candidateKey} is accounted for twice.`);
    accounted.add(candidateKey);
  }
  for (const kind of artifactKinds) {
    if ((counts.get(kind) ?? 0) === 0) {
      throw new Error(`Walkthrough manifest requires at least one ${kind} topic.`);
    }
    for (const candidate of inventories[kind].topics) {
      const key = `${kind}:${candidate.candidateId}`;
      if (!accounted.has(key)) throw new Error(`Inventory candidate ${key} is not represented or omitted.`);
    }
  }
}
function inventoryCandidateExists(inventories, kind, candidateId) {
  return inventories[kind].topics.some((topic) => topic.candidateId === candidateId);
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
function booleanValue(value, label) {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean.`);
  return value;
}
function arrayValue(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}
function stringArray(value, label) {
  return arrayValue(value, label).map((item, index) => nonEmptyString(item, `${label}[${index}]`));
}
function wordCount(value) {
  return value.trim().split(/\s+/u).length;
}
function artifactKind(value, label) {
  if (typeof value === "string" && artifactKinds.some((kind) => kind === value)) {
    return value;
  }
  throw new Error(`${label} must be one of: ${artifactKinds.join(", ")}.`);
}
function sameValues(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
function requireOccurrence(text, value, expected, label) {
  const count = occurrenceCount(text, value);
  if (count !== expected) throw new Error(`${label} must contain ${value} exactly ${expected} time; found ${count}.`);
}
function occurrenceCount(text, value) {
  if (value.length === 0) return 0;
  return text.split(value).length - 1;
}
function expectedNavigation(kind) {
  switch (kind) {
    case "current-state":
      return ["./architecture.html"];
    case "architecture":
      return ["./current-state.html", "./program-design.html"];
    case "program-design":
      return ["./current-state.html", "./architecture.html"];
  }
}
function errorText(value) {
  return value instanceof Error ? value.message : String(value);
}

// src/paths.ts
function walkthroughV2Paths(reviewDirectory) {
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
function legacyDeckReviewPath(paths, round) {
  return `${paths.reviewsDirectory}/round-${String(round).padStart(2, "0")}.json`;
}

// src/prompts.ts
var PREPARATION_FOOTER = "Work unattended and finish the requested file in this turn. Do not run tasks or shell commands in the background, but you may run them in the foreground.";
function topicDiscoveryPrompt(input, kind) {
  const descriptor = descriptorFor(kind);
  const sourcePath = pathFor(input.sources, kind);
  const outputPath = pathFor(input.review.inventoryPaths, kind);
  return withPreparationFooter(`Identify the teaching topics contained in one technical artifact.

Story: ${input.story}
Repository: ${input.repositoryPath}
Artifact kind: ${kind}
Canonical source: ${sourcePath}
Output: ${outputPath}

The eventual reader is a technically experienced person who may have no context about this repository.

Identify the bounded concepts they must understand, unfamiliar vocabulary that needs introduction, local prerequisite relationships, and concepts whose misunderstanding would materially impair later comprehension.

Create one candidate for each novel mental model the reader must actively learn rather than mirroring source headings. Fold definitions, evidence, examples, edge cases, and closely related mechanics into supporting material when they help explain the same mental model. Keep distinct mental models separate even when that creates more candidates. Write each learning objective as one concise learner outcome rather than a checklist of facts. Mark a candidate critical when the phase-level comprehension dialogue should verify it because misunderstanding it would make later design material meaningfully misleading.

Write exactly one JSON object with this shape:
{
  "schemaVersion": 1,
  "artifact": { "kind": "${kind}", "sourcePath": "${sourcePath}" },
  "topics": [
    {
      "candidateId": "short-kebab-case-id",
      "title": "Human-readable topic title",
      "learningObjective": "What the user should understand",
      "whyRequired": "Why later comprehension depends on it",
      "prerequisiteCandidateIds": [],
      "terms": [{ "term": "term", "meaning": "plain-language meaning" }],
      "sourceReferences": [{ "heading": "Source heading", "locator": "Retrievable path, symbol, or section" }],
      "critical": true,
      "comprehensionObjective": "What a lightweight check should establish"
    }
  ]
}

Use null for comprehensionObjective when a topic is not critical. Candidate IDs must be unique within ${descriptor.label} and prerequisiteCandidateIds must reference candidates in the same inventory.

Treat the canonical source as authoritative. This turn inventories teaching material; it does not design the final curriculum, create browser presentation, assess the technical proposal, or modify the source.

Write only ${outputPath} and satisfy the exact contract.`);
}
function curriculumIntegrationPrompt(input) {
  const inventoryList = artifactDescriptors.map(
    (descriptor) => `${descriptor.label}: ${pathFor(input.review.inventoryPaths, descriptor.kind)}`
  ).join("\n");
  const sourceList = artifactDescriptors.map(
    (descriptor) => `${descriptor.label}: ${pathFor(input.sources, descriptor.kind)}`
  ).join("\n");
  const artifactObject = Object.fromEntries(
    artifactDescriptors.map((descriptor) => [
      descriptor.kind,
      {
        sourcePath: pathFor(input.sources, descriptor.kind),
        presentationPath: pathFor(input.review.htmlPaths, descriptor.kind)
      }
    ])
  );
  return withPreparationFooter(`Create the authoritative teaching sequence for the complete story walkthrough.

Story: ${input.story}
Repository: ${input.repositoryPath}
Topic inventories:
${inventoryList}

Canonical sources:
${sourceList}

Output: ${input.review.manifestPath}

The walkthrough proceeds through current state, architecture, and program design in that order. Within those boundaries, sequence topics so each concept is introduced before later topics depend on it. Later artifacts should build on earlier mental models rather than reteach them. Preserve source grounding without mirroring source sections one for one.

A topic is one conversational teaching checkpoint organized around one novel mental model. Facts, definitions, examples, diagrams, evidence, and related mechanisms that support that mental model belong in the same checkpoint. Keep distinct mental models in distinct checkpoints rather than merging them to reach a predetermined topic count. Use omissions to record inventory candidates that are supporting material for another named topic or genuinely unnecessary for comprehension. Prefer the smallest curriculum that preserves every distinct mental model the user needs.

After all teaching checkpoints for an artifact, the live walkthrough conducts a phase-level Socratic comprehension dialogue. Reserve critical for checkpoints whose understanding should be explicitly tested in that dialogue because misunderstanding them would materially distort the rest of the walkthrough.

Write each learningObjective as one sentence of no more than forty words describing the central mental model. Put the facts, branches, evidence, and edge cases in sourceReferences and the later presentation specification. Write each comprehensionObjective as one phase-level Socratic verification outcome of no more than twenty-five words.

Write exactly one JSON object with these exact top-level keys and shapes:
{
  "schemaVersion": 1,
  "artifactOrder": ["current-state", "architecture", "program-design"],
  "artifacts": ${JSON.stringify(artifactObject, null, 2)},
  "topics": [
    {
      "id": "cs-01",
      "artifact": "current-state",
      "candidateId": "candidate-from-inventory",
      "title": "Human-readable topic title",
      "learningObjective": "What the user should understand",
      "prerequisiteTopicIds": [],
      "sourceReferences": [{ "heading": "Source heading", "locator": "Retrievable path, symbol, or section" }],
      "critical": true,
      "comprehensionObjective": "What a lightweight check should establish",
      "browserAnchor": "topic-cs-01"
    }
  ],
  "omissions": [{ "artifact": "architecture", "candidateId": "duplicate-candidate", "reason": "Folded into ar-02 as supporting detail" }]
}

Use sequential cs-NN, ar-NN, and pd-NN topic IDs for current state, architecture, and program design. browserAnchor must be topic- followed by the topic ID. Every inventory candidate must appear exactly once as a topic or omission. Every prerequisite topic must appear earlier in the topics array. Use null for comprehensionObjective when a topic is not critical.

This turn defines the curriculum. It does not write explanations, choose visual treatments, create HTML, evaluate the technical proposal, or modify the canonical sources.

Write only ${input.review.manifestPath} and satisfy the exact contract.`);
}
function presentationDesignPrompt(input, kind) {
  const descriptor = descriptorFor(kind);
  const sourcePath = pathFor(input.sources, kind);
  const outputPath = pathFor(input.review.presentationPaths, kind);
  return withPreparationFooter(`Design the browser presentation for one artifact's finalized teaching topics.

Story: ${input.story}
Repository: ${input.repositoryPath}
Artifact: ${kind}
Manifest: ${input.review.manifestPath}
Canonical source: ${sourcePath}
Output specification: ${outputPath}

For every manifest topic owned by ${descriptor.label}, write one section with this exact heading and field structure:

## Topic \`<topic-id>\`: <topic title>

Anchor: \`<browser-anchor>\`

### Browser responsibility

### Guide responsibility

### First visible frame

### Supporting representation

### Progressive disclosure

### Required content

### Source grounding

Design each topic for a progressive conversation rather than standalone passive reading. The first visible frame at the topic anchor should fit comfortably in one ordinary laptop viewport and contain one clear takeaway plus one compact representation. Put supporting evidence, code, edge cases, and secondary detail behind progressive disclosure. The browser supplies stable visual support while the guide supplies adaptive explanation, so neither should narrate the other.

Use the Show Me skill to choose the smallest focused representation that makes each topic's central relationship clear.

Use Browser responsibility to define what the user can understand at a glance. Use Guide responsibility to define the one conceptual bridge or misconception the conversation may need to address. Keep Required content to the minimum needed for the learning objective rather than reproducing every source claim.

Use the topic IDs and browser anchors exactly as supplied. Preserve the finalized topic order and learning objectives.

This turn designs the presentation but does not create HTML, alter the curriculum, assess the technical proposal, or modify the canonical source.

Write only ${outputPath}.`);
}
function htmlRealizationPrompt(input, kind) {
  const descriptor = descriptorFor(kind);
  const sourcePath = pathFor(input.sources, kind);
  const specificationPath = pathFor(input.review.presentationPaths, kind);
  const outputPath = pathFor(input.review.htmlPaths, kind);
  return withPreparationFooter(`Realize one presentation specification as a self-contained HTML artifact.

Story: ${input.story}
Repository: ${input.repositoryPath}
Artifact: ${kind}
Canonical source: ${sourcePath}
Manifest: ${input.review.manifestPath}
Presentation specification: ${specificationPath}
Output: ${outputPath}

Implement every ${descriptor.label} topic in manifest order. Give each topic section the exact id specified by its browserAnchor.

Use the specification as the presentation plan and the canonical source as technical authority. Preserve the distinction between concise browser support and explanation left to the live guide.

Use the Show Me skill when realizing each topic's focused representation.

At each topic anchor, keep the initial visible material to one short takeaway and at most one compact primary representation. Keep visible prose before the first disclosure under roughly 150 words. Place long code, large tables, detailed evidence, edge cases, and alternatives behind closed disclosure controls.

Treat specification labels such as Browser responsibility, Guide responsibility, Required content, and Source grounding as production guidance. Do not render those labels or internal notes such as "Left to the guide" in the user-facing page. Render source grounding only as unobtrusive citations when it helps the reader.

Create a navigable table of contents, clear topic boundaries, responsive presentation, and progressive disclosure where specified. Include these navigation links: ${navigationRequirement(kind)}

Create only ${outputPath}. Preserve the curriculum, specification, and canonical source.`);
}
function liveTopicPrompt(input) {
  const descriptor = descriptorFor(input.topic.artifact);
  const sourcePath = pathFor(input.sources, input.topic.artifact);
  const presentationPath = pathFor(
    input.review.htmlPaths,
    input.topic.artifact
  );
  const prerequisiteContext = input.topic.prerequisiteTopicIds.map((prerequisiteId) => {
    const prerequisite = input.curriculum.topics.find(
      (topic) => topic.id === prerequisiteId
    );
    if (!prerequisite) {
      throw new Error(
        `Walkthrough topic ${input.topic.id} references missing prerequisite ${prerequisiteId}.`
      );
    }
    return `- ${prerequisite.title}: ${prerequisite.learningObjective}`;
  }).join("\n");
  const sourceReferences = input.topic.sourceReferences.map((reference) => `- ${reference.heading}: ${reference.locator}`).join("\n");
  return `Guide the user through one topic in the interactive story walkthrough.

Story: ${input.story}
Repository: ${input.repositoryPath}
Current teaching subject: ${input.topic.title}
Artifact phase: ${descriptor.label}
Learning objective: ${input.topic.learningObjective}
What this builds on:
${prerequisiteContext || "- No prior concept is required. Establish this subject from first principles."}
Canonical source: ${sourcePath}
Source references:
${sourceReferences}
Browser support: ${presentationPath}#${input.topic.browserAnchor}

Teach this subject Socratically. Give context, direct explanation, examples, and evidence as needed, then use questions to help the user reason. Let their answers shape what you clarify. Questions here support teaching; comprehension is checked after the artifact phase.

Make this turn understandable on its own. Speak in concrete system terms; internal IDs and anchors are navigation only. Briefly restate any earlier concept the explanation depends on.

Stay with this subject's central mental model while using any supporting explanations or representations that help. Leave distinct later models for their own checkpoints.

Keep each reply under 300 words of explanatory prose; diagrams, code sketches, and compact tables do not count. Use the Show Me skill when a focused visual would help.

Use the browser for stable structure and evidence, explaining what a referenced visual represents. Treat canonical artifacts as read-only. Record feedback only when the human asks; use their requested destination or ${input.review.defaultFeedbackPath} by default.

Advance only when the user presses the workflow Continue control.`;
}
function phaseComprehensionPrompt(input) {
  const descriptor = descriptorFor(input.artifact);
  const sourcePath = pathFor(input.sources, input.artifact);
  const presentationPath = pathFor(input.review.htmlPaths, input.artifact);
  const topics = input.curriculum.topics.filter(
    (topic) => topic.artifact === input.artifact
  );
  const taughtTopics = topics.map(
    (topic) => `- ${topic.title}: ${topic.learningObjective}`
  ).join("\n");
  const comprehensionPriorities = topics.filter((topic) => topic.critical).map(
    (topic) => `- ${topic.title}: ${topic.comprehensionObjective ?? topic.learningObjective}`
  ).join("\n");
  return `Guide the user through the phase-level comprehension dialogue for the interactive story walkthrough.

Story: ${input.story}
Repository: ${input.repositoryPath}
Completed artifact phase: ${input.artifact} \u2014 ${descriptor.label}
Canonical source: ${sourcePath}
Browser support: ${presentationPath}
Teaching checkpoints completed:
${taughtTopics}
Phase comprehension priorities:
${comprehensionPriorities || "- No checkpoint is marked critical. Help the user synthesize and connect the completed learning objectives."}

All teaching checkpoints for this artifact are complete. Run a Socratic comprehension dialogue that asks the user to explain, connect, predict, or apply the important mental models. Let their answers determine what to probe, clarify, or briefly reteach; the user decides when they understand the phase.

Keep the dialogue concrete and understandable without remembering earlier turns. Internal IDs and anchors are navigation only; briefly restate any prior concept a question or explanation depends on.

Keep each reply under 300 words of explanatory prose; diagrams, code sketches, and compact tables do not count. Use the Show Me skill when a focused visual would help.

Use the browser and canonical source for grounding. Treat canonical artifacts as read-only. Record feedback only when the human asks; use their requested destination or ${input.review.defaultFeedbackPath} by default.

Stay with this phase until the user presses the workflow Continue control.`;
}
function navigationRequirement(kind) {
  switch (kind) {
    case "current-state":
      return "link to ./architecture.html.";
    case "architecture":
      return "link to ./current-state.html and ./program-design.html.";
    case "program-design":
      return "link to ./current-state.html and ./architecture.html.";
  }
}
function withPreparationFooter(body) {
  return `${body}

${PREPARATION_FOOTER}`;
}

// src/v2.ts
import { mkdirSync } from "node:fs";
import { resolve as resolve2 } from "node:path";

// src/v2-judgments.ts
function deckReviewRoutingPrompt(review) {
  return `You are an unattended routing judgment for an Isagi walkthrough deck review.

Classify the complete review below into exactly one outgoing workflow edge. Judge the review's meaning rather than its formatting. Every outcome is valid on every round.

Review:
${review}

Return exactly one JSON object with exactly this field:
{"outcome":"complete"}

Apply this precedence:
1. Return "human-decision" when the review explicitly identifies a product, narrative, scope, or tradeoff decision that only the user can make. An explicit human decision takes precedence over every other outcome.
2. Return "architect-and-builder" when any required finding needs the curriculum or deck plan changed, including slide purpose, ordering, content responsibility, narrative structure, or realization boundaries. This also wins when architect and builder work are both required.
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

// src/v2-prompts.ts
function sourceInventoryPrompt(input, kind) {
  const sourcePath = pathFor(input.sources, kind);
  const outputPath = pathFor(input.paths.inventoryPaths, kind);
  return prepared(`Analyze one canonical source for reusable walkthrough material.

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
  return prepared(`Create the delivery-neutral curriculum for a solution walkthrough.

Story: ${input.story}
Repository: ${input.repositoryPath}
Audience familiarity: ${input.audienceProfile.familiarity}
Technical depth: ${input.audienceProfile.technicalDepth}
Inventories:
${inventories}
Output: ${input.paths.curriculumPath}

Apply the audience profile here and only here. For familiarity=new, establish concepts from first principles; for familiarity=familiar, use compact refreshers and emphasize deltas and consequences. Product depth prioritizes user value, behavior, and tradeoffs; system-design depth prioritizes boundaries, data flow, responsibilities, and tradeoffs; implementation depth includes exact mechanics, symbols, failure modes, and verification evidence.

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
    "evidencePolicy": "What evidence is retained"
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
  return prepared(`Architect one standalone slide presentation from the finalized curriculum.

Story: ${input.story}
Curriculum: ${input.paths.curriculumPath}
Output deck: ${input.paths.htmlPath}
Output plan: ${input.paths.deckPlanPath}

Design a unified deck that can be understood without an agent. It must feel like slides rather than a scrolling document: each frame has a clear purpose, concise briefing prose, and the smallest representation that makes its relationship understandable. Preserve the curriculum's narrative and content obligations. Decide the number of slides creatively; a beat may use one or several slides, and a slide may combine closely connected beats from the same chapter.

Group contiguous slides into coherent realization units for incremental construction. Units are build boundaries, not visible sections, and their count should follow the design rather than a quota.

Write exactly one JSON object:
{
  "schemaVersion": 1,
  "curriculumPath": ${JSON.stringify(input.paths.curriculumPath)},
  "outputPath": ${JSON.stringify(input.paths.htmlPath)},
  "slides": [{
    "id": "descriptive-kebab-id",
    "chapterId": "current-state",
    "beatIds": ["cs-01"],
    "title": "Visible slide title",
    "purpose": "What this slide accomplishes",
    "contentResponsibilities": ["Required visible or disclosed content"],
    "representationIntent": "Optional visual relationship",
    "progressiveDisclosure": []
  }],
  "realizationUnits": [{ "id": "coherent-unit", "slideIds": ["descriptive-kebab-id"] }]
}

Every beat must map to at least one slide. Assign every slide exactly once to units in deck order. Write only ${input.paths.deckPlanPath}.`);
}
function deckShellPrompt(input) {
  return prepared(`Create the reusable shell for the planned standalone slide deck.

Curriculum: ${input.paths.curriculumPath}
Deck plan: ${input.paths.deckPlanPath}
Output: ${input.paths.htmlPath}

Create one self-contained HTML file with embedded CSS and JavaScript. Establish a polished, responsive, viewport-based slide experience with keyboard and visible previous/next navigation, progress, accessible semantics, and printable fallback. Include the literal markers data-walkthrough-deck, data-slide-viewport, and data-slide-navigation. Do not realize planned content slides yet; leave a clear insertion area for later turns. This is a presentation, not a vertically scrolling document.

Write only ${input.paths.htmlPath}.`);
}
function realizationUnitPrompt(input, plan, unit) {
  const slides = plan.slides.filter((slide) => unit.slideIds.includes(slide.id));
  return prepared(`Realize one planned unit in the existing standalone deck.

Curriculum: ${input.paths.curriculumPath}
Deck plan: ${input.paths.deckPlanPath}
Deck: ${input.paths.htmlPath}
Unit: ${unit.id}
Slides: ${JSON.stringify(slides, null, 2)}

Edit the existing HTML and add exactly these slides in their planned order. Each slide is a section carrying data-walkthrough-slide and its exact planned id. Supply enough briefing prose and source-grounded context for the deck to stand alone. Use focused diagrams, code shapes, comparisons, or sequences when the representation intent warrants them. Keep slides scannable and place genuine secondary detail behind accessible progressive disclosure. Preserve the shell and every previously built slide.

Modify only ${input.paths.htmlPath}.`);
}
function finalAssemblyPrompt(input) {
  return prepared(`Complete and polish the assembled standalone presentation.

Curriculum: ${input.paths.curriculumPath}
Deck plan: ${input.paths.deckPlanPath}
Deck: ${input.paths.htmlPath}

All realization units are present. Integrate the opening, chapter transitions, ending, navigation state, progress behavior, responsive layout, accessibility, and visual consistency so the file reads as one presentation. Preserve exact planned slide IDs and order. Confirm every curriculum obligation is represented, the prose makes sense in isolation, controls work, and the default experience does not become a scrolling page.

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
  return prepared(`Verify the built walkthrough deck against its authoritative inputs.

Round: ${round}
Curriculum: ${input.paths.curriculumPath}
Deck plan: ${input.paths.deckPlanPath}
Deck: ${input.paths.htmlPath}
Output: ${output}
${previousContext}

Inspect the HTML in a browser at ordinary laptop and narrow viewport sizes. Check standalone comprehension, curriculum coverage, narrative continuity, factual grounding, planned slide identity and order, true slide behavior, navigation, progressive disclosure, accessibility, overflow, and visual legibility. This is read-only review: do not edit the curriculum, plan, or deck.

Write a complete standalone Markdown review for this round with these sections:

# Deck Review \u2014 Round ${round}

## Review scope
State what you inspected, the viewport and interaction checks you performed, and anything you could not verify.

## Prior finding verification
For round one, state that this is the initial review. On later rounds, account for every prior blocker and concern with a status of Verified, Incomplete, Not addressed, or Withdrawn, followed by current evidence and any remaining required outcome. Verify the files and browser behavior yourself rather than trusting agent summaries.

## Findings
Report every current finding under a heading in the form "### F-NN \u2014 [Severity] Short title", where severity is Blocker, Concern, or Suggestion. Keep a finding's stable ID across rounds while it remains relevant. For each finding, include responsibility, affected area, evidence, consequence, required outcome, and how the next review can verify it. Responsibility names one or more of: Deck architecture when the curriculum or plan must change, Deck implementation when the current plan can be realized differently in HTML, or Human decision when only the user can choose the product, narrative, scope, or tradeoff direction. Use "No findings" when there are none. Suggestions are optional and never require another revision round.

## Human decision
Write "No human decision required" unless a genuine user decision is necessary. When one is necessary, state the decision, why agents cannot decide it safely, the available options, and their material tradeoffs.

## Conclusion
State plainly whether required work remains and whether it belongs to deck architecture, deck implementation, both, or the user. A review with no blockers or concerns is complete even when it contains suggestions.

The Markdown must carry the full review evidence; do not emit a JSON verdict or machine-routing fields. Write only ${output}.`);
}
function architectRevisionPrompt(input, round, review) {
  return prepared(`Resolve the deck-architecture findings from review round ${round}.

Curriculum: ${input.paths.curriculumPath}
Deck plan: ${input.paths.deckPlanPath}
Review: ${deckReviewPath(input.paths, round)}

<deck_review>
${review}
</deck_review>

Update the deck plan where the review requires architectural changes while preserving the curriculum contract and valid slide and realization-unit accounting. Evaluate every finding on its evidence. In your response, summarize what changed, explain any finding you declined with evidence, and clearly identify any genuine decision that only the user can make.

Modify only ${input.paths.deckPlanPath}.`);
}
function builderRevisionPrompt(input, round, review, architectResponse) {
  const architectureContext = architectResponse ? `
Architect response:
<architect_response>
${architectResponse}
</architect_response>
` : "";
  return prepared(`Bring the deck into conformance after review round ${round}.

Curriculum: ${input.paths.curriculumPath}
Current deck plan: ${input.paths.deckPlanPath}
Review: ${deckReviewPath(input.paths, round)}
Deck: ${input.paths.htmlPath}
${architectureContext}
<deck_review>
${review}
</deck_review>

Apply the deck-implementation findings and realize the current plan, including any architect changes. Evaluate every finding on its evidence and preserve correct content while making the complete presentation conform. In your response, summarize what changed, explain any finding you declined with evidence, and clearly identify any genuine decision that only the user can make.

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

Teach this beat as an adaptive, Socratic tutorial. Establish enough context for this turn to stand alone, explain directly where useful, and use focused questions to help the user form the intended model. Keep replies brief and use the Show Me skill when a visual representation materially helps. The user controls dialogue inside the agent pane; the workflow Continue control advances to the next curriculum checkpoint. Treat sources as read-only.`;
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

The presentation is the primary standalone experience and the user controls its pace. Answer questions briefly and precisely from the curriculum and canonical sources. Use the Show Me skill when a focused visual or code-shape explanation helps. If the user says \u201Cwalk me through it\u201D without naming a slide or starting point, begin at the first curriculum beat and guide all selected material conversationally in this pane; do not rely on the workflow Continue control to advance that chat-driven walkthrough. If they name a slide or ask to start from a point, honor that starting point. The workflow Continue control means they are finished reviewing and want to end this workflow.`;
}
function prepared(body) {
  return `${body}

${PREPARATION_FOOTER}`;
}

// src/v2.ts
var MAX_REVIEW_ROUNDS = 3;
async function stepV2(ctx, state, incoming) {
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
        readTopicInventoriesV2(state.repositoryPath, state.sources, state.paths);
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
        const inventories = readTopicInventoriesV2(state.repositoryPath, state.sources, state.paths);
        const curriculum = readCurriculumV2(state.repositoryPath, state.story, state.sources, state.audienceProfile, state.paths, inventories);
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
      const architect = visible(await ctx.spawnAgentSession({ ...deckArchitect, prompt: deckArchitecturePrompt(input) }));
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
        return i(withStage(state, { ...state.stage, kind: "send_realization_unit", unitIndex: 0 }));
      } catch (error2) {
        return failed(ctx, "The deck shell is missing. Build panes remain open.", errorText2(error2));
      }
    }
    case "send_realization_unit": {
      const unit = state.stage.plan.realizationUnits[state.stage.unitIndex];
      if (!unit) return i(withStage(state, { kind: "send_final_assembly", curriculum: state.stage.curriculum, plan: state.stage.plan, architect: state.stage.architect, builder: state.stage.builder }));
      await ctx.setUiFeedback({ phase: "Building walkthrough slides", message: `Realization unit ${state.stage.unitIndex + 1} of ${state.stage.plan.realizationUnits.length}: ${unit.id}.` });
      const sent = await ctx.sendAgentPrompt({ agentSessionId: state.stage.builder.agentSessionId, prompt: realizationUnitPrompt(input, state.stage.plan, unit) });
      return a(withStage(state, { ...state.stage, kind: "await_realization_unit" }), o.agentTurn(sent));
    }
    case "await_realization_unit": {
      const error = turnError(incoming, "Deck realization", state.stage.builder);
      if (error) return failed(ctx, "Deck realization failed. Build panes remain open.", error);
      try {
        assertExpectedFile(state.repositoryPath, state.paths.htmlPath, "walkthrough deck");
        return i(withStage(state, { ...state.stage, kind: "send_realization_unit", unitIndex: state.stage.unitIndex + 1 }));
      } catch (error2) {
        return failed(ctx, "The walkthrough deck is missing after realization. Build panes remain open.", errorText2(error2));
      }
    }
    case "send_final_assembly": {
      await ctx.setUiFeedback({ phase: "Assembling the unified walkthrough deck" });
      const sent = await ctx.sendAgentPrompt({ agentSessionId: state.stage.builder.agentSessionId, prompt: finalAssemblyPrompt(input) });
      return a(withStage(state, { ...state.stage, kind: "await_final_assembly" }), o.agentTurn(sent));
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
        const review = readDeckReviewArtifact(state.repositoryPath, state.paths, state.stage.round);
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
          if (state.stage.round >= MAX_REVIEW_ROUNDS) return failed(ctx, "The deck still needs revision after three reviews. Presentation panes remain open.", `Review limit reached at ${deckReviewPath(state.paths, state.stage.round)}.`);
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
      const round = reviewRound(state.stage.round, state.stage.review);
      const review = reviewArtifactText(state.stage.review);
      const sent = await ctx.sendAgentPrompt({ agentSessionId: state.stage.architect.agentSessionId, prompt: architectRevisionPrompt(input, round, review) });
      return a(withStage(state, { ...state.stage, kind: "await_architect_revision" }), o.agentTurn(sent));
    }
    case "await_architect_revision": {
      const error = turnError(incoming, "Architect revision", state.stage.architect);
      if (error) return failed(ctx, "Deck architecture revision failed. Presentation panes remain open.", error);
      try {
        const response = await latestCompleteTurn(ctx, state.stage.architect, "architect");
        const plan = readDeckPlan(state.repositoryPath, state.paths, state.stage.curriculum);
        return i(withStage(state, { ...state.stage, kind: "send_builder_revision", plan, review: reviewArtifactText(state.stage.review), architectResponse: response, round: reviewRound(state.stage.round, state.stage.review) }));
      } catch (error2) {
        return failed(ctx, "The architect revision could not be handed off. Presentation panes remain open.", errorText2(error2));
      }
    }
    case "send_builder_revision": {
      const round = reviewRound(state.stage.round, state.stage.review);
      const review = reviewArtifactText(state.stage.review);
      const sent = await ctx.sendAgentPrompt({ agentSessionId: state.stage.builder.agentSessionId, prompt: builderRevisionPrompt(input, round, review, state.stage.architectResponse) });
      return a(withStage(state, { ...state.stage, kind: "await_builder_revision" }), o.agentTurn(sent));
    }
    case "await_builder_revision": {
      const error = turnError(incoming, "Builder revision", state.stage.builder);
      if (error) return failed(ctx, "Deck build revision failed. Presentation panes remain open.", error);
      try {
        const response = await latestCompleteTurn(ctx, state.stage.builder, "builder");
        assertExpectedFile(state.repositoryPath, state.paths.htmlPath, "walkthrough deck");
        const round = reviewRound(state.stage.round, state.stage.review);
        return i(withStage(state, { kind: "send_reverification", curriculum: state.stage.curriculum, plan: state.stage.plan, architect: state.stage.architect, builder: state.stage.builder, verifier: state.stage.verifier, round: round + 1, previousReview: reviewArtifactText(state.stage.review), architectResponse: state.stage.architectResponse, builderResponse: response }));
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
      return l({ outcome: "presentation-review-completed", curriculumPath: state.paths.curriculumPath, deckPlanPath: state.paths.deckPlanPath, presentationPath: state.paths.htmlPath, slideCount: state.stage.plan.slides.length });
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
function readDeckReviewArtifact(repositoryPath, paths, round) {
  const markdownPath = deckReviewPath(paths, round);
  if (artifactFileExists(repositoryPath, markdownPath)) return readArtifactText(repositoryPath, markdownPath);
  const legacyPath = legacyDeckReviewPath(paths, round);
  if (artifactFileExists(repositoryPath, legacyPath)) return readArtifactText(repositoryPath, legacyPath);
  assertExpectedFile(repositoryPath, markdownPath, "deck review");
  return "";
}
async function latestCompleteTurn(ctx, agent, label) {
  const history = await ctx.getConversationHistory(agent.agentSessionId);
  const text = latestAssistantTurnText(history);
  if (!text) throw new Error(`${label} session ${agent.agentSessionId} has no complete assistant turn to hand off.`);
  return text;
}
function reviewArtifactText(review) {
  return typeof review === "string" ? review : JSON.stringify(review, null, 2);
}
function reviewRound(round, review) {
  return round ?? (typeof review === "string" ? 1 : review.round);
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
  throw new Error(`Unsupported v2 workflow stage: ${String(value)}`);
}

// src/index.ts
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
        key: "deliveryMode",
        label: "Delivery mode",
        options: [
          { value: "presentation-first", label: "Presentation first" },
          { value: "guided-tutorial", label: "Guided tutorial" }
        ],
        default: "presentation-first"
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
      paths: walkthroughV2Paths(parsed.reviewDirectory),
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
    if (state.stateVersion === 2) return stepV2(ctx, state, incoming);
    const promptInput2 = sharedPromptInput(state);
    switch (state.stage.kind) {
      case "start_topic_discovery": {
        ensurePreparationDirectories(state);
        await ctx.setUiFeedback({ phase: "Discovering walkthrough topics" });
        const agents = await launchArtifactAgents(
          ctx,
          preparer,
          (kind) => topicDiscoveryPrompt(promptInput2, kind)
        );
        await logVisibleLaunches(ctx, "topic discovery", agents);
        return a(
          withStage2(state, { kind: "await_topic_discovery_turn", agents, agentIndex: 0 }),
          o.agentTurn(visibleAgentAt(agents, 0, "topic discovery"))
        );
      }
      case "await_topic_discovery_turn": {
        const current = visibleAgentAt(
          state.stage.agents,
          state.stage.agentIndex,
          "topic discovery"
        );
        const error = visibleTurnError(incoming, "Topic discovery", current);
        if (error) {
          return failWorkflow(
            ctx,
            "Walkthrough topic discovery failed. Preparation panes remain open for inspection.",
            error
          );
        }
        const nextIndex = state.stage.agentIndex + 1;
        if (nextIndex < state.stage.agents.length) {
          return a(
            withStage2(state, {
              kind: "await_topic_discovery_turn",
              agents: state.stage.agents,
              agentIndex: nextIndex
            }),
            o.agentTurn(visibleAgentAt(state.stage.agents, nextIndex, "topic discovery"))
          );
        }
        try {
          readTopicInventories(state.repositoryPath, state.sources, state.review);
          await closePreparationPanes(ctx, "topic discovery", state.stage.agents);
          return i(withStage2(state, { kind: "start_curriculum_integration" }));
        } catch (error2) {
          return failWorkflow(
            ctx,
            "Walkthrough topic inventories are invalid. Preparation panes remain open for inspection.",
            `Topic inventory validation failed; preparation panes were preserved: ${errorText3(error2)}`
          );
        }
      }
      case "await_topic_discovery": {
        const error = headlessResultError(incoming, state.stage.opIds, "Topic discovery");
        if (error) return failWorkflow(ctx, "Walkthrough topic discovery failed", error);
        try {
          readTopicInventories(state.repositoryPath, state.sources, state.review);
          return i(withStage2(state, { kind: "start_curriculum_integration" }));
        } catch (error2) {
          return failWorkflow(
            ctx,
            "Walkthrough topic inventories are invalid",
            `Topic inventory validation failed: ${errorText3(error2)}`
          );
        }
      }
      case "start_curriculum_integration": {
        await ctx.setUiFeedback({ phase: "Sequencing the story walkthrough" });
        const spawned = await ctx.spawnAgentSession({
          ...preparer,
          prompt: curriculumIntegrationPrompt(promptInput2)
        });
        const agent = visibleAgentFromSpawn(spawned);
        await logVisibleLaunches(ctx, "curriculum integration", [agent]);
        return a(
          withStage2(state, { kind: "await_curriculum_integration_turn", agent }),
          o.agentTurn(agent)
        );
      }
      case "await_curriculum_integration_turn": {
        const error = visibleTurnError(incoming, "Curriculum integration", state.stage.agent);
        if (error) {
          return failWorkflow(
            ctx,
            "Walkthrough sequencing failed. The preparation pane remains open for inspection.",
            error
          );
        }
        try {
          const inventories = readTopicInventories(state.repositoryPath, state.sources, state.review);
          const curriculum = readCurriculum(
            state.repositoryPath,
            state.sources,
            state.review,
            inventories
          );
          await closePreparationPanes(ctx, "curriculum integration", [state.stage.agent]);
          return i(withStage2(state, { kind: "start_presentation_design", curriculum }));
        } catch (error2) {
          return failWorkflow(
            ctx,
            "The walkthrough manifest is invalid. The preparation pane remains open for inspection.",
            `Walkthrough manifest validation failed; preparation pane was preserved: ${errorText3(error2)}`
          );
        }
      }
      case "await_curriculum_integration": {
        const error = headlessResultError(incoming, state.stage.opIds, "Curriculum integration");
        if (error) return failWorkflow(ctx, "Walkthrough sequencing failed", error);
        try {
          const inventories = readTopicInventories(state.repositoryPath, state.sources, state.review);
          const curriculum = readCurriculum(
            state.repositoryPath,
            state.sources,
            state.review,
            inventories
          );
          return i(withStage2(state, { kind: "start_presentation_design", curriculum }));
        } catch (error2) {
          return failWorkflow(
            ctx,
            "The walkthrough manifest is invalid",
            `Walkthrough manifest validation failed: ${errorText3(error2)}`
          );
        }
      }
      case "start_presentation_design": {
        await ctx.setUiFeedback({ phase: "Designing walkthrough presentations" });
        const agents = await launchArtifactAgents(
          ctx,
          preparer,
          (kind) => presentationDesignPrompt(promptInput2, kind)
        );
        await logVisibleLaunches(ctx, "presentation design", agents);
        return a(
          withStage2(state, {
            kind: "await_presentation_design_turn",
            curriculum: state.stage.curriculum,
            agents,
            agentIndex: 0
          }),
          o.agentTurn(visibleAgentAt(agents, 0, "presentation design"))
        );
      }
      case "await_presentation_design_turn": {
        const current = visibleAgentAt(
          state.stage.agents,
          state.stage.agentIndex,
          "presentation design"
        );
        const error = visibleTurnError(incoming, "Presentation design", current);
        if (error) {
          return failWorkflow(
            ctx,
            "Walkthrough presentation design failed. Preparation panes remain open for inspection.",
            error
          );
        }
        const nextIndex = state.stage.agentIndex + 1;
        if (nextIndex < state.stage.agents.length) {
          return a(
            withStage2(state, {
              kind: "await_presentation_design_turn",
              curriculum: state.stage.curriculum,
              agents: state.stage.agents,
              agentIndex: nextIndex
            }),
            o.agentTurn(visibleAgentAt(state.stage.agents, nextIndex, "presentation design"))
          );
        }
        try {
          validatePresentationSpecifications(
            state.repositoryPath,
            state.review,
            state.stage.curriculum
          );
          await closePreparationPanes(ctx, "presentation design", state.stage.agents);
          return i(
            withStage2(state, {
              kind: "start_html_realization",
              curriculum: state.stage.curriculum
            })
          );
        } catch (error2) {
          return failWorkflow(
            ctx,
            "Walkthrough presentation specifications are invalid. Preparation panes remain open for inspection.",
            `Presentation specification validation failed; preparation panes were preserved: ${errorText3(error2)}`
          );
        }
      }
      case "await_presentation_design": {
        const error = headlessResultError(incoming, state.stage.opIds, "Presentation design");
        if (error) return failWorkflow(ctx, "Walkthrough presentation design failed", error);
        try {
          validatePresentationSpecifications(
            state.repositoryPath,
            state.review,
            state.stage.curriculum
          );
          return i(
            withStage2(state, {
              kind: "start_html_realization",
              curriculum: state.stage.curriculum
            })
          );
        } catch (error2) {
          return failWorkflow(
            ctx,
            "Walkthrough presentation specifications are invalid",
            `Presentation specification validation failed: ${errorText3(error2)}`
          );
        }
      }
      case "start_html_realization": {
        await ctx.setUiFeedback({ phase: "Rendering walkthrough presentations" });
        const agents = await launchArtifactAgents(
          ctx,
          pageBuilder,
          (kind) => htmlRealizationPrompt(promptInput2, kind)
        );
        await logVisibleLaunches(ctx, "HTML realization", agents);
        return a(
          withStage2(state, {
            kind: "await_html_realization_turn",
            curriculum: state.stage.curriculum,
            agents,
            agentIndex: 0
          }),
          o.agentTurn(visibleAgentAt(agents, 0, "HTML realization"))
        );
      }
      case "await_html_realization_turn": {
        const current = visibleAgentAt(
          state.stage.agents,
          state.stage.agentIndex,
          "HTML realization"
        );
        const error = visibleTurnError(incoming, "HTML realization", current);
        if (error) {
          return failWorkflow(
            ctx,
            "Walkthrough HTML creation failed. Preparation panes remain open for inspection.",
            error
          );
        }
        const nextIndex = state.stage.agentIndex + 1;
        if (nextIndex < state.stage.agents.length) {
          return a(
            withStage2(state, {
              kind: "await_html_realization_turn",
              curriculum: state.stage.curriculum,
              agents: state.stage.agents,
              agentIndex: nextIndex
            }),
            o.agentTurn(visibleAgentAt(state.stage.agents, nextIndex, "HTML realization"))
          );
        }
        try {
          validateHtmlArtifacts(state.repositoryPath, state.review, state.stage.curriculum);
          await closePreparationPanes(ctx, "HTML realization", state.stage.agents);
          return i(
            withStage2(state, { kind: "start_walkthrough", curriculum: state.stage.curriculum })
          );
        } catch (error2) {
          return failWorkflow(
            ctx,
            "Walkthrough HTML artifacts are invalid. Preparation panes remain open for inspection.",
            `HTML artifact validation failed; preparation panes were preserved: ${errorText3(error2)}`
          );
        }
      }
      case "await_html_realization": {
        const error = headlessResultError(incoming, state.stage.opIds, "HTML realization");
        if (error) return failWorkflow(ctx, "Walkthrough HTML creation failed", error);
        try {
          validateHtmlArtifacts(state.repositoryPath, state.review, state.stage.curriculum);
          return i(
            withStage2(state, { kind: "start_walkthrough", curriculum: state.stage.curriculum })
          );
        } catch (error2) {
          return failWorkflow(
            ctx,
            "Walkthrough HTML artifacts are invalid",
            `HTML artifact validation failed: ${errorText3(error2)}`
          );
        }
      }
      case "start_walkthrough": {
        const topic = topicAt(state.stage.curriculum, 0);
        await ctx.setUiFeedback({
          phase: topicPhase(topic.artifact),
          message: `Preparing topic 1 of ${state.stage.curriculum.topics.length}: ${topic.title}.`
        });
        const spawned = await ctx.spawnAgentSession({
          ...guide,
          prompt: liveTopicPrompt({
            ...promptInput2,
            curriculum: state.stage.curriculum,
            topic
          })
        });
        const guideSession = guideFromSpawn(spawned);
        await ctx.log(
          "info",
          `Spawned walkthrough guide in pane ${guideSession.paneId}: harness=${guide.harness}, model=${guide.model}, effort=${guide.effort}, agentSessionId=${guideSession.agentSessionId}.`
        );
        return a(
          withStage2(state, {
            kind: "await_topic_turn",
            curriculum: state.stage.curriculum,
            topicIndex: 0,
            guide: guideSession
          }),
          o.agentTurn(spawned)
        );
      }
      case "await_topic_turn": {
        const error = guideTurnError(
          incoming,
          `Walkthrough topic ${state.stage.topicIndex + 1}`
        );
        if (error) return failWorkflow(ctx, "The walkthrough guide failed", error);
        const topic = topicAt(state.stage.curriculum, state.stage.topicIndex);
        await ctx.setUiFeedback({
          phase: topicPhase(topic.artifact),
          message: `Topic ${state.stage.topicIndex + 1} of ${state.stage.curriculum.topics.length}: ${topic.title}. Continue the Socratic dialogue in the guide pane and press Continue when this checkpoint is complete. Browser support: ${pathFor(state.review.htmlPaths, topic.artifact)}#${topic.browserAnchor}`
        });
        return a(
          withStage2(state, {
            kind: "await_topic_continue",
            curriculum: state.stage.curriculum,
            topicIndex: state.stage.topicIndex,
            guide: state.stage.guide
          }),
          o.userContinue()
        );
      }
      case "await_topic_continue": {
        if (!s.isUserContinue(incoming)) {
          return failWorkflow(
            ctx,
            "The walkthrough could not advance",
            `Topic ${state.stage.topicIndex + 1} wait resumed with an unexpected event.`
          );
        }
        const currentTopic = topicAt(state.stage.curriculum, state.stage.topicIndex);
        const nextIndex = state.stage.topicIndex + 1;
        const nextTopic = state.stage.curriculum.topics[nextIndex];
        if (!nextTopic || nextTopic.artifact !== currentTopic.artifact) {
          return i(
            withStage2(state, {
              kind: "send_phase_comprehension",
              curriculum: state.stage.curriculum,
              artifact: currentTopic.artifact,
              nextTopicIndex: nextTopic ? nextIndex : null,
              guide: state.stage.guide
            })
          );
        }
        return i(
          withStage2(state, {
            kind: "send_topic",
            curriculum: state.stage.curriculum,
            topicIndex: nextIndex,
            guide: state.stage.guide
          })
        );
      }
      case "send_topic": {
        const topic = topicAt(state.stage.curriculum, state.stage.topicIndex);
        await ctx.setUiFeedback({
          phase: topicPhase(topic.artifact),
          message: `Preparing topic ${state.stage.topicIndex + 1} of ${state.stage.curriculum.topics.length}: ${topic.title}.`
        });
        const sent = await ctx.sendAgentPrompt({
          agentSessionId: state.stage.guide.agentSessionId,
          prompt: liveTopicPrompt({
            ...promptInput2,
            curriculum: state.stage.curriculum,
            topic
          })
        });
        return a(
          withStage2(state, {
            kind: "await_topic_turn",
            curriculum: state.stage.curriculum,
            topicIndex: state.stage.topicIndex,
            guide: state.stage.guide
          }),
          o.agentTurn(sent)
        );
      }
      case "send_phase_comprehension": {
        await ctx.setUiFeedback({
          phase: comprehensionPhase(state.stage.artifact),
          message: `Preparing the ${artifactLabel(state.stage.artifact)} comprehension dialogue.`
        });
        const sent = await ctx.sendAgentPrompt({
          agentSessionId: state.stage.guide.agentSessionId,
          prompt: phaseComprehensionPrompt({
            ...promptInput2,
            artifact: state.stage.artifact,
            curriculum: state.stage.curriculum
          })
        });
        return a(
          withStage2(state, {
            kind: "await_phase_comprehension_turn",
            curriculum: state.stage.curriculum,
            artifact: state.stage.artifact,
            nextTopicIndex: state.stage.nextTopicIndex,
            guide: state.stage.guide
          }),
          o.agentTurn(sent)
        );
      }
      case "await_phase_comprehension_turn": {
        const error = guideTurnError(
          incoming,
          `${artifactLabel(state.stage.artifact)} comprehension dialogue`
        );
        if (error) return failWorkflow(ctx, "The walkthrough guide failed", error);
        await ctx.setUiFeedback({
          phase: comprehensionPhase(state.stage.artifact),
          message: `Review the completed ${artifactLabel(state.stage.artifact)} phase in the guide pane and press Continue when you are satisfied with your understanding.`
        });
        return a(
          withStage2(state, {
            kind: "await_phase_comprehension_continue",
            curriculum: state.stage.curriculum,
            artifact: state.stage.artifact,
            nextTopicIndex: state.stage.nextTopicIndex,
            guide: state.stage.guide
          }),
          o.userContinue()
        );
      }
      case "await_phase_comprehension_continue": {
        if (!s.isUserContinue(incoming)) {
          return failWorkflow(
            ctx,
            "The walkthrough could not advance",
            `${artifactLabel(state.stage.artifact)} comprehension wait resumed with an unexpected event.`
          );
        }
        if (state.stage.nextTopicIndex === null) {
          return finishWalkthrough(ctx, state, state.stage.curriculum, state.stage.guide);
        }
        return i(
          withStage2(state, {
            kind: "send_topic",
            curriculum: state.stage.curriculum,
            topicIndex: state.stage.nextTopicIndex,
            guide: state.stage.guide
          })
        );
      }
      default:
        return assertNever2(state.stage);
    }
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
    deliveryMode: parseEnum(variables.deliveryMode, "deliveryMode", deliveryModes, "presentation-first")
  };
}
function ensurePreparationDirectories(state) {
  for (const path of [
    state.review.reviewDirectory,
    `${state.review.reviewDirectory}/.walkthrough/inventories`,
    `${state.review.reviewDirectory}/.walkthrough/presentations`
  ]) {
    mkdirSync2(resolve3(state.repositoryPath, path), { recursive: true });
  }
}
async function launchArtifactAgents(ctx, profile, prompt) {
  const agents = [];
  for (const descriptor of artifactDescriptors) {
    agents.push(
      visibleAgentFromSpawn(
        await ctx.spawnAgentSession({
          ...profile,
          prompt: prompt(descriptor.kind)
        })
      )
    );
  }
  return agents;
}
function headlessResultError(incoming, expectedOpIds, label) {
  const results = s.getHeadlessAgentResults(incoming);
  if (!results) return `${label} wait resumed with a non-headless event.`;
  if (results.length !== expectedOpIds.length) {
    return `${label} expected ${expectedOpIds.length} results, received ${results.length}.`;
  }
  for (const expectedOpId of expectedOpIds) {
    const result = results.find((candidate) => candidate.opId === expectedOpId);
    if (!result) return `${label} returned no result for operation ${expectedOpId}.`;
    if (result.status !== "completed") {
      return `${label} operation ${expectedOpId} failed: ${result.error ?? "unknown error"}`;
    }
  }
  return null;
}
function guideTurnError(incoming, label) {
  if (s.isAgentTurnFailed(incoming)) {
    return `${label} agent turn failed: ${incoming.reason}`;
  }
  if (!s.isAgentTurnEnded(incoming)) {
    return `${label} wait resumed with an unexpected event.`;
  }
  return null;
}
function visibleTurnError(incoming, label, agent) {
  if (s.isAgentTurnFailed(incoming)) {
    return `${label} agent turn failed in pane ${agent.paneId}: ${incoming.reason}. The preparation panes were preserved for inspection.`;
  }
  if (!s.isAgentTurnEnded(incoming)) {
    return `${label} wait for pane ${agent.paneId} resumed with an unexpected event. The preparation panes were preserved for inspection.`;
  }
  return null;
}
async function finishWalkthrough(ctx, state, curriculum, guideSession) {
  await ctx.closePane(guideSession.paneId);
  await ctx.setUiFeedback({
    phase: "Story walkthrough complete",
    message: `Completed ${curriculum.topics.length} walkthrough topics.`
  });
  await ctx.log(
    "info",
    `Completed ${curriculum.topics.length} walkthrough topics and closed guide pane ${guideSession.paneId}.`
  );
  return l({
    outcome: "story-walkthrough-completed",
    reviewDirectory: state.review.reviewDirectory,
    manifestPath: state.review.manifestPath,
    completedTopicCount: curriculum.topics.length,
    artifacts: state.review.htmlPaths
  });
}
function topicAt(curriculum, index) {
  const topic = curriculum.topics[index];
  if (!topic) throw new Error(`Walkthrough curriculum has no topic at index ${index}.`);
  return topic;
}
function topicPhase(kind) {
  switch (kind) {
    case "current-state":
      return "Walking through current state";
    case "architecture":
      return "Walking through architecture";
    case "program-design":
      return "Walking through program design";
  }
}
function comprehensionPhase(kind) {
  return `Reviewing ${artifactLabel(kind)} comprehension`;
}
function artifactLabel(kind) {
  switch (kind) {
    case "current-state":
      return "current state";
    case "architecture":
      return "architecture";
    case "program-design":
      return "program design";
  }
}
function sharedPromptInput(state) {
  return {
    repositoryPath: state.repositoryPath,
    story: state.story,
    sources: state.sources,
    review: state.review
  };
}
async function logVisibleLaunches(ctx, label, agents) {
  await ctx.log(
    "info",
    `Started visible ${label} agents in panes ${agents.map((agent) => agent.paneId).join(", ")}.`
  );
}
async function closePreparationPanes(ctx, label, agents) {
  for (const agent of agents) await ctx.closePane(agent.paneId);
  await ctx.log(
    "info",
    `Validated ${label} artifacts and closed panes ${agents.map((agent) => agent.paneId).join(", ")}.`
  );
}
async function failWorkflow(ctx, userMessage, diagnostic) {
  await ctx.setUiFeedback({
    kind: "error",
    phase: "Story walkthrough failed",
    message: userMessage
  });
  await ctx.log("error", diagnostic);
  return u(diagnostic);
}
function guideFromSpawn(input) {
  return { agentSessionId: input.agentSessionId, paneId: input.paneId };
}
function visibleAgentFromSpawn(input) {
  return {
    agentSessionId: input.agentSessionId,
    paneId: input.paneId,
    sentAt: input.sentAt
  };
}
function visibleAgentAt(agents, index, label) {
  const agent = agents[index];
  if (!agent) throw new Error(`${label} has no visible agent at index ${index}.`);
  return agent;
}
function withStage2(state, stage) {
  return { ...state, stage };
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
function errorText3(value) {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
function assertNever2(value) {
  throw new Error(`Unsupported workflow value: ${String(value)}`);
}
export {
  index_default as default
};
