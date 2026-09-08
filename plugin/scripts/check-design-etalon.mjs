#!/usr/bin/env node
//
// Machine layer of the /mneme:design fixation postconditions (the skill's checklist is layer 1;
// this checker is layer 2 — the two layers verify the SAME list, and catch different failures:
// the checklist catches what needs judgement, the checker catches silent drift).
//
// Usage: node check-design-etalon.mjs <path/to/design/pages/SLUG/SLUG.html | SLUG.json>
//
// A page is a FOLDER: design/pages/<slug>/<slug>.html or <slug>.json plus that page's drafts; the
// pages index design/pages/index.html links every page and is maintained by the skill at fixation —
// this checker GUARDS that duty read-only, it never writes. The branch is chosen by the extension.
//
// Postconditions shared by both formats:
//   RESERVED-SLUG        — the page folder must not be named "index" (taken by the pages index);
//   NO-INDEX-LINK        — ../index.html must exist and link this page (<slug>/<file>) —
//                          fixation is obliged to update the pages index.
// HTML etalon:
//   (1) NO-TOKENS-LINK   — the etalon must LINK the shared layer (../../system/tokens.css,
//                          the folder-per-page depth — the only accepted one), never copy it in;
//   (2) NO-MANIFEST-*    — the etalon must DECLARE its fixtures and states machine-readably
//                          (<meta name="design-fixtures|design-states" content="a,b,c">);
//       MISSING-FIXTURE/-STATE — every declared name must be present as data-fixture= / data-state=;
//   (3) RAW-HEX / RAW-PX — no values bypassing tokens.css: raw hex colors anywhere in style
//                          context, and px literals in CSS declarations that carry no var(--…).
//                          This is a HEURISTIC and false-negative by design (a bypass that
//                          mimics a token slips through); it never false-positives on tokens.
// JSON etalon — the etalon v1 contract of the Melete design server; the component truth is
// ../../system/registry.json and the token vocabulary is ../../system/tokens.css, both written by
// the server and found from the page folder:
//   INVALID-ETALON       — not JSON, or off the schema (reported alone, nothing else runs);
//   SLUG-MISMATCH        — the file is not <folder>.json, or the slug field differs from the folder;
//   NO-REGISTRY          — registry.json missing or unreadable (reported alone, the rest is skipped);
//   the sixteen codes of the Melete validator, in its order and wording: DUPLICATE-ID,
//   UNKNOWN-NODE, PARENT-AFTER-CHILD, MULTIPLE-PARENTS, ORPHAN-NODE, PROPOSAL-WITHOUT-NOTE,
//   UNKNOWN-COMPONENT, UNKNOWN-PROP, BAD-ENUM, FUNCTION-PROP-VALUE, RAW-STYLE-VALUE, SLOT-NOT-NODE,
//   MISSING-PROP, UNKNOWN-TOKEN, MISSING-FIXTURE-PATH, UNUSED-STATE.
//   The five primitives (Stack, Row, Text, Box, Placeholder) and STYLE_PROPS are copies of
//   src/etalon/primitives.ts of Melete: a raw value in a style prop of a primitive is
//   RAW-STYLE-VALUE; registry components style themselves and are not checked for it.
//
// Every failure is a NAMED line on stderr + non-zero exit; the run never half-passes.

import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { collectStyleContexts, scanRawValues } from './design-rules.mjs';

const etalonPath = process.argv[2];
if (etalonPath === undefined) {
  console.error('check-design-etalon: usage: node check-design-etalon.mjs <path/to/etalon.html | etalon.json>');
  process.exit(2);
}

let source;
try {
  source = readFileSync(etalonPath, 'utf8');
} catch (error) {
  console.error(`check-design-etalon: cannot read ${etalonPath}: ${error.message}`);
  process.exit(2);
}

const failures = [];
const slug = basename(dirname(etalonPath));
const pagesDirectory = dirname(dirname(etalonPath));
const systemDirectory = join(pagesDirectory, '..', 'system');

function checkPageFolder() {
  if (slug === 'index') {
    failures.push('RESERVED-SLUG: a page folder must not be named "index" — that slug is taken by the pages index (design/pages/index.html)');
    return;
  }
  const indexPath = join(pagesDirectory, 'index.html');
  if (!existsSync(indexPath)) {
    failures.push(`NO-INDEX-LINK: ${indexPath} does not exist — fixation is obliged to create/update the pages index with a link to ${slug}/${basename(etalonPath)}`);
  } else if (!readFileSync(indexPath, 'utf8').includes(`${slug}/${basename(etalonPath)}`)) {
    failures.push(`NO-INDEX-LINK: the pages index carries no link to ${slug}/${basename(etalonPath)} — fixation is obliged to update the index`);
  }
}

function checkHtmlEtalon(html) {
  const linksTokens = /<link[^>]+href="\.\.\/\.\.\/system\/tokens\.css"/.test(html);
  if (!linksTokens) {
    failures.push('NO-TOKENS-LINK: the etalon must link the shared layer (<link … href="../../system/tokens.css"> — the folder-per-page depth) — copying the layer in, or the old flat ../system depth, is a violation');
  }

  checkPageFolder();

  const readManifest = (name) => {
    const match = html.match(new RegExp(`<meta[^>]+name="${name}"[^>]+content="([^"]*)"`));
    if (match === null) return null;
    return match[1].split(',').map((item) => item.trim()).filter((item) => item.length > 0);
  };

  const fixtures = readManifest('design-fixtures');
  if (fixtures === null) {
    failures.push('NO-MANIFEST-FIXTURES: the etalon must declare its fixtures (<meta name="design-fixtures" content="typical,minimal,extreme">) — the manifest is the checker\'s contract');
  } else {
    for (const fixture of fixtures) {
      if (!html.includes(`data-fixture="${fixture}"`)) {
        failures.push(`MISSING-FIXTURE: fixture "${fixture}" is declared in the manifest but no data-fixture="${fixture}" block exists — declared and present must match`);
      }
    }
  }

  const states = readManifest('design-states');
  if (states === null) {
    failures.push('NO-MANIFEST-STATES: the etalon must declare its states (<meta name="design-states" content="default,empty,loading,error">) — the manifest is the checker\'s contract');
  } else {
    for (const state of states) {
      if (!html.includes(`data-state="${state}"`)) {
        failures.push(`MISSING-STATE: state "${state}" is declared in the manifest but no data-state="${state}" block exists — declared and present must match`);
      }
    }
  }

  for (const finding of scanRawValues(collectStyleContexts(html))) {
    if (finding.name === 'RAW-HEX') {
      failures.push(`RAW-HEX: raw hex color in style context («${finding.declaration}») — colors come from tokens.css via var(--…)`);
    } else {
      failures.push(`RAW-PX: raw px literal without var(--…) in the declaration («${finding.declaration}») — sizes come from tokens.css`);
    }
  }

  return { summary: 'shared layer linked, manifest matches, no raw values, pages index links the page.', hint: null };
}

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const COMPONENT_PATTERN = /^(?:proposal:)?[A-Za-z_$][A-Za-z0-9_$]*$/;
const PATH_PATTERN = /^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$/;
const DATA_BINDING = /^\$data\.(.+)$/;
const TOKEN_BINDING = /^\$token\.([A-Za-z0-9_-]+)$/;
const PROPOSAL_PREFIX = 'proposal:';
const ROOT_KEYS = ['melete', 'slug', 'name', 'data', 'states', 'nodes'];
const NODE_KEYS = ['id', 'component', 'props', 'children', 'slots', 'note'];
const ALIGNMENTS = ['start', 'center', 'end', 'stretch'];
const PRIMITIVES = [
  {
    name: 'Stack',
    props: [
      { name: 'gap', type: 'string', required: false },
      { name: 'align', type: 'enum', values: ALIGNMENTS, required: false },
      { name: 'children', type: 'node', required: false },
    ],
  },
  {
    name: 'Row',
    props: [
      { name: 'gap', type: 'string', required: false },
      { name: 'align', type: 'enum', values: ALIGNMENTS, required: false },
      { name: 'wrap', type: 'boolean', required: false },
      { name: 'children', type: 'node', required: false },
    ],
  },
  {
    name: 'Text',
    props: [
      { name: 'text', type: 'string', required: true },
      { name: 'tone', type: 'string', required: false },
      { name: 'font', type: 'string', required: false },
      { name: 'size', type: 'string', required: false },
      { name: 'weight', type: 'string', required: false },
      { name: 'leading', type: 'string', required: false },
    ],
  },
  {
    name: 'Box',
    props: [
      { name: 'fill', type: 'string', required: false },
      { name: 'stroke', type: 'string', required: false },
      { name: 'radius', type: 'string', required: false },
      { name: 'padding', type: 'string', required: false },
      { name: 'children', type: 'node', required: false },
    ],
  },
  {
    name: 'Placeholder',
    props: [
      { name: 'label', type: 'string', required: true },
      { name: 'height', type: 'string', required: false },
      { name: 'note', type: 'string', required: false },
      { name: 'children', type: 'node', required: false },
    ],
  },
];
const STYLE_PROPS = new Set(['fill', 'stroke', 'radius', 'padding', 'gap', 'height', 'tone', 'font', 'size', 'weight', 'leading']);
const isPrimitive = (component) => PRIMITIVES.some((primitive) => primitive.name === component);
const REGISTRY_REMEDY = 'start /mneme:design-server — the registry is written by the server only';
const SERVER_OWNED_HINT = 'hint: registry.json and tokens.css are written by the design server — a component, prop or token missing there means the server has not rewritten them; start /mneme:design-server, never edit registry.json by hand';
const SERVER_OWNED_CODES = new Set(['UNKNOWN-COMPONENT', 'UNKNOWN-PROP', 'UNKNOWN-TOKEN']);

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isName = (value) => typeof value === 'string' && NAME_PATTERN.test(value);
const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;
const isNameList = (value) => Array.isArray(value) && value.every(isName);
const isProposal = (component) => component.startsWith(PROPOSAL_PREFIX);
const pluralize = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

function classifyPropValue(value) {
  if (typeof value === 'string') {
    const data = DATA_BINDING.exec(value);
    if (data !== null && PATH_PATTERN.test(data[1])) return { kind: 'data', path: data[1] };
    const token = TOKEN_BINDING.exec(value);
    if (token !== null) return { kind: 'token', name: token[1] };
  }
  return { kind: 'literal', value };
}

const isSupportedPropValue = (value) => typeof value !== 'string' || !value.startsWith('$') || classifyPropValue(value).kind !== 'literal';

function unknownKey(object, knownKeys) {
  return Object.keys(object).find((key) => !knownKeys.includes(key)) ?? null;
}

function nodeProblem(node, path) {
  if (!isPlainObject(node)) return { path, message: 'must be an object' };
  const stranger = unknownKey(node, NODE_KEYS);
  if (stranger !== null) return { path: `${path}.${stranger}`, message: 'unrecognized key' };
  if (!isName(node.id)) return { path: `${path}.id`, message: 'must match [a-z0-9][a-z0-9-]*' };
  if (typeof node.component !== 'string' || !COMPONENT_PATTERN.test(node.component)) {
    return { path: `${path}.component`, message: 'must be a component name, optionally prefixed with proposal:' };
  }
  if (node.props !== undefined) {
    if (!isPlainObject(node.props)) return { path: `${path}.props`, message: 'must be an object' };
    for (const [name, value] of Object.entries(node.props)) {
      if (name.length === 0) return { path: `${path}.props`, message: 'prop names must be non-empty' };
      if (!isSupportedPropValue(value)) {
        return { path: `${path}.props.${name}`, message: 'a string starting with $ must be a $data.<path> or $token.<name> binding' };
      }
    }
  }
  if (node.children !== undefined && !isNameList(node.children)) {
    return { path: `${path}.children`, message: 'must be a list of node ids matching [a-z0-9][a-z0-9-]*' };
  }
  if (node.slots !== undefined) {
    if (!isPlainObject(node.slots)) return { path: `${path}.slots`, message: 'must be an object of slot lists' };
    for (const [slotName, ids] of Object.entries(node.slots)) {
      if (slotName.length === 0) return { path: `${path}.slots`, message: 'slot names must be non-empty' };
      if (!isNameList(ids)) return { path: `${path}.slots.${slotName}`, message: 'must be a list of node ids matching [a-z0-9][a-z0-9-]*' };
    }
  }
  if (node.note !== undefined && !isNonEmptyString(node.note)) return { path: `${path}.note`, message: 'must be a non-empty string' };
  return null;
}

function schemaProblem(etalon) {
  if (!isPlainObject(etalon)) return { path: '<root>', message: 'must be an object' };
  const stranger = unknownKey(etalon, ROOT_KEYS);
  if (stranger !== null) return { path: stranger, message: 'unrecognized key' };
  if (etalon.melete !== 1) return { path: 'melete', message: 'must be 1' };
  if (!isName(etalon.slug)) return { path: 'slug', message: 'must match [a-z0-9][a-z0-9-]*' };
  if (!isNonEmptyString(etalon.name)) return { path: 'name', message: 'must be a non-empty string' };
  if (!isPlainObject(etalon.data)) return { path: 'data', message: 'must be an object of fixtures' };
  for (const [fixtureName, fixture] of Object.entries(etalon.data)) {
    if (!isName(fixtureName)) return { path: `data.${fixtureName}`, message: 'must match [a-z0-9][a-z0-9-]*' };
    if (!isPlainObject(fixture)) return { path: `data.${fixtureName}`, message: 'must be an object' };
  }
  if (Object.keys(etalon.data).length === 0) return { path: 'data', message: 'at least one fixture is required' };
  if (etalon.states !== undefined) {
    if (!isPlainObject(etalon.states)) return { path: 'states', message: 'must be an object of states' };
    for (const [stateName, overrides] of Object.entries(etalon.states)) {
      if (!isName(stateName)) return { path: `states.${stateName}`, message: 'must match [a-z0-9][a-z0-9-]*' };
      if (stateName === 'default') return { path: 'states.default', message: 'the default state is implied and cannot be declared' };
      if (!isPlainObject(overrides)) return { path: `states.${stateName}`, message: 'must be an object of path overrides' };
      for (const path of Object.keys(overrides)) {
        if (!PATH_PATTERN.test(path)) return { path: `states.${stateName}.${path}`, message: 'must be a dot-separated path of identifiers' };
      }
    }
  }
  if (!Array.isArray(etalon.nodes) || etalon.nodes.length === 0) return { path: 'nodes', message: 'at least one node is required' };
  for (const [position, node] of etalon.nodes.entries()) {
    const problem = nodeProblem(node, `nodes.${position}`);
    if (problem !== null) return problem;
  }
  return null;
}

function withDefaults(etalon) {
  return {
    ...etalon,
    states: etalon.states === undefined ? {} : etalon.states,
    nodes: etalon.nodes.map((node) => ({
      ...node,
      props: node.props === undefined ? {} : node.props,
      children: node.children === undefined ? [] : node.children,
      slots: node.slots === undefined ? {} : node.slots,
    })),
  };
}

function parseEtalon(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    failures.push(`INVALID-ETALON: the etalon is not valid JSON: ${error.message}`);
    return null;
  }
  const problem = schemaProblem(parsed);
  if (problem !== null) {
    failures.push(`INVALID-ETALON: the etalon is invalid at "${problem.path}": ${problem.message}`);
    return null;
  }
  return withDefaults(parsed);
}

function checkSlug(etalon) {
  const fileName = basename(etalonPath);
  if (fileName !== `${slug}.json`) {
    failures.push(`SLUG-MISMATCH: the etalon file is "${fileName}" but the page folder is "${slug}" — the etalon must be design/pages/${slug}/${slug}.json`);
  }
  if (etalon.slug !== slug) {
    failures.push(`SLUG-MISMATCH: the slug field is "${etalon.slug}" but the page folder is "${slug}" — the two must be equal`);
  }
}

const isRegistryProp = (prop) => isPlainObject(prop) && typeof prop.name === 'string' && typeof prop.type === 'string' && (prop.type !== 'enum' || Array.isArray(prop.values));
const isRegistryComponent = (component) => isPlainObject(component) && typeof component.name === 'string' && Array.isArray(component.props) && component.props.every(isRegistryProp);
const isRegistry = (registry) => isPlainObject(registry) && registry.melete === 1 && Array.isArray(registry.components) && registry.components.every(isRegistryComponent);

function readRegistry() {
  const registryPath = join(systemDirectory, 'registry.json');
  if (!existsSync(registryPath)) {
    failures.push(`NO-REGISTRY: ${registryPath} does not exist — ${REGISTRY_REMEDY}`);
    return null;
  }
  let registry;
  try {
    registry = JSON.parse(readFileSync(registryPath, 'utf8'));
  } catch (error) {
    failures.push(`NO-REGISTRY: ${registryPath} is not valid JSON (${error.message}) — ${REGISTRY_REMEDY}`);
    return null;
  }
  if (!isRegistry(registry)) {
    failures.push(`NO-REGISTRY: ${registryPath} is not a Melete registry (melete: 1 with a components list is required) — ${REGISTRY_REMEDY}`);
    return null;
  }
  return registry;
}

const CSS_COMMENT = /\/\*[\s\S]*?\*\//g;
const CUSTOM_PROPERTY_DECLARATION = /(?:^|[\s;{])--([A-Za-z0-9_-]+)\s*:/g;

function readTokenVocabulary() {
  const tokensPath = join(systemDirectory, 'tokens.css');
  if (!existsSync(tokensPath)) return [];
  const declarations = readFileSync(tokensPath, 'utf8').replace(CSS_COMMENT, '');
  return [...new Set([...declarations.matchAll(CUSTOM_PROPERTY_DECLARATION)].map((match) => match[1]))];
}

function indexNodes(nodes, issues) {
  const index = new Map();
  nodes.forEach((node, position) => {
    if (index.has(node.id)) {
      issues.push({ code: 'DUPLICATE-ID', message: `node id "${node.id}" is declared more than once` });
      return;
    }
    index.set(node.id, position);
  });
  return index;
}

const referencedIds = (node) => [...node.children, ...Object.values(node.slots).flat()];

function checkTree(nodes, nodeIndex, issues) {
  const parents = new Map();
  nodes.forEach((node, position) => {
    for (const childId of referencedIds(node)) {
      const childPosition = nodeIndex.get(childId);
      if (childPosition === undefined) {
        issues.push({ code: 'UNKNOWN-NODE', message: `node "${node.id}" references "${childId}", which is not declared` });
        continue;
      }
      if (childPosition <= position) {
        issues.push({ code: 'PARENT-AFTER-CHILD', message: `node "${node.id}" references "${childId}", which is declared before it; parents come first` });
      }
      const parent = parents.get(childId);
      if (parent !== undefined) {
        issues.push({ code: 'MULTIPLE-PARENTS', message: `node "${childId}" belongs to both "${parent}" and "${node.id}"; a node has exactly one parent` });
        continue;
      }
      parents.set(childId, node.id);
    }
  });
  nodes.forEach((node, position) => {
    if (position > 0 && !parents.has(node.id)) {
      issues.push({ code: 'ORPHAN-NODE', message: `node "${node.id}" is not a child or slot of any node` });
    }
  });
}

function isPropProvided(node, prop) {
  if (prop.name in node.props) return true;
  if (prop.type !== 'node') return false;
  const slotted = prop.name === 'children' ? node.children : node.slots[prop.name];
  return slotted !== undefined && slotted.length > 0;
}

function checkProps(node, component, issues) {
  const props = new Map(component.props.map((prop) => [prop.name, prop]));
  for (const [name, value] of Object.entries(node.props)) {
    const prop = props.get(name);
    if (prop === undefined) {
      issues.push({ code: 'UNKNOWN-PROP', message: `node "${node.id}": ${component.name} has no prop "${name}"` });
      continue;
    }
    if (prop.type === 'enum' && classifyPropValue(value).kind === 'literal' && !prop.values.includes(String(value))) {
      issues.push({ code: 'BAD-ENUM', message: `node "${node.id}": ${component.name}.${name} must be one of ${prop.values.join(', ')}, got ${JSON.stringify(value)}` });
    }
    if (prop.type === 'function') {
      issues.push({ code: 'FUNCTION-PROP-VALUE', message: `node "${node.id}": ${component.name}.${name} is a function prop; behaviour is wired in code, leave it out` });
    }
    if (isPrimitive(component.name) && STYLE_PROPS.has(name) && classifyPropValue(value).kind === 'literal') {
      issues.push({ code: 'RAW-STYLE-VALUE', message: `node "${node.id}": ${component.name}.${name} carries a raw value; bind a $token or a $data path` });
    }
  }
  const slotNames = [...(node.children.length > 0 ? ['children'] : []), ...Object.keys(node.slots)];
  for (const slotName of slotNames) {
    const prop = props.get(slotName);
    if (prop === undefined || prop.type !== 'node') {
      issues.push({ code: 'SLOT-NOT-NODE', message: `node "${node.id}": ${component.name} has no node prop "${slotName}" to hold child nodes` });
    }
  }
  for (const prop of component.props) {
    if (prop.required && !isPropProvided(node, prop)) {
      issues.push({ code: 'MISSING-PROP', message: `node "${node.id}": ${component.name} requires prop "${prop.name}"` });
    }
  }
}

function collectBindings(node, tokenNames, binders, issues) {
  for (const [name, value] of Object.entries(node.props)) {
    const binding = classifyPropValue(value);
    if (binding.kind === 'token' && !tokenNames.has(binding.name)) {
      issues.push({ code: 'UNKNOWN-TOKEN', message: `node "${node.id}": prop "${name}" uses $token.${binding.name}, which tokens.css does not declare` });
    }
    if (binding.kind === 'data' && !binders.has(binding.path)) {
      binders.set(binding.path, node.id);
    }
  }
}

function hasPath(value, path) {
  let current = value;
  for (const segment of path.split('.')) {
    if (Array.isArray(current)) {
      const element = current[Number(segment)];
      if (element === undefined) return false;
      current = element;
      continue;
    }
    if (typeof current !== 'object' || current === null || !Object.hasOwn(current, segment)) return false;
    current = current[segment];
  }
  return true;
}

function checkFixtures(etalon, binders, issues) {
  for (const [path, nodeId] of binders) {
    for (const [fixtureName, fixture] of Object.entries(etalon.data)) {
      if (!hasPath(fixture, path)) {
        issues.push({ code: 'MISSING-FIXTURE-PATH', message: `fixture "${fixtureName}" has no path "${path}", which node "${nodeId}" binds` });
      }
    }
  }
  for (const [stateName, overrides] of Object.entries(etalon.states)) {
    if (!Object.keys(overrides).some((path) => binders.has(path))) {
      issues.push({ code: 'UNUSED-STATE', message: `state "${stateName}" overrides no path that a node binds` });
    }
  }
}

function validateEtalon(etalon, registry, tokens) {
  const components = new Map([...PRIMITIVES, ...registry.components].map((component) => [component.name, component]));
  const tokenNames = new Set(tokens);
  const issues = [];
  const binders = new Map();
  let proposals = 0;

  const nodeIndex = indexNodes(etalon.nodes, issues);
  checkTree(etalon.nodes, nodeIndex, issues);
  for (const node of etalon.nodes) {
    if (isProposal(node.component)) {
      proposals += 1;
      if (node.note === undefined) {
        issues.push({ code: 'PROPOSAL-WITHOUT-NOTE', message: `proposal node "${node.id}" (${node.component}) needs a note explaining what is missing` });
      }
    } else {
      const component = components.get(node.component);
      if (component === undefined) {
        issues.push({ code: 'UNKNOWN-COMPONENT', message: `node "${node.id}" uses "${node.component}", which is neither a registry component nor a Melete primitive` });
      } else {
        checkProps(node, component, issues);
      }
    }
    collectBindings(node, tokenNames, binders, issues);
  }
  checkFixtures(etalon, binders, issues);
  return { issues, proposals };
}

function checkJsonEtalon(text) {
  checkPageFolder();
  const etalon = parseEtalon(text);
  if (etalon === null) return { summary: null, hint: null };
  checkSlug(etalon);
  const registry = readRegistry();
  if (registry === null) return { summary: null, hint: null };
  const { issues, proposals } = validateEtalon(etalon, registry, readTokenVocabulary());
  for (const issue of issues) failures.push(`${issue.code}: ${issue.message}`);
  const hint = issues.some((issue) => SERVER_OWNED_CODES.has(issue.code)) ? SERVER_OWNED_HINT : null;
  return {
    summary: `registry matched, ${pluralize(etalon.nodes.length, 'node')}, ${pluralize(proposals, 'proposal')}, pages index links the page.`,
    hint,
  };
}

const { summary, hint } = extname(etalonPath) === '.json' ? checkJsonEtalon(source) : checkHtmlEtalon(source);

if (failures.length > 0) {
  console.error(`check-design-etalon: ${etalonPath} FAILED:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  if (hint !== null) console.error(`  ${hint}`);
  process.exit(1);
}

console.log(`check-design-etalon: ${etalonPath} passed — ${summary}`);
