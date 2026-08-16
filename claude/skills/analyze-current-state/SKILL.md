---
name: analyze-current-state
description: |
  Create a story-scoped, evidence-backed current-state analysis of an existing codebase for downstream architecture and program design. Invoke only when explicitly asked to analyze current state.
disable-model-invocation: true
---

# Analyze Current State

Create a decision-enabling account of how the existing system works within the scope of the supplied story. Treat the story as immutable product scope, use the repository as evidence, and limit changes to the requested Markdown artifact. Write the complete analysis there so downstream architecture and program design can proceed without repeating broad discovery.

## Artifact Contract

Cover the following knowledge in the form that best fits the system and story:

- **Analysis basis and boundary:** Identify the story, the relevant system boundary, the code revision when readily available, relevant working-tree divergence, and material evidence sources beyond code.
- **Current-system model:** Explain the relevant responsibilities, boundaries, relationships, and consequential runtime, data, and state flows from initiation to observable effect. Include variants such as asynchronous execution, failure behavior, configuration, persistence, or external integration when they affect the story.
- **Story-to-system trace:** Account for every acceptance criterion, constraint, and distinct promised outcome. Connect each one to current behavior or an explicit gap, its entry point, participating components, state, contracts, tests, supporting evidence, and existing mismatches that downstream design must address. Keep this trace easy to find and audit.
- **Consequential contracts, constraints, and change surface:** Capture the story-relevant APIs, schemas, persisted representations, configuration, invariants, compatibility obligations, external boundaries, extension seams, coupling, and dependencies that shape future design. Describe where change pressure exists without choosing the change.
- **Material uncertainty and conflicting evidence:** State relevant facts the repository cannot establish, meaningful inferences, and discrepancies among code, tests, documentation, configuration, or observed behavior. Give the strongest account the evidence supports.

## Evidence

Place evidence beside the claim it supports. Reference repository knowledge by path plus symbol or concept and explain what it establishes; identify relevant tests, commands, and URLs with the same precision. Prefer stable identifiers over line numbers. Support important absence claims by naming the likely locations, symbols, or flows inspected.

Use targeted executable checks when static inspection cannot establish material behavior. Preserve results and caveats that affect the account rather than raw search, command, test, or source-code transcripts.

## Boundary

Keep the artifact story-scoped and descriptive. Downstream artifacts own target architecture, program design, pseudocode, file changes, work breakdown, and implementation sequencing. Choose diagrams or other representations only when they make a consequential relationship easier to understand.

## Completion

The analysis is complete when every story outcome maps to current behavior or an explicit gap; a fresh agent can explain where the relevant behavior begins, how it proceeds, which important boundaries it crosses, and what result emerges; every load-bearing factual claim has retrievable evidence; material uncertainty is visible; and architecture work can begin without repeating broad discovery.
