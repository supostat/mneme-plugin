const releaseSync = '.github/workflows/release-sync.yml';
const payloadStep = `run: printf '%s' "$PAYLOAD"`;
const pushToMain = 'git push origin main';

export const guard = ['node', 'scripts/check-workflows.mjs'];

export const mutations = [
  {
    label: 'the sync is no longer dispatch-triggered',
    file: releaseSync,
    find: 'repository_dispatch:',
    replace: 'workflow_dispatch:',
    expect: 'missing "repository_dispatch"',
  },
  {
    label: 'the dispatch type filter loses engine-release',
    file: releaseSync,
    find: 'engine-release',
    replace: 'engine-publish',
    all: true,
    expect: 'missing "engine-release"',
  },
  {
    label: 'the integrity guard step is gone',
    file: releaseSync,
    find: 'check-release-integrity.mjs',
    replace: 'check-release-assets.mjs',
    expect: 'missing "check-release-integrity.mjs"',
  },
  {
    label: 'the pin generation steps are gone',
    file: releaseSync,
    find: 'generate-release-pin.mjs',
    replace: 'write-release-pin.mjs',
    all: true,
    expect: 'missing "generate-release-pin.mjs"',
  },
  {
    label: 'the version bump no longer restamps the pin',
    file: releaseSync,
    find: '--restamp plugin',
    replace: 'plugin',
    expect: 'missing "--restamp"',
  },
  {
    label: 'the bumped version is never committed',
    file: releaseSync,
    find: 'git commit -m',
    replace: 'git stash push -m',
    expect: 'missing "git commit"',
  },
  {
    label: 'a lightweight v* tag comes back before the push',
    file: releaseSync,
    find: pushToMain,
    replace: `git tag "v$plugin_version"\n          ${pushToMain}`,
    expect: 'must not carry "git tag"',
  },
  {
    label: 'the push follows tags again',
    file: releaseSync,
    find: pushToMain,
    replace: `${pushToMain} --follow-tags`,
    expect: 'must not carry "--follow-tags"',
  },
  {
    label: 'the pin is generated before the integrity guard runs',
    file: releaseSync,
    find: payloadStep,
    replace: `run: node scripts/generate-release-pin.mjs --help && printf '%s' "$PAYLOAD"`,
    expect: '"check-release-integrity.mjs" must come BEFORE "generate-release-pin.mjs"',
  },
  {
    label: 'the commit lands before the pin is generated',
    file: releaseSync,
    find: payloadStep,
    replace: `run: git commit --allow-empty -m early && printf '%s' "$PAYLOAD"`,
    expect: '"generate-release-pin.mjs" must come BEFORE "git commit"',
  },
];
