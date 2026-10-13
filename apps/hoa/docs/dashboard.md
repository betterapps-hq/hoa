# Dashboards

The dashboard is the app's first page, and each side of the HOA has its own: the homeowner sees what waits on them
and where their home stands with the HOA, and the committee (the Administrator role) sees what waits on it across
everything the HOA runs. Both have the same three parts: what needs your attention, the HOA area by area, and recent
activity.

## The HOA's areas

The app manages an HOA, not only its architectural reviews. Each part of what the HOA runs is an **area**
(`src/features/dashboard/areas.ts`), with a name and the icon its main page has in the sidebar:

| Area | What it covers | Its pages |
| --- | --- | --- |
| Architectural review | Homeowners' applications, the committee's decisions, the project types they apply under | Applications, Project types |
| Rulebook | The governing documents and the rulebook built from them | Rulebook |

Violations and fines, dues and budgets, maintenance requests and voting become areas as they're built; until then the
homeowner's dashboard shows them with [sample data](#samples). Every line on a dashboard belongs to one area and shows
it: the area's icon on a tile beside the line, and its name under it. A list that mixes areas reads at a glance, and no
line spells its area out in its words.

## The committee's dashboard

- **Needs your attention:** what waits on the committee from every area, longest waiting first: each application
  waiting for a decision (with the review's recommendation), a draft rulebook with rules and questions left to review,
  and project types out of date with the rulebook in force. Each line says how long it has waited and opens where it's
  dealt with. With nothing waiting, it says so.
- **The HOA, area by area:** a card titled with the HOA's name, a row per area saying where it stands in a sentence
  ("2 applications wait for a decision, and 1 waits on its homeowner."; "Version 3, with 42 rules, in force since Oct
  7."). Each row opens the area's main page.
- **Recent activity:** the latest things that happened across the areas, newest first, up to 8 (`listRecentActivity`):
  an application submitted, submitted again after the committee asked for more, or decided; a project type added; a
  rulebook version published; governing documents added or removed. Each says what it's about, linked, what happened
  and who did it ("Submitted to the committee by Jordan Avery"), its area and when. Documents one person added or
  removed within 15 minutes of each other are one line ("3 documents", their titles under it).

On a wide screen the first two fill two columns and recent activity the third; on a phone they stack in that order.

## The homeowner's dashboard

The same three parts, for one home, with **Start an application** as the page's action:

- **Needs your attention:** the homeowner's applications that wait on them (what the committee asked for, then
  drafts), each with where it stands and its next step, opening the application; then the samples' dues and violation
  notice.
- **The HOA, area by area:** where their applications stand ("Of your 3 applications, 1 waits on you, 1 is with the
  committee and 1 is decided."), opening the applications; the rules in force, opening the rulebook once one is
  published; then the sample areas.
- **Recent activity:** what happened to their applications and the rules: an application submitted or decided, a
  rulebook version published. Their own doings name no one; the committee's are the committee's ("Approved by the
  committee"), never one member's. The board's sample announcements are among them.

## Recent activity

Each kind of event (`ActivityEvent`, `src/features/dashboard/activity.ts`) names its area in one table, `eventAreas`,
so a new kind doesn't compile until it says which area it belongs to. Events are read from the records' own dates, so
they know what the records keep: an application's latest submission and decision (submitting again replaces the first
submission's date). **Who did it** comes from the user id each record keeps: the application's homeowner, who alone
submits it (`created_by`), the decision's `decidedBy`, the rulebook's `published_by`, a document's `uploaded_by` and
`removed_by`, and a project type's `created_by`. A name comes from the id through `userOf` (`src/session/users.ts`),
the rule the session uses: a demo role's user by name, a Cloudflare Access identity by its email. A record from before
its column was kept names no one. When history or proper names are needed, a log written as things happen, and a
directory of the HOA's members, replace the reading; the events and the dashboards stay as they are.

## Samples

An HOA portal does more than the app does yet, so the homeowner's dashboard shows the rest with sample data
(`src/features/dashboard/samples.ts`): a quarterly assessment and the dues paid, a courtesy notice about a violation,
an open maintenance request, the next board meeting and election, and the board's announcements.

- **Only for what the app doesn't have.** Applications and the rulebook are always the real records, never samples.
- **Marked as samples:** every sample line carries a "Sample" badge and opens nothing.
- **Dated from the moment the dashboard is read,** so they stay current: the assessment is due on the first of next
  month, the meeting is next week.
- **Replaced as each area is built:** its records take the sample's place, and its sample is deleted.

## Adding an area

1. Add it to `areas`, with its name and its sidebar icon.
2. Add its kinds of event to `ActivityEvent`, each with its area in `eventAreas`; read them in `recentActivity`, with who
   did each, and word them in `eventLine`.
3. Add what waits on the committee to `attentionItems`, worded in `attentionLine`, and what waits on a homeowner to the
   homeowner's list.
4. Add its row to the HOA's card on each dashboard, with a sentence saying where it stands.
5. Delete its samples.
