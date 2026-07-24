# mneme

Persistent cross-project memory for Claude Code: an MCP server with human-gated
`remember` / `recall`, a staging review queue, and a phase-workflow engine —
installed as a Claude Code plugin. Product page: `site/` (GitHub Pages).

## Prerequisites

- **Claude Code** — CLI, desktop app, or IDE extension.
- **Ollama** running locally — mneme computes recall embeddings through it.
  Install from <https://ollama.com> and make sure the daemon is up before the
  first session (the desktop app or `ollama serve`).
- macOS or Linux on arm64/x64, with `curl` available (preinstalled on both).

## Install

From any Claude Code session:

```
claude plugin marketplace add supostat/mneme-plugin
claude plugin install mneme@mneme-marketplace
```

The MCP server starts through a small POSIX-sh launcher: on first start it
downloads the pinned engine binary for your platform from this repo's GitHub
Releases into `~/.mneme/bin/`, verifies its SHA256 against the committed
release pin **before** making it executable, and reuses the cache afterwards.
A SessionStart hook pre-warms the cache so the first real server start does not
wait for the download.

## Verify

Run `/mcp` in the session: the `mneme` server should list its tools
(`remember`, `recall`, `staging_list`, `staging_resolve`, `stats`,
`workflow_start`, `workflow_step`). The bundled skills arrive as
`/mneme:plan`, `/mneme:dev`, `/mneme:arch`, `/mneme:migrate`, `/mneme:resume`.

## Update

```
/plugin update
```

Every engine release bumps the plugin version automatically (the release-sync
workflow commits the new pin and tag), so `/plugin update` sees it.

## Troubleshooting

The launcher never fails silently: every failure is a named line on stderr, and
`/mcp` shows the server as failed with that message.

| Error line | Meaning | What to do |
| --- | --- | --- |
| `no local build and no release pin` | Installed from GitHub before the engine published its first release — there is nothing to download yet. | Wait for the first engine release, then `/plugin update`. |
| `download failed (no network or missing release asset)` | No connectivity, or the pinned release asset is unavailable. | Check the network and retry; the cache fills on the next start. |
| `checksum mismatch` | The downloaded binary does not match the pinned SHA256. The file is deleted and **nothing is installed or executed**. | Retry; if it persists, the release is corrupt — open an issue. |
| `unsupported platform` / `unsupported architecture` | Not macOS/Linux on arm64/x64. | These four targets are the supported set. |

If the server is up but `recall` returns nothing, check that Ollama is running.

Bundle internals and development docs: `plugin/README.md`.
