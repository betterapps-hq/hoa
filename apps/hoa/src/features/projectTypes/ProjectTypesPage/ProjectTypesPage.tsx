import { useForm } from "@tanstack/react-form"
import { LayersIcon, SparklesIcon } from "lucide-react"
import { useState } from "react"
import { z } from "zod"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import type { ProjectTypeDefinition, ProjectTypeStatus } from "@/projectTypes/projectType"
import type { ProjectTypeSuggestion } from "@/projectTypes/suggest"
import { outdatedText } from "../outdated"
import { ProjectTypeMenu } from "../ProjectTypeMenu/ProjectTypeMenu"
import type { ProjectTypesOverview } from "../projectTypes.functions"

// The administrator's project types (application-review.md, Project types): the organization's list, a dialog to add
// one by hand, and suggestions from the governing documents to accept or dismiss.

export type NewProjectType = {
  label: string
  description: string
  subjects: string[]
  definition: ProjectTypeDefinition | null
}

export type ProjectTypesPageProps = {
  overview: ProjectTypesOverview
  onCreate: (input: NewProjectType) => Promise<void>
  onSuggest: () => Promise<ProjectTypeSuggestion[]>
  onOpen: (projectTypeId: string) => void
  onSetStatus: (projectTypeId: string, status: ProjectTypeStatus) => Promise<void>
  onDelete: (projectTypeId: string) => Promise<void>
}

const newTypeSchema = z.object({
  label: z.string().trim().min(1, "Give the project type a name.").max(80, "Keep the name under 80 characters."),
  description: z.string().trim().max(1000, "Keep the description under 1,000 characters."),
  subjects: z.array(z.string())
})

/** "3 questions and 2 documents": what a definition asks of the homeowner. */
export function definitionSummary(definition: ProjectTypeDefinition) {
  const questions = definition.groups.reduce((total, group) => total + group.fields.length, 0)
  const documents = definition.documents.length
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  return `${count(questions, "question", "questions")} and ${count(documents, "document", "documents")}`
}

type AddDialogProps = Pick<ProjectTypesPageProps, "onCreate"> & {
  subjects: ProjectTypesOverview["subjects"]
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
}

function AddProjectTypeDialog({ subjects, isOpen, onOpenChange, onCreate }: AddDialogProps) {
  const [error, setError] = useState<string | null>(null)
  const form = useForm({
    defaultValues: { label: "", description: "", subjects: [] as string[] },
    validators: { onSubmit: newTypeSchema },
    onSubmit: async ({ value }) => {
      setError(null)
      try {
        await onCreate({ ...value, definition: null })
        form.reset()
        onOpenChange(false)
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The project type couldn't be added.")
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
            <DialogTitle>Add a project type</DialogTitle>
            <DialogDescription>
              Its form starts with every detail the rules check about what it covers and the documents they require. You
              can reorder, reword or remove them next.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <form.Field name="label">
              {(field) => (
                <Field data-invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor="project-type-label">Name</FieldLabel>
                  <Input
                    id="project-type-label"
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
                  <FieldLabel htmlFor="project-type-description">Description</FieldLabel>
                  <Textarea
                    id="project-type-description"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
                  <FieldDescription>Homeowners see it when they choose, and the review reads it.</FieldDescription>
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>
            {subjects.length > 0 ? (
              <form.Field name="subjects">
                {(field) => (
                  <FieldSet>
                    <FieldLegend variant="label">What it covers</FieldLegend>
                    <FieldDescription>
                      The things the rulebook&apos;s rules apply to. Leave all unchecked for rules about the work as a
                      whole.
                    </FieldDescription>
                    <FieldGroup className="gap-3">
                      {subjects.map((subject) => {
                        const id = `project-type-subject-${subject.key}`
                        const isChecked = field.state.value.includes(subject.key)
                        return (
                          <Field key={subject.key} orientation="horizontal">
                            <Checkbox
                              id={id}
                              checked={isChecked}
                              onCheckedChange={(checked) =>
                                field.handleChange(
                                  checked
                                    ? [...field.state.value, subject.key]
                                    : field.state.value.filter((key) => key !== subject.key)
                                )
                              }
                            />
                            <FieldContent>
                              <FieldLabel htmlFor={id} className="font-normal">
                                {subject.label.charAt(0).toUpperCase() + subject.label.slice(1)}
                              </FieldLabel>
                              {subject.definition ? <FieldDescription>{subject.definition}</FieldDescription> : null}
                            </FieldContent>
                          </Field>
                        )
                      })}
                    </FieldGroup>
                  </FieldSet>
                )}
              </form.Field>
            ) : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </FieldGroup>
          <DialogFooter>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? <Spinner /> : null}
                  Add project type
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type SuggestionsProps = Pick<ProjectTypesPageProps, "onCreate" | "onSuggest"> & { isEnabled: boolean }

function Suggestions({ onCreate, onSuggest, isEnabled }: SuggestionsProps) {
  const [suggestions, setSuggestions] = useState<ProjectTypeSuggestion[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const suggest = async () => {
    setIsLoading(true)
    setError(null)
    try {
      setSuggestions(await onSuggest())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Suggestions aren't available right now.")
    } finally {
      setIsLoading(false)
    }
  }
  const remove = (label: string) => setSuggestions((current) => current?.filter((item) => item.label !== label) ?? null)
  const accept = async (suggestion: ProjectTypeSuggestion) => {
    setAdding(suggestion.label)
    setError(null)
    try {
      await onCreate({
        label: suggestion.label,
        description: suggestion.description,
        subjects: suggestion.definition.subjects,
        definition: suggestion.definition
      })
      remove(suggestion.label)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The project type couldn't be added.")
    } finally {
      setAdding(null)
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Suggestions from your governing documents</CardTitle>
        <CardDescription>
          Read from the published rulebook. Each keeps only questions its rules test and documents they require.
        </CardDescription>
        <CardAction>
          <Button variant="outline" onClick={() => void suggest()} disabled={!isEnabled || isLoading}>
            {isLoading ? <Spinner /> : <SparklesIcon />}
            {suggestions ? "Suggest again" : "Suggest project types"}
          </Button>
        </CardAction>
      </CardHeader>
      {error || suggestions ? (
        <CardContent className="flex flex-col gap-3">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {suggestions && suggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing new to suggest.</p>
          ) : null}
          {suggestions && suggestions.length > 0 ? (
            <ItemGroup className="gap-3">
              {suggestions.map((suggestion) => (
                <Item key={suggestion.label} variant="outline">
                  <ItemContent>
                    <ItemTitle>{suggestion.label}</ItemTitle>
                    <ItemDescription className="line-clamp-none">{suggestion.description}</ItemDescription>
                    <p className="text-sm text-muted-foreground">{definitionSummary(suggestion.definition)}</p>
                  </ItemContent>
                  <ItemActions>
                    <Button variant="ghost" size="sm" onClick={() => remove(suggestion.label)}>
                      Dismiss
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void accept(suggestion)}
                      disabled={adding !== null}
                      aria-label={`Add ${suggestion.label}`}
                    >
                      {adding === suggestion.label ? <Spinner /> : null}
                      Add
                    </Button>
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  )
}

/** The organization's project types, suggestions from its rulebook, and a way to add one by hand. */
export function ProjectTypesPage({
  overview,
  onCreate,
  onSuggest,
  onOpen,
  onSetStatus,
  onDelete
}: ProjectTypesPageProps) {
  const [isAdding, setIsAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { projectTypes, subjects, hasPublishedRulebook } = overview
  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      {hasPublishedRulebook ? null : (
        <Alert>
          <AlertTitle>Publish the rulebook first</AlertTitle>
          <AlertDescription>Project types are built from the published rules.</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Project types</CardTitle>
          <CardDescription>
            What homeowners choose when they apply. Each asks for the details the rules test and lists the documents
            they require.
          </CardDescription>
          <CardAction>
            <Button onClick={() => setIsAdding(true)} disabled={!hasPublishedRulebook}>
              Add project type
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {projectTypes.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <LayersIcon />
                </EmptyMedia>
                <EmptyTitle>No project types yet</EmptyTitle>
                <EmptyDescription>Add one, or start from the suggestions below.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ItemGroup className="gap-3">
              {projectTypes.map((type) => (
                <Item key={type.id} variant="outline">
                  <ItemContent>
                    <ItemTitle>
                      <button
                        type="button"
                        className="rounded-sm text-left hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                        onClick={() => onOpen(type.id)}
                      >
                        {type.label}
                      </button>
                      {type.status === "archived" ? <Badge variant="outline">Archived</Badge> : null}
                    </ItemTitle>
                    {type.description ? <ItemDescription>{type.description}</ItemDescription> : null}
                    <p className="text-sm text-muted-foreground">
                      {type.status === "archived" ? "Hidden from new applications" : definitionSummary(type.definition)}
                    </p>
                    {type.outdatedSince !== null && type.status === "active" ? (
                      <p className="text-sm text-muted-foreground">{outdatedText(type.outdatedSince)}</p>
                    ) : null}
                  </ItemContent>
                  <ItemActions>
                    <ProjectTypeMenu
                      label={type.label}
                      status={type.status}
                      applicationCount={type.applicationCount}
                      onOpen={() => onOpen(type.id)}
                      onSetStatus={(status) => onSetStatus(type.id, status)}
                      onDelete={() => onDelete(type.id)}
                      onError={setError}
                    />
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          )}
        </CardContent>
      </Card>
      <Suggestions onCreate={onCreate} onSuggest={onSuggest} isEnabled={hasPublishedRulebook} />
      <AddProjectTypeDialog subjects={subjects} isOpen={isAdding} onOpenChange={setIsAdding} onCreate={onCreate} />
    </div>
  )
}
