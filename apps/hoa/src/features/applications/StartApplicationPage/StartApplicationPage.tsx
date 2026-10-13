import { useForm } from "@tanstack/react-form"
import { ArrowLeftIcon } from "lucide-react"
import { useState } from "react"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldGroup } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { ProjectTypePicker, somethingElse, type ProjectTypeOption } from "../ProjectTypePicker/ProjectTypePicker"

// Starting an application (application-review.md, Applications): the homeowner chooses the kind of project, and the
// application starts as a draft that keeps what they add as they go, until they submit it.

export type StartApplicationPageProps = {
  /** The organization's project types to choose from; "Something else" is always offered. */
  projectTypes: readonly ProjectTypeOption[]
  /** Starts a draft of the chosen kind: a project type's id, or null for something else. */
  onStart: (projectTypeId: string | null) => Promise<void>
  /** Back to the list of applications. */
  onBack: () => void
}

const startSchema = z.object({ projectTypeId: z.string().min(1, "Choose the kind of project, or Something else.") })

/** The choice of what the project is, which starts the draft. */
export function StartApplicationPage({ projectTypes, onStart, onBack }: StartApplicationPageProps) {
  const [error, setError] = useState<string | null>(null)
  const form = useForm({
    defaultValues: { projectTypeId: "" },
    validators: { onSubmit: startSchema },
    onSubmit: async ({ value }) => {
      setError(null)
      try {
        await onStart(value.projectTypeId === somethingElse ? null : value.projectTypeId)
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The application couldn't be started.")
      }
    }
  })
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-4 lg:px-6">
      <Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" onClick={onBack}>
        <ArrowLeftIcon />
        Applications
      </Button>
      {/* The site header names the page; this says what starting one means. */}
      <p className="mb-1 max-w-prose text-pretty text-muted-foreground">
        Your application is a draft until you submit it. Everything you add is saved as you go, so you can leave and
        come back to it.
      </p>
      <Card>
        <CardContent>
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              void form.handleSubmit()
            }}
          >
            <FieldGroup className="gap-6">
              <form.Field name="projectTypeId">
                {(field) => (
                  <ProjectTypePicker
                    types={projectTypes}
                    value={field.state.value}
                    onChange={field.handleChange}
                    errors={field.state.meta.errors}
                  />
                )}
              </form.Field>
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                  <Field orientation="horizontal">
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting ? <Spinner /> : null}
                      Start the application
                    </Button>
                  </Field>
                )}
              </form.Subscribe>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
