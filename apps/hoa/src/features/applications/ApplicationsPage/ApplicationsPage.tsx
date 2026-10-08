import { useForm } from "@tanstack/react-form"
import { ClipboardListIcon } from "lucide-react"
import { useState } from "react"
import { z } from "zod"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { projectTypeIds, projectTypes, type ProjectTypeId } from "@/rules/catalog"
import { recommendationLabels, statusLabels } from "../applicationDisplay"
import type { ApplicationListItem } from "../applications.functions"

const newApplicationSchema = z.object({
  projectType: z.enum(projectTypeIds),
  description: z.string().trim().max(4000, "Keep the description under 4,000 characters.")
})

export type NewApplication = { projectType: ProjectTypeId; description: string | null }

export type ApplicationsPageProps = {
  applications: ApplicationListItem[]
  /** Committee members see every application; homeowners see their own and can start one. */
  isCommittee: boolean
  onCreate: (application: NewApplication) => Promise<void>
  onOpen: (applicationId: string) => void
}

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" })

/** A homeowner's applications with a form to start one, or the committee's queue. */
export function ApplicationsPage({ applications, isCommittee, onCreate, onOpen }: ApplicationsPageProps) {
  const [error, setError] = useState<string | null>(null)
  const form = useForm({
    defaultValues: { projectType: "fence" as ProjectTypeId, description: "" },
    validators: { onSubmit: newApplicationSchema },
    onSubmit: async ({ value }) => {
      setError(null)
      try {
        await onCreate({ projectType: value.projectType, description: value.description.trim() || null })
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The application couldn't be created.")
      }
    }
  })

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      {isCommittee ? null : (
        <Card>
          <CardHeader>
            <CardTitle>Start an application</CardTitle>
            <CardDescription>
              Describe the project, then upload your packet. The review runs right away, so you can fix anything it
              finds before the committee sees it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void form.handleSubmit()
              }}
            >
              <FieldGroup>
                <form.Field name="projectType">
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor={field.name}>Project type</FieldLabel>
                      <NativeSelect
                        id={field.name}
                        value={field.state.value}
                        onChange={(event) => {
                          const projectType = projectTypeIds.find((item) => item === event.target.value)
                          if (projectType) {
                            field.handleChange(projectType)
                          }
                        }}
                      >
                        {projectTypeIds.map((id) => (
                          <NativeSelectOption key={id} value={id}>
                            {projectTypes[id].label}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </Field>
                  )}
                </form.Field>
                <form.Field name="description">
                  {(field) => (
                    <Field data-invalid={field.state.meta.errors.length > 0}>
                      <FieldLabel htmlFor={field.name}>Project description</FieldLabel>
                      <Textarea
                        id={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        aria-invalid={field.state.meta.errors.length > 0}
                        placeholder="Replace the side and rear fence with a Trex composite fence and a matching gate."
                      />
                      <FieldDescription>Optional. The review reads it alongside your files.</FieldDescription>
                      <FieldError errors={field.state.meta.errors} />
                    </Field>
                  )}
                </form.Field>
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                <form.Subscribe selector={(state) => state.isSubmitting}>
                  {(isSubmitting) => (
                    <Field orientation="horizontal">
                      <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? "Creating" : "Create application"}
                      </Button>
                    </Field>
                  )}
                </form.Subscribe>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{isCommittee ? "Applications" : "Your applications"}</CardTitle>
          <CardDescription>
            {isCommittee
              ? "Submitted applications wait for the committee's decision."
              : "Open an application to add files, review it again or submit it."}
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
                  {isCommittee ? "Applications appear here once homeowners start them." : "Start one above."}
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
                      <div className="font-medium">{projectTypes[application.projectType].label}</div>
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
