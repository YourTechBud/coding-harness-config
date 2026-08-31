import type { ParsedInputs } from './inputs.js';
import type { CurriculumAnalysis } from './types.js';

export const CURRICULUM_CONVENTIONS = `Curriculum conventions:
- Produce a planning handoff for a downstream technical architect or content architect, not audience-facing copy.
- Keep the learning path small while preserving a complete inventory of consequential concepts, artifacts, contracts, evidence, and decisions.
- Organize related coverage into contextual neighborhoods and outcomes. The source-file boundaries do not determine the curriculum.
- Role and visibility answer different questions. Primary coverage creates an outcome, supporting coverage helps explain it, and reference coverage is a concrete artifact or evidence to inspect. Required coverage must reach the audience in some form; optional coverage may remain available as additional detail.
- A consequential contract can be reference coverage and still be required. Database schemas, APIs, wire contracts, events, state machines, security policies, and similar decision evidence do not need separate outcomes, but they must not disappear.
- Aim to stay within 6 outcomes and 5 neighborhoods. These are cognition guides for the learning path, not quotas or limits on the coverage inventory.
- Choose the clearest storyline for the learning goal, audience, sources, and teaching brief. Explain the choice without applying a predetermined teaching template.`;

const UNATTENDED_FOOTER = `Work unattended and finish the requested file in this turn. Inspect the actual Markdown sources and audit the completed JSON against the requested shape before reporting completion.`;

export function analysisPrompt(input: ParsedInputs): string {
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

export function curriculumPrompt(input: ParsedInputs, analysis: CurriculumAnalysis): string {
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
