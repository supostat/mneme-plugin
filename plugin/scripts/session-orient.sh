#!/bin/sh
#
# SessionStart orientation line for the mneme plugin.
#
# Asks the engine binary — through the same launcher the MCP server starts
# with — for the current branch's one-line survey (`survey --brief`) and hands
# it to Claude Code as hook output: `additionalContext` for the agent and
# `systemMessage` for the person, the engine's line byte for byte in both.
#
# Fail-open by construction: a failing launcher (no pin, no dev build, an
# unsupported platform), a silent binary (no unfinished run on this branch,
# detached HEAD, no corpus, a broken .mneme.json) or any other fault means an
# empty stdout and exit 0 — the hook never delays or breaks a session. The
# hooks.json command guards `[ -d "$HOME/.mneme" ]` BEFORE this script runs,
# so a machine without any mneme corpus never spawns it.
#
# The line carries the branch name, which git lets contain `"`; backslashes
# and control characters cannot occur (git rejects them, the engine refuses
# the rest), so the JSON escaping covers exactly `\` and `"`. The engine
# promises one line; only the first is used.

set -u

self_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
launcher="$self_dir/../bin/launch.sh"

line=$("$launcher" survey --brief 2>/dev/null) || exit 0
[ -n "$line" ] || exit 0
line=$(printf '%s\n' "$line" | head -n 1)
escaped=$(printf '%s' "$line" | sed 's/\\/\\\\/g; s/"/\\"/g')
printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"},"systemMessage":"%s"}\n' "$escaped" "$escaped"
