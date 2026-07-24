#!/usr/bin/env node
//
// README invariants gate. The root README.md is the user-facing document: it
// must carry the two install commands, the Ollama prerequisite and the
// launcher's named failure modes. plugin/README.md is the bundle reference: it
// must stay free of version literals (they drift the moment automation bumps
// plugin.json) and must keep the "Landing: site/" line that check-landing.mjs
// also pins.
//
// Dev tooling: lives at the repo ROOT, never inside plugin/, so it is not
// shipped in the installed bundle.
//
// Usage: node scripts/check-readme.mjs   (also runs as part of npm test)

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

const ROOT_README_REQUIRED = [
  ['claude plugin marketplace add supostat/mneme-plugin', 'the marketplace-add install command'],
  ['claude plugin install mneme@mneme-marketplace', 'the plugin-install command'],
  ['Ollama', 'the Ollama prerequisite'],
  ['/mcp', 'the /mcp verification step'],
  ['/plugin update', 'the update command'],
  ['checksum mismatch', 'the checksum-mismatch troubleshooting entry'],
  ['unsupported platform', 'the unsupported-platform troubleshooting entry'],
  ['no local build and no release pin', 'the pre-release troubleshooting entry'],
];

const rootReadme = load('README.md');
if (rootReadme !== null) {
  for (const [marker, why] of ROOT_README_REQUIRED) {
    if (!rootReadme.includes(marker)) {
      failures.push(`README.md: missing "${marker}" — ${why}`);
    }
  }
}

const SEMVER_LITERAL = /\b\d+\.\d+\.\d+\b/;

const bundleReadme = load('plugin/README.md');
if (bundleReadme !== null) {
  const literal = bundleReadme.match(SEMVER_LITERAL);
  if (literal !== null) {
    failures.push(
      `plugin/README.md: carries the version literal "${literal[0]}" — versions are maintained by automation and README copies drift; describe the mechanism, not the number`,
    );
  }
  if (!bundleReadme.includes('Landing: site/')) {
    failures.push('plugin/README.md: the "Landing: site/" line is required (check-landing.mjs pins it too)');
  }
}

if (failures.length > 0) {
  console.error('README check FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('README check passed: install/troubleshooting invariants hold and the bundle reference is version-literal-free.');
