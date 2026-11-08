export const guard = ['node', 'scripts/check-readme.mjs'];

export const mutations = [
  {
    label: 'the README loses the judge key',
    file: 'README.md',
    find: 'MNEME_JUDGE_API_KEY',
    replace: 'MNEME_JUDGE_KEY',
    all: true,
    expect: 'README.md: missing "MNEME_JUDGE_API_KEY"',
  },
];
