#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const D2_ARCHIVE_PLATFORMS = new Map([
  ['darwin-arm64', 'macos-arm64'],
  ['darwin-x64', 'macos-amd64'],
  ['linux-arm64', 'linux-arm64'],
  ['linux-x64', 'linux-amd64'],
]);

function d2ArchiveName(pin, target) {
  const archivePlatform = D2_ARCHIVE_PLATFORMS.get(target);
  if (archivePlatform === undefined) {
    throw new Error(`d2 publishes no archive for target "${target}" (known: ${[...D2_ARCHIVE_PLATFORMS.keys()].join(', ')})`);
  }
  return `d2-v${pin.engine_version}-${archivePlatform}.tar.gz`;
}

function mnemeBinaryName(pin, target) {
  return `mneme-${target}`;
}

const ASSET_NAMING_BY_PLUGIN = new Map([
  ['mneme', mnemeBinaryName],
  ['figura', d2ArchiveName],
]);

export function releaseAssetUrl(pluginName, pin, target) {
  const assetName = ASSET_NAMING_BY_PLUGIN.get(pluginName);
  if (assetName === undefined) {
    throw new Error(`no release asset naming for plugin "${pluginName}" (known: ${[...ASSET_NAMING_BY_PLUGIN.keys()].join(', ')})`);
  }
  return `${pin.base_url}/${assetName(pin, target)}`;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function runCommandLine([bundleArgument, target]) {
  if (bundleArgument === undefined || target === undefined) {
    console.error('release-assets: usage: release-assets.mjs <bundle-dir> <target>');
    process.exit(2);
  }
  const bundleDirectory = resolve(bundleArgument);
  try {
    const pluginName = readJson(resolve(bundleDirectory, '.claude-plugin/plugin.json')).name;
    const pin = readJson(resolve(bundleDirectory, 'bin/release.json'));
    console.log(releaseAssetUrl(pluginName, pin, target));
  } catch (cause) {
    console.error(`release-assets: ${cause.message}`);
    process.exit(1);
  }
}

const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) runCommandLine(process.argv.slice(2));
