// Check (t) of check-skill-handoff: dev's harvest evidence rules and the check before an accept
// recommendation in the dev and diary curations, one mutation per rule of the check. The anchors
// «states only what THIS phase observed» and «exactly one mutation» also stand in the HARVEST
// EVIDENCE line of Rules, and VERIFY-BEFORE-ACCEPT stands in two skills, so the paragraph
// mutations carry `within` — breaking an anchor in its rule must go red although its twin remains
// elsewhere. Anchors that wrap in the skill text are broken by a fragment that stands on one line.

const dev = 'plugin/skills/dev/SKILL.md';
const diary = 'plugin/skills/diary/SKILL.md';
const observedClaims = /^- OBSERVED-CLAIMS\b/m;
const oneMutation = /^- ONE-MUTATION-PER-RUN\b/m;
const harvestEvidence = /^- HARVEST EVIDENCE\b/m;
const verifyBeforeAccept = /^- VERIFY-BEFORE-ACCEPT\b/m;
const devBoundaryCurationRule = /^- SOFT-NONSTOP\b/m;
const diaryReadGrant = /^- Read \/ Grep: ONLY\b/m;
const diaryFinaleRule = /^- FINALE = HANDOFF-DECISION\b/m;

const verifyBeforeAcceptAnchorBreaks = (skill, file) => [
  {
    label: `${skill}: VERIFY-BEFORE-ACCEPT stops reading every cited line`,
    file,
    within: verifyBeforeAccept,
    find: 'every `file:line` the queued notes cite',
    replace: 'every `file:line` the queued notes mention',
    expect: `${skill}: VERIFY-BEFORE-ACCEPT does not say «Read every \`file:line\` the queued notes cite»`,
  },
  {
    label: `${skill}: a refuted claim no longer moves the recommendation off accept`,
    file,
    within: verifyBeforeAccept,
    find: 'moves the recommendation off accept',
    replace: 'keeps the recommendation on accept',
    expect: `${skill}: VERIFY-BEFORE-ACCEPT does not say «moves the recommendation off accept»`,
  },
  {
    label: `${skill}: an unquoted command output counts as verified`,
    file,
    within: verifyBeforeAccept,
    find: 'counts as verified only when the note quotes that output',
    replace: 'counts as verified when the note mentions that output',
    expect: `${skill}: VERIFY-BEFORE-ACCEPT does not say «counts as verified only when the note quotes that output»`,
  },
];

export const guard = ['node', 'scripts/check-skill-handoff.mjs'];

export const mutations = [
  {
    label: 'OBSERVED-CLAIMS loses its bullet name',
    file: dev,
    find: '- OBSERVED-CLAIMS —',
    replace: '- OBSERVED CLAIMS —',
    expect: 'dev: no OBSERVED-CLAIMS bullet in the harvest branch',
  },
  {
    label: 'the harvest rules fall out of the harvest branch behind a new heading',
    file: dev,
    find: '- OBSERVED-CLAIMS —',
    replace: '### Harvest claims\n\n- OBSERVED-CLAIMS —',
    expect: 'dev: no OBSERVED-CLAIMS bullet in the harvest branch',
  },
  {
    label: '«states only what THIS phase observed» leaves OBSERVED-CLAIMS (its twin stays in Rules)',
    file: dev,
    within: observedClaims,
    find: 'states only what THIS phase observed',
    replace: 'states what THIS phase observed',
    expect: 'dev: OBSERVED-CLAIMS does not say «states only what THIS phase observed»',
  },
  {
    label: 'OBSERVED-CLAIMS stops tying a cited output to a command run in execute_step',
    file: dev,
    within: observedClaims,
    find: 'the output of a command run in',
    replace: 'the output of a command seen in',
    expect: 'dev: OBSERVED-CLAIMS does not say «the output of a command run in»',
  },
  {
    label: 'OBSERVED-CLAIMS lets an unobserved cause into the artifact',
    file: dev,
    within: observedClaims,
    find: 'a cause the phase did not observe stays out of the artifact',
    replace: 'a cause the phase did not observe is marked in the artifact',
    expect: 'dev: OBSERVED-CLAIMS does not say «a cause the phase did not observe stays out of the artifact»',
  },
  {
    label: 'ONE-MUTATION-PER-RUN loses its bullet name',
    file: dev,
    find: '- ONE-MUTATION-PER-RUN —',
    replace: '- ONE MUTATION PER RUN —',
    expect: 'dev: no ONE-MUTATION-PER-RUN bullet in the harvest branch',
  },
  {
    label: '«exactly one mutation» leaves ONE-MUTATION-PER-RUN (its twin stays in Rules)',
    file: dev,
    within: oneMutation,
    find: 'carries exactly one mutation',
    replace: 'carries a mutation',
    expect: 'dev: ONE-MUTATION-PER-RUN does not say «exactly one mutation»',
  },
  {
    label: 'ONE-MUTATION-PER-RUN stops naming the mutation → check pairs',
    file: dev,
    within: oneMutation,
    find: 'which mutation broke which check',
    replace: 'which checks broke',
    expect: 'dev: ONE-MUTATION-PER-RUN does not say «which mutation broke which check»',
  },
  {
    label: 'ONE-MUTATION-PER-RUN lets a two-mutation run prove something',
    file: dev,
    within: oneMutation,
    find: 'with two mutations applied proves neither',
    replace: 'with two mutations applied proves both',
    expect: 'dev: ONE-MUTATION-PER-RUN does not say «A run with two mutations applied proves neither»',
  },
  {
    label: 'the HARVEST EVIDENCE line of Rules loses its name',
    file: dev,
    find: '- HARVEST EVIDENCE —',
    replace: '- HARVEST PROOF —',
    expect: 'dev: no HARVEST EVIDENCE line in Rules',
  },
  {
    label: 'the HARVEST EVIDENCE line stops repeating the OBSERVED-CLAIMS trigger',
    file: dev,
    within: harvestEvidence,
    find: 'states only what THIS phase observed',
    replace: 'states what THIS phase observed',
    expect: 'dev: the HARVEST EVIDENCE rule line does not repeat «states only what THIS phase observed»',
  },
  {
    label: 'the HARVEST EVIDENCE line stops repeating the ONE-MUTATION-PER-RUN trigger',
    file: dev,
    within: harvestEvidence,
    find: 'exactly one mutation',
    replace: 'one mutation',
    expect: 'dev: the HARVEST EVIDENCE rule line does not repeat «exactly one mutation»',
  },
  {
    label: 'dev: VERIFY-BEFORE-ACCEPT loses its bullet name',
    file: dev,
    find: '- VERIFY-BEFORE-ACCEPT —',
    replace: '- VERIFY BEFORE ACCEPT —',
    expect: 'dev: no VERIFY-BEFORE-ACCEPT bullet in BOUNDARY-CURATION',
  },
  {
    label: 'dev: VERIFY-BEFORE-ACCEPT falls out of BOUNDARY-CURATION behind a new heading',
    file: dev,
    find: '- VERIFY-BEFORE-ACCEPT —',
    replace: '### Verification\n\n- VERIFY-BEFORE-ACCEPT —',
    expect: 'dev: no VERIFY-BEFORE-ACCEPT bullet in BOUNDARY-CURATION',
  },
  ...verifyBeforeAcceptAnchorBreaks('dev', dev),
  {
    label: 'diary: VERIFY-BEFORE-ACCEPT loses its bullet name',
    file: diary,
    find: '- VERIFY-BEFORE-ACCEPT —',
    replace: '- VERIFY BEFORE ACCEPT —',
    expect: 'diary: no VERIFY-BEFORE-ACCEPT bullet in the Curation contract',
  },
  ...verifyBeforeAcceptAnchorBreaks('diary', diary),
  {
    label: 'dev: the BOUNDARY-CURATION line of Rules stops naming VERIFY-BEFORE-ACCEPT',
    file: dev,
    within: devBoundaryCurationRule,
    find: 'VERIFY-BEFORE-ACCEPT',
    replace: 'a check',
    expect: 'dev: Rules does not name VERIFY-BEFORE-ACCEPT',
  },
  {
    label: 'diary: Permissions stops granting the Read of VERIFY-BEFORE-ACCEPT',
    file: diary,
    within: diaryReadGrant,
    find: '(VERIFY-BEFORE-ACCEPT)',
    replace: '(the curation check)',
    expect: 'diary: Permissions does not grant the Read of VERIFY-BEFORE-ACCEPT',
  },
  {
    label: 'diary: the FINALE line of Rules stops naming VERIFY-BEFORE-ACCEPT',
    file: diary,
    within: diaryFinaleRule,
    find: 'VERIFY-BEFORE-ACCEPT',
    replace: 'a check',
    expect: 'diary: Rules does not name VERIFY-BEFORE-ACCEPT',
  },
];
