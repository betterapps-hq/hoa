import { Link } from "@tanstack/react-router"
import { PlusIcon } from "lucide-react"
import { PageActions } from "@/components/PageActions/PageActions"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item"
import type { DashboardSummary } from "@/features/rulebook/rulebook.functions"
import type { DashboardApplication } from "../dashboardData"
import {
  dateText,
  elsewhereText,
  nextStepText,
  projectLabel,
  standingDateText,
  standingText,
  waitingOnHomeowner
} from "../dashboardDisplay"

export type HomeownerDashboardProps = {
  /** The published rulebook and the HOA's documents. */
  summary: DashboardSummary
  /** The homeowner's own applications. */
  applications: DashboardApplication[]
  /** The moment the data was read, which "2 days ago" counts from. */
  asOf: string
}

const linkClass = "text-sm text-link underline-offset-4 hover:underline"

/**
 * A homeowner's dashboard: what waits on them, each with its next step, where their other applications stand in a
 * sentence, and the rules. Every application is on the applications page.
 */
export function HomeownerDashboard({ summary, applications, asOf }: HomeownerDashboardProps) {
  const waiting = waitingOnHomeowner(applications)
  const elsewhere = elsewhereText(applications)
  return (
    <div className="grid grid-cols-1 items-start gap-4 px-4 lg:px-6 @4xl/main:grid-cols-3 @4xl/main:gap-6">
      <PageActions primary={{ label: "Start an application", icon: PlusIcon, href: "/applications/new" }} />
      <Card className="@4xl/main:col-span-2">
        <CardHeader>
          <CardTitle>
            <h2>Waiting on you</h2>
          </CardTitle>
          {waiting.length > 0 ? <CardDescription>What to do next on each application.</CardDescription> : null}
          {applications.length > 0 ? (
            <CardAction>
              <Link to="/applications" className={linkClass}>
                All applications
              </Link>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {applications.length === 0 ? (
            <p className="text-muted-foreground">You haven&apos;t started an application yet.</p>
          ) : null}
          {applications.length > 0 && waiting.length === 0 ? <p>Nothing needs you right now.</p> : null}
          {waiting.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {waiting.map((application) => (
                <ApplicationItem key={application.id} application={application} asOf={asOf} />
              ))}
            </ul>
          ) : null}
          {elsewhere ? <p className="text-sm text-muted-foreground">{elsewhere}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Community rules</h2>
          </CardTitle>
          <CardDescription>{summary.hoaName}</CardDescription>
        </CardHeader>
        <CardContent>
          {summary.publishedAt ? (
            <p>
              {summary.ruleCount} rules from {summary.documentTitles.length} governing documents, in force since{" "}
              {dateText(summary.publishedAt)}.
            </p>
          ) : (
            <p>The HOA hasn&apos;t published its rules yet.</p>
          )}
          <p className="text-muted-foreground">Read them while you plan, so your project meets them the first time.</p>
        </CardContent>
        {summary.publishedAt ? (
          <CardFooter>
            <Link to="/rules" className={linkClass}>
              Browse the rules
            </Link>
          </CardFooter>
        ) : null}
      </Card>
    </div>
  )
}

type ApplicationItemProps = { application: DashboardApplication; asOf: string }

function ApplicationItem({ application, asOf }: ApplicationItemProps) {
  const date = standingDateText(application, asOf)
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
            <span className="text-sm text-muted-foreground">{standingText(application)}</span>
          </div>
          {application.description ? <ItemDescription>{application.description}</ItemDescription> : null}
          <p className="text-sm">
            {nextStepText(application)}
            {date ? <span className="text-muted-foreground"> {date}</span> : null}
          </p>
        </ItemContent>
      </Item>
    </li>
  )
}
