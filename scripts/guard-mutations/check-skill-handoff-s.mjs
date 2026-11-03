// Check (s) of check-skill-handoff: plan's evidence rules, one mutation per rule of the check.
// The anchors «one to one», «не проверено», «never a reason to reject» and «Проверка довода» also
// stand in Rules and in the fan template, so the paragraph mutations carry `within` — removing an
// anchor from its rule must go red although its twin remains elsewhere.

const plan = 'plugin/skills/plan/SKILL.md';
const selfTestCasesRule = /^\*\*SELF-TEST-CASES-RULE\b/m;
const sufficiencyRunRule = /^\*\*SUFFICIENCY-RUN-RULE\b/m;
const optionTemplate = /^### Option A: <name>$/m;
const decisionNoteBody = /^- \*\*body\*\* — the fork distilled/m;
const permissionsGrants = /^- Edit files \/ Bash \/ any code change/m;

export const guard = ['node', 'scripts/check-skill-handoff.mjs'];

export const mutations = [
  {
    label: 'SELF-TEST-CASES-RULE is defined mid-line',
    file: plan,
    find: '**SELF-TEST-CASES-RULE — the self-test',
    replace: 'See **SELF-TEST-CASES-RULE — the self-test',
    expect: 'no **SELF-TEST-CASES-RULE definition at a line start',
  },
  {
    label: '«one to one» leaves SELF-TEST-CASES-RULE (its twin stays in Rules)',
    file: plan,
    within: selfTestCasesRule,
    find: 'one to one',
    replace: 'one by one',
    expect: 'SELF-TEST-CASES-RULE does not say «one to one»',
  },
  {
    label: '«without a case» leaves SELF-TEST-CASES-RULE',
    file: plan,
    within: selfTestCasesRule,
    find: 'without a case',
    replace: 'with few cases',
    expect: 'SELF-TEST-CASES-RULE does not say «without a case»',
  },
  {
    label: 'Step 6 stops comparing the lists of SELF-TEST-CASES-RULE',
    file: plan,
    find: 'compare the two Knowledge lists of SELF-TEST-CASES-RULE',
    replace: 'compare the two Knowledge lists',
    expect: 'Step 6 does not compare the two lists of SELF-TEST-CASES-RULE',
  },
  {
    label: 'SUFFICIENCY-RUN-RULE is defined mid-line',
    file: plan,
    find: '**SUFFICIENCY-RUN-RULE — a sufficiency claim',
    replace: 'See **SUFFICIENCY-RUN-RULE — a sufficiency claim',
    expect: 'no **SUFFICIENCY-RUN-RULE definition at a line start in Step 3',
  },
  {
    label: 'SUFFICIENCY-RUN-RULE falls out of Step 3 behind a new heading',
    file: plan,
    find: '**SUFFICIENCY-RUN-RULE — a sufficiency claim',
    replace: '### Step 3a: sufficiency\n\n**SUFFICIENCY-RUN-RULE — a sufficiency claim',
    expect: 'no **SUFFICIENCY-RUN-RULE definition at a line start in Step 3',
  },
  {
    label: '«не проверено» leaves SUFFICIENCY-RUN-RULE (its twins stay in the template, the note and Rules)',
    file: plan,
    within: sufficiencyRunRule,
    find: '«не проверено»',
    replace: '«не доказано»',
    expect: 'SUFFICIENCY-RUN-RULE does not say «не проверено»',
  },
  {
    label: '«never a reason to reject» leaves SUFFICIENCY-RUN-RULE (its twin stays in Rules)',
    file: plan,
    within: sufficiencyRunRule,
    find: 'never a reason to reject',
    replace: 'a weak reason to reject',
    expect: 'SUFFICIENCY-RUN-RULE does not say «never a reason to reject»',
  },
  {
    label: 'the fan template drops the «Проверка довода» field (its twin stays in the rule)',
    file: plan,
    within: optionTemplate,
    find: 'Проверка довода',
    replace: 'Довод',
    expect: 'the fan template\'s option carries no «Проверка довода» field',
  },
  {
    label: 'the choice decision note drops the «не проверено» mark',
    file: plan,
    within: decisionNoteBody,
    find: '«не проверено»',
    replace: '«сомнительно»',
    expect: 'the choice decision note does not keep the «не проверено» mark',
  },
  {
    label: 'Permissions stops naming the SUFFICIENCY-RUN-RULE run',
    file: plan,
    within: permissionsGrants,
    find: 'SUFFICIENCY-RUN-RULE',
    replace: 'sufficiency',
    expect: 'Permissions grants no Bash carve-out for the SUFFICIENCY-RUN-RULE run',
  },
  {
    label: 'Permissions no longer closes the rest of Bash',
    file: plan,
    find: 'any other Bash stays FORBIDDEN',
    replace: 'other Bash is discouraged',
    expect: 'Permissions lost «any other Bash stays FORBIDDEN»',
  },
  {
    label: 'Permissions counts one carve-out again',
    file: plan,
    find: 'TWO carve-outs',
    replace: 'ONE carve-out',
    expect: 'Permissions still counts «ONE carve-out»',
  },
];
