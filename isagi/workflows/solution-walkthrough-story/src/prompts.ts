import {
  artifactDescriptors,
  descriptorFor,
  pathFor,
  type ArtifactKind,
  type ArtifactPaths,
  type Curriculum,
  type ReviewPaths,
  type WalkthroughTopic,
} from "./types.js";

export const PREPARATION_FOOTER =
  "Work unattended and finish the requested file in this turn. Do not run tasks or shell commands in the background, but you may run them in the foreground.";

type SharedInput = {
  readonly repositoryPath: string;
  readonly story: string;
  readonly sources: ArtifactPaths;
  readonly review: ReviewPaths;
};

export function topicDiscoveryPrompt(
  input: SharedInput,
  kind: ArtifactKind,
): string {
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

export function curriculumIntegrationPrompt(input: SharedInput): string {
  const inventoryList = artifactDescriptors
    .map(
      (descriptor) =>
        `${descriptor.label}: ${pathFor(input.review.inventoryPaths, descriptor.kind)}`,
    )
    .join("\n");
  const sourceList = artifactDescriptors
    .map(
      (descriptor) =>
        `${descriptor.label}: ${pathFor(input.sources, descriptor.kind)}`,
    )
    .join("\n");
  const artifactObject = Object.fromEntries(
    artifactDescriptors.map((descriptor) => [
      descriptor.kind,
      {
        sourcePath: pathFor(input.sources, descriptor.kind),
        presentationPath: pathFor(input.review.htmlPaths, descriptor.kind),
      },
    ]),
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

export function presentationDesignPrompt(
  input: SharedInput,
  kind: ArtifactKind,
): string {
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

export function htmlRealizationPrompt(
  input: SharedInput,
  kind: ArtifactKind,
): string {
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

export function liveTopicPrompt(
  input: SharedInput & {
    readonly curriculum: Curriculum;
    readonly topic: WalkthroughTopic;
  },
): string {
  const descriptor = descriptorFor(input.topic.artifact);
  const sourcePath = pathFor(input.sources, input.topic.artifact);
  const presentationPath = pathFor(
    input.review.htmlPaths,
    input.topic.artifact,
  );
  const prerequisiteContext = input.topic.prerequisiteTopicIds
    .map((prerequisiteId) => {
      const prerequisite = input.curriculum.topics.find(
        (topic) => topic.id === prerequisiteId,
      );
      if (!prerequisite) {
        throw new Error(
          `Walkthrough topic ${input.topic.id} references missing prerequisite ${prerequisiteId}.`,
        );
      }
      return `- ${prerequisite.title}: ${prerequisite.learningObjective}`;
    })
    .join("\n");
  const sourceReferences = input.topic.sourceReferences
    .map((reference) => `- ${reference.heading}: ${reference.locator}`)
    .join("\n");
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

export function phaseComprehensionPrompt(
  input: SharedInput & {
    readonly artifact: ArtifactKind;
    readonly curriculum: Curriculum;
  },
): string {
  const descriptor = descriptorFor(input.artifact);
  const sourcePath = pathFor(input.sources, input.artifact);
  const presentationPath = pathFor(input.review.htmlPaths, input.artifact);
  const topics = input.curriculum.topics.filter(
    (topic) => topic.artifact === input.artifact,
  );
  const taughtTopics = topics
    .map(
      (topic) =>
        `- ${topic.title}: ${topic.learningObjective}`,
    )
    .join("\n");
  const comprehensionPriorities = topics
    .filter((topic) => topic.critical)
    .map(
      (topic) =>
        `- ${topic.title}: ${topic.comprehensionObjective ?? topic.learningObjective}`,
    )
    .join("\n");

  return `Guide the user through the phase-level comprehension dialogue for the interactive story walkthrough.

Story: ${input.story}
Repository: ${input.repositoryPath}
Completed artifact phase: ${input.artifact} — ${descriptor.label}
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

function navigationRequirement(kind: ArtifactKind): string {
  switch (kind) {
    case "current-state":
      return "link to ./architecture.html.";
    case "architecture":
      return "link to ./current-state.html and ./program-design.html.";
    case "program-design":
      return "link to ./current-state.html and ./architecture.html.";
  }
}

function withPreparationFooter(body: string): string {
  return `${body}\n\n${PREPARATION_FOOTER}`;
}
