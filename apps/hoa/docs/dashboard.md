# Dashboards

The dashboard is the app's first page, and each side of the HOA has its own: the homeowner sees their home, what they
owe and what waits on them, and the board (an administrator, or anyone on the board) sees what waits on it across
everything the HOA runs. Both greet the reader by first name, with the association and the day, then show what needs
attention, what's coming up, the HOA area by area, and recent activity.

## The HOA's areas

The app manages an HOA, not only its architectural reviews. Each part of what the HOA runs is an **area**
(`src/features/dashboard/areas.ts`), with a name and an icon:

| Area | What it covers | Its pages |
| --- | --- | --- |
| Dues and payments | Each unit's ledger, the dues schedules, payments | Ledger, Dues |
| Violations | Reports, notices, hearings, cures and fines | Violations |
| Architectural review | Homeowners' applications, the committee's decisions, the project types they apply under | Applications, Project types |
| Rulebook | The governing documents and the rulebook built from them | Rulebook |

Maintenance requests, meetings and voting, and announcements become areas as they're built; until then the dashboards
show them with [sample data](#samples). Every line on a dashboard belongs to one area and shows it: the area's icon on a
tile beside the line (or the day on a calendar leaf, for what's coming up), and its name under it. A list that mixes
areas reads at a glance, and no line spells its area out in its words.

## The data

`getDashboardOverview` reads money, dues and violations in one call (`DashboardOverview`, `overview.ts`), and decides
which dashboard the reader gets: the board's when they do the board's work (`doesWorkOf(…, "board")`).

- **Money** (the board's): what the units that owe, owe together; what's past due and on how many units, and since when;
  what's unpaid by how late it is (not due yet, then up to 30, 60 and 90 days late, then more); what was billed and
  collected in each of the last six months; and the five units that owe the most. A charge is past due the day after its
  due day. Billed counts charges by the month they're due, less what's waived; collected counts payments by the month
  they posted, less any that came back. Credits aren't money collected. The math is `src/money/receivables.ts`.
- **Dues** (the board's): the next due day across the active schedules, with what every unit owes together then, and
  how the latest due day already past is being paid (`scheduleCollection`).
- **Violations:** the open ones the reader may see, each with its next step, the day it's due if one is set, and whose
  turn it is, the board's or the owner's (`violationSummaries`, which the violations page uses too), and any hearing set.
- **Homes:** each unit the reader owns: its balance, what's past due and since when, the next dues charge, and the last
  payment.
- **Coming up:** what's dated in the next 45 days: the board sees each schedule's due days; an owner, their homes' next
  due day; both see the end of a time to cure and a hearing.

## The board's dashboard

- **Figures:** four cards across the top, each with where to act on it: what's owed to the association (with what's
  late), what was collected this month (against what was billed, and up or down from last month), the open violations
  (and how many wait on the board), and the applications waiting for a decision (and how long the oldest has waited).
- **Needs your attention:** what waits on the board from every area, longest waiting first, each opening where it's
  dealt with: each application waiting for a decision (with the review's recommendation), a draft rulebook with rules
  and questions left to review, project types out of date with the rulebook in force, each violation whose next step is
  the board's (send the notice, hold the hearing, impose a fine), units past due, and dues not set up yet; then the
  samples.
- **Coming up:** dues due days, the ends of times to cure and hearings, soonest first, among the samples' meetings.
- **Billed and collected:** a bar chart of the last six months, and what this month's collections come to.
- **What's owed:** the unpaid amount as one bar split by how late it is, with each part's amount, and the units owing
  the most, each opening its ledger.
- **The HOA, area by area:** a card titled with the HOA's name, a row per area saying where it stands in a sentence
  ("$1,145.00 owed by 3 units, $25.00 of it past due. Monthly dues, $1,120.00, due Nov 1, 2026."; "2 open. 1 waits on
  the board and 1 is in the time to cure."), each opening the area's main page. The sample areas follow.
- **Recent activity:** the latest things that happened across the areas, newest first, up to 10.

On a wide screen the figures run four across; below them, each pair of cards shares a row, the wider one two thirds of
it. On a phone they stack in that order.

## The homeowner's dashboard

The same parts, for their own homes, with **Start an application** as the page's action:

- **Their home:** a card for each home they own: the balance, or credit, in large type; whether any of it is late and
  since when; the next dues charge; the last payment; and **Open your ledger**. Someone who owns no home on the roll
  (a tenant, say) has none.
- **Coming up:** their next dues charge, the end of the time to correct a violation, and a hearing, among the samples'
  meetings.
- **Needs your attention:** what's past due on their homes, each violation they must correct and by when, then their
  applications that wait on them (what the committee asked for, then drafts), each opening where it's dealt with.
- **The HOA, area by area:** what they owe and what's due next; the violations at their home; where their applications
  stand; the rules in force, opening the rulebook once one is published; then the sample areas.
- **Recent activity:** what happened to their applications, homes and the rules: payments recorded on their homes,
  their violations' notices, fines and cures, an application submitted or decided, a rulebook version published.

## Recent activity

Each kind of event (`ActivityEvent`, `src/features/dashboard/activity.ts`) names its area in one table, `eventAreas`,
so a new kind doesn't compile until it says which area it belongs to. Events are read from the records' own dates, so
they know what the records keep: an application's latest submission and decision (submitting again replaces the first
submission's date); a payment from its ledger entry; a dues schedule's charges for a due day, posted together by the
daily job; and a violation's report, notice, fine and cure from its history. **Who did it** comes from the user id each
record keeps: the application's homeowner (`created_by`), the decision's `decidedBy`, the rulebook's `published_by`, a
document's `uploaded_by` and `removed_by`, a project type's `created_by`, a ledger entry's `created_by`, and a
violation event's `recorded_by`. Dues the daily job posts name no one. Documents one person added or removed within 15
minutes of each other are one line ("3 documents", their titles under it).

The board sees every unit's payments and dues, and every violation's steps; an owner sees payments on their own homes,
and their violations' steps from the notice on (never the report before it).

## Samples

An HOA portal does more than the app does yet, so both dashboards show the rest with sample data
(`src/features/dashboard/samples.ts`): maintenance requests, meetings and votes, and the board's announcements.

- **Only for what the app doesn't have.** Applications, the rulebook, violations, dues and payments are always the real
  records, never samples.
- **Marked as samples:** every sample line carries a "Sample" badge and opens nothing.
- **Dated from the moment the dashboard is read,** so they stay current: the meeting is next week.
- **Replaced as each area is built:** its records take the sample's place, and its sample is deleted.

## Adding an area

1. Add it to `areas`, with its name and its sidebar icon.
2. Add its kinds of event to `ActivityEvent`, each with its area in `eventAreas`; read them in `recentActivity`, with who
   did each, and word them in `eventLine`.
3. Add what waits on the board to `attentionItems`, worded in `attentionLine`, and what waits on a homeowner to the
   homeowner's list.
4. Add its dated things to `upcoming` in `getDashboardOverview`.
5. Add its row to the HOA's card on each dashboard, with a sentence saying where it stands.
6. Delete its samples.
