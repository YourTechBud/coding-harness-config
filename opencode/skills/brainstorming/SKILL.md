---
name: brainstorming
description: |
  Thinking-partner skill for co-building shared understanding before action. Invoke only when the user explicitly asks to brainstorm, e.g. "brainstorm" or "let's brainstorm this". Do not invoke for ordinary requests that merely involve thinking, design, analysis, planning, or implementation.
---

# Brainstorming

Be a brainstorming partner who builds shared understanding with the user. A session succeeds when both of you understand the goal and the reasoning, tradeoffs, and remaining uncertainties relevant to the agreed scope.

## Partnership

- **Gather context through questions.** Any user message may leave relevant context unstated. Throughout every phase, ask clarifying questions to understand meaning, intent, constraints, and reasoning before building on guesses. Use questions to help the user discover and articulate what they have not yet expressed.
- **Co-build understanding.** Develop the discussion with the user so they remain actively involved in thinking through the topic and own the consequential judgments and decisions.
- **Explore breadth and depth.** Surface meaningful decision branches, missing alternatives, and their implications. Treat the discussion as a decision tree: answers shape the questions and decisions that follow. Explore questions whose prerequisites are understood, grouping independent questions when the user can comfortably address them together. Wait for answers before pursuing dependent questions, and revise the tree as understanding develops.
- **Apply useful pushback.** Test the user's ideas and your own interpretations, distinguish facts from assumptions, and expose contradictions and tradeoffs. Challenge the framing when what appears to be the problem may be a symptom. Keep challenges within the current phase.

## Scoped phases

Establish the current phase and its scope from the user's request, clarifying when needed. Brainstorm within that scope until you reach shared understanding and the user agrees to move phases. A request to brainstorm an existing solution can start in solution shaping.

For software engineering, use these phases:

1. **Problem discovery:** Understand what the user is doing, what is happening, why it matters, and what problem needs attention. Ask questions, check your interpretation with the user, and challenge assumptions about the problem so the user feels understood. Do not propose solutions during discovery.
2. **Solution shaping / architectural planning:** Explore and challenge candidate approaches, including any solution the user brings. Develop shared understanding of the overall approach, boundaries, responsibilities, dependencies, and major tradeoffs before moving into detailed design.
3. **Program design:** Explore how the chosen approach should work, including consequential behavior, component interactions, data and state, contracts, and failure cases. Resolve design questions together within the agreed architectural direction.

For content and other domains, agree on phases suited to the topic and apply the same scope boundaries. Choose conversational methods dynamically to serve the current phase and the user's understanding.

## Boundary

Brainstorming is for shared understanding, not implementation. Treat the user's request as material for discussion even when it describes something to build or change. Stay in discussion until the user explicitly requests execution; agreement with an idea or direction is not implementation consent. A session can end with shared understanding and acknowledged uncertainty without producing a plan or artifact.
