import { useForm } from "@tanstack/react-form"
import { Link } from "@tanstack/react-router"
import {
  BookCheckIcon,
  FileTextIcon,
  InboxIcon,
  LayersIcon,
  ListChecksIcon,
  PlusIcon,
  SparklesIcon,
  TriangleAlertIcon,
  XIcon
} from "lucide-react"
import { useId, useState } from "react"
import { z } from "zod"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
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
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
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
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { ProjectTypeDefinition, ProjectTypeStatus } from "@/projectTypes/projectType"
import type { ProjectTypeSuggestion } from "@/projectTypes/suggest"
import { outdatedText } from "../outdated"
import { ProjectTypeMenu } from "../ProjectTypeMenu/ProjectTypeMenu"
import type { ProjectTypesOverview } from "../projectTypes.functions"

// The administrator's project types (application-review.md, Project types): the organization's types as cards, a dialog
// to add one by hand, and suggestions from the governing documents to accept or dismiss. Until a rulebook is published
// there's nothing to build a type from, so the page is an empty state that leads to the rulebook.

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

/** Suggestions read from the published rulebook: none until asked for, then loading, then each to add or dismiss. */
function useSuggestions({ onCreate, onSuggest }: Pick<ProjectTypesPageProps, "onCreate" | "onSuggest">) {
  const [isShown, setIsShown] = useState(false)
  const [suggestions, setSuggestions] = useState<ProjectTypeSuggestion[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const suggest = async () => {
    setIsShown(true)
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
  const dismiss = (label: string) =>
    setSuggestions((current) => current?.filter((item) => item.label !== label) ?? null)
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
      dismiss(suggestion.label)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The project type couldn't be added.")
    } finally {
      setAdding(null)
    }
  }
  return { isShown, suggestions, isLoading, adding, error, suggest, dismiss, accept, close: () => setIsShown(false) }
}

type SuggestionState = ReturnType<typeof useSuggestions>

/** What a definition asks of the homeowner, and how many applications use the type, each with its icon. */
function TypeStats({ definition, applicationCount }: { definition: ProjectTypeDefinition; applicationCount?: number }) {
  const questions = definition.groups.reduce((total, group) => total + group.fields.length, 0)
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  const stats = [
    { icon: ListChecksIcon, text: count(questions, "question", "questions") },
    { icon: FileTextIcon, text: count(definition.documents.length, "document", "documents") },
    ...(applicationCount === undefined
      ? []
      : [{ icon: InboxIcon, text: count(applicationCount, "application", "applications") }])
  ]
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground" aria-label="What it asks">
      {stats.map(({ icon: Icon, text }) => (
        <li key={text} className="flex items-center gap-1.5">
          <Icon className="size-3.5 shrink-0" aria-hidden />
          {text}
        </li>
      ))}
    </ul>
  )
}

/** The suggestions, once asked for, above the types: each to add or dismiss. */
function SuggestionsSection({ state }: { state: SuggestionState }) {
  const headingId = useId()
  const { suggestions, isLoading, adding, error } = state
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4 rounded-xl border border-dashed p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h3 id={headingId} className="flex items-center gap-2 font-medium">
            <SparklesIcon className="size-4 text-muted-foreground" aria-hidden />
            Suggested from your governing documents
          </h3>
          <p className="text-sm text-muted-foreground">
            Read from the published rulebook. Each keeps only the questions its rules check and the documents they
            require.
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Close suggestions" onClick={state.close}>
          <XIcon />
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {isLoading ? (
        <output className="grid gap-3 md:grid-cols-2" aria-label="Reading your rulebook">
          <Skeleton className="h-32 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
        </output>
      ) : null}
      {!isLoading && suggestions?.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing new to suggest.</p>
      ) : null}
      {!isLoading && suggestions && suggestions.length > 0 ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {suggestions.map((suggestion) => (
            <li key={suggestion.label}>
              <Card size="sm" className="h-full">
                <CardHeader>
                  <CardTitle>{suggestion.label}</CardTitle>
                  <CardDescription>{suggestion.description}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto flex flex-col gap-3">
                  <TypeStats definition={suggestion.definition} />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => state.dismiss(suggestion.label)}>
                      Dismiss
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void state.accept(suggestion)}
                      disabled={adding !== null}
                      aria-label={`Add ${suggestion.label}`}
                    >
                      {adding === suggestion.label ? <Spinner /> : <PlusIcon />}
                      Add
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

type TypeCardProps = Pick<ProjectTypesPageProps, "onOpen" | "onSetStatus" | "onDelete"> & {
  type: ProjectTypesOverview["projectTypes"][number]
  onError: (message: string) => void
}

/** A project type as a card: the whole card opens it; its menu archives or deletes it. */
function TypeCard({ type, onOpen, onSetStatus, onDelete, onError }: TypeCardProps) {
  const isArchived = type.status === "archived"
  return (
    <Card
      className={cn(
        "relative h-full transition-shadow focus-within:ring-2 focus-within:ring-ring/50 hover:ring-foreground/20",
        isArchived && "bg-muted/40"
      )}
    >
      <CardHeader>
        <div className="flex items-center gap-3">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
            aria-hidden
          >
            <LayersIcon className="size-4.5" />
          </span>
          <CardTitle className="flex min-w-0 items-center gap-2">
            {/* The title's button covers the card, so a click anywhere on it opens the type. */}
            <button
              type="button"
              className="truncate text-left outline-none after:absolute after:inset-0 after:content-['']"
              onClick={() => onOpen(type.id)}
            >
              {type.label}
            </button>
            {isArchived ? <Badge variant="outline">Archived</Badge> : null}
          </CardTitle>
        </div>
        {type.description ? <CardDescription className="mt-1 line-clamp-2">{type.description}</CardDescription> : null}
        <CardAction className="relative z-10">
          <ProjectTypeMenu
            label={type.label}
            status={type.status}
            applicationCount={type.applicationCount}
            onOpen={() => onOpen(type.id)}
            onSetStatus={(status) => onSetStatus(type.id, status)}
            onDelete={() => onDelete(type.id)}
            onError={onError}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="mt-auto flex flex-col gap-2">
        {isArchived ? (
          <p className="text-sm text-muted-foreground">Hidden from new applications</p>
        ) : (
          <TypeStats definition={type.definition} applicationCount={type.applicationCount} />
        )}
        {type.outdatedSince !== null && !isArchived ? (
          <p className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400">
            <TriangleAlertIcon className="size-3.5 shrink-0" aria-hidden />
            {outdatedText(type.outdatedSince)}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

/** Before a rulebook is published there's nothing to build a project type from, so the page says only that. */
function PublishFirst() {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <BookCheckIcon />
        </EmptyMedia>
        <EmptyTitle>Publish your rulebook first</EmptyTitle>
        <EmptyDescription>
          Project types are built from the published rules: each asks homeowners for the details the rules check and the
          documents they require.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link to="/rules" className={buttonVariants()}>
          Go to the rulebook
        </Link>
      </EmptyContent>
    </Empty>
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
  const suggestions = useSuggestions({ onCreate, onSuggest })
  const { projectTypes, subjects, hasPublishedRulebook } = overview
  if (!hasPublishedRulebook) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col px-4 lg:px-6">
        <PublishFirst />
      </div>
    )
  }
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 lg:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-2xl flex-col gap-1">
          <h2 className="text-2xl font-semibold tracking-tight">Project types</h2>
          <p className="text-muted-foreground">
            What homeowners choose when they apply. Each asks for the details the rules check and the documents they
            require.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void suggestions.suggest()} disabled={suggestions.isLoading}>
            {suggestions.isLoading ? <Spinner /> : <SparklesIcon />}
            {suggestions.suggestions ? "Suggest again" : "Suggest project types"}
          </Button>
          <Button onClick={() => setIsAdding(true)}>
            <PlusIcon />
            Add project type
          </Button>
        </div>
      </header>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {suggestions.isShown ? <SuggestionsSection state={suggestions} /> : null}
      {projectTypes.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LayersIcon />
            </EmptyMedia>
            <EmptyTitle>No project types yet</EmptyTitle>
            <EmptyDescription>
              Homeowners choose one when they apply. Let the rulebook suggest them, or add one yourself.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Project types">
          {projectTypes.map((type) => (
            <li key={type.id}>
              <TypeCard type={type} onOpen={onOpen} onSetStatus={onSetStatus} onDelete={onDelete} onError={setError} />
            </li>
          ))}
        </ul>
      )}
      <AddProjectTypeDialog subjects={subjects} isOpen={isAdding} onOpenChange={setIsAdding} onCreate={onCreate} />
    </div>
  )
}
