#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MARKETPLACE_MANIFEST_PATH = '.claude-plugin/marketplace.json';
const LOCAL_SOURCE_PREFIX = './';

export function readMarketplaceBundles(repoRoot) {
  const manifestPath = resolve(repoRoot, MARKETPLACE_MANIFEST_PATH);
  let raw;
  try {
    raw = readFileSync(manifestPath, 'utf8');
  } catch {
    throw new Error(`${MARKETPLACE_MANIFEST_PATH}: file not found under ${repoRoot}`);
  }
  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch (cause) {
    throw new Error(`${MARKETPLACE_MANIFEST_PATH}: invalid JSON — ${cause.message}`);
  }
  if (!Array.isArray(manifest?.plugins)) {
    throw new Error(`${MARKETPLACE_MANIFEST_PATH}: "plugins" must be an array`);
  }
  return manifest.plugins
    .filter((plugin) => typeof plugin?.source === 'string' && plugin.source.startsWith(LOCAL_SOURCE_PREFIX))
    .map((plugin) => {
      const relativeDirectory = posix.normalize(plugin.source);
      return {
        name: plugin.name,
        source: plugin.source,
        relativeDirectory,
        directory: resolve(repoRoot, relativeDirectory),
      };
    });
}

function runCommandLine(argumentList) {
  const [mode, rootArgument] = argumentList;
  if (mode !== '--names') {
    console.error('marketplace-bundles: usage: marketplace-bundles.mjs --names [repoRoot]');
    process.exit(2);
  }
  const repoRoot = rootArgument
    ? resolve(rootArgument)
    : resolve(dirname(fileURLToPath(import.meta.url)), '..');
  let bundles;
  try {
    bundles = readMarketplaceBundles(repoRoot);
  } catch (cause) {
    console.error(`marketplace-bundles: ${cause.message}`);
    process.exit(1);
  }
  for (const bundle of bundles) console.log(bundle.name);
}

const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) runCommandLine(process.argv.slice(2));
