# figura plugin bundle

figura builds technical A4 PDF documents with D2 diagrams for Claude Code. This directory is the
installable bundle; installing it is covered by the repo-root `README.md`.

## Bundle layout

```
figura/
├── .claude-plugin/plugin.json   # manifest: name, version, no MCP servers
├── bin/figura                   # entry: checks for Node.js 22 or newer, then runs the CLI
├── bin/launch.sh                # d2 launcher: dev binary, cache, or the pinned release
├── bin/release.json             # pin of the d2 release the launcher downloads
├── reference/erd-manual.json    # the format of a hand-written schema for figura erd
├── fonts/                       # Inter and JetBrains Mono, each beside its SIL OFL license
├── scripts/browser-locate.mjs   # finds Chromium 131 or newer
├── scripts/build-report.mjs     # the failure report and the build success line
├── scripts/cdp-session.mjs      # CDP client over --remote-debugging-pipe
├── scripts/erd-d2.mjs           # D2 sql_table source of a part of a schema
├── scripts/erd-model.mjs        # schema model with named errors, domains and subsets
├── scripts/erd-source-manual.mjs # reads a hand-written schema JSON
├── scripts/erd-split.mjs        # splits a schema into parts that fit an A4 page
├── scripts/extract-diagrams.mjs # finds every pre.d2 with its layout and figure caption
├── scripts/figura-error.mjs     # the coded error every figura failure line comes from
├── scripts/figura.mjs           # CLI dispatcher
├── scripts/inline-diagrams.mjs  # puts each rendered SVG in place of its pre.d2
├── scripts/layout-checks.mjs    # width, height, overlap and overflow rules on a measured diagram
├── scripts/loopback-server.mjs  # loopback HTTP server the browser loads everything from
├── scripts/measure-diagram.mjs  # opens each SVG in Chromium and collects the boxes of shapes and labels
├── scripts/preflight.mjs        # checks every dependency of a command at once
├── scripts/print-pdf.mjs        # assembles the printable document and prints it to PDF
├── scripts/rasterize-pages.mjs  # writes one PNG preview per page into .figura/<name>/
├── scripts/render-diagram.mjs   # runs d2 with the theme classes, padding and Inter files
├── scripts/theme.mjs            # theme loader: CSS custom properties, D2 classes, page geometry
├── template/document.html       # the source format of a figura document
├── template/print.css           # print styles on the theme's custom properties
└── theme/theme.json             # the one source of colors, fonts, sizes and page geometry
```

## Entry

`bin/figura` is a POSIX sh script, because Node.js is not guaranteed on the user's machine. It
looks for `node`, reads the major version from `process.versions.node`, and stops with
`figura: error: node 22+ not found` and the install link when node is missing or older than 22.
Otherwise it hands every argument to `scripts/figura.mjs`.

`bin/figura version` prints the plugin name and the version from `.claude-plugin/plugin.json`.
`bin/figura check <document.html>` runs preflight, renders every diagram with d2, measures it in
Chromium and applies the layout checks: DIAGRAM-TOO-WIDE when the scale to the column drops the
smallest label under the theme floor, DIAGRAM-TOO-TALL when the diagram does not fit a page above its
caption, LABEL-OVERLAP when a label crosses a foreign shape or label, and TEXT-OVERFLOW when a label
spills out of its own shape. It prints one success line, or `figura: <document> FAILED:` with one
`CODE: what — remedy` line per problem and exit status 1; it builds no PDF. An unknown command prints
the usage and exits with status 2.

`bin/figura build <document.html>` runs the same check and stops without a PDF on any problem.
Otherwise it prints the document next to its source (`doc.html` gives `doc.pdf`) with the theme,
the title on the left of the footer and the page number on the right, keeps every heading on the
page of the block that follows it, and renders one preview per page with
`pdftoppm -png -r 120` into `.figura/<name>/page-NN.png`. When it first creates `.figura/`, it puts
a `.gitignore` holding `*` there, so the project's git never sees the previews. Every build starts by
removing the previous PDF and previews of the document. Success is one line with the page, diagram
and warning counts and the preview paths.

`bin/figura erd --source manual <schema.json> --out <directory>` turns a schema into D2 `sql_table`
diagrams: primary, foreign and unique keys as constraints, crow's foot ends for many-to-one and
one-to-one relations, and domains as containers. `reference/erd-manual.json` shows the schema format.
Each connected group of tables that does not fit an A4 page is split by domain, then breadth-first into
parts of at most twelve tables, halved until every part passes the width and height checks; a relation
cut by the split ends in a stub that names the other diagram. The parts land in `erd-NN.d2` files that go
into `pre.d2` blocks of the document. `--hide-service-columns` hides created, updated and deleted
timestamps, `--tables a,b` keeps a subset, and `--domains '{"domain": ["table", "prefix*"]}'` assigns
domains.

## Theme

`theme/theme.json` is the only place that holds a color, a size or a page measure. `scripts/theme.mjs`
validates it with named errors and generates two things from it: CSS custom properties, which
`template/print.css` reads for the page box, the footer and every element, and a D2 `classes` block
with one class per node role (source, core, tool, app, observability, neutral, note), which the build
puts at the start of every diagram source, and the d2 arguments for the diagram padding and the four
Inter files. It also exports the page and column geometry, the space
reserved under a diagram for two caption lines, and the smallest label size a check accepts.

Chromium has no `string()` for margin boxes, so the footer title cannot come from the stylesheet: the
build adds an `@page` rule with the document's `<title>` as the content of `@bottom-left`.

## d2 launcher

`bin/launch.sh` runs d2 with every argument it was given.

- A `bin/d2` binary next to the launcher wins: that is the dev mode, and it never touches the
  network. The file is gitignored.
- Otherwise the launcher picks the archive for the platform from the pin and serves d2 from
  `~/.figura/bin/<d2 version>/d2`. On a cache miss it downloads the archive with curl, checks its
  sha256 before unpacking, unpacks it with tar, and moves `bin/d2` into the cache with an atomic
  `mv`.
- `--warm` fills the cache without running d2.
- Every failure is one `figura-launch: error:` line on stderr and a non-zero exit: an
  unsupported platform, a missing curl or tar, a failed download, or a checksum mismatch.

## Pin

`bin/release.json` follows the mneme pin contract: `engine_version` is the d2 version,
`plugin_version` equals the version in `.claude-plugin/plugin.json`, `base_url` points at the d2
release, and `sha256` holds one archive digest per target. The launcher parses it with sed, which
relies on the flat layout with one key per line.

d2 has no release dispatch, so the pin is edited by hand when a new d2 release is taken:

1. Set `engine_version` and `base_url` to the new release.
2. For every target, print the archive URL with `node scripts/release-assets.mjs figura <target>`,
   download the archive, and write its sha256 into the pin.
3. Confirm with `node scripts/check-release-integrity.mjs figura/bin/release.json`, then render a
   diagram with the pinned d2 through `node scripts/figura-smoke.mjs d2`.

A version bump restamps `plugin_version` with `scripts/generate-release-pin.mjs --restamp figura`,
the same command as for any bundle.
