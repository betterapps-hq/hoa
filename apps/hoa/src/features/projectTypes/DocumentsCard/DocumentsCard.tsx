import type { UploadAdapter, Uploader, UploadItem } from "@uploadcn/core"
import { UploadDropzone as DropTarget, useUploadContext, useUploadProgress } from "@uploadcn/react"
import {
  AsteriskIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  FileTextIcon,
  PaperclipIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  UploadIcon
} from "lucide-react"
import { useState, type ComponentProps, type ReactNode } from "react"
import { toast } from "sonner"
import { fileStatusText, useFileUploader } from "@/components/FileUpload/FileUpload"
import { InfoTip } from "@/components/InfoTip/InfoTip"
import { RowActions } from "@/components/RowActions/RowActions"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Upload } from "@/components/ui/upload"
import { sentenceCase } from "@/lib/text"
import {
  addDocument,
  candidateDocuments,
  customKey,
  moveDocument,
  removeDocument,
  setDocumentTemplate,
  updateDocument
} from "@/projectTypes/definition"
import type { DocumentTemplate, ProjectDocument, ProjectTypeDefinition } from "@/projectTypes/projectType"
import type { CitedProvision } from "../../rulebook/citedProvision"
import type { ReferencedRule } from "../../rulebook/RuleReference/RuleReference"
import { DocumentDialog } from "../DocumentDialog/DocumentDialog"
import { PickerDialog } from "../PickerDialog/PickerDialog"
import type { DefinitionUpdate } from "../QuestionsCard/QuestionsCard"
import { RuleCitations } from "../RuleCitations/RuleCitations"
import { SortableList } from "../SortableList/SortableList"
import { TemplateAttachment } from "../TemplateAttachment/TemplateAttachment"

// The documents a project type's form asks for (application-review.md, Project types): one list, in the order
// homeowners see it in their checklist, each with its citations, what it must show behind an info button, and the same
// handle and menu as the questions, and its template, when it gives one, as an attached file to download, replace or
// remove. A file dropped on a document becomes its template. "Add document" offers what the rules require that the
// list leaves out. The
// documents the application form itself provides (its answers, the description) follow, with their citations, as met
// by the form: homeowners never upload them.

export type DocumentsCardProps = {
  definition: ProjectTypeDefinition
  available: ProjectTypeDefinition
  rules: ReadonlyMap<string, ReferencedRule & { statement: string }>
  /** The passages documents cite that the rulebook has, by provision key. */
  citations: Readonly<Record<string, CitedProvision>>
  loadProvisions: () => Promise<CitedProvision[]>
  /** The project type, for its templates' links. */
  projectTypeId: string
  /** Where a document's new template uploads; what the document keeps of it comes back as its result. */
  templateAdapter: UploadAdapter<DocumentTemplate>
  onUpdate: DefinitionUpdate
}

/** Focuses a row's menu button, or another control, once the change that moves it has rendered. */
function focusSoon(find: () => HTMLElement | null | undefined) {
  setTimeout(() => find()?.focus(), 0)
}

const menuOf = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button[aria-label]")].find(
    (button) => button.getAttribute("aria-label") === `Actions for ${name}`
  )

export function DocumentsCard({
  definition,
  available,
  rules,
  citations,
  loadProvisions,
  projectTypeId,
  templateAdapter,
  onUpdate
}: DocumentsCardProps) {
  const [isAdding, setIsAdding] = useState(false)
  const [editing, setEditing] = useState<string | "new" | null>(null)
  const rulesOf = (document: ProjectDocument) =>
    document.ruleKeys.flatMap((key) => {
      const rule = rules.get(key)
      return rule ? [rule] : []
    })
  const candidates = candidateDocuments(definition, available)
  const edited = definition.documents.find((document) => document.documentType === editing)
  const { documents } = definition
  const remove = (document: ProjectDocument, index: number) => {
    onUpdate((current) => removeDocument(current, document.documentType))
    const next = documents[index + 1] ?? documents[index - 1]
    focusSoon(() => (next ? menuOf(sentenceCase(next.label)) : window.document.getElementById("add-document")))
    toast(`Removed “${document.label}”`, {
      action: { label: "Undo", onClick: () => onUpdate((current) => addDocument(current, document, index)) }
    })
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h3>Documents</h3>
        </CardTitle>
        <CardDescription>
          What homeowners upload, in the order of their checklist. Drag a document to move it.
        </CardDescription>
        <CardAction>
          <Button id="add-document" variant="outline" onClick={() => setIsAdding(true)}>
            <PlusIcon />
            Add document
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileTextIcon />
              </EmptyMedia>
              <EmptyTitle>No documents</EmptyTitle>
              <EmptyDescription>Homeowners add their files without a checklist.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <SortableList
            items={documents}
            getId={(document) => document.documentType}
            getName={(document) => document.label}
            label="Documents"
            onMove={(from, to) => onUpdate((current) => moveDocument(current, from, to))}
            renderItem={(document, { index, handle }) => (
              <DocumentRow
                document={document}
                handle={handle}
                projectTypeId={projectTypeId}
                templateAdapter={templateAdapter}
                citations={[
                  ...rulesOf(document).flatMap((rule) => rule.citations),
                  ...document.citations.flatMap((key) => citations[key] ?? [])
                ]}
                missing={document.citations.filter((key) => !citations[key]).length}
                onEdit={() => setEditing(document.documentType)}
                onUpdate={onUpdate}
                onRemove={() => remove(document, index)}
              />
            )}
          />
        )}
        {definition.formDocuments.length > 0 ? (
          <section aria-labelledby="form-documents" className="mt-6 flex flex-col gap-2">
            <h4 id="form-documents" className="text-sm font-medium">
              Provided by the application form
            </h4>
            <p className="text-sm text-muted-foreground">
              The rules ask for these, and homeowners give them by filling in the form, so they don&apos;t upload them.
            </p>
            <ul className="flex flex-col gap-2">
              {definition.formDocuments.map((document) => (
                <li key={document.documentType} className="flex items-start gap-2 rounded-lg border px-3 py-3">
                  <CircleCheckIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-sm font-medium">{sentenceCase(document.label)}</span>
                    <RuleCitations citations={rulesOf(document).flatMap((rule) => rule.citations)} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </CardContent>
      <PickerDialog
        title="Add a document"
        description="Suggestions are documents the rules require that the checklist leaves out."
        options={candidates.map((document) => ({
          id: document.documentType,
          title: document.label,
          description: document.mustShow.length > 0 ? `Must show: ${document.mustShow.join("; ")}` : null,
          detail:
            [...new Set(rulesOf(document).flatMap((rule) => rule.citations.map((citation) => citation.label)))]
              .slice(0, 3)
              .join(", ") || null,
          group: "Required by the rules"
        }))}
        emptyText="The checklist has every document the rules require."
        isOpen={isAdding}
        onOpenChange={setIsAdding}
        action={{
          label: "Create your own document requirement",
          description: "Ask for any document, with what it must show.",
          onSelect: () => setEditing("new")
        }}
        onPick={(id) => {
          const document = candidates.find((item) => item.documentType === id)
          if (document) {
            onUpdate((current) => addDocument(current, document))
            toast(`Added “${document.label}”`)
          }
        }}
      />
      {editing === "new" || edited ? (
        <DocumentDialog
          key={editing ?? "new"}
          document={edited ?? null}
          citations={citations}
          loadProvisions={loadProvisions}
          newKey={(label) => customKey(definition, label)}
          projectTypeId={projectTypeId}
          templateAdapter={templateAdapter}
          onOpenChange={(open) => {
            if (!open) {
              const name = edited ? sentenceCase(edited.label) : null
              setEditing(null)
              focusSoon(() => (name ? menuOf(name) : window.document.getElementById("add-document")))
            }
          }}
          onSave={(document) =>
            onUpdate((current) =>
              current.documents.some((item) => item.documentType === document.documentType)
                ? updateDocument(current, document)
                : addDocument(current, document)
            )
          }
        />
      ) : null}
    </Card>
  )
}

type DocumentRowProps = {
  document: ProjectDocument
  handle: ReactNode
  projectTypeId: string
  templateAdapter: UploadAdapter<DocumentTemplate>
  citations: ComponentProps<typeof RuleCitations>["citations"]
  missing: number
  onEdit: () => void
  onUpdate: DefinitionUpdate
  onRemove: () => void
}

/** A document in the checklist. A file dropped on it, or chosen from Add or Replace template, becomes its template. */
function DocumentRow(props: DocumentRowProps) {
  const { document, templateAdapter, onUpdate } = props
  const label = sentenceCase(document.label)
  const settle = (item: UploadItem<DocumentTemplate>) => {
    uploader.remove(item.id)
    if (item.status !== "success" || !item.result) {
      toast.error(fileStatusText(item, "template"))
      return
    }
    const template = item.result
    onUpdate((current) => setDocumentTemplate(current, document.documentType, template))
    toast(`${document.template ? "Replaced" : "Added"} the template for “${label}”`)
  }
  const uploader = useFileUploader("template", {
    adapter: templateAdapter,
    onSuccess: settle,
    onError: settle,
    onReject: settle
  })
  return (
    <Upload uploader={uploader} multiple={false}>
      <DocumentRowBody {...props} uploader={uploader} label={label} />
    </Upload>
  )
}

function DocumentRowBody({
  document,
  handle,
  projectTypeId,
  citations,
  missing,
  onEdit,
  onUpdate,
  onRemove,
  uploader,
  label
}: DocumentRowProps & { uploader: Uploader<DocumentTemplate>; label: string }) {
  const { openFileDialog } = useUploadContext()
  const { isUploading, percent } = useUploadProgress(uploader)
  const { template } = document
  const removeTemplate = () => {
    if (!template) {
      return
    }
    onUpdate((current) => setDocumentTemplate(current, document.documentType, undefined))
    toast(`Removed the template for “${label}”`, {
      action: {
        label: "Undo",
        onClick: () => onUpdate((current) => setDocumentTemplate(current, document.documentType, template))
      }
    })
  }
  const uploading = isUploading ? `Uploading the template, ${Math.round(percent)}%` : null
  return (
    <DropTarget
      clickable={false}
      className="group/document relative flex items-start gap-1 rounded-lg border bg-card py-3 pr-2 pl-1 sm:gap-2 sm:pr-3"
    >
      {handle}
      <div className="isolate flex min-w-0 flex-1 flex-col gap-2.5 pt-1.5">
        <div className="flex flex-wrap items-center gap-x-1">
          <span className="text-sm font-medium">
            {label}
            {document.isRequired ? (
              <span aria-hidden className="ml-0.5 text-destructive">
                *
              </span>
            ) : null}
            {document.isRequired ? <span className="sr-only"> (required)</span> : null}
          </span>
          {document.mustShow.length > 0 ? (
            <InfoTip label={`What the ${document.label.toLowerCase()} must show`} icon="info">
              <p className="font-medium">It must show</p>
              <ul className="flex list-disc flex-col gap-1 pl-4 text-muted-foreground">
                {document.mustShow.map((item) => (
                  <li key={item}>{sentenceCase(item)}</li>
                ))}
              </ul>
            </InfoTip>
          ) : null}
        </div>
        {template ? (
          <TemplateAttachment
            projectTypeId={projectTypeId}
            template={template}
            size="sm"
            onRemove={removeTemplate}
            progress={uploading}
          />
        ) : null}
        {!template && uploading ? <p className="text-sm text-muted-foreground">{uploading}</p> : null}
        <RuleCitations citations={citations} missing={missing} />
      </div>
      <RowActions
        name={label}
        actions={[
          { label: "Edit", icon: PencilIcon, onSelect: onEdit },
          document.isRequired
            ? {
                label: "Make optional",
                icon: CircleDashedIcon,
                onSelect: () => onUpdate((current) => updateDocument(current, { ...document, isRequired: false }))
              }
            : {
                label: "Make required",
                icon: AsteriskIcon,
                onSelect: () => onUpdate((current) => updateDocument(current, { ...document, isRequired: true }))
              },
          { label: template ? "Replace template" : "Add template", icon: PaperclipIcon, onSelect: openFileDialog },
          { label: "Remove", icon: Trash2Icon, onSelect: onRemove, isDestructive: true }
        ]}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 hidden items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary/60 bg-background/80 text-sm font-medium backdrop-blur-sm group-data-dragging/document:flex group-data-drag-reject/document:border-destructive/60"
      >
        <UploadIcon aria-hidden className="size-4" />
        {template ? "Drop to replace its template" : "Drop to use as its template"}
      </div>
    </DropTarget>
  )
}
