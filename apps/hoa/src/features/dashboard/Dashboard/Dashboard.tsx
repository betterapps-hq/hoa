import { Link } from "@tanstack/react-router"
import { ArrowRightIcon, CircleCheckIcon, CircleDashedIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { ModelCheck } from "@/features/modelCheck/ModelCheck/ModelCheck"
import type { ModelCheckResult } from "@/features/modelCheck/modelCheckResult"
import type { RoleId } from "@/features/role/roles"
import type { DashboardSummary } from "@/features/rulebook/rulebook.functions"
import { projectTypes } from "@/rules/catalog"

export type DashboardProps = {
  roleId: RoleId
  summary: DashboardSummary
  onModelCheck: () => Promise<ModelCheckResult>
}

type Stat = { label: string; value: string; badge: ReactNode; footer: string; detail: string }

const projectTypeLabels = Object.values(projectTypes).map((type) => type.label)

function statsFor(role: RoleId, summary: DashboardSummary): Stat[] {
  const isPublished = summary.publishedVersion !== null
  const status = isPublished ? (
    <Badge variant="outline">
      <CircleCheckIcon className="text-green-600 dark:text-green-400" />
      Version {summary.publishedVersion}
    </Badge>
  ) : (
    <Badge variant="outline">
      <CircleDashedIcon />
      Not published
    </Badge>
  )
  const publishedOn = summary.publishedAt
    ? new Date(summary.publishedAt).toLocaleDateString("en-US", { dateStyle: "medium" })
    : undefined

  if (role === "administrator") {
    return [
      {
        label: "Published rules",
        value: String(summary.ruleCount),
        badge: status,
        footer: publishedOn ? `Published ${publishedOn}` : "No rulebook yet",
        detail: "Rules every application is checked against"
      },
      {
        label: "Governing documents",
        value: String(summary.documentTitles.length),
        badge: <Badge variant="outline">Ready</Badge>,
        footer: summary.documentTitles.join(", ") || "Upload the CC&Rs and guidelines",
        detail: "Source of every rule citation"
      },
      {
        label: "Project types",
        value: String(projectTypeLabels.length),
        badge: <Badge variant="outline">Enabled</Badge>,
        footer: projectTypeLabels.join(", "),
        detail: "More types follow as rules are extracted"
      },
      {
        label: "Review time",
        value: "Minutes",
        badge: <Badge variant="outline">AI review</Badge>,
        footer: "Homeowners see results before submitting",
        detail: "The committee decides from the same review"
      }
    ]
  }
  return [
    {
      label: "Community",
      value: summary.hoaName,
      badge: status,
      footer: isPublished ? "Rules are ready for review" : "Waiting for the HOA to publish its rules",
      detail: "Your homeowners association"
    },
    {
      label: "Rules checked",
      value: String(summary.ruleCount),
      badge: <Badge variant="outline">Fence</Badge>,
      footer: "Every rule, with citations",
      detail: "From the CC&Rs and design guidelines"
    },
    {
      label: "Project types",
      value: String(projectTypeLabels.length),
      badge: <Badge variant="outline">Available</Badge>,
      footer: projectTypeLabels.join(", "),
      detail: "Choose one when you apply"
    },
    {
      label: "Review time",
      value: "Minutes",
      badge: <Badge variant="outline">AI review</Badge>,
      footer: "Fix problems before you submit",
      detail: "The committee makes the final decision"
    }
  ]
}
/** Role-specific dashboard: summary cards in shadcn's section-cards style, then the next step. */
export function Dashboard({ roleId, summary, onModelCheck }: DashboardProps) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card">
        {statsFor(roleId, summary).map((stat) => (
          <Card key={stat.label} className="@container/card">
            <CardHeader>
              <CardDescription>{stat.label}</CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">{stat.value}</CardTitle>
              <CardAction>{stat.badge}</CardAction>
            </CardHeader>
            <CardFooter className="flex-col items-start gap-1.5 text-sm">
              <div className="line-clamp-1 font-medium">{stat.footer}</div>
              <div className="text-muted-foreground">{stat.detail}</div>
            </CardFooter>
          </Card>
        ))}
      </div>
      <div className="px-4 lg:px-6">
        {roleId === "administrator" ? (
          <ModelCheck onRun={onModelCheck} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Planning a new fence?</h2>
              </CardTitle>
              <CardDescription>
                Upload your application packet to see how it measures up against the community&apos;s rules before the
                committee meets.
              </CardDescription>
              <CardAction>
                <Button render={<Link to="/applications" />} nativeButton={false}>
                  Start an application
                  <ArrowRightIcon />
                </Button>
              </CardAction>
            </CardHeader>
          </Card>
        )}
      </div>
    </>
  )
}
