import { Link } from "@tanstack/react-router"
import { ClipboardListIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item"
import type { DashboardSummary } from "@/features/rulebook/rulebook.functions"
import type { DashboardApplication, HomeownerDashboardData } from "../dashboardData"
import {
  agoText,
  dateText,
  groupForHomeowner,
  nextStepText,
  projectLabel,
  standingText,
  timeText,
  weekdayText
} from "../dashboardDisplay"

export type HomeownerDashboardProps = {
  /** The published rulebook and the HOA's documents. */
  summary: DashboardSummary
  data: HomeownerDashboardData
  /** The moment the data was read, which "2 days ago" counts from. */
  asOf: string
}

/** A homeowner's dashboard: their applications, what waits on them first, the next meeting and the rules. */
export function HomeownerDashboard({ summary, data, asOf }: HomeownerDashboardProps) {
  const groups = groupForHomeowner(data.applications)
  const meeting = data.nextMeeting
  return (
    <div className="grid grid-cols-1 items-start gap-4 px-4 lg:px-6 @4xl/main:grid-cols-3 @4xl/main:gap-6">
      <Card className="@4xl/main:col-span-2">
        <CardHeader>
          <CardTitle>
            <h2>Your applications</h2>
          </CardTitle>
          <CardDescription>Where each one stands and what comes next.</CardDescription>
          <CardAction>
            <Button render={<Link to="/applications" />} nativeButton={false}>
              Start an application
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {groups.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ClipboardListIcon />
                </EmptyMedia>
                <EmptyTitle>No applications yet</EmptyTitle>
                <EmptyDescription>
                  Planning a change to your home or yard? Start an application and the review checks it against the
                  rules right away.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            groups.map((group) => (
              <section key={group.title} aria-label={group.title} className="flex flex-col gap-2">
                <h3 className="text-sm text-muted-foreground">{group.title}</h3>
                <ul className="flex flex-col gap-2">
                  {group.applications.map((application) => (
                    <ApplicationItem key={application.id} application={application} meeting={meeting} asOf={asOf} />
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

      <div className="flex flex-col gap-4 @4xl/main:gap-6">
        {meeting ? (
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Next committee meeting</h2>
              </CardTitle>
              <CardDescription>{meeting.title}</CardDescription>
            </CardHeader>
            <CardContent className="gap-1">
              <p className="font-medium">
                {weekdayText(meeting.startsAt)} at {timeText(meeting.startsAt)}
              </p>
              <p className="text-muted-foreground">{meeting.location}</p>
              {meeting.submissionDeadline ? (
                <p className="pt-2 text-muted-foreground">
                  Submit by {weekdayText(meeting.submissionDeadline)} to be on this agenda.
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

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
            <p className="text-muted-foreground">
              Read them while you plan, so your project meets them the first time.
            </p>
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
    </div>
  )
}

type ApplicationItemProps = {
  application: DashboardApplication
  meeting: HomeownerDashboardData["nextMeeting"]
  asOf: string
}

function ApplicationItem({ application, meeting, asOf }: ApplicationItemProps) {
  const onAgenda = meeting && application.meetingId === meeting.id ? meeting : null
  const request = application.status === "information-requested" ? application.informationRequest : null
  return (
    <Item render={<li />} variant="outline" size="sm">
      <ItemContent>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <ItemTitle>{projectLabel(application)}</ItemTitle>
          <span className="text-sm text-muted-foreground">{standingText(application)}</span>
        </div>
        <ItemDescription>{application.description}</ItemDescription>
        <p className="text-sm">
          {nextStepText(application, onAgenda)}
          {request ? <span className="text-muted-foreground"> Asked {agoText(request.requestedAt, asOf)}.</span> : null}
          {application.decision ? (
            <span className="text-muted-foreground"> Decided {dateText(application.decision.decidedAt)}.</span>
          ) : null}
        </p>
      </ItemContent>
    </Item>
  )
}
