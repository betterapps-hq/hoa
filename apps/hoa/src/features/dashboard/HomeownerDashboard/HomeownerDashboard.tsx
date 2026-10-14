import { Link } from "@tanstack/react-router"
import { PlusIcon } from "lucide-react"
import { PageActions } from "@/components/PageActions/PageActions"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { DashboardSummary } from "@/features/rulebook/rulebook.functions"
import type { ActivityEvent } from "../activity"
import { areas } from "../areas"
import type { DashboardApplication } from "../dashboardData"
import {
  homeownerAttentionLine,
  homeownerRulebookText,
  waitingOnHomeowner,
  yourApplicationsText
} from "../dashboardDisplay"
import { ActivityRow, AreaRow, AttentionRow, EventRow } from "../DashboardRows/DashboardRows"
import { homeownerSampleActivity, homeownerSampleAttention, homeownerSampleStandings } from "../samples"

export type HomeownerDashboardProps = {
  /** The published rulebook and the HOA's documents. */
  summary: DashboardSummary
  /** The homeowner's own applications. */
  applications: DashboardApplication[]
  /** What happened lately to the homeowner's applications and the rules, newest first. */
  activity: ActivityEvent[]
  /** The moment the data was read, which "2 days ago" counts from. */
  asOf: string
}

/** How many lines recent activity lists. */
const activityLimit = 8

/**
 * A homeowner's dashboard (docs/dashboard.md): what waits on them across the HOA's areas, where each area stands for
 * them, and what happened lately. Their applications and the rules are real; the areas the app doesn't have yet show
 * sample data, marked as such.
 */
export function HomeownerDashboard({ summary, applications, activity, asOf }: HomeownerDashboardProps) {
  const waiting = waitingOnHomeowner(applications)
  const samples = homeownerSampleAttention(asOf)
  const happened = [
    ...activity.map((event) => ({ at: event.at, row: <EventRow key={event.id} event={event} asOf={asOf} /> })),
    ...homeownerSampleActivity(asOf).map(({ id, ...sample }) => ({
      at: sample.at,
      row: <ActivityRow key={id} {...sample} asOf={asOf} isSample />
    }))
  ]
    .toSorted((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, activityLimit)

  return (
    <div className="grid grid-cols-1 items-start gap-4 px-4 lg:px-6 @4xl/main:grid-cols-3 @4xl/main:gap-6">
      <PageActions primary={{ label: "Start an application", icon: PlusIcon, href: "/applications/new" }} />
      <div className="flex flex-col gap-4 @4xl/main:col-span-2 @4xl/main:gap-6">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Needs your attention</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {waiting.length === 0 && samples.length === 0 ? (
              <p className="text-muted-foreground">Nothing needs you right now.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {waiting.map((application) => (
                  <AttentionRow
                    key={application.id}
                    area={areas["architectural-review"]}
                    {...homeownerAttentionLine(application, asOf)}
                    link={<Link to="/applications/$applicationId" params={{ applicationId: application.id }} />}
                  />
                ))}
                {samples.map(({ id, ...sample }) => (
                  <AttentionRow key={id} {...sample} link={null} isSample />
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
  )
}
