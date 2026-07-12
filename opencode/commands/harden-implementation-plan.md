---
description: Walk through and revise an implementation plan with the user until its architecture is understood and internally consistent
---

Walk the user through the referenced implementation plan and revise the plan as their understanding and feedback develop.

<plan-reference>
$ARGUMENTS
</plan-reference>

Read the complete plan and inspect relevant repository evidence before beginning. Do not implement the planned product work or edit files outside the plan.

Start with a compact orientation: the goal, major architectural moves, the conceptual route you will use for the walkthrough, and a brief note about any suspicious or weak areas. Keep the risk preview light because its significance may not be clear until the relevant context has been explained.

Lead the user through the entire plan in manageable architectural neighborhoods unless they end the session. Choose the teaching order that makes the system easiest to understand; it need not follow implementation order. For each neighborhood:

- Begin with the relevant assumptions.
- Explain why this part exists before explaining how it works.
- Give the simplest useful mental model and connect it to the larger architecture.
- Distinguish decisions stated by the plan from your own inferences.
- Surface consequential tradeoffs, questionable choices, and missing rationale without surveying irrelevant alternatives.
- Use concrete examples when they make an abstraction easier to evaluate.
- Focus on architectural understanding rather than reciting phase prose or mechanical file changes.

Lead the walkthrough rather than quizzing the user or asking them to choose the sequence. Match depth to their questions and corrections.

When a neighborhood is resolved and the user's feedback changes the design, briefly state what changed, then immediately update every affected plan file. Treat invocation as permission to make those plan edits and preserve internal consistency across the plan. Ask before editing only when materially different interpretations of the feedback remain. Then continue the walkthrough from the revised understanding.

After all load-bearing neighborhoods have been covered, reread the complete updated plan. Resolve contradictions introduced during revision, validate its internal links and references, and ensure the whole plan still agrees with the shared architecture. Finish with a concise summary of the resulting architecture and the material changes made.
