const dev = 'plugin/skills/dev/SKILL.md';
const map = 'plugin/skills/map/SKILL.md';
const plan = 'plugin/skills/plan/SKILL.md';
const anchorListNorm = /^ANCHOR-LIST —/m;
const domainsPick = /^4\. DOMAINS-PICK\b/m;

const replicaBreak = (skill, file, area, anchor, find, replace, within) => ({
  label: `${skill}: ${area} drops «${anchor}»`,
  file,
  within,
  find,
  replace,
  expect: `${skill}: ${area} does not say «${anchor}»`,
});

export const guard = ['node', 'scripts/check-skill-handoff.mjs'];

export const mutations = [
  {
    label: 'dev: MAP-HANDOFF step 1 loses the anchors call',
    file: dev,
    find: '1. `map_list { anchors: true }` — the finale',
    replace: '1. `map_list` — the finale',
    expect: 'dev: MAP-HANDOFF does not call «map_list { anchors: true }»',
  },
  {
    label: 'dev: MAP-HANDOFF step 1 calls the overview first',
    file: dev,
    find: '1. `map_list { anchors: true }` — the finale',
    replace: '1. `map_list {}`, then `map_list { anchors: true }` — the finale',
    expect: 'dev: MAP-HANDOFF still calls «map_list {}»',
  },
  {
    label: 'dev: MAP-HANDOFF step 2 reads every section whole',
    file: dev,
    find: '2. Otherwise every line is',
    replace: '2. Otherwise `map_list { id }` for every listed section, and every line is',
    expect: 'dev: MAP-HANDOFF still calls «map_list { id }»',
  },
  replicaBreak('dev', dev, "MAP-HANDOFF's ANCHOR-LIST replica", 'never split', 'so the list is never split;', 'so the list is split at each `, `;'),
  replicaBreak('dev', dev, "MAP-HANDOFF's ANCHOR-LIST replica", 'whole element', 'as a whole element', 'as a prefix'),
  replicaBreak('dev', dev, "MAP-HANDOFF's ANCHOR-LIST replica", 'never a miss', 'the reading is never a miss', 'the reading may miss'),
  {
    label: 'dev: the map_list permission falls back to the overview',
    file: dev,
    find: '`{ anchors: true }`, once: every section',
    replace: '`{}` once: every section',
    expect: 'dev: the map_list permission does not name «{ anchors: true }»',
  },
  {
    label: 'dev: the map_list permission grants the whole read again',
    file: dev,
    find: '`{ anchors: true }`, once: every section',
    replace: '`{ anchors: true }`, then `{ id }` per listed section: every section',
    expect: 'dev: the map_list permission still grants «{ id }»',
  },
  {
    label: 'map: the map_list permission loses the anchors call',
    file: map,
    find: 'YES — `{ anchors: true }` at Step 0',
    replace: 'YES — `{}` at Step 0',
    expect: 'map: the map_list permission does not name «{ anchors: true }»',
  },
  {
    label: 'map: Step 0 reads every section whole again',
    file: map,
    find: 'No body is read at this step:',
    replace: 'Read EVERY section whole with `map_list { id }`; no other body is read at this step:',
    expect: 'map: Step 0 still calls «map_list { id }»',
  },
  {
    label: 'map: COVERED-SKIP stops reading the re-described section',
    file: map,
    find: 'then `map_list { id }` reads',
    replace: 'then the stored section is read',
    expect: 'map: COVERED-SKIP does not read the section with «map_list { id }»',
  },
  {
    label: 'map: the merge chip stops reading the stored neighbour',
    file: map,
    find: 'come from `map_list { id }`,',
    replace: 'come from the stored section,',
    expect: 'map: the merge chip does not read the section with «map_list { id }»',
  },
  {
    label: 'map: the ANCHOR-LIST paragraph loses its name',
    file: map,
    find: 'ANCHOR-LIST — the engine joins',
    replace: 'ANCHOR LIST — the engine joins',
    expect: 'map: no ANCHOR-LIST paragraph at a line start in Step 0',
  },
  replicaBreak('map', map, 'ANCHOR-LIST', 'never split', 'the list is never split.', 'the list is split at each `, `.', anchorListNorm),
  replicaBreak('map', map, 'ANCHOR-LIST', 'whole element', 'as a whole element:', 'as a prefix:', anchorListNorm),
  replicaBreak('map', map, 'ANCHOR-LIST', 'never a miss', 'the reading is never a miss;', 'the reading may miss;', anchorListNorm),
  {
    label: 'map: the ANCHOR-LIST bullet in Rules loses its name',
    file: map,
    find: '- ANCHOR-LIST — the anchors of a',
    replace: '- ANCHOR LIST — the anchors of a',
    expect: 'map: no `- ANCHOR-LIST` bullet in Rules',
  },
  {
    label: 'plan: DOMAINS-PICK loses the anchors call',
    file: plan,
    find: 'one `map_list { anchors: true }` gives every',
    replace: 'one `map_list` gives every',
    expect: 'plan: DOMAINS-PICK does not call «map_list { anchors: true }»',
  },
  {
    label: 'plan: DOMAINS-PICK reads the candidates whole again',
    file: plan,
    find: "names the task's area; one",
    replace: "names the task's area; read ONLY the candidates whole (`map_list { id }`); one",
    expect: 'plan: DOMAINS-PICK still calls «map_list { id }»',
  },
  replicaBreak('plan', plan, "DOMAINS-PICK's ANCHOR-LIST replica", 'never split', 'so the list is never split;', 'so the list is split at each `, `;', domainsPick),
  replicaBreak('plan', plan, "DOMAINS-PICK's ANCHOR-LIST replica", 'whole element', 'as a whole element', 'as a prefix', domainsPick),
  replicaBreak('plan', plan, "DOMAINS-PICK's ANCHOR-LIST replica", 'never a miss', 'the pick is never a miss', 'the pick may miss', domainsPick),
  {
    label: 'plan: the map_list permission loses the anchors call',
    file: plan,
    find: '`{ anchors: true }` once for the anchors DOMAINS-PICK checks',
    replace: '`{}` again for the anchors DOMAINS-PICK checks',
    expect: 'plan: the map_list permission does not name «{ anchors: true }»',
  },
  {
    label: 'plan: the map_list permission grants the whole read again',
    file: plan,
    find: '`{ anchors: true }` once for the anchors DOMAINS-PICK checks',
    replace: '`{ anchors: true }` once for the anchors DOMAINS-PICK checks, `{ id }` for the candidate domains',
    expect: 'plan: the map_list permission still grants «{ id }»',
  },
  {
    label: 'plan: the DOMAINS rule loses the anchors call',
    file: plan,
    find: 'then `{ anchors: true }` once, no body',
    replace: 'then `{}` once, no body',
    expect: 'plan: the DOMAINS rule does not name «{ anchors: true }»',
  },
  {
    label: 'plan: the DOMAINS rule reads the candidates whole again',
    file: plan,
    find: 'then `{ anchors: true }` once, no body',
    replace: 'then `{ anchors: true }` once, then `{ id }` for candidates only',
    expect: 'plan: the DOMAINS rule still names «{ id }»',
  },
];
