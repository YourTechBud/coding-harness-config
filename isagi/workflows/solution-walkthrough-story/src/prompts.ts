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

function audienceDescription(input: PromptInput): string {
  const familiarity = input.audienceProfile.familiarity === 'new' ? 'new to this codebase' : 'familiar with this codebase';
  const depth = {
    product: 'wants a product overview',
    'system-design': 'wants system-design depth',
    implementation: 'wants implementation detail',
  }[input.audienceProfile.technicalDepth];
  return `${familiarity}; ${depth}`;
}

function walkthroughInputs(input: PromptInput): string {
  return `Story: ${input.story}
Curriculum: ${input.paths.curriculumPath}
Curriculum analysis: ${input.paths.curriculumAnalysisPath}
Canonical sources: ${JSON.stringify(input.sources)}
Audience: ${audienceDescription(input)}.`;
}

export function genericLessonPlanPrompt(input: PromptInput): string {
  return unattended(`Write the lesson plan for a guided, conversational walkthrough of the proposed design for this story.

${walkthroughInputs(input)}
Output: ${input.paths.lessonPlanPath}

A guide will use this plan to teach one person in a chat while that person reviews the design and makes the calls it asks of them. The person dictates replies by voice and has limited energy. The goal: they end up with an accurate model of the design and have made the real review decisions, at about the energy cost of a good colleague walking them through it at a whiteboard. Nothing consequential is watered down: every required curriculum item, decision, contract, deferred gap, and merge consequence reaches them. The plan sets the order and pace, gives the guide verified facts and exact shapes, and separates the user's real calls from choices the design has already made.

Read the curriculum, the analysis, and the canonical sources closely enough to get behavior, facts, and exact shapes right. The guide will trust this plan, so an error or oversimplification here reaches the user.

Write the plan in this order.

1. Running example and core idea. One concrete example (named agents, IDs, and so on) for the guide to reuse throughout, and the central change the design makes, in two or three plain sentences. If merging the story has a consequence for the main branch or release, state it here in one sentence with its reason.

2. Stops. Follow the curriculum's storyline with about five to eight stops, ending with the approval stop; split an outcome into two stops only when it carries more than one sitting can hold. The first stop reaches the core change quickly and covers today's system only as far as needed to see why the change is necessary. Place each acceptance criterion or binding requirement in the stop where it decides something. Introduce any later story the design defers work to at the first stop where it matters, with what a user experiences until it lands. For each stop:
   - Goal: what the user understands or decides by the end.
   - Anchor: what a user of the product would see or experience, and why this stop matters, in two or three plain sentences.
   - Moves: usually three to five teaching moves, each a short paragraph the guide can turn into one message: the normal path as a concrete scenario, the mechanism behind it, and the failure cases. Name the few new terms each move introduces, with a plain definition.
   - What goes wrong: a table whose first column is what the user would see, then why, then where it is handled (this story or a named later story). Use an internal name only where the user needs it to make a call.
   - Interface card: the cross-boundary contracts this stop touches, with exact names and shapes from the sources: endpoints with request, reply, and error codes; persisted tables and files; events and wire formats that cross a boundary; configuration keys; CLI commands. Include it whatever the audience depth. Roughly ten lines, a plain label on each line. Internal type unions, precedence logic, and source file paths do not belong on the card.
   - Calls, in two lists. Your calls are choices with at least two viable options whose consequences the user or the product would feel; give the options, consequences, the design's position and its reason, and a recommendation. Design choices to state are internal-structure choices and choices the story already fixes; give each in one line as what the design chose and why, so the user can object if they disagree.
   - Optional prediction: at most one question the user could answer from the moves above, asked from the user's point of view.
   - Coverage: the curriculum coverage item IDs this stop teaches.

3. Approval stop. The decisions so far, what is proven and what is not, deferred scope with its user-visible effect, and the merge consequence. Frame accepting the design and accepting the merge as separate questions.

4. Fact sheet. The behaviors a user is most likely to ask about, each answered in one or two sentences with a source reference and how solid it is (inspected current behavior, proposed, proven by a probe or spike, or inference): what the user sees on the normal path and when each step fails; after a restart; when they act while the system is mid-task; during any brief transient window, including which direction of an operation it occurs on; when deleting or closing during an operation; and, for each item deferred to a later story, exactly what that story owns and what a user experiences until it lands. Note where the program design overrides the architecture.

5. Coverage check. Every required curriculum item and the stop that covers it.

Keep the plan lean enough for a guide to absorb in a few minutes: one line per idea where possible, citing the sources for detail rather than copying it.

Write in plain, direct language. Write only ${input.paths.lessonPlanPath}.`);
}

export function genericSocraticPrompt(input: PromptInput): string {
  return `Walk the user through the proposed design for this story as a self-paced, guided conversation.

${walkthroughInputs(input)}
Lesson plan: ${input.paths.lessonPlanPath}

The goal: by the end, the user holds an accurate model of the design and has made the real review calls on it, and getting there costs them about as much energy as a good colleague walking them through it at a whiteboard. The design is not to be watered down. Every consequential decision, contract, deferred gap, and merge consequence in the curriculum still reaches them; what you control is the order, the pacing, and how much lands at once.

The user dictates replies by voice and has limited energy. A message they have to decode costs them a lot; a message that moves them forward and lets them answer "continue" costs them little.

Read the lesson plan first. It sets the stops in order and gives each one its teaching moves, a table of what goes wrong from the user's seat, an interface card, and the calls split into the user's real calls and design choices to state. Its fact sheet answers the behaviors users most often ask about, with sources. Follow its stop order, cards, and call split, and treat its moves as a plan rather than a script: combine them when the user is following, and slow down with a concrete story when they are lost. Answer "what would I see" questions from the fact sheet, and check the sources for anything it does not cover. The curriculum, analysis, and sources hold further detail and exact shapes.

How to teach it:

- Start with the product. The first message says in a few sentences what this story changes for the user, lists the plan's stops ahead with how many calls each holds, and starts the first stop. If merging the story has a consequence for the user's main branch or release, name it there in one plain sentence with its reason, and say it is decided at the approval stop. The user sees the walkthrough itself, never your reading, the plan behind it, or edits in progress.
- Get to the core change early. Bring in today's system only as far as the user needs it to see why the change is necessary, and reach the central mechanism of the design within the first few messages. Introduce each acceptance criterion or binding requirement at the stop where it decides something; the full list comes back at the approval stop.
- Build up within each stop: what the user would see and why it matters, then one concrete scenario on the normal path (reuse one running example for the whole walkthrough), then the mechanism behind it, then what goes wrong. New terms arrive one at a time when first needed, defined in plain words, and any one message carries only a few new names.
- Show mechanisms and gaps from the user's seat. When you list what breaks, what can fail, or what is deferred, use a table whose first column is what the user would see, then why, then where it is handled (this story or a named later story). Use an internal name in prose or tables only when the user needs it to make a call; exact names live on the interface card.
- Keep a whiteboard pace. A stop usually takes two to five messages, and most messages fit on one screen. When the user says continue with no concerns, combine the next steps rather than slowing down; when they are lost, re-explain with a concrete story. Answer a side remark at the weight the user gave it: a remark they will not push on gets a few sentences and a ledger line.
- Always show the interface layer, whatever the audience depth. Close each stop with a compact reference card of the cross-boundary contracts it touches: endpoints with request, reply, and error codes; persisted tables and files; events and wire formats that cross a boundary; configuration keys; CLI commands. Give exact names and shapes with a plain label on each line, keep it to roughly ten lines, and put it in a collapsible \`<details>\` block so it is easy to skip. Internal type unions, precedence logic, and source file paths stay off the card. Keep showing cards when the user says they skim them; make a card lighter by removing internals, never by dropping a contract.
- Ask questions the user can answer. Once a mechanism has been shown, one optional prediction per stop from the user's point of view ("what would you see if...") is welcome. Show how the design handles something before asking the user what they would want from it.
- Respond like a colleague. Confirm in a few words what the user got right, then say plainly what the design does differently. Scorecards, check-mark tables, and "corrections" headers read as grading to this user, so leave them out.
- Separate review from comprehension. A real call has at least two viable options whose consequences the user or the product would feel: mark it as the user's call, say why the design chose its default, give the options with their consequences and your recommendation, and close with the cheap path: "answer, or say continue and I'll record my recommendation as your leaning." Internal-structure choices and choices the story already fixes get one line, "the design chose X because Y; say if you object". State at most two such choices in a message, each as what it means for the user in plain words, and put the rest in the ledger as settled by the story. A view on shipping or merging expressed before the approval stop is recorded as a leaning and decided at the approval stop, with the merge consequence in front of the user.
- Recommend from your own judgment. The user's lean is input, not the answer: weigh it against the design's reason for its default and the story's exclusions. When an option moves work from a later story into this one, say so in the option, and when recommending another such move, show what has moved so far.
- Raise user-visible gaps yourself. When the design leaves the user facing something with no warning or handling, bring it up when the stop reaches it rather than waiting for the user to think of it. Introduce any later story the design defers work to the first time it matters, and every time something is deferred, say in one line what a user would experience until that story lands.
- Keep facts accurate. Before telling the user what they would see after a restart, when a step fails, when they act while something is mid-task, or during a brief transient window, check it in the fact sheet or the sources, including which direction of an operation it happens on and exactly what a deferred story owns. When a claim drives a decision, say in a few plain words how solid it is: seen in today's code, proposed, proven by a probe or spike, or your inference. Where the program design and the architecture disagree, the program design wins.
- Let the user change the design. Keep a running ledger of decisions, requested changes, leanings, and follow-ups. Show only the rows that changed in a message, the full ledger at the end of each stop, and the whole ledger again at the end with the final approval decision. Say something has been changed only when you actually made the change and can say where.

Use direct, plain language. Use the Show Me skill when a focused representation materially helps.`;
}
