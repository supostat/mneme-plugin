// The Dart rules of project-graph against scripts/fixtures/graph-dart: one mutation per positive rule.
// The negative rules (dart:, foreign packages, missing files, part of by library name) hold by
// construction — an edge is built only to a node of the graph — so no mutation can express them.

const graph = 'plugin/scripts/project-graph.mjs';
const fixtureRed = 'fixture-dart-expect: exit 1';
const packageEntry = 'if (declaredName !== null) packageDirectories.set(declaredName[2], posix.dirname(file));';
const withoutPackage = (name) =>
  `if (declaredName !== null && declaredName[2] !== '${name}') packageDirectories.set(declaredName[2], posix.dirname(file));`;

export const guard = ['node', 'scripts/check-map.mjs'];

export const mutations = [
  {
    label: 'a relative URI resolves to nothing',
    file: graph,
    find: 'return posix.join(posix.dirname(fromFile), uri);',
    replace: 'return null;',
    expect: fixtureRed,
  },
  {
    label: 'the root package shop_app drops out of the pubspec table',
    file: graph,
    find: packageEntry,
    replace: withoutPackage('shop_app'),
    expect: fixtureRed,
  },
  {
    label: 'the workspace member shop_session drops out of the pubspec table',
    file: graph,
    find: packageEntry,
    replace: withoutPackage('shop_session'),
    expect: fixtureRed,
  },
  {
    label: 'the path dependency shop_contract drops out of the pubspec table',
    file: graph,
    find: packageEntry,
    replace: withoutPackage('shop_contract'),
    expect: fixtureRed,
  },
  {
    label: 'a quoted package name is not read',
    file: graph,
    find: String.raw`(['"]?)([A-Za-z_]\w*)\1`,
    replace: String.raw`()([A-Za-z_]\w*)\1`,
    expect: fixtureRed,
  },
  {
    label: 'a trailing comment hides the package name',
    file: graph,
    find: String.raw`[ \t]*(?:#.*)?$/m`,
    replace: String.raw`[ \t]*$/m`,
    expect: fixtureRed,
  },
  {
    label: 'export directives are not read',
    file: graph,
    find: String.raw`(?:import|export|part(?:\s+of)?)`,
    replace: String.raw`(?:import|part(?:\s+of)?)`,
    expect: fixtureRed,
  },
  {
    label: 'part directives are not read (part of still is)',
    file: graph,
    find: String.raw`part(?:\s+of)?`,
    replace: String.raw`part\s+of`,
    expect: fixtureRed,
  },
  {
    label: 'part of directives are not read (part still is)',
    file: graph,
    find: String.raw`part(?:\s+of)?`,
    replace: 'part',
    expect: fixtureRed,
  },
  {
    label: 'a URI in double quotes is not read',
    file: graph,
    find: String.raw`(['"])([^'"]+)\1`,
    replace: String.raw`(['])([^'"]+)\1`,
    expect: fixtureRed,
  },
  {
    label: 'private names become symbols',
    file: graph,
    find: ".filter((name) => !name.startsWith('_'));",
    replace: ".filter((name) => name !== '');",
    expect: fixtureRed,
  },
];
