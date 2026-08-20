#!/usr/bin/env node
//
// design-lint.mjs — the third machine layer of the design discipline: an ADVISORY drift
// watcher for the design/ tree between fixations. Layer 1 is the skill's fixation
// checklist, layer 2 is check-design-etalon.mjs (the blocking fixation gate), this lint
// is layer 3 — it never blocks and never gates.
//
// Modes:
//   node design-lint.mjs <file>     — lint one file; named findings on stderr, exit 1 on any
//   node design-lint.mjs --all      — lint every design/ file under cwd; also reports
//                                     STALE-INTENTIONAL entries (advisory, never affects exit)
//   node design-lint.mjs --hook     — Claude Code hook mode: reads the event JSON from stdin
//                                     (PostToolUse → lint tool_input.file_path; Stop → sweep
//                                     design/ under cwd); ALWAYS exits 0; findings go to stdout
//                                     as {"hookSpecificOutput":{"hookEventName","additionalContext"}}
//
// Boundaries: only files inside design/ are ever checked — anything else is a silent exit 0,
// and a project without design/ is an instant no-op (the hook is installed for every mneme
// user). Skipped: names containing -draft-, design/dist/**, design/system/fonts.css.
// Fail-open: unreadable stdin, unknown events, missing fields — silent exit 0; an advisor
// has no right to break someone's session.
//
// Truth: the PROJECT's design/system/tokens.css (colors and the font-size scale from custom
// properties) and design/system/fonts.css (@font-face families) + generic fallbacks.
// Intentional exceptions: design/system/lint-intentional.json — [{value, reason, files?}] —
// curated ONLY on the user's explicit word (the design skill's rule).
//
// The raw-value heuristics come from design-rules.mjs — the SAME module the fixation checker
// uses, so the two layers cannot disagree by construction.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import { collectStyleContexts, scanRawValues, parseTokens, parseFontFaces, GENERIC_FAMILIES, findDuplicateTokens } from './design-rules.mjs';

const EM_DASH_LIMIT = 2;

function lineOf(content, needle) {
  const index = needle === undefined ? -1 : content.indexOf(needle);
  if (index === -1) return 1;
  return content.slice(0, index).split('\n').length;
}

// Locate the design root a file belongs to: the path segment named "design".
function designRootOf(filePath) {
  const absolute = resolve(filePath);
  const parts = absolute.split(sep);
  const index = parts.lastIndexOf('design');
  if (index === -1) return null;
  return parts.slice(0, index + 1).join(sep);
}

function isSkipped(filePath) {
  const name = basename(filePath);
  if (name.includes('-draft-')) return true;
  if (name === 'fonts.css') return true;
  const root = designRootOf(filePath);
  if (root !== null && resolve(filePath).startsWith(join(root, 'dist') + sep)) return true;
  return false;
}

function loadTruth(designRoot) {
  const readIfExists = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : '');
  const tokensCss = readIfExists(join(designRoot, 'system', 'tokens.css'));
  const fontsCss = readIfExists(join(designRoot, 'system', 'fonts.css'));
  const intentionalPath = join(designRoot, 'system', 'lint-intentional.json');
  let intentional = [];
  if (existsSync(intentionalPath)) {
    try {
      const parsed = JSON.parse(readFileSync(intentionalPath, 'utf8'));
      if (Array.isArray(parsed)) intentional = parsed.filter((entry) => typeof entry?.value === 'string');
    } catch {
      // A broken exceptions file never breaks the advisor; findings simply stay unsuppressed.
    }
  }
  const tokens = parseTokens(tokensCss);
  return { tokens, families: parseFontFaces(fontsCss), intentional };
}

function isIntentional(truth, filePath, flagged) {
  return truth.intentional.some((entry) => {
    if (!flagged.includes(entry.value)) return false;
    if (Array.isArray(entry.files) && entry.files.length > 0) {
      return entry.files.some((fragment) => filePath.includes(fragment));
    }
    return true;
  });
}

function familyCandidates(declaration) {
  const value = declaration.split(':').slice(1).join(':');
  return value.split(',').map((part) => part.replace(/["']/g, '').trim().toLowerCase())
    .filter((part) => part.length > 0 && !part.startsWith('var('));
}

function lintHtml(filePath, content, truth, findings) {
  for (const finding of scanRawValues(collectStyleContexts(content))) {
    if (isIntentional(truth, filePath, finding.declaration)) continue;
    const explanation = finding.name === 'RAW-HEX'
      ? 'raw hex color in a style context — colors come from tokens.css via var(--…)'
      : 'raw px literal with no var(--…) in the declaration — sizes come from tokens.css';
    findings.push(`${finding.name} ${filePath}:${lineOf(content, finding.declaration)} («${finding.declaration}») — ${explanation}`);
  }
  for (const context of collectStyleContexts(content)) {
    for (const declaration of context.split(/[;{}\n]/)) {
      if (!/font(-family)?\s*:/.test(declaration)) continue;
      for (const family of familyCandidates(declaration)) {
        if (GENERIC_FAMILIES.has(family) || truth.families.has(family)) continue;
        if (isIntentional(truth, filePath, family)) continue;
        findings.push(`SECOND-FAMILY ${filePath}:${lineOf(content, declaration.trim())} — font family "${family}" is outside the system (fonts.css @font-face + generic fallbacks); one system, one voice`);
      }
    }
  }
  const visible = content
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<[^>]*>/g, '');
  const emDashes = (visible.match(/—/g) || []).length;
  if (emDashes > EM_DASH_LIMIT) {
    findings.push(`EM-DASH-OVERUSE ${filePath}:1 — ${emDashes} em dashes in visible text (limit ${EM_DASH_LIMIT} per file); vary the punctuation`);
  }
}

function lintAppCss(filePath, content, truth, findings) {
  for (const declaration of content.split(/[;{}\n]/)) {
    for (const color of declaration.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g)) {
      const normalized = color[0].replace(/\s+/g, '').toLowerCase();
      if (truth.tokens.colors.has(normalized)) continue;
      if (isIntentional(truth, filePath, color[0]) || isIntentional(truth, filePath, normalized)) continue;
      findings.push(`FOREIGN-COLOR ${filePath}:${lineOf(content, color[0])} — ${color[0]} is neither in the tokens.css palette nor in lint-intentional.json; a fidelity skin may only use system colors or deliberate exceptions`);
    }
    const fontSize = declaration.match(/font-size\s*:\s*([^;{}\n]+)/);
    if (fontSize !== null && !fontSize[1].includes('var(--')) {
      const value = fontSize[1].trim().toLowerCase();
      if (!truth.tokens.fontSizes.has(value) && !isIntentional(truth, filePath, value)) {
        findings.push(`FOREIGN-FONT-SIZE ${filePath}:${lineOf(content, fontSize[0])} — ${value} is outside the tokens.css scale and not an intentional exception`);
      }
    }
    if (/font(-family)?\s*:/.test(declaration)) {
      for (const family of familyCandidates(declaration)) {
        if (GENERIC_FAMILIES.has(family) || truth.families.has(family)) continue;
        if (isIntentional(truth, filePath, family)) continue;
        findings.push(`FOREIGN-FONT-FAMILY ${filePath}:${lineOf(content, declaration.trim())} — font family "${family}" is neither declared in fonts.css nor an intentional exception`);
      }
    }
  }
}

function lintFile(filePath, truth, findings) {
  if (isSkipped(filePath) || !existsSync(filePath)) return;
  const content = readFileSync(filePath, 'utf8');
  const name = basename(filePath);
  if (name === 'tokens.css') {
    for (const duplicate of findDuplicateTokens(content)) {
      findings.push(`DUPLICATE-TOKEN ${filePath}:${lineOf(content, duplicate)} — custom property ${duplicate} is declared more than once; one token, one truth`);
    }
    return;
  }
  if (name === 'app.css') {
    lintAppCss(filePath, content, truth, findings);
    return;
  }
  if (name.endsWith('.html')) {
    lintHtml(filePath, content, truth, findings);
  }
}

function walkDesign(designRoot) {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'dist') continue;
        walk(path);
      } else {
        files.push(path);
      }
    }
  };
  walk(designRoot);
  return files;
}

function lintAll(designRoot) {
  const truth = loadTruth(designRoot);
  const findings = [];
  const files = walkDesign(designRoot);
  for (const file of files) lintFile(file, truth, findings);
  // Stale exceptions: an intentional value no longer present anywhere is advisory noise to
  // prune. The exceptions file itself is excluded — every value trivially matches its own entry.
  const stale = [];
  for (const entry of truth.intentional) {
    const found = files.some((file) => basename(file) !== 'lint-intentional.json'
      && !isSkipped(file) && existsSync(file) && readFileSync(file, 'utf8').includes(entry.value));
    if (!found) stale.push(`STALE-INTENTIONAL — lint-intentional.json entry "${entry.value}" matches nothing anymore; prune it (advisory, does not fail the run)`);
  }
  return { findings, stale };
}

function relativize(lines) {
  return lines.map((line) => line.replaceAll(process.cwd() + sep, ''));
}

// ---------- entry ----------

const argument = process.argv[2];

if (argument === '--hook') {
  let raw = '';
  try {
    raw = readFileSync(0, 'utf8');
  } catch {
    process.exit(0);
  }
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    process.exit(0);
  }
  const eventName = event?.hook_event_name;
  let findings = [];
  if (eventName === 'PostToolUse') {
    const filePath = event?.tool_input?.file_path;
    if (typeof filePath !== 'string' || designRootOf(filePath) === null) process.exit(0);
    const truth = loadTruth(designRootOf(filePath));
    lintFile(filePath, truth, findings);
  } else if (eventName === 'Stop') {
    const cwd = typeof event?.cwd === 'string' ? event.cwd : process.cwd();
    const designRoot = join(cwd, 'design');
    if (!existsSync(designRoot)) process.exit(0);
    findings = lintAll(designRoot).findings;
  } else {
    process.exit(0);
  }
  if (findings.length > 0) {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: eventName,
        additionalContext: `design-lint (advisory, layer 3 of the design discipline):\n${relativize(findings).join('\n')}`,
      },
    }));
  }
  process.exit(0);
}

if (argument === '--all') {
  const designRoot = join(process.cwd(), 'design');
  if (!existsSync(designRoot)) process.exit(0);
  const { findings, stale } = lintAll(designRoot);
  for (const line of relativize(stale)) console.error(`design-lint: ${line}`);
  if (findings.length > 0) {
    console.error('design-lint FAILED:');
    for (const line of relativize(findings)) console.error(`  - ${line}`);
    process.exit(1);
  }
  console.log('design-lint: design/ is clean.');
  process.exit(0);
}

if (argument === undefined) {
  console.error('design-lint: usage: node design-lint.mjs <file> | --all | --hook');
  process.exit(2);
}

// single-file CLI mode
if (designRootOf(argument) === null || isSkipped(argument)) process.exit(0);
const truth = loadTruth(designRootOf(argument));
const findings = [];
lintFile(argument, truth, findings);
if (findings.length > 0) {
  console.error(`design-lint: ${argument} FAILED:`);
  for (const line of relativize(findings)) console.error(`  - ${line}`);
  process.exit(1);
}
console.log(`design-lint: ${argument} is clean.`);
