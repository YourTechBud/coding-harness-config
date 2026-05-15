---
description: Set up or revise a repo-local brainstorming artifact workspace under .isagi
agent: brainstorming
---

Set up or revise a brainstorming artifact workspace for this repo.

<goal>
Create `.isagi/brainstorming-workspace` as a repo-local visual thinking surface for artifact-based brainstorming.

The setup should produce workspace guidance docs under `.isagi/brainstorming-workspace/guidance/` and adapt the scaffold to the repo's existing tooling where useful.

If a workspace already exists, improve it instead of starting over.
</goal>

<core_model>
- Normal brainstorming stays generic and works without artifacts.
- `/brainstorm-with-artifacts` activates artifact mode and owns the runtime protocol.
- Workspace guidance docs own repo/workspace-specific mechanics and page anatomy.
- This setup command owns discovery, scaffold creation, guidance generation, and reentrant revision.
</core_model>

<principles_to_preserve>
The guidance you produce must encode these principles. They are not optional — the runtime protocol and the workspace's value depend on them.

## 1. Reduce Cognitive Burden

The workspace exists to make long brainstorming easier to stay inside. It must not become a second inbox, a decorative dashboard, or another surface the user has to monitor.

## 2. Chat Conducts; Artifacts Reason

In artifact mode, chat acknowledges the user, briefly orients them, says what changed, and points to the relevant artifact surface. The artifact carries substantial reasoning: decision branches, tradeoffs, pushback, suggestions, diagrams, questions, and plans when explicitly requested.

## 3. Questions Live With Branch Context

Do not create separate question lists in chat. Put questions in the relevant branch so the user can answer while looking at the context. This prevents the user from bouncing between chat and page just to understand what to answer.

## 4. Active Branches Are The Main Unit

The user usually cares about the current decision branches, not a global archive. The root page should emphasize active branches and de-emphasize or collapse closed branches. Global understanding may exist, but it should not compete with active reasoning.

## 5. Branches Need Predictable Anatomy And Freeform Bodies

A branch should usually include:

- branch understanding: the current state of thinking for that branch;
- branch body: freeform reasoning and visuals;
- branch questions: questions for the user, placed in the artifact.

The branch body can use whatever best compresses the thinking: Mermaid, SVG, tables, diagrams, workflows, mocks, code sketches, canvas, prose, or links to detail pages.

## 6. Pushback Must Be Visible When Present

Pushback helps the user appreciate why a decision is being made. It should not be an empty ritual, but real critique should be clearly labeled and easy to find.

## 7. Artifacts Need Suggestions, Not Just Questions

Develop options, tradeoffs, critique, and recommendations before asking for input. Do not make the artifact a passive questionnaire.

## 8. Visual Form Should Compress Thought

Use visual and spatial forms when they reduce reading burden — Mermaid, SVG, diagrams, tables, workflows, code-like structures, mockups, canvas, or lightweight interaction. Do not decorate prose for its own sake.

## 9. Minimal, Quiet UI Beats Design-Heavy Presentation

The workspace is a thinking aid, not a landing page. Favor clear hierarchy, calm surfaces, enough spacing, readable type, and low visual noise.

## 10. Navigation Is A First-Class Artifact Principle

Every page should show where it sits and how to return to the active branch map or plan. If the workspace grows beyond a few pages, use shared navigation/layout components.

## 11. Anti-Staleness Should Not Become Amnesia

Preserve important cumulative context. Patch relevant branches when possible. Rewrite only when structure has become muddy. Closed branches should be collapsed or de-emphasized rather than erased.

## 12. Implementation Plans Are User-Triggered Only

Do not auto-create implementation plans. You may recommend that the discussion is ready for planning, but a plan should be created only when the user explicitly asks. When a plan exists, the root page should surface it prominently above the branch index.
</principles_to_preserve>

<guidance_shape>
Produce guidance under `.isagi/brainstorming-workspace/guidance/`. Default to a single concise file when the workspace is small. Split into focused files only when each owns a distinct concern. Candidate split:

- `guidance/index.md` — entry point and links
- `guidance/principles.md` — the principles above, as encoded for this repo
- `guidance/branch-anatomy.md` — branch structure, lifecycle, question placement, pushback conventions
- `guidance/visual-tools.md` — Mermaid, SVG, canvas, tables, diagrams, mocks, rendering support
- `guidance/navigation.md` — top bars, breadcrumbs, side navigation, links between root, branches, details, and plans
- `guidance/operations.md` — run, reset, build, and maintenance commands
</guidance_shape>

<process>
1. Check whether `.isagi/brainstorming-workspace` already exists. If it does, read its guidance and ask what is not working — do not wipe or replace unless the user wants that.
2. Inspect the repo for existing tooling and UI conventions: package manager, Vite/Astro/React/Tailwind/HTMX, design tokens, existing docs patterns, or no JS tooling at all.
3. Briefly explain viable setup options. Avoid a rigid questionnaire.
4. Discuss render support when useful — Mermaid for diagrams, SVG for bespoke visuals, canvas/JS only when interaction materially helps, shared layout components when page count makes duplication painful, plain HTML when simplicity wins.
5. Ask how to proceed when the choice is not obvious.
6. Create or revise a minimal working workspace under `.isagi/brainstorming-workspace`.
7. Write workspace guidance docs that encode the principles above and document local mechanics.
8. Include starter pages that demonstrate branch-based artifact structure, navigation, and a plan placeholder.
</process>

<default_bias>
- Prefer the simplest working setup.
- Use plain HTML when no JavaScript tooling is appropriate.
- Reach for Vite/Tailwind, Astro, HTMX, or another local fit only when it materially reduces future artifact friction.
- Astro is a strong suggestion when navigation/layout duplication is already painful or likely.
- Add Mermaid/render support when it meaningfully improves visual thinking.
- Do not modify the repo's main `AGENTS.md`.
</default_bias>

<after_setup>
- Tell the user how to run the workspace.
- Tell the user to invoke `/brainstorm-with-artifacts` to use it.
- Mention where the guidance index lives.
</after_setup>
