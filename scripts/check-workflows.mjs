#!/usr/bin/env node
//
// Structural gate for the two GitHub workflows. Their EXECUTION is GitHub-side
// and locally unreproducible, so this gate pins what IS machine-checkable: the
// triggers, the presence of every load-bearing step, and the ORDER that makes
// release-sync safe — the integrity guard strictly before pin generation,
// and pin generation strictly before commit/tag.
//
// Dev tooling: lives at the repo ROOT, never inside plugin/, so it is not
// shipped in the installed bundle.
//
// Usage: node scripts/check-workflows.mjs   (also runs as part of npm test)

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(dirname(fileURLToPath(import.meta.url)), '..');

const failures = [];

function load(relativePath) {
  try {
    return readFileSync(resolve(repoRoot, relativePath), 'utf8');
  } catch {
    failures.push(`${relativePath}: file not found`);
    return null;
  }
}

function requireMarker(relativePath, text, marker, why) {
  if (text !== null && !text.includes(marker)) {
    failures.push(`${relativePath}: missing "${marker}" — ${why}`);
  }
}

function requireOrder(relativePath, text, earlier, later, why) {
  if (text === null) return;
  const earlierIndex = text.indexOf(earlier);
  const laterIndex = text.indexOf(later);
  if (earlierIndex === -1 || laterIndex === -1) return; // presence is reported separately
  if (earlierIndex > laterIndex) {
    failures.push(`${relativePath}: "${earlier}" must come BEFORE "${later}" — ${why}`);
  }
}

const releaseSyncPath = '.github/workflows/release-sync.yml';
const releaseSync = load(releaseSyncPath);
requireMarker(releaseSyncPath, releaseSync, 'repository_dispatch', 'the sync must be dispatch-triggered');
requireMarker(releaseSyncPath, releaseSync, 'engine-release', 'the dispatch type filter must be pinned');
requireMarker(releaseSyncPath, releaseSync, 'check-release-integrity.mjs', 'the integrity guard step is load-bearing');
requireMarker(releaseSyncPath, releaseSync, 'generate-release-pin.mjs', 'the pin generation step is load-bearing');
requireMarker(releaseSyncPath, releaseSync, '--restamp', 'the version bump must restamp plugin_version into the pin');
requireMarker(releaseSyncPath, releaseSync, 'git tag', 'the sync must tag the bumped version');
requireOrder(
  releaseSyncPath,
  releaseSync,
  'check-release-integrity.mjs',
  'generate-release-pin.mjs',
  'a dispatch with bad assets must fail BEFORE anything is generated',
);
requireOrder(
  releaseSyncPath,
  releaseSync,
  'generate-release-pin.mjs',
  'git tag',
  'commit/tag must be the LAST thing that happens, after every check',
);

const ciPath = '.github/workflows/ci.yml';
const ci = load(ciPath);
requireMarker(ciPath, ci, 'pull_request', 'PRs must run the gate');
requireMarker(ciPath, ci, 'npm test', 'the local gate chain must run in CI');
requireMarker(ciPath, ci, 'shellcheck plugin/bin/launch.sh', 'the launcher shellcheck gate must run in CI');
requireMarker(ciPath, ci, 'check-release-integrity.mjs', 'the pinned assets must be verified in CI');
requireMarker(ciPath, ci, '--allow-missing', 'CI integrity must tolerate the pre-release state (no pin yet)');
requireMarker(
  ciPath,
  ci,
  "github.actor != 'github-actions[bot]'",
  'the auto-bump actor guard breaks the bump-on-bump loop',
);

const pagesPath = '.github/workflows/pages.yml';
const pages = load(pagesPath);
requireMarker(pagesPath, pages, 'workflow_dispatch', 'the landing must be publishable on demand, before any site/ push');
requireMarker(pagesPath, pages, "'site/**'", 'the push trigger must fire on landing changes only');
requireMarker(pagesPath, pages, 'upload-pages-artifact', 'the site/ upload step is load-bearing');
requireMarker(pagesPath, pages, 'path: site', 'the artifact must be the site/ directory, not the repo root');
requireMarker(pagesPath, pages, 'deploy-pages', 'the deploy step is load-bearing');
requireOrder(
  pagesPath,
  pages,
  'upload-pages-artifact',
  'deploy-pages',
  'the artifact must exist before it is deployed',
);

if (failures.length > 0) {
  console.error('Workflow structure check FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('Workflow structure check passed: triggers, guards and their order are in place.');
