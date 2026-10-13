import { ClipboardListIcon, PlusIcon } from "lucide-react"
import { PageActions } from "@/components/PageActions/PageActions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { recommendationLabels, statusLabels } from "../applicationDisplay"
import type { ApplicationListItem } from "../applications.functions"

// The applications (application-review.md, Applications): a homeowner's own, drafts among them, with starting a new one
// as the page's action; the committee's list of submitted applications instead.

export type ApplicationsPageProps = {
  applications: ApplicationListItem[]
  /** Committee members see every submitted application; homeowners see their own and can start one. */
  isCommittee: boolean
  onOpen: (applicationId: string) => void
}

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" })

/** A homeowner's applications with starting one as the page's action, or the committee's queue. */
export function ApplicationsPage({ applications, isCommittee, onOpen }: ApplicationsPageProps) {
  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      {isCommittee ? null : (
        <PageActions primary={{ label: "Start an application", icon: PlusIcon, href: "/applications/new" }} />
      )}
      <Card>
        <CardHeader>
          <CardTitle>{isCommittee ? "Applications" : "Your applications"}</CardTitle>
          <CardDescription>
            {isCommittee
              ? "Submitted applications wait for the committee's decision."
              : "A draft keeps your answers and files until you submit it. Open one to carry on."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {applications.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ClipboardListIcon />
                </EmptyMedia>
                <EmptyTitle>No applications yet</EmptyTitle>
                <EmptyDescription>
                  {isCommittee
                    ? "Applications appear here once homeowners submit them."
                    : "Start one, and it's kept as a draft until you submit it."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Latest review</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>
                    <span className="sr-only">Open</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {applications.map((application) => (
                  <TableRow key={application.id}>
                    <TableCell className="max-w-80">
                      <div className="font-medium">{application.projectTypeLabel ?? "Something else"}</div>
                      {application.description ? (
                        <div className="truncate text-muted-foreground">{application.description}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={application.status === "submitted" ? "default" : "outline"}>
                        {statusLabels[application.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {application.recommendation ? recommendationLabels[application.recommendation] : "Not reviewed"}
                    </TableCell>
                    <TableCell>{dateFormat.format(new Date(application.updatedAt))}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => onOpen(application.id)}>
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
