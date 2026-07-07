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
| mneme **CODE** repo (`~/Projects/.../mneme`, already exists) | Development & build | `src/`, tests, and `scripts/build-plugin.ts` (added in Phase 2), which compiles the server and drops the binary into this repo's `bin/`. |
| **mneme-plugin** (this repo) | Distribution | Hand-written behavior tracked in git; the compiled `bin/mneme` is produced from the code repo and gitignored. |

In short: **what the user installs** lives here; **what the developer builds** lives
in the code repo.

## Repo layout

```
.claude-plugin/
  plugin.json        # declares the mneme MCP server
  marketplace.json   # self-marketplace entry for this plugin
skills/              # reserved — arch stub arrives in a later phase
commands/            # reserved, empty
hooks/               # reserved, empty
bin/mneme            # compiled server — generated, gitignored, NOT in this repo
README.md
package.json          # npm test → manifest validation
scripts/
  validate-manifests.mjs   # dependency-free node validator
```

## Verifying

Run `npm test` — a dependency-free node script validates both manifests: JSON
well-formedness, required fields (kebab-case names, owner, plugin sources
starting with `./`), and that no absolute path leaks into the distributed
manifest (the MCP command must use `${CLAUDE_PLUGIN_ROOT}`).

## The compiled binary

`bin/mneme` is a ~92 MB self-contained binary produced by `bun build --compile`
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

The plugin version is stamped from the code repo by the Phase 2 build-script; it
is not authoritative in git. During development, Claude Code tracks updates by git
commit SHA (there is no `version` field yet).

## Install (target — to be proven in Phase 3)

This is the intended flow, verified once the binary exists:

```
/plugin marketplace add ./
/plugin install mneme@mneme-marketplace
```

## Status

Phase 1 skeleton: manifests plus empty reserved directories. No `version` field
yet (intentional) — the real version is stamped from the code repo by the Phase 2
build-script.
