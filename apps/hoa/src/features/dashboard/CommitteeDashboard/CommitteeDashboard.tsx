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
  reviewStandingText,
  rulebookStandingText,
  waitedText,
  type AttentionItem
} from "../dashboardDisplay"
import { AreaRow, AttentionRow, EventRow } from "../DashboardRows/DashboardRows"

export type CommitteeDashboardProps = {
  /** The published rulebook and the HOA's documents. */
  summary: DashboardSummary
  /** The draft or build that will become the next rulebook. */
  nextRulebook: NextRulebook | null
  /** How many active project types are out of date with the published rulebook. */
  projectTypesToUpdate?: number
  /** The applications the committee sees. */
  applications: DashboardApplication[]
  /** What happened lately across the HOA's areas, newest first. */
  activity: ActivityEvent[]
  /** The moment the data was read, which waiting times count to. */
  asOf: string
}

/**
 * The committee's dashboard (docs/dashboard.md): what waits on it across the HOA's areas, where each area stands, and
 * what happened lately. Every line names its area, by the area's icon and name.
 */
export function CommitteeDashboard({
  summary,
  nextRulebook,
  applications,
  projectTypesToUpdate = 0,
  activity,
  asOf
}: CommitteeDashboardProps) {
  const attention = attentionItems({
    applications,
    nextRulebook,
    projectTypesToUpdate,
    publishedAt: summary.publishedAt
  })
  return (
    <div className="grid grid-cols-1 items-start gap-4 px-4 lg:px-6 @4xl/main:grid-cols-3 @4xl/main:gap-6">
      <div className="flex flex-col gap-4 @4xl/main:col-span-2 @4xl/main:gap-6">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Needs your attention</h2>
            </CardTitle>
            {attention.length > 0 ? <CardDescription>Longest waiting first.</CardDescription> : null}
          </CardHeader>
          <CardContent>
            {attention.length === 0 ? (
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
          {activity.length === 0 ? (
            <p className="text-muted-foreground">Nothing has happened yet.</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {activity.map((event) => (
                <EventRow key={event.id} event={event} asOf={asOf} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/** Where an item waiting on the committee is dealt with. */
const attentionLink = (item: AttentionItem): ReactElement =>
  match(item)
    .with({ kind: "decision" }, ({ application }) => (
      <Link to="/applications/$applicationId" params={{ applicationId: application.id }} />
    ))
    .with({ kind: "rulebook-draft" }, () => <Link to="/rules/review" />)
    .with({ kind: "project-types" }, () => <Link to="/project-types" />)
    .exhaustive()
