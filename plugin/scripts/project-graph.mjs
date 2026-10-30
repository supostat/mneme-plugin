#!/usr/bin/env node
//
// Static project graph for /mneme:map: files that git sees, the edges a parser can read
// (imports, requires, Ruby constants, ActiveRecord associations, routes, frontend→API seams),
// clusters seeded by the project's domain directories, and a map-section draft per cluster.
// No language server and no network: metaprogramming stays invisible by design.
//
// Usage: node project-graph.mjs --root <dir> [--out <json>] [--changed <path,...> | --since <commit>] [--expect <json>]

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { posix, resolve } from 'node:path';

const USAGE = 'usage: project-graph --root <dir> [--out <json>] [--changed <path,...> | --since <commit>] [--expect <json>]';
const LANGUAGE_BY_EXTENSION = {
  rb: 'ruby',
  erb: 'erb',
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
};
const SCRIPT_LANGUAGES = new Set(['typescript', 'javascript']);
const RUBY_LANGUAGES = new Set(['ruby', 'erb']);
const SCRIPT_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];
const GROUP_DIRECTORIES = new Set(['services', 'apps', 'domains', 'modules', 'packages', 'features', 'lib']);
const MAX_GROUP_DEPTH = 3;
const ROUTES_FILE = 'config/routes.rb';
const ROOT_CLUSTER = 'root';
const SMALL_CLUSTER_FILES = 3;
const SEAMS_TO_MERGE = 2;
const SEED_EDGE_WEIGHT = 2;
const ASSIGNED_EDGE_WEIGHT = 1;
const MAX_PROPAGATION_ROUNDS = 10;
const MAX_ANCHOR_FILES = 5;
const MAX_TERMS = 24;
const MAX_TERM_LENGTH = 32;
const SECTION_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const EXIT_MISMATCH = 1;
const EXIT_USAGE = 2;

function fail(code, message) {
  console.error(message);
  process.exit(code);
}

function parseOptions(argv) {
  const options = { root: null, out: null, changed: null, since: null, expect: null };
  const valued = new Set(Object.keys(options));
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const name = flag.startsWith('--') ? flag.slice(2) : null;
    if (name === null || !valued.has(name)) fail(EXIT_USAGE, `project-graph: unknown argument ${flag}\n${USAGE}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) fail(EXIT_USAGE, `project-graph: ${flag} needs a value\n${USAGE}`);
    options[name] = value;
    index += 1;
  }
  if (options.root === null) fail(EXIT_USAGE, `project-graph: --root <dir> is required\n${USAGE}`);
  if (options.changed !== null && options.since !== null) {
    fail(EXIT_USAGE, `project-graph: --changed and --since exclude each other\n${USAGE}`);
  }
  return options;
}

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function gitErrorText(error) {
  const stderr = error.stderr === undefined ? '' : String(error.stderr).trim().split('\n')[0];
  return stderr === '' ? error.message : stderr;
}

function listVisibleFiles(root) {
  let output;
  try {
    output = git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
  } catch (error) {
    fail(EXIT_USAGE, `project-graph: ${root} is not inside a git repository (${gitErrorText(error)})`);
  }
  return [...new Set(output.split('\0').filter((path) => path !== ''))].sort();
}

function changedFilesSince(root, commit) {
  try {
    return git(root, ['diff', '--name-only', '--relative', `${commit}..HEAD`]).split('\n').filter((path) => path !== '');
  } catch (error) {
    fail(EXIT_USAGE, `project-graph: cannot diff ${commit}..HEAD in ${root} (${gitErrorText(error)})`);
  }
}

function languageOf(file) {
  const extension = posix.extname(file).slice(1);
  return LANGUAGE_BY_EXTENSION[extension] ?? null;
}

function readTsconfig(root, warnings) {
  const path = resolve(root, 'tsconfig.json');
  if (!existsSync(path)) return { baseUrl: null, aliases: [] };
  let config;
  try {
    config = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    warnings.push('tsconfig.json is not valid JSON; path aliases ignored');
    return { baseUrl: null, aliases: [] };
  }
  const compilerOptions = config.compilerOptions ?? {};
  const baseUrl = typeof compilerOptions.baseUrl === 'string' ? posix.normalize(compilerOptions.baseUrl) : null;
  const aliases = Object.entries(compilerOptions.paths ?? {}).map(([pattern, targets]) => ({
    prefix: pattern.replace(/\*$/, ''),
    wildcard: pattern.endsWith('*'),
    targets: (Array.isArray(targets) ? targets : []).map((target) => target.replace(/\*$/, '')),
  }));
  return { baseUrl, aliases };
}

function stripRubyComments(source) {
  return source
    .split('\n')
    .map((line) => line.replace(/(^|\s)#(?!\{).*$/, '$1'))
    .join('\n');
}

function underscore(constant) {
  return constant
    .replace(/::/g, '/')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

function camelize(word) {
  return word.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}

function singularize(word) {
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (/(ses|xes|shes|ches)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
}

function buildAutoloadIndex(nodes) {
  const index = new Map();
  const register = (key, file) => {
    const files = index.get(key) ?? [];
    files.push(file);
    index.set(key, files);
  };
  for (const file of nodes) {
    const segments = file.split('/');
    if (segments[0] === 'app' && segments.length > 2) register(segments.slice(2).join('/'), file);
    if (segments[0] === 'lib' && segments.length > 1) register(segments.slice(1).join('/'), file);
  }
  return index;
}

function rubyDeclarationFrames(source) {
  const declarations = [];
  const frames = [];
  for (const line of source.split('\n')) {
    const opening = /^(\s*)(class|module)\s+([A-Z][A-Za-z0-9:]*)/.exec(line);
    if (opening === null) continue;
    const indent = opening[1].length;
    while (frames.length > 0 && frames.at(-1).indent >= indent) frames.pop();
    if (frames.length > 0) frames.at(-1).declaration.wrapsAnother = true;
    const declaration = { name: [...frames.map((frame) => frame.name), opening[3]].join('::'), kind: opening[2], wrapsAnother: false };
    frames.push({ name: opening[3], indent, declaration });
    declarations.push(declaration);
  }
  return declarations;
}

function rubyDeclarations(source) {
  return rubyDeclarationFrames(source).map((declaration) => declaration.name);
}

function rubySymbols(source) {
  return rubyDeclarationFrames(source)
    .filter((declaration) => declaration.kind === 'class' || !declaration.wrapsAnother)
    .map((declaration) => declaration.name);
}

function rubyNamespaceChain(source) {
  const declarations = rubyDeclarations(source);
  return declarations.length === 0 ? [] : declarations.at(-1).split('::');
}

function resolveRubyConstant(constant, namespaceChain, autoloadIndex) {
  const scopes = [];
  for (let depth = namespaceChain.length; depth >= 0; depth -= 1) {
    const scope = namespaceChain.slice(0, depth).join('::');
    scopes.push(scope === '' ? constant : `${scope}::${constant}`);
  }
  for (const candidate of scopes) {
    const files = autoloadIndex.get(`${underscore(candidate)}.rb`);
    if (files !== undefined) return files;
  }
  return [];
}

function rubyEdges(file, source, autoloadIndex) {
  const clean = stripRubyComments(source);
  const namespaceChain = rubyNamespaceChain(clean);
  const defined = new Set(rubyDeclarations(clean));
  const ownFiles = new Set([file]);
  const edges = [];
  for (const match of clean.matchAll(/\b([A-Z][A-Za-z0-9]*(?:::[A-Z][A-Za-z0-9]*)*)\b/g)) {
    const constant = match[1];
    if (defined.has(constant) || namespaceChain.includes(constant)) continue;
    for (const target of resolveRubyConstant(constant, namespaceChain, autoloadIndex)) {
      if (!ownFiles.has(target)) edges.push({ from: file, to: target, kind: 'constant' });
    }
  }
  for (const match of clean.matchAll(/^\s*(has_many|has_one|belongs_to|has_and_belongs_to_many)\s+:(\w+)(.*)$/gm)) {
    const [, macro, association, rest] = match;
    const className = /class_name:\s*['"]([^'"]+)['"]/.exec(rest);
    const plural = macro === 'has_many' || macro === 'has_and_belongs_to_many';
    const constant = className === null ? camelize(plural ? singularize(association) : association) : className[1];
    const candidates = resolveRubyConstant(constant, [], autoloadIndex);
    const models = candidates.filter((candidate) => candidate.startsWith('app/models/'));
    for (const target of models.length > 0 ? models : candidates) {
      if (target !== file) edges.push({ from: file, to: target, kind: 'association' });
    }
  }
  for (const match of clean.matchAll(/require_relative\s+['"]([^'"]+)['"]/g)) {
    edges.push({ from: file, to: `${posix.join(posix.dirname(file), match[1])}.rb`, kind: 'require' });
  }
  for (const match of clean.matchAll(/^\s*require\s+['"]([^'"]+)['"]/gm)) {
    edges.push({ from: file, to: `lib/${match[1]}.rb`, kind: 'require' });
  }
  return edges;
}

function parseRoutes(source) {
  const routes = [];
  const blocks = [];
  const namespaces = () => blocks.filter((frame) => frame !== null);
  for (const rawLine of stripRubyComments(source).split('\n')) {
    const line = rawLine.trim();
    const namespace = /^namespace\s+:(\w+)/.exec(line);
    const resources = /^(resources|resource)\s+:(\w+)(.*)$/.exec(line);
    const verb = /^(get|post|put|patch|delete)\s+['"]([^'"]+)['"].*\bto:\s*['"]([^#'"]+)#/.exec(line);
    if (resources !== null) {
      const [, macro, name, rest] = resources;
      const controllerOption = /controller:\s*['"]([^'"]+)['"]/.exec(rest);
      const pathOption = /path:\s*['"]([^'"]+)['"]/.exec(rest);
      const controller = controllerOption === null ? (macro === 'resource' ? `${name}s` : name) : controllerOption[1];
      const segment = pathOption === null ? name : pathOption[1];
      const prefix = ['', ...namespaces(), segment].join('/');
      const controllerFile = `app/controllers/${[...namespaces(), controller].join('/')}_controller.rb`;
      routes.push({ path: prefix, controller: controllerFile });
      if (macro === 'resources') routes.push({ path: `${prefix}/:id`, controller: controllerFile });
    } else if (verb !== null) {
      const path = ['', ...namespaces(), verb[2].replace(/^\//, '')].join('/');
      routes.push({ path, controller: `app/controllers/${[...namespaces(), verb[3]].join('/')}_controller.rb` });
    }
    if (/\bdo\s*(\|[^|]*\|)?$/.test(line)) blocks.push(namespace === null ? null : namespace[1]);
    else if (/^end\b/.test(line) && blocks.length > 0) blocks.pop();
  }
  return routes;
}

function normalizeApiPath(literal) {
  const path = literal.split('?')[0].replace(/\/$/, '');
  return path
    .split('/')
    .map((segment) => (segment.includes('${') || segment.startsWith(':') || /^\d+$/.test(segment) ? ':id' : segment))
    .join('/');
}

function resolveScriptImport(spec, fromFile, nodeSet, tsconfig) {
  const candidates = [];
  if (spec.startsWith('.')) {
    candidates.push(posix.join(posix.dirname(fromFile), spec));
  } else {
    for (const alias of tsconfig.aliases) {
      if (alias.wildcard ? spec.startsWith(alias.prefix) : spec === alias.prefix) {
        for (const target of alias.targets) candidates.push(posix.normalize(target + spec.slice(alias.prefix.length)));
      }
    }
    if (tsconfig.baseUrl !== null) candidates.push(posix.normalize(posix.join(tsconfig.baseUrl, spec)));
  }
  for (const candidate of candidates) {
    const probes = [candidate, ...SCRIPT_EXTENSIONS.map((extension) => candidate + extension)];
    probes.push(...SCRIPT_EXTENSIONS.map((extension) => posix.join(candidate, `index${extension}`)));
    const found = probes.find((probe) => nodeSet.has(probe));
    if (found !== undefined) return found;
  }
  return null;
}

function scriptEdges(file, source, nodeSet, tsconfig, routesByPath) {
  const edges = [];
  const seams = [];
  const specs = [
    ...source.matchAll(/\bimport\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g),
    ...source.matchAll(/\bexport\s+(?:[^'"]*?\s+from\s+)['"]([^'"]+)['"]/g),
    ...source.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g),
    ...source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g),
  ].map((match) => match[1]);
  for (const spec of specs) {
    const target = resolveScriptImport(spec, file, nodeSet, tsconfig);
    if (target !== null && target !== file) edges.push({ from: file, to: target, kind: 'import' });
  }
  for (const match of source.matchAll(/(['"`])(\/[^'"`\s]*)\1/g)) {
    const route = routesByPath.get(normalizeApiPath(match[2]));
    if (route === undefined || !nodeSet.has(route.controller)) continue;
    edges.push({ from: file, to: route.controller, kind: 'seam' });
    seams.push({ from: file, to: route.controller, kind: 'seam', route: route.path, evidence: match[2] });
  }
  return { edges, seams };
}

function scriptSymbols(source) {
  const symbols = [];
  for (const match of source.matchAll(/\bexport\s+(?:default\s+)?(?:async\s+)?(?:class|function|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g)) {
    symbols.push(match[1]);
  }
  for (const match of source.matchAll(/^\s*class\s+([A-Z]\w*)/gm)) symbols.push(match[1]);
  return symbols;
}

function dedupeEdges(edges) {
  const seen = new Set();
  return edges.filter((edge) => {
    if (edge.from === edge.to) return false;
    const key = `${edge.from}\0${edge.to}\0${edge.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function seedOf(file) {
  const directories = file.split('/').slice(0, -1);
  if (directories.length === 0) return null;
  const groupIndex = directories.findIndex((directory) => GROUP_DIRECTORIES.has(directory));
  if (groupIndex < 0 || groupIndex > MAX_GROUP_DEPTH) return null;
  return directories.slice(0, Math.min(groupIndex + 2, directories.length)).join('/');
}

function topLevelOf(file) {
  const directories = file.split('/').slice(0, -1);
  return directories.length === 0 ? ROOT_CLUSTER : directories[0];
}

function neighborsOf(edges) {
  const neighbors = new Map();
  const add = (from, to) => {
    const list = neighbors.get(from) ?? [];
    list.push(to);
    neighbors.set(from, list);
  };
  for (const edge of edges) {
    add(edge.from, edge.to);
    add(edge.to, edge.from);
  }
  return neighbors;
}

function pickBest(scores, sizes) {
  let best = null;
  for (const [key, score] of scores) {
    if (best === null) {
      best = { key, score };
      continue;
    }
    const sizeDifference = (sizes.get(key) ?? 0) - (sizes.get(best.key) ?? 0);
    if (score > best.score || (score === best.score && (sizeDifference > 0 || (sizeDifference === 0 && key < best.key)))) {
      best = { key, score };
    }
  }
  return best === null ? null : best.key;
}

function clusterSizes(assignment) {
  const sizes = new Map();
  for (const key of assignment.values()) sizes.set(key, (sizes.get(key) ?? 0) + 1);
  return sizes;
}

function assignClusters(nodes, edges) {
  const hasGroupLayout = nodes.some((file) => seedOf(file) !== null);
  const assignment = new Map();
  const seedFiles = new Set();
  const groupSeeds = new Set();
  for (const file of nodes) {
    const seed = hasGroupLayout ? seedOf(file) : topLevelOf(file);
    if (seed === null) continue;
    assignment.set(file, seed);
    seedFiles.add(file);
    if (hasGroupLayout) groupSeeds.add(seed);
  }
  const neighbors = neighborsOf(edges);
  const shared = nodes.filter((file) => !seedFiles.has(file));
  for (let round = 0; round < MAX_PROPAGATION_ROUNDS; round += 1) {
    const sizes = clusterSizes(assignment);
    let changed = false;
    for (const file of shared) {
      const scores = new Map();
      for (const neighbor of neighbors.get(file) ?? []) {
        const key = assignment.get(neighbor);
        if (key === undefined) continue;
        const weight = seedFiles.has(neighbor) ? SEED_EDGE_WEIGHT : ASSIGNED_EDGE_WEIGHT;
        scores.set(key, (scores.get(key) ?? 0) + weight);
      }
      const best = pickBest(scores, sizes);
      if (best !== null && assignment.get(file) !== best) {
        assignment.set(file, best);
        changed = true;
      }
    }
    if (!changed) break;
  }
  for (const file of shared) {
    if (!assignment.has(file)) assignment.set(file, posix.dirname(file) === '.' ? ROOT_CLUSTER : posix.dirname(file));
  }
  const seedDirectories = new Map([...groupSeeds].map((seed) => [seed, new Set([seed])]));
  return { assignment, groupSeeds, seedDirectories };
}

function slugOf(key) {
  const last = key.split('/').at(-1);
  const slug = last.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return slug === '' ? 'cluster' : slug;
}

function mergeKeys(clustering, from, into) {
  for (const [file, key] of clustering.assignment) if (key === from) clustering.assignment.set(file, into);
  const absorbed = clustering.seedDirectories.get(from);
  if (absorbed !== undefined) {
    const target = clustering.seedDirectories.get(into) ?? new Set();
    for (const directory of absorbed) target.add(directory);
    clustering.seedDirectories.set(into, target);
    clustering.seedDirectories.delete(from);
  }
  clustering.groupSeeds.delete(from);
}

function mergeSameSlugSeeds(clustering) {
  const bySlug = new Map();
  for (const seed of [...clustering.groupSeeds].sort()) {
    const slug = slugOf(seed);
    const canonical = bySlug.get(slug);
    if (canonical === undefined) bySlug.set(slug, seed);
    else mergeKeys(clustering, seed, canonical);
  }
}

function crossClusterCounts(assignment, edges, kinds) {
  const counts = new Map();
  for (const edge of edges) {
    if (kinds !== null && !kinds.has(edge.kind)) continue;
    const a = assignment.get(edge.from);
    const b = assignment.get(edge.to);
    if (a === undefined || b === undefined || a === b) continue;
    const key = [a, b].sort().join('\0');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function mergeSeamedSeeds(clustering, seams) {
  const seamEdges = seams.map((seam) => ({ from: seam.from, to: seam.to, kind: 'seam' }));
  for (const [pair, count] of [...crossClusterCounts(clustering.assignment, seamEdges, null)].sort()) {
    if (count < SEAMS_TO_MERGE) continue;
    const [a, b] = pair.split('\0');
    if (!clustering.groupSeeds.has(a) || !clustering.groupSeeds.has(b)) continue;
    mergeKeys(clustering, b, a);
  }
}

function mergeSmallClusters(clustering, edges) {
  const { assignment } = clustering;
  const small = [...clusterSizes(assignment)].filter(([, size]) => size < SMALL_CLUSTER_FILES).map(([key]) => key).sort();
  for (const key of small) {
    const current = clusterSizes(assignment);
    if ((current.get(key) ?? 0) >= SMALL_CLUSTER_FILES) continue;
    const scores = new Map();
    for (const edge of edges) {
      const a = assignment.get(edge.from);
      const b = assignment.get(edge.to);
      if (a === key && b !== key) scores.set(b, (scores.get(b) ?? 0) + 1);
      if (b === key && a !== key) scores.set(a, (scores.get(a) ?? 0) + 1);
    }
    const best = pickBest(scores, current);
    if (best !== null) mergeKeys(clustering, key, best);
  }
}

function assignIds(clustering) {
  const ids = new Map();
  const taken = new Set();
  for (const key of [...new Set(clustering.assignment.values())].sort()) {
    const segments = key.split('/');
    let depth = 1;
    let id = slugOf(key);
    while (taken.has(id) && depth < segments.length) {
      depth += 1;
      id = segments.slice(-depth).map(slugOf).join('-');
    }
    if (taken.has(id)) id = `${id}-${taken.size}`;
    if (!SECTION_ID_PATTERN.test(id)) id = id.slice(0, 64).replace(/^[^a-z0-9]+/, 'c');
    taken.add(id);
    ids.set(key, { id, seedDirectories: [...(clustering.seedDirectories.get(key) ?? [])].sort() });
  }
  return ids;
}

function incomingCounts(edges) {
  const counts = new Map();
  for (const edge of edges) counts.set(edge.to, (counts.get(edge.to) ?? 0) + 1);
  return counts;
}

function commonDirectories(files) {
  const directories = [...new Set(files.map((file) => posix.dirname(file)).filter((directory) => directory !== '.'))].sort();
  return directories.filter((directory) => !directories.some((other) => other !== directory && directory.startsWith(`${other}/`)));
}

function draftFor(id, files, groupDirectories, incoming, symbolsByFile) {
  const seedDirectories = groupDirectories.length > 0 ? groupDirectories : commonDirectories(files);
  const insideSeed = (file) => seedDirectories.some((directory) => file.startsWith(`${directory}/`));
  const keyFiles = files
    .filter((file) => !insideSeed(file))
    .sort((a, b) => (incoming.get(b) ?? 0) - (incoming.get(a) ?? 0) || a.localeCompare(b))
    .slice(0, MAX_ANCHOR_FILES);
  const terms = files
    .flatMap((file) => (symbolsByFile.get(file) ?? []).map((symbol) => ({ symbol, weight: incoming.get(file) ?? 0 })))
    .filter(({ symbol }) => [...symbol].length <= MAX_TERM_LENGTH)
    .sort((a, b) => b.weight - a.weight || a.symbol.localeCompare(b.symbol))
    .map(({ symbol }) => symbol)
    .filter((symbol, index, all) => all.indexOf(symbol) === index)
    .slice(0, MAX_TERMS);
  return { id, anchors: [...seedDirectories.sort(), ...keyFiles], terms };
}

function buildGraph(root, options) {
  const warnings = [];
  const visible = listVisibleFiles(root);
  const nodes = visible.filter((file) => languageOf(file) !== null && existsSync(resolve(root, file)));
  const nodeSet = new Set(nodes);
  const sources = new Map(nodes.map((file) => [file, readFileSync(resolve(root, file), 'utf8')]));
  const tsconfig = readTsconfig(root, warnings);
  const autoloadIndex = buildAutoloadIndex(nodes);
  const routes = sources.has(ROUTES_FILE) ? parseRoutes(sources.get(ROUTES_FILE)) : [];
  const routesByPath = new Map(routes.map((route) => [route.path, route]));
  const languages = {};
  const symbolsByFile = new Map();
  let edges = [];
  let seams = [];
  for (const file of nodes) {
    const language = languageOf(file);
    languages[language] = (languages[language] ?? 0) + 1;
    const source = sources.get(file);
    if (RUBY_LANGUAGES.has(language)) {
      edges.push(...rubyEdges(file, source, autoloadIndex).filter((edge) => nodeSet.has(edge.to)));
      symbolsByFile.set(file, rubySymbols(stripRubyComments(source)));
    }
    if (SCRIPT_LANGUAGES.has(language)) {
      const found = scriptEdges(file, source, nodeSet, tsconfig, routesByPath);
      edges.push(...found.edges);
      seams.push(...found.seams);
      symbolsByFile.set(file, scriptSymbols(source));
    }
  }
  for (const route of routes) {
    if (nodeSet.has(route.controller)) edges.push({ from: ROUTES_FILE, to: route.controller, kind: 'route' });
  }
  edges = dedupeEdges(edges);
  seams = seams
    .filter((seam, index, all) => all.findIndex((other) => other.from === seam.from && other.route === seam.route) === index)
    .sort((a, b) => a.from.localeCompare(b.from) || a.route.localeCompare(b.route));
  if (nodes.length === 0) warnings.push('no files with a known extension under the root');

  const clustering = assignClusters(nodes, edges);
  mergeSameSlugSeeds(clustering);
  mergeSeamedSeeds(clustering, seams);
  mergeSmallClusters(clustering, edges);
  const { assignment } = clustering;
  const ids = assignIds(clustering);
  const incoming = incomingCounts(edges);
  const clusters = [...ids]
    .map(([key, { id, seedDirectories }]) => {
      const files = nodes.filter((file) => assignment.get(file) === key);
      const edgesOut = {};
      for (const edge of edges) {
        if (assignment.get(edge.from) !== key || assignment.get(edge.to) === key) continue;
        const target = ids.get(assignment.get(edge.to)).id;
        edgesOut[target] = (edgesOut[target] ?? 0) + 1;
      }
      return {
        id,
        dirs: [...new Set(files.map((file) => posix.dirname(file)))].filter((directory) => directory !== '.').sort(),
        files,
        symbols: [...new Set(files.flatMap((file) => symbolsByFile.get(file) ?? []))].sort(),
        edges_out: Object.fromEntries(Object.entries(edgesOut).sort()),
        seams: seams.filter((seam) => assignment.get(seam.from) === key),
        draft: draftFor(id, files, seedDirectories, incoming, symbolsByFile),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const changed = changedFilesOf(root, options);
  const selected = changed === null
    ? clusters
    : clusters
        .filter((cluster) => cluster.files.some((file) => changed.has(file)))
        .map((cluster) => ({ ...cluster, changed_files: cluster.files.filter((file) => changed.has(file)) }));

  return {
    root,
    generated_at: new Date().toISOString(),
    languages: Object.fromEntries(Object.entries(languages).sort()),
    warnings,
    clusters: selected,
    seams,
    stats: { files: nodes.length, edges: edges.length, clusters: clusters.length },
  };
}

function changedFilesOf(root, options) {
  if (options.changed !== null) return new Set(options.changed.split(',').map((path) => path.trim()).filter((path) => path !== ''));
  if (options.since !== null) return new Set(changedFilesSince(root, options.since));
  return null;
}

function comparable(graph) {
  return { languages: graph.languages, warnings: graph.warnings, clusters: graph.clusters, seams: graph.seams };
}

function firstDifference(expected, actual, path) {
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) return { path, expected, actual };
    for (let index = 0; index < Math.max(expected.length, actual.length); index += 1) {
      const difference = firstDifference(expected[index], actual[index], `${path}[${index}]`);
      if (difference !== null) return difference;
    }
    return null;
  }
  if (expected !== null && actual !== null && typeof expected === 'object' && typeof actual === 'object') {
    for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
      const difference = firstDifference(expected[key], actual[key], `${path}.${key}`);
      if (difference !== null) return difference;
    }
    return null;
  }
  return expected === actual ? null : { path, expected, actual };
}

function summaryLine(graph) {
  const languages = Object.entries(graph.languages).map(([language, count]) => `${language} ${count}`).join(', ');
  return `project-graph: ${graph.stats.files} files · ${graph.stats.edges} edges · ${graph.stats.clusters} clusters · ${languages || 'no code files'} · ${graph.seams.length} seams · LSP not used: static graph; metaprogramming is invisible`;
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  const root = resolve(options.root);
  const graph = buildGraph(root, options);
  const json = `${JSON.stringify(graph, null, 2)}\n`;
  if (options.expect !== null) {
    const expected = JSON.parse(readFileSync(resolve(options.expect), 'utf8'));
    const difference = firstDifference(expected, comparable(graph), '$');
    if (difference !== null) {
      fail(EXIT_MISMATCH, `project-graph: --expect mismatch at ${difference.path}: expected ${JSON.stringify(difference.expected)}, got ${JSON.stringify(difference.actual)}`);
    }
  }
  if (options.out !== null) {
    writeFileSync(resolve(options.out), json);
    console.log(summaryLine(graph));
    return;
  }
  if (options.expect !== null) {
    console.log(summaryLine(graph));
    return;
  }
  process.stdout.write(json);
  console.error(summaryLine(graph));
}

main();
