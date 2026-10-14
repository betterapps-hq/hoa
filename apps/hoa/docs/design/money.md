# Money: the ledger, dues and payments

Each unit has a ledger: what's charged to it, what's paid, and what's credited. Dues post to it on a schedule, fines
post to it from violations ([violations.md](violations.md)), late fees and interest post to it as the documents allow,
and owners pay it by card or bank account. The association's books stay in QuickBooks; the app sends them each unit's
charges and payments ([roadmap](../roadmap.md#4-money)).

## Records

| Table | Holds |
| --- | --- |
| `ledger_entries` | Each charge, payment, credit or reversal on a unit: what it does to the balance in cents, the day it posts, a charge's due day and category (dues, special assessment, fine, late fee, interest, other fee) or a payment's method, what it's for, the rule it cites, where it came from (a schedule, a violation, a payment, by hand), and a posting key that keeps it from posting twice |
| `ledger_allocations` | Which charges each payment, credit or reversal paid or undid, and how much of each |
| `assessment_schedules` | Dues and special assessments: the amount for each unit, how often (once, monthly, quarterly, twice a year, yearly), the first due day and the last |
| `payments` | A payment made online: its Stripe payment, the units and charges it pays, and whether it's pending, paid, failed or returned |

Entries are never edited or deleted. A mistake is reversed by an entry that points at it, so the ledger always shows
what happened. Amounts are whole cents in US dollars, signed by what they do to the balance: a charge adds, a payment or
credit takes off, a reversal undoes.

**Balance** is the sum of the entries. A payment or credit pays the oldest charge due first, unless the person paying
picks the charges; what it doesn't pay waits, and pays the next charge as it posts.

**Reversing.** Reversing a charge waives what's unpaid on it; what's been paid stays paid, and the board gives a credit
to hand that back. Reversing a payment or credit (a returned check) undoes all of it, and the charges it paid are owed
again. The logic lives in `src/money/ledger.ts`.

**Fines.** Imposing a fine, charge, late fee or interest on a violation posts it to the unit's ledger in the same batch
as the sanction's event, due that day, citing the sanction rule and linking back to the violation.

**By hand.** The board records payments by check, cash or another way, adds a charge nothing else posts, gives a credit,
and reverses entries, from the unit's ledger.

## Dues

An administrator or the board sets up each schedule on the Dues page: its name, dues or a special assessment, the
amount (the same for every unit, or each unit's own), how often (once, monthly, quarterly, twice a year, yearly) and
from when to when. A daily Cron Trigger (`0 10 * * *`) posts each charge 30 days before it's due, once per unit and due
day (`schedule:{id}:{unit}:{due day}` as its posting key), so a missed run catches up and a repeated run posts nothing
twice. Setting one up posts what's due already. A schedule never posts a charge due before it was set up, or before the
unit was added to the roll. Ending a schedule stops its charges; what it posted stays, and can be waived.

Each schedule shows its next due day, what every unit owes together, and how its latest due day is being paid: what's
been paid of what it charged, less anything waived, and how many units have paid (`scheduleCollection`). A unit's
ledger shows the dues coming due in the next 90 days, and whether each has posted.

## Late fees and interest

Each unpaid dues charge is evaluated as an `assessment` request (`assessment.due-on`, `assessment.paid-on`,
`assessment.unpaid-balance`) on the rules file in force on its due day. The sanction rules that enforce the due date
say what's allowed: a late fee, interest each month, collection costs, after any grace period, within any legal limit.
When the documents leave the amount to the board ("the late charge the Board sets by resolution"), the board enters it
once in Settings, as a flat amount or a share of the unpaid amount, and it's checked against any limit. Once the board
turns them on, the daily job posts each one when it becomes available, citing its rule, never twice for the same charge
and period.

## Payments

- **Each association's own Stripe account.** An administrator connects it from Settings, through Stripe's onboarding
  (Stripe Connect). Owners' money goes to the association's bank; the platform never holds it.
- **Paying.** An owner pays their balance, or the charges they pick, by card or bank account, on Stripe's checkout. A
  card payment posts when it succeeds; a bank payment shows as pending until it clears, and one that's returned is
  reversed on the ledger.
- **Autopay.** An owner saves a card or bank account and turns on autopay; each charge is collected on its due day.
- **Processing fees.** Each association chooses who pays them: the owner, as a fee shown before paying, or the
  association.
- **Payments by check or cash** are recorded by the board or an administrator, with the check number.

## Who sees what

- **Owners** see their units' ledgers and balances, pay, and turn autopay on or off.
- **The board and administrators** see every unit's ledger, record payments and credits, set up dues and late fees,
  and connect Stripe.

## Not yet

Payment plans, writing off bad debt, locking an account in collections, a bank lockbox for mailed checks, reserve funds,
and the QuickBooks sync, which comes after payments.
