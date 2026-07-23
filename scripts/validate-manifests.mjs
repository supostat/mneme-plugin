#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The root defaults to this repo; scripts/check-skill-names.mjs passes a fixture root instead,
// so the negative case of every rule can be exercised without planting fixtures in plugin/skills.
const repoRoot = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ABSOLUTE_PATH_LEAK = /\/(Users|home|root)\b/;
const REQUIRED_SKILL_KEYS = ['name', 'description', 'allowed-tools'];
const FORBIDDEN_IN_BUNDLE = ['.dev-vault', '.claude', '.mcp.json', '.engram', 'docs', 'CLAUDE.md', '.env', '.git'];

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

function validatePlugin(manifest) {
  if (!manifest) return;
  if (typeof manifest.name !== 'string' || !KEBAB_CASE.test(manifest.name)) {
    errors.push('plugin.json: "name" must be a non-empty kebab-case string');
  }
  const servers = manifest.mcpServers;
  if (typeof servers !== 'object' || servers === null || Object.keys(servers).length === 0) {
    errors.push('plugin.json: "mcpServers" must declare at least one server');
    return;
  }
  for (const [id, server] of Object.entries(servers)) {
    const command = server?.command;
    if (typeof command !== 'string' || command.length === 0) {
      errors.push(`plugin.json: mcpServers.${id}.command must be a non-empty string`);
      continue;
    }
    if (command.startsWith('/')) {
      errors.push(`plugin.json: mcpServers.${id}.command is an absolute path — use \${CLAUDE_PLUGIN_ROOT} so it resolves wherever the plugin is installed`);
    } else if (!command.includes('${CLAUDE_PLUGIN_ROOT}')) {
      errors.push(`plugin.json: mcpServers.${id}.command must reference \${CLAUDE_PLUGIN_ROOT} (portable plugin-root path)`);
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

function validateCrossReferences(pluginManifest, marketplaceManifest) {
  if (!pluginManifest || !marketplaceManifest || !Array.isArray(marketplaceManifest.plugins)) return;
  const rootPluginName = pluginManifest.name;
  marketplaceManifest.plugins.forEach((plugin, index) => {
    if (plugin?.source?.startsWith('./') && plugin?.name !== rootPluginName) {
      errors.push(`marketplace.json: plugins[${index}].source "${plugin?.source}" points at this repo, but its name "${plugin?.name}" does not match plugin.json name "${rootPluginName}"`);
    }
  });
}

function validateSkillFile(relativePath) {
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
  assertSkillNameMatchesDirectory(relativePath, frontmatter[1]);
}

function assertSkillNameMatchesDirectory(relativePath, frontmatterBody) {
  const declaredNameMatch = frontmatterBody.match(/^name:\s*(.+)$/m);
  const directoryMatch = relativePath.match(/^plugin\/skills\/([^/]+)\/SKILL\.md$/);
  if (!declaredNameMatch || !directoryMatch) return;
  const declaredName = declaredNameMatch[1].trim().replace(/^["']|["']$/g, '');
  const directoryName = directoryMatch[1];
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

function validateSkills() {
  let entries;
  try {
    entries = readdirSync(resolve(repoRoot, 'plugin/skills'), { withFileTypes: true });
  } catch {
    errors.push('plugin/skills: directory not found — the plugin must ship at least one skill');
    return;
  }
  const skillDirectories = entries.filter((entry) => entry.isDirectory());
  if (skillDirectories.length === 0) {
    errors.push('plugin/skills: no skill subdirectories found');
    return;
  }
  for (const skillDirectory of skillDirectories) {
    validateSkillFile(`plugin/skills/${skillDirectory.name}/SKILL.md`);
  }
}

function validateBundleHygiene() {
  let entries;
  try {
    entries = readdirSync(resolve(repoRoot, 'plugin'), { withFileTypes: true });
  } catch {
    errors.push('plugin/: bundle directory not found');
    return;
  }
  const names = new Set(entries.map((entry) => entry.name));
  for (const forbidden of FORBIDDEN_IN_BUNDLE) {
    if (names.has(forbidden)) {
      errors.push(`plugin/${forbidden}: repo-internal path must NOT sit inside the shipped bundle (marketplace source "./plugin" copies everything under plugin/)`);
    }
  }
}

const pluginManifest = loadManifest('plugin/.claude-plugin/plugin.json');
const marketplaceManifest = loadManifest('.claude-plugin/marketplace.json');
validatePlugin(pluginManifest);
validateMarketplace(marketplaceManifest);
validateCrossReferences(pluginManifest, marketplaceManifest);
validateSkills();
validateBundleHygiene();

if (errors.length > 0) {
  console.error('Manifest validation FAILED:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log('Manifest validation passed: plugin.json, marketplace.json and skills are valid and portable.');
