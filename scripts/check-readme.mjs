#!/usr/bin/env node
//
// README invariants gate. The root README.md is the user-facing document: it
// must carry the two install commands, the Ollama prerequisite, the optional
// design-server prerequisites IN THEIR PLACE (a prerequisite that follows the
// install commands is read too late) and the launcher's named failure modes.
// Every bundle's README.md is that bundle's reference: it must stay free of
// version literals, which drift the moment automation bumps the bundle's
// plugin.json. mneme's plugin/README.md must also keep the "Landing: site/"
// line that check-landing.mjs pins too.
//
// Dev tooling: lives at the repo ROOT, never inside plugin/, so it is not
// shipped in the installed bundle.
//
// Usage: node scripts/check-readme.mjs   (also runs as part of npm test)

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMarketplaceBundles } from './marketplace-bundles.mjs';

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

const ROOT_README_REQUIRED = [
  ['claude plugin marketplace add supostat/mneme-plugin', 'the marketplace-add install command'],
  ['claude plugin install mneme@mneme-marketplace', 'the plugin-install command'],
  ['Ollama', 'the optional Ollama vector upgrade'],
  ['/mneme:setup', 'the one-time onboarding checkup step'],
  ['## Why not CLAUDE.md, or the built-in memory', 'the positioning section (its short twin lives on the landing)'],
  ['/mcp', 'the /mcp verification step'],
  ['/plugin update', 'the update command'],
  ['checksum mismatch', 'the checksum-mismatch troubleshooting entry'],
  ['unsupported platform', 'the unsupported-platform troubleshooting entry'],
  ['no local build and no release pin', 'the pre-release troubleshooting entry'],
  ['https://supostat.github.io/mneme-plugin/', 'the published landing link'],
];

const rootReadme = load('README.md');
if (rootReadme !== null) {
  for (const [marker, why] of ROOT_README_REQUIRED) {
    if (!rootReadme.includes(marker)) {
      failures.push(`README.md: missing "${marker}" — ${why}`);
    }
  }
}

// The optional design-server prerequisites are POSITIONAL: a substring test
// anywhere in the file would pass with the block parked under Troubleshooting.
const QUICK_START_HEADING = '## Quick start';
const PREREQUISITES_BLOCK = '**Prerequisites:**';
const DESIGN_SERVER_BLOCK = '**Design server (optional):**';

if (rootReadme !== null) {
  const quickStartAt = rootReadme.indexOf(QUICK_START_HEADING);
  if (quickStartAt === -1) {
    failures.push(`README.md: no "${QUICK_START_HEADING}" section — the install flow has no home`);
  } else {
    const nextHeadingAt = rootReadme.indexOf('\n## ', quickStartAt + QUICK_START_HEADING.length);
    const quickStart = rootReadme.slice(quickStartAt, nextHeadingAt === -1 ? undefined : nextHeadingAt);
    const prerequisitesAt = quickStart.indexOf(PREREQUISITES_BLOCK);
    const designServerAt = quickStart.indexOf(DESIGN_SERVER_BLOCK);
    if (prerequisitesAt === -1) {
      failures.push(`README.md: "${PREREQUISITES_BLOCK}" is missing from ${QUICK_START_HEADING}`);
    }
    if (designServerAt === -1) {
      failures.push(
        `README.md: "${DESIGN_SERVER_BLOCK}" is missing from ${QUICK_START_HEADING} — the launcher needs bun and a Melete checkout, and nothing else in the docs states that`,
      );
    } else if (prerequisitesAt !== -1 && designServerAt < prerequisitesAt) {
      failures.push(
        `README.md: "${DESIGN_SERVER_BLOCK}" stands BEFORE "${PREREQUISITES_BLOCK}" — the optional prerequisite must follow the mandatory one`,
      );
    }
  }
}

const SEMVER_LITERAL = /\b\d+\.\d+\.\d+\b/;

function listBundles() {
  try {
    return readMarketplaceBundles(repoRoot);
  } catch (cause) {
    failures.push(cause.message);
    return [];
  }
}

for (const bundle of listBundles()) {
  const readmePath = `${bundle.relativeDirectory}/README.md`;
  const bundleReadme = load(readmePath);
  if (bundleReadme === null) continue;
  const literal = bundleReadme.match(SEMVER_LITERAL);
  if (literal !== null) {
    failures.push(
      `${readmePath}: carries the version literal "${literal[0]}" — versions are maintained by automation and README copies drift; describe the mechanism, not the number`,
    );
  }
}

const LANDING_README = 'plugin/README.md';
const landingReadme = load(LANDING_README);
if (landingReadme !== null && !landingReadme.includes('Landing: site/')) {
  failures.push(`${LANDING_README}: the "Landing: site/" line is required (check-landing.mjs pins it too)`);
}

if (failures.length > 0) {
  console.error('README check FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(
  'README check passed: install/troubleshooting invariants hold, the design-server prerequisites sit inside Quick start after the mandatory ones, and every bundle reference is version-literal-free.',
);
