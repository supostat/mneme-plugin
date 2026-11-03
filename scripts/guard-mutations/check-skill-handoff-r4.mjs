// Check (r4) of check-skill-handoff: plan names both dep-edge title marks inside the
// REAL-DEP-SMOKE-RULE paragraph, and no skill promises a «deps line» or «deps list».
// The SPEC-LINE-SHAPES heading item carries the same mark literals, so the first two mutations
// stay inside the rule's paragraph — removing a mark there must go red although its twin remains.

const plan = 'plugin/skills/plan/SKILL.md';
const realDepSmokeRule = /^\*\*REAL-DEP-SMOKE-RULE\b/m;

export const guard = ['node', 'scripts/check-skill-handoff.mjs'];

export const mutations = [
  {
    label: 'the order-only mark leaves REAL-DEP-SMOKE-RULE (its twin stays in SPEC-LINE-SHAPES)',
    file: plan,
    within: realDepSmokeRule,
    find: '(order-only после фазы',
    replace: '(after phase',
    all: true,
    expect: 'does not name the title mark «(order-only после фазы',
  },
  {
    label: 'the consumption mark leaves REAL-DEP-SMOKE-RULE (its twin stays in SPEC-LINE-SHAPES)',
    file: plan,
    within: realDepSmokeRule,
    find: '(потребляет фазу',
    replace: '(uses phase',
    expect: 'does not name the title mark «(потребляет фазу',
  },
  {
    label: 'WIRE-PHASE-RULE promises a deps list again',
    file: plan,
    find: 'automatically ENDS with a terminal `wire` phase —',
    replace: 'automatically ENDS with a terminal `wire` phase whose deps list the code phases —',
    expect: 'the text promises a «deps list»',
  },
];
