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

const untrackedListing = 'git ls-files --others --exclude-standard';
const mapHandoffDiffSteps = /^3\. map's own diff rule/m;
const commitFirst = /^COMMIT-FIRST\b/m;
const commitWait = /^COMMIT-WAIT\b/m;

const commitFirstAnchorBreak = (anchor, find, replace) => ({
  label: `dev: COMMIT-FIRST drops «${anchor}»`,
  file: dev,
  within: commitFirst,
  find,
  replace,
  expect: `dev: COMMIT-FIRST does not say «${anchor}»`,
});

const mapStepOneAnchorBreak = (anchor, find, replace) => ({
  label: `map: Step 1 drops «${anchor}»`,
  file: map,
  find,
  replace,
  all: true,
  expect: `map: Step 1 does not say «${anchor}»`,
});

const commitWaitAnchorBreak = (anchor, find, replace) => ({
  label: `map: COMMIT-WAIT drops «${anchor}»`,
  file: map,
  within: commitWait,
  find,
  replace,
  expect: `map: COMMIT-WAIT does not say «${anchor}»`,
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
    'git diff --name-only <commit>',
    '`git diff --name-only <commit>` — that commit',
    '`git diff --name-only` — that commit',
  ),
  { ...mapHandoffAnchorBreak(untrackedListing, untrackedListing, 'git ls-files --others'), within: mapHandoffDiffSteps },
  { ...mapHandoffAnchorBreak('git diff --name-only HEAD', 'git diff --name-only HEAD', 'git status'), within: mapHandoffDiffSteps },
  { ...mapHandoffAnchorBreak('(не закоммичен)', '(не закоммичен)', '(изменён)'), all: true },
  { ...mapHandoffAnchorBreak('(новый)', '(новый)', '(добавлен)'), all: true },
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
  {
    label: 'dev: the COMMIT-FIRST paragraph loses its name',
    file: dev,
    find: 'COMMIT-FIRST — the engine stamps',
    replace: 'COMMIT FIRST — the engine stamps',
    expect: 'dev: no COMMIT-FIRST paragraph in MAP-HANDOFF',
  },
  commitFirstAnchorBreak('stamps a map section with the project HEAD', 'stamps a map section with the project HEAD', 'stamps a map section'),
  commitFirstAnchorBreak('коммит-блок', 'closes with the коммит-блок', 'closes with the commit menu'),
  commitFirstAnchorBreak('one DECISION per message', 'one DECISION per message', 'a menu at a time'),
  commitFirstAnchorBreak('`3 — сам`', 'через `3 — сам`', 'через ручной коммит'),
  commitFirstAnchorBreak('base_commit', 'не пишет base_commit', 'не пишет базу'),
  {
    label: 'dev: HANDOFF-DECISION stops naming COMMIT-FIRST',
    file: dev,
    within: /^- HANDOFF-DECISION\b/m,
    find: "after COMMIT-FIRST's",
    replace: 'after the',
    expect: 'dev: HANDOFF-DECISION does not name COMMIT-FIRST',
  },
  mapStepOneAnchorBreak('git diff --name-only <commit>', 'git diff --name-only <commit>', 'git diff --name-only'),
  mapStepOneAnchorBreak(untrackedListing, untrackedListing, 'git ls-files --others'),
  mapStepOneAnchorBreak('`uncommitted_files`', '`uncommitted_files`', '`pending_files`'),
  {
    label: 'dev: MAP-HANDOFF goes back to <commit>..HEAD',
    file: dev,
    find: '`git diff --name-only <commit>` — that commit against the working tree',
    replace: '`git diff --name-only <commit>..HEAD` — that commit against the working tree',
    expect: 'dev: «<commit>..HEAD» still stands',
  },
  {
    label: 'map: Step 1 goes back to <commit>..HEAD',
    file: map,
    find: '`git diff --name-only <commit>` — that commit against the working',
    replace: '`git diff --name-only <commit>..HEAD` — that commit against the working',
    expect: 'map: «<commit>..HEAD» still stands',
  },
  {
    label: 'dev: Permissions drop the untracked listing',
    file: dev,
    within: /^- Edit \/ Write \/ Bash \/ Grep:/m,
    find: untrackedListing,
    replace: 'git ls-files',
    expect: `dev: Permissions do not grant «${untrackedListing}»`,
  },
  {
    label: 'map: Permissions drop the untracked listing',
    file: map,
    within: /^- Bash: /m,
    find: untrackedListing,
    replace: 'git ls-files',
    expect: `map: Permissions do not grant «${untrackedListing}»`,
  },
  {
    label: 'map: the COMMIT-WAIT paragraph loses its name',
    file: map,
    find: 'COMMIT-WAIT — in UPDATE mode',
    replace: 'COMMIT WAIT — in UPDATE mode',
    expect: 'map: no COMMIT-WAIT paragraph',
  },
  commitWaitAnchorBreak('reads the files from disk', 'reads the files from disk', 'reads the cluster'),
  commitWaitAnchorBreak('stamps the section with the project HEAD', 'stamps the section with the project', 'stamps the section with the'),
  commitWaitAnchorBreak('no spawn', 'gets no spawn and', 'gets a spawn and'),
  commitWaitAnchorBreak('ждёт коммита', 'ждёт коммита', 'отложен'),
  {
    label: 'map: the finale template stops counting the waiting clusters',
    file: map,
    find: ' · ждёт коммита <W>',
    replace: '',
    expect: 'map: the finale template does not count «ждёт коммита <W>»',
  },
  {
    label: 'map: the COMMIT-WAIT bullet in Rules loses its name',
    file: map,
    find: '- COMMIT-WAIT — a cluster',
    replace: '- COMMIT WAIT — a cluster',
    expect: 'map: no `- COMMIT-WAIT` bullet in Rules',
  },
];
