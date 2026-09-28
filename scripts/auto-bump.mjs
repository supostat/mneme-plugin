#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMarketplaceBundles } from './marketplace-bundles.mjs';

const PIN_GENERATOR = resolve(dirname(fileURLToPath(import.meta.url)), 'generate-release-pin.mjs');
const MANIFEST_PATH_IN_BUNDLE = '.claude-plugin/plugin.json';
const PIN_PATH_IN_BUNDLE = 'bin/release.json';
const PATCH_BUMPABLE_VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

function git(...argumentList) {
  const result = spawnSync('git', argumentList, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${argumentList.join(' ')} failed: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

function gitLines(...argumentList) {
  const output = git(...argumentList);
  return output === '' ? [] : output.split('\n');
}

function manifestPathOf(bundle) {
  return `${bundle.relativeDirectory}/${MANIFEST_PATH_IN_BUNDLE}`;
}

function versionAt(revision, manifestPath) {
  const manifestExistsAtRevision = git('ls-tree', '--name-only', revision, '--', manifestPath) !== '';
  return manifestExistsAtRevision ? JSON.parse(git('show', `${revision}:${manifestPath}`)).version : undefined;
}

function introducesVersion(commit, manifestPath) {
  const version = versionAt(commit, manifestPath);
  const parents = gitLines('rev-parse', `${commit}^@`);
  return version !== undefined && parents.every((parent) => versionAt(parent, manifestPath) !== version);
}

function findVersionBase(manifestPath) {
  const commitsTouchingManifest = gitLines('log', '--topo-order', '--format=%H', '--', manifestPath);
  const versionBase = commitsTouchingManifest.find((commit) => introducesVersion(commit, manifestPath));
  if (versionBase === undefined) {
    throw new Error(`${manifestPath}: no commit gives the manifest a version, so there is no base to bump from`);
  }
  return versionBase;
}

function changedSinceVersionBase(bundle) {
  const versionBase = findVersionBase(manifestPathOf(bundle));
  return git('log', '-1', '--format=%H', `${versionBase}..HEAD`, '--', bundle.relativeDirectory) !== '';
}

function nextPatchVersion(version, manifestPath) {
  const versionParts = PATCH_BUMPABLE_VERSION.exec(version);
  if (versionParts === null) {
    throw new Error(`${manifestPath}: version "${version}" is not MAJOR.MINOR.PATCH, so it cannot be patch-bumped`);
  }
  const [, major, minor, patch] = versionParts;
  return `${major}.${minor}.${Number(patch) + 1}`;
}

function restampPin(bundleDirectory) {
  const result = spawnSync(process.execPath, [PIN_GENERATOR, '--restamp', bundleDirectory], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`restamping the pin of ${bundleDirectory} failed: ${result.stderr.trim()}`);
  }
}

function bumpBundle(bundle) {
  const manifestPath = manifestPathOf(bundle);
  const pinPath = `${bundle.relativeDirectory}/${PIN_PATH_IN_BUNDLE}`;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.version = nextPatchVersion(manifest.version, manifestPath);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const bundleIsPinned = existsSync(pinPath);
  if (bundleIsPinned) restampPin(bundle.directory);
  return {
    name: bundle.name,
    version: manifest.version,
    changedPaths: bundleIsPinned ? [manifestPath, pinPath] : [manifestPath],
  };
}

function bumpCommitSubject(bumps) {
  const bumpPhrases = bumps.map((bump) => `${bump.name} to ${bump.version}`);
  return `Bump ${new Intl.ListFormat('en', { type: 'conjunction' }).format(bumpPhrases)} after bundle changes`;
}

function bumpChangedBundles() {
  process.chdir(git('rev-parse', '--show-toplevel'));
  if (git('rev-parse', '--is-shallow-repository') === 'true') {
    throw new Error('the clone is shallow, so a version base may lie outside the fetched history — check out with fetch-depth: 0');
  }
  const bumps = readMarketplaceBundles(process.cwd()).filter(changedSinceVersionBase).map(bumpBundle);
  if (bumps.length === 0) return;
  const subject = bumpCommitSubject(bumps);
  git('commit', '-m', subject, '--', ...bumps.flatMap((bump) => bump.changedPaths));
  console.log(subject);
}

try {
  bumpChangedBundles();
} catch (error) {
  console.error(`auto-bump: ${error.message}`);
  process.exit(1);
}
