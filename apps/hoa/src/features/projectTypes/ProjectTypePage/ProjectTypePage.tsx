import { useForm } from "@tanstack/react-form"
import { Link } from "@tanstack/react-router"
import { ArrowLeftIcon, XIcon } from "lucide-react"
import { useState } from "react"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { projectTypeDetails, type ProjectField, type ProjectTypeDefinition } from "@/projectTypes/projectType"
import { RuleReference } from "../../rulebook/RuleReference/RuleReference"
import type { ProjectTypeView } from "../projectTypes.functions"

// One project type (application-review.md, Project types): its name and description, the questions its form asks
// (remove one, make it required, add one back), the documents the rules require, every requirement the rulebook
// places on this kind of project, and retiring or deleting it.

export type ProjectTypeChanges = { label: string; description: string; definition: ProjectTypeDefinition }

export type ProjectTypePageProps = {
  view: ProjectTypeView
  onSave: (changes: ProjectTypeChanges) => Promise<void>
  onRefresh: () => Promise<void>
  onSetStatus: (status: "active" | "retired") => Promise<void>
  onDelete: () => Promise<void>
}

const kindText = (field: ProjectField) => {
  switch (field.kind) {
    case "number":
      return field.unit ? `A number in ${field.unit.label}` : "A number"
    case "choice": {
      const choices = field.options.length === 1 ? "One choice" : `One of ${field.options.length} choices`
      return field.allowsOther ? `${choices}, or another` : choices
    }
    case "yes-no":
      return "Yes or no"
    case "date":
      return "A date"
    case "long-text":
      return "A description"
    default:
      return "Text"
  }
}

const messageOf = (caught: unknown, fallback: string) => (caught instanceof Error ? caught.message : fallback)

type DetailsDialogProps = {
  label: string
  description: string | null
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  onSave: (details: { label: string; description: string }) => Promise<void>
}

function DetailsDialog({ label, description, isOpen, onOpenChange, onSave }: DetailsDialogProps) {
  const [error, setError] = useState<string | null>(null)
  const form = useForm({
    defaultValues: { label, description: description ?? "" },
    validators: { onSubmit: projectTypeDetails },
    onSubmit: async ({ value }) => {
      setError(null)
      try {
        await onSave(value)
        onOpenChange(false)
      } catch (caught) {
        setError(messageOf(caught, "The changes weren't saved."))
      }
    }
  })
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit project type</DialogTitle>
            <DialogDescription>Homeowners see the name and description when they choose.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <form.Field name="label">
              {(field) => (
                <Field data-invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor="edit-project-type-label">Name</FieldLabel>
                  <Input
                    id="edit-project-type-label"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>
            <form.Field name="description">
              {(field) => (
                <Field data-invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor="edit-project-type-description">Description</FieldLabel>
                  <Textarea
                    id="edit-project-type-description"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
                  <FieldDescription>The review reads it as a hint about what the application is for.</FieldDescription>
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </FieldGroup>
          <DialogFooter>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? <Spinner /> : null}
                  Save
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type QuestionsProps = {
  definition: ProjectTypeDefinition
  available: ProjectTypeDefinition
  onSave: (definition: ProjectTypeDefinition) => Promise<void>
}

/** The form's questions, editable as a draft and saved together. */
function Questions({ definition, available, onSave }: QuestionsProps) {
  const [draft, setDraft] = useState(definition)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isChanged = JSON.stringify(draft) !== JSON.stringify(definition)
  const groups = available.groups.map((group) => ({
    available: group,
    current: draft.groups.find((item) => item.subject === group.subject) ?? { ...group, fields: [] }
  }))
  const setFields = (subject: string, fields: ProjectField[]) => {
    const others = draft.groups.filter((group) => group.subject !== subject)
    const base = available.groups.find((group) => group.subject === subject)
    const current = draft.groups.find((group) => group.subject === subject) ?? base
    const next = current && fields.length > 0 ? [{ ...current, fields }] : []
    // Keep the rules' group order.
    const order = available.groups.map((group) => group.subject)
    setDraft({
      ...draft,
      groups: [...others, ...next].toSorted((a, b) => order.indexOf(a.subject) - order.indexOf(b.subject))
    })
  }
  const save = async () => {
    setIsSaving(true)
    setError(null)
    try {
      await onSave(draft)
    } catch (caught) {
      setError(messageOf(caught, "The questions weren't saved."))
    } finally {
      setIsSaving(false)
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Questions</CardTitle>
        <CardDescription>
          What the form asks the homeowner. Each answers a detail the rules test, so the review reads it as stated.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {groups.map(({ available: group, current }) => {
          const missing = group.fields.filter(
            (field) => !current.fields.some((item) => item.property === field.property)
          )
          return (
            <section key={group.subject} className="flex flex-col gap-3" aria-labelledby={`group-${group.subject}`}>
              <h3 id={`group-${group.subject}`} className="text-sm font-medium">
                {group.label}
                {group.isRepeatable ? (
                  <span className="font-normal text-muted-foreground"> (homeowners can add several)</span>
                ) : null}
              </h3>
              {current.fields.length === 0 ? (
                <p className="text-sm text-muted-foreground">No questions.</p>
              ) : (
                <ItemGroup className="gap-2">
                  {current.fields.map((field) => {
                    const requiredId = `required-${group.subject}-${field.property}`
                    return (
                      <Item key={field.property} variant="outline" size="sm">
                        <ItemContent>
                          <ItemTitle>{field.label}</ItemTitle>
                          <ItemDescription>{kindText(field)}</ItemDescription>
                        </ItemContent>
                        <ItemActions>
                          <Field orientation="horizontal" className="w-auto">
                            <Checkbox
                              id={requiredId}
                              checked={field.isRequired}
                              onCheckedChange={(checked) =>
                                setFields(
                                  group.subject,
                                  current.fields.map((item) =>
                                    item.property === field.property ? { ...item, isRequired: checked } : item
                                  )
                                )
                              }
                            />
                            <FieldLabel htmlFor={requiredId} className="font-normal">
                              Required
                            </FieldLabel>
                          </Field>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remove ${field.label}`}
                            onClick={() =>
                              setFields(
                                group.subject,
                                current.fields.filter((item) => item.property !== field.property)
                              )
                            }
                          >
                            <XIcon />
                          </Button>
                        </ItemActions>
                      </Item>
                    )
                  })}
                </ItemGroup>
              )}
              {missing.length > 0 ? (
                <Field className="max-w-sm">
                  <FieldLabel htmlFor={`add-${group.subject}`} className="sr-only">
                    Add a question about {group.label.toLowerCase()}
                  </FieldLabel>
                  <NativeSelect
                    id={`add-${group.subject}`}
                    size="sm"
                    value=""
                    onChange={(event) => {
                      const field = missing.find((item) => item.property === event.target.value)
                      if (field) {
                        setFields(group.subject, [...current.fields, field])
                      }
                    }}
                  >
                    <NativeSelectOption value="">Add a question</NativeSelectOption>
                    {missing.map((field) => (
                      <NativeSelectOption key={field.property} value={field.property}>
                        {field.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
              ) : null}
            </section>
          )
        })}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
      {isChanged ? (
        <CardFooter className="gap-2">
          <Button onClick={() => void save()} disabled={isSaving}>
            {isSaving ? <Spinner /> : null}
            Save questions
          </Button>
          <Button variant="ghost" onClick={() => setDraft(definition)} disabled={isSaving}>
            Discard changes
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  )
}

/** A project type's page for the administrator. */
export function ProjectTypePage({ view, onSave, onRefresh, onSetStatus, onDelete }: ProjectTypePageProps) {
  const { projectType, applicationCount, requirements, subjectLabels, isOutdated } = view
  const [isEditing, setIsEditing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isRetired = projectType.status === "retired"
  const retireAction = isRetired ? "Offer again" : "Retire"
  const statusAction = applicationCount > 0 ? retireAction : "Delete"
  const act = async (action: () => Promise<void>, fallback: string) => {
    setIsBusy(true)
    setError(null)
    try {
      await action()
    } catch (caught) {
      setError(messageOf(caught, fallback))
    } finally {
      setIsBusy(false)
    }
  }
  const details = { label: projectType.label, description: projectType.description ?? "" }
  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        render={<Link to="/project-types" />}
        nativeButton={false}
      >
        <ArrowLeftIcon />
        Project types
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="text-xl font-semibold">{projectType.label}</h2>
          </CardTitle>
          <CardDescription className="flex flex-col gap-1">
            {projectType.description ? <span>{projectType.description}</span> : <span>No description yet.</span>}
            {subjectLabels.length > 0 ? <span>Covers {subjectLabels.join(", ")}.</span> : null}
            {isRetired ? <span>Retired: hidden from new applications.</span> : null}
          </CardDescription>
          <CardAction>
            <Button variant="outline" onClick={() => setIsEditing(true)}>
              Edit
            </Button>
          </CardAction>
        </CardHeader>
      </Card>
      {isOutdated ? (
        <Alert>
          <AlertTitle>The rulebook changed</AlertTitle>
          <AlertDescription>
            This form was built against an earlier rulebook. Update it to ask what the published rules test.
          </AlertDescription>
          <AlertAction>
            <Button
              size="sm"
              variant="outline"
              disabled={isBusy}
              onClick={() => void act(onRefresh, "It wasn't updated.")}
            >
              Update
            </Button>
          </AlertAction>
        </Alert>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Questions
        key={JSON.stringify(projectType.definition)}
        definition={projectType.definition}
        available={view.available}
        onSave={(definition) => onSave({ ...details, definition })}
      />
      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
          <CardDescription>What the rules ask the homeowner to include. They come from the rulebook.</CardDescription>
        </CardHeader>
        <CardContent>
          {projectType.definition.documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">The rules ask for no documents.</p>
          ) : (
            <ItemGroup className="gap-2">
              {projectType.definition.documents.map((document) => (
                <Item key={document.documentType} variant="outline" size="sm">
                  <ItemContent>
                    <ItemTitle>{document.label}</ItemTitle>
                    {document.mustShow.length > 0 ? (
                      <ItemDescription className="line-clamp-none">
                        Must show: {document.mustShow.join("; ")}.
                      </ItemDescription>
                    ) : null}
                  </ItemContent>
                </Item>
              ))}
            </ItemGroup>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Requirements</CardTitle>
          <CardDescription>
            Every rule the published rulebook applies to this kind of project, with where it comes from.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {requirements.length === 0 ? (
            <p className="text-sm text-muted-foreground">No published rules apply yet.</p>
          ) : (
            requirements.map((group) => (
              <section key={group.id} className="flex flex-col gap-3" aria-labelledby={`requirements-${group.id}`}>
                <h3 id={`requirements-${group.id}`} className="text-sm font-medium">
                  {group.title}
                </h3>
                <ul className="flex flex-col gap-3">
                  {group.rules.map((rule) => (
                    <li key={rule.key} className="flex flex-col gap-1 text-sm">
                      <RuleReference rule={rule} />
                      <span className="text-muted-foreground">{rule.statement}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{statusAction}</CardTitle>
          <CardDescription>
            {applicationCount > 0
              ? `${applicationCount} ${applicationCount === 1 ? "application uses" : "applications use"} this project type, so it can be retired but not deleted. Retired types are hidden from new applications.`
              : "No application uses this project type yet."}
          </CardDescription>
          <CardAction>
            {applicationCount > 0 ? (
              <Button
                variant="outline"
                disabled={isBusy}
                onClick={() =>
                  void act(() => onSetStatus(isRetired ? "active" : "retired"), "The project type wasn't changed.")
                }
              >
                {statusAction}
              </Button>
            ) : (
              <Button variant="destructive" disabled={isBusy} onClick={() => setIsDeleting(true)}>
                Delete
              </Button>
            )}
          </CardAction>
        </CardHeader>
      </Card>
      <DetailsDialog
        key={`${details.label}\n${details.description}`}
        label={details.label}
        description={projectType.description}
        isOpen={isEditing}
        onOpenChange={setIsEditing}
        onSave={(changes) => onSave({ ...changes, definition: projectType.definition })}
      />
      <AlertDialog open={isDeleting} onOpenChange={setIsDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {projectType.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              Homeowners won&apos;t be able to choose it. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void act(onDelete, "The project type wasn't deleted.")}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
