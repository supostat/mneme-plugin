#!/usr/bin/env node
//
// Gate for figura's check loop: the layout checks on measurements recorded from the real d2 and
// Chromium, where a clean diagram passes, each broken one fails with its own code, a message inside a
// sequence group passes, and a label inside the container its edge leads into fails in dagre and ELK
// alike; synthetic rules for edge frames, edges into containers, remedies that follow the layout,
// kind and direction of a diagram, the ordinal and highlights every problem carries, and print
// scales where the ERD diagrams of a document share the smallest of their own scales, a label
// floor broken by that shared scale names the diagram that set it, and the height is checked at
// the scale passed; and
// `figura check` on fixture documents through the real render and check modules, with a fake
// browser and a launcher stub at the process boundary.

import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { layoutLimits, layoutProblems, printScales } from '../figura/scripts/layout-checks.mjs';
import { loadTheme } from '../figura/scripts/theme.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIGURA_ROOT = join(REPO_ROOT, 'figura');
const FIXTURES = join(REPO_ROOT, 'scripts', 'fixtures', 'figura');
const FAKE_BROWSER = join(FIXTURES, 'fake-browser.mjs');
const FAKE_LAUNCHER = join(FIXTURES, 'fake-launcher.sh');
const INTO_CONTAINER = 'reads as a link within it';
const RECORDED_CASES = [
  { recording: 'clean', diagram: 'clean', layout: 'elk', codes: [] },
  { recording: 'label-overlap', diagram: 'label-overlap', layout: 'elk', codes: ['LABEL-OVERLAP', 'TEXT-OVERFLOW'] },
  { recording: 'text-overflow', diagram: 'text-overflow', layout: 'elk', codes: ['TEXT-OVERFLOW'] },
  { recording: 'too-wide', diagram: 'too-wide', layout: 'elk', codes: ['DIAGRAM-TOO-WIDE'] },
  { recording: 'too-tall', diagram: 'too-tall', layout: 'elk', codes: ['DIAGRAM-TOO-TALL'] },
  { recording: 'sequence-group', diagram: 'sequence-group', layout: 'elk', codes: [] },
  { recording: 'edge-into-container-dagre', diagram: 'edge-into-container', layout: 'dagre', codes: ['LABEL-OVERLAP'] },
  { recording: 'edge-into-container-elk', diagram: 'edge-into-container', layout: 'elk', codes: ['LABEL-OVERLAP'] },
  { recording: 'edge-between-containers-dagre', diagram: 'edge-between-containers', layout: 'dagre', codes: [] },
  { recording: 'edge-between-containers-elk', diagram: 'edge-between-containers', layout: 'elk', codes: [] },
];
const GRAPH = 'a -> b\n';
const failures = [];
const workDirectory = mkdtempSync(join(tmpdir(), 'figura-checks-check-'));

function recorded(name) {
  return JSON.parse(readFileSync(join(FIXTURES, 'measurements', `${name}.json`), 'utf8'));
}

function diagramSource(name) {
  return readFileSync(join(FIXTURES, 'diagrams', `${name}.d2`), 'utf8');
}

function problemsAlone(diagram, measurement, limits) {
  return layoutProblems(diagram, measurement, limits, printScales([diagram], [measurement], limits)[0]);
}

function codesOf(problems) {
  return [...new Set(problems.map((problem) => problem.code))].sort();
}

function expectCodes(caseName, problems, expectedCodes) {
  if (JSON.stringify(codesOf(problems)) !== JSON.stringify(expectedCodes)) {
    failures.push(`${caseName}: reported ${JSON.stringify(codesOf(problems))}, expected ${JSON.stringify(expectedCodes)}`);
  }
}

function expectProblemText(caseName, problems, code, expectedText) {
  if (!problems.some((problem) => problem.code === code && problem.message.includes(expectedText))) {
    failures.push(`${caseName}: no ${code} naming "${expectedText}" among ${JSON.stringify(problems.map((problem) => problem.message))}`);
  }
}

function expectRemedy(caseName, problems, code, { includes = [], excludes = [] }) {
  const problem = problems.find((candidate) => candidate.code === code);
  if (problem === undefined) {
    failures.push(`${caseName}: no ${code} among ${JSON.stringify(problems.map((candidate) => candidate.message))}`);
    return;
  }
  for (const expected of includes) if (!problem.remedy.includes(expected)) failures.push(`${caseName}: the remedy lacks ${JSON.stringify(expected)}: ${problem.remedy}`);
  for (const unexpected of excludes) if (problem.remedy.includes(unexpected)) failures.push(`${caseName}: the remedy offers ${JSON.stringify(unexpected)}: ${problem.remedy}`);
}

function recordedCase(name) {
  const recordedCase = RECORDED_CASES.find((candidate) => candidate.recording === name);
  return { diagram: { ordinal: 2, caption: name, layout: recordedCase.layout, source: diagramSource(recordedCase.diagram) }, measurement: recorded(name) };
}

function labelledMeasurement(widthPixels, heightPixels, fontPixels = 16) {
  return {
    widthPixels,
    heightPixels,
    objects: [
      { id: 'node', kind: 'shape', box: { x: 0, y: 0, width: 80, height: 40 }, pathBox: null, labels: [{ text: 'Node', box: { x: 20, y: 10, width: 40, height: 20 }, fontPixels }] },
    ],
  };
}

function checkRecordedCases(limits) {
  for (const { recording, layout, codes } of RECORDED_CASES) {
    const { diagram, measurement } = recordedCase(recording);
    expectCodes(`recorded ${recording} (${layout})`, problemsAlone(diagram, measurement, limits), codes);
  }
  const problemsOf = (name) => {
    const { diagram, measurement } = recordedCase(name);
    return problemsAlone(diagram, measurement, limits);
  };
  expectProblemText('recorded too-wide', problemsOf('too-wide'), 'DIAGRAM-TOO-WIDE', 'under the 7 pt floor — change direction to down (direction: down)');
  expectProblemText('recorded too-tall', problemsOf('too-tall'), 'DIAGRAM-TOO-TALL', 'a page leaves above its caption — change direction to right (direction: right)');
  expectProblemText(
    'recorded label-overlap',
    problemsOf('label-overlap'),
    'LABEL-OVERLAP',
    'diagram 2 («label-overlap»): label "A label much wider than its fixed cell" of cell crosses the shape next',
  );
  expectProblemText('recorded text-overflow', problemsOf('text-overflow'), 'TEXT-OVERFLOW', 'label "Label pinned inside a small box" spills out of pinned');
  for (const layout of ['dagre', 'elk']) {
    expectProblemText(
      `recorded edge-into-container (${layout})`,
      problemsOf(`edge-into-container-${layout}`),
      'LABEL-OVERLAP',
      `label "book directly" of (managers -> domain.holidays)[0] crosses the shape domain — the label sits inside the container its edge leads into and ${INTO_CONTAINER}`,
    );
  }
}

function groupedMessages() {
  return {
    widthPixels: 600,
    heightPixels: 400,
    objects: [
      { id: 'each', kind: 'shape', box: { x: 30, y: 100, width: 500, height: 200 }, pathBox: null, labels: [{ text: 'for each day', box: { x: 40, y: 104, width: 120, height: 18 }, fontPixels: 16 }] },
      { id: 'each.note', kind: 'shape', box: { x: 300, y: 230, width: 120, height: 40 }, pathBox: null, labels: [{ text: 'A note', box: { x: 320, y: 240, width: 60, height: 18 }, fontPixels: 16 }] },
      { id: '(job -> factory)[0]', kind: 'connection', box: null, pathBox: { x: 60, y: 160, width: 300, height: 0 }, labels: [{ text: '2. paid holiday', box: { x: 150, y: 140, width: 120, height: 18 }, fontPixels: 16 }] },
      { id: '(factory -> store)[0]', kind: 'connection', box: null, pathBox: { x: 60, y: 200, width: 300, height: 0 }, labels: [{ text: '3. insert', box: { x: 150, y: 150, width: 120, height: 18 }, fontPixels: 16 }] },
      { id: '(store -> job)[0]', kind: 'connection', box: null, pathBox: { x: 60, y: 260, width: 400, height: 0 }, labels: [{ text: '4. done', box: { x: 310, y: 245, width: 50, height: 18 }, fontPixels: 16 }] },
    ],
  };
}

function edgeIntoContainer(containerId, holidaysId) {
  return {
    widthPixels: 700,
    heightPixels: 300,
    objects: [
      { id: 'managers', kind: 'shape', box: { x: 10, y: 100, width: 120, height: 60 }, pathBox: null, labels: [] },
      { id: containerId, kind: 'shape', box: { x: 300, y: 50, width: 380, height: 200 }, pathBox: null, labels: [] },
      { id: holidaysId, kind: 'shape', box: { x: 550, y: 100, width: 110, height: 60 }, pathBox: null, labels: [] },
      { id: '(managers -> domain.holidays)[0]', kind: 'connection', box: null, pathBox: { x: 130, y: 120, width: 420, height: 10 }, labels: [{ text: 'book directly', box: { x: 310, y: 110, width: 100, height: 18 }, fontPixels: 16 }] },
    ],
  };
}

function checkFramesAndContainers(limits) {
  const sequenceDiagram = { ordinal: 1, layout: 'elk', source: diagramSource('sequence-group') };
  const grouped = problemsAlone(sequenceDiagram, groupedMessages(), limits);
  const messagesCrossingTheGroup = grouped.filter((problem) => problem.what.endsWith('crosses the shape each'));
  if (messagesCrossingTheGroup.length > 0) failures.push(`a message inside its group frame crossed the group: ${messagesCrossingTheGroup[0].message}`);
  expectProblemText('two message labels inside a group', grouped, 'LABEL-OVERLAP', 'label "2. paid holiday" of (job -> factory)[0] crosses label "3. insert"');
  expectProblemText('a message label over a note inside a group', grouped, 'LABEL-OVERLAP', 'label "4. done" of (store -> job)[0] crosses the shape each.note');
  expectRemedy('a sequence overlap', grouped, 'LABEL-OVERLAP', { includes: ['shorten the message or note label'], excludes: ['data-layout', 'direction'] });

  const intoDagre = problemsAlone({ ordinal: 1, layout: 'dagre', source: GRAPH }, edgeIntoContainer('domain', 'domain.holidays'), limits);
  expectRemedy('an edge into its container in dagre', intoDagre, 'LABEL-OVERLAP', { includes: [INTO_CONTAINER], excludes: ['data-layout', 'ELK'] });
  const intoElk = problemsAlone({ ordinal: 1, layout: 'elk', source: GRAPH }, edgeIntoContainer('domain', 'domain.holidays'), limits);
  expectRemedy('an edge into its container in ELK', intoElk, 'LABEL-OVERLAP', { includes: [INTO_CONTAINER], excludes: ['data-layout', 'ELK'] });
  const foreign = problemsAlone({ ordinal: 1, layout: 'elk', source: GRAPH }, edgeIntoContainer('zone', 'domain.holidays'), limits);
  expectRemedy('a label over a container of neither end', foreign, 'LABEL-OVERLAP', { includes: ['shorten or move the label', 'try data-layout="dagre"'], excludes: [INTO_CONTAINER] });
}

function checkRemediesByTraits(limits) {
  const wide = labelledMeasurement(1320, 100);
  const tall = labelledMeasurement(600, 947);
  const sequence = { ordinal: 1, layout: 'elk', source: 'shape: sequence_diagram\na -> b: hello\n' };
  expectRemedy('a sequence too wide', problemsAlone(sequence, wide, limits), 'DIAGRAM-TOO-WIDE', { includes: ['five participants'], excludes: ['direction', 'data-layout'] });
  expectRemedy('a sequence too tall', problemsAlone(sequence, tall, limits), 'DIAGRAM-TOO-TALL', { includes: ['split the sequence'], excludes: ['direction', 'data-layout'] });
  const erdInElk = { ordinal: 1, layout: 'elk', source: 'accounts: {\n  shape: sql_table\n  id: uuid\n}\n' };
  expectRemedy('an ERD too wide in ELK', problemsAlone(erdInElk, wide, limits), 'DIAGRAM-TOO-WIDE', { includes: ['data-layout="dagre"', 'figura erd'] });
  const erdInDagre = { ...erdInElk, layout: 'dagre' };
  expectRemedy('an ERD too wide in dagre', problemsAlone(erdInDagre, wide, limits), 'DIAGRAM-TOO-WIDE', { includes: ['split the diagram'], excludes: ['data-layout'] });
  const dagreGraph = { ordinal: 1, layout: 'dagre', source: GRAPH };
  expectRemedy('a dagre graph too wide', problemsAlone(dagreGraph, wide, limits), 'DIAGRAM-TOO-WIDE', { includes: ['try ELK'], excludes: ['try data-layout="dagre"', 'direction: down'] });
  const downGraph = { ordinal: 1, layout: 'elk', source: `direction: down\n${GRAPH}` };
  expectRemedy('a graph already down too wide', problemsAlone(downGraph, wide, limits), 'DIAGRAM-TOO-WIDE', { includes: ['try data-layout="dagre"'], excludes: ['direction: down'] });
  expectRemedy('a graph going down too tall', problemsAlone(downGraph, tall, limits), 'DIAGRAM-TOO-TALL', { includes: ['direction: right', 'regroup a long chain into layers'] });
  const rightGraph = { ordinal: 1, layout: 'elk', source: `direction: right\n${GRAPH}` };
  expectRemedy('a graph already right too tall', problemsAlone(rightGraph, tall, limits), 'DIAGRAM-TOO-TALL', { excludes: ['direction: right'] });
  expectRemedy('a graph going right too wide', problemsAlone(rightGraph, wide, limits), 'DIAGRAM-TOO-WIDE', { includes: ['direction: down'] });
}

function checkHighlights(limits) {
  const measurement = edgeIntoContainer('domain', 'domain.holidays');
  const [overlap] = problemsAlone({ ordinal: 4, layout: 'dagre', source: GRAPH }, measurement, limits);
  const label = measurement.objects[3].labels[0].box;
  const container = measurement.objects[1].box;
  if (overlap?.diagramOrdinal !== 4 || JSON.stringify(overlap?.highlights) !== JSON.stringify([label, container])) {
    failures.push(`a label overlap did not carry its diagram and the boxes in conflict: ${JSON.stringify({ ordinal: overlap?.diagramOrdinal, highlights: overlap?.highlights })}`);
  }
  const [tooWide] = problemsAlone({ ordinal: 5, layout: 'elk', source: GRAPH }, labelledMeasurement(1320, 100), limits);
  if (tooWide?.diagramOrdinal !== 5 || JSON.stringify(tooWide?.highlights) !== '[]') {
    failures.push(`a size problem did not carry its diagram and an empty highlight list: ${JSON.stringify({ ordinal: tooWide?.diagramOrdinal, highlights: tooWide?.highlights })}`);
  }
}

function checkSyntheticRules(limits) {
  const nested = {
    widthPixels: 300,
    heightPixels: 200,
    objects: [
      { id: 'realm', kind: 'shape', box: { x: 10, y: 30, width: 280, height: 160 }, pathBox: null, labels: [{ text: 'Realm', box: { x: 120, y: 5, width: 60, height: 20 }, fontPixels: 16 }] },
      { id: 'realm.core', kind: 'shape', box: { x: 40, y: 60, width: 120, height: 60 }, pathBox: null, labels: [{ text: 'Core', box: { x: 80, y: 80, width: 40, height: 20 }, fontPixels: 16 }] },
      {
        id: 'realm.(core -> api)[0]',
        kind: 'connection',
        box: null,
        pathBox: { x: 160, y: 90, width: 100, height: 0 },
        labels: [{ text: 'calls', box: { x: 170, y: 85, width: 30, height: 14 }, fontPixels: 16 }],
      },
    ],
  };
  const diagram = { ordinal: 1, layout: 'elk', source: GRAPH };
  expectCodes('labels inside an ancestor container and a container label above its box', problemsAlone(diagram, nested, limits), []);
  expectCodes('a 1000 px wide diagram keeps its labels at 7.9 pt', problemsAlone(diagram, labelledMeasurement(1000, 100), limits), []);
  expectCodes('a 1320 px wide diagram drops its labels to 6 pt', problemsAlone(diagram, labelledMeasurement(1320, 100), limits), ['DIAGRAM-TOO-WIDE']);
  expectCodes('a 946 px tall diagram fits above its caption', problemsAlone(diagram, labelledMeasurement(600, 946), limits), []);
  expectCodes('a 947 px tall diagram does not', problemsAlone(diagram, labelledMeasurement(600, 947), limits), ['DIAGRAM-TOO-TALL']);
}

function checkPrintScales(limits) {
  const erd = (ordinal) => ({ ordinal, layout: 'dagre', source: 'accounts: {\n  shape: sql_table\n  id: uuid\n}\n' });
  const narrowErd = erd(1);
  const graph = { ordinal: 2, layout: 'elk', source: GRAPH };
  const wideErd = erd(3);
  const narrow = labelledMeasurement(300, 100);
  const scales = printScales([narrowErd, graph, wideErd], [narrow, labelledMeasurement(800, 100), labelledMeasurement(1000, 100)], limits);
  const rounded = scales.map(({ factor, setBy }) => ({ factor: Math.round(factor * 1000) / 1000, setBy }));
  const expected = [
    { factor: 0.66, setBy: 3 },
    { factor: 0.825, setBy: 2 },
    { factor: 0.66, setBy: 3 },
  ];
  if (JSON.stringify(rounded) !== JSON.stringify(expected)) {
    failures.push(`two ERD diagrams and a graph got print scales ${JSON.stringify(rounded)}, expected both ERD diagrams at the smaller ERD scale and the graph at its own: ${JSON.stringify(expected)}`);
  }
  const [alone] = printScales([narrowErd], [narrow], limits);
  if (alone.factor !== 1 || alone.setBy !== 1) failures.push(`an ERD alone in its document got the print scale ${JSON.stringify(alone)}, expected its own 1`);

  const smallLabels = labelledMeasurement(300, 100, 12);
  const [sharedScale, , setterScale] = printScales([narrowErd, graph, wideErd], [smallLabels, labelledMeasurement(800, 100), labelledMeasurement(1000, 100)], limits);
  const pulledDown = layoutProblems(narrowErd, smallLabels, limits, sharedScale);
  expectProblemText('an ERD with small labels at the shared scale', pulledDown, 'DIAGRAM-TOO-WIDE', 'scaled to 66%, the scale the ERD diagrams of this document share (set by diagram 3), its smallest label prints at 5.9 pt');
  expectRemedy('an ERD with small labels at the shared scale', pulledDown, 'DIAGRAM-TOO-WIDE', { includes: ['print at one scale', 'split diagram 3 into narrower parts'], excludes: ['data-layout'] });
  expectCodes('the same ERD at its own scale', problemsAlone(narrowErd, smallLabels, limits), []);
  expectCodes('the ERD that sets the shared scale', layoutProblems(wideErd, labelledMeasurement(1000, 100), limits, setterScale), []);

  const tall = labelledMeasurement(600, 947);
  expectCodes('a 947 px tall diagram at its own scale', problemsAlone(graph, tall, limits), ['DIAGRAM-TOO-TALL']);
  expectCodes('the same diagram at a 90% print scale', layoutProblems(graph, tall, limits, { factor: 0.9, setBy: 2 }), []);
}

function prepareBundleWithLauncherStub() {
  const bundle = join(workDirectory, 'figura');
  cpSync(FIGURA_ROOT, bundle, { recursive: true });
  copyFileSync(FAKE_LAUNCHER, join(bundle, 'bin', 'launch.sh'));
  chmodSync(join(bundle, 'bin', 'launch.sh'), 0o755);
  return bundle;
}

function writeDocument(name, diagramSources) {
  const figures = diagramSources
    .map(
      (source, index) =>
        `    <figure>\n      <pre class="d2">\n${source}</pre>\n      <figcaption class="caption"><strong>Figure ${index + 1}.</strong> A fixture diagram.</figcaption>\n    </figure>`,
    )
    .join('\n');
  const documentPath = join(workDirectory, `${name}.html`);
  writeFileSync(
    documentPath,
    `<!doctype html>\n<html lang="en">\n  <head><meta charset="utf-8" /><title>Check fixture</title></head>\n  <body>\n    <h1>Check fixture</h1>\n${figures}\n  </body>\n</html>\n`,
  );
  return documentPath;
}

function runCheck(bundle, documentPath, recordedByFile) {
  const measurementsPath = join(workDirectory, `${Object.keys(recordedByFile).length}-measurements-${Date.now()}.json`);
  writeFileSync(measurementsPath, JSON.stringify(recordedByFile));
  const home = join(workDirectory, 'home');
  mkdirSync(home, { recursive: true });
  const commandArguments = documentPath === undefined ? ['check'] : ['check', documentPath];
  return spawnSync('/bin/sh', [join(bundle, 'bin', 'figura'), ...commandArguments], {
    env: { ...process.env, HOME: home, FIGURA_CHROME: FAKE_BROWSER, FIGURA_FAKE_MEASUREMENTS: measurementsPath },
    encoding: 'utf8',
  });
}

function checkCommandLine() {
  const bundle = prepareBundleWithLauncherStub();

  const failingDocument = writeDocument('clean-and-too-wide', [diagramSource('clean'), diagramSource('too-wide')]);
  const failing = runCheck(bundle, failingDocument, { 'diagram-01.svg': recorded('clean'), 'diagram-02.svg': recorded('too-wide') });
  if (failing.status !== 1) failures.push(`check of a too wide diagram exited ${failing.status}, expected 1: ${failing.stderr.trim()}`);
  if (!failing.stderr.includes(`figura: ${failingDocument} FAILED:`)) failures.push(`check did not open its report with the failure line: ${failing.stderr.trim()}`);
  if (!failing.stderr.includes('  - DIAGRAM-TOO-WIDE: diagram 2 («Figure 2. A fixture diagram.»)')) {
    failures.push(`check did not report diagram 2 as DIAGRAM-TOO-WIDE: ${failing.stderr.trim()}`);
  }
  if (failing.stderr.includes('diagram 1 (')) failures.push(`check blamed the clean diagram 1: ${failing.stderr.trim()}`);

  const brokenDocument = writeDocument('clean-and-broken', [diagramSource('clean'), 'a -> b\nBROKEN\n']);
  const broken = runCheck(bundle, brokenDocument, { 'diagram-01.svg': recorded('clean') });
  if (broken.status !== 1 || !broken.stderr.includes('  - D2-FAILED: diagram 2 («Figure 2. A fixture diagram.»): line 2, column 1')) {
    failures.push(`check did not collect the d2 error of diagram 2 into its report (exit ${broken.status}): ${broken.stderr.trim()}`);
  }

  const cleanDocument = writeDocument('clean', [diagramSource('clean')]);
  const clean = runCheck(bundle, cleanDocument, { 'diagram-01.svg': recorded('clean') });
  const expectedSuccess = `figura: ${cleanDocument} passed the check — 1 diagram fits the column and the page\n`;
  if (clean.status !== 0 || clean.stdout !== expectedSuccess) {
    failures.push(`check of a clean document exited ${clean.status} with ${JSON.stringify(clean.stdout)}, expected the single success line: ${clean.stderr.trim()}`);
  }

  const usage = runCheck(bundle, undefined, {});
  if (usage.status !== 2 || !usage.stderr.startsWith('usage: figura <command>')) {
    failures.push(`check without a document exited ${usage.status} with ${JSON.stringify(usage.stderr)}, expected usage and 2`);
  }
}

try {
  const limits = layoutLimits(loadTheme());
  checkRecordedCases(limits);
  checkSyntheticRules(limits);
  checkFramesAndContainers(limits);
  checkRemediesByTraits(limits);
  checkHighlights(limits);
  checkPrintScales(limits);
  checkCommandLine();
} catch (error) {
  failures.push(`the check loop threw: ${error.stack ?? error.message}`);
} finally {
  rmSync(workDirectory, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error('figura checks check FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(
  'figura checks check passed: the recorded clean diagram and a message inside a sequence group pass, the overlap, overflow, too wide and too tall ones fail with their own codes, a label inside the container its edge leads into fails in dagre and ELK with its own remedy, remedies follow the layout, kind and direction of a diagram, every problem carries its diagram and the boxes in conflict, the scale and height limits hold at their edges, the ERD diagrams of a document print at one scale whose floor names the diagram that set it, and figura check reports through the real modules with a fake browser and a launcher stub.',
);
