---
name: document
description: Builds technical A4 PDF documents with D2 diagrams (architecture, sequence, mapping, ERD, flowchart and state) from one HTML source, checks every diagram against the page and previews every page. Use it when the user asks for a PDF, a document, a spec with flowcharts or sequence diagrams, or an ERD of a database or an ORM schema.
allowed-tools: [Read, Write, Edit, Bash]
---

# /figura:document — technical A4 PDFs with D2 diagrams

figura turns one HTML source into an A4 PDF: text, tables, callouts, code and diagrams written in D2.
The theme owns every color, font and measure, D2 owns the layout of each diagram, and the print
stylesheet owns the page. You write the source; you never place anything by coordinates.

## Workflow

1. Copy the template `${CLAUDE_PLUGIN_ROOT}/template/document.html` to where the document belongs
   in the project (for example `docs/<name>.html`) and write the content in its format (below).
   `${CLAUDE_PLUGIN_ROOT}/reference/demo.html` uses every block and every diagram type.
2. Build it with Bash: `${CLAUDE_PLUGIN_ROOT}/bin/figura build docs/<name>.html`.
3. Read the report. A failed build prints `figura: <document> FAILED:` and one
   `CODE: what — remedy` line per problem, and writes no PDF. Each diagram that failed a layout
   check is drawn into `.figura/<name>/failed-NN.png` with the labels and shapes in conflict
   framed; a diagram too wide or too tall carries a line where its limit runs, and whatever lies
   beyond the line is what does not fit. The last line of the report names those pictures: open
   each with Read before you change its diagram. Fix every line (see `## Failure codes`) and build
   again.
4. Review the pages. A successful build prints one line with the PDF path and the previews in
   `.figura/<name>/page-NN.png`. Open every preview page that holds a diagram with Read and look for
   what the checks cannot see: an edge crossing a title, a label that says too little, a crowded
   diagram. Fix the source and build again until the pages read well.
5. Deliver the build's success line and the PDF path.

`${CLAUDE_PLUGIN_ROOT}/bin/figura check docs/<name>.html` runs the same checks without printing a
PDF.

## Source format

- `<html lang="…">` and a `<title>`; the title goes into the footer of every page.
- Headings `h1`–`h3`, paragraphs, `ul` and `ol` lists, `strong`, inline `code`.
- Code blocks: `<pre><code>…</code></pre>` for JSON, SQL and shell.
- Tables: `table` with a `thead`; the header row repeats on every page the table spans. A cell
  never breaks inside a word, and inline code breaks only after `_`, `/`, `::` and `.`; put `<wbr>`
  inside a long identifier without them (`ProcessFinance<wbr>ReportJob`) where it may break. A table
  wider than the column stops `build` with `TABLE-TOO-WIDE`; `check` does not lay out tables.
- Inline `code` takes the size of the text around it, in a caption and a table cell as well.
- Callouts: `<div class="callout warning">`, `callout note` or `callout decision`, with the label
  in a `strong` first.
- Diagrams: one per `figure`, as
  `<figure><pre class="d2">…</pre><figcaption class="caption"><strong>Title.</strong> The key
  thought.</figcaption></figure>`. Escape `<` and `&` in the D2 source as `&lt;` and `&amp;`.

## Diagram rules

- Give every shape a role class, never a color: `class: source`, `core`, `tool`, `app`,
  `observability`, `neutral` or `note`. A `sql_table` takes `class: table`.
- Keep labels short: a name and at most one short line under it.
- No more than 15 shapes in one diagram. Split a larger picture into several diagrams.
- One idea per diagram, and its caption says it: a title in `strong`, then the key thought.
- Number the messages of a sequence diagram: `1. …`, `2. …`; draw replies and events dashed with
  `{style.stroke-dash: 3}`. A sequence diagram fits A4 with five participants or fewer; groups
  (loops, conditions) are fine.
- A chain of six or more steps fits neither down nor right: regroup it into layers (clients, the
  system, storage) instead of one long line.
- A label on an edge that enters a container lands inside it and reads as a link within it, in
  ELK and dagre alike: leave such an edge unlabelled or name the link in the caption.
- Layout: ELK by default. When ELK stretches a diagram too tall or too wide, set
  `data-layout="dagre"` on its `pre`; the architecture and state references are drawn with dagre.
- Structure is D2's job: `direction`, containers, `label.near` and connections. Never set positions,
  sizes or colors.

One reference example per diagram type, each building clean on A4:

- `${CLAUDE_PLUGIN_ROOT}/reference/architecture.d2` — a container of components with the systems
  around it, solid and dashed labelled connections (`data-layout="dagre"`).
- `${CLAUDE_PLUGIN_ROOT}/reference/sequence.d2` — `shape: sequence_diagram`, numbered messages,
  dashed replies, notes on lifelines.
- `${CLAUDE_PLUGIN_ROOT}/reference/mapping.d2` — column containers with connections between them.
- `${CLAUDE_PLUGIN_ROOT}/reference/erd.d2` — `sql_table` shapes with keys, foreign keys that name
  their table, domains as containers, crow's foot ends; the format `figura erd` writes
  (`data-layout="dagre"`).
- `${CLAUDE_PLUGIN_ROOT}/reference/flowchart.d2` — who, mechanism and scope in three columns:
  `direction: right`, no containers.
- `${CLAUDE_PLUGIN_ROOT}/reference/state.d2` — states and labelled transitions
  (`data-layout="dagre"`).

## ERD from a real schema

`figura erd` reads a schema and writes `erd-NN.d2` files, splitting a schema that does not fit one
page into parts. Paste each part into its own `figure` as `<pre class="d2" data-layout="dagre">`:
figura measured the part with dagre, and ELK draws the same part wider. A foreign key names its
table in the column type (`bigint → venues`), relations are drawn inside a part only, and a table
never shows the tables that reference it. A relation from a table to itself draws no edge: its
column already names the table (`bigint → holidays`). All ERD diagrams of one document print at
one scale, the smallest any of them needs, so their tables read alike; a part that fails at that
scale is named with the part that set it.

- Prisma: `${CLAUDE_PLUGIN_ROOT}/bin/figura erd --source prisma prisma/schema.prisma --out docs/erd`
  (a directory of `.prisma` files works too).
- TypeORM: `--source typeorm src` reads the entity files; names follow TypeORM's default naming
  strategy, so a project with a custom naming strategy gets truer names from the database.
- Rails: `--source rails db/schema.rb`.
- A live PostgreSQL: `--source psql` reads the address from `DATABASE_URL`. Prefer the environment
  variable to `--url`, because a command-line argument shows in the process list.
- A hand-written schema: `--source manual <schema.json>` in the format of
  `${CLAUDE_PLUGIN_ROOT}/reference/erd-manual.json`.

Flags: `--hide-service-columns` hides the created, updated and deleted timestamps, `--key-columns`
keeps only the primary, foreign and unique key columns, `--tables a,b` keeps a subset whose foreign
keys still name the tables left out, and `--domains '{"domain": ["table", "prefix*"]}'` groups
tables into domains. A table too large even alone fails with a remedy that names the flag that would
help or, when none would, its longest row or its column count. A `TYPEORM-UNSUPPORTED` warning lists
the entity declarations the parser left out of the diagrams.

## Failure codes

| Code | What to do |
| --- | --- |
| `DIAGRAM-TOO-WIDE` | Follow the remedy on the line: it knows the diagram's layout, kind and direction and offers only what they have not tried — fewer participants for a sequence, dagre for an ERD part, and for an ERD printed at the scale another part set, a split of that part |
| `TABLE-TOO-WIDE` | Only `build` finds it: use fewer columns or shorter cell text, or put `<wbr>` inside a long identifier |
| `HEADING-APART` | Only `build` finds it: the figure fits a page alone but not under its heading, so the heading would be left alone at the bottom of a page — make the diagram shorter, or put a paragraph between the heading and the figure |
| `DIAGRAM-TOO-TALL` | Follow the remedy on the line: another direction or layout, layers instead of a long chain, or a split |
| `LABEL-OVERLAP` | Open the picture of the failed diagram, then follow the remedy: shorten, move or drop the label, or name an edge into a container in the caption |
| `TEXT-OVERFLOW` | Shorten the label or break it into two short lines |
| `D2-FAILED` | Fix the D2 syntax at the line the message names |
| `DOCUMENT-INVALID` | Fix the HTML the message names |
| `ERD-INVALID` | Fix the schema, or the `--tables` or `--domains` value the message names |
| `PSQL-FAILED` | Check that the database is reachable and the credentials are right |
| `CDP-TIMEOUT`, `CDP-COMMAND-FAILED`, `BROWSER-EXITED`, `MEASURE-FAILED`, `PRINT-FAILED`, `PREVIEW-FAILED` | Build again; if the same line comes back, report it to the user as it is |
| `D2-UNAVAILABLE`, `CHROMIUM-NOT-FOUND`, `CHROMIUM-TOO-OLD`, `PDFTOPPM-NOT-FOUND`, `PSQL-NOT-FOUND` | Install what the message names, with the command it gives |

## Output

The build's success line and the PDF path, as plain text. The documents are the product; this skill
presents no menus.
