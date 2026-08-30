import {
  artifactDescriptors,
  pathFor,
  type AudienceProfile,
  type ArtifactKind,
  type ArtifactPaths,
  type Curriculum,
  type CurriculumBeat,
  type CurriculumChapter,
  type DeckChapter,
  type DeckPlan,
  type NarrativeUnit,
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

export const PLAIN_LANGUAGE_STANDARD = `Use direct, plain language. Lead with behavior or consequence, define unfamiliar terms before use, and keep exact identifiers where they add precision. Omit or merge material that does not change understanding.`;

export const QUICK_GLANCE_STANDARD = `Design for quick-glance forward motion. Each slide has a declarative takeaway, one dominant visual or example, and minimal supporting copy. A reader should grasp the point within seconds and choose whether to open accessible detail. Keep exact changed contracts reviewable, using progressive disclosure when their full shape would crowd the primary view.`;

export function sourceInventoryPrompt(input: PromptInput, kind: ArtifactKind): string {
  const sourcePath = pathFor(input.sources, kind);
  const outputPath = pathFor(input.paths.inventoryPaths, kind);
  return withPreparationFooter(`Analyze one canonical source for reusable walkthrough material.

Story: ${input.story}
Repository: ${input.repositoryPath}
Artifact: ${kind}
Source: ${sourcePath}
Output: ${outputPath}

Create an audience-neutral inventory of distinct mental models, facts, prerequisites, terms, evidence, and useful representations. For program design, also capture every materially changed API, schema, event, query, wire, configuration, module, or state contract with enough exact shape, invariants, compatibility, and migration detail to review it. Contracts belong only in the program-design inventory.

Write exactly one JSON object:
{
  "schemaVersion": 3,
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
  }],
  "contracts": [{
    "contractId": "short-kebab-id",
    "kind": "persistence",
    "name": "Exact contract name",
    "change": "add",
    "exactShape": "Reviewable signature, schema, fields, types, optionality, outputs, and errors",
    "invariants": ["Behavior or constraint that must hold"],
    "compatibilityAndMigration": null,
    "sourceReferences": [{ "heading": "Source heading", "locator": "Retrievable locator" }]
  }]
}

Candidate IDs and contract IDs are unique within this artifact and prerequisites reference candidates in this file. Contract kind is one of api, persistence, event, query, wire, configuration, cross-module, or state-model. Contract change is add, modify, or remove. For ${kind}, ${kind === 'program-design' ? 'contracts contains every materially changed contract; use an empty array only when the source truly defines no changed contracts' : 'contracts must be an empty array'}. Write only ${outputPath}.`);
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

Apply the audience profile here. New audiences need first-principles orientation; familiar audiences need compact refreshers and deltas. Product depth emphasizes behavior and tradeoffs, system-design depth emphasizes boundaries and flows, and implementation depth adds mechanics and failure evidence.

Language policy:
${PLAIN_LANGUAGE_STANDARD}

Select the smallest curriculum that preserves the needed mental models. Move secondary evidence to supportingMaterial and explain omissions. Changed contracts remain required at every depth; depth changes their framing, not their availability.

Use one compact orientation, one or more conceptual neighborhoods, and an optional synthesis only when it adds a distinct conclusion. Within each neighborhood, local context leads to contiguous architecture beats immediately followed by contiguous program-design beats, then optional verification. Program design realizes architecture through contracts and mechanics instead of restating it.

Account for each candidate exactly once through a beat or omission, order prerequisites, and introduce terms once. Map every changed contract exactly once to a program-design beat through contractCoverage. A beat is a teaching movement with a context, architecture, program-design, or verification facet; realizationPoint is its optional key insight.

Write exactly one JSON object with this shape:
{
  "schemaVersion": 3,
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
    "id": "orientation",
    "kind": "orientation",
    "title": "Chapter title",
    "purpose": "Why this chapter exists",
    "openingContext": "Standalone briefing",
    "synthesisObjective": "What the reader should connect after its beats",
    "beats": [{
      "id": "orientation-01",
      "facet": "context",
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
  "contractCoverage": [{
    "contractId": "contract-id-from-program-design-inventory",
    "chapterId": "neighborhood-id",
    "beatId": "neighborhood-id-02",
    "presentationRequirement": "How the exact shape and its consequence stay reviewable at the selected depth"
  }],
  "omissions": [{ "candidate": { "artifact": "architecture", "candidateId": "candidate-id" }, "reason": "Audience-specific reason" }]
}

Use unique kebab-case chapter IDs and sequential <chapter-id>-NN beat IDs. Chapter kind is orientation, neighborhood, or synthesis. Beat facet is context, architecture, program-design, or verification. The orientation is first, at least one neighborhood follows, and an optional synthesis is last. The orientation and synthesis use context or verification facets as appropriate. Write only ${input.paths.curriculumPath}.`);
}

export function deckArchitecturePrompt(input: PromptInput): string {
  return withPreparationFooter(`Create the detailed narrative brief for one standalone slide presentation from the finalized curriculum.

Story: ${input.story}
Curriculum: ${input.paths.curriculumPath}
Output deck: ${input.paths.htmlPath}
Output plan: ${input.paths.deckPlanPath}

Plan the story and every content slide before construction. Preserve the curriculum's neighborhoods and obligations. Within each neighborhood, architecture is immediately followed by program design; current-state evidence appears only as brief orientation or local context.

${PLAIN_LANGUAGE_STANDARD}
${QUICK_GLANCE_STANDARD}

Use the Show Me skill for representations that carry the explanation. ${representationGuidance(input.audienceProfile.technicalDepth)} Carry an architecture visual into the adjacent program-design unit when it can reveal the realization without repeating setup. Give every slide one unique contribution, merge repeated motivations and summaries, and explain the reduction choices in compactnessStrategy. Let slide count follow distinct substance rather than a quota.

Write exactly one JSON object:
{
  "schemaVersion": 3,
  "curriculumPath": ${JSON.stringify(input.paths.curriculumPath)},
  "outputPath": ${JSON.stringify(input.paths.htmlPath)},
  "story": {
    "title": "Presentation title",
    "openingPromise": "What the audience is about to understand",
    "throughline": "The idea connecting the complete presentation",
    "endingResolution": "What the audience should understand when the story closes"
  },
  "compactnessStrategy": "What is merged, omitted, recalled briefly, or moved into progressive disclosure to avoid repetition",
  "chapters": [{
    "id": "orientation",
    "kind": "orientation",
    "title": "Chapter title",
    "storyRole": "What this chapter contributes to the whole story",
    "openingContext": "Where the audience is when the chapter begins",
    "closingSynthesis": "What should be established when the chapter ends",
    "transitionToNext": "How this understanding leads into the next chapter or ending",
    "narrativeUnits": [{
      "title": "Working title for this narrative movement",
      "facet": "context",
      "storyPurpose": "Why this movement exists in the story",
      "beatIds": ["orientation-01"],
      "narrativeBridge": "How it follows the previous movement and prepares the next",
      "slides": [{
        "id": "unique-slide-id",
        "title": "Claim made by this slide",
        "uniqueContribution": "The distinct understanding this slide adds",
        "requiredContent": ["Only content needed for that contribution"],
        "contractIds": [],
        "representationIntent": "Optional visual relationship",
        "progressiveDisclosure": ["Supporting detail available without another slide"],
        "sourceReferences": [{ "heading": "Source heading", "locator": "Retrievable locator" }]
      }]
    }]
  }]
}

Chapter kind is orientation, neighborhood, or synthesis. Narrative-unit facet is context, architecture, program-design, or verification. Create exactly the curriculum chapters in order with matching IDs and kinds. Map every beat exactly once, in order, to a same-facet narrative unit. Map every changed contract exactly once to a planned slide in the program-design unit for its covered beat. Write only ${input.paths.deckPlanPath}.`);
}

export function deckShellPrompt(input: PromptInput): string {
  return withPreparationFooter(`Create the reusable shell for the planned standalone slide deck.

Curriculum: ${input.paths.curriculumPath}
Deck plan: ${input.paths.deckPlanPath}
Output: ${input.paths.htmlPath}

Create one self-contained HTML file with embedded CSS and JavaScript. Establish a spacious, quick-glance, viewport-based slide experience with keyboard and visible navigation, progress, accessible semantics, responsive layout, and printable fallback. Include data-walkthrough-deck, data-slide-viewport, and data-slide-navigation. Leave a clear insertion area; content slides come later.

Write only ${input.paths.htmlPath}.`);
}

export function narrativeUnitPrompt(
  input: PromptInput,
  plan: DeckPlan,
  chapter: DeckChapter,
  unit: NarrativeUnit,
  unitIndex: number,
): string {
  return withPreparationFooter(`Realize one narrative unit in the existing standalone deck.

Curriculum: ${input.paths.curriculumPath}
Deck plan: ${input.paths.deckPlanPath}
Deck: ${input.paths.htmlPath}
Story: ${JSON.stringify(plan.story)}
Chapter: ${JSON.stringify({ id: chapter.id, title: chapter.title, storyRole: chapter.storyRole, openingContext: chapter.openingContext, closingSynthesis: chapter.closingSynthesis, transitionToNext: chapter.transitionToNext })}
Narrative unit ${unitIndex + 1} of ${chapter.narrativeUnits.length}:
${JSON.stringify(unit, null, 2)}

Realize exactly the planned slides. Add data-walkthrough-slide, the planned id, data-walkthrough-chapter="${chapter.id}", and data-walkthrough-facet="${unit.facet}" to each section. Preserve the shell and prior slides.

${PLAIN_LANGUAGE_STANDARD}
${QUICK_GLANCE_STANDARD}

Use established context and brief callbacks. Program design realizes the architecture just shown. Use the Show Me skill for focused representations. ${representationGuidance(input.audienceProfile.technicalDepth)} Fulfill each planned contribution and keep every covered contract exact: schemas expose relevant fields, types, optionality, constraints, indexes, and migration; APIs expose relevant calls, inputs, outputs, and errors; other contracts expose equivalent shape, invariants, and compatibility behavior.

Modify only ${input.paths.htmlPath}.`);
}

export function finalAssemblyPrompt(input: PromptInput): string {
  return withPreparationFooter(`Complete and polish the assembled standalone presentation.

Curriculum: ${input.paths.curriculumPath}
Deck plan: ${input.paths.deckPlanPath}
Deck: ${input.paths.htmlPath}

Polish the deck into one quick-glance presentation with coherent opening, neighborhood transitions, ending, navigation, responsive layout, accessibility, and visual consistency.

${PLAIN_LANGUAGE_STANDARD}
${QUICK_GLANCE_STANDARD}

Merge or remove repeated slides and update navigation. Add a structural slide only for a distinct transition the adjacent slides cannot carry. Preserve curriculum and contract coverage, architecture-to-program-design adjacency, working controls, and a viewport-based rather than scrolling experience.

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

Review the curriculum, plan, and HTML. Judge the deck agentically; there is no slide-count target.

${PLAIN_LANGUAGE_STANDARD}
${QUICK_GLANCE_STANDARD}

Check that each slide earns its place and reads at a glance, repeated ideas are merged, and the primary layer feels like forward motion rather than a study document. Also verify factual grounding, coverage, navigation, accessibility, legibility, and progressive disclosure.

In the actual HTML, each neighborhood must move directly from architecture to the program design that realizes it. Every materially changed contract must remain exact and reviewable at every depth, including relevant schema fields, types, constraints and migration; API calls, inputs, outputs and errors; and equivalent shapes and invariants for other contract kinds.

This is read-only review: do not edit the curriculum, plan, or deck.

Write a complete standalone Markdown review for this round with these sections:

# Deck Review — Round ${round}

## Review scope
State what you inspected and anything you could not verify.

## Prior finding verification
For round one, state that this is the initial review. Later, account for every prior blocker and concern as Verified, Incomplete, Not addressed, or Withdrawn, with current evidence.

## Findings
Use "### F-NN — [Severity] Short title" with a stable ID and severity Blocker, Concern, or Suggestion. Include responsibility, affected area, evidence, consequence, required outcome, and verification. Responsibility is Deck architecture for plan changes, Deck implementation for realization changes, or Human decision for choices only the user can make. Use "No findings" when empty. Suggestions never require another round.

## Human decision
Write "No human decision required" unless a genuine user choice is necessary; then state the decision, options, and tradeoffs.

## Conclusion
State whether required work remains and who owns it. No blockers or concerns means complete.

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

Update the plan where findings require it. Preserve the curriculum, neighborhood order, exact contract coverage, one-time beat mapping, and architecture-to-program-design adjacency. Merge slides whose contributions overlap. Evaluate every finding and summarize changes, evidence-based declines, and genuine user decisions.

The deck plan is validated against exact object key sets. Preserve its existing JSON schema: keep schemaVersion, curriculumPath, and outputPath unchanged; do not add, remove, or rename object fields; and express revisions by changing field values or array items within that schema.

${PLAIN_LANGUAGE_STANDARD}
${QUICK_GLANCE_STANDARD}

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

Apply implementation findings and the current plan. Merge repetition, preserve navigation, neighborhood adjacency, and exact contract access. Evaluate every finding and summarize changes, evidence-based declines, and genuine user decisions.

${PLAIN_LANGUAGE_STANDARD}
${QUICK_GLANCE_STANDARD}

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
      return 'Use a user journey, before-and-after comparison, or tradeoff view when it explains the product consequence more clearly than prose. Keep exact changed contracts available with annotations that connect their shape to product and operational consequences.';
    case 'system-design':
      return 'Prefer boundary maps, ownership views, data or control flow, sequences, and state transitions that make system relationships visible. Follow them with exact changed contract shapes that make each boundary executable.';
    case 'implementation':
      return 'Prefer exact code and contract shapes, call trees, state transitions, diffs, algorithms, and failure paths that keep mechanics connected to their architectural purpose.';
  }
}
