---
description: Create a phased, self-sufficient implementation plan from the current brainstorming context
---

Create a complete implementation plan from the current brainstorming context. The plan will be read by fresh implementers and reviewers with no access to this conversation, so it must preserve the intent and decisions they cannot recover elsewhere while pointing them to repository knowledge they can inspect themselves.

<remarks>
$ARGUMENTS
</remarks>

If `<remarks>` is non-empty, treat it as the user's focus, scope, or emphasis.

## Ground before writing

Mine the conversation for intent, decisions, constraints, rationale, rejected alternatives, and unresolved assumptions. Inspect the relevant repository code, documentation, ADRs, and engineering guidance rather than guessing.

Sort information deliberately:

- Capture conversation residue and the connective reasoning between parts of the implementation.
- Reference existing knowledge with a path or URL plus what to inspect and why; do not copy it into the plan.
- Reference code by file and symbol or concept, not line number.
- Redact secrets, credentials, PII, and other sensitive values.

Ask only about consequential gaps that repository inspection cannot resolve and for which choosing an answer would materially change the plan. Always surface a proposed public/API, wire-format, or database-schema break before committing to it. Otherwise, make a grounded recommendation, state material assumptions in the plan, and keep moving. Do not turn plan creation into a walkthrough; the goal of this command is the complete draft artifact.

## Architectural stance

Plan for the cleanest design and simplest mental model the problem allows, not the smallest diff. Bold refactors and preparatory work are welcome when they make later implementation easier. Honor repository engineering guidance.

Intermediate phases do not need to preserve a working application or a green test suite. Intentional breakage is allowed only under the phase contracts below and must never be ambiguous: name the expected broken state, how the phase itself is verified, and where temporary debt is repaid. Distinguish intentional temporary breakage from permanent removal that belongs to the target architecture.

## Output layout

Write the plan under `scratch/plans/<slug>/`, where `<slug>` is short, descriptive, and kebab-case:

```text
scratch/plans/<slug>/
├── index.md
├── phase-01-<stable-slug>.md
├── phase-02-<stable-slug>.md
└── ...
```

Never overwrite an existing plan directory. If the intended directory exists, append `-2`, `-3`, and so on until the name is free. Create the complete plan directory in one drafting pass. Do not make any edits outside it, and do not create the execution-time decision log.

## Index

`index.md` is the entry point and shared context for the whole effort. Keep it navigable rather than repeating every phase. Include:

- The goal, target architecture, and simplest mental model of the end state.
- Settled global decisions, assumptions, constraints, and meaningful rejected alternatives.
- A concise definition of the four phase types below so the plan is self-descriptive.
- An ordered phase map with a short purpose, type, expected resulting state, and direct link to every phase file.
- Cross-phase dependencies and every temporary degradation with the phase that pays it back.
- The execution-time decision log path: `scratch/plans/<slug>/decisions.md`.

## Phase types

Every phase has exactly one type. Do not invent additional types.

### `prep`

Establishes foundations that make later implementation simpler. It may intentionally leave compilation, tests, features, or integrations broken. Name the permitted breakage precisely, explain why accepting it simplifies the work, define how the prep outcome is verified despite it, and assign every temporary debt to one or more later phases.

### `mock-ui`

Establishes meaningful visual and interaction behavior using fixtures, hardcoded data, or local state without production integration. Use a mock-UI phase for every meaningful new UI unless the user explicitly waived it. Cover the important states and interactions needed for human visual iteration; do not add production wiring merely to make the phase appear complete.

### `implementation`

Delivers a bounded portion of real behavior, integration, refactoring, documentation, or assigned debt repayment. It may inherit explicitly tracked prep debt that belongs to later phases, but it must pay the debt assigned to it and must not introduce unplanned temporary breakage.

### `release`

Contains externally sensitive publication, deployment, migration, or release work. Classify it accurately and describe the work and evidence, but do not prescribe how downstream workflows supervise or route it.

## Phasing

Size phases by reasoning burden, not file count or another numerical heuristic. Each phase should have one dominant implementation objective, a bounded architectural and decision surface, a meaningful expected state, and enough cohesion for one fresh agent. Prefer additional focused phases over a phase that asks a low-reasoning implementer to make several architectural or implementation decisions at once.

Phases need not be user-facing increments. Preparatory refactors, temporary red states, and later integration are legitimate boundaries. Separate meaningful UI exploration from production functionality through a mock-UI phase.

Use stable phase identifiers matching each filename stem. Each phase file must begin with exactly this minimal YAML frontmatter shape:

```yaml
---
type: implementation
depends_on:
  - phase-02-example
pays_back_in: []
---
```

- `type` is one of `prep`, `mock-ui`, `implementation`, or `release`.
- `depends_on` lists prerequisite phase identifiers selected by the planner; use `[]` when empty.
- `pays_back_in` lists the phase identifiers that repay temporary debt introduced here; use `[]` when empty.
- Do not add status, review mode, automation policy, model choice, or workflow behavior to the frontmatter.

## Phase contract

Keep each phase file readable and adapt its structure to the work, but make these items easy to find:

- The intended outcome and its architectural role.
- Relevant settled decisions and assumptions.
- Scope and explicit non-scope.
- Starting conditions and dependencies.
- Implementation guidance at the degree of freedom appropriate to the work: precise where fragile, outcome-oriented where several approaches are valid.
- Direct repository references with what to inspect and why.
- The expected state afterward, including inherited, introduced, repaid, and remaining debt.
- How to verify that the phase is complete.
- A final decision-log handoff.

Verification must name who performs each applicable check. Use only the modes the phase needs:

- **Agent-run checks** — tests, scripts, builds, API calls, browser automation, or other executable evidence.
- **Agent qualitative checks** — bounded inspections or comparisons an implementer or reviewer can judge from the artifact.
- **Human-assisted checks** — the human supplies access or starts infrastructure while the agent performs the check; state each party's part.
- **Human judgment** — visual, interaction, product, or other review that genuinely requires the user.

A phase that intentionally leaves failures must list the expected failing checks or affected surfaces and explain what would count as an unexpected regression.

## Decision log

The plan is mutable until implementation begins. Once implementation starts, implementers treat the plan files as frozen and record execution reality in `decisions.md`.

Tell every phase implementer to read `index.md`, its phase file, and the existing decision log before working. Make the final step of every phase an update under that phase's heading containing decisions and rationale, deviations from the plan, verification evidence, debt introduced or repaid, and anything the next phase must know. The first implementer creates the file.

## Finish

Before reporting completion, reread the plan as a zero-context implementer and reviewer. Check that links and phase identifiers resolve, dependencies and payback references exist, global decisions agree with phase guidance, UI work has the required mock phase unless waived, and the final phase sequence pays all temporary debt.

Report the path to `index.md`.
