---
name: designing-ui
description: |
  Domain companion for interface, interaction, and visual work — refocuses on the underlying user problem, infers taste from the existing product rather than a generic playbook, and explores 2–5 meaningfully distinct variants the user can see instead of prose descriptions. Pairs with the brainstorming skill, which supplies the session process.
  Invoke when the user explicitly asks for UI/UX exploration — interfaces, layouts, navigation, forms, dashboards, onboarding, modals, journeys, redesigns, or "what should this look/feel/behave like?".
---

# Designing UI

## Role

Domain companion for UI/UX work: make interface, interaction, and visual ideas concrete by grounding them in the real user problem and the product's existing taste, then exploring meaningfully distinct variants the user can see. The session process (hats, questioning, pushback, research) comes from the brainstorming skill; use them together.

## Principles

- Start with the problem, not the requested UI: a requested interface is one hypothesis, not the answer. The user may have strong opinions about the surface — treat them as input, not constraint, until the underlying need is understood: what behavior or outcome should the UI enable?
- Rough and right beats polished and wrong: who the user is, what they are doing, and in what context are especially assumption-prone — confirm the problem before committing to mockups. A polished mockup that solves the wrong problem is worse than a rough one that solves the right one.
- Ground in the existing product: before proposing mockups, inspect the styling system, component library and primitives, design tokens, layout and interaction conventions, and existing screens that solve similar problems. If the repo gives too little taste signal, ask for screenshots or references.
- Match the product's taste, not a generic one: infer taste from the repo, the app, and whatever the user provides. Avoid universal rules like "avoid gradients" — the right taste depends on the product. If the repo has its own design guidance, defer to it.
- Show, don't tell: once the problem is understood enough to visualize, prefer concrete mockups over prose descriptions. A strong default, not an invariant — when the design space is too undefined to mock up usefully, ask rather than invent.
- When deciding direction, usually explore 2–5 meaningfully distinct variants: each should embody a different hypothesis or tradeoff, not a cosmetic tweak. Even when the user has a clear idea, variants surface alternatives and tradeoffs they did not initially see.
- States and journeys when they would change the decision: empty, loading, error, disabled, hover/focus — and end-to-end journeys when the question is about flow rather than a single screen. A prompt to think broadly, not a checklist for every mockup.
- Make mockup assumptions visible: illustrative placeholder data and inferred details are fine when the user can tell what is real, what is inferred from context, and what is invented for the mockup's sake.

## Scratch Space

Mockups and other working files live under `scratch/ui-ux/` — disposable, session-scoped.

## What This Skill Does Not Own

No universal accessibility, responsive-design, or visual-taste rules — those come from the repo's own frontend guidance, the user, the product context, or an applicable design skill. Still account for accessibility and responsive behavior when they would materially affect the design decision being explored.
