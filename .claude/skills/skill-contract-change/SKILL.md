---
name: skill-contract-change
description: Change a contract of a mneme plugin skill — a rule in plugin/skills/*/SKILL.md and its replicas in sibling skills — or a check in scripts/check-skill-handoff.mjs, and prove by mutations that the guard goes red on the break. Use when a skill rule is added, reworded or moved, when a replica of a rule is touched, or when a check of check-skill-handoff is added or changed.
---

# skill-contract-change — a plugin skill's contract and its guard

A contract change lands in the owner skill, its replicas and the guard, and is done only when
mutations prove the guard goes red on the break. The guard's rules live in
`scripts/check-skill-handoff.mjs` and in the notes of step 1; this recipe is the order, not a copy.

1. **Recall.** `recall` the subject and make sure the answer carries ffe536ce (mutations with a
   restore in finally), dfb6b186 and c68e8146 (a marker that also stands elsewhere keeps a flat
   check green), a20a8c3b (a check scoped to its paragraph) and af2e3efc (a prose copy of a parser
   is checked on probes of the real parser); recall any missing one by its words.
2. **Owner and replicas.** The rule is defined once, in the skill that owns it. A sibling skill
   that needs it carries a self-sufficient replica, and every replica says the same thing.
3. **Check.** In `scripts/check-skill-handoff.mjs`: the check's letter in the header comment, the
   definition matched by a regex anchored at a line start, anchors scoped to their paragraph or to
   `sectionOf`, negative checks with word boundaries, a failure line that names the skill and the
   repair.
4. **Markers.** Every literal marker the check looks for stands once in the skill, or the check
   reads it only inside its paragraph.
5. **Mutations.** `scripts/guard-mutations/<guard>-<section>.mjs` after the example
   `scripts/guard-mutations/check-skill-handoff-r4.mjs`, one mutation per break the check claims
   to catch, then `node scripts/prove-guard-mutations.mjs scripts/guard-mutations/<guard>-<section>.mjs`
   until every mutation is PROVEN.
6. **Review.** The reviewer gets the diff, the checklist of what the check claims and probes of
   the real module — never the recall bundle.
7. **Tests.** `npm test`.
