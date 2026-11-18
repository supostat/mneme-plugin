// Check (y) of check-skill-handoff: the run's spec and phases come from the engine. One mutation
// per rule of (y1)-(y6), plus the (j) grants of dev, map and resume the check relies on.
// `workflow_spec { run_id }` stands in dev three times (Start path, SPEC-FRAME, COMMIT-FIRST), so
// the SPEC-FRAME mutation stays inside the section's opening paragraph; SPEC-FRAME's other anchors
// live in its WHEN/WHAT/DEGRADED list, which is one paragraph. resume names the call three times
// (Step 4's heading and body, Rules), so its mutation takes them all.

const dev = 'plugin/skills/dev/SKILL.md';
const map = 'plugin/skills/map/SKILL.md';
const resume = 'plugin/skills/resume/SKILL.md';
const diary = 'plugin/skills/diary/SKILL.md';
const specFrameOpening = /^The `execute_step` directive carries intent/m;
const specFrameList = /^- WHEN — before the work/m;

const specFrameAnchorBreak = (anchor, within, find, replace) => ({
  label: `dev: SPEC-FRAME drops «${anchor}»`,
  file: dev,
  within,
  find,
  replace,
  expect: `dev: SPEC-FRAME does not say «${anchor}»`,
});

const runSourceAnchorBreak = (area, anchor, find, replace) => ({
  label: `dev: ${area} drops «${anchor}»`,
  file: dev,
  find,
  replace,
  expect: `dev: ${area} does not say «${anchor}»`,
});

const corpusMarkerBreak = (name, file, marker, find, replace) => ({
  label: `${name}: the text names «${marker}» again`,
  file,
  find,
  replace,
  expect: `${name}: text names «${marker}»`,
});

export const guard = ['node', 'scripts/check-skill-handoff.mjs'];

export const mutations = [
  {
    label: 'dev: the SPEC-FRAME heading loses its name',
    file: dev,
    find: '### SPEC-FRAME — the run',
    replace: '### SPEC FRAME — the run',
    expect: 'dev: no `### SPEC-FRAME` section',
  },
  specFrameAnchorBreak('workflow_spec { run_id }', specFrameOpening, 'workflow_spec { run_id }', 'workflow_spec'),
  specFrameAnchorBreak('EVERY `execute_step`', specFrameList, 'EVERY `execute_step`', 'the first `execute_step`'),
  specFrameAnchorBreak('the `knowledge:` block', specFrameList, 'the `knowledge:` block', 'the Knowledge'),
  specFrameAnchorBreak('`knowledge: not recorded', specFrameList, '`knowledge: not recorded', '`knowledge: missing'),
  specFrameAnchorBreak('engine debt', specFrameOpening, 'engine debt', 'by design'),
  {
    label: 'dev: the execute_step branch stops naming SPEC-FRAME',
    file: dev,
    find: 'comes from `### SPEC-FRAME`',
    replace: 'comes from the spec',
    expect: 'dev: the execute_step branch does not name SPEC-FRAME',
  },
  {
    label: 'dev: the SPEC-FRAME bullet in Rules loses its name',
    file: dev,
    find: '- SPEC-FRAME — before the work',
    replace: '- SPEC FRAME — before the work',
    expect: 'dev: no `- SPEC-FRAME` bullet in Rules',
  },
  runSourceAnchorBreak('SLUG-RESOLVE', 'workflow_spec { spec_slug }', 'workflow_spec { spec_slug }', 'workflow_spec'),
  runSourceAnchorBreak('SLUG-RESOLVE', 'workflow_spec {}', 'workflow_spec {}', 'the spec list'),
  runSourceAnchorBreak('SLUG-RESOLVE', 'spec none', 'spec none', 'no spec'),
  runSourceAnchorBreak('Start path', 'pass phases or spec_slug, not both', 'pass phases or spec_slug, not both', 'two sources'),
  runSourceAnchorBreak(
    'Start path',
    'NOTICE: an unfinished workflow run already exists',
    'NOTICE: an unfinished workflow run already exists',
    'a notice about an unfinished run',
  ),
  {
    label: 'dev: the workflow_spec permission loses its bullet',
    file: dev,
    find: '- `mcp__plugin_mneme_memory__workflow_spec`: YES',
    replace: '- the spec reads: YES',
    expect: 'dev: Permissions carry no `mcp__plugin_mneme_memory__workflow_spec` bullet',
  },
  {
    label: "dev: the Bash permission stops granting COMMIT-FIRST's base diff",
    file: dev,
    within: /^- Edit \/ Write \/ Bash \/ Grep:/m,
    find: 'git diff --name-only <base> HEAD',
    replace: 'git diff --name-only <base>',
    expect: 'dev: the Bash permission does not grant «git diff --name-only <base> HEAD»',
  },
  {
    label: "resume: Step 4 stops reading the run's spec",
    file: resume,
    find: 'workflow_spec { run_id }',
    replace: 'workflow_spec',
    all: true,
    expect: 'resume: Step 4 does not say «workflow_spec { run_id }»',
  },
  {
    label: 'resume: Step 4 drops the deps none phase line',
    file: resume,
    find: 'deps none',
    replace: 'deps []',
    expect: 'resume: Step 4 does not say «deps none»',
  },
  {
    label: 'resume: the phase-folder degradation line returns to Output format',
    file: resume,
    find: '- `граф: <ответ workflow_spec дословно>`',
    replace: '- `граф: папка фаз не определена однозначно — кандидаты: <slugs>`',
    expect: 'resume: text still says «папка фаз не определена»',
  },
  corpusMarkerBreak(
    'dev',
    dev,
    '<corpus>',
    'This skill never computes where the corpus lies',
    'This skill reads `<corpus>/workflow/<slug>/`',
  ),
  corpusMarkerBreak(
    'map',
    map,
    '~/.mneme',
    'skill computes no corpus path and reads no corpus file.',
    'skill reads the archive under `~/.mneme/<name>/specs/`.',
  ),
  corpusMarkerBreak(
    'resume',
    resume,
    '.mneme.json',
    'resume computes no corpus path and reads no file.',
    'resume reads the corpus name from `.mneme.json`.',
  ),
  corpusMarkerBreak(
    'diary',
    diary,
    'MNEME_CORPUS_NAME',
    'the degradation segment is information about the corpus',
    'the degradation segment is information about the `MNEME_CORPUS_NAME` corpus',
  ),
  {
    label: 'diary: Step 1 drops the spec line',
    file: diary,
    find: 'spec <slug>|none|not recorded · base commit',
    replace: 'base commit',
    expect: 'diary: Step 1 does not show the spec line «spec <slug>|none|not recorded»',
  },
  {
    label: "diary: «Зачем» stops naming the run's spec by its spec line",
    file: diary,
    find: 'by the slug of the spec line of Step 1',
    replace: 'by its slug',
    expect: "diary: «Зачем» does not name the run's spec by its «spec line»",
  },
  {
    label: 'dev: the grant loses workflow_spec',
    file: dev,
    find: 'Grep, mcp__plugin_mneme_memory__workflow_spec]',
    replace: 'Grep]',
    expect: 'dev: allowed-tools carries no exact token «mcp__plugin_mneme_memory__workflow_spec»',
  },
  {
    label: 'map: the grant loses workflow_spec',
    file: map,
    find: ', mcp__plugin_mneme_memory__workflow_spec]',
    replace: ']',
    expect: 'map: allowed-tools lacks mcp__plugin_mneme_memory__workflow_spec',
  },
  {
    label: 'resume: the grant loses workflow_spec',
    file: resume,
    find: 'mcp__plugin_mneme_memory__workflow_survey, mcp__plugin_mneme_memory__workflow_spec]',
    replace: 'mcp__plugin_mneme_memory__workflow_survey]',
    expect: 'resume: allowed-tools lacks mcp__plugin_mneme_memory__workflow_spec',
  },
  {
    label: 'resume: the grant takes Read back',
    file: resume,
    find: '[mcp__plugin_mneme_memory__workflow_survey,',
    replace: '[Read, mcp__plugin_mneme_memory__workflow_survey,',
    expect: 'resume: allowed-tools grants Read beyond its exact contract',
  },
];
