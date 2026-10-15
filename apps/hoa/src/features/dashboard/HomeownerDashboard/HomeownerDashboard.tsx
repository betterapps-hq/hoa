import { Link } from "@tanstack/react-router"
import { PlusIcon } from "lucide-react"
import type { ReactElement } from "react"
import { match } from "ts-pattern"
import { PageActions } from "@/components/PageActions/PageActions"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { DashboardSummary } from "@/features/rulebook/rulebook.functions"
import { dayText } from "@/lib/days"
import { money } from "@/lib/money"
import type { ActivityEvent } from "../activity"
import { areas } from "../areas"
import type { DashboardApplication } from "../dashboardData"
import {
  homeownerAttentionLine,
  homeownerRulebookText,
  waitingOnHomeowner,
  yourApplicationsText,
  yourMoneyText,
  yourViolationsText
} from "../dashboardDisplay"
import { ActivityRow, AreaRow, AttentionRow, EventRow, UpcomingRow } from "../DashboardRows/DashboardRows"
import { Greeting } from "../Greeting/Greeting"
import { HomeCard } from "../HomeCard/HomeCard"
import type { DashboardOverview, UpcomingItem } from "../overview"
import { homeownerSampleActivity, homeownerSampleStandings, homeownerSampleUpcoming } from "../samples"

export type HomeownerDashboardProps = {
  /** The reader's name, to greet them by. */
  userName: string
  /** The published rulebook and the HOA's documents. */
  summary: DashboardSummary
  /** The homeowner's own applications. */
  applications: DashboardApplication[]
  /** Their homes' money, and the violations they answer for. */
  overview: DashboardOverview
  /** What happened lately to the homeowner's applications, homes and the rules, newest first. */
  activity: ActivityEvent[]
  /** The moment the data was read, which "2 days ago" counts from. */
  asOf: string
}

/** How many lines recent activity lists. */
const activityLimit = 8

/**
 * A homeowner's dashboard (docs/dashboard.md): their home and what they owe, what waits on them across the HOA's areas
 * and what's coming up, where each area stands for them, and what happened lately. The areas the app doesn't have yet
 * show sample data, marked as such.
 */
export function HomeownerDashboard({
  userName,
  summary,
  applications,
  overview,
  activity,
  asOf
}: HomeownerDashboardProps) {
  const waiting = waitingOnHomeowner(applications)
  const theirTurn = overview.violations.filter((item) => item.nextStep?.waitsOn === "owner")
  const late = overview.homes.filter((home) => home.pastDueCents > 0)
  const happened = [
    ...activity.map((event) => ({ at: event.at, row: <EventRow key={event.id} event={event} asOf={asOf} /> })),
    ...homeownerSampleActivity(asOf).map(({ id, ...sample }) => ({
      at: sample.at,
      row: <ActivityRow key={id} {...sample} asOf={asOf} isSample />
    }))
  ]
    .toSorted((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, activityLimit)
  const upcoming = [
    ...overview.upcoming.map((item) => ({
      day: item.on,
      row: (
        <UpcomingRow
          key={item.id}
          area={areas[item.kind === "dues" ? "money" : "violations"]}
          day={item.on}
          subject={item.subject}
          note={item.note}
          link={upcomingLink(item)}
        />
      )
    })),
    ...homeownerSampleUpcoming(asOf).map(({ id, at, ...sample }) => ({
      day: at.slice(0, 10),
      row: <UpcomingRow key={id} day={at.slice(0, 10)} {...sample} link={null} isSample />
    }))
  ].toSorted((a, b) => a.day.localeCompare(b.day))
  const nothingWaiting = waiting.length === 0 && theirTurn.length === 0 && late.length === 0

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6 @4xl/main:gap-6">
      <PageActions primary={{ label: "Start an application", icon: PlusIcon, href: "/applications/new" }} />
      <Greeting name={userName} association={summary.organizationName} today={overview.today} />

      <div className="grid grid-cols-1 items-start gap-4 @4xl/main:grid-cols-3 @4xl/main:gap-6">
        {overview.homes.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 @4xl/main:col-span-2 @4xl/main:gap-6 @6xl/main:grid-cols-2">
            {overview.homes.map((home) => (
              <HomeCard key={home.unitId} home={home} />
            ))}
          </div>
        ) : null}
        <Card className={overview.homes.length > 0 ? undefined : "@4xl/main:col-span-3"}>
          <CardHeader>
            <CardTitle>
              <h2>Coming up</h2>
            </CardTitle>
            <CardDescription>The next 45 days.</CardDescription>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <p className="text-muted-foreground">Nothing is coming up.</p>
            ) : (
              <ul className="flex flex-col gap-2">{upcoming.map(({ row }) => row)}</ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 @4xl/main:grid-cols-3 @4xl/main:gap-6">
        <div className="flex flex-col gap-4 @4xl/main:col-span-2 @4xl/main:gap-6">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Needs your attention</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {nothingWaiting ? (
                <p className="text-muted-foreground">Nothing needs you right now.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {late.map((home) => (
                    <AttentionRow
                      key={`late:${home.unitId}`}
                      area={areas.money}
                      subject={`${money(home.pastDueCents)} past due`}
                      aside={home.pastDueSince ? `Since ${dayText(home.pastDueSince)}` : null}
                      detail={overview.homes.length > 1 ? home.label : null}
                      note="Pay it, or ask the board about it, to keep late fees off your ledger."
                      link={<Link to="/ledger/$unitId" params={{ unitId: home.unitId }} />}
                    />
                  ))}
                  {theirTurn.map((violation) => (
                    <AttentionRow
                      key={`violation:${violation.id}`}
                      area={areas.violations}
                      subject={violation.title}
                      aside={violation.nextStep?.on ? `By ${dayText(violation.nextStep.on)}` : null}
                      detail={overview.homes.length > 1 ? violation.unit : null}
                      note="Correct it in time, reply to the board, or ask for a hearing."
                      link={<Link to="/violations/$violationId" params={{ violationId: violation.id }} />}
                    />
                  ))}
                  {waiting.map((application) => (
                    <AttentionRow
                      key={application.id}
                      area={areas["architectural-review"]}
                      {...homeownerAttentionLine(application, asOf)}
                      link={<Link to="/applications/$applicationId" params={{ applicationId: application.id }} />}
                    />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{summary.organizationName}</h2>
              </CardTitle>
              <CardDescription>Where each area stands for you.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2">
                {overview.homes.length > 0 ? (
                  <AreaRow area={areas.money} link={<Link to="/ledger" />}>
                    {yourMoneyText(overview.homes)}
                  </AreaRow>
                ) : null}
                <AreaRow area={areas.violations} link={<Link to="/violations" />}>
                  {yourViolationsText(overview.violations)}
                </AreaRow>
                <AreaRow area={areas["architectural-review"]} link={<Link to="/applications" />}>
                  {yourApplicationsText(applications)}
                </AreaRow>
                <AreaRow area={areas.rulebook} link={summary.publishedAt ? <Link to="/rules" /> : null}>
                  {homeownerRulebookText(summary)}
                </AreaRow>
                {homeownerSampleStandings(asOf).map(({ id, area, text }) => (
                  <AreaRow key={id} area={area} link={null} isSample>
                    {text}
                  </AreaRow>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Recent activity</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-4">{happened.map(({ row }) => row)}</ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/** Where something coming up for a homeowner is dealt with. */
const upcomingLink = (item: UpcomingItem): ReactElement =>
  match(item)
    .with({ kind: "dues" }, ({ unitId }) =>
      unitId ? <Link to="/ledger/$unitId" params={{ unitId }} /> : <Link to="/ledger" />
    )
    .with({ kind: "violation" }, ({ violationId }) => <Link to="/violations/$violationId" params={{ violationId }} />)
    .exhaustive()
