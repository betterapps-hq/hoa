import { useForm } from "@tanstack/react-form"
import { ClipboardListIcon } from "lucide-react"
import { useState } from "react"
import { z } from "zod"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { acceptFor } from "@/storage/uploadRules"
import { recommendationLabels, statusLabels } from "../applicationDisplay"
import type { ApplicationListItem } from "../applications.functions"
import type { ProjectKindOption } from "../applicationView"
import { ProjectKindPicker, somethingElse } from "../ProjectKindPicker/ProjectKindPicker"
import { uploadProblem } from "../uploadApplicationFiles"

const newApplicationSchema = z.object({
  projectKind: z.string().min(1, "Choose the kind of project, or Something else."),
  description: z.string().trim().max(4000, "Keep the description under 4,000 characters."),
  files: z
    .array(z.instanceof(File))
    .min(1, "Add your application packet.")
    .superRefine((files, context) => {
      const problem = uploadProblem(files)
      if (problem) {
        context.addIssue({ code: "custom", message: problem })
      }
    })
})

export type NewApplication = { projectKind: string | null; description: string | null; files: File[] }

export type ApplicationsPageProps = {
  applications: ApplicationListItem[]
  /** The rulebook's project kinds to choose from; "Something else" is always offered. */
  projectKinds: ProjectKindOption[]
  /** Committee members see every application; homeowners see their own and can start one. */
  isCommittee: boolean
  onCreate: (application: NewApplication) => Promise<void>
  onOpen: (applicationId: string) => void
}

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" })

/** A homeowner's applications with a form to start one, or the committee's queue. */
export function ApplicationsPage({ applications, projectKinds, isCommittee, onCreate, onOpen }: ApplicationsPageProps) {
  const [error, setError] = useState<string | null>(null)
  const form = useForm({
    defaultValues: { projectKind: "", description: "", files: [] as File[] },
    validators: { onSubmit: newApplicationSchema },
    onSubmit: async ({ value }) => {
      setError(null)
      try {
        await onCreate({
          projectKind: value.projectKind === somethingElse ? null : value.projectKind,
          description: value.description.trim() || null,
          files: value.files
        })
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
              Describe the project and add your packet. The review runs right away, so you can fix anything it finds
              before the committee sees it.
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
                <form.Field name="projectKind">
                  {(field) => (
                    <ProjectKindPicker
                      kinds={projectKinds}
                      value={field.state.value}
                      onChange={field.handleChange}
                      errors={field.state.meta.errors}
                    />
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
                <form.Field name="files">
                  {(field) => (
                    <Field data-invalid={field.state.meta.errors.length > 0}>
                      <FieldLabel htmlFor={field.name}>Application packet</FieldLabel>
                      <Input
                        id={field.name}
                        type="file"
                        multiple
                        accept={acceptFor.application}
                        onChange={(event) => field.handleChange([...(event.target.files ?? [])])}
                        aria-invalid={field.state.meta.errors.length > 0}
                      />
                      <FieldDescription>
                        The application form, plot plan, photos and anything else you’re submitting. PDF, Word, JPEG or
                        PNG; photos up to 5 MB each.
                      </FieldDescription>
                      <FieldError errors={field.state.meta.errors} />
                    </Field>
                  )}
                </form.Field>
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                <form.Subscribe selector={(state) => state.isSubmitting}>
                  {(isSubmitting) => (
                    <Field orientation="horizontal">
                      <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? "Uploading" : "Upload and review"}
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
                      <div className="font-medium">{application.projectKindLabel ?? "Something else"}</div>
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
