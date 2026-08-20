# DESIGN.md — selection rules and anti-patterns of the shared layer

Initialized by `/mneme:design` (the EMPTY-LIBRARY scaffold). Updated at etalon
fixations; a rule is promoted only on the user's confirmation.

## Selection rules

- **Accent dosage** (inherited from the landing): exactly ONE amber point
  (`--amber`) per screen; green (`--green`) is reserved for pass/accepted
  states; failures and rejections use muted `--rust`, never a loud red.
- **Latencies and durations** are human-readable (17.4 s / 10.8 min / 31 h),
  with raw milliseconds in the value's `title` attribute.
- **Small samples do not shout**: a share visualization (bar) with
  total < 5 is muted (class `bar-muted`) — a 1/1 bar must not read as a
  strong signal.
- **Zero categories stay visible**: a closed taxonomy renders in full and
  zeros are shown — a missing row is unreadable, a zero is information.
- **Pre-instrumentation is a separate tail**: the old era never enters the
  new era's denominator; otherwise history reads as 0%.

## Anti-patterns

- A second amber accent on a screen ("this one matters too") — breaks the
  dosage rule.
- Raw hex/px values bypassing tokens.css — caught by the checker; BUT the
  checker's heuristic is FALSE-NEGATIVE by design: a bypass that mimics a
  token (e.g. a local `--my-size: 13px` defined inside the etalon) slips
  through — the rule is held by review, not by the machine alone.
- Pre-instrumentation counted into the coverage denominator.
- A bar/sparkline over a 1-3 decision sample without muting.
- Raw milliseconds in page text.
- Copying tokens.css into an etalon instead of a `<link>`.
