#!/usr/bin/env node
//
// session-tokens.mjs — token-spend lines for the TOKEN-LINE / RUN-COST norms.
//
// Reads the freshest session transcript (~/.claude/projects/<munged-cwd>/*.jsonl).
//
// Default (menu line):   контекст ≈574k/1M · 57%
//   Window = lastUsage of the MAIN model (input + cache_read + cache_creation); the main model
//   is the one with the most UNIQUE (by message.id) assistant records — a transcript also carries
//   auxiliary calls of other models and <synthetic> entries, and taking the raw last record made
//   the window lie. Denominator + percent come from the model→limit table; an unknown model
//   prints the window with no denominator (honest degradation, never a guess).
//
// --mark <run_id>        snapshot {output, turns, subagentOut} into cache.marks[run_id]; silent.
// --delta <run_id>       прогон ~46k out · 31 турн[ · субагенты 12k out]
//   Differences against the mark; no mark in THIS session's cache (resume, rotation) degrades
//   honestly to the session totals: прогон (с начала текущей сессии) ~46k out · 31 турн.
//
// Counters are deduped by message.id (streaming writes one message as several JSONL lines with
// the usage repeated in each — summing raw lines overstated out ≈2×). The dedup is a bounded
// LRU seen-set: streaming duplicates are temporally local, overflow costs at worst one tail
// message double-counted. Subagent (sidechain) records live NOT in the main transcript but in
// <transcript-dir>/<session-id>/subagents/agent-*.jsonl; their deduped Σoutput is memoized
// per file by (basename, size) — the files are write-once after the agent finishes.
//
// Cache schema v2 in the OS tmpdir (<tmpdir>/mneme-session-tokens-<basename>.json); a v1 cache
// (or any schema mismatch) triggers a cold recompute, never a failure.
//
// FAIL-OPEN is absolute: known refusals print a degradation line («окно: н/д — <причина>»),
// unexpected errors print nothing; the exit code is ALWAYS 0 — a menu is never delayed.
//
// Args: --cwd <path>            project cwd (default: process.cwd()); munged by the script.
//       --projects-dir <path>   transcripts root (default: ~/.claude/projects); the system
//                               boundary — overridable so the checker can point at fixtures.
//       --mark <key> | --delta <key>         RUN-COST modes (norm bearers only).
//       --label <слово>                      delta-line prefix instead of «прогон» (e.g. допрос).

import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import process from 'node:process';

const PARALLEL_SESSION_WINDOW_MS = 300_000;
const CACHE_SCHEMA = 2;
const SEEN_LRU_SIZE = 64;
const SYNTHETIC_MODEL = '<synthetic>';

const MODEL_WINDOW_LIMITS = {
  'claude-fable-5': 1_000_000,
  'claude-opus-5': 200_000,
  'claude-sonnet-5': 200_000,
  'claude-haiku-4-5': 200_000,
};

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : null;
}

function mungeCwd(cwd) {
  return cwd.replace(/[/.]/g, '-');
}

function cachePath(transcriptPath) {
  return join(tmpdir(), `mneme-session-tokens-${basename(transcriptPath)}.json`);
}

function loadCache(transcriptPath) {
  try {
    const cache = JSON.parse(readFileSync(cachePath(transcriptPath), 'utf8'));
    if (cache.schema === CACHE_SCHEMA && typeof cache.offset === 'number' && cache.offset >= 0) return cache;
  } catch {
    // no cache or unreadable cache — cold recompute below
  }
  return null;
}

function emptyCache() {
  return {
    schema: CACHE_SCHEMA,
    offset: 0,
    input: 0,
    output: 0,
    models: {},
    seenIds: [],
    marks: {},
    subagentFiles: {},
  };
}

function parseUsageEntry(line) {
  try {
    const entry = JSON.parse(line);
    const usage = entry?.message?.usage ?? entry?.usage;
    if (!usage || typeof usage !== 'object') return null;
    return {
      usage,
      model: typeof entry?.message?.model === 'string' ? entry.message.model : null,
      messageId: typeof entry?.message?.id === 'string' ? entry.message.id : null,
    };
  } catch {
    return null;
  }
}

function markSeen(cache, messageId) {
  if (cache.seenIds.includes(messageId)) return true;
  cache.seenIds.push(messageId);
  if (cache.seenIds.length > SEEN_LRU_SIZE) cache.seenIds.shift();
  return false;
}

function countEntry(cache, entry) {
  const duplicate = entry.messageId !== null && markSeen(cache, entry.messageId);
  if (entry.model !== null) {
    const model = cache.models[entry.model] ?? { count: 0, lastUsage: null };
    model.lastUsage = entry.usage;
    if (!duplicate) model.count += 1;
    cache.models[entry.model] = model;
  }
  if (duplicate) return;
  cache.input += entry.usage.input_tokens ?? 0;
  cache.output += entry.usage.output_tokens ?? 0;
}

function accumulate(cache, transcriptPath, fileSize) {
  const increment = fileSize - cache.offset;
  if (increment <= 0) return cache;
  const buffer = Buffer.alloc(increment);
  const fd = openSync(transcriptPath, 'r');
  try {
    readSync(fd, buffer, 0, increment, cache.offset);
  } finally {
    closeSync(fd);
  }
  const chunk = buffer.toString('utf8');
  const lastNewline = chunk.lastIndexOf('\n');
  if (lastNewline === -1) return cache;
  for (const line of chunk.slice(0, lastNewline).split('\n')) {
    const entry = parseUsageEntry(line);
    if (entry) countEntry(cache, entry);
  }
  cache.offset += Buffer.byteLength(chunk.slice(0, lastNewline + 1), 'utf8');
  return cache;
}

function mainModelName(cache) {
  let best = null;
  for (const [name, model] of Object.entries(cache.models)) {
    if (name === SYNTHETIC_MODEL) continue;
    if (!best || model.count > cache.models[best].count) best = name;
  }
  return best;
}

function windowLimit(modelName) {
  for (const [prefix, limit] of Object.entries(MODEL_WINDOW_LIMITS)) {
    if (modelName === prefix || modelName.startsWith(`${prefix}-`)) return limit;
  }
  return null;
}

function subagentOutput(transcriptPath, cache) {
  const sessionDir = transcriptPath.replace(/\.jsonl$/, '');
  const subagentsDir = join(sessionDir, 'subagents');
  if (!existsSync(subagentsDir)) return 0;
  let total = 0;
  for (const name of readdirSync(subagentsDir)) {
    if (!name.startsWith('agent-') || !name.endsWith('.jsonl')) continue;
    const path = join(subagentsDir, name);
    const size = statSync(path).size;
    const memo = cache.subagentFiles[name];
    if (memo && memo.size === size) {
      total += memo.output;
      continue;
    }
    let output = 0;
    const seen = new Set();
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const entry = parseUsageEntry(line);
      if (!entry) continue;
      if (entry.messageId !== null) {
        if (seen.has(entry.messageId)) continue;
        seen.add(entry.messageId);
      }
      output += entry.usage.output_tokens ?? 0;
    }
    cache.subagentFiles[name] = { size, output };
    total += output;
  }
  return total;
}

function kilo(n) {
  return `${Math.round(n / 1000)}k`;
}

function limitLabel(limit) {
  return limit >= 1_000_000 ? `${limit / 1_000_000}M` : `${limit / 1000}k`;
}

function runCostLine(current, mark, label) {
  const base = mark ?? { output: 0, turns: 0, subagentOut: 0 };
  const word = label ?? 'прогон';
  const prefix = mark ? word : `${word} (с начала текущей сессии)`;
  let line = `${prefix} ~${kilo(current.output - base.output)} out · ${current.turns - base.turns} турн`;
  const subagentDelta = current.subagentOut - base.subagentOut;
  if (subagentDelta > 0) line += ` · субагенты ${kilo(subagentDelta)} out`;
  return line;
}

function main() {
  const cwd = argValue('--cwd') ?? process.cwd();
  const projectsDir = argValue('--projects-dir') ?? join(homedir(), '.claude', 'projects');
  const markRunId = argValue('--mark');
  const deltaRunId = argValue('--delta');
  const runCostMode = markRunId !== null || deltaRunId !== null;
  const transcriptDir = join(projectsDir, mungeCwd(cwd));

  if (!existsSync(transcriptDir)) {
    if (!runCostMode) console.log('окно: н/д — транскрипт не найден');
    return;
  }
  const transcripts = readdirSync(transcriptDir)
    .filter((name) => name.endsWith('.jsonl'))
    .map((name) => {
      const path = join(transcriptDir, name);
      return { path, mtimeMs: statSync(path).mtimeMs, size: statSync(path).size };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (transcripts.length === 0) {
    if (!runCostMode) console.log('окно: н/д — транскрипт не найден');
    return;
  }
  if (transcripts.length >= 2 && transcripts[0].mtimeMs - transcripts[1].mtimeMs <= PARALLEL_SESSION_WINDOW_MS) {
    if (!runCostMode) console.log('окно: н/д — две активные сессии');
    return;
  }

  const transcript = transcripts[0];
  let cache = loadCache(transcript.path);
  if (!cache || transcript.size < cache.offset) cache = emptyCache();
  accumulate(cache, transcript.path, transcript.size);

  if (runCostMode) {
    const mainModel = mainModelName(cache);
    const current = {
      output: cache.output,
      turns: mainModel === null ? 0 : cache.models[mainModel].count,
      subagentOut: subagentOutput(transcript.path, cache),
    };
    if (markRunId !== null) {
      cache.marks[markRunId] = current;
      writeFileSync(cachePath(transcript.path), JSON.stringify(cache));
      return;
    }
    writeFileSync(cachePath(transcript.path), JSON.stringify(cache));
    console.log(runCostLine(current, cache.marks[deltaRunId] ?? null, argValue('--label')));
    return;
  }

  writeFileSync(cachePath(transcript.path), JSON.stringify(cache));
  const mainModel = mainModelName(cache);
  if (mainModel === null) {
    console.log('окно: н/д — пустой usage');
    return;
  }
  const lastUsage = cache.models[mainModel].lastUsage;
  const window =
    (lastUsage.input_tokens ?? 0) +
    (lastUsage.cache_read_input_tokens ?? 0) +
    (lastUsage.cache_creation_input_tokens ?? 0);
  const limit = windowLimit(mainModel);
  if (limit === null) {
    console.log(`контекст ≈${kilo(window)}`);
    return;
  }
  console.log(`контекст ≈${kilo(window)}/${limitLabel(limit)} · ${Math.round((window / limit) * 100)}%`);
}

try {
  main();
} catch {
  // fail-open: unexpected error → no line at all, the menu renders without it
}
process.exit(0);
