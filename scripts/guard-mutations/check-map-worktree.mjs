// The working-tree rules of project-graph against the dirty repository of check-map (b2): one
// mutation per rule. The ignored file holds by construction — an ignored file is never a node of
// the graph, so no cluster can report it — and the real repository's case depends on the live
// tree, so neither has a mutation.

const graph = 'plugin/scripts/project-graph.mjs';
const sinceStamp = ': filesChangedSince(root, options.since, untracked);';
const diffAgainstWorkingTree = "['diff', '--name-only', '-z', '--relative', commit, '--']";
const diffRefused =
  '    fail(EXIT_USAGE, `project-graph: cannot diff ${commit} against the working tree in ${root} (${gitErrorText(error)})`);';

export const guard = ['node', 'scripts/check-map.mjs'];

export const mutations = [
  {
    label: '--since diffs from HEAD instead of the stamp',
    file: graph,
    find: sinceStamp,
    replace: ": filesChangedSince(root, 'HEAD', untracked);",
    expect: 'since-worktree: app/models/invoice.rb (committed in the later commit) missing from changed_files of billing',
  },
  {
    label: '--since diffs from the commit before the stamp',
    file: graph,
    find: sinceStamp,
    replace: ': filesChangedSince(root, `${options.since}~1`, untracked);',
    expect: 'since-after-stamp: app/models/invoice.rb (committed in the later commit) wrongly in changed_files of billing',
  },
  {
    label: 'the diff reads the index only, an unstaged edit drops out',
    file: graph,
    find: diffAgainstWorkingTree,
    replace: "['diff', '--cached', '--name-only', '-z', '--relative', commit, '--']",
    expect: 'since-worktree: app/services/billing/ledger.rb (unstaged edit) missing from changed_files of billing',
  },
  {
    label: 'the diff goes back to <commit>..HEAD, a staged edit drops out',
    file: graph,
    find: diffAgainstWorkingTree,
    replace: "['diff', '--name-only', '-z', '--relative', `${commit}..HEAD`, '--']",
    expect: 'since-worktree: app/models/user.rb (staged edit) missing from changed_files of access',
  },
  {
    label: 'untracked files drop out of the changed set',
    file: graph,
    find: 'return new Set([...splitNul(output), ...untracked]);',
    replace: 'return new Set(splitNul(output));',
    expect: 'since-worktree: app/services/billing/refund.rb (untracked file) missing from changed_files of billing',
  },
  {
    label: 'a deleted file is read as a node',
    file: graph,
    find: 'languageOf(file) !== null && existsSync(resolve(root, file))',
    replace: 'languageOf(file) !== null',
    expect: 'since-worktree: exit 1, expected 0',
  },
  {
    label: 'the uncommitted set is the changed set',
    file: graph,
    find: "  return { changed, uncommitted: filesChangedSince(root, 'HEAD', untracked) };",
    replace: '  return { changed, uncommitted: changed };',
    expect: 'since-worktree: app/models/invoice.rb (committed in the later commit) wrongly in uncommitted_files of billing',
  },
  {
    label: 'uncommitted_files is narrowed to changed_files',
    file: graph,
    find: 'uncommitted_files: cluster.files.filter((file) => scope.uncommitted.has(file)),',
    replace: 'uncommitted_files: cluster.files.filter((file) => scope.changed.has(file) && scope.uncommitted.has(file)),',
    expect: 'changed-worktree: app/services/billing/ledger.rb (unstaged edit) missing from uncommitted_files of billing',
  },
  {
    label: 'a primary graph is narrowed too',
    file: graph,
    find: 'if (options.changed === null && options.since === null) return null;',
    replace:
      'if (options.changed === null && options.since === null) return { changed: new Set(listVisibleFiles(root)), uncommitted: new Set() };',
    expect: 'primary-worktree: cluster access carries changed_files',
  },
  {
    label: 'an unknown --since commit is swallowed',
    file: graph,
    find: diffRefused,
    replace: "    output = '';",
    expect: 'since-bad-commit: exit 0, expected 2',
  },
  {
    label: 'a repository without HEAD is swallowed',
    file: graph,
    find: diffRefused,
    replace: "    output = '';",
    expect: 'headless-changed: exit 0, expected 2',
  },
];
