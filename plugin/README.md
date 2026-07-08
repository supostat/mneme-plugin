# mneme-plugin

Distribution repo for **mneme** — the persistent-memory MCP server for Claude Code, packaged as an installable plugin.

## What this repo is

This is the *distribution* half of a two-repo setup. It holds only hand-written
packaging: the plugin manifests, the self-marketplace declaration, the reserved
skills/commands/hooks directories, and the MCP server declaration. It does **not**
contain mneme's source code.

## Two-repo boundary

The split is by **role**, not by artifact type.

| Repo | Role | Contents |
| --- | --- | --- |
| mneme **CODE** repo (`~/Projects/.../mneme`, already exists) | Development & build | `src/`, tests, and `scripts/build-plugin.ts` (added in Phase 2), which compiles the server and drops the binary into this repo's `plugin/bin/`. |
| **mneme-plugin** (this repo) | Distribution | Hand-written behavior tracked in git; the compiled `plugin/bin/mneme` is produced from the code repo and gitignored. |

In short: **what the user installs** lives here; **what the developer builds** lives
in the code repo.

## Repo layout

```
.claude-plugin/
  marketplace.json   # self-marketplace entry (stays at repo root; source → ./plugin)
package.json         # dev harness: npm test → manifest validation (NOT shipped)
scripts/
  validate-manifests.mjs   # dependency-free node validator (dev tooling, NOT shipped)
plugin/              # ← the installable bundle; the marketplace source points here
  .claude-plugin/
    plugin.json      # declares the mneme MCP server
  skills/
    mneme__arch/SKILL.md  # /mneme:arch — read-only architecture-analysis skill
  commands/          # reserved, empty
  hooks/             # reserved, empty
  bin/mneme          # compiled server — generated, gitignored, NOT in this repo
  README.md
```

The installable plugin lives under `plugin/`, so the marketplace source `./plugin`
bundles only plugin artifacts — repo internals (`.dev-vault`, `.claude`, `.mcp.json`,
`.engram`, `CLAUDE.md`, `docs`) stay outside the bundle. The install commands
(`/plugin marketplace add ./`) are unchanged, since the marketplace stays at the repo root.

## Verifying

Run `npm test` — a dependency-free node script validates both manifests: JSON
well-formedness, required fields (kebab-case names, owner, plugin sources
starting with `./`), and that no absolute path leaks into the distributed
manifest (the MCP command must use `${CLAUDE_PLUGIN_ROOT}`).

## The compiled binary

`plugin/bin/mneme` is a ~62 MB self-contained binary produced by `bun build --compile`
in the code repo (it bundles `bun:sqlite`, so there is no external runtime to
install). It is gitignored, reproducible from source, and never committed. The
manifest points at it via `${CLAUDE_PLUGIN_ROOT}/bin/mneme`, so the path resolves
wherever the plugin happens to be installed.

## Why a plugin

A plugin gives versioned, portable installs (`/plugin update`) instead of manual
per-project wiring. Previously a server like this was wired per-project through a
local `.mcp.json` that ran `bun run src/mcp-server.ts` behind brittle absolute
paths — fragile across machines and GUI PATHs. The plugin replaces that pattern
with one versioned, portable install.

The plugin version in `plugin/.claude-plugin/plugin.json` is stamped from the code repo's
`package.json` by the build-script — it currently reads `0.1.0`. Claude Code uses that
field to detect updates: `/plugin update` pulls a new build only when the version is
bumped. To cut a release, bump the version in the code repo and rebuild; the build-script
restamps `plugin.json`. (Claude Code's git-SHA update tracking only applies while a plugin
declares no `version` — which no longer holds here.)

## Install

From a Claude Code session, install the plugin from its self-marketplace (this repo):

```
/plugin marketplace add ./
/plugin install mneme@mneme-marketplace
```

`marketplace add ./` registers this repo as a local marketplace; `install
mneme@mneme-marketplace` installs the `mneme` plugin from it. After install, the mneme MCP
server starts from the plugin — verify with `/mcp`: the `mneme` server lists its five tools
(`remember`, `recall`, `staging_list`, `staging_resolve`, `stats`), exposed under
plugin-namespaced names (`mcp__plugin_mneme_mneme__remember`, `…__recall`, …). The bundled
`/mneme:arch` skill is picked up on install too — a read-only architecture-analysis skill
anchored on mneme `recall` and generic repo docs (`CLAUDE.md`, `docs/`, `README`).

## Update

```
/plugin update
```

Claude Code pulls a new build only when `plugin/.claude-plugin/plugin.json` declares a **higher**
`version`. Releasing an update means bumping the version in the code repo and rebuilding —
the build-script restamps `plugin.json`. Rebuilding at the **same** version leaves `/plugin
update` reporting "already latest", and the fresh binary is skipped. During local iteration,
`/reload-plugins` hot-reloads the installed plugin (including `SKILL.md` edits) without a
version bump or reinstall.

## Migrating from manual `.mcp.json` registration

If one of your projects wired mneme by hand — a `.mcp.json` entry running the server behind
an absolute path, plus per-project copies of the arch skill — the plugin replaces both:

- **MCP server** — remove the `mneme` entry from that project's `.mcp.json` and install the
  plugin instead. The plugin's server is portable (`${CLAUDE_PLUGIN_ROOT}/bin/mneme`) and
  versioned. You can tell the server comes from the plugin, not a local `.mcp.json`: its tools
  appear as `mcp__plugin_mneme_mneme__*` (a local `.mcp.json` registration would expose them
  as `mcp__mneme__*`).
- **Skill** — delete the per-project arch copies; the plugin ships it as `/mneme:arch`,
  updated centrally via `/plugin update`.

## Status

Manifests are valid, the compiled server is produced by the code repo's build-script, and
`plugin/.claude-plugin/plugin.json` declares `version` `0.1.0` (stamped from the code repo). The
repo ships the `/mneme:arch` skill and the install/update/migration docs above.
Installing the plugin and confirming the server and skill are picked up in-session is the
final, hands-on step of this phase.
