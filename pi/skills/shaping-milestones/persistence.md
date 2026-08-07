# Persistence

Use `docs/milestone-guidance.md` as the repository-specific source of truth for milestone and story representation. It defines the storage system, exact formats, headings, fields, metadata, relationships, and publication behavior for that repository.

## Using Repository Guidance

Read the complete repository guidance before drafting persisted artifacts. Apply its representation choices while preserving the milestone and story semantics defined by this skill.

When persistence is requested and `docs/milestone-guidance.md` is absent, help the user establish it before publishing milestone or story objects. Treat setup as a brainstorming branch: understand the target system and desired review experience, converge on the mapping, and write the guidance only after the user approves persistence.

## Persistence Operations

Repository guidance maps the milestone-to-story relationship and story kinds defined in `SKILL.md` onto its chosen storage system. It also maps these persistence operations and conditional relationships:

- Create, retrieve, revise, remove, complete, preview, and publish milestones and stories.
- Preserve navigation through the milestone-to-story relationship.
- Represent story acceptance criteria.
- Represent dependencies when one story genuinely gates another.
- Identify the milestone or downstream stories that consume an exploration story's conclusions.
- Support splitting and merging by revising the affected story set and relationships.

The storage system may express these semantics through documents, tracker relationships, fields, labels, links, or native primitives. Repository guidance chooses the representation.

## Creating Repository Guidance

Help the user decide the mappings their repository needs:

- Where milestones and stories live and how they are identified.
- The exact milestone and story formats, including required and optional content.
- How parent-child navigation, dependencies, and exploration consumers are represented.
- How story kinds, lifecycle state, priority, or other useful metadata are represented.
- Whether persistence is previewed before publication or published directly after approval.
- How revisions, removals, completion, and historical scope changes appear.
- Which tools or commands perform repository-specific reads and writes.

Write the resulting decisions to `docs/milestone-guidance.md`. Keep the document specific enough that a fresh agent can retrieve and persist the repository's milestones and stories without reconstructing the mapping.

## Persisting Shared Understanding

Mine the conversation for product intent, decisions, rationale, serious alternatives, tradeoffs, unresolved areas, boundaries, and story context that would be expensive to rediscover. Use the repository guidance's structure and include only sections supported by meaningful content.

Preserve existing user-written context and material historical reasoning when revising artifacts. Prefer focused updates when the milestone's scope or story set changes, and keep ordinary engineering execution detail with the story's working conversation or temporary plan.

For exploration stories, acceptance requires reconciliation through this skill: apply the conclusions to the parent milestone and every affected downstream story, then persist those changes through the repository guidance.
