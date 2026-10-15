# Violations and fines

A violation is a broken rule on a lot, found by the board, a committee or a neighbor, and taken through the steps the
association's documents set out: notice, a cure period, a hearing when one is asked for, then a fine or another
sanction. The documents decide every step. The rulebook already holds them: the rules a violation can break (request
type `violation`), each sanction rule with what it enforces and its amounts, the cure period, the procedures a sanction
needs first and the law that caps it ([schema.md](schema.md#deadlines-cure-sanctions-and-limits)). This feature keeps
what happens, sends the facts to the engine, and shows what the documents allow next.

## Records

| Table | Holds |
| --- | --- |
| `violations` | One violation: its lot (a unit on the roll), what was seen, the day it was observed, who reported it, the rules file in force that day, and whether it's open, closed or dismissed |
| `violation_rules` | The rules it breaks, by rule key in that rules file. Usually one |
| `violation_people` | Who answers for it: the unit's owners, and the occupant, tenant or guest who did it when known |
| `violation_photos` | Photos, kept at `hoas/{organizationId}/violations/{violationId}/{photoId}` |
| `violation_events` | What happened, in order: reported, notice sent, a reply, a hearing asked for, set and held, cured, a sanction imposed, a fact stated, dismissed, closed, notes. Each event has the day it happened and who recorded it |

Events are never edited or deleted, only added; a mistake is corrected by a later event. The violation's facts come
from them: `violation.observed-on`, `violation.notice-delivered-on`, `violation.hearing-requested-on`,
`violation.hearing-held-on` and `violation.cured-on`, which the steps set. Any other property of a violation the
rulebook reads, such as the day the board set to cure by, an emergency or the cost of the work, the board states as a
fact; the latest stated value counts, and stating none takes it back.

## What the documents allow

Each time a violation is shown, it's evaluated as a `violation` request on the rules file in force on the day it was
observed, as of today (`engine/sanctions.ts`):

- **The cure period**, from the broken rule's `cure` or the default in the rulebook's settings, counted from its `after`
  date (usually the notice). A violation cured within it can't be sanctioned. A rule about an event, such as a party,
  has no cure.
- **Sanction preconditions**: what a sanction needs first, such as notice delivered and a hearing held if one was asked
  for, with the sanctions they except (emergency self-help, towing).
- **Each sanction rule that enforces a broken rule**: available, blocked by a limit, waiting (with what it waits for), or
  not applicable. An available sanction carries its amount: the schedule's entry for this occurrence, repeats such as a
  daily fine from the end of the cure period, a cap, and any legal limit. When the documents leave the amount to the
  board (`set-by-imposer`), the board enters it when imposing, and it's checked against any limit.
- **The occurrence**: earlier violations counted as the sanction's `occurrences` says (within a period, the same rule
  or any it enforces, per owner or per lot, and whether violations cured in time count). The feature counts them from
  its own records and sends the number as `violation.occurrence`.
- **Who answers**: the sanction's `against` parties, plus whoever the liability settings make answer for them (an owner
  for a tenant or guest).

The panel cites the provision for each, so the board sees why. A sanction waiting on a precondition says which of the
board's steps would meet it ("First, deliver the notice"), found by trying the notice and the hearing taken today. The
facts the evaluation read but doesn't know are asked under What the documents need to know. The engine proposes; the
board decides and imposes.

## Steps

1. **Report.** The board or an administrator picks the unit, the rules broken
   (searched by their statements), the day observed, what was seen, and photos (a phone's camera works). The unit's
   current owners answer for it by default.
2. **Notice.** An email to the people who answer for it, with the rule, its citation, what was seen, the cure deadline
   and how to reply or ask for a hearing. Sending it records the notice as delivered that day. A notice delivered
   another way (posted, mailed) is recorded with its date. It can't be emailed while the cure deadline turns on a fact
   nobody has stated, since the notice gives the deadline.
3. **Reply and hearing.** The owner replies, or asks for a hearing, from their account. The board records when the
   hearing is set and held, and its outcome.
4. **Cure.** The board records the day it was cured, from an owner's reply or an inspection.
5. **Sanction.** The board imposes an available sanction, for no more than the documents allow less what's been
   imposed under it already. A fine or charge posts to the unit's ledger ([money.md](money.md)), citing the sanction
   rule; other sanctions (a suspension, a notice recorded) are events.
6. **Close.** A cured or sanctioned violation is closed; one that was a mistake is dismissed, with a reason.

## Who sees what

- **The board and administrators** see every violation and take every step.
- **Owners**, and an occupant or tenant named on it, see a violation once its notice is sent: the rule, the photos, the
  steps so far and the deadline to correct it, and they can reply or ask for a hearing. Who reported it, and which
  board member took each step, isn't shown to them; the association's name is.
- **Others** see nothing of it.

## Not yet

Inspections on a phone that work offline, notice letters by mail, a covenants committee that enforces in the board's
place, and violations on common areas without a lot.
