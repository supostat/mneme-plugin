const plan = 'plugin/skills/plan/SKILL.md';
const headLintRun = /^\*\*HEAD-LINT-RUN\b/m;
const bashPermission = /^- Edit files \/ Bash \/ any code change/m;

const headLintRunAnchorBreak = (anchor, find, replace) => ({
  label: `plan: HEAD-LINT-RUN drops «${anchor}»`,
  file: plan,
  within: headLintRun,
  find,
  replace,
  expect: `plan: HEAD-LINT-RUN does not say «${anchor}»`,
});

export const guard = ['node', 'scripts/check-skill-handoff.mjs'];

export const mutations = [
  {
    label: 'plan: the HEAD-LINT-RUN definition loses its name',
    file: plan,
    find: '**HEAD-LINT-RUN — a lint criterion',
    replace: '**HEAD LINT RUN — a lint criterion',
    expect: 'plan: no **HEAD-LINT-RUN definition at a line start in Step 6',
  },
  headLintRunAnchorBreak('carry no problems', 'carry no problems, by their text alone', 'carry no warnings, by their text alone'),
  headLintRunAnchorBreak('red at HEAD by design', 'are red at HEAD by design', 'are red at HEAD sometimes'),
  headLintRunAnchorBreak('never run here', 'are never run here', 'are run here too'),
  headLintRunAnchorBreak(
    'exactly as the gate will run it',
    'takes the command exactly as the gate will run it',
    'takes the command as it sees fit',
  ),
  headLintRunAnchorBreak('clean in the working tree', 'are clean in the working tree', 'are tracked in the working tree'),
  headLintRunAnchorBreak('no flag that rewrites files', 'carries no flag that rewrites files', 'carries any flag it needs'),
  headLintRunAnchorBreak('is taken before and after', 'is taken before and after', 'is taken once'),
  headLintRunAnchorBreak('stops the skill', 'stops the skill with a', 'is noted with a'),
  headLintRunAnchorBreak('leaves the criterion', 'does not change leaves the', 'does not change stays in the'),
  headLintRunAnchorBreak('исправить старые замечания', '«исправить старые замечания в <файл>»', '«почистить файл <файл>»'),
  headLintRunAnchorBreak('не проверено на HEAD', '«не проверено на HEAD: <причина>»', '«пропущено: <причина>»'),
  headLintRunAnchorBreak('never counted green', 'is never counted green', 'is counted green'),
  {
    label: 'plan: Permissions stops naming the HEAD-LINT-RUN',
    file: plan,
    within: bashPermission,
    find: '(3) the HEAD-LINT-RUN of',
    replace: '(3) the head lint run of',
    expect: 'plan: Permissions grants no Bash carve-out for the HEAD-LINT-RUN',
  },
  {
    label: 'plan: Permissions loses the THREE carve-outs count',
    file: plan,
    find: 'THREE carve-outs',
    replace: 'Three exceptions',
    expect: 'plan: Permissions lost «THREE carve-outs»',
  },
  {
    label: 'plan: Permissions falls back to TWO carve-outs',
    file: plan,
    find: 'THREE carve-outs',
    replace: 'TWO carve-outs',
    expect: 'plan: Permissions still counts «TWO carve-outs»',
  },
  {
    label: 'plan: the third carve-out loses its write ban',
    file: plan,
    within: bashPermission,
    find: 'rewrites files and the working tree',
    replace: 'keeps files and the working tree',
    expect: 'plan: Permissions lost «no flag that rewrites files»',
  },
  {
    label: 'plan: the review drops its HEAD-LINT-RUN line',
    file: plan,
    find: 'one HEAD-LINT-RUN line',
    replace: 'one lint line',
    expect: 'plan: SPEC-REVIEW-MENU carries no HEAD-LINT-RUN line',
  },
  {
    label: 'plan: the HEAD-LINT-RUN bullet in Rules loses its name',
    file: plan,
    find: '- HEAD-LINT-RUN — before the menu',
    replace: '- HEAD LINT RUN — before the menu',
    expect: 'plan: no `- HEAD-LINT-RUN` bullet in Rules',
  },
];
