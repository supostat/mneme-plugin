#!/usr/bin/env node
//
// Roster parity gate: the skills the bundle ships are the skills the public surfaces promise.
// ONE truth — the directories of plugin/skills/ that carry a SKILL.md, minus the companions
// (design-server is infrastructure of the design verb, never a roster verb) — checked against
// THREE surfaces:
//
//   site/index.html  — inside <section id="skills">: the set of <h3>/mneme:ID</h3> cards equals
//                      the roster (a dropped card and an extra card are separate named failures),
//                      and the number word in the heading («Twelve verbs, one cycle») and in the
//                      row's aria-label («The twelve skills …») equals the count;
//   README.md        — the bullet «- **WORD bundled skills**»: WORD equals the count and every
//                      roster skill is listed as /mneme:ID (companions may appear, nothing else);
//   plugin/README.md — the bundle-tree line «skills/ … # /mneme:…»: every roster skill is listed
//                      (companions may appear, nothing else).
//
// Two-sided, like the hook gates: a SELF-TEST on a fixture tree in tmpdir proves the detector in
// both directions (a consistent trio is green; a dropped card, an extra card, a wrong heading
// word, a wrong README word, a dropped bundle-tree entry and a companion drawn as a card are each
// red with the surface named), then the REAL repository is checked. Exit 0 only when both pass.
//
// Dev tooling: lives at the repo ROOT, never inside plugin/ (same rule as the other check-*).
//
// Usage: node scripts/check-skill-roster.mjs [--root DIR]   (also runs as part of npm test)

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptsDir, '..');

const COMPANION_SKILLS = ['design-server'];
const NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
];
const SKILLS_DIR = 'plugin/skills';
const LANDING_PATH = 'site/index.html';
const README_PATH = 'README.md';
const BUNDLE_README_PATH = 'plugin/README.md';
const SKILL_TOKEN = /\/mneme:([a-z0-9][a-z0-9-]*)/g;
const CARD_HEADING = /<h3>\/mneme:([a-z0-9][a-z0-9-]*)<\/h3>/g;
const SECTION_HEADING = /<h2 id="skills-h">(\w+) verbs, one cycle<\/h2>/;
const ROW_ARIA_LABEL = /aria-label="The (\w+) skills/;
const README_MARKER = /^- \*\*(\w+) bundled skills\*\*/m;
const BULLET_TERMINATORS = ['\n- ', '\n#', '\n\n'];

const capitalize = (word) => word.charAt(0).toUpperCase() + word.slice(1);
const skillTokensOf = (text) => [...text.matchAll(SKILL_TOKEN)].map((match) => match[1]);

const rosterOf = (root) => {
  const skillsDir = join(root, SKILLS_DIR);
  if (!existsSync(skillsDir)) return null;
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(skillsDir, entry.name, 'SKILL.md')))
    .map((entry) => entry.name)
    .filter((name) => !COMPANION_SKILLS.includes(name))
    .sort();
};

const compareWithRoster = ({ surface, place, found, roster, companionsAllowed, failures }) => {
  for (const id of roster.filter((skill) => !found.includes(skill))) {
    failures.push(`${surface}: ${place} lacks /mneme:${id} — add it (the skill ships in ${SKILLS_DIR}/${id})`);
  }
  for (const id of new Set(found.filter((skill) => !roster.includes(skill)))) {
    if (COMPANION_SKILLS.includes(id)) {
      if (companionsAllowed) continue;
      failures.push(`${surface}: ${place} draws /mneme:${id} as a card — it is a companion, never a roster card of its own; mention it inside its verb's card`);
      continue;
    }
    failures.push(`${surface}: ${place} names /mneme:${id}, which is not a roster skill — remove it or ship ${SKILLS_DIR}/${id}/SKILL.md`);
  }
};

const checkNumberWord = ({ surface, place, word, roster, failures }) => {
  const expected = NUMBER_WORDS[roster.length];
  if (expected === undefined) {
    failures.push(`${surface}: ${roster.length} roster skills exceed the NUMBER_WORDS table — extend it in check-skill-roster.mjs`);
    return;
  }
  if (word.toLowerCase() !== expected) {
    failures.push(`${surface}: ${place} says «${word}» but the roster has ${roster.length} skills — write «${capitalize(expected)}»`);
  }
};

const checkLanding = (root, roster, failures) => {
  const path = join(root, LANDING_PATH);
  if (!existsSync(path)) {
    failures.push(`${LANDING_PATH}: file missing`);
    return;
  }
  const html = readFileSync(path, 'utf8');
  const sectionStart = html.indexOf('<section id="skills"');
  if (sectionStart === -1) {
    failures.push(`${LANDING_PATH}: no <section id="skills"> — the roster has no home on the landing`);
    return;
  }
  const sectionEnd = html.indexOf('</section>', sectionStart);
  const section = html.slice(sectionStart, sectionEnd === -1 ? undefined : sectionEnd);

  const cards = [...section.matchAll(CARD_HEADING)].map((match) => match[1]);
  compareWithRoster({ surface: LANDING_PATH, place: 'the skills section', found: cards, roster, companionsAllowed: false, failures });

  const heading = section.match(SECTION_HEADING);
  if (heading === null) {
    failures.push(`${LANDING_PATH}: the heading «WORD verbs, one cycle» is missing from the skills section`);
  } else {
    checkNumberWord({ surface: LANDING_PATH, place: 'the heading', word: heading[1], roster, failures });
  }

  const ariaLabel = section.match(ROW_ARIA_LABEL);
  if (ariaLabel === null) {
    failures.push(`${LANDING_PATH}: the row's aria-label «The WORD skills …» is missing from the skills section`);
  } else {
    checkNumberWord({ surface: LANDING_PATH, place: "the row's aria-label", word: ariaLabel[1], roster, failures });
  }
};

const checkReadme = (root, roster, failures) => {
  const path = join(root, README_PATH);
  if (!existsSync(path)) {
    failures.push(`${README_PATH}: file missing`);
    return;
  }
  const text = readFileSync(path, 'utf8');
  const marker = text.match(README_MARKER);
  if (marker === null) {
    failures.push(`${README_PATH}: the bullet «- **WORD bundled skills**» is missing — the roster count has no home in the README`);
    return;
  }
  checkNumberWord({ surface: README_PATH, place: 'the «bundled skills» bullet', word: marker[1], roster, failures });

  const rest = text.slice(marker.index + marker[0].length);
  const terminators = BULLET_TERMINATORS.map((terminator) => rest.indexOf(terminator)).filter((index) => index !== -1);
  const bullet = rest.slice(0, terminators.length === 0 ? undefined : Math.min(...terminators));
  compareWithRoster({ surface: README_PATH, place: 'the «bundled skills» bullet', found: skillTokensOf(bullet), roster, companionsAllowed: true, failures });
};

const checkBundleReadme = (root, roster, failures) => {
  const path = join(root, BUNDLE_README_PATH);
  if (!existsSync(path)) {
    failures.push(`${BUNDLE_README_PATH}: file missing`);
    return;
  }
  const line = readFileSync(path, 'utf8').split('\n').find((candidate) => candidate.includes('skills/') && candidate.includes('# /mneme:'));
  if (line === undefined) {
    failures.push(`${BUNDLE_README_PATH}: the bundle-tree line «skills/ … # /mneme:…» is missing`);
    return;
  }
  compareWithRoster({ surface: BUNDLE_README_PATH, place: 'the bundle-tree line', found: skillTokensOf(line), roster, companionsAllowed: true, failures });
};

const checkRoster = (root) => {
  const failures = [];
  const roster = rosterOf(root);
  if (roster === null) {
    failures.push(`${SKILLS_DIR}: directory missing under ${root}`);
    return failures;
  }
  if (roster.length === 0) failures.push(`${SKILLS_DIR}: no skill directory carries a SKILL.md`);
  checkLanding(root, roster, failures);
  checkReadme(root, roster, failures);
  checkBundleReadme(root, roster, failures);
  return failures;
};

// --- SELF-TEST: a fixture tree, one mutation per case ---
const FIXTURE_SKILLS = ['alpha', 'beta', 'gamma'];

const landingFixture = ({ cards = FIXTURE_SKILLS, headingWord = 'Three', ariaWord = 'three' } = {}) => `<!doctype html>
<html><body>
<section id="skills" class="rule-top" aria-labelledby="skills-h">
  <h2 id="skills-h">${headingWord} verbs, one cycle</h2>
  <div class="skill-row" role="list" aria-label="The ${ariaWord} skills — horizontally scrollable">
${cards
  .map(
    (id) => `    <div class="skill-card" role="listitem">
      <span class="verb">${id}</span>
      <h3>/mneme:${id}</h3>
      <p>Card ${id}. Its companion /mneme:design-server is mentioned here, inside the card.</p>
    </div>`,
  )
  .join('\n')}
  </div>
</section>
<section id="elsewhere"><p>/mneme:omega outside the skills section must not count.</p></section>
</body></html>
`;

const readmeFixture = ({ word = 'Three', skills = FIXTURE_SKILLS } = {}) => `# Fixture

- **${word} bundled skills** — ${skills.map((id) => `\`/mneme:${id}\``).join(', ')}, with the
  companion \`/mneme:design-server\`: a line of prose about the cycle.
- **Another bullet** — an unrelated \`/mneme:omega\` that must not count.

## Next section
`;

const bundleReadmeFixture = ({ skills = FIXTURE_SKILLS } = {}) => `plugin/
  .claude-plugin/
  skills/              # ${skills.map((id) => `/mneme:${id}`).join(', ')}, /mneme:design-server
  hooks/
`;

const selfTest = () => {
  const problems = [];
  const root = mkdtempSync(join(tmpdir(), 'skill-roster-'));
  const build = ({ skills = [...FIXTURE_SKILLS, 'design-server'], landing = {}, readme = {}, bundleReadme = {} } = {}) => {
    rmSync(root, { recursive: true, force: true });
    for (const id of skills) {
      mkdirSync(join(root, SKILLS_DIR, id), { recursive: true });
      writeFileSync(join(root, SKILLS_DIR, id, 'SKILL.md'), `---\nname: ${id}\n---\n`);
    }
    mkdirSync(join(root, 'site'), { recursive: true });
    writeFileSync(join(root, LANDING_PATH), landingFixture(landing));
    writeFileSync(join(root, README_PATH), readmeFixture(readme));
    writeFileSync(join(root, BUNDLE_README_PATH), bundleReadmeFixture(bundleReadme));
    return checkRoster(root);
  };
  const expectGreen = (label, failures) => {
    if (failures.length > 0) problems.push(`${label}: expected green, got: ${failures.join(' | ')}`);
  };
  const expectOneRed = (label, failures, surface, needle) => {
    if (failures.length !== 1) {
      problems.push(`${label}: expected exactly one failure, got ${failures.length}: ${failures.join(' | ')}`);
      return;
    }
    if (!failures[0].startsWith(`${surface}:`) || !failures[0].includes(needle)) {
      problems.push(`${label}: the failure must name ${surface} and «${needle}», got: ${failures[0]}`);
    }
  };

  try {
    expectGreen('(a) consistent trio', build());
    expectOneRed('(b) card dropped', build({ landing: { cards: ['alpha', 'beta'] } }), LANDING_PATH, 'gamma');
    expectOneRed('(c) extra card', build({ landing: { cards: [...FIXTURE_SKILLS, 'delta'] } }), LANDING_PATH, 'delta');
    expectOneRed('(d) heading word', build({ landing: { headingWord: 'Four' } }), LANDING_PATH, 'Four');
    expectOneRed('(e) README word', build({ readme: { word: 'Four' } }), README_PATH, 'Four');
    expectOneRed('(f) bundle tree dropped', build({ bundleReadme: { skills: ['alpha', 'beta'] } }), BUNDLE_README_PATH, 'gamma');
    expectOneRed('(g) companion as a card', build({ landing: { cards: [...FIXTURE_SKILLS, 'design-server'] } }), LANDING_PATH, 'companion');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  return problems;
};
const SELF_TEST_CASES = 7;

// --- main ---
const rootFlagAt = process.argv.indexOf('--root');
if (rootFlagAt !== -1 && process.argv[rootFlagAt + 1] === undefined) {
  console.error('usage: node scripts/check-skill-roster.mjs [--root DIR]');
  process.exit(2);
}
const targetRoot = rootFlagAt === -1 ? repoRoot : resolve(process.argv[rootFlagAt + 1]);

const selfTestProblems = selfTest();
const realFailures = checkRoster(targetRoot);

if (selfTestProblems.length > 0 || realFailures.length > 0) {
  for (const problem of selfTestProblems) console.error(`check-skill-roster SELF-TEST FAIL: ${problem}`);
  for (const failure of realFailures) console.error(`check-skill-roster FAIL: ${failure}`);
  process.exit(1);
}
console.log(`check-skill-roster PASS: ${rosterOf(targetRoot).length} verbs on three surfaces, ${SELF_TEST_CASES} self-test cases`);
