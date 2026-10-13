import { useForm } from "@tanstack/react-form"
import { Link } from "@tanstack/react-router"
import { ArrowLeftIcon, ChevronDownIcon, CircleCheckIcon } from "lucide-react"
import { useState } from "react"
import { PageActions } from "@/components/PageActions/PageActions"
import { SaveStatus } from "@/components/SaveStatus/SaveStatus"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
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
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { CitationsOpenInSheet } from "@/features/documents/ReaderSheet/ReaderSheet"
import { useAutosave } from "@/hooks/useAutosave"
import { bindDefinition } from "@/projectTypes/bind"
import {
  projectTypeDetails,
  type DocumentTemplate,
  type ProjectTypeDefinition,
  type ProjectTypeStatus
} from "@/projectTypes/projectType"
import { applyChanges } from "@/projectTypes/updates"
import type { CitedProvision } from "../../rulebook/citedProvision"
import { RuleReference } from "../../rulebook/RuleReference/RuleReference"
import { DocumentsCard } from "../DocumentsCard/DocumentsCard"
import { outdatedText } from "../outdated"
import { useProjectTypeActions } from "../ProjectTypeMenu/ProjectTypeMenu"
import type { ProjectTypeView } from "../projectTypes.functions"
import { QuestionsCard, type DefinitionUpdate } from "../QuestionsCard/QuestionsCard"
import { changesSummary, UpdatesDialog } from "../UpdatesDialog/UpdatesDialog"

// One project type (application-review.md, Project types): its name and description, the questions its form asks and
// the documents it lists, edited in place and saved as they change, every requirement the rulebook places on this kind
// of project, and archiving or deleting it.

export type ProjectTypeChanges = { label: string; description: string; definition: ProjectTypeDefinition }

export type ProjectTypePageProps = {
  view: ProjectTypeView
  onSave: (changes: ProjectTypeChanges) => Promise<void>
  /** Brings the type up to date with the published rulebook with the reviewed form. */
  onApplyUpdates: (definition: ProjectTypeDefinition) => Promise<void>
  onSetStatus: (status: ProjectTypeStatus) => Promise<void>
  onDelete: () => Promise<void>
  /** Every passage of the rulebook's documents, for linking one to a question. */
  loadProvisions: () => Promise<CitedProvision[]>
  /** Uploads a document's new template and returns what the document keeps of it. */
  uploadTemplate: (file: File) => Promise<DocumentTemplate>
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
          noValidate
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
                  <FieldDescription>One sentence on what it covers. The review reads it too.</FieldDescription>
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

type EditorProps = ProjectTypePageProps & { onReset: () => void }

function ProjectTypeEditor({
  view,
  onSave,
  onApplyUpdates,
  onSetStatus,
  onDelete,
  loadProvisions,
  uploadTemplate,
  onReset
}: EditorProps) {
  const { projectType, applicationCount, requirements, subjectLabels, isOutdated, updates } = view
  const [isReviewing, setIsReviewing] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const details = { label: projectType.label, description: projectType.description ?? "" }
  const editor = useAutosave(projectType.definition, (definition) => onSave({ ...details, definition }))
  const rules = new Map(requirements.flatMap((group) => group.rules).map((rule) => [rule.key, rule]))
  // Each change is bound as saving binds it, so what a question answers follows its citations right away.
  const update: DefinitionUpdate = (change) =>
    editor.update((current) => bindDefinition(change(current), view.available))
  const ruleCount = requirements.reduce((total, group) => total + group.rules.length, 0)
  const typeActions = useProjectTypeActions({
    label: projectType.label,
    status: projectType.status,
    applicationCount,
    onEdit: () => setIsEditing(true),
    onSetStatus,
    onDelete,
    onError: setError
  })
  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <PageActions status={<SaveStatus state={editor.state} onRetry={editor.retry} />} more={typeActions.actions} />
      {typeActions.confirmation}
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
      <header className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold">{projectType.label}</h2>
          {projectType.status === "archived" ? <Badge variant="outline">Archived</Badge> : null}
        </div>
        {projectType.description ? (
          <p className="max-w-prose text-sm text-muted-foreground">{projectType.description}</p>
        ) : null}
        {subjectLabels.length > 0 ? (
          <p className="text-sm text-muted-foreground">Covers {subjectLabels.join(", ")}.</p>
        ) : null}
      </header>
      {isOutdated && updates ? (
        <Alert>
          <AlertTitle>{outdatedText(updates.publishedAt)}</AlertTitle>
          <AlertDescription>{changesSummary(updates.changes)}</AlertDescription>
          <AlertAction>
            <Button size="sm" onClick={() => setIsReviewing(true)}>
              Review updates
            </Button>
          </AlertAction>
        </Alert>
      ) : null}
      {isReviewing && updates ? (
        <UpdatesDialog
          changes={updates.changes}
          title={outdatedText(updates.publishedAt)}
          isOpen
          onOpenChange={setIsReviewing}
          onSave={async (accepted) => {
            await onApplyUpdates(applyChanges(editor.latest.current, updates.latest, updates.changes, accepted))
            onReset()
          }}
        />
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <QuestionsCard
        definition={editor.value}
        available={view.available}
        info={view.questionInfo}
        citations={view.citations}
        units={view.units}
        loadProvisions={loadProvisions}
        onUpdate={update}
      />
      <DocumentsCard
        definition={editor.value}
        available={view.available}
        rules={rules}
        citations={view.citations}
        loadProvisions={loadProvisions}
        projectTypeId={projectType.id}
        uploadTemplate={uploadTemplate}
        onUpdate={update}
      />
      <Card>
        <Collapsible>
          <CardHeader>
            <CardTitle>
              <h3>
                <CollapsibleTrigger
                  render={
                    <Button
                      variant="ghost"
                      className="-ml-2.5 h-auto px-2.5 py-1 text-base font-semibold [&[data-panel-open]>svg]:rotate-180"
                    />
                  }
                >
                  All requirements
                  <span className="font-normal text-muted-foreground">{ruleCount}</span>
                  <ChevronDownIcon className="transition-transform" />
                </CollapsibleTrigger>
              </h3>
            </CardTitle>
            <CardDescription>Every rule the published rulebook applies to this kind of project.</CardDescription>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="flex flex-col gap-6 pt-4">
              {requirements.length === 0 ? (
                <p className="text-sm text-muted-foreground">No published rules apply yet.</p>
              ) : (
                requirements.map((group) => (
                  <section key={group.id} className="flex flex-col gap-3" aria-labelledby={`requirements-${group.id}`}>
                    <h4 id={`requirements-${group.id}`} className="text-sm font-medium">
                      {group.title}
                    </h4>
                    <ul className="flex flex-col gap-3">
                      {group.rules.map((rule) => (
                        <li key={rule.key} className="flex flex-col gap-1 text-sm">
                          <RuleReference rule={rule} />
                          <span className="text-muted-foreground">{rule.statement}</span>
                          {rule.isMetByForm ? (
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <CircleCheckIcon aria-hidden className="size-3.5" />
                              Met by the application form
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
      <DetailsDialog
        key={`${details.label}\n${details.description}`}
        label={details.label}
        description={projectType.description}
        isOpen={isEditing}
        onOpenChange={setIsEditing}
        onSave={(changes) => onSave({ ...changes, definition: editor.latest.current })}
      />
    </div>
  )
}

/** A project type's page for the administrator. */
export function ProjectTypePage(props: ProjectTypePageProps) {
  // The editor keeps the form as edited; a rebuild or rewording elsewhere starts it again from what's stored.
  const [resets, setResets] = useState(0)
  const { projectType } = props.view
  // Citations open in a sheet over the editor, so its unsaved changes stay put.
  return (
    <CitationsOpenInSheet>
      <ProjectTypeEditor
        key={`${projectType.id} ${projectType.rulebookId} ${resets}`}
        {...props}
        onReset={() => setResets((count) => count + 1)}
      />
    </CitationsOpenInSheet>
  )
}
