#!/bin/sh
#
# UserPromptSubmit diary line for the mneme plugin.
#
# Asks the engine binary — through the same launcher the MCP server starts
# with — for the one-line diary brief (`diary --brief`): the branch's last
# finished run that has no diary entry yet, and the memory gaps left open since
# the session's last note. The line goes to the agent as `additionalContext`,
# byte for byte; nothing goes to the person — the hook runs on every prompt,
# and what the person sees is the agent acting on the line, not the line.
#
# Fail-open by construction: a failing launcher (no pin, no dev build, an
# unsupported platform), an engine without the subcommand (exit 2 with usage),
# a silent binary (nothing to note, no corpus, a broken .mneme.json) or any
# other fault means an empty stdout and exit 0 — the hook never delays a
# prompt. The hooks.json command guards `[ -d "$HOME/.mneme" ]` BEFORE this
# script runs, so a machine without any mneme corpus never spawns it. stdin is
# not read, as in session-orient.sh.
#
# The line carries recall queries, which may contain `"` and `\`; the engine
# folds control characters and line separators into spaces, so the JSON
# escaping covers exactly `\` and `"`. The engine promises one line; only the
# first is used.

set -u

self_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
launcher="$self_dir/../bin/launch.sh"

line=$("$launcher" diary --brief 2>/dev/null) || exit 0
[ -n "$line" ] || exit 0
line=$(printf '%s\n' "$line" | head -n 1)
escaped=$(printf '%s' "$line" | sed 's/\\/\\\\/g; s/"/\\"/g')
printf '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"%s"}}\n' "$escaped"
