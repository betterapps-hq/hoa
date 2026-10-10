import {
  AsteriskIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  FileTextIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { InfoTip } from "@/components/InfoTip/InfoTip"
import { RowActions } from "@/components/RowActions/RowActions"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { sentenceCase } from "@/lib/text"
import {
  addDocument,
  candidateDocuments,
  customKey,
  moveDocument,
  removeDocument,
  updateDocument
} from "@/projectTypes/definition"
import type { ProjectDocument, ProjectTypeDefinition } from "@/projectTypes/projectType"
import type { CitedProvision } from "../../rulebook/citedProvision"
import type { ReferencedRule } from "../../rulebook/RuleReference/RuleReference"
import { DocumentDialog } from "../DocumentDialog/DocumentDialog"
import { PickerDialog } from "../PickerDialog/PickerDialog"
import type { DefinitionUpdate } from "../QuestionsCard/QuestionsCard"
import { RuleCitations } from "../RuleCitations/RuleCitations"
import { SortableList } from "../SortableList/SortableList"

// The documents a project type's form asks for (application-review.md, Project types): one list, in the order
// homeowners see it in their checklist, each with its citations, what it must show behind an info button, and the same
// handle and menu as the questions. "Add document" offers what the rules require that the list leaves out. The
// documents the application form itself provides (its answers, the description) follow, with their citations, as met
// by the form: homeowners never upload them.

export type DocumentsCardProps = {
  definition: ProjectTypeDefinition
  available: ProjectTypeDefinition
  rules: ReadonlyMap<string, ReferencedRule & { statement: string }>
  /** The passages documents cite that the rulebook has, by provision key. */
  citations: Readonly<Record<string, CitedProvision>>
  loadProvisions: () => Promise<CitedProvision[]>
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
              <div className="flex items-start gap-1 rounded-lg border bg-card py-3 pr-2 pl-1 sm:gap-2 sm:pr-3">
                {handle}
                <div className="flex min-w-0 flex-1 flex-col gap-1 pt-1.5">
                  <div className="flex flex-wrap items-center gap-x-1">
                    <span className="text-sm font-medium">
                      {sentenceCase(document.label)}
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
                  <RuleCitations
                    citations={[
                      ...rulesOf(document).flatMap((rule) => rule.citations),
                      ...document.citations.flatMap((key) => citations[key] ?? [])
                    ]}
                    missing={document.citations.filter((key) => !citations[key]).length}
                  />
                </div>
                <RowActions
                  name={sentenceCase(document.label)}
                  actions={[
                    { label: "Edit", icon: PencilIcon, onSelect: () => setEditing(document.documentType) },
                    document.isRequired
                      ? {
                          label: "Make optional",
                          icon: CircleDashedIcon,
                          onSelect: () =>
                            onUpdate((current) => updateDocument(current, { ...document, isRequired: false }))
                        }
                      : {
                          label: "Make required",
                          icon: AsteriskIcon,
                          onSelect: () =>
                            onUpdate((current) => updateDocument(current, { ...document, isRequired: true }))
                        },
                    { label: "Remove", icon: Trash2Icon, onSelect: () => remove(document, index), isDestructive: true }
                  ]}
                />
              </div>
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
