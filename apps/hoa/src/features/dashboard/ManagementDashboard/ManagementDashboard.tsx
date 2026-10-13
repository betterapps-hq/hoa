import { Link } from "@tanstack/react-router"
import type { ReactElement } from "react"
import { match } from "ts-pattern"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { DashboardSummary } from "@/features/rulebook/rulebook.functions"
import type { ActivityEvent } from "../activity"
import { areas } from "../areas"
import type { NextRulebook } from "../dashboard.functions"
import type { DashboardApplication } from "../dashboardData"
import {
  attentionItems,
  attentionLine,
  dateText,
  reviewStandingText,
  rulebookStandingText,
  waitedText,
  type AttentionItem
} from "../dashboardDisplay"
import { ActivityRow, AreaRow, AttentionRow, EventRow } from "../DashboardRows/DashboardRows"
import {
  managementSampleActivity,
  managementSampleAttention,
  managementSampleStandings,
  managementSampleUpcoming
} from "../samples"

export type ManagementDashboardProps = {
  /** The published rulebook and the HOA's documents. */
  summary: DashboardSummary
  /** The draft or build that will become the next rulebook. */
  nextRulebook: NextRulebook | null
  /** How many active project types are out of date with the published rulebook. */
  projectTypesToUpdate?: number
  /** The applications the committee decides. */
  applications: DashboardApplication[]
  /** What happened lately across the HOA's areas, newest first. */
  activity: ActivityEvent[]
  /** The moment the data was read, which waiting times count to. */
  asOf: string
}

/** How many lines recent activity lists. */
const activityLimit = 10

/**
 * The HOA management dashboard (docs/dashboard.md), for the board or manager who runs the whole community: what waits
 * on them across the HOA's areas, where each area stands, what's coming up and what happened lately. Every line names
 * its area, by the area's icon and name. Architectural review and the rulebook are real; the areas the app doesn't
 * have yet show sample data, marked as such.
 */
export function ManagementDashboard({
  summary,
  nextRulebook,
  applications,
  projectTypesToUpdate = 0,
  activity,
  asOf
}: ManagementDashboardProps) {
  const attention = attentionItems({
    applications,
    nextRulebook,
    projectTypesToUpdate,
    publishedAt: summary.publishedAt
  })
  const samples = managementSampleAttention(asOf)
  const happened = [
    ...activity.map((event) => ({ at: event.at, row: <EventRow key={event.id} event={event} asOf={asOf} /> })),
    ...managementSampleActivity(asOf).map(({ id, ...sample }) => ({
      at: sample.at,
      row: <ActivityRow key={id} {...sample} asOf={asOf} isSample />
    }))
  ]
    .toSorted((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, activityLimit)
  return (
    <div className="grid grid-cols-1 items-start gap-4 px-4 lg:px-6 @4xl/main:grid-cols-3 @4xl/main:gap-6">
      <div className="flex flex-col gap-4 @4xl/main:col-span-2 @4xl/main:gap-6">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Needs your attention</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {attention.length === 0 && samples.length === 0 ? (
              <p className="text-muted-foreground">Nothing needs you right now.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {attention.map((item) => (
                  <AttentionRow
                    key={item.id}
                    area={areas[item.area]}
                    {...attentionLine(item)}
                    aside={waitedText(item.since, asOf)}
                    link={attentionLink(item)}
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
              <h2>{summary.hoaName}</h2>
            </CardTitle>
            <CardDescription>Where each area stands.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              <AreaRow area={areas["architectural-review"]} link={<Link to="/applications" />}>
                {reviewStandingText(applications)}
              </AreaRow>
              <AreaRow area={areas.rulebook} link={<Link to="/rules" />}>
                {rulebookStandingText(summary, nextRulebook)}
              </AreaRow>
              {managementSampleStandings(asOf).map(({ id, area, text }) => (
                <AreaRow key={id} area={area} link={null} isSample>
                  {text}
                </AreaRow>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4 @4xl/main:gap-6">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Coming up</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {managementSampleUpcoming(asOf).map(({ id, area, at, subject, note }) => (
                <AttentionRow
                  key={id}
                  area={area}
                  subject={subject}
                  aside={dateText(at)}
                  detail={null}
                  note={note}
                  link={null}
                  isSample
                />
              ))}
            </ul>
          </CardContent>
        </Card>

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

/** Where an item waiting on the HOA's management is dealt with. */
const attentionLink = (item: AttentionItem): ReactElement =>
  match(item)
    .with({ kind: "decision" }, ({ application }) => (
      <Link to="/applications/$applicationId" params={{ applicationId: application.id }} />
    ))
    .with({ kind: "rulebook-draft" }, () => <Link to="/rules/review" />)
    .with({ kind: "project-types" }, () => <Link to="/project-types" />)
    .exhaustive()
