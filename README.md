# Coding Harness Config

A collection of my favorite skills, agents, commands, extensions, and related resources for the coding harnesses I use.

It also includes my recommended [Isagi workflows](isagi/workflows/).

## Supported harnesses

| Type | Harness | Resources |
| --- | --- | --- |
| Coding harness | Codex | [`codex/`](codex/) |
| Coding harness | OpenCode | [`opencode/`](opencode/) |
| Coding harness | Pi | [`pi/`](pi/) |
| Coding harness | Claude Code | [`claude/`](claude/) |
| Meta-harness | Isagi | [`isagi/workflows/`](isagi/workflows/) |

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

To generate and install everything for every supported harness:

```sh
pnpm run harness:sync
```

The same pattern is available for the other harnesses: `opencode:install`, `pi:install`, `claude:install`, and `isagi:install`. These commands install directly into each harness's global configuration directory.

## Make it yours

This repository is primarily intended as a reference and source of inspiration. I strongly recommend adapting it to your own needs.

Make changes in [`source/`](source/), since the top-level harness directories are generated. Some skills, agents, commands, and workflows are designed to work closely together, so consider those relationships when changing or removing individual pieces.

After making changes, regenerate and reinstall the resources:

```sh
pnpm run generate
pnpm run harness:install
```

## Credits

Some skills were inspired by [Matt Pocock's skill library](https://github.com/mattpocock/skills).

## License

Licensed under the [Apache License 2.0](LICENSE).
