export const guard = ['node', 'scripts/check-map.mjs'];

export const mutations = [
  {
    label: 'map: Step 0 opens with the overview instead of the anchors call',
    file: 'plugin/skills/map/SKILL.md',
    find: '`mcp__plugin_mneme_memory__map_list { anchors: true }` FIRST',
    replace: '`mcp__plugin_mneme_memory__map_list {}` FIRST',
    expect: 'map: the first step is not map_list { anchors: true }',
  },
];
