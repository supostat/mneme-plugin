#!/usr/bin/env node
//
// Two-sided test of the shipped etalon checker (plugin/scripts/check-design-etalon.mjs), both
// branches: the HTML etalon and the JSON etalon of the Melete design server.
//
// The positive side alone would accept a checker that passes everything, so every negative case
// is exercised explicitly (the check-skill-names lesson), and each dirty case must fail WITH the
// named error that tells the author what to repair — a bare non-zero exit is a useless verdict
// the next author will "fix" backwards. The JSON side carries one negative per code, each a
// mutation of the shared example with the same trigger the Melete validator tests use.
//
// Fixtures are built in an OS temp directory (never inside plugin/), a full mini design/ tree in
// the folder-per-page convention: system/tokens.css (+ system/registry.json for JSON) +
// pages/index.html + pages/<slug>/<slug>.html|json, the checker spawned per case via spawnSync.
//
// scripts/fixtures/design-json/{login.json, design-book.json, tokens.css} are byte-for-byte copies
// of the Melete fixtures at commit e8850ee — tests/fixtures/etalons/login.json (the shared example,
// valid against that registry with exactly one proposal), tests/fixtures/etalons/design-book.json
// (the book example: light and dark fixtures, zero proposals) and
// tests/fixtures/react-project/design/system/tokens.css. registry.json is a copy in its components
// and tokens only: its elements block is NARROWED BY HAND to the tags and common attributes these
// cases need, because the generated vocabulary is 178 tags and 20403 attribute entries (~440 KB)
// and lives in a gitignored artifact. svg stands in that narrow list for one reason: a real
// project DECLARES it, so only a vocabulary that knows the tag can prove the refusal is asked
// FIRST — without it the refusal case would pass on a tag the vocabulary rejects anyway. Parity is
// carried by the messages and the rules — code, not data — and by mutations mirroring Melete's own
// validator tests.
//
// Three limits are accepted deliberately: no case runs the checker against a REAL generated
// vocabulary (a divergence that shows only at that size, or on an entry the narrow fixture lacks,
// is caught by Melete's hook on a live etalon, not here); a refusal case exists per REASON, not
// per refused name — style shares className's reason, and a literal on an Element style prop shares
// the RAW-STYLE-VALUE branch already covered on Box; and nothing here detects the NEXT drift of
// the primitive copy — the stale-source hint names the table to update, but a divergence is found
// by a live page going red, not by this gate.
//
// Dev tooling: lives at the repo ROOT, never inside plugin/ — the checker itself is a PRODUCT
// artifact and ships; this test does not.
//
// Usage: node scripts/check-design-checker.mjs   (also runs as part of npm test)

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const checker = resolve(scriptsDirectory, '..', 'plugin', 'scripts', 'check-design-etalon.mjs');
const fixturesDirectory = join(scriptsDirectory, 'fixtures', 'design-json');
const readFixture = (name) => readFileSync(join(fixturesDirectory, name), 'utf8');

const failures = [];

const goodEtalon = `<!doctype html>
<html>
<head>
  <meta name="design-fixtures" content="typical,minimal,extreme">
  <meta name="design-states" content="default,empty,loading,error">
  <link rel="stylesheet" href="../../system/tokens.css">
  <style>
    .card { padding: var(--space-2); color: var(--color-text); }
  </style>
</head>
<body>
  <section data-fixture="typical" data-state="default"></section>
  <section data-fixture="minimal" data-state="empty"></section>
  <section data-fixture="extreme" data-state="loading"></section>
  <section data-state="error"></section>
</body>
</html>
`;

const goodJsonEtalon = readFixture('login.json');
const bookEtalon = readFixture('design-book.json');
const registryJson = readFixture('registry.json');
const tokensCss = readFixture('tokens.css');

function assertVerdict(name, result, expectFailure, expectStdout) {
  if (expectFailure === null) {
    if (result.status !== 0) {
      failures.push(`${name}: a valid etalon must pass, got exit ${result.status}: ${result.stderr}`);
    } else if (expectStdout !== undefined && !result.stdout.includes(expectStdout)) {
      failures.push(`${name}: passes, but the success line lacks "${expectStdout}" (stdout: ${result.stdout.trim()})`);
    }
    return;
  }
  if (result.status === 0) {
    failures.push(`${name}: a broken etalon passed — the ${expectFailure} case is not caught`);
  } else if (!result.stderr.includes(expectFailure)) {
    failures.push(`${name}: fails, but without the named error ${expectFailure} — a bare rejection teaches nothing (stderr: ${result.stderr.trim()})`);
  }
}

const linkingIndex = (slug, extension) => `<!doctype html><html><body><a href="${slug}/${slug}.${extension}">${slug}</a></body></html>\n`;

function runCase(name, slug, mutate, expectFailure, { indexHtml = linkingIndex(slug, 'html') } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'design-checker-'));
  try {
    mkdirSync(join(root, 'design', 'system'), { recursive: true });
    mkdirSync(join(root, 'design', 'pages', slug), { recursive: true });
    writeFileSync(join(root, 'design', 'system', 'tokens.css'), ':root { --space-2: 8px; --color-text: black; }\n');
    if (indexHtml !== null) {
      writeFileSync(join(root, 'design', 'pages', 'index.html'), indexHtml);
    }
    const etalonPath = join(root, 'design', 'pages', slug, `${slug}.html`);
    writeFileSync(etalonPath, mutate(goodEtalon));
    const result = spawnSync(process.execPath, [checker, etalonPath], { encoding: 'utf8' });
    assertVerdict(name, result, expectFailure);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runJsonCase(name, slug, mutate, expectFailure, { registry = registryJson, indexHtml = linkingIndex(slug, 'json'), expectStdout, etalon = goodJsonEtalon } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'design-checker-json-'));
  try {
    mkdirSync(join(root, 'design', 'system'), { recursive: true });
    mkdirSync(join(root, 'design', 'pages', slug), { recursive: true });
    writeFileSync(join(root, 'design', 'system', 'tokens.css'), tokensCss);
    if (registry !== null) {
      writeFileSync(join(root, 'design', 'system', 'registry.json'), registry);
    }
    if (indexHtml !== null) {
      writeFileSync(join(root, 'design', 'pages', 'index.html'), indexHtml);
    }
    const etalonPath = join(root, 'design', 'pages', slug, `${slug}.json`);
    writeFileSync(etalonPath, mutate(etalon));
    const result = spawnSync(process.execPath, [checker, etalonPath], { encoding: 'utf8' });
    assertVerdict(name, result, expectFailure, expectStdout);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const mutateJson = (transform) => (text) => {
  const etalon = JSON.parse(text);
  transform(etalon);
  return JSON.stringify(etalon, null, 2);
};
const nodeOf = (etalon, id) => etalon.nodes.find((node) => node.id === id);
const unchanged = (text) => text;

// The login page plus one Element node whose props the case provides — the helper of
// M/src/etalon/etalon-validator.test.ts:39-44.
const withElement = (props) => mutateJson((etalon) => {
  nodeOf(etalon, 'page').children.push('widget');
  etalon.nodes.push({ id: 'widget', component: 'Element', props });
});

function registryWithoutVocabulary() {
  const registry = JSON.parse(registryJson);
  delete registry.elements;
  return JSON.stringify(registry, null, 2);
}
const FUNCTION_PROP_VALUE_LINE = 'FUNCTION-PROP-VALUE: node "form": LoginForm.onSubmit is a function prop; behaviour is wired in code, leave it out';
const RAW_STYLE_VALUE_LINE = 'RAW-STYLE-VALUE: node "swatch-accent": Box.fill carries a raw value; bind a $token or a $data path';
const UNKNOWN_TAG_LINE = 'UNKNOWN-TAG: node "widget": no element is called "slect" in this project\'s vocabulary';
const UNKNOWN_ATTRIBUTE_LINE = 'UNKNOWN-ATTRIBUTE: node "widget": "input" takes no attribute "palceholder"';
const REFUSED_STYLING_LINE = 'UNKNOWN-ATTRIBUTE: node "widget": attribute "className" is refused — styling goes through the style props bound to tokens';
const REFUSED_BEHAVIOUR_LINE = 'UNKNOWN-ATTRIBUTE: node "widget": attribute "onClick" is refused — behaviour is wired in code, not in an etalon';
const MISSING_TAG_LINE = 'MISSING-PROP: node "widget": Element requires prop "tag"';
const REFUSED_TAG_LINE = 'REFUSED-TAG: node "widget": tag "svg" is refused — an icon is a component: bind one the registry lists, or ask for it with a proposal:Icon node';
const ELEMENT_GAP_LINE = 'UNKNOWN-ATTRIBUTE: node "widget": "div" takes no attribute "gap"';
const RAW_MAX_WIDTH_LINE = 'RAW-STYLE-VALUE: node "page": Stack.maxWidth carries a raw value; bind a $token or a $data path';
const STALE_SOURCE_HINT_LINE = 'the primitives are a copy inside this checker';
const NO_ELEMENT_VOCABULARY_LINE = 'is not a Melete registry (melete: 1 with a components list and an element vocabulary is required)';

// positive: a full valid page folder with an indexed link passes
runCase('good', 'good', unchanged, null);

// negative: the shared layer is not linked at all
runCase('no-link', 'good', (html) => html.replace(/<link[^>]*>\n/, ''), 'NO-TOKENS-LINK');

// negative: the OLD flat depth (../system) is not accepted — only the folder-per-page depth is
runCase('flat-depth-link', 'good', (html) => html.replace('../../system/tokens.css', '../system/tokens.css'), 'NO-TOKENS-LINK');

// negative: a declared fixture has no block
runCase('missing-fixture', 'good', (html) => html.replace(' data-fixture="extreme"', ''), 'MISSING-FIXTURE');

// negative: a declared state has no block
runCase('missing-state', 'good', (html) => html.replace(' data-state="error"', ''), 'MISSING-STATE');

// negative: no fixtures manifest at all
runCase('no-manifest', 'good', (html) => html.replace(/<meta name="design-fixtures"[^>]*>\n/, ''), 'NO-MANIFEST-FIXTURES');

// negative: a raw hex color bypasses tokens.css
runCase('raw-hex', 'good', (html) => html.replace('var(--color-text)', '#ff0000'), 'RAW-HEX');

// negative: a raw px literal with no token in the same declaration
runCase('raw-px', 'good', (html) => html.replace('var(--space-2)', '16px'), 'RAW-PX');

// negative: the pages index exists but carries no link to this page
runCase('index-without-link', 'good', unchanged, 'NO-INDEX-LINK',
  { indexHtml: '<!doctype html><html><body><a href="other/other.html">other</a></body></html>\n' });

// negative: the pages index is missing entirely
runCase('index-missing', 'good', unchanged, 'NO-INDEX-LINK', { indexHtml: null });

// negative: the reserved slug "index" is rejected
runCase('reserved-slug', 'index', unchanged, 'RESERVED-SLUG');

runJsonCase('json-good', 'login', unchanged, null, { expectStdout: '1 proposal' });
runJsonCase('json-unknown-component', 'login', mutateJson((etalon) => { nodeOf(etalon, 'card').component = 'Cardd'; }), 'UNKNOWN-COMPONENT');
runJsonCase('json-unknown-prop', 'login', mutateJson((etalon) => { nodeOf(etalon, 'card').props.titel = 'Sign in'; }), 'UNKNOWN-PROP');
runJsonCase('json-missing-prop', 'login', mutateJson((etalon) => { delete nodeOf(etalon, 'form').props.email; }), 'MISSING-PROP');
runJsonCase('json-bad-enum', 'login', mutateJson((etalon) => { nodeOf(etalon, 'page').props.align = 'diagonal'; }), 'BAD-ENUM');
runJsonCase('json-function-prop-literal', 'login', mutateJson((etalon) => { nodeOf(etalon, 'form').props.onSubmit = 'noop'; }), FUNCTION_PROP_VALUE_LINE);
runJsonCase('json-function-prop-binding', 'login', mutateJson((etalon) => { nodeOf(etalon, 'form').props.onSubmit = '$data.greeting'; }), FUNCTION_PROP_VALUE_LINE);
runJsonCase('json-design-book', 'design-book', unchanged, null, { etalon: bookEtalon, expectStdout: '0 proposals' });
runJsonCase('json-raw-style-value', 'design-book', mutateJson((etalon) => { nodeOf(etalon, 'swatch-accent').props.fill = '#2f6fed'; }), RAW_STYLE_VALUE_LINE, { etalon: bookEtalon });
runJsonCase('json-style-data-binding', 'design-book', mutateJson((etalon) => { nodeOf(etalon, 'specimen').props.tone = '$data.labels.accent'; }), null, { etalon: bookEtalon, expectStdout: '0 proposals' });
runJsonCase('json-element-tag', 'login', withElement({ tag: 'select' }), null, { expectStdout: '1 proposal' });
runJsonCase('json-element-custom-tag', 'login', withElement({ tag: 'my-widget' }), null, { expectStdout: '1 proposal' });
runJsonCase('json-unknown-tag', 'login', withElement({ tag: 'slect' }), UNKNOWN_TAG_LINE);
runJsonCase('json-element-attributes', 'login', withElement({ tag: 'input', type: 'email', placeholder: 'you@example.com', 'data-node-kind': 'email' }), null, { expectStdout: '1 proposal' });
runJsonCase('json-unknown-attribute', 'login', withElement({ tag: 'input', palceholder: 'x' }), UNKNOWN_ATTRIBUTE_LINE);
runJsonCase('json-attribute-refused-styling', 'login', withElement({ tag: 'div', className: 'p-4' }), REFUSED_STYLING_LINE);
runJsonCase('json-attribute-refused-behaviour', 'login', withElement({ tag: 'button', onClick: 'submit' }), REFUSED_BEHAVIOUR_LINE);
runJsonCase('json-element-missing-tag', 'login', withElement({ text: 'no tag here' }), MISSING_TAG_LINE);
runJsonCase('json-registry-without-vocabulary', 'login', unchanged, NO_ELEMENT_VOCABULARY_LINE, { registry: registryWithoutVocabulary() });
runJsonCase('json-layout-props', 'login', mutateJson((etalon) => { Object.assign(nodeOf(etalon, 'page').props, { grow: true, alignInParent: 'end', scroll: true, maxWidth: '$token.space-4' }); }), null, { expectStdout: '1 proposal' });
runJsonCase('json-element-layout-props', 'login', withElement({ tag: 'div', grow: true, scroll: true, maxWidth: '$token.space-4' }), null, { expectStdout: '1 proposal' });
runJsonCase('json-element-gap-attribute', 'login', withElement({ tag: 'div', gap: '$token.space-2' }), ELEMENT_GAP_LINE);
runJsonCase('json-refused-tag', 'login', withElement({ tag: 'svg' }), REFUSED_TAG_LINE);
runJsonCase('json-raw-max-width', 'login', mutateJson((etalon) => { nodeOf(etalon, 'page').props.maxWidth = '48rem'; }), RAW_MAX_WIDTH_LINE);
runJsonCase('json-stale-source-hint', 'login', mutateJson((etalon) => { nodeOf(etalon, 'page').props.flex = true; }), STALE_SOURCE_HINT_LINE);
runJsonCase('json-unknown-token', 'login', mutateJson((etalon) => { nodeOf(etalon, 'title').props.tone = '$token.color-nope'; }), 'UNKNOWN-TOKEN');
runJsonCase('json-missing-fixture-path', 'login', mutateJson((etalon) => { delete etalon.data.minimal.greeting; }), 'MISSING-FIXTURE-PATH');
runJsonCase('json-unused-state', 'login', mutateJson((etalon) => { etalon.states.idle = { unbound: true }; }), 'UNUSED-STATE');
runJsonCase('json-duplicate-id', 'login', mutateJson((etalon) => { etalon.nodes.push({ id: 'title', component: 'Text', props: { text: 'again' } }); }), 'DUPLICATE-ID');
runJsonCase('json-orphan-node', 'login', mutateJson((etalon) => { etalon.nodes.push({ id: 'stray', component: 'Text', props: { text: 'stray' } }); }), 'ORPHAN-NODE');
runJsonCase('json-unknown-node', 'login', mutateJson((etalon) => { nodeOf(etalon, 'page').children.push('ghost'); }), 'UNKNOWN-NODE');
runJsonCase('json-multiple-parents', 'login', mutateJson((etalon) => { nodeOf(etalon, 'page').children.push('hint'); }), 'MULTIPLE-PARENTS');
runJsonCase('json-parent-after-child', 'login', mutateJson((etalon) => { const [page, title, ...rest] = etalon.nodes; etalon.nodes = [title, page, ...rest]; }), 'PARENT-AFTER-CHILD');
runJsonCase('json-proposal-without-note', 'login', mutateJson((etalon) => { delete nodeOf(etalon, 'help').note; }), 'PROPOSAL-WITHOUT-NOTE');
runJsonCase('json-slot-not-node', 'login', mutateJson((etalon) => {
  nodeOf(etalon, 'title').children = ['note-text'];
  etalon.nodes.push({ id: 'note-text', component: 'Text', props: { text: 'note' } });
}), 'SLOT-NOT-NODE');
runJsonCase('json-invalid-etalon', 'login', mutateJson((etalon) => { etalon.states.default = {}; }), 'INVALID-ETALON');
runJsonCase('json-slug-mismatch', 'login', mutateJson((etalon) => { etalon.slug = 'signin'; }), 'SLUG-MISMATCH');
runJsonCase('json-no-registry', 'login', unchanged, 'NO-REGISTRY', { registry: null });
runJsonCase('json-reserved-slug', 'index', unchanged, 'RESERVED-SLUG');
runJsonCase('json-index-without-link', 'login', unchanged, 'NO-INDEX-LINK',
  { indexHtml: '<!doctype html><html><body><a href="login/login.html">login</a></body></html>\n' });

if (failures.length > 0) {
  console.error('Design-checker check FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('Design-checker check passed: valid HTML and JSON page folders accepted; missing/flat link, manifest gaps, raw values, index gaps and the reserved slug rejected with named errors; every JSON code — the nineteen of the Melete validator plus INVALID-ETALON, SLUG-MISMATCH and NO-REGISTRY — rejected by name on a mutation of the shared example; the book example valid on both fixtures; an Element draws by its tag, its attributes are read from the registry vocabulary, and a registry without one is refused; the four child-layout props pass on the containers that carry them, a hand-drawn svg is refused by name, and the hint names both sources a missing prop can come from.');
