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
// user). The hooks.json commands put a shell-guard — `[ -d design ] || exit 0;` — FIRST, so a
// project without design/ never even spawns node; the guard tests design/ in the hook process
// cwd, the same "design/ under cwd" semantics this lint applies, so in a monorepo whose design/
// lives deeper than the root both layers stay honestly silent.
// Skipped: names containing -draft-, design/dist/**, design/system/fonts.css.
// Fail-open: unreadable stdin, unknown events, missing fields — silent exit 0; an advisor
// has no right to break someone's session.
//
// Truth: the PROJECT's design/system/tokens.css (colors and the font-size scale from custom
// properties) and design/system/fonts.css (@font-face families) + generic fallbacks.
// Intentional exceptions: design/system/lint-intentional.json — [{value, reason, files?}] —
// curated ONLY on the user's explicit word (the design skill's rule).
//
// Pinned stdin contract of --hook mode: hook_event_name ("PostToolUse" | "Stop"),
// tool_input.file_path (PostToolUse), cwd, and session_id — the key of the advice dedup store
// <os.tmpdir()>/mneme-design-lint-<session_id>.json (PostToolUse records shown finding keys,
// Stop subtracts them so the deep pass never repeats what per-edit passes already said).
// A missing or unusable session_id simply disables dedup — advice repeats, nothing breaks.
//
// The raw-value heuristics come from design-rules.mjs — the SAME module the fixation checker
// uses, so the two layers cannot disagree by construction.

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve, sep } from 'node:path';
import { collectStyleContexts, scanRawValues, parseTokens, parseFontFaces, GENERIC_FAMILIES, findDuplicateTokens, parseColor, colorsMatch } from './design-rules.mjs';

// Em-dash saturation (the impeccable calibration): humans use em dashes legitimately, so the
// finding fires only on the AI saturation pattern — at least 8 dashes AND a density of one per
// 500 visible characters or tighter — never on a long text that uses a few.
const EM_DASH_MIN_COUNT = 8;
const EM_DASH_MAX_CHARS_PER_DASH = 500;

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

// A finding is {key, text}: `text` is the rendered advice line, `key` is the dedup identity —
// name + file + normalized essence, NEVER the line number (lines jitter across edits).
function makeFinding(name, filePath, essence, text) {
  return { key: `${name}|${filePath}|${essence}`, text };
}

function lintHtml(filePath, content, truth, findings) {
  for (const finding of scanRawValues(collectStyleContexts(content))) {
    if (isIntentional(truth, filePath, finding.declaration)) continue;
    const explanation = finding.name === 'RAW-HEX'
      ? 'raw hex color in a style context — colors come from tokens.css via var(--…)'
      : 'raw px literal with no var(--…) in the declaration — sizes come from tokens.css';
    findings.push(makeFinding(finding.name, filePath, finding.declaration,
      `${finding.name} ${filePath}:${lineOf(content, finding.declaration)} («${finding.declaration}») — ${explanation}`));
  }
  for (const context of collectStyleContexts(content)) {
    for (const declaration of context.split(/[;{}\n]/)) {
      if (!/font(-family)?\s*:/.test(declaration)) continue;
      for (const family of familyCandidates(declaration)) {
        if (GENERIC_FAMILIES.has(family) || truth.families.has(family)) continue;
        if (isIntentional(truth, filePath, family)) continue;
        findings.push(makeFinding('SECOND-FAMILY', filePath, family,
          `SECOND-FAMILY ${filePath}:${lineOf(content, declaration.trim())} — font family "${family}" is outside the system (fonts.css @font-face + generic fallbacks); one system, one voice`));
      }
    }
  }
  const visible = content
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<[^>]*>/g, '');
  const emDashes = (visible.match(/—/g) || []).length;
  if (emDashes >= EM_DASH_MIN_COUNT && visible.length / emDashes <= EM_DASH_MAX_CHARS_PER_DASH) {
    findings.push(makeFinding('EM-DASH-OVERUSE', filePath, 'saturation',
      `EM-DASH-OVERUSE ${filePath}:1 — ${emDashes} em dashes in ~${visible.length} visible characters (≈1 per ${Math.round(visible.length / emDashes)}; saturation threshold: ${EM_DASH_MIN_COUNT}+ at 1 per ${EM_DASH_MAX_CHARS_PER_DASH} or tighter) — advisory: this cadence reads as AI slop; vary the punctuation`));
  }
}

function lintAppCss(filePath, content, truth, findings) {
  for (const declaration of content.split(/[;{}\n]/)) {
    for (const color of declaration.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g)) {
      const normalized = color[0].replace(/\s+/g, '').toLowerCase();
      // Channel-tolerant palette match (±6 per channel); an unparseable literal falls back to
      // the exact normalized-string comparison — honest, never a guess.
      const parsed = parseColor(color[0]);
      const inPalette = parsed !== null
        ? truth.tokens.parsedColors.some((paletteColor) => colorsMatch(paletteColor, parsed))
        : truth.tokens.colors.has(normalized);
      if (inPalette) continue;
      if (isIntentional(truth, filePath, color[0]) || isIntentional(truth, filePath, normalized)) continue;
      findings.push(makeFinding('FOREIGN-COLOR', filePath, normalized,
        `FOREIGN-COLOR ${filePath}:${lineOf(content, color[0])} — ${color[0]} is neither in the tokens.css palette (±6 per channel) nor in lint-intentional.json; a fidelity skin may only use system colors or deliberate exceptions`));
    }
    const fontSize = declaration.match(/font-size\s*:\s*([^;{}\n]+)/);
    if (fontSize !== null && !fontSize[1].includes('var(--')) {
      const value = fontSize[1].trim().toLowerCase();
      if (!truth.tokens.fontSizes.has(value) && !isIntentional(truth, filePath, value)) {
        findings.push(makeFinding('FOREIGN-FONT-SIZE', filePath, value,
          `FOREIGN-FONT-SIZE ${filePath}:${lineOf(content, fontSize[0])} — ${value} is outside the tokens.css scale and not an intentional exception`));
      }
    }
    if (/font(-family)?\s*:/.test(declaration)) {
      for (const family of familyCandidates(declaration)) {
        if (GENERIC_FAMILIES.has(family) || truth.families.has(family)) continue;
        if (isIntentional(truth, filePath, family)) continue;
        findings.push(makeFinding('FOREIGN-FONT-FAMILY', filePath, family,
          `FOREIGN-FONT-FAMILY ${filePath}:${lineOf(content, declaration.trim())} — font family "${family}" is neither declared in fonts.css nor an intentional exception`));
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
      findings.push(makeFinding('DUPLICATE-TOKEN', filePath, duplicate,
        `DUPLICATE-TOKEN ${filePath}:${lineOf(content, duplicate)} — custom property ${duplicate} is declared more than once; one token, one truth`));
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

// ---------- the session dedup store (advice shown once per session) ----------

function seenStorePath(sessionId) {
  // The id comes from untrusted stdin: only a plain token may become a file name.
  if (typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) return null;
  return join(tmpdir(), `mneme-design-lint-${sessionId}.json`);
}

function readSeen(storePath) {
  try {
    const parsed = JSON.parse(readFileSync(storePath, 'utf8'));
    return new Set(Array.isArray(parsed) ? parsed.filter((key) => typeof key === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeSeen(storePath, keys) {
  try {
    writeFileSync(storePath, JSON.stringify([...keys]));
  } catch {
    // Best-effort: a failed write only means the advice may repeat later.
  }
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
  const storePath = seenStorePath(event?.session_id);
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
  // Session dedup: the Stop deep pass subtracts what per-edit passes already said; every shown
  // finding is recorded. No usable session_id → dedup off, advice may repeat (never breaks).
  let toShow = findings;
  if (storePath !== null && eventName === 'Stop') {
    const seen = readSeen(storePath);
    toShow = findings.filter((finding) => !seen.has(finding.key));
  }
  if (toShow.length > 0) {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: eventName,
        additionalContext: `design-lint (advisory, layer 3 of the design discipline):\n${relativize(toShow.map((finding) => finding.text)).join('\n')}`,
      },
    }));
    if (storePath !== null) {
      const seen = readSeen(storePath);
      for (const finding of toShow) seen.add(finding.key);
      writeSeen(storePath, seen);
    }
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
    for (const line of relativize(findings.map((finding) => finding.text))) console.error(`  - ${line}`);
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
  for (const line of relativize(findings.map((finding) => finding.text))) console.error(`  - ${line}`);
  process.exit(1);
}
console.log(`design-lint: ${argument} is clean.`);
