# Implementation log

The running record of building [implementation-plan.md](implementation-plan.md): where each phase stands, the
decisions made along the way, questions waiting for a person, and every evaluation round's scores.

## Goal

Implement the rules schema, the encoding pipeline and the application review for the proof of concept (fence and
garage enclosure), with both evaluation rounds clearing their bars, following the plan's phases. Questions don't block
the work: each is recorded below with the decision taken in the meantime.

Work happens on the `feat/rules-schema` branch, committed locally at each milestone and not pushed.

## Status

| Phase | Status |
| --- | --- |
| 0 Spikes and decisions | Not started |
| 1 Schema in the app | Not started |
| 2 Engine | Not started |
| 3 Storage | Not started |
| 4 Encoding pipeline | Not started |
| E1 Evaluation round: encoding | Not started |
| 5 Rules UX | Not started |
| 6 Review pipeline | Not started |
| E2 Evaluation round: review | Not started |
| 7 Review UX | Not started |
| 8 Datasets and evaluation | Not started |
| 9 Cutover and cleanup | Not started |

## Decisions

| Date | Decision | Why |
| --- | --- | --- |
| 2026-10-09 | Migrations are additive: new `provisions`, `rulebook_rules`, `rulebook_terms`, `rulebook_questions` tables and nullable columns; old tables and columns are dropped at cutover (9.6). | Pull request previews share one D1 database, so a migration must not break another branch's preview. |
| 2026-10-09 | The text-analysis service (spaCy, LexNLP, RapidFuzz, dateparser, embeddings) is built after evaluation round 1's baseline, with only the extractors its failures call for. | YAGNI: measure first. Also waits on the LexNLP license question. |
| 2026-10-09 | Local commits per milestone on `feat/rules-schema`, never pushed. | A long unattended run needs recoverable checkpoints; nothing leaves the machine. |

## Questions

| Date | Question | Meanwhile |
| --- | --- | --- |
| 2026-10-09 | LexNLP is AGPL-3.0, with a commercial license available. Take the license, accept AGPL, or replace its extractors with our own? | Not used until E1.6; own grammars first. |
| 2026-10-09 | Numbering test matrix (plan item 3 in the generalization review): write a few common numbering styles as parser tests now, or defer with the other generalization work? | Deferred with the corpus work. |

## Evaluation rounds

No rounds run yet.
