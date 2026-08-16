# Design Architecture

Create the simplest coherent target architecture that satisfies the supplied story within the existing system's constraints. Treat the story as immutable product scope, use the current-state analysis and repository as evidence, and write a complete architecture artifact at the requested path so downstream program design can proceed without choosing a different system shape.

## Artifact Contract

Cover the following knowledge in the form that best fits the system and story:

- **Architecture basis and drivers:** Identify the story, target system boundary, current-state analysis, material repository constraints and engineering guidance, and story-relevant quality drivers. Distinguish immutable story requirements, evidence-backed repository facts, and proposed design choices. State the simplest mental model of the intended end state.
- **Target system model and change strategy:** Define the target responsibilities, ownership boundaries, relationships, dependency direction, and placement within the existing architecture. Explain what remains, changes, moves, is introduced, or is removed. Connect the target elements to relevant existing modules or extension seams where that makes the design retrievable and concrete.
- **Architecturally significant behavior:** Explain the major runtime, data, and state flows needed to understand the design. Include success, failure, asynchronous execution, configuration, persistence, and external-boundary scenarios when they materially shape the architecture. Use only the views that help a fresh agent reason about the target system.
- **Consequential decisions and tradeoffs:** Record decisions that shape responsibilities, boundaries, ownership, dependencies, compatibility, significant quality attributes, or construction strategy. Preserve their drivers, recommendation, consequences, and credible rejected alternatives when alternatives illuminate the choice. Converge on one recommended architecture rather than passing architectural branches downstream.
- **Story-to-architecture trace:** Account for every acceptance criterion, constraint, and distinct promised outcome. Connect each to its target owner, participating elements, relevant flow or decision, and any detail deliberately left to program design. Keep this trace easy to find and audit.
- **Transition, risks, and assumptions:** When the design changes a public interface, persisted representation, external integration, or deployment boundary, settle the intended compatibility and transition policy. State assumptions and risks that could invalidate the architecture, their consequences, and how downstream work can verify them.

## Evidence and Coherence

Place retrievable evidence beside every load-bearing current-system fact or constraint. Reference repository knowledge by path plus symbol or concept, relevant guidance or ADRs by path or URL, and the current-state artifact precisely enough for a fresh agent to recover the supporting context. Verify repository facts on which the design materially depends.

Treat predecessor engineering artifacts as correctable working knowledge. If architecture work exposes a substantive flaw in the current-state analysis, correct that artifact and keep it coherent with the architecture. Preserve the story unchanged.

Justify target choices through the story outcomes, constraints, quality drivers, and consequences they address. Present recommendations as design decisions rather than repository facts.

## Boundary

Architecture owns the target solution shape, responsibilities, boundaries, dependency direction, state ownership, major flows, conceptual boundary semantics, significant quality behavior, and compatibility policy. Conceptual boundary semantics identify what crosses a boundary, who owns it, its direction, and its important guarantees.

Downstream program design owns exact API signatures and routes, schema fields, concrete types, validation rules, detailed state machines, error taxonomies, algorithms, pseudocode, transaction and retry mechanics, and component-level collaboration. Implementation planning owns exhaustive file changes, phases, task ordering, temporary breakage, debt repayment, and verification assignments.

Choose diagrams or other representations only when they make a consequential relationship easier to understand. Keep the artifact story-scoped; include quality, deployment, migration, security, performance, or observability treatment when it materially influences the design.

## Completion

The architecture is complete when every story outcome has a clear architectural response; ownership, boundaries, relationships, and dependency direction are unambiguous; major behavior and consequential failure paths are settled; changed public, persisted, external, or deployment boundaries have a compatibility and transition policy; significant decisions preserve their rationale and consequences; the recommendation agrees with verified repository evidence; and a fresh program-design agent can define exact contracts and mechanics without inventing or revising the system shape.
