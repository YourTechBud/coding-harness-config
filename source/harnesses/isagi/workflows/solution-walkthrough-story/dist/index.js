// src/index.ts
import { mkdirSync } from "node:fs";
import { resolve as resolve2 } from "node:path";

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

// src/contracts.ts
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

// src/types.ts
var artifactKinds = ["current-state", "architecture", "program-design"];
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
function assertExpectedFile(repositoryPath, artifactPath, label) {
  const absolutePath = resolve(repositoryPath, artifactPath);
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    throw new Error(`Expected ${label} file ${artifactPath} was not created.`);
  }
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
function reviewPaths(reviewDirectory) {
  const walkthroughDirectory = `${reviewDirectory}/.walkthrough`;
  return {
    reviewDirectory,
    inventoryPaths: {
      currentStatePath: `${walkthroughDirectory}/inventories/current-state.json`,
      architecturePath: `${walkthroughDirectory}/inventories/architecture.json`,
      programDesignPath: `${walkthroughDirectory}/inventories/program-design.json`
    },
    manifestPath: `${walkthroughDirectory}/manifest.json`,
    presentationPaths: {
      currentStatePath: `${walkthroughDirectory}/presentations/current-state.md`,
      architecturePath: `${walkthroughDirectory}/presentations/architecture.md`,
      programDesignPath: `${walkthroughDirectory}/presentations/program-design.md`
    },
    htmlPaths: {
      currentStatePath: `${reviewDirectory}/current-state.html`,
      architecturePath: `${reviewDirectory}/architecture.html`,
      programDesignPath: `${reviewDirectory}/program-design.html`
    },
    defaultFeedbackPath: `${reviewDirectory}/feedback.md`
  };
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
      { kind: "text", key: "reviewDirectory", label: "Walkthrough output directory", default: "scratch/story/walkthrough" }
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
      review: reviewPaths(parsed.reviewDirectory),
      stage: { kind: "start_topic_discovery" }
    };
  },
  step: async (ctx, state, incoming) => {
    await ctx.log("debug", `Walk through story stage=${state.stage.kind}.`);
    const promptInput = sharedPromptInput(state);
    switch (state.stage.kind) {
      case "start_topic_discovery": {
        ensurePreparationDirectories(state);
        await ctx.setUiFeedback({ phase: "Discovering walkthrough topics" });
        const agents = await launchArtifactAgents(
          ctx,
          preparer,
          (kind) => topicDiscoveryPrompt(promptInput, kind)
        );
        await logVisibleLaunches(ctx, "topic discovery", agents);
        return a(
          withStage(state, { kind: "await_topic_discovery_turn", agents, agentIndex: 0 }),
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
            withStage(state, {
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
          return i(withStage(state, { kind: "start_curriculum_integration" }));
        } catch (error2) {
          return failWorkflow(
            ctx,
            "Walkthrough topic inventories are invalid. Preparation panes remain open for inspection.",
            `Topic inventory validation failed; preparation panes were preserved: ${errorText2(error2)}`
          );
        }
      }
      case "await_topic_discovery": {
        const error = headlessResultError(incoming, state.stage.opIds, "Topic discovery");
        if (error) return failWorkflow(ctx, "Walkthrough topic discovery failed", error);
        try {
          readTopicInventories(state.repositoryPath, state.sources, state.review);
          return i(withStage(state, { kind: "start_curriculum_integration" }));
        } catch (error2) {
          return failWorkflow(
            ctx,
            "Walkthrough topic inventories are invalid",
            `Topic inventory validation failed: ${errorText2(error2)}`
          );
        }
      }
      case "start_curriculum_integration": {
        await ctx.setUiFeedback({ phase: "Sequencing the story walkthrough" });
        const spawned = await ctx.spawnAgentSession({
          ...preparer,
          prompt: curriculumIntegrationPrompt(promptInput)
        });
        const agent = visibleAgentFromSpawn(spawned);
        await logVisibleLaunches(ctx, "curriculum integration", [agent]);
        return a(
          withStage(state, { kind: "await_curriculum_integration_turn", agent }),
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
          return i(withStage(state, { kind: "start_presentation_design", curriculum }));
        } catch (error2) {
          return failWorkflow(
            ctx,
            "The walkthrough manifest is invalid. The preparation pane remains open for inspection.",
            `Walkthrough manifest validation failed; preparation pane was preserved: ${errorText2(error2)}`
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
          return i(withStage(state, { kind: "start_presentation_design", curriculum }));
        } catch (error2) {
          return failWorkflow(
            ctx,
            "The walkthrough manifest is invalid",
            `Walkthrough manifest validation failed: ${errorText2(error2)}`
          );
        }
      }
      case "start_presentation_design": {
        await ctx.setUiFeedback({ phase: "Designing walkthrough presentations" });
        const agents = await launchArtifactAgents(
          ctx,
          preparer,
          (kind) => presentationDesignPrompt(promptInput, kind)
        );
        await logVisibleLaunches(ctx, "presentation design", agents);
        return a(
          withStage(state, {
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
            withStage(state, {
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
            withStage(state, {
              kind: "start_html_realization",
              curriculum: state.stage.curriculum
            })
          );
        } catch (error2) {
          return failWorkflow(
            ctx,
            "Walkthrough presentation specifications are invalid. Preparation panes remain open for inspection.",
            `Presentation specification validation failed; preparation panes were preserved: ${errorText2(error2)}`
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
            withStage(state, {
              kind: "start_html_realization",
              curriculum: state.stage.curriculum
            })
          );
        } catch (error2) {
          return failWorkflow(
            ctx,
            "Walkthrough presentation specifications are invalid",
            `Presentation specification validation failed: ${errorText2(error2)}`
          );
        }
      }
      case "start_html_realization": {
        await ctx.setUiFeedback({ phase: "Rendering walkthrough presentations" });
        const agents = await launchArtifactAgents(
          ctx,
          pageBuilder,
          (kind) => htmlRealizationPrompt(promptInput, kind)
        );
        await logVisibleLaunches(ctx, "HTML realization", agents);
        return a(
          withStage(state, {
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
            withStage(state, {
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
            withStage(state, { kind: "start_walkthrough", curriculum: state.stage.curriculum })
          );
        } catch (error2) {
          return failWorkflow(
            ctx,
            "Walkthrough HTML artifacts are invalid. Preparation panes remain open for inspection.",
            `HTML artifact validation failed; preparation panes were preserved: ${errorText2(error2)}`
          );
        }
      }
      case "await_html_realization": {
        const error = headlessResultError(incoming, state.stage.opIds, "HTML realization");
        if (error) return failWorkflow(ctx, "Walkthrough HTML creation failed", error);
        try {
          validateHtmlArtifacts(state.repositoryPath, state.review, state.stage.curriculum);
          return i(
            withStage(state, { kind: "start_walkthrough", curriculum: state.stage.curriculum })
          );
        } catch (error2) {
          return failWorkflow(
            ctx,
            "Walkthrough HTML artifacts are invalid",
            `HTML artifact validation failed: ${errorText2(error2)}`
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
            ...promptInput,
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
          withStage(state, {
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
          withStage(state, {
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
            withStage(state, {
              kind: "send_phase_comprehension",
              curriculum: state.stage.curriculum,
              artifact: currentTopic.artifact,
              nextTopicIndex: nextTopic ? nextIndex : null,
              guide: state.stage.guide
            })
          );
        }
        return i(
          withStage(state, {
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
            ...promptInput,
            curriculum: state.stage.curriculum,
            topic
          })
        });
        return a(
          withStage(state, {
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
            ...promptInput,
            artifact: state.stage.artifact,
            curriculum: state.stage.curriculum
          })
        });
        return a(
          withStage(state, {
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
          withStage(state, {
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
          withStage(state, {
            kind: "send_topic",
            curriculum: state.stage.curriculum,
            topicIndex: state.stage.nextTopicIndex,
            guide: state.stage.guide
          })
        );
      }
      default:
        return assertNever(state.stage);
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
    reviewDirectory: parsePath(variables.reviewDirectory, "reviewDirectory", "scratch/story/walkthrough")
  };
}
function ensurePreparationDirectories(state) {
  for (const path of [
    state.review.reviewDirectory,
    `${state.review.reviewDirectory}/.walkthrough/inventories`,
    `${state.review.reviewDirectory}/.walkthrough/presentations`
  ]) {
    mkdirSync(resolve2(state.repositoryPath, path), { recursive: true });
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
function withStage(state, stage) {
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
function errorText2(value) {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
function assertNever(value) {
  throw new Error(`Unsupported workflow value: ${String(value)}`);
}
export {
  index_default as default
};
