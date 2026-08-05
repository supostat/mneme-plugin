<div align="center">

# mneme

**Your agent forgets. The canon doesn't.**

Persistent cross-project memory and a phase-workflow engine for Claude Code —
human-gated, local-first, event-sourced. Installed as a plugin.

[![ci](https://github.com/supostat/mneme-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/supostat/mneme-plugin/actions/workflows/ci.yml)
[![pages](https://github.com/supostat/mneme-plugin/actions/workflows/pages.yml/badge.svg)](https://github.com/supostat/mneme-plugin/actions/workflows/pages.yml)
[![release](https://img.shields.io/github/v/tag/supostat/mneme-plugin?label=release&color=b8860b)](https://github.com/supostat/mneme-plugin/tags)

**[→ See it in action: supostat.github.io/mneme-plugin](https://supostat.github.io/mneme-plugin/)**

</div>

---

## What is mneme

Two halves, one MCP server:

- **Memory** — `remember` / `recall` over a file-based note corpus. Nothing is
  ever auto-published: every note passes a **human staging gate** before it can
  surface in recall. Notes anchor to real files in your repos, and recall
  ranks by those anchors — memory that answers where you actually work.
- **Workflow engine** — phases with dependencies, machine-run `done-when`
  gates, bounded retries and an append-only event log. The engine issues
  directives; the agent executes them; the harvest of every phase flows back
  into memory — through the same human gate.

## Why not CLAUDE.md, or the built-in memory

Claude Code already remembers things three ways, and each answers a different
question than mneme does.

**`CLAUDE.md` holds what you decide to write down.** It is the right home for
conventions, commands and architecture notes — instructions that change rarely
and that you author deliberately. It does not accumulate: nothing you learn
mid-session ends up there unless you stop and write it. mneme does not replace
it — the `/mneme:setup` skill inserts a criteria block into yours.

**Built-in auto memory writes notes on its own.** That is the convenience and
the problem: the thing summarising your session is a language model, and a
compressor that paraphrases will occasionally record a discarded idea as a
decision, or invert the reason behind a choice. The result reads authoritative
and arrives at the top of your next session, where the agent trusts it more
than it should. You did not approve it, and you will not notice until it argues
for the wrong thing.

**Auto-capture memory servers scale that same bet.** They add embeddings and a
larger store, but the write path stays automatic: the agent decides what is
worth remembering, and the corpus grows with paraphrase nobody reviewed.

**mneme moves the gate.** The agent proposes; nothing enters the corpus until
you accept it. A staged note shows its type, its body and its anchors before
you decide, and `staging_resolve` is the only way in. What you accept is what
recall can ever surface — the corpus is a record of decisions you signed, not
of what a summariser thought you meant.

Three consequences follow from that one design choice:

- **Retrieval is auditable.** Every recall logs its candidates and scores to an
  append-only event log, so you can replay offline why a note surfaced and
  another did not. Ranking you cannot inspect is ranking you cannot fix.
- **Knowledge rots visibly.** Notes anchor to real files. When an anchor is
  deleted or drifts from HEAD, the note sinks in ranking instead of quietly
  outliving the code it described — and the staging list warns you before you
  accept an anchor git does not track.
- **Nothing is injected raw.** Note bodies are sanitised on the way in *and* on
  the way into a bundle, fail-closed. Stored text that reaches a model is text
  a human accepted and the server re-checked.

**When you do not need mneme:** short, well-scoped work where pointing the agent
at the right files is enough, or a project whose conventions fit in a
`CLAUDE.md` you keep tidy. Memory layers earn their keep on long, exploratory
work — where the expensive knowledge is the dead ends, the rejected options and
the reasons, and where re-deriving them costs more than curating them.

**And memory is only half of it.** The other half is the engine: phases with
dependencies, machine-run gates, an append-only run log and resume across
sessions. Memory is delivered as a pipeline step — the bundle arrives before a
phase starts, the harvest is staged when it closes — so recall is not a habit
the agent has to remember to practise. That loop is the part `CLAUDE.md` and a
memory store cannot assemble between them.

## Key features

- **Human-gated by construction** — the staging queue is a review step, not a
  formality; the agent can propose memory, only you can accept it.
- **Local-first** — the corpus lives in `~/.mneme/`, embeddings come from your
  local Ollama; nothing leaves the machine.
- **Event-sourced** — runs are rebuilt from an append-only JSONL log; a new
  session resumes exactly where the last one stopped.
- **Machine-verified phases** — `done-when` gates are real commands run by the
  engine, not checkbox prose.
- **Eight bundled skills** — `/mneme:setup`, `/mneme:grill`, `/mneme:plan`,
  `/mneme:fix`, `/mneme:dev`, `/mneme:arch`, `/mneme:migrate`,
  `/mneme:resume`: a one-run onboarding checkup as the entry, then raw idea →
  interrogated protocol → spec → phases → gated execution, and a diagnosis
  entry for bugs whose gate is the regression test.

## Quick start

**Prerequisites:** Claude Code (CLI, desktop or IDE extension) on macOS or
Linux, arm64/x64, `curl` available. That is all — recall works out of the box
in full-text (FTS) mode. Vector recall is an optional upgrade: run
**[Ollama](https://ollama.com)** locally, or point `.mneme.json` at any
OpenAI-compatible embedding endpoint; `/mneme:setup` offers the switch.

From any Claude Code session:

```
claude plugin marketplace add supostat/mneme-plugin
claude plugin install mneme@mneme-marketplace
```

Verify with `/mcp`: the `mneme` server should list its tools (`remember`,
`recall`, `staging_list`, `staging_resolve`, `stats`, `workflow_start`,
`workflow_step`).

Then, inside your project, run `/mneme:setup` — a one-time checkup that
diagnoses the wiring, offers digit-gated fixes and walks your first note
through the staging gate.

Update later with `/plugin update` — every engine release bumps the plugin
version automatically, so updates are always visible.

## How the server starts

The plugin ships no binary. A small POSIX-sh launcher downloads the pinned
engine build for your platform from this repo's GitHub Releases into
`~/.mneme/bin/`, verifies its SHA256 against the committed release pin
**before** making it executable, and reuses the cache afterwards; a
SessionStart hook pre-warms the cache so the first real start does not wait.
Bundle internals: [plugin/README.md](plugin/README.md).

## Troubleshooting

The launcher never fails silently: every failure is a named line on stderr,
and `/mcp` shows the server as failed with that message.

| Error line | Meaning | What to do |
| --- | --- | --- |
| `no local build and no release pin` | Installed from GitHub before the engine published its first release — there is nothing to download yet. | Wait for the first engine release, then `/plugin update`. |
| `download failed (no network or missing release asset)` | No connectivity, or the pinned release asset is unavailable. | Check the network and retry; the cache fills on the next start. |
| `checksum mismatch` | The downloaded binary does not match the pinned SHA256. The file is deleted and **nothing is installed or executed**. | Retry; if it persists, the release is corrupt — open an issue. |
| `unsupported platform` / `unsupported architecture` | Not macOS/Linux on arm64/x64. | These four targets are the supported set. |

If the server is up but `recall` answers in degraded mode, that is legitimate:
full-text search works without an embedder. Run `/mneme:setup` for the full
checkup — it names the mode and offers the vector upgrade (Ollama or an
OpenAI-compatible endpoint) without pushing it.
