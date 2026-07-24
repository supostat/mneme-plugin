#!/usr/bin/env node
//
// Generator of the release pin plugin/bin/release.json — the machine-written
// contract between the engine-release dispatch payload and the sed/grep parser
// in plugin/bin/launch.sh. The pin's layout is FIXED AND FLAT (one key per
// line, JSON.stringify with 2-space indent): changing the shape means changing
// the launcher's parser in the same commit.
//
// Modes:
//   node scripts/generate-release-pin.mjs <payload.json> [repoRoot]
//     payload = the repository_dispatch client_payload {version, assets[], sha256{target}};
//     writes plugin/bin/release.json with plugin_version stamped from plugin.json.
//   node scripts/generate-release-pin.mjs --restamp [repoRoot]
//     rewrites ONLY plugin_version in the existing pin from the current
//     plugin.json — the companion of a version bump without an engine release.
//
// Dev tooling: lives at the repo ROOT, never inside plugin/, so it is not
// shipped in the installed bundle.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KNOWN_TARGETS = ['darwin-arm64', 'darwin-x64', 'linux-x64', 'linux-arm64'];

function die(message) {
  console.error(`generate-release-pin: ${message}`);
  process.exit(1);
}

function readJson(path, label) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    die(`${label} not found: ${path}`);
  }
  try {
    return JSON.parse(raw);
  } catch (cause) {
    die(`${label} is not valid JSON (${path}): ${cause.message}`);
  }
  return null;
}

const [firstArg, secondArg] = process.argv.slice(2);
if (firstArg === undefined) {
  die('usage: generate-release-pin.mjs <payload.json>|--restamp [repoRoot]');
}
const repoRoot = secondArg
  ? resolve(secondArg)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pluginManifestPath = resolve(repoRoot, 'plugin/.claude-plugin/plugin.json');
const pinPath = resolve(repoRoot, 'plugin/bin/release.json');

const pluginManifest = readJson(pluginManifestPath, 'plugin.json');
const pluginVersion = pluginManifest.version;
if (typeof pluginVersion !== 'string' || pluginVersion.length === 0) {
  die(`plugin.json carries no version to stamp into the pin (${pluginManifestPath})`);
}

if (firstArg === '--restamp') {
  const pin = readJson(pinPath, 'release.json');
  pin.plugin_version = pluginVersion;
  writeFileSync(pinPath, `${JSON.stringify(pin, null, 2)}\n`);
  console.log(`generate-release-pin: restamped plugin_version=${pluginVersion} in ${pinPath}`);
  process.exit(0);
}

const payload = readJson(resolve(firstArg), 'dispatch payload');

const engineVersion = payload.version;
if (typeof engineVersion !== 'string' || engineVersion.length === 0) {
  die('dispatch payload is missing "version"');
}
if (!Array.isArray(payload.assets) || payload.assets.length === 0) {
  die('dispatch payload is missing a non-empty "assets" array');
}
if (payload.sha256 === null || typeof payload.sha256 !== 'object' || Object.keys(payload.sha256).length === 0) {
  die('dispatch payload is missing a non-empty "sha256" map');
}

const sha256 = {};
for (const [target, checksum] of Object.entries(payload.sha256)) {
  if (!KNOWN_TARGETS.includes(target)) {
    die(`dispatch payload names an unknown target "${target}" (known: ${KNOWN_TARGETS.join(', ')})`);
  }
  if (typeof checksum !== 'string' || !/^[0-9a-f]{64}$/.test(checksum)) {
    die(`dispatch payload sha256 for "${target}" is not a lowercase 64-hex digest`);
  }
  const asset = payload.assets.find((url) => typeof url === 'string' && url.endsWith(`/mneme-${target}`));
  if (asset === undefined) {
    die(`dispatch payload has a sha256 for "${target}" but no asset URL ending in /mneme-${target}`);
  }
  sha256[target] = checksum;
}

const firstAsset = payload.assets[0];
const baseUrl = firstAsset.slice(0, firstAsset.lastIndexOf('/'));
if (!baseUrl.startsWith('https://')) {
  die(`asset URLs must be https, got base "${baseUrl}"`);
}

const pin = {
  engine_version: engineVersion,
  plugin_version: pluginVersion,
  base_url: baseUrl,
  sha256,
};
writeFileSync(pinPath, `${JSON.stringify(pin, null, 2)}\n`);
console.log(`generate-release-pin: pinned engine ${engineVersion} (${Object.keys(sha256).join(', ')}) into ${pinPath}`);
