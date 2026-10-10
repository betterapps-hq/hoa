import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { sentenceCase } from "@/features/applications/applicationDisplay"
import type { DashboardSummary } from "@/features/rulebook/rulebook.functions"
import { cn } from "@/lib/utils"
import type { NextRulebook } from "../dashboard.functions"
import type { DashboardApplication } from "../dashboardData"
import {
  agoText,
  awaitingDecision,
  awaitingHomeowner,
  dateText,
  daysBetween,
  daysText,
  projectLabel,
  recentActivity,
  recommendationText,
  waitingSince
} from "../dashboardDisplay"

export type CommitteeDashboardProps = {
  /** The published rulebook and the HOA's documents. */
  summary: DashboardSummary
  /** The draft or build that will become the next rulebook. */
  nextRulebook: NextRulebook | null
  /** The organization's applications. */
  applications: DashboardApplication[]
  /** The moment the data was read, which waiting times count to. */
  asOf: string
}

/** "today", "1 day ago", "19 days ago". */
const agoPhrase = (days: number) => (days === 0 ? "today" : `${daysText(days)} ago`)

const linkClass = "text-sm text-link underline-offset-4 hover:underline"

/** The committee's dashboard: what waits for a decision or on a homeowner, the rulebook, and recent activity. */
export function CommitteeDashboard({ summary, nextRulebook, applications, asOf }: CommitteeDashboardProps) {
  const toDecide = awaitingDecision(applications)
  const withHomeowners = awaitingHomeowner(applications)
  const activity = recentActivity(applications)
  const waited = (application: DashboardApplication) => daysBetween(waitingSince(application), asOf)

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6 @4xl/main:gap-6">
      <div className="grid grid-cols-2 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs @xl/main:grid-cols-3 dark:*:data-[slot=card]:bg-card">
        <StatCard
          label="Waiting for a decision"
          value={String(toDecide.length)}
          footer={toDecide[0] ? `The oldest came in ${agoPhrase(waited(toDecide[0]))}.` : "Nothing is waiting."}
        />
        <StatCard
          label="Waiting on homeowners"
          value={String(withHomeowners.length)}
          footer={
            withHomeowners[0]
              ? `The oldest request went out ${agoPhrase(waited(withHomeowners[0]))}.`
              : "No open requests."
          }
        />
        <StatCard
          className="col-span-2 @xl/main:col-span-1"
          label="Rulebook in force"
          value={summary.publishedVersion === null ? "None" : `Version ${summary.publishedVersion}`}
          footer={
            summary.publishedAt
              ? `${summary.ruleCount} rules, published ${dateText(summary.publishedAt)}.`
              : "Build one from the governing documents."
          }
        >
          <NextRulebookNote nextRulebook={nextRulebook} />
        </StatCard>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 @4xl/main:grid-cols-3 @4xl/main:gap-6">
        <Card className="@4xl/main:col-span-2">
          <CardHeader>
            <CardTitle>
              <h2>Applications</h2>
            </CardTitle>
            <CardDescription>Longest waiting first.</CardDescription>
            <CardAction>
              <Link to="/applications" className={linkClass}>
                All applications
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="decide">
              <TabsList>
                <TabsTrigger value="decide">To decide</TabsTrigger>
                <TabsTrigger value="homeowners">With homeowners</TabsTrigger>
              </TabsList>
              <TabsContent value="decide" className="pt-2">
                <QueueList empty="Nothing waiting for a decision.">
                  {toDecide.map((application) => (
                    <QueueItem
                      key={application.id}
                      application={application}
                      waited={waited(application)}
                      detail={`${recommendationText(application)}.`}
                    />
                  ))}
                </QueueList>
              </TabsContent>
              <TabsContent value="homeowners" className="pt-2">
                <QueueList empty="No homeowner owes the committee an answer.">
                  {withHomeowners.map((application) => (
                    <QueueItem
                      key={application.id}
                      application={application}
                      waited={waited(application)}
                      detail={application.decision?.note ?? "The committee asked for more information."}
                    />
                  ))}
                </QueueList>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

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
              <ul className="flex flex-col gap-3">
                {activity.map((event) => (
                  <li key={event.id} className="flex min-w-0 flex-col gap-0.5">
                    <Link
                      to="/applications/$applicationId"
                      params={{ applicationId: event.application.id }}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {projectLabel(event.application)}
                    </Link>
                    {event.application.description ? (
                      <span className="truncate text-muted-foreground">{event.application.description}</span>
                    ) : null}
                    <span>{event.summary}</span>
                    <span className="text-muted-foreground">{sentenceCase(agoText(event.at, asOf))}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

type StatCardProps = { label: string; value: string; footer: string; className?: string; children?: ReactNode }

/** One number from shadcn's section cards, with the sentence that says what it means. */
function StatCard({ label, value, footer, className, children }: StatCardProps) {
  return (
    <Card className={cn("@container/card", className)}>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1.5 text-sm">
        <div className="text-muted-foreground">{footer}</div>
        {children}
      </CardFooter>
    </Card>
  )
}

function NextRulebookNote({ nextRulebook }: { nextRulebook: NextRulebook | null }) {
  if (!nextRulebook) {
    return null
  }
  if (nextRulebook.status === "building") {
    return <div className="text-muted-foreground">A new draft is being built.</div>
  }
  const work = [
    nextRulebook.rulesToReview > 0 ? `${nextRulebook.rulesToReview} rules` : null,
    nextRulebook.openQuestions > 0 ? `${nextRulebook.openQuestions} questions` : null
  ].filter((part) => part !== null)
  return (
    <>
      <div className="text-muted-foreground">
        {work.length > 0 ? `A draft has ${work.join(" and ")} to review.` : "A draft is ready to publish."}
      </div>
      <Link to="/rules" className={linkClass}>
        Review the draft
      </Link>
    </>
  )
}

type QueueListProps = { empty: string; children: ReactNode[] }

function QueueList({ empty, children }: QueueListProps) {
  return children.length === 0 ? (
    <p className="py-4 text-muted-foreground">{empty}</p>
  ) : (
    <ul className="flex flex-col gap-2">{children}</ul>
  )
}

type QueueItemProps = { application: DashboardApplication; waited: number; detail: string }

function QueueItem({ application, waited, detail }: QueueItemProps) {
  return (
    <li>
      <Item
        render={<Link to="/applications/$applicationId" params={{ applicationId: application.id }} />}
        variant="outline"
        size="sm"
      >
        <ItemContent>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <ItemTitle>{projectLabel(application)}</ItemTitle>
            <span className="text-sm text-muted-foreground tabular-nums">
              {waited === 0 ? "Since today" : `Waiting ${daysText(waited)}`}
            </span>
          </div>
          {application.description ? <ItemDescription>{application.description}</ItemDescription> : null}
          <p className="text-sm text-muted-foreground">{detail}</p>
        </ItemContent>
      </Item>
    </li>
  )
}
