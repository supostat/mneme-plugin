#!/usr/bin/env node
// Self-test of scripts/prove-guard-mutations.mjs: the tool that proves the other guards is itself
// proven here, on a toy guard inside a throwaway git repository. Each case runs the real script and
// pins its exit code and one named line; every rule of the script has a case that fails if the
// rule is removed — the expect check, exit 1 as the only red, the exactly-once anchor and `all`,
// `within` (CRLF included), the baseline, the guard after the restore, the tree snapshot, the
// restore itself, an interrupt, and malformed calls. After every case both contracts are
// byte-identical to the originals.
//
// Git runs without the caller's GIT_* variables and without global or system config: inherited
// GIT_DIR from a hook would aim the fixture at the real repository, and user config (signing,
// hooks paths) would break the throwaway commit.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const proveScript = join(dirname(fileURLToPath(import.meta.url)), 'prove-guard-mutations.mjs');

const CONTRACT = `# Contract

**RULE-A — the first rule:** names MARK-ALPHA and MARK-BETA.

Another paragraph names MARK-ALPHA again, and MARK-DELTA.

The closing paragraph names MARK-DELTA once more.
`;
const CONTRACT_FILES = { 'contract.md': CONTRACT, 'contract-crlf.md': CONTRACT.replaceAll('\n', '\r\n') };
const GUARD_LEFTOVERS = ['sticky.flag', 'trace.txt'];

const TOY_GUARD = `import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const option = (name) => process.argv.includes(name);
const contractName = process.argv.find((argument) => argument.startsWith('--contract='))?.slice('--contract='.length) ?? 'contract.md';
const text = readFileSync(contractName, 'utf8');
const failures = [];
if (option('--always-red')) failures.push('toy: always red');
if (option('--sticky') && existsSync('sticky.flag')) failures.push('toy: sticky failure');
const ruleStart = text.search(/^\\*\\*RULE-A\\b/m);
const rule = ruleStart === -1 ? '' : text.slice(ruleStart).split(/\\r?\\n\\s*\\r?\\n/)[0];
if (!rule.includes('MARK-ALPHA')) failures.push('toy: marker «MARK-ALPHA» missing');
if (!text.includes('MARK-BETA')) failures.push('toy: marker «MARK-BETA» missing');
if (!text.includes('MARK-DELTA')) failures.push('toy: marker «MARK-DELTA» missing');
if (text.includes('BROKEN')) failures.push('toy: the contract is broken');
if (failures.length > 0) {
  if (option('--sticky')) writeFileSync('sticky.flag', '');
  if (option('--trace')) writeFileSync('trace.txt', '');
  if (option('--self-interrupt')) process.kill(process.pid, 'SIGINT');
  console.error('Toy guard FAILED:');
  for (const failure of failures) console.error('  - ' + failure);
  process.exit(option('--exit-3') ? 3 : 1);
}
console.log('toy guard passed');
`;

const guardWith = (...options) => JSON.stringify(['node', 'toy-guard.mjs', ...options]);
const betaRemoved = "{ label: 'beta removed', file: 'contract.md', find: 'MARK-BETA', replace: 'MARK-GAMMA', expect: 'marker «MARK-BETA» missing' }";
const moduleOf = (guard, ...mutations) => `export const guard = ${guard};\nexport const mutations = [${mutations.join(', ')}];`;

const CASES = [
  {
    name: 'a mutation the guard catches is PROVEN',
    module: moduleOf(guardWith(), betaRemoved),
    exit: 0,
    line: 'PROVEN beta removed: - toy: marker «MARK-BETA» missing',
  },
  {
    name: 'an anchor that is not in the file fails without writing',
    module: moduleOf(guardWith(), "{ label: 'ghost', file: 'contract.md', find: 'NO-SUCH-ANCHOR', replace: 'x', expect: 'x' }"),
    exit: 1,
    line: 'FAILED ghost: anchor «NO-SUCH-ANCHOR» not found',
  },
  {
    name: 'an anchor that occurs twice without all fails',
    module: moduleOf(guardWith(), "{ label: 'twin', file: 'contract.md', find: 'MARK-ALPHA', replace: 'MARK-OMEGA', expect: 'marker «MARK-ALPHA» missing' }"),
    exit: 1,
    line: 'FAILED twin: anchor «MARK-ALPHA» occurs 2 times — narrow it or set all: true',
  },
  {
    name: 'all: true replaces every occurrence — the guard needs both gone',
    module: moduleOf(guardWith(), "{ label: 'delta everywhere', file: 'contract.md', find: 'MARK-DELTA', replace: 'MARK-EPSILON', all: true, expect: 'marker «MARK-DELTA» missing' }"),
    exit: 0,
    line: 'PROVEN delta everywhere: - toy: marker «MARK-DELTA» missing',
  },
  {
    name: 'a mutation scoped to a paragraph is PROVEN while its twin stands outside',
    module: moduleOf(guardWith(), "{ label: 'alpha leaves the rule', file: 'contract.md', within: /^\\*\\*RULE-A\\b/m, find: 'MARK-ALPHA', replace: 'MARK-OMEGA', expect: 'marker «MARK-ALPHA» missing' }"),
    exit: 0,
    line: 'PROVEN alpha leaves the rule: - toy: marker «MARK-ALPHA» missing',
  },
  {
    name: 'the paragraph scope ends at a CRLF blank line too',
    module: moduleOf(guardWith('--contract=contract-crlf.md'), "{ label: 'alpha leaves the CRLF rule', file: 'contract-crlf.md', within: /^\\*\\*RULE-A\\b/m, find: 'MARK-ALPHA', replace: 'MARK-OMEGA', expect: 'marker «MARK-ALPHA» missing' }"),
    exit: 0,
    line: 'PROVEN alpha leaves the CRLF rule: - toy: marker «MARK-ALPHA» missing',
  },
  {
    name: 'a guard that stays green is not proven',
    module: moduleOf(guardWith(), "{ label: 'harmless', file: 'contract.md', find: 'The closing paragraph', replace: 'The last paragraph', expect: 'marker' }"),
    exit: 1,
    line: 'FAILED harmless: stayed green',
  },
  {
    name: 'a guard red for another reason is not proven',
    module: moduleOf(guardWith(), "{ label: 'wrong cause', file: 'contract.md', find: 'The closing paragraph', replace: 'The BROKEN paragraph', expect: 'marker «MARK-BETA» missing' }"),
    exit: 1,
    line: 'FAILED wrong cause: red for another reason: Toy guard FAILED:',
  },
  {
    name: 'only exit 1 counts as red, even with the expected line',
    module: moduleOf(guardWith('--exit-3'), betaRemoved),
    exit: 1,
    line: 'FAILED beta removed: red for another reason: Toy guard FAILED:',
  },
  {
    name: 'a guard red before any mutation stops the run',
    module: moduleOf(guardWith('--always-red'), betaRemoved),
    exit: 1,
    line: 'baseline red: node toy-guard.mjs --always-red fails before any mutation: Toy guard FAILED:',
  },
  {
    name: 'a guard still red after the restore is a problem',
    module: moduleOf(guardWith('--sticky'), betaRemoved),
    exit: 1,
    line: 'guard red after the mutations were restored: Toy guard FAILED:',
  },
  {
    name: 'a mutation that leaves a trace in the tree is a problem',
    module: moduleOf(guardWith('--trace'), betaRemoved),
    exit: 1,
    line: 'the working tree differs from the one before the mutations',
  },
  {
    name: 'an interrupted guard restores the file and stops with 130',
    module: moduleOf(guardWith('--self-interrupt'), betaRemoved, "{ label: 'never reached', file: 'contract.md', find: 'MARK-DELTA', replace: 'x', all: true, expect: 'x' }"),
    exit: 130,
    line: 'interrupted during «beta removed» — contract.md restored, the remaining mutations not run',
  },
  {
    name: 'a missing mutated file fails that mutation by name',
    module: moduleOf(guardWith(), "{ label: 'no file', file: 'absent.md', find: 'x', replace: 'y', expect: 'x' }"),
    exit: 1,
    line: 'FAILED no file: cannot read absent.md',
  },
  {
    name: 'a guard that cannot start is a malformed call',
    module: moduleOf(JSON.stringify(['no-such-guard-binary']), betaRemoved),
    exit: 2,
    line: 'no-such-guard-binary cannot start',
  },
  {
    name: 'a module without guard is a malformed call',
    module: `export const mutations = [${betaRemoved}];`,
    exit: 2,
    line: '«guard» must be a non-empty argv array',
  },
  {
    name: 'a mutation without expect is a malformed call',
    module: moduleOf(guardWith(), "{ label: 'no expect', file: 'contract.md', find: 'MARK-BETA', replace: 'MARK-GAMMA' }"),
    exit: 2,
    line: 'no expect: «expect» must be a non-empty string',
  },
  {
    name: 'a module path that does not exist is a malformed call',
    modulePath: 'missing-module.mjs',
    exit: 2,
    line: 'cannot load the mutation module',
  },
];

const isolatedGitEnvironment = {
  ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))),
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};

const run = (command, commandArguments, cwd) =>
  spawnSync(command, commandArguments, { cwd, env: isolatedGitEnvironment, encoding: 'utf8' });

const git = (repository, ...gitArguments) => {
  const result = run('git', gitArguments, repository);
  if (result.status !== 0) throw new Error(`git ${gitArguments.join(' ')} failed: ${result.stderr.trim()}`);
};

const workspace = realpathSync(mkdtempSync(join(tmpdir(), 'prove-guard-mutations-')));
const failures = [];

try {
  const repository = join(workspace, 'repository');
  const modules = join(workspace, 'modules');
  mkdirSync(repository);
  mkdirSync(modules);
  for (const [name, content] of Object.entries(CONTRACT_FILES)) writeFileSync(join(repository, name), content);
  writeFileSync(join(repository, 'toy-guard.mjs'), TOY_GUARD);
  git(repository, 'init', '--quiet');
  git(repository, 'config', 'user.name', 'self-test');
  git(repository, 'config', 'user.email', 'self-test@example.invalid');
  git(repository, 'config', 'core.autocrlf', 'false');
  git(repository, 'add', '.');
  git(repository, 'commit', '--quiet', '--message', 'fixture');

  CASES.forEach((testCase, index) => {
    const modulePath = join(modules, testCase.modulePath ?? `case-${index + 1}.mjs`);
    if (testCase.module !== undefined) writeFileSync(modulePath, testCase.module);
    const result = run('node', [proveScript, modulePath], repository);
    const output = `${result.stdout}${result.stderr}`;
    if (result.status !== testCase.exit) {
      failures.push(`${testCase.name}: exit ${result.status}, expected ${testCase.exit} — ${output.trim().split('\n')[0]}`);
    }
    if (!output.includes(testCase.line)) {
      failures.push(`${testCase.name}: no line «${testCase.line}» in the output:\n${output.trim()}`);
    }
    for (const [name, content] of Object.entries(CONTRACT_FILES)) {
      if (readFileSync(join(repository, name), 'utf8') !== content) {
        failures.push(`${testCase.name}: ${name} was not restored byte for byte`);
        writeFileSync(join(repository, name), content);
      }
    }
    for (const leftover of GUARD_LEFTOVERS.filter((name) => existsSync(join(repository, name)))) {
      rmSync(join(repository, leftover));
    }
  });
} finally {
  rmSync(workspace, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error('prove-guard-mutations self-test FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `prove-guard-mutations self-test passed: ${CASES.length} cases — proven (plain, all, scoped past a twin, CRLF), anchors missing or doubled, stayed green, red for another reason or with another exit code, red before or after, a trace in the tree, an interrupt, unreadable files and malformed calls; both contracts restored byte for byte after each.`,
);
