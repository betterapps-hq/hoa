import { useForm } from "@tanstack/react-form"
import { PlusIcon } from "lucide-react"
import { useState } from "react"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { sentenceCase } from "@/lib/text"
import { uploadFormats, type ProjectDocument } from "@/projectTypes/projectType"
import type { CitedProvision } from "../../rulebook/citedProvision"
import { CitationPicker } from "../../rulebook/RuleReference/CitationPicker"
import { CitationChips } from "../CitationChips/CitationChips"

// Writing or editing one document requirement (application-review.md, Project types): its name, whether it's
// required and the file formats it takes. The administrator's own requirement also has what it must show and the
// passages it cites; one the rules require takes those from its rules.

export type DocumentDialogProps = {
  /** The requirement to edit; null writes a new one of the administrator's own. */
  document: ProjectDocument | null
  /** The passages documents cite that the rulebook has, by provision key. */
  citations: Readonly<Record<string, CitedProvision>>
  loadProvisions: () => Promise<CitedProvision[]>
  /** A key for a new requirement. */
  newKey: (label: string) => string
  onOpenChange: (isOpen: boolean) => void
  onSave: (document: ProjectDocument) => void
}

const formatNames: Record<(typeof uploadFormats)[number], string> = {
  pdf: "PDF",
  docx: "Word",
  image: "Photos (JPEG or PNG)"
}

const valuesSchema = z.object({
  label: z.string().trim().min(1, "Name the document.").max(80, "Keep the name under 80 characters."),
  mustShow: z.string().max(1000, "Keep this under 1,000 characters."),
  isRequired: z.boolean(),
  accepts: z.array(z.enum(uploadFormats)).min(1, "Take at least one kind of file."),
  citations: z.array(z.string())
})

export function DocumentDialog({
  document,
  citations,
  loadProvisions,
  newKey,
  onOpenChange,
  onSave
}: DocumentDialogProps) {
  const [provisions, setProvisions] = useState<CitedProvision[] | null>(null)
  const isOwn = document === null || document.ruleKeys.length === 0
  const rulePoints = !isOwn && document ? document.mustShow : []
  const known = new Map([
    ...Object.entries(citations),
    ...(provisions ?? []).map((provision) => [provision.provisionKey, provision] as const)
  ])
  const form = useForm({
    defaultValues: {
      label: document ? sentenceCase(document.label) : "",
      mustShow: (document?.mustShow ?? []).join("\n"),
      isRequired: document?.isRequired ?? true,
      accepts: [...(document?.accepts ?? uploadFormats)],
      citations: document?.citations ?? []
    },
    validators: { onSubmit: valuesSchema },
    onSubmit: ({ value }) => {
      const label = value.label.trim()
      const accepts = value.accepts.length === uploadFormats.length ? null : value.accepts
      if (document && !isOwn) {
        onSave({ ...document, label, isRequired: value.isRequired, accepts })
      } else {
        onSave({
          documentType: document?.documentType ?? newKey(label),
          label,
          mustShow: value.mustShow
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
          ruleKeys: [],
          isRequired: value.isRequired,
          citations: value.citations,
          accepts
        })
      }
      onOpenChange(false)
    }
  })
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <form
          noValidate
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void form.handleSubmit()
          }}
        >
          <DialogHeader>
            <DialogTitle>{document ? "Edit document" : "Ask for a document"}</DialogTitle>
            <DialogDescription>Homeowners see it in their checklist and say which file it is.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <form.Field name="label">
              {(item) => (
                <Field data-invalid={item.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor="document-label">
                    Name
                    <span aria-hidden className="ml-0.5 text-destructive">
                      *
                    </span>
                  </FieldLabel>
                  <Input
                    id="document-label"
                    required
                    value={item.state.value}
                    onBlur={item.handleBlur}
                    onChange={(event) => item.handleChange(event.target.value)}
                    aria-invalid={item.state.meta.errors.length > 0}
                  />
                  <FieldError errors={item.state.meta.errors} />
                </Field>
              )}
            </form.Field>
            {isOwn ? (
              <form.Field name="mustShow">
                {(item) => (
                  <Field data-invalid={item.state.meta.errors.length > 0}>
                    <FieldLabel htmlFor="document-must-show">What it must show</FieldLabel>
                    <Textarea
                      id="document-must-show"
                      rows={3}
                      placeholder="One point per line"
                      value={item.state.value}
                      onBlur={item.handleBlur}
                      onChange={(event) => item.handleChange(event.target.value)}
                      aria-invalid={item.state.meta.errors.length > 0}
                    />
                    <FieldError errors={item.state.meta.errors} />
                  </Field>
                )}
              </form.Field>
            ) : null}
            {rulePoints.length > 0 ? (
              <section
                className="flex flex-col gap-2 rounded-lg bg-muted/50 p-4 text-sm"
                aria-label="What it must show"
              >
                <p className="font-medium">What it must show, from the rules</p>
                <ul className="flex list-disc flex-col gap-1 pl-4 text-muted-foreground">
                  {rulePoints.map((point) => (
                    <li key={point}>{sentenceCase(point)}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            <form.Field name="isRequired">
              {(item) => (
                <Field orientation="horizontal">
                  <Checkbox
                    id="document-required"
                    checked={item.state.value}
                    onCheckedChange={(checked) => item.handleChange(checked)}
                  />
                  <FieldLabel htmlFor="document-required" className="font-normal">
                    Homeowners must include it
                  </FieldLabel>
                </Field>
              )}
            </form.Field>
            <form.Field name="accepts">
              {(item) => (
                <FieldSet data-invalid={item.state.meta.errors.length > 0}>
                  <FieldLegend variant="label">Files it takes</FieldLegend>
                  <FieldGroup className="gap-2.5">
                    {uploadFormats.map((format) => (
                      <Field key={format} orientation="horizontal">
                        <Checkbox
                          id={`document-accepts-${format}`}
                          checked={item.state.value.includes(format)}
                          onCheckedChange={(checked) =>
                            item.handleChange(
                              uploadFormats.filter((entry) =>
                                entry === format ? checked : item.state.value.includes(entry)
                              )
                            )
                          }
                        />
                        <FieldLabel htmlFor={`document-accepts-${format}`} className="font-normal">
                          {formatNames[format]}
                        </FieldLabel>
                      </Field>
                    ))}
                  </FieldGroup>
                  <FieldError errors={item.state.meta.errors} />
                </FieldSet>
              )}
            </form.Field>
            {isOwn ? (
              <form.Field name="citations">
                {(item) => (
                  <FieldSet>
                    <FieldLegend variant="label">Citations</FieldLegend>
                    {item.state.value.length > 0 ? (
                      <CitationChips
                        keys={item.state.value}
                        known={known}
                        onRemove={(key) => item.handleChange(item.state.value.filter((entry) => entry !== key))}
                      />
                    ) : (
                      <FieldDescription>None yet.</FieldDescription>
                    )}
                    <CitationPicker
                      citations={(provisions ?? []).filter(
                        (provision) => !item.state.value.includes(provision.provisionKey)
                      )}
                      isLoading={provisions === null}
                      title="Add a citation"
                      onChoose={(citation) => item.handleChange([...item.state.value, citation.provisionKey])}
                      trigger={
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="self-start"
                          onClick={() => {
                            if (!provisions) {
                              void loadProvisions().then(setProvisions)
                            }
                          }}
                        >
                          <PlusIcon />
                          Add citation
                        </Button>
                      }
                    />
                  </FieldSet>
                )}
              </form.Field>
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit">{document ? "Save" : "Add document"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
