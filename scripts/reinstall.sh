#!/usr/bin/env bash
#
# Reinstall every plugin of this repo's local marketplace.
#
# A directory-source install re-copies the CURRENT working tree, so uninstall +
# install is what picks up edits to a bundle (manifests, SKILL.md, a rebuilt
# binary) — `claude plugin update` is version-gated and no-ops while a
# plugin.json version is unchanged. This script automates that dance.
#
# Dev tooling: lives at the repo ROOT, never inside a bundle, so it is not
# shipped in any installed plugin (same rule as scripts/validate-manifests.mjs).
#
# Usage: npm run reinstall   (or: bash scripts/reinstall.sh)

set -euo pipefail

readonly MARKETPLACE="mneme-marketplace"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

# Never install a broken bundle: validate the manifests first (fail fast).
echo "→ validating manifests"
npm test

plugin_names="$(node scripts/marketplace-bundles.mjs --names)"

# Register the local marketplace if absent, else refresh its cached listing so
# the current working tree is what gets copied.
if claude plugin marketplace list 2>/dev/null | grep -qF "$MARKETPLACE"; then
  echo "→ refreshing marketplace $MARKETPLACE"
  claude plugin marketplace update "$MARKETPLACE"
else
  echo "→ adding marketplace $MARKETPLACE (from ./)"
  claude plugin marketplace add ./
fi

reinstalled=()
while IFS= read -r plugin_name; do
  ref="${plugin_name}@${MARKETPLACE}"
  # Uninstall the prior copy if present (install alone will not replace it).
  if claude plugin list 2>/dev/null | grep -qF "$ref"; then
    echo "→ uninstalling $ref"
    claude plugin uninstall "$ref"
  fi
  echo "→ installing $ref (copies the current working tree)"
  claude plugin install "$ref"
  reinstalled+=("$ref")
done <<< "$plugin_names"

echo
echo "✔ reinstalled ${reinstalled[*]}"
echo "  The running session still holds the old registrations — run /reload-plugins"
echo "  (or restart the session) to pick up the new ones."
