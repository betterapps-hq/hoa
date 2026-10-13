import { Link } from "@tanstack/react-router"
import { PlusIcon } from "lucide-react"
import { PageActions } from "@/components/PageActions/PageActions"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item"
import type { DashboardSummary } from "@/features/rulebook/rulebook.functions"
import type { DashboardApplication } from "../dashboardData"
import {
  dateText,
  groupForHomeowner,
  nextStepText,
  projectLabel,
  standingDateText,
  standingText
} from "../dashboardDisplay"

export type HomeownerDashboardProps = {
  /** The published rulebook and the HOA's documents. */
  summary: DashboardSummary
  /** The homeowner's own applications. */
  applications: DashboardApplication[]
  /** The moment the data was read, which "2 days ago" counts from. */
  asOf: string
}

/** A homeowner's dashboard: their applications, what waits on them first, and the rules. */
export function HomeownerDashboard({ summary, applications, asOf }: HomeownerDashboardProps) {
  const groups = groupForHomeowner(applications)
  return (
    <div className="grid grid-cols-1 items-start gap-4 px-4 lg:px-6 @4xl/main:grid-cols-3 @4xl/main:gap-6">
      <PageActions primary={{ label: "Start an application", icon: PlusIcon, href: "/applications" }} />
      <Card className="@4xl/main:col-span-2">
        <CardHeader>
          <CardTitle>
            <h2>Your applications</h2>
          </CardTitle>
          {groups.length > 0 ? <CardDescription>Where each one stands and what comes next.</CardDescription> : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {groups.length === 0 ? (
            <p className="text-muted-foreground">You haven&apos;t started an application yet.</p>
          ) : (
            groups.map((group) => (
              <section key={group.title} aria-label={group.title} className="flex flex-col gap-2">
                <h3 className="text-sm text-muted-foreground">{group.title}</h3>
                <ul className="flex flex-col gap-2">
                  {group.applications.map((application) => (
                    <ApplicationItem key={application.id} application={application} asOf={asOf} />
                  ))}
                </ul>
              </section>
            ))
          )}
        </CardContent>
        {groups.length > 0 ? (
          <CardFooter>
            <Link to="/applications" className="text-sm text-link underline-offset-4 hover:underline">
              Open your applications
            </Link>
          </CardFooter>
        ) : null}
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
            <Link to="/rules" className="text-sm text-link underline-offset-4 hover:underline">
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
