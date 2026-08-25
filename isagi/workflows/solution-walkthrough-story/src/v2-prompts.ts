import { artifactDescriptors, pathFor, type ArtifactKind, type CurriculumBeat, type CurriculumChapter, type CurriculumV2, type DeckPlan, type RealizationUnit, type WalkthroughV2Paths, type ArtifactPaths, type AudienceProfile } from './types.js';
import { deckReviewPath } from './paths.js';
import { PREPARATION_FOOTER } from './prompts.js';

export type V2PromptInput = {
  readonly repositoryPath: string;
  readonly story: string;
  readonly sources: ArtifactPaths;
  readonly paths: WalkthroughV2Paths;
  readonly audienceProfile: AudienceProfile;
};

export function sourceInventoryPrompt(input: V2PromptInput, kind: ArtifactKind): string {
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

export function curriculumPrompt(input: V2PromptInput): string {
  const inventories = artifactDescriptors.map(({ kind }) => `${kind}: ${pathFor(input.paths.inventoryPaths, kind)}`).join('\n');
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

export function deckArchitecturePrompt(input: V2PromptInput): string {
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

export function deckShellPrompt(input: V2PromptInput): string {
  return prepared(`Create the reusable shell for the planned standalone slide deck.

Curriculum: ${input.paths.curriculumPath}
Deck plan: ${input.paths.deckPlanPath}
Output: ${input.paths.htmlPath}

Create one self-contained HTML file with embedded CSS and JavaScript. Establish a polished, responsive, viewport-based slide experience with keyboard and visible previous/next navigation, progress, accessible semantics, and printable fallback. Include the literal markers data-walkthrough-deck, data-slide-viewport, and data-slide-navigation. Do not realize planned content slides yet; leave a clear insertion area for later turns. This is a presentation, not a vertically scrolling document.

Write only ${input.paths.htmlPath}.`);
}

export function realizationUnitPrompt(input: V2PromptInput, plan: DeckPlan, unit: RealizationUnit): string {
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

export function finalAssemblyPrompt(input: V2PromptInput): string {
  return prepared(`Complete and polish the assembled standalone presentation.

Curriculum: ${input.paths.curriculumPath}
Deck plan: ${input.paths.deckPlanPath}
Deck: ${input.paths.htmlPath}

All realization units are present. Integrate the opening, chapter transitions, ending, navigation state, progress behavior, responsive layout, accessibility, and visual consistency so the file reads as one presentation. Preserve exact planned slide IDs and order. Confirm every curriculum obligation is represented, the prose makes sense in isolation, controls work, and the default experience does not become a scrolling page.

Modify only ${input.paths.htmlPath}.`);
}

export function verifierPrompt(
  input: V2PromptInput,
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
  return prepared(`Verify the built walkthrough deck against its authoritative inputs.

Round: ${round}
Curriculum: ${input.paths.curriculumPath}
Deck plan: ${input.paths.deckPlanPath}
Deck: ${input.paths.htmlPath}
Output: ${output}
${previousContext}

Inspect the HTML in a browser at ordinary laptop and narrow viewport sizes. Check standalone comprehension, curriculum coverage, narrative continuity, factual grounding, planned slide identity and order, true slide behavior, navigation, progressive disclosure, accessibility, overflow, and visual legibility. This is read-only review: do not edit the curriculum, plan, or deck.

Write a complete standalone Markdown review for this round with these sections:

# Deck Review — Round ${round}

## Review scope
State what you inspected, the viewport and interaction checks you performed, and anything you could not verify.

## Prior finding verification
For round one, state that this is the initial review. On later rounds, account for every prior blocker and concern with a status of Verified, Incomplete, Not addressed, or Withdrawn, followed by current evidence and any remaining required outcome. Verify the files and browser behavior yourself rather than trusting agent summaries.

## Findings
Report every current finding under a heading in the form "### F-NN — [Severity] Short title", where severity is Blocker, Concern, or Suggestion. Keep a finding's stable ID across rounds while it remains relevant. For each finding, include responsibility, affected area, evidence, consequence, required outcome, and how the next review can verify it. Responsibility names one or more of: Deck architecture when the curriculum or plan must change, Deck implementation when the current plan can be realized differently in HTML, or Human decision when only the user can choose the product, narrative, scope, or tradeoff direction. Use "No findings" when there are none. Suggestions are optional and never require another revision round.

## Human decision
Write "No human decision required" unless a genuine user decision is necessary. When one is necessary, state the decision, why agents cannot decide it safely, the available options, and their material tradeoffs.

## Conclusion
State plainly whether required work remains and whether it belongs to deck architecture, deck implementation, both, or the user. A review with no blockers or concerns is complete even when it contains suggestions.

The Markdown must carry the full review evidence; do not emit a JSON verdict or machine-routing fields. Write only ${output}.`);
}

export function architectRevisionPrompt(input: V2PromptInput, round: number, review: string): string {
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

export function builderRevisionPrompt(input: V2PromptInput, round: number, review: string, architectResponse?: string): string {
  const architectureContext = architectResponse
    ? `
Architect response:
<architect_response>
${architectResponse}
</architect_response>
`
    : '';
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

export function guidedBeatPrompt(input: V2PromptInput, curriculum: CurriculumV2, chapter: CurriculumChapter, beat: CurriculumBeat): string {
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

Teach this beat as an adaptive, Socratic tutorial. Establish enough context for this turn to stand alone, explain directly where useful, and use focused questions to help the user form the intended model. Keep replies brief and use the Show Me skill when a visual representation materially helps. The user controls dialogue inside the agent pane; the workflow Continue control advances to the next curriculum checkpoint. Treat sources as read-only.`;
}

export function guidedChapterReviewPrompt(curriculum: CurriculumV2, chapter: CurriculumChapter): string {
  const checks = chapter.beats.map((beat) => `- ${beat.title}: ${beat.comprehensionObjective ?? beat.objective}`).join('\n');
  return `Run the Socratic synthesis for the completed ${chapter.title} chapter.

Story throughline: ${curriculum.story.throughline}
Synthesis objective: ${chapter.synthesisObjective}
Completed beats:
${checks}

Ask the user to connect, predict, or apply the important ideas. Let their answers determine brief clarification or reteaching. Stay with this chapter until the workflow Continue control is pressed. Keep replies concise and use the Show Me skill when a focused visual helps.`;
}

export function presentationGuidePrompt(input: V2PromptInput, curriculum: CurriculumV2): string {
  return `Support the user's self-paced review of a completed walkthrough presentation.

Story: ${curriculum.story.title} — ${curriculum.story.throughline}
Audience: ${JSON.stringify(curriculum.audienceProfile)}
Curriculum: ${input.paths.curriculumPath}
Deck plan: ${input.paths.deckPlanPath}
Presentation: ${input.paths.htmlPath}
Canonical sources: ${JSON.stringify(input.sources)}

The presentation is the primary standalone experience and the user controls its pace. Answer questions briefly and precisely from the curriculum and canonical sources. Use the Show Me skill when a focused visual or code-shape explanation helps. If the user says “walk me through it” without naming a slide or starting point, begin at the first curriculum beat and guide all selected material conversationally in this pane; do not rely on the workflow Continue control to advance that chat-driven walkthrough. If they name a slide or ask to start from a point, honor that starting point. The workflow Continue control means they are finished reviewing and want to end this workflow.`;
}

function prepared(body: string): string {
  return `${body}\n\n${PREPARATION_FOOTER}`;
}
