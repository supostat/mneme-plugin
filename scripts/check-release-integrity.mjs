#!/usr/bin/env node
//
// Network integrity check of a release pin (plugin/bin/release.json) or a raw
// dispatch payload: every sha256 target must resolve to a downloadable asset
// whose actual digest matches the declared one. Runs in CI and as the
// release-sync guard — NOT in npm test, because it touches the network.
//
// Usage:
//   node scripts/check-release-integrity.mjs <pin-or-payload.json> [--allow-missing]
//     --allow-missing: a missing file exits 0 (the pre-release state in CI).

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const [targetPath, flag] = process.argv.slice(2);
if (!targetPath) {
  console.error('check-release-integrity: usage: check-release-integrity.mjs <pin-or-payload.json> [--allow-missing]');
  process.exit(1);
}
const allowMissing = flag === '--allow-missing';

let raw;
try {
  raw = readFileSync(resolve(targetPath), 'utf8');
} catch {
  if (allowMissing) {
    console.log(`check-release-integrity: ${targetPath} does not exist — pre-release state, nothing to verify.`);
    process.exit(0);
  }
  console.error(`check-release-integrity: file not found: ${targetPath}`);
  process.exit(1);
}

let document;
try {
  document = JSON.parse(raw);
} catch (cause) {
  console.error(`check-release-integrity: ${targetPath} is not valid JSON: ${cause.message}`);
  process.exit(1);
}

if (document?.sha256 === null || typeof document?.sha256 !== 'object' || Object.keys(document.sha256).length === 0) {
  console.error(`check-release-integrity: ${targetPath} carries no non-empty "sha256" map`);
  process.exit(1);
}

function assetUrl(target) {
  if (typeof document.base_url === 'string' && document.base_url.length > 0) {
    return `${document.base_url}/mneme-${target}`;
  }
  if (Array.isArray(document.assets)) {
    return document.assets.find((url) => typeof url === 'string' && url.endsWith(`/mneme-${target}`));
  }
  return undefined;
}

const problems = [];
for (const [target, declared] of Object.entries(document.sha256)) {
  const url = assetUrl(target);
  if (url === undefined) {
    problems.push(`${target}: no asset URL derivable (neither base_url nor a matching assets[] entry)`);
    continue;
  }
  try {
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) {
      problems.push(`${target}: asset is not downloadable — HTTP ${response.status} for ${url}`);
      continue;
    }
    const hash = createHash('sha256');
    for await (const chunk of response.body) hash.update(chunk);
    const actual = hash.digest('hex');
    if (actual !== declared) {
      problems.push(`${target}: checksum mismatch — declared ${declared}, actual ${actual} (${url})`);
    } else {
      console.log(`check-release-integrity: ${target} ok (${url})`);
    }
  } catch (cause) {
    problems.push(`${target}: fetch failed for ${url} — ${cause.message}`);
  }
}

if (problems.length > 0) {
  console.error('check-release-integrity: FAILED:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log('check-release-integrity: every pinned asset exists and hashes to its declared sha256.');
