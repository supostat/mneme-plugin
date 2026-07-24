# mneme plugin bundle

Distribution half of a two-repo setup. This repo holds only hand-written
packaging — manifests, skills, hooks, the launcher; the mneme **code** repo
holds the source and drops the compiled server binary into `plugin/bin/`,
where it stays gitignored and is never committed. User-facing install,
update and troubleshooting docs live in the repo-root `README.md`.

## Bundle layout

```
plugin/                # ← the installable bundle; the marketplace source points here
  .claude-plugin/
    plugin.json        # MCP server declaration: command → bin/launch.sh
  skills/              # /mneme:arch, /mneme:plan, /mneme:migrate, /mneme:dev, /mneme:resume
  hooks/
    hooks.json         # SessionStart → launch.sh --warm (cache pre-warm)
  commands/            # reserved, empty
  bin/
    launch.sh          # POSIX sh launcher: local dev build → cached pinned release
    release.json       # machine-generated release pin (appears with the first engine release)
    mneme              # compiled server — generated, gitignored, NOT in git
```

Repo internals (`docs`, `site`, root `scripts/`, `CLAUDE.md`, dot-directories)
stay outside `plugin/`, so the marketplace source `./plugin` bundles only what
an install needs.

## How the server starts

`plugin.json` points at `${CLAUDE_PLUGIN_ROOT}/bin/launch.sh`, never at the raw
binary — an install from GitHub carries no binary at all. The launcher prefers
a local dev build (`bin/mneme` next to it, present after a local build or
`npm run reinstall`); otherwise it resolves the platform target, reads the
machine-generated `bin/release.json` pin, and serves the engine from
`~/.mneme/bin/<engine_version>/`, downloading it from the pinned GitHub Release
on a cache miss — SHA256 is verified **before** `chmod +x`, installs are atomic
`mv`. `launch.sh --warm` walks the same path but never execs; the SessionStart
hook uses it to pre-fill the cache. Every failure is a named stderr line.

## Versioning

The `version` field in `plugin.json` is maintained by automation: the
release-sync workflow patch-bumps it on every engine release, and CI
auto-bumps it when `plugin/` changes land on main without a manual bump.
The pin's `plugin_version` must equal `plugin.json`'s version —
`validate-manifests` enforces the pair, and
`scripts/generate-release-pin.mjs --restamp` repairs a drift.

## Verifying

`npm test` at the repo root runs the whole dependency-free gate chain:
manifest validation, skill-name rules, release-pin rules, workflow structure,
README invariants, and the launcher's five mocked scenarios. During local
iteration `npm run reinstall` re-copies the working tree into the installed
plugin; `/reload-plugins` picks it up in-session.

Landing: site/ → GitHub Pages — `site/index.html` is the self-contained product
landing page (with `site/og.svg` and its raster card `site/og.png` alongside);
it stays outside the plugin bundle and is published to
<https://supostat.github.io/mneme-plugin/> by `.github/workflows/pages.yml`.
