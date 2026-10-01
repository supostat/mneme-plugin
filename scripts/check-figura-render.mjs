#!/usr/bin/env node
//
// Gate for figura's diagram pipeline with the real theme and a launcher stub at the process boundary:
// extraction with the default and an overridden layout, the d2 arguments and the theme classes in
// front of every source, SVG insertion that keeps the caption, and D2-FAILED naming the diagram.

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractDiagrams } from '../figura/scripts/extract-diagrams.mjs';
import { inlineDiagrams } from '../figura/scripts/inline-diagrams.mjs';
import { renderDiagram } from '../figura/scripts/render-diagram.mjs';
import { d2Classes, loadTheme } from '../figura/scripts/theme.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIGURA_ROOT = join(REPO_ROOT, 'figura');
const FAKE_LAUNCHER = join(REPO_ROOT, 'scripts', 'fixtures', 'figura', 'fake-launcher.sh');
const D2_FONT_SLOTS = [
  ['--font-regular', 400, 'normal'],
  ['--font-italic', 400, 'italic'],
  ['--font-semibold', 600, 'normal'],
  ['--font-bold', 700, 'normal'],
];
const CODE_BLOCK = '<pre><code>{"not": "a diagram"}</code></pre>';
const FIRST_CAPTION = '<figcaption class="caption"><strong>First diagram.</strong> Elk &amp; the default layout.</figcaption>';
const SECOND_CAPTION = '<figcaption class="caption"><strong>Second diagram.</strong> Dagre by request.</figcaption>';
const FIXTURE_DOCUMENT = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Render fixture</title></head>
  <body>
    <h1>Render fixture</h1>
    ${CODE_BLOCK}
    <figure>
      <pre class="d2">
client -&gt; server: sends &amp; receives
</pre>
      ${FIRST_CAPTION}
    </figure>
    <figure>
      <pre class="d2 wide" data-layout="dagre">queue -> worker</pre>
      ${SECOND_CAPTION}
    </figure>
  </body>
</html>
`;
const failures = [];
const workDirectory = mkdtempSync(join(tmpdir(), 'figura-render-check-'));

function expectEqual(what, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(`${what} is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}

function failureOf(action) {
  try {
    action();
    return undefined;
  } catch (error) {
    return error;
  }
}

function expectFailure(caseName, error, expectedCode, expectedText) {
  if (error?.code !== expectedCode || !error.message.includes(expectedText)) {
    failures.push(`${caseName}: expected ${expectedCode} naming "${expectedText}", got: ${error?.message ?? 'no error'}`);
  }
}

function checkExtraction(diagrams) {
  expectEqual('the number of extracted diagrams', diagrams.length, 2);
  const [first, second] = diagrams;
  expectEqual('diagram 1', { ordinal: first?.ordinal, layout: first?.layout, source: first?.source, caption: first?.caption }, {
    ordinal: 1,
    layout: 'elk',
    source: 'client -> server: sends & receives\n',
    caption: 'First diagram. Elk & the default layout.',
  });
  expectEqual('diagram 2', { ordinal: second?.ordinal, layout: second?.layout, source: second?.source, caption: second?.caption }, {
    ordinal: 2,
    layout: 'dagre',
    source: 'queue -> worker',
    caption: 'Second diagram. Dagre by request.',
  });
  expectFailure(
    'unknown layout',
    failureOf(() => extractDiagrams('<figure><pre class="d2" data-layout="tala">a -> b</pre></figure>')),
    'D2-FAILED',
    'diagram 1: data-layout "tala" is neither elk nor dagre',
  );
}

function expectedFontArguments(theme) {
  return D2_FONT_SLOTS.flatMap(([flag, weight, style]) => {
    const face = theme.fonts.text.faces.find((candidate) => candidate.weight === weight && candidate.style === style);
    return [flag, join(FIGURA_ROOT, face.file)];
  });
}

function checkD2Invocation(theme, diagram, expectedLayout) {
  const stem = join(workDirectory, `diagram-${String(diagram.ordinal).padStart(2, '0')}`);
  const recordedArguments = readFileSync(`${stem}.svg.arguments`, 'utf8').trimEnd().split('\n');
  expectEqual(`diagram ${diagram.ordinal} d2 arguments`, recordedArguments, [
    '--layout',
    expectedLayout,
    '--pad',
    String(theme.diagram.padPixels),
    ...expectedFontArguments(theme),
    `${stem}.d2`,
    `${stem}.svg`,
  ]);
  const d2Source = readFileSync(`${stem}.d2`, 'utf8');
  if (!d2Source.startsWith(d2Classes(theme))) failures.push(`diagram ${diagram.ordinal}: the d2 source does not open with the theme classes block`);
  if (!d2Source.endsWith(diagram.source)) failures.push(`diagram ${diagram.ordinal}: the d2 source does not end with the diagram from the document`);
}

function checkInlining(renderedDiagrams) {
  const inlined = inlineDiagrams(FIXTURE_DOCUMENT, renderedDiagrams);
  if (/<pre\b[^>]*class="d2/.test(inlined)) failures.push('inlining left a pre.d2 in the document');
  if (inlined.includes('<?xml')) failures.push('inlining kept the XML declaration of an SVG');
  if (!inlined.includes(CODE_BLOCK)) failures.push('inlining touched a code block that is not a diagram');
  for (const [ordinal, caption] of [[1, FIRST_CAPTION], [2, SECOND_CAPTION]]) {
    const figureWithSvg = new RegExp(`<figure>\\s*<svg width="120" height="40"[\\s\\S]*?</svg>\\s*${caption.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*</figure>`);
    if (!figureWithSvg.test(inlined)) failures.push(`diagram ${ordinal}: its figure does not hold the sized SVG followed by the untouched caption`);
  }
}

const MASKED_LABEL_SVG = [
  '<svg viewBox="0 0 400 200"><rect x="0" y="0" width="400" height="200" fill="#FFFFFF" class=" fill-N7"></rect>',
  '<g><path d="M 10 50 L 390 50" stroke="#0D32B2" mask="url(#d2-1)" /><text x="200" y="56" class="text-italic" style="text-anchor:middle;font-size:16px">3. Create user</text></g>',
  '<g><path d="M 10 150 L 390 150" stroke="#0D32B2" mask="url(#d2-1)" /><text x="30" y="120" style="text-anchor:middle;font-size:16px">a label away from its line</text></g>',
  '<mask id="d2-1" maskUnits="userSpaceOnUse" x="0" y="0" width="400" height="200"><rect x="0" y="0" width="400" height="200" fill="white"></rect><rect x="143" y="40" width="114" height="20" fill="black"></rect></mask></svg>',
].join('');

function checkLabelBackgrounds() {
  const document = '<figure><pre class="d2">\na -> b: 3. Create user\n</pre></figure>';
  const span = { start: document.indexOf('<pre'), end: document.indexOf('</figure>') };
  const inlined = inlineDiagrams(document, [{ span, svg: MASKED_LABEL_SVG }]);
  const background = '<rect x="143" y="40" width="114" height="20" fill="#FFFFFF" /><text x="200" y="56"';
  if (!inlined.includes(background)) failures.push('inlining did not put an opaque background from the d2 label mask under an edge label, so viewers that ignore SVG masks strike the label through');
  if ((inlined.match(/fill="#FFFFFF" \/>/g) ?? []).length !== 1) failures.push('inlining put a label background where the mask cuts nothing out');
}

function checkVectorLabelClips() {
  const document = '<figure><pre class="d2">\na -> b: 3. Create user\n</pre></figure>';
  const span = { start: document.indexOf('<pre'), end: document.indexOf('</figure>') };
  const inlined = inlineDiagrams(document, [{ span, svg: MASKED_LABEL_SVG }]);
  const clip = '<clipPath id="d2-1" clipPathUnits="userSpaceOnUse"><path clip-rule="evenodd" d="M 0 0 h 400 v 200 h -400 Z M 143 40 h 114 v 20 h -114 Z"></path></clipPath>';
  if (/<mask\b|\bmask="/.test(inlined)) failures.push('inlining left an SVG mask in the diagram, which Chrome prints as a raster soft mask that viewers drop at some zoom levels, so edges vanish');
  if (!inlined.includes(clip)) failures.push('inlining did not turn the d2 label mask into an even-odd vector clip with the label cutout');
  if ((inlined.match(/clip-path="url\(#d2-1\)"/g) ?? []).length !== 2) failures.push('inlining did not move every masked edge onto the vector clip');
}

try {
  const theme = loadTheme();
  const diagrams = extractDiagrams(FIXTURE_DOCUMENT);
  checkExtraction(diagrams);
  const renderedDiagrams = diagrams.map((diagram) => ({
    ...diagram,
    svg: renderDiagram(diagram, theme, { workDirectory, launcherPath: FAKE_LAUNCHER }).svg,
  }));
  checkD2Invocation(theme, diagrams[0], 'elk');
  checkD2Invocation(theme, diagrams[1], 'dagre');
  checkInlining(renderedDiagrams);
  checkLabelBackgrounds();
  checkVectorLabelClips();
  expectFailure(
    'd2 rejects a diagram',
    failureOf(() =>
      renderDiagram({ ordinal: 3, source: 'ok -> fine\nBROKEN\n', layout: 'elk', caption: 'Broken diagram' }, theme, {
        workDirectory,
        launcherPath: FAKE_LAUNCHER,
      }),
    ),
    'D2-FAILED',
    'diagram 3 («Broken diagram»): line 2, column 1: unexpected text after map key',
  );
} catch (error) {
  failures.push(`the pipeline threw: ${error.stack ?? error.message}`);
} finally {
  rmSync(workDirectory, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error('figura render check FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(
  'figura render check passed: diagrams are extracted with their layout and caption, d2 gets the layout, padding and the four Inter files with the theme classes in front, SVGs replace the pre blocks at natural size with captions untouched and an opaque background under every masked edge label, label masks turned into vector clips, and a d2 error comes back as D2-FAILED on the author\'s line.',
);
