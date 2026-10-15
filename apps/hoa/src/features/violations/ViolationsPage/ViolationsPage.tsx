import { Link } from "@tanstack/react-router"
import { PlusIcon, TriangleAlertIcon } from "lucide-react"
import { PageActions } from "@/components/PageActions/PageActions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { dayText } from "@/lib/days"
import { violationStatusLabels } from "@/violations/violation"
import type { ViolationListItem } from "../violations.functions"

// The violations (violations.md): the board's list of every report, open ones first, with reporting one as the page's
// action; an owner's list of the violations they answer for, once their notice is sent.

export type ViolationsPageProps = {
  violations: ViolationListItem[]
  /** The board reports violations and sees every one; an owner sees their own. */
  canReport: boolean
  /** Whether a rulebook is published for violations to cite. */
  hasRulebook: boolean
  onOpen: (violationId: string) => void
}

/** The violations the viewer may see, each with what happens next. */
export function ViolationsPage({ violations, canReport, hasRulebook, onOpen }: ViolationsPageProps) {
  const canReportNow = canReport && hasRulebook
  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      {canReportNow ? (
        <PageActions primary={{ label: "Report a violation", icon: PlusIcon, href: "/violations/new" }} />
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{canReport ? "Violations" : "Your violations"}</CardTitle>
          <CardDescription>
            {canReport
              ? "Each report goes through the steps your documents set: a notice, time to correct it, a hearing when asked for, then any fine."
              : "A violation reported at your home, once its notice is sent. Open one to see what it needs, reply, or ask for a hearing."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {violations.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <TriangleAlertIcon />
                </EmptyMedia>
                <EmptyTitle>{canReport && !hasRulebook ? "Publish the rulebook first" : "No violations"}</EmptyTitle>
                <EmptyDescription>{emptyText(canReport, hasRulebook)}</EmptyDescription>
              </EmptyHeader>
              {canReport && !hasRulebook ? (
                <EmptyContent>
                  <Button variant="outline" render={<Link to="/rules" />} nativeButton={false}>
                    Open the rulebook
                  </Button>
                </EmptyContent>
              ) : null}
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Violation</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Seen</TableHead>
                  <TableHead>Next</TableHead>
                  <TableHead>
                    <span className="sr-only">Open</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {violations.map((violation) => (
                  <TableRow key={violation.id}>
                    <TableCell className="max-w-80">
                      <div className="truncate font-medium">{violation.title}</div>
                      <div className="truncate text-muted-foreground">{violation.rules.join(", ")}</div>
                    </TableCell>
                    <TableCell>{violation.unit}</TableCell>
                    <TableCell>{dayText(violation.observedOn)}</TableCell>
                    <TableCell>
                      {violation.status === "open" ? (
                        (violation.nextStep ?? <span className="text-muted-foreground">Nothing due</span>)
                      ) : (
                        <Badge variant="outline">{violationStatusLabels[violation.status]}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => onOpen(violation.id)}>
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function emptyText(canReport: boolean, hasRulebook: boolean) {
  if (!canReport) {
    return "Nothing has been reported at your home."
  }
  return hasRulebook
    ? "Report one when something breaks a rule, and it's tracked here through each step."
    : "A violation cites the rules it breaks, so the rulebook needs publishing before one can be reported."
}
