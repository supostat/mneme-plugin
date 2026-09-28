#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARKETPLACE_MANIFEST_PATH, readMarketplaceBundles } from './marketplace-bundles.mjs';

// The root defaults to this repo; the gate scripts pass a fixture root instead, so the negative
// case of every rule can be exercised without planting fixtures in a real bundle.
const repoRoot = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ABSOLUTE_PATH_LEAK = /\/(Users|home|root)\b/;
const REQUIRED_SKILL_KEYS = ['name', 'description', 'allowed-tools'];
const FORBIDDEN_IN_BUNDLE = ['.dev-vault', '.claude', '.mcp.json', '.engram', 'docs', 'CLAUDE.md', '.env', '.git'];
const LAUNCHER_COMMAND = '${CLAUDE_PLUGIN_ROOT}/bin/launch.sh';
const SHA256_HEX = /^[0-9a-f]{64}$/;

function loadManifest(relativePath) {
  let raw;
  try {
    raw = readFileSync(resolve(repoRoot, relativePath), 'utf8');
  } catch {
    errors.push(`${relativePath}: file not found`);
    return null;
  }
  if (ABSOLUTE_PATH_LEAK.test(raw)) {
    errors.push(`${relativePath}: contains an absolute filesystem path (/Users, /home or /root) — manifests must stay portable`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    errors.push(`${relativePath}: invalid JSON — ${cause.message}`);
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    errors.push(`${relativePath}: root must be a JSON object`);
    return null;
  }
  return parsed;
}

function validatePlugin(manifest, manifestPath) {
  if (!manifest) return;
  if (typeof manifest.name !== 'string' || !KEBAB_CASE.test(manifest.name)) {
    errors.push(`${manifestPath}: "name" must be a non-empty kebab-case string`);
  }
  const servers = manifest.mcpServers;
  if (servers === undefined) return; // A bundle of skills and scripts declares no MCP server at all.
  if (typeof servers !== 'object' || servers === null || Array.isArray(servers)) {
    errors.push(`${manifestPath}: "mcpServers" must be an object of named servers when present`);
    return;
  }
  for (const [id, server] of Object.entries(servers)) {
    const command = server?.command;
    if (typeof command !== 'string' || command.length === 0) {
      errors.push(`${manifestPath}: mcpServers.${id}.command must be a non-empty string`);
      continue;
    }
    if (command.startsWith('/')) {
      errors.push(`${manifestPath}: mcpServers.${id}.command is an absolute path — use \${CLAUDE_PLUGIN_ROOT} so it resolves wherever the plugin is installed`);
    } else if (!command.includes('${CLAUDE_PLUGIN_ROOT}')) {
      errors.push(`${manifestPath}: mcpServers.${id}.command must reference \${CLAUDE_PLUGIN_ROOT} (portable plugin-root path)`);
    } else if (command !== LAUNCHER_COMMAND) {
      errors.push(
        `${manifestPath}: mcpServers.${id}.command is "${command}" but must be exactly "\${CLAUDE_PLUGIN_ROOT}/bin/launch.sh" — the server always starts through the launcher (local dev build or cached pinned release); pointing at the raw binary breaks installs from GitHub, where the binary is gitignored`,
      );
    }
  }
}

function validateMarketplace(manifest) {
  if (!manifest) return;
  if (typeof manifest.name !== 'string' || !KEBAB_CASE.test(manifest.name)) {
    errors.push('marketplace.json: "name" must be a non-empty kebab-case string');
  }
  if (typeof manifest.owner?.name !== 'string' || manifest.owner.name.length === 0) {
    errors.push('marketplace.json: "owner.name" is required');
  }
  if (!Array.isArray(manifest.plugins) || manifest.plugins.length === 0) {
    errors.push('marketplace.json: "plugins" must be a non-empty array');
    return;
  }
  manifest.plugins.forEach((plugin, index) => {
    if (typeof plugin?.name !== 'string' || !KEBAB_CASE.test(plugin.name)) {
      errors.push(`marketplace.json: plugins[${index}].name must be a non-empty kebab-case string`);
    }
    if (typeof plugin?.source !== 'string' || !plugin.source.startsWith('./')) {
      errors.push(`marketplace.json: plugins[${index}].source must be a local path starting with "./"`);
    }
  });
}

function validateCrossReference(bundle, manifest, manifestPath) {
  if (!manifest || manifest.name === bundle.name) return;
  errors.push(
    `marketplace.json: plugin "${bundle.name}" (source "${bundle.source}") does not match the name "${manifest.name}" declared in ${manifestPath} — a marketplace element and the manifest of its own source must carry the same name`,
  );
}

function validateSkillFile(relativePath, directoryName) {
  let raw;
  try {
    raw = readFileSync(resolve(repoRoot, relativePath), 'utf8');
  } catch {
    errors.push(`${relativePath}: file not found`);
    return;
  }
  if (ABSOLUTE_PATH_LEAK.test(raw)) {
    errors.push(`${relativePath}: contains an absolute filesystem path (/Users, /home or /root) — a distributed skill must stay portable`);
  }
  const frontmatter = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatter) {
    errors.push(`${relativePath}: missing a --- delimited YAML frontmatter block at the top`);
    return;
  }
  for (const key of REQUIRED_SKILL_KEYS) {
    if (!new RegExp(`^${key}:`, 'm').test(frontmatter[1])) {
      errors.push(`${relativePath}: frontmatter is missing required key "${key}"`);
    }
  }
  assertSkillNameMatchesDirectory(relativePath, frontmatter[1], directoryName);
}

function assertSkillNameMatchesDirectory(relativePath, frontmatterBody, directoryName) {
  const declaredNameMatch = frontmatterBody.match(/^name:\s*(.+)$/m);
  if (!declaredNameMatch) return;
  const declaredName = declaredNameMatch[1].trim().replace(/^["']|["']$/g, '');
  // Claude Code prefixes a plugin skill's command with the PLUGIN's own namespace, so the
  // skill name itself carries no prefix: skill "arch" of plugin "mneme" is invoked as
  // /mneme:arch. Spelling the prefix into the name (or its "__" directory encoding) makes
  // the host prepend it a second time — /mneme:mneme:arch.
  if (!KEBAB_CASE.test(declaredName)) {
    errors.push(`${relativePath}: frontmatter name "${declaredName}" must be kebab-case with no plugin prefix — Claude Code prepends the plugin's namespace itself, so a name carrying it (or its "__" encoding) yields a doubled command like /<plugin>:<plugin>:<skill>`);
  }
  if (declaredName !== directoryName) {
    errors.push(`${relativePath}: frontmatter name "${declaredName}" must match the skill directory "${directoryName}" exactly`);
  }
}

function validateSkills(bundle) {
  const skillsPath = `${bundle.relativeDirectory}/skills`;
  let entries;
  try {
    entries = readdirSync(resolve(repoRoot, skillsPath), { withFileTypes: true });
  } catch {
    errors.push(`${skillsPath}: directory not found — every bundle must ship at least one skill`);
    return;
  }
  const skillDirectories = entries.filter((entry) => entry.isDirectory());
  if (skillDirectories.length === 0) {
    errors.push(`${skillsPath}: no skill subdirectories found — every bundle must ship at least one skill`);
    return;
  }
  for (const skillDirectory of skillDirectories) {
    validateSkillFile(`${skillsPath}/${skillDirectory.name}/SKILL.md`, skillDirectory.name);
  }
}

function validateReleasePin(bundle, manifest, manifestPath) {
  const pinPath = `${bundle.relativeDirectory}/bin/release.json`;
  let raw;
  try {
    raw = readFileSync(resolve(repoRoot, pinPath), 'utf8');
  } catch {
    return; // No pin — the bundle ships no pinned binary, or its release has not been pinned yet.
  }
  let pin;
  try {
    pin = JSON.parse(raw);
  } catch (cause) {
    errors.push(`${pinPath}: invalid JSON — ${cause.message}`);
    return;
  }
  if (pin === null || typeof pin !== 'object' || Array.isArray(pin)) {
    errors.push(`${pinPath}: root must be a JSON object`);
    return;
  }
  for (const field of ['engine_version', 'plugin_version', 'base_url']) {
    if (typeof pin[field] !== 'string' || pin[field].length === 0) {
      errors.push(`${pinPath}: "${field}" must be a non-empty string`);
    }
  }
  if (typeof pin.base_url === 'string' && !pin.base_url.startsWith('https://')) {
    errors.push(`${pinPath}: "base_url" must be an https:// URL`);
  }
  if (pin.sha256 === null || typeof pin.sha256 !== 'object' || Array.isArray(pin.sha256) || Object.keys(pin.sha256).length === 0) {
    errors.push(`${pinPath}: "sha256" must be a non-empty object of per-target digests`);
  } else {
    for (const [target, checksum] of Object.entries(pin.sha256)) {
      if (typeof checksum !== 'string' || !SHA256_HEX.test(checksum)) {
        errors.push(`${pinPath}: sha256["${target}"] must be a lowercase 64-hex digest`);
      }
    }
  }
  if (manifest && typeof pin.plugin_version === 'string' && pin.plugin_version !== manifest.version) {
    errors.push(
      `${pinPath}: plugin_version "${pin.plugin_version}" does not match plugin.json version "${manifest.version}" (${manifestPath}) — after bumping the version, regenerate the pin (scripts/generate-release-pin.mjs --restamp ${bundle.relativeDirectory})`,
    );
  }
}

function validateBundleHygiene(bundle) {
  let entries;
  try {
    entries = readdirSync(bundle.directory, { withFileTypes: true });
  } catch {
    errors.push(`${bundle.relativeDirectory}/: bundle directory not found (marketplace source "${bundle.source}")`);
    return;
  }
  const names = new Set(entries.map((entry) => entry.name));
  for (const forbidden of FORBIDDEN_IN_BUNDLE) {
    if (names.has(forbidden)) {
      errors.push(
        `${bundle.relativeDirectory}/${forbidden}: repo-internal path must NOT sit inside the shipped bundle (marketplace source "${bundle.source}" copies everything under ${bundle.relativeDirectory}/)`,
      );
    }
  }
}

function listBundles(marketplaceManifest) {
  if (!marketplaceManifest || !Array.isArray(marketplaceManifest.plugins)) return [];
  try {
    return readMarketplaceBundles(repoRoot);
  } catch (cause) {
    errors.push(cause.message);
    return [];
  }
}

const marketplaceManifest = loadManifest(MARKETPLACE_MANIFEST_PATH);
validateMarketplace(marketplaceManifest);
const bundles = listBundles(marketplaceManifest);
for (const bundle of bundles) {
  const manifestPath = `${bundle.relativeDirectory}/.claude-plugin/plugin.json`;
  const manifest = loadManifest(manifestPath);
  validatePlugin(manifest, manifestPath);
  validateCrossReference(bundle, manifest, manifestPath);
  validateReleasePin(bundle, manifest, manifestPath);
  validateSkills(bundle);
  validateBundleHygiene(bundle);
}

if (errors.length > 0) {
  console.error('Manifest validation FAILED:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

const bundleCount = `${bundles.length} ${bundles.length === 1 ? 'bundle' : 'bundles'}`;
const bundleNames = bundles.map((bundle) => bundle.name).join(', ');
console.log(
  `Manifest validation passed: ${bundleCount} (${bundleNames}) — marketplace.json, every plugin manifest, release pin and skill are valid and portable.`,
);
