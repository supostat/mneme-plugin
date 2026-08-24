#!/usr/bin/env node
//
// session-tokens.mjs — one line of session token spend for the TOKEN-LINE menu header.
//
// Reads the freshest session transcript (~/.claude/projects/<munged-cwd>/*.jsonl), prints:
//   ≈168k в окне · сессия 52k in / 9k out
// Window fill = usage of the LAST model response (input + cache_read + cache_creation);
// session cumulative = Σinput / Σoutput over the whole transcript, computed incrementally
// via a byte-offset cache in the OS tmpdir (<tmpdir>/mneme-session-tokens-<basename>.json —
// the design-lint dedup-store precedent: state lifetime = session lifetime, OS cleans tmp).
//
// FAIL-OPEN is absolute: known refusals print a degradation line («окно: н/д — <причина>»),
// unexpected errors print nothing; the exit code is ALWAYS 0 — a menu is never delayed.
//
// Args: --cwd <path>            project cwd (default: process.cwd()); munged by the script.
//       --projects-dir <path>   transcripts root (default: ~/.claude/projects); the system
//                               boundary — overridable so the checker can point at fixtures.

import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import process from 'node:process';

const PARALLEL_SESSION_WINDOW_MS = 300_000;

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
    if (typeof cache.offset === 'number' && cache.offset >= 0) return cache;
  } catch {
    // no cache or unreadable cache — cold recompute below
  }
  return null;
}

function emptyCache() {
  return { offset: 0, input: 0, output: 0, cacheRead: 0, cacheCreation: 0, lastUsage: null };
}

function usageOfLine(line) {
  try {
    const entry = JSON.parse(line);
    const usage = entry?.message?.usage ?? entry?.usage;
    return usage && typeof usage === 'object' ? usage : null;
  } catch {
    return null;
  }
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
    const usage = usageOfLine(line);
    if (!usage) continue;
    cache.input += usage.input_tokens ?? 0;
    cache.output += usage.output_tokens ?? 0;
    cache.cacheRead += usage.cache_read_input_tokens ?? 0;
    cache.cacheCreation += usage.cache_creation_input_tokens ?? 0;
    cache.lastUsage = usage;
  }
  cache.offset += Buffer.byteLength(chunk.slice(0, lastNewline + 1), 'utf8');
  return cache;
}

function kilo(n) {
  return `${Math.round(n / 1000)}k`;
}

function main() {
  const cwd = argValue('--cwd') ?? process.cwd();
  const projectsDir = argValue('--projects-dir') ?? join(homedir(), '.claude', 'projects');
  const transcriptDir = join(projectsDir, mungeCwd(cwd));

  if (!existsSync(transcriptDir)) {
    console.log('окно: н/д — транскрипт не найден');
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
    console.log('окно: н/д — транскрипт не найден');
    return;
  }
  if (transcripts.length >= 2 && transcripts[0].mtimeMs - transcripts[1].mtimeMs <= PARALLEL_SESSION_WINDOW_MS) {
    console.log('окно: н/д — две активные сессии');
    return;
  }

  const transcript = transcripts[0];
  let cache = loadCache(transcript.path);
  if (!cache || transcript.size < cache.offset) cache = emptyCache();
  accumulate(cache, transcript.path, transcript.size);
  writeFileSync(cachePath(transcript.path), JSON.stringify(cache));

  if (!cache.lastUsage) {
    console.log('окно: н/д — пустой usage');
    return;
  }
  const window =
    (cache.lastUsage.input_tokens ?? 0) +
    (cache.lastUsage.cache_read_input_tokens ?? 0) +
    (cache.lastUsage.cache_creation_input_tokens ?? 0);
  console.log(`≈${kilo(window)} в окне · сессия ${kilo(cache.input)} in / ${kilo(cache.output)} out`);
}

try {
  main();
} catch {
  // fail-open: unexpected error → no line at all, the menu renders without it
}
process.exit(0);
