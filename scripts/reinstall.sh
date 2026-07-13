#!/usr/bin/env bash
#
# Reinstall the mneme plugin from this repo's local marketplace.
#
# A directory-source install re-copies the CURRENT working tree, so uninstall +
# install is what picks up edits to the plugin (manifests, SKILL.md, a rebuilt
# bin/mneme) — `claude plugin update` is version-gated and no-ops while
# plugin.json's version is unchanged. This script automates that dance.
#
# Dev tooling: lives at the repo ROOT, never inside plugin/, so it is not shipped
# in the installed bundle (same rule as scripts/validate-manifests.mjs).
#
# Usage: npm run reinstall   (or: bash scripts/reinstall.sh)

set -euo pipefail

readonly PLUGIN="mneme"
readonly MARKETPLACE="mneme-marketplace"
readonly REF="${PLUGIN}@${MARKETPLACE}"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

# Never install a broken bundle: validate the manifests first (fail fast).
echo "→ validating manifests"
npm test

# Register the local marketplace if absent, else refresh its cached listing so
# the current working tree is what gets copied.
if claude plugin marketplace list 2>/dev/null | grep -q "$MARKETPLACE"; then
  echo "→ refreshing marketplace $MARKETPLACE"
  claude plugin marketplace update "$MARKETPLACE"
else
  echo "→ adding marketplace $MARKETPLACE (from ./)"
  claude plugin marketplace add ./
fi

# Uninstall the prior copy if present (install alone will not replace it).
if claude plugin list 2>/dev/null | grep -q "$REF"; then
  echo "→ uninstalling $REF"
  claude plugin uninstall "$REF"
fi

echo "→ installing $REF (copies the current working tree)"
claude plugin install "$REF"

echo
echo "✔ reinstalled $REF"
echo "  The running session still holds the old registration — run /reload-plugins"
echo "  (or restart the session) to pick up the new one."
