import {
  artifactDescriptors,
  pathFor,
  type AudienceProfile,
  type ArtifactKind,
  type ArtifactPaths,
  type Curriculum,
  type CurriculumBeat,
  type CurriculumChapter,
  type DeckPlan,
  type RealizationUnit,
  type WalkthroughPaths,
} from "./types.js";
import { deckReviewPath } from "./paths.js";

export const PREPARATION_FOOTER =
  "Work unattended and finish the requested file in this turn. Do not run tasks or shell commands in the background, but you may run them in the foreground.";

function withPreparationFooter(body: string): string {
  return `${body}\n\n${PREPARATION_FOOTER}`;
}

// Workflow prompts
export type PromptInput = {
  readonly repositoryPath: string;
  readonly story: string;
  readonly sources: ArtifactPaths;
  readonly paths: WalkthroughPaths;
  readonly audienceProfile: AudienceProfile;
};

export const PLAIN_LANGUAGE_STANDARD = `Use plain language at every technical depth. Technical depth controls which facts and representations belong, not how difficult the sentences sound. Lead with concrete behavior, consequence, or user impact, then introduce a technical term when it adds precision. Define unfamiliar repository terms in the same context before relying on them. Write with clear verbs and complete sentences. Replace noun stacks, compressed slogans, arrow-chain shorthand, and invented labels with direct explanations. Keep exact identifiers in code, diagrams, or supporting labels when the audience needs them. Prefer clarity over brevity, and omit detail that does not change the reader's understanding. When the material needs more room, split it across slides or use progressive disclosure instead of compressing the prose.`;

export function sourceInventoryPrompt(input: PromptInput, kind: ArtifactKind): string {
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

export function curriculumPrompt(input: PromptInput): string {
  const inventories = artifactDescriptors.map(({ kind }) => `${kind}: ${pathFor(input.paths.inventoryPaths, kind)}`).join('\n');
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

export function deckArchitecturePrompt(input: PromptInput): string {
  return withPreparationFooter(`Architect one standalone slide presentation from the finalized curriculum.

Story: ${input.story}
Curriculum: ${input.paths.curriculumPath}
Output deck: ${input.paths.htmlPath}
Output plan: ${input.paths.deckPlanPath}

Design a unified deck that can be understood without an agent. It must feel like slides rather than a scrolling document: each frame has a clear purpose, concise briefing prose, and the smallest representation that makes its relationship understandable. Preserve the curriculum's narrative and content obligations. Decide the number of slides creatively; a beat may use one or several slides, and a slide may combine closely connected beats from the same chapter.

Writing standard:
${PLAIN_LANGUAGE_STANDARD}

Use the Show Me skill to choose representations that carry real explanatory work. ${representationGuidance(input.audienceProfile.technicalDepth)} Keep each representation focused on the slide's comprehension objective and place it beside the short explanation it supports. When prose is clearer than a visual, use prose.

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

export function deckShellPrompt(input: PromptInput): string {
  return withPreparationFooter(`Create the reusable shell for the planned standalone slide deck.

Curriculum: ${input.paths.curriculumPath}
Deck plan: ${input.paths.deckPlanPath}
Output: ${input.paths.htmlPath}

Create one self-contained HTML file with embedded CSS and JavaScript. Establish a polished, responsive, viewport-based slide experience with keyboard and visible previous/next navigation, progress, accessible semantics, and printable fallback. Include the literal markers data-walkthrough-deck, data-slide-viewport, and data-slide-navigation. Do not realize planned content slides yet; leave a clear insertion area for later turns. This is a presentation, not a vertically scrolling document.

Write only ${input.paths.htmlPath}.`);
}

export function realizationUnitPrompt(input: PromptInput, plan: DeckPlan, unit: RealizationUnit): string {
  const slides = plan.slides.filter((slide) => unit.slideIds.includes(slide.id));
  return withPreparationFooter(`Realize one planned unit in the existing standalone deck.

Curriculum: ${input.paths.curriculumPath}
Deck plan: ${input.paths.deckPlanPath}
Deck: ${input.paths.htmlPath}
Unit: ${unit.id}
Slides: ${JSON.stringify(slides, null, 2)}

Edit the existing HTML and add exactly these slides in their planned order. Each slide is a section carrying data-walkthrough-slide and its exact planned id. Supply enough briefing prose and source-grounded context for the deck to stand alone. Use focused diagrams, code shapes, comparisons, or sequences when the representation intent warrants them. Keep slides scannable and place genuine secondary detail behind accessible progressive disclosure. Preserve the shell and every previously built slide.

Writing standard:
${PLAIN_LANGUAGE_STANDARD}

Use the Show Me skill to realize focused representations that reduce explanation rather than decorate it. ${representationGuidance(input.audienceProfile.technicalDepth)} Make labels and relationships understandable without requiring the reader to decode internal shorthand.

Modify only ${input.paths.htmlPath}.`);
}

export function finalAssemblyPrompt(input: PromptInput): string {
  return withPreparationFooter(`Complete and polish the assembled standalone presentation.

Curriculum: ${input.paths.curriculumPath}
Deck plan: ${input.paths.deckPlanPath}
Deck: ${input.paths.htmlPath}

All realization units are present. Integrate the opening, chapter transitions, ending, navigation state, progress behavior, responsive layout, accessibility, and visual consistency so the file reads as one presentation. Preserve exact planned slide IDs and order. Run a deck-wide editorial pass using this writing standard:

${PLAIN_LANGUAGE_STANDARD}

Remove repeated explanations, keep terminology consistent, and make transitions re-establish enough context for a reader moving at their own pace. Confirm every curriculum obligation is represented, the prose makes sense in isolation, controls work, and the default experience does not become a scrolling page.

Modify only ${input.paths.htmlPath}.`);
}

export function verifierPrompt(
  input: PromptInput,
  round: number,
  previous?: {
    readonly review: string;
    readonly architectResponse?: string | undefined;
    readonly builderResponse: string;
  },
): string {
  const output = deckReviewPath(input.paths, round);
  const previousContext = previous
    ? `
Previous review:
<previous_review>
${previous.review}
</previous_review>

Architect response:
<architect_response>
${previous.architectResponse ?? 'No architect turn was required.'}
</architect_response>

Builder response:
<builder_response>
${previous.builderResponse}
</builder_response>
`
    : '';
  return withPreparationFooter(`Verify the built walkthrough deck against its authoritative inputs.

Round: ${round}
Curriculum: ${input.paths.curriculumPath}
Deck plan: ${input.paths.deckPlanPath}
Deck: ${input.paths.htmlPath}
Output: ${output}
${previousContext}

Inspect the HTML in a browser at ordinary laptop and narrow viewport sizes. Check standalone comprehension, curriculum coverage, narrative continuity, factual grounding, planned slide identity and order, true slide behavior, navigation, progressive disclosure, accessibility, overflow, and visual legibility.

Review the visible copy as an editor using this standard:
${PLAIN_LANGUAGE_STANDARD}

Technical depth never excuses difficult wording. Verify that titles communicate concrete claims, unfamiliar terms are defined before use, sentences remain direct, representations reduce prose, and required detail is distributed without turning slides into compressed documents. Treat readability metrics only as diagnostic signals; base findings on specific copy and the intended audience. A deck can be factually complete and still require revision for unclear language.

This is read-only review: do not edit the curriculum, plan, or deck.

Write a complete standalone Markdown review for this round with these sections:

# Deck Review — Round ${round}

## Review scope
State what you inspected, the viewport and interaction checks you performed, and anything you could not verify.

## Prior finding verification
For round one, state that this is the initial review. On later rounds, account for every prior blocker and concern with a status of Verified, Incomplete, Not addressed, or Withdrawn, followed by current evidence and any remaining required outcome. Verify the files and browser behavior yourself rather than trusting agent summaries.

## Findings
Report every current finding under a heading in the form "### F-NN — [Severity] Short title", where severity is Blocker, Concern, or Suggestion. Keep a finding's stable ID across rounds while it remains relevant. For each finding, include responsibility, affected area, evidence, consequence, required outcome, and how the next review can verify it. Responsibility names one or more of: Deck architecture when the curriculum or plan must change, including overloaded slides, unclear titles, or a narrative that depends on jargon; Deck implementation when the current plan can be realized with clearer copy or representations; or Human decision when only the user can choose the product, narrative, scope, or tradeoff direction. Use "No findings" when there are none. Suggestions are optional and never require another revision round.

## Human decision
Write "No human decision required" unless a genuine user decision is necessary. When one is necessary, state the decision, why agents cannot decide it safely, the available options, and their material tradeoffs.

## Conclusion
State plainly whether required work remains and whether it belongs to deck architecture, deck implementation, both, or the user. A review with no blockers or concerns is complete even when it contains suggestions.

The Markdown must carry the full review evidence; do not emit a JSON verdict or machine-routing fields. Write only ${output}.`);
}

export function architectRevisionPrompt(input: PromptInput, round: number, review: string): string {
  return withPreparationFooter(`Resolve the deck-architecture findings from review round ${round}.

Curriculum: ${input.paths.curriculumPath}
Deck plan: ${input.paths.deckPlanPath}
Review: ${deckReviewPath(input.paths, round)}

<deck_review>
${review}
</deck_review>

Update the deck plan where the review requires architectural changes while preserving the curriculum contract and valid slide and realization-unit accounting. Evaluate every finding on its evidence. In your response, summarize what changed, explain any finding you declined with evidence, and clearly identify any genuine decision that only the user can make.

Keep every revised title, purpose, and content responsibility aligned with this writing standard:
${PLAIN_LANGUAGE_STANDARD}

Modify only ${input.paths.deckPlanPath}.`);
}

export function builderRevisionPrompt(input: PromptInput, round: number, review: string, architectResponse?: string): string {
  const architectureContext = architectResponse
    ? `
Architect response:
<architect_response>
${architectResponse}
</architect_response>
`
    : '';
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

export function guidedBeatPrompt(input: PromptInput, curriculum: Curriculum, chapter: CurriculumChapter, beat: CurriculumBeat): string {
  return `Guide one curriculum beat of the solution walkthrough.

Story: ${curriculum.story.title} — ${curriculum.story.throughline}
Audience contract: ${JSON.stringify(curriculum.audienceContract)}
Chapter: ${chapter.title}
Chapter context: ${chapter.openingContext}
Beat: ${beat.title}
Objective: ${beat.objective}
Narrative bridge: ${beat.narrativeBridge}
Required content: ${beat.requiredContent.join('; ')}
Supporting material: ${beat.supportingMaterial.join('; ') || 'None required'}
Terms: ${beat.termsToIntroduce.map(({ term, meaning }) => `${term}: ${meaning}`).join('; ') || 'None'}
Realization point: ${beat.realizationPoint ?? 'No separate realization point'}
Source references: ${beat.sourceReferences.map(({ heading, locator }) => `${heading}: ${locator}`).join('; ')}

Teach this beat as an adaptive, Socratic tutorial. Establish enough context for this turn to stand alone, explain directly where useful, and use focused questions to help the user form the intended model. Follow the curriculum's language policy, or the plain-language standard below when an older curriculum has no languagePolicy.

${PLAIN_LANGUAGE_STANDARD}

Keep replies brief and use the Show Me skill when a visual representation materially helps. The user controls dialogue inside the agent pane; the workflow Continue control advances to the next curriculum checkpoint. Treat sources as read-only.`;
}

export function guidedChapterReviewPrompt(curriculum: Curriculum, chapter: CurriculumChapter): string {
  const checks = chapter.beats.map((beat) => `- ${beat.title}: ${beat.comprehensionObjective ?? beat.objective}`).join('\n');
  return `Run the Socratic synthesis for the completed ${chapter.title} chapter.

Story throughline: ${curriculum.story.throughline}
Synthesis objective: ${chapter.synthesisObjective}
Completed beats:
${checks}

Ask the user to connect, predict, or apply the important ideas. Let their answers determine brief clarification or reteaching. Stay with this chapter until the workflow Continue control is pressed. Keep replies concise and use the Show Me skill when a focused visual helps.`;
}

export function presentationGuidePrompt(input: PromptInput, curriculum: Curriculum): string {
  return `Support the user's self-paced review of a completed walkthrough presentation.

Story: ${curriculum.story.title} — ${curriculum.story.throughline}
Audience: ${JSON.stringify(curriculum.audienceProfile)}
Curriculum: ${input.paths.curriculumPath}
Deck plan: ${input.paths.deckPlanPath}
Presentation: ${input.paths.htmlPath}
Canonical sources: ${JSON.stringify(input.sources)}

The presentation is the primary standalone experience and the user controls its pace. Answer questions briefly and precisely from the curriculum and canonical sources. Follow the curriculum's language policy, or the plain-language standard below when an older curriculum has no languagePolicy.

${PLAIN_LANGUAGE_STANDARD}

Use the Show Me skill when a focused visual or code-shape explanation helps. If the user says “walk me through it” without naming a slide or starting point, begin at the first curriculum beat and guide all selected material conversationally in this pane; do not rely on the workflow Continue control to advance that chat-driven walkthrough. If they name a slide or ask to start from a point, honor that starting point. The workflow Continue control means they are finished reviewing and want to end this workflow.`;
}

function representationGuidance(depth: AudienceProfile['technicalDepth']): string {
  switch (depth) {
    case 'product':
      return 'Use a user journey, before-and-after comparison, or tradeoff view when it explains the product consequence more clearly than prose.';
    case 'system-design':
      return 'Prefer boundary maps, ownership views, data or control flow, sequences, and state transitions that make system relationships visible.';
    case 'implementation':
      return 'Prefer code-shape sketches, call trees, state transitions, diffs, algorithms, and failure paths that keep exact mechanics connected to their purpose.';
  }
}
