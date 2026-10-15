import { Link } from "@tanstack/react-router"
import {
  ClipboardCheckIcon,
  HandCoinsIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  TriangleAlertIcon,
  WalletIcon
} from "lucide-react"
import type { ReactElement } from "react"
import { match } from "ts-pattern"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { DashboardSummary } from "@/features/rulebook/rulebook.functions"
import { money } from "@/lib/money"
import type { ActivityEvent } from "../activity"
import { areas } from "../areas"
import type { NextRulebook } from "../dashboard.functions"
import type { DashboardApplication } from "../dashboardData"
import {
  attentionItems,
  attentionLine,
  awaitingDecision,
  moneyStandingText,
  reviewStandingText,
  rulebookStandingText,
  violationsStandingText,
  waitedText,
  waitingSince,
  type AttentionItem
} from "../dashboardDisplay"
import { ActivityRow, AreaRow, AttentionRow, EventRow, UpcomingRow } from "../DashboardRows/DashboardRows"
import { Greeting } from "../Greeting/Greeting"
import { Metric } from "../Metric/Metric"
import { CollectionsCard, monthName, ReceivablesCard } from "../MoneyCards/MoneyCards"
import type { DashboardOverview, MoneyOverview, UpcomingItem } from "../overview"
import {
  managementSampleActivity,
  managementSampleAttention,
  managementSampleStandings,
  managementSampleUpcoming
} from "../samples"

export type ManagementDashboardProps = {
  /** The reader's name, to greet them by. */
  userName: string
  /** The published rulebook and the HOA's documents. */
  summary: DashboardSummary
  /** The draft or build that will become the next rulebook. */
  nextRulebook: NextRulebook | null
  /** How many active project types are out of date with the published rulebook. */
  projectTypesToUpdate?: number
  /** The applications the committee decides. */
  applications: DashboardApplication[]
  /** Money, dues and violations across the association. */
  overview: DashboardOverview
  /** What happened lately across the HOA's areas, newest first. */
  activity: ActivityEvent[]
  /** The moment the data was read, which waiting times count to. */
  asOf: string
}

/** How many lines recent activity lists. */
const activityLimit = 10

/**
 * The HOA management dashboard (docs/dashboard.md), for the board or manager who runs the whole community: its figures,
 * what waits on them across the HOA's areas and what's coming up, its money, where each area stands and what happened
 * lately. Every line names its area, by the area's icon and name. The areas the app doesn't have yet show sample data,
 * marked as such.
 */
export function ManagementDashboard({
  userName,
  summary,
  nextRulebook,
  applications,
  projectTypesToUpdate = 0,
  overview,
  activity,
  asOf
}: ManagementDashboardProps) {
  const attention = attentionItems({
    applications,
    nextRulebook,
    projectTypesToUpdate,
    publishedAt: summary.publishedAt,
    violations: overview.violations,
    money: overview.money,
    dues: overview.dues,
    asOf
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
    ...managementSampleUpcoming(asOf).map(({ id, at, ...sample }) => ({
      day: at.slice(0, 10),
      row: <UpcomingRow key={id} day={at.slice(0, 10)} {...sample} link={null} isSample />
    }))
  ].toSorted((a, b) => a.day.localeCompare(b.day))
  const deciding = awaitingDecision(applications)
  const [oldestDecision] = deciding
  const boardTurns = overview.violations.filter((item) => item.nextStep?.waitsOn === "board").length
  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6 @4xl/main:gap-6">
      <Greeting name={userName} association={summary.organizationName} today={overview.today} />

      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 @4xl/main:gap-6">
        {overview.money ? (
          <>
            <Metric
              label="Owed to the association"
              icon={WalletIcon}
              value={money(overview.money.owedCents)}
              detail={`${overview.money.owingUnits} of ${overview.money.unitCount === 1 ? "1 unit owes" : `${overview.money.unitCount} units owe`}.`}
              badge={
                overview.money.pastDueCents > 0 ? (
                  <Badge variant="destructive">{money(overview.money.pastDueCents)} late</Badge>
                ) : (
                  <Badge variant="secondary">Nothing late</Badge>
                )
              }
              action={<MetricLink link={<Link to="/ledger" />}>Open the ledger</MetricLink>}
            />
            <CollectedMetric months={overview.money.months} />
          </>
        ) : null}
        <Metric
          label="Open violations"
          icon={TriangleAlertIcon}
          value={String(overview.violations.length)}
          detail={
            boardTurns > 0
              ? `${boardTurns} ${boardTurns === 1 ? "waits" : "wait"} on the board.`
              : "None waits on the board."
          }
          action={<MetricLink link={<Link to="/violations" />}>See the violations</MetricLink>}
        />
        <Metric
          label="Applications to decide"
          icon={ClipboardCheckIcon}
          value={String(deciding.length)}
          detail={
            oldestDecision
              ? `The oldest: ${waitedText(waitingSince(oldestDecision), asOf).toLowerCase()}.`
              : "None is waiting."
          }
          action={<MetricLink link={<Link to="/applications" />}>See the applications</MetricLink>}
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 @4xl/main:grid-cols-3 @4xl/main:gap-6">
        <Card className="@4xl/main:col-span-2">
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

      {overview.money ? (
        <div className="grid grid-cols-1 gap-4 @4xl/main:grid-cols-3 @4xl/main:gap-6">
          <div className="@4xl/main:col-span-2">
            <CollectionsCard months={overview.money.months} />
          </div>
          <ReceivablesCard overview={overview.money} />
        </div>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-4 @4xl/main:grid-cols-3 @4xl/main:gap-6">
        <Card className="@4xl/main:col-span-2">
          <CardHeader>
            <CardTitle>
              <h2>{summary.organizationName}</h2>
            </CardTitle>
            <CardDescription>Where each area stands.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {overview.money ? (
                <AreaRow area={areas.money} link={<Link to="/ledger" />}>
                  {moneyStandingText(overview.money, overview.dues)}
                </AreaRow>
              ) : null}
              <AreaRow area={areas.violations} link={<Link to="/violations" />}>
                {violationsStandingText(overview.violations)}
              </AreaRow>
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

/** A metric's way to where it's dealt with, as a link. */
function MetricLink({ link, children }: { link: ReactElement; children: string }) {
  return (
    <Button variant="link" size="sm" className="h-auto px-0" render={link} nativeButton={false}>
      {children}
    </Button>
  )
}

/** This month's collections, and how they compare with last month's. */
function CollectedMetric({ months }: { months: MoneyOverview["months"] }) {
  const [previous, current] = months.slice(-2)
  if (!current) {
    return null
  }
  const change =
    previous && previous.collectedCents > 0
      ? Math.round(((current.collectedCents - previous.collectedCents) / previous.collectedCents) * 100)
      : null
  const Trend = change !== null && change < 0 ? TrendingDownIcon : TrendingUpIcon
  return (
    <Metric
      label={`Collected in ${monthName(current.month)}`}
      icon={HandCoinsIcon}
      value={money(current.collectedCents)}
      detail={
        current.billedCents > 0
          ? `Of ${money(current.billedCents)} billed for the month.`
          : "Nothing billed for the month."
      }
      badge={
        change === null ? null : (
          <Badge variant="outline">
            <Trend aria-hidden />
            {`${change > 0 ? "+" : ""}${change}%`}
            <span className="sr-only"> from last month</span>
          </Badge>
        )
      }
      action={<MetricLink link={<Link to="/dues" />}>See the dues</MetricLink>}
    />
  )
}

/** Where something coming up is dealt with. */
const upcomingLink = (item: UpcomingItem): ReactElement =>
  match(item)
    .with({ kind: "dues" }, () => <Link to="/dues" />)
    .with({ kind: "violation" }, ({ violationId }) => <Link to="/violations/$violationId" params={{ violationId }} />)
    .exhaustive()

/** Where an item waiting on the HOA's management is dealt with. */
const attentionLink = (item: AttentionItem): ReactElement =>
  match(item)
    .with({ kind: "decision" }, ({ application }) => (
      <Link to="/applications/$applicationId" params={{ applicationId: application.id }} />
    ))
    .with({ kind: "rulebook-draft" }, () => <Link to="/rules/review" />)
    .with({ kind: "project-types" }, () => <Link to="/project-types" />)
    .with({ kind: "violation" }, ({ violation }) => (
      <Link to="/violations/$violationId" params={{ violationId: violation.id }} />
    ))
    .with({ kind: "past-due" }, () => <Link to="/ledger" />)
    .with({ kind: "no-dues" }, () => <Link to="/dues" />)
    .exhaustive()
