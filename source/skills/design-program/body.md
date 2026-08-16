# Design Program

Translate the supplied story and target architecture into an exact, maintainable program design grounded in the existing codebase. Treat the story as immutable product scope, use the current-state and architecture artifacts as working engineering context, and write the complete design at the requested path so implementation planning can organize the work without inventing consequential contracts, representations, behavior, or code structure.

Specify every decision whose alternatives could materially affect contracts, maintainability, behavior, or testability. Leave locally interchangeable implementation details open.

## Artifact Contract

Cover the following knowledge in the form that best fits the system and story:

- **Design basis and resolved target:** Identify the story and predecessor artifacts, state the concrete program-level result, and distinguish verified repository facts, inherited architecture decisions, and proposed program-design choices. Preserve the architecture's intended system shape while resolving the code-level decisions it deliberately deferred.
- **Program structure and collaboration:** Define the load-bearing module layout, responsibilities, dependencies, and placement of new behavior. Name exact repository homes and important existing or proposed symbols. Explain consequential additions, removals, moves, and reuse, and trace important entry points through their collaborators to observable results. Use compact file-tree or call-path views when they make layout or control flow easier to inspect.
- **Contracts and representations:** Define exact changed external and cross-module contracts, including applicable APIs, routes, events, schemas, queries, persisted representations, configuration, and wire formats. Define consequential internal types and function or method signatures. State identity, ownership, lifetime, optionality, mutability, validation, preconditions, postconditions, and representation invariants where they affect correctness. When a boundary changes, turn the architecture's compatibility policy into concrete compatibility and migration mechanics.
- **Behavioral mechanics:** Specify the detailed success and failure paths, state transitions, data transformations, and component collaboration. Settle ordering, concurrency, transaction boundaries, idempotency, cancellation, timeout, retry, stale-data, and partial-failure behavior when relevant. For user-interface work, define consequential interaction states, focus and keyboard behavior, accessibility semantics, and recovery. Use examples, state tables, sequence descriptions, or focused pseudocode where they remove material ambiguity.
- **Verification and operability design:** Identify test seams, scenario classes, important fixtures, invariants, and observable outcomes. Connect consequential edge cases to the level of testing that can establish them. Define logging, metrics, diagnostics, or audit behavior when the change needs operational evidence. Describe what must be verifiable without assigning checks to implementation phases.
- **Traceability and remaining risk:** Account for every story outcome and relevant architecture decision. Connect each to its concrete code owner, contracts, flows, failure behavior, and verification seam. Converge on one recommended program design. For material uncertainty, select and justify an assumption, state the consequence if it is wrong, and explain how downstream work can verify it.

## Evidence and Coherence

Place retrievable evidence beside every load-bearing repository fact or constraint. Reference code by path plus symbol or concept and explain what it establishes; reference predecessor artifacts, guidance, ADRs, tests, and URLs with the same precision. Verify existing behavior and framework mechanics on which the design depends. Support important absence claims with the likely locations or seams inspected.

Treat predecessor engineering artifacts as correctable working knowledge. If program design exposes a substantive flaw in the current-state analysis or architecture, correct the affected artifact and keep the engineering artifacts coherent. Preserve the story unchanged.

Present proposed contracts and behavior as design choices connected to their story or architecture drivers. Use code-like declarations when exactness matters. Favor small code-adjacent representations such as file-tree diffs, call-path trees, type and signature declarations, state tables, concrete examples, and focused pseudocode when they make consequential choices easier to review.

## Boundary

Program design owns exact changed contracts, load-bearing module homes and symbols, concrete collaborators and call paths, representations and invariants, detailed state and failure mechanics, consequential algorithms, compatibility mechanics, and verification seams.

Implementation planning owns the exhaustive file-change inventory, phase and task ordering, construction strategy, temporary breakage, debt repayment, verification commands, and assignment of checks to phases or reviewers. Keep complete function bodies, incidental private helpers, line-by-line code, and implementation sequencing open for downstream work.

Include detailed algorithms, state machines, concurrency, storage, security, privacy, performance, observability, deployment, rollout, and user-interface mechanics when they materially shape this story. Choose representations for decision clarity rather than documentation completeness.

## Completion

The program design is complete when every story outcome and architecture decision has an exact program-level realization; load-bearing module homes, responsibilities, dependencies, call paths, contracts, types, signatures, and representations are settled; a fresh agent can simulate consequential success, failure, state, lifecycle, and race scenarios; compatibility and migration mechanics are precise where required; important invariants and edge cases have viable test seams and observable outcomes; the artifacts agree with verified repository evidence; and an implementation planner can focus on files, phases, dependencies, temporary debt, and verification assignments without choosing a contract, state model, algorithm, ownership rule, or component collaboration.
