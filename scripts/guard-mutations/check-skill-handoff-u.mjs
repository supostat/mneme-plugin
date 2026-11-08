const dev = 'plugin/skills/dev/SKILL.md';
const diary = 'plugin/skills/diary/SKILL.md';
const plan = 'plugin/skills/plan/SKILL.md';
const fix = 'plugin/skills/fix/SKILL.md';
const setup = 'plugin/skills/setup/SKILL.md';
const judgeSupersede = /^- JUDGE-SUPERSEDE\b/m;
const setupAdoptArgument = /^`\/mneme:setup adopt/m;

const cardFormBreak = (skill, file, find, replace) => ({
  label: `${skill}: the card form «${find}» is no longer quoted`,
  file,
  find,
  replace,
  all: true,
  expect: `${skill}: judge literal «${find}» missing`,
});

const judgeSupersedeBulletRename = (skill, file, section) => ({
  label: `${skill}: the JUDGE-SUPERSEDE bullet loses its name`,
  file,
  within: judgeSupersede,
  find: '- JUDGE-SUPERSEDE —',
  replace: '- JUDGE SUPERSEDE —',
  expect: `${skill}: no JUDGE-SUPERSEDE bullet in ${section}`,
});

const judgeSupersedeAnchorBreak = (skill, file, find, replace) => ({
  label: `${skill}: JUDGE-SUPERSEDE drops «${find}»`,
  file,
  within: judgeSupersede,
  find,
  replace,
  expect: `${skill}: JUDGE-SUPERSEDE does not say «${find}»`,
});

const judgeChipStampBreak = (skill, file, find, replace) => ({
  label: `${skill}: MENU-CONTEXT stops stamping «${find}»`,
  file,
  find,
  replace,
  expect: `${skill}: MENU-CONTEXT does not stamp the judge chip («${find}» missing)`,
});

const setupAnchorBreak = (section, find, replace) => ({
  label: `setup: ${section} drops «${find}»`,
  file: setup,
  find,
  replace,
  expect: `setup: ${section} does not say «${find}»`,
});

export const guard = ['node', 'scripts/check-skill-handoff.mjs'];

export const mutations = [
  cardFormBreak('dev', dev, 'recommends supersede of', 'recommends superseding'),
  cardFormBreak('plan', plan, 'supersede not recommended', 'supersede not advised'),
  cardFormBreak('fix', fix, 'judge: unavailable', 'judge: offline'),
  cardFormBreak('setup', setup, 'judge flags ', 'judge marks '),
  judgeSupersedeBulletRename('dev', dev, 'BOUNDARY-CURATION'),
  judgeSupersedeBulletRename('diary', diary, 'the Curation contract'),
  judgeSupersedeAnchorBreak('dev', dev, 'adds a fifth chip to that note', 'adds a fifth option to that note'),
  judgeSupersedeAnchorBreak('diary', diary, 'give no supersede recommendation', 'give a weaker supersede recommendation'),
  judgeSupersedeAnchorBreak('dev', dev, 'read both bodies', 'read the staged body'),
  judgeSupersedeAnchorBreak('diary', diary, 'the chip `5` stays', 'the chip `5` disappears'),
  judgeSupersedeAnchorBreak('dev', dev, 'never supersedes', 'may supersede'),
  judgeSupersedeAnchorBreak('diary', diary, 'goes to `2 — поштучный разбор`', 'stays on `1 — прими все`'),
  judgeSupersedeAnchorBreak('plan', plan, 'adds a fourth chip', 'adds a fourth option'),
  judgeSupersedeAnchorBreak('fix', fix, 'read both bodies', 'read the staged body'),
  judgeSupersedeBulletRename('plan', plan, 'the Curation contract'),
  judgeSupersedeBulletRename('fix', fix, 'the Контракт курирования'),
  judgeChipStampBreak('dev', dev, '{curation, 5,', '{curation, 6,'),
  judgeChipStampBreak('diary', diary, '1|2|5', '1|2'),
  judgeChipStampBreak('plan', plan, 'options_n: 4', 'options_n: 3'),
  judgeChipStampBreak('fix', fix, '1|2|4', '1|2'),
  setupAnchorBreak(
    'Step 3',
    'sends the body of every staged note and of its nearest neighbour to the provider',
    'sends a hash of every staged note to the provider',
  ),
  setupAnchorBreak('Step 3', 'the engine refuses `judge.api_key`', 'the engine accepts `judge.api_key`'),
  setupAnchorBreak('Step 3', 'never asks for the key value', 'asks for the key value once'),
  setupAnchorBreak('ADOPT', 'retires nothing on its own', 'retires them on its own'),
  {
    label: 'setup: the note_retire paragraph pairs the request with a menu',
    file: setup,
    find: 'rides WITHOUT menu',
    replace: 'rides with its menu',
    expect: 'setup: a paragraph pairs menu with retag/retire/reanchor without the prohibition',
  },
  {
    label: 'diary: the grant loses notes_list',
    file: diary,
    find: 'mcp__plugin_mneme_memory__staging_resolve, mcp__plugin_mneme_memory__notes_list]',
    replace: 'mcp__plugin_mneme_memory__staging_resolve]',
    expect: 'diary: allowed-tools lacks mcp__plugin_mneme_memory__notes_list',
  },
  {
    label: 'setup: the grant loses corpus_adopt',
    file: setup,
    find: 'mcp__plugin_mneme_memory__notes_list, mcp__plugin_mneme_memory__corpus_adopt, ',
    replace: 'mcp__plugin_mneme_memory__notes_list, ',
    expect: 'setup: allowed-tools carries no exact token «mcp__plugin_mneme_memory__corpus_adopt»',
  },
  {
    label: 'setup: Arguments loses the adopt form the route table hands over',
    file: setup,
    within: setupAdoptArgument,
    find: '`/mneme:setup adopt <source_corpus_dir>`',
    replace: '`adopt <source_corpus_dir>`',
    expect: 'prompt: ROUTE-TABLE template «/mneme:setup adopt <source_corpus_dir>» takes the keyword «adopt», but /mneme:setup takes no argument',
  },
];
