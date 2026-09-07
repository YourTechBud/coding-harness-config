# Coding Harness Config

A collection of my favorite skills, agents, commands, extensions, and related resources for the coding harnesses I use.

It also includes my recommended [Isagi workflows](isagi/workflows/).

## Supported harnesses

| Type           | Harness     | Resources                              |
| -------------- | ----------- | -------------------------------------- |
| Coding harness | Codex       | [`codex/`](codex/)                     |
| Coding harness | OpenCode    | [`opencode/`](opencode/)               |
| Coding harness | Pi          | [`pi/`](pi/)                           |
| Coding harness | Claude Code | [`claude/`](claude/)                   |
| Meta-harness   | Isagi       | [`isagi/workflows/`](isagi/workflows/) |

## Installation

Clone the repository and install its dependencies:

```sh
git clone https://github.com/YourTechBud/coding-harness-config.git
cd coding-harness-config
pnpm install --frozen-lockfile
```

Install the resources for a specific harness with its install command. For example, to install the Codex resources:

```sh
pnpm run codex:install
```

This copies the resources into your global Codex directory: `${CODEX_HOME:-~/.codex}`.

To generate and install resources for all harnesses:

```sh
pnpm run harness:sync
```

The same pattern is available for the other harnesses: `opencode:install`, `pi:install`, `claude:install`, and `isagi:install`. These commands install directly into each harness's global configuration directory.

## Common instructions (optional)

Share instructions such as repository locations and writing preferences across Codex, OpenCode, Pi, and Claude Code. These can be personal, so review [`source/instructions/`](source/instructions/) before installing them.

**Normal install and sync commands leave instructions untouched.** Install or update them separately:

```sh
pnpm run harness:instructions
```

To write your own, add plain Markdown files without front matter under `source/instructions/`. Name them `01-repository-locations.md`, `02-writing-style.md`, and so on to control their order. Run `pnpm run generate` after editing, then apply them with the command above.

Reapplying adds new instructions, updates existing ones, and removes deleted ones. Local edits to instructions installed by this repo are overwritten; unrelated instructions are left alone.

For Pi, install the extensions first with `pnpm run pi:install`, then restart Pi or run `/reload`.

## Removing resources

```sh
pnpm run harness:clear
```

Removes resources and common instructions installed by this repo, while keeping unrelated user content. Use a command such as `pnpm run codex:clear` to clear just one harness.

## Make it yours

This repository is primarily intended as a reference and source of inspiration. I strongly recommend adapting it to your own needs.

Make changes in [`source/`](source/), since the top-level harness directories are generated. Some skills, agents, commands, and workflows are designed to work closely together, so consider those relationships when changing or removing individual pieces.

After making changes, regenerate and reinstall the resources:

```sh
pnpm run generate
pnpm run harness:install
```

## Credits

Some skills were inspired by:

- [Matt Pocock's skill library](https://github.com/mattpocock/skills)
- [HumanLayer's skill library](https://github.com/humanlayer/skills)

## License

Licensed under the [Apache License 2.0](LICENSE).
