import type { ArchitectedDeckPlan } from './curriculum-v3.js';
import type { ArtifactPaths, AudienceProfile, WalkthroughPaths } from './types.js';

export type PromptInput = {
  readonly repositoryPath: string;
  readonly story: string;
  readonly sources: ArtifactPaths;
  readonly paths: WalkthroughPaths;
  readonly audienceProfile: AudienceProfile;
};

const PREPARATION_FOOTER = 'Work unattended and finish the requested file in this turn. Do not run tasks or shell commands in the background, but you may run them in the foreground.';

const PLAIN_LANGUAGE_STANDARD = 'Use direct, plain language. Lead with behavior or consequence, define unfamiliar terms before use, and keep exact identifiers where they add precision. Omit or merge material that does not change understanding.';

const DECK_EXPERIENCE = `Create a self-paced presentation whose main narrative is understandable at a glance. Each slide should feel like a composed presentation canvas rather than a document section. Show all primary content immediately; Next and Back move between slides and never reveal fragments within a slide. Keep exact contracts available without crowding the main narrative, using accessible details or dependable scrolling for optional evidence. Choose typography, composition, visual language, and representations that suit the material. Keep the result readable, responsive, non-overlapping, accessible, and coherent.`;

const VISUAL_STORYTELLING_STANDARD = `Use diagrams as the primary explanation when the material is fundamentally relational, sequential, or stateful. Sequence, state, flow, dependency, and data-model diagrams are especially useful. Mermaid is available when it produces the cleanest result; render diagrams in the finished deck rather than showing their source. Reuse or evolve a diagram across adjacent slides when that preserves context. Do not substitute a grid of prose cards for a relationship that one clear diagram can show directly.`;

function unattended(body: string): string {
  return `${body}\n\n${PREPARATION_FOOTER}`;
}

export function genericDeckArchitecturePrompt(input: PromptInput): string {
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

export function genericDeckShellPrompt(input: PromptInput): string {
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

export function genericDeckNeighborhoodPrompt(
  input: PromptInput,
  plan: ArchitectedDeckPlan,
  neighborhood: ArchitectedDeckPlan['neighborhoods'][number],
  neighborhoodIndex: number,
): string {
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

export function genericDeckAssemblyPrompt(input: PromptInput): string {
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

No model reviewer follows this assembly. Render and inspect the completed deck at 1440×900, 1280×720, and 1024×768. Exercise navigation and optional-detail controls, then correct overlap, clipping, unreadable content, broken scrolling, stale numbering, hidden primary content, and visible stacking between slides. Modify only ${input.paths.htmlPath}.`);
}

export function genericSocraticPrompt(input: PromptInput): string {
  return `Guide a self-paced Socratic walkthrough from the approved curriculum.

Story: ${input.story}
Curriculum: ${input.paths.curriculumPath}
Curriculum analysis: ${input.paths.curriculumAnalysisPath}
Canonical sources: ${JSON.stringify(input.sources)}

Read the curriculum and analysis. Use the curriculum's storyline, neighborhoods, outcomes, coverage roles, and visibility choices as the teaching contract. Use the analysis for grounded details and source references. Help the user build the intended model and reach their own approval judgment through concise explanations, focused questions, and checks for understanding. Preserve exact schemas, APIs, events, state transitions, and other contracts when they matter to the judgment.

Begin with a brief orientation and the first useful question. Let the user's answers determine clarification and pacing inside this pane. Group related obligations around the curriculum outcomes instead of turning every coverage item into a separate lesson. Use the Show Me skill when a focused representation materially helps.

${PLAIN_LANGUAGE_STANDARD}`;
}
