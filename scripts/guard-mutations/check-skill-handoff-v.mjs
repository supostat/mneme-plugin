const dev = 'plugin/skills/dev/SKILL.md';
const map = 'plugin/skills/map/SKILL.md';
const prompt = 'plugin/skills/prompt/SKILL.md';
const mapHandoffList = /^1\. `map_list \{\}`/m;
const runSpecList = /^1\. Call `mcp__plugin_mneme_memory__diary_facts/m;
const runInvariants = /^RUN-INVARIANTS\b/m;

const mapHandoffAnchorBreak = (anchor, find, replace) => ({
  label: `dev: MAP-HANDOFF drops «${anchor}»`,
  file: dev,
  find,
  replace,
  expect: `dev: MAP-HANDOFF does not say «${anchor}»`,
});

const runSpecAnchorBreak = (anchor, find, replace, all = false) => ({
  label: `map: RUN-SPEC drops «${anchor}»`,
  file: map,
  within: runSpecList,
  find,
  replace,
  all,
  expect: `map: RUN-SPEC does not say «${anchor}»`,
});

const runInvariantsAnchorBreak = (anchor, find, replace) => ({
  label: `map: RUN-INVARIANTS drops «${anchor}»`,
  file: map,
  within: runInvariants,
  find,
  replace,
  expect: `map: RUN-INVARIANTS does not say «${anchor}»`,
});

export const guard = ['node', 'scripts/check-skill-handoff.mjs'];

export const mutations = [
  {
    label: 'dev: the MAP-HANDOFF heading loses its name',
    file: dev,
    find: '### MAP-HANDOFF — the map after',
    replace: '### MAP HANDOFF — the map after',
    expect: 'dev: no `### MAP-HANDOFF` section',
  },
  { ...mapHandoffAnchorBreak('map_list {}', '1. `map_list {}`.', '1. `map_list`.'), within: mapHandoffList },
  mapHandoffAnchorBreak('map_list { id }', 'Otherwise `map_list { id }` for every', 'Otherwise `map_list` for every'),
  mapHandoffAnchorBreak(
    'git diff --name-only <commit>..HEAD',
    '`git diff --name-only <commit>..HEAD` — map',
    '`git diff --name-only` — map',
  ),
  mapHandoffAnchorBreak('covers everything inside it', 'covers everything inside it', 'covers its direct files'),
  mapHandoffAnchorBreak('says nothing about the map', 'the finale says nothing about the map', 'the finale says a line about the map'),
  mapHandoffAnchorBreak(
    '`1 — выдать команду /mneme:map run <run_id>`',
    '`1 — выдать команду /mneme:map run <run_id>`',
    '`1 — запустить /mneme:map run <run_id>`',
  ),
  mapHandoffAnchorBreak('`2 — пропустить`', '`2 — пропустить`', '`2 — позже`'),
  mapHandoffAnchorBreak(
    'disable-model-invocation',
    '`disable-model-invocation`, so dev never runs it',
    'the launch flag, so dev never runs it',
  ),
  {
    label: 'dev: the RUN COMPLETE terminal stops naming MAP-HANDOFF',
    file: dev,
    within: /^- `RUN COMPLETE`/m,
    find: 'MAP-HANDOFF',
    replace: 'MAP HANDOFF',
    all: true,
    expect: 'dev: the RUN COMPLETE terminal does not hand over to MAP-HANDOFF',
  },
  {
    label: 'dev: HANDOFF-DECISION loses the MAP-HANDOFF exception',
    file: dev,
    find: 'whose `### MAP-HANDOFF`',
    replace: 'whose map check',
    expect: 'dev: HANDOFF-DECISION exempts every terminal — the MAP-HANDOFF exception is missing',
  },
  {
    label: 'dev: the MAP-HANDOFF bullet in Rules loses its name',
    file: dev,
    find: '- MAP-HANDOFF — on `RUN COMPLETE` only',
    replace: '- MAP HANDOFF — on `RUN COMPLETE` only',
    expect: 'dev: no `- MAP-HANDOFF` bullet in Rules',
  },
  {
    label: 'map: Arguments loses the run form dev hands over',
    file: map,
    find: '`/mneme:map run <run_id>` — an UPDATE',
    replace: '`run <run_id>` — an UPDATE',
    expect: 'map: ## Arguments lacks `/mneme:map run <run_id>`',
  },
  {
    label: 'map: the RUN-SPEC heading loses its name',
    file: map,
    find: '### RUN-SPEC — the finished',
    replace: '### RUN SPEC — the finished',
    expect: 'map: no `### RUN-SPEC` section',
  },
  runSpecAnchorBreak('diary_facts { run_id }', 'diary_facts { run_id }` ONCE', 'diary_facts` ONCE'),
  runSpecAnchorBreak('status complete', 'second line starts with `status complete`', 'second line names a status'),
  runSpecAnchorBreak('contain ALL', 'contain ALL of them', 'contain any of them'),
  runSpecAnchorBreak('<corpus>/specs/<slug>.md', 'Read `<corpus>/specs/<slug>.md`', 'Read `docs/SPEC-<slug>.md`'),
  runSpecAnchorBreak('спека прогона не найдена', 'спека прогона не найдена', 'спека прогона потеряна', true),
  {
    label: 'map: Step 2 stops handing RUN-SPEC to the describers',
    file: map,
    find: 'also the RUN-SPEC block',
    replace: 'also the run spec block',
    expect: 'map: Step 2 does not hand RUN-SPEC to the describers',
  },
  {
    label: 'map: the RUN-INVARIANTS paragraph loses its name',
    file: map,
    find: 'RUN-INVARIANTS — in `run` mode',
    replace: 'RUN INVARIANTS — in `run` mode',
    expect: 'map: no RUN-INVARIANTS paragraph',
  },
  runInvariantsAnchorBreak('executable done-when', 'An executable done-when of the run', 'A gate of the run'),
  runInvariantsAnchorBreak('never counts', 'agent-judged criterion never counts as a check', 'agent-judged criterion counts as a check'),
  runInvariantsAnchorBreak('the code wins', 'the code wins — the', 'the spec wins — the'),
  runInvariantsAnchorBreak('## Открытые вопросы', 'goes to `## Открытые вопросы`,', 'goes to `## Сущности`,'),
  {
    label: 'prompt: ONE ROUTE TABLE stops naming map run',
    file: prompt,
    find: '`map run` are never composed, a slug',
    replace: 'nothing else is composed, a slug',
    expect: 'prompt: ONE ROUTE TABLE does not name `map run` among the commands never composed',
  },
  {
    label: 'dev: the grant loses map_list',
    file: dev,
    find: 'mcp__plugin_mneme_memory__workflow_step, mcp__plugin_mneme_memory__map_list, Read',
    replace: 'mcp__plugin_mneme_memory__workflow_step, Read',
    expect: 'dev: allowed-tools carries no exact token «mcp__plugin_mneme_memory__map_list»',
  },
  {
    label: 'map: the grant loses diary_facts',
    file: map,
    find: 'mcp__plugin_mneme_memory__map_list, mcp__plugin_mneme_memory__diary_facts, ',
    replace: 'mcp__plugin_mneme_memory__map_list, ',
    expect: 'map: allowed-tools lacks mcp__plugin_mneme_memory__diary_facts',
  },
  {
    label: 'prompt: the route table composes map run',
    file: prompt,
    find: '**The project map** → `/mneme:map`',
    replace: '**The project map** → `/mneme:map run <run_id>`',
    expect: 'prompt: ROUTE-TABLE composes «/mneme:map run <run_id>»',
  },
];
