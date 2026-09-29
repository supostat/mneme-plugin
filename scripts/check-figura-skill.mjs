#!/usr/bin/env node
//
// Gate for the figura skill and its references: SKILL.md keeps model invocation on, names its
// triggers, reaches the bundle only through ${CLAUDE_PLUGIN_ROOT} and calls only entries the bundle
// holds; every reference file it names exists; figura/reference/ holds an example of each of the
// six diagram types; demo.html uses every block and fixed class of the source format, carries each
// example as it is in a pre.d2 and has a section in Russian. Every rule also runs on a broken copy
// and must name what is wrong.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractDiagrams } from '../figura/scripts/extract-diagrams.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE_ROOT = join(REPO_ROOT, 'figura');
const SKILL_PATH = join(BUNDLE_ROOT, 'skills', 'document', 'SKILL.md');
const REFERENCE_DIRECTORY = join(BUNDLE_ROOT, 'reference');
const DEMO_PATH = join(REFERENCE_DIRECTORY, 'demo.html');
const REQUIRED_TOOLS = ['Read', 'Write', 'Edit', 'Bash'];
const TRIGGERS = ['PDF', 'document', 'flowchart', 'sequence', 'ERD'];
const PLUGIN_ROOT_ENTRY = /\$\{CLAUDE_PLUGIN_ROOT\}\/([\w./-]*[\w-])/g;
const UNBRACED_PLUGIN_ROOT = /\$CLAUDE_PLUGIN_ROOT\b/;
const REFERENCE_FILE = /reference\/([\w.-]*\w)/g;
const FIXED_CLASSES = ['callout', 'warning', 'note', 'decision', 'caption', 'd2'];
const BLOCK_TAGS = ['h1', 'h2', 'h3', 'p', 'ul', 'ol', 'strong', 'code', 'pre', 'table', 'thead', 'figure', 'figcaption'];
const CYRILLIC_HEADING = /<h[1-3][^>]*>[^<]*[А-Яа-яЁё]/;
const CONTAINER_OPENING = /^\w[\w-]*: [^{\n]*\{$/gm;
const CONNECTION = /^([\w.]+) -> ([\w.]+)/gm;
const failures = [];

function connections(source) {
  return [...source.matchAll(CONNECTION)].map(([, from, to]) => `${from}>${to}`);
}

const DIAGRAM_TYPES = new Map([
  ['architecture.d2', { what: 'a container with solid and dashed connections', isOfType: (source) => source.match(CONTAINER_OPENING)?.length >= 1 && source.includes('style.stroke-dash') }],
  ['sequence.d2', { what: 'a sequence diagram with numbered messages', isOfType: (source) => source.includes('shape: sequence_diagram') && /: "1\. /.test(source) }],
  ['mapping.d2', { what: 'columns as containers', isOfType: (source) => source.match(CONTAINER_OPENING)?.length >= 2 }],
  ['erd.d2', { what: 'sql_table shapes with crow\'s foot ends', isOfType: (source) => source.includes('shape: sql_table') && source.includes('cf-many') }],
  ['flowchart.d2', { what: 'a left-to-right flow without containers', isOfType: (source) => source.includes('direction: right') && source.match(CONTAINER_OPENING) === null }],
  [
    'state.d2',
    {
      what: 'states with a transition back',
      isOfType: (source) => {
        const edges = new Set(connections(source));
        return [...edges].some((edge) => edges.has(edge.split('>').reverse().join('>')));
      },
    },
  ],
]);

function frontmatterOf(skillText) {
  return /^---\n([\s\S]*?)\n---\n/.exec(skillText)?.[1];
}

function skillProblems(skillText, bundleRoot) {
  const frontmatter = frontmatterOf(skillText);
  if (frontmatter === undefined) return ['SKILL.md opens with no --- frontmatter'];
  const problems = [];
  if (/^disable-model-invocation:/m.test(frontmatter)) problems.push('the frontmatter sets disable-model-invocation, so the skill cannot trigger on its own');
  if (!/^name: document$/m.test(frontmatter)) problems.push('the frontmatter name is not "document"');
  const tools = /^allowed-tools: \[(.*)\]$/m.exec(frontmatter)?.[1].split(',').map((tool) => tool.trim()) ?? [];
  for (const tool of REQUIRED_TOOLS.filter((required) => !tools.includes(required))) problems.push(`allowed-tools lacks ${tool}`);
  const description = /^description: (.*)$/m.exec(frontmatter)?.[1] ?? '';
  for (const trigger of TRIGGERS.filter((candidate) => !new RegExp(`\\b${candidate}`, 'i').test(description))) {
    problems.push(`the description does not name the trigger "${trigger}"`);
  }
  if (UNBRACED_PLUGIN_ROOT.test(skillText)) {
    problems.push('the skill writes $CLAUDE_PLUGIN_ROOT without braces — Claude Code substitutes ${CLAUDE_PLUGIN_ROOT} when the skill loads, and the Bash environment does not carry the variable');
  }
  for (const [, entry] of skillText.matchAll(PLUGIN_ROOT_ENTRY)) {
    if (!existsSync(join(bundleRoot, entry))) problems.push(`the skill calls \${CLAUDE_PLUGIN_ROOT}/${entry}, which the bundle does not hold`);
  }
  for (const [, file] of skillText.matchAll(REFERENCE_FILE)) {
    if (!existsSync(join(bundleRoot, 'reference', file))) problems.push(`the skill names reference/${file}, which does not exist`);
  }
  return [...new Set(problems)];
}

function referenceProblems(examples) {
  return [...DIAGRAM_TYPES].flatMap(([file, { what, isOfType }]) => {
    if (!examples.has(file)) return [`reference/${file} is missing`];
    return isOfType(examples.get(file)) ? [] : [`reference/${file} is not ${what}`];
  });
}

function demoProblems(demoHtml, examples) {
  const problems = [];
  const classTokens = new Set([...demoHtml.matchAll(/class="([^"]*)"/g)].flatMap(([, classes]) => classes.split(/\s+/)));
  for (const fixedClass of FIXED_CLASSES.filter((candidate) => !classTokens.has(candidate))) problems.push(`demo.html never uses the class "${fixedClass}"`);
  for (const tag of BLOCK_TAGS.filter((candidate) => !new RegExp(`<${candidate}\\b`).test(demoHtml))) problems.push(`demo.html has no <${tag}> block`);
  const diagramSources = extractDiagrams(demoHtml).map((diagram) => diagram.source.trim());
  for (const [file, source] of examples) {
    if (!diagramSources.includes(source.trim())) problems.push(`demo.html carries no pre.d2 with reference/${file} as it is`);
  }
  if (!CYRILLIC_HEADING.test(demoHtml)) problems.push('demo.html has no section headed in Russian');
  return problems;
}

function readExamples() {
  return new Map([...DIAGRAM_TYPES.keys()].filter((file) => existsSync(join(REFERENCE_DIRECTORY, file))).map((file) => [file, readFileSync(join(REFERENCE_DIRECTORY, file), 'utf8')]));
}

function expectNone(what, problems) {
  for (const problem of problems) failures.push(`${what}: ${problem}`);
}

function expectNamed(caseName, problems, expectedText) {
  if (!problems.some((problem) => problem.includes(expectedText))) failures.push(`${caseName} was not named: expected "${expectedText}" among ${JSON.stringify(problems)}`);
}

function replacedOnce(text, from, to) {
  if (text.split(from).length !== 2) throw new Error(`the broken copy needs exactly one ${JSON.stringify(from)}`);
  return text.replace(from, to);
}

function checkSkill(skillText) {
  expectNone('SKILL.md', skillProblems(skillText, BUNDLE_ROOT));
  const invocationOff = replacedOnce(skillText, 'allowed-tools:', 'disable-model-invocation: true\nallowed-tools:');
  expectNamed('a skill that turns model invocation off', skillProblems(invocationOff, BUNDLE_ROOT), 'disable-model-invocation');
  const missingEntry = replacedOnce(skillText, '/bin/figura build docs', '/bin/figura-missing build docs');
  expectNamed('a skill that calls a missing entry', skillProblems(missingEntry, BUNDLE_ROOT), '${CLAUDE_PLUGIN_ROOT}/bin/figura-missing, which the bundle does not hold');
  const missingReference = replacedOnce(skillText, 'reference/state.d2', 'reference/timeline.d2');
  expectNamed('a skill that names a missing reference', skillProblems(missingReference, BUNDLE_ROOT), 'reference/timeline.d2, which does not exist');
  const unbraced = replacedOnce(skillText, '${CLAUDE_PLUGIN_ROOT}/bin/figura build', '$CLAUDE_PLUGIN_ROOT/bin/figura build');
  expectNamed('a skill with an unbraced plugin root', skillProblems(unbraced, BUNDLE_ROOT), 'without braces');
  const vagueDescription = skillText.replace(/^description: .*$/m, 'description: Builds technical A4 PDF documents.');
  expectNamed('a description without the ERD trigger', skillProblems(vagueDescription, BUNDLE_ROOT), 'the trigger "ERD"');
}

function checkReference(examples) {
  expectNone('figura/reference', referenceProblems(examples));
  const withoutState = new Map([...examples].filter(([file]) => file !== 'state.d2'));
  expectNamed('a reference without a state example', referenceProblems(withoutState), 'reference/state.d2 is missing');
  const flatSequence = new Map(examples).set('sequence.d2', examples.get('sequence.d2').replace('shape: sequence_diagram', 'direction: right'));
  expectNamed('a sequence example that is not a sequence diagram', referenceProblems(flatSequence), 'reference/sequence.d2 is not a sequence diagram');
}

function checkDemo(demoHtml, examples) {
  expectNone('demo.html', demoProblems(demoHtml, examples));
  const withoutDecision = replacedOnce(demoHtml, 'class="callout decision"', 'class="callout"');
  expectNamed('a demo without a decision callout', demoProblems(withoutDecision, examples), 'the class "decision"');
  const staleErd = replacedOnce(demoHtml, '"display_name": "text"', '"display_name": "varchar"');
  expectNamed('a demo whose ERD drifted from the reference', demoProblems(staleErd, examples), 'reference/erd.d2 as it is');
  const englishOnly = demoHtml.replace(/<h2 lang="ru">[^<]*<\/h2>/, '<h2>Summary</h2>');
  expectNamed('a demo without a section in Russian', demoProblems(englishOnly, examples), 'no section headed in Russian');
}

try {
  const examples = readExamples();
  checkSkill(readFileSync(SKILL_PATH, 'utf8'));
  checkReference(examples);
  checkDemo(readFileSync(DEMO_PATH, 'utf8'), examples);
} catch (error) {
  failures.push(`the skill check threw: ${error.stack ?? error.message}`);
}

if (failures.length > 0) {
  console.error('figura skill check FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(
  'figura skill check passed: SKILL.md triggers on its own, reaches the bundle through ${CLAUDE_PLUGIN_ROOT} and names only existing entries and references, figura/reference/ holds all six diagram types, and demo.html uses every block and fixed class, carries each example as it is and has a section in Russian.',
);
