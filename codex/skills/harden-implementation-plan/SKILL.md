---
name: harden-implementation-plan
description: Use Socratic teaching to walk through and revise an implementation plan until its load-bearing design is understood, challenged, and internally consistent
---

Use Socratic teaching to walk the user through the referenced implementation plan and revise it as their understanding and feedback develop.

<plan-reference>
[Arguments supplied by the user]
</plan-reference>

The user should understand each load-bearing implementation neighborhood deeply enough to explain its purpose, predict relevant system behavior, form an implementation approach, compare that approach with the plan, and defend, reject, or improve the proposed design.

Read the complete plan and inspect the relevant repository implementation before beginning. Treat invocation as permission to edit the plan files when feedback settles. Do not implement the planned product work or edit files outside the plan.

## Establish the journey

Identify the load-bearing neighborhoods in the architectural design and program design. A neighborhood is load-bearing when it is difficult to understand or when a different answer could materially change system behavior, responsibilities, interfaces, data flow, failure handling, phase structure, risk, or downstream work.

Open with a compact causal journey through the goal, the current system baseline, the proposed direction, and the load-bearing neighborhoods. Weave the neighborhoods and the consequences that make them important into the journey so the user can anticipate the route without receiving a mechanical agenda. Choose the teaching order that makes the system easiest to understand; it need not follow implementation order. Begin the first neighborhood as part of the opening.

## Harden each neighborhood

Use Socratic teaching as an interplay between grounded explanation and consequential questions. Work in coherent conversational segments: provide enough related context for the user to reason, then invite them to explain, predict, propose, or judge where doing so deepens their understanding. Adapt the rhythm, depth, and number of questions to the neighborhood and the user's demonstrated knowledge.

Treat the user as a maintainer whose mental model of a changing codebase may be stale. Make the necessary context understandable from the conversation, use plain language, introduce important engineering terms before relying on them, and move past background the user already demonstrates.

Teach the existing system accurately from repository evidence. Explain the relevant responsibilities, interactions, and data movement before asking the user to reason about the proposed design.

Help the user form an implementation view at the level of components and general data movement, with assistance when useful. Then show the complete picture proposed by the plan, including consequential nuances the user may have missed. Clearly distinguish repository facts, decisions stated by the plan, and your own inferences. Treat proposed details that the plan does not settle as open rather than presenting them as fact.

Use follow-up questions to expose the consequences of the user's reasoning and let them evaluate the proposed design against their own approach. Surface meaningful tradeoffs, questionable choices, and missing rationale while keeping the conversation focused on decisions that could change the design.

A load-bearing neighborhood is resolved when the user has given a meaningful response showing that they can explain its purpose and reason about its relevant behavior or proposed design. Cover non-load-bearing material compactly during the final phase review.

## Revise or interrupt

When a resolved neighborhood changes the design, briefly state the new shared understanding and immediately update every affected plan file. Preserve consistency across the plan and ask before editing only when materially different interpretations of the feedback remain.

Use ordinary revision for missing detail whose answer follows from repository evidence or already-settled decisions. When progress instead requires new architectural design or program design exploration, stop the walkthrough and identify the uncovered decision, why it is load-bearing, and what downstream work it affects. Provide a short copyable prompt that invokes `$brainstorming` and points to the relevant plan section and repository evidence. The user will resolve the question and update the plan in a separate session. When they return, reread the complete updated plan, reassess affected downstream neighborhoods, and continue from the revised understanding.

## Review the implementation sequence

After resolving every load-bearing neighborhood, lead a fast, mostly agent-led pass through the phases. Explain what each phase encompasses and how the validated design becomes an implementation sequence, including starting and resulting states, important dependencies, temporary debt, and verification where they help the user understand how the work will unfold. Keep mechanical details compact and give the user room to correct or change the phasing without requiring a comprehension exercise for each phase.

Apply the same brainstorming interruption when this pass reveals new architectural design or program design work. Otherwise, reread the complete updated plan, resolve ordinary contradictions introduced during revision, validate its internal links and references, and ensure it agrees with the shared design. Finish with a concise summary of the resulting design and the material changes made.
