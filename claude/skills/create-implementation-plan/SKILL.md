---
name: create-implementation-plan
description: Create a phased, self-sufficient implementation plan from the current brainstorming context
disable-model-invocation: true
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

## Documentation scope

Plan repository documentation updates only when explicitly requested, within the related implementation phase rather than a dedicated docs phase. This restriction excludes required plan artifacts and necessary code comments, docstrings, or prose in operational assets.

## Output layout

When the remarks specify an explicit plan directory, use it exactly. It may already contain an `artifacts/` directory; preserve those inputs and write the plan files beside it. Refuse to overwrite an existing `index.md` or phase file.

Otherwise, write the plan under `scratch/plans/<slug>/`, where `<slug>` is short, descriptive, and kebab-case:

```text
scratch/plans/<slug>/
├── index.md
├── phase-01-<stable-slug>.md
├── phase-02-<stable-slug>.md
└── ...
```

When selecting the directory yourself, never overwrite an existing plan directory. If the intended directory exists, append `-2`, `-3`, and so on until the name is free. Create the complete plan in one drafting pass. Do not make any edits outside its directory, and do not create the execution-time decision log.

## Index

`index.md` is the entry point and shared context for the whole effort. Keep it navigable rather than repeating every phase. Include:

- The goal, target architecture, and simplest mental model of the end state.
- Settled global decisions, assumptions, constraints, and meaningful rejected alternatives.
- A concise definition of the three phase types below so the plan is self-descriptive.
- An ordered phase map with a short purpose, type, expected resulting state, and direct link to every phase file.
- Cross-phase dependencies and every temporary degradation with the phase that pays it back.
- The execution-time decision log path: `scratch/plans/<slug>/decisions.md`.

## Phase types

Every phase has exactly one type. Do not invent additional types.

### `prep`

Establishes foundations that make later implementation simpler. It may intentionally leave compilation, tests, features, or integrations broken. Name the permitted breakage precisely, explain why accepting it simplifies the work, define how the prep outcome is verified despite it, and assign every temporary debt to one or more later phases.

### `mock-ui`

Produces a presentation-only UI mock through human-led iteration, with agents helping build and revise it. Cover every meaningful new UI with a mock-UI phase unless the user explicitly waived it.

Use fixtures, hardcoded data, and minimal local state to show appearance and simulated interactions, such as opening a menu or selecting a prepared success state. Assign business logic, real feature behavior, persistence, and production integration to named later `implementation` phases, including functionality that could run entirely locally.

Size each phase around one cohesive screen, flow, or aspect the human can iterate on as a unit. Keep related elements and states together and give unrelated topics separate phases. Human iteration scope determines these boundaries, rather than agent review capacity.

Specify how to open the mock and reach its representative states, and what the human needs to judge before the phase is complete. Agent checks provide supporting evidence; the human owns design decisions and acceptance.

### `implementation`

Delivers a bounded portion of real behavior, integration, refactoring, or assigned debt repayment. It may inherit explicitly tracked prep debt that belongs to later phases, but it must pay the debt assigned to it and must not introduce unplanned temporary breakage.

## Phasing

Break the story's implementation into sizable increments so review can detect problems and meaningfully course-correct before the entire story is implemented. A phase should leave enough evidence to assess the direction while correction can still influence subsequent work without extensive rework.

Balance the cost of correction against execution and review overhead: overly broad phases let too much work accumulate before feedback, while overly small phases waste time and tokens on repeated setup, handoffs, and reviews. For agent-led phases, favor larger increments within that balance: capable implementers and reviewers can assess substantial code, so code volume alone is not a reason to split. For `mock-ui`, follow the human-led sizing guidance in its phase definition.

Phases need not be user-facing increments. Preparatory refactors, temporary red states, and later integration are legitimate boundaries.

Use stable phase identifiers matching each filename stem. Each phase file must begin with exactly this minimal YAML frontmatter shape:

```yaml
---
type: implementation
depends_on:
  - phase-02-example
pays_back_in: []
---
```

- `type` is one of `prep`, `mock-ui`, or `implementation`.
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

Specify in `index.md` that `decisions.md` is strictly append-only: preserve existing entries unchanged and append corrections or superseding decisions as new entries that reference the earlier ones. It records execution decisions and their supporting context, never task or phase statuses, progress tracking, or completion checklists; keep any such tracking outside the decision log.

Tell every phase implementer to read `index.md`, its phase file, and the existing decision log before working. Make the final step of every phase append a new entry identifying the phase and containing decisions and rationale, deviations from the plan, relevant verification evidence, debt decisions, and anything the next phase must know. The first implementer creates the file.

## Finish

Before reporting completion, reread the plan as a zero-context implementer and reviewer. Check that links and phase identifiers resolve, dependencies and payback references exist, global decisions agree with phase guidance, each phase satisfies its type definition and contract, UI work has mock-phase coverage unless waived, and the final phase sequence pays all temporary debt.

Report the path to `index.md`.
