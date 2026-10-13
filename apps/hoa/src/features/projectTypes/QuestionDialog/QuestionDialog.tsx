import { useForm } from "@tanstack/react-form"
import { PlusIcon, XIcon } from "lucide-react"
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
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { sentenceCase } from "@/lib/text"
import { type ChoiceRow, choiceErrors, choiceRows, moveItem, offeredChoices } from "@/projectTypes/definition"
import type { ProjectDocument, ProjectField, ProjectGroup } from "@/projectTypes/projectType"
import type { CitedProvision } from "../../rulebook/citedProvision"
import { CitationPicker } from "../../rulebook/RuleReference/CitationPicker"
import { CitationChips } from "../CitationChips/CitationChips"
import type { VocabularyUnit } from "../projectTypes.functions"
import { isSorting, SortableList } from "../SortableList/SortableList"

// Writing or editing one question (application-review.md, Project types), like any form builder: its wording, help,
// answer type, choices, whether it's required, and the passages it cites. Which detail of the rules a question answers
// is code's to set and never shown: a question code built keeps it while its answer type stays, so its choices are the
// rulebook's values, shown or hidden, beside the administrator's own and "Other"; another answer type quietly makes it
// the administrator's own, which the review still reads on the answers page.

type ChoiceOption = Extract<ProjectField, { kind: "choice" }>["options"][number]

export type QuestionDialogProps = {
  /** The question to edit, with its section; null writes a new one. */
  editing: { subject: string; field: ProjectField } | null
  /** The rulebook's values for the question being edited when it's a bound choice, offered or not. */
  listed: readonly ChoiceOption[]
  /** Where a new question can go. */
  sections: readonly ProjectGroup[]
  /** The passages questions cite that the rulebook has, by provision key. */
  citations: Readonly<Record<string, CitedProvision>>
  units: readonly VocabularyUnit[]
  loadProvisions: () => Promise<CitedProvision[]>
  /** A key for a new question of the administrator's own. */
  newKey: (label: string) => string
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  onSave: (subject: string, field: ProjectField) => void
  /** A new question answered by a file is a document requirement: it goes to the documents instead. */
  onAddDocument: (document: ProjectDocument) => void
}

const answerTypes = [
  { value: "text", label: "Short text" },
  { value: "long-text", label: "Long text" },
  { value: "yes-no", label: "Yes or no" },
  { value: "choice", label: "One choice" },
  { value: "choices", label: "Several choices" },
  { value: "number", label: "Amount" },
  { value: "date", label: "Date" },
  { value: "time", label: "Time of day" },
  { value: "signature", label: "Signature" },
  { value: "contact", label: "Contact details" },
  { value: "fee", label: "Fee" },
  { value: "file", label: "File upload" }
] as const
type AnswerType = (typeof answerTypes)[number]["value"]
const isAnswerType = (value: string): value is AnswerType => answerTypes.some((type) => type.value === value)

const dimensionNames: Record<string, string> = {
  length: "Length",
  area: "Area",
  volume: "Volume",
  weight: "Weight",
  speed: "Speed",
  money: "Money",
  ratio: "Percentage",
  "elapsed-time": "Duration",
  "calendar-period": "Calendar period",
  "business-time": "Business days",
  "sound-level": "Sound level"
}

/** Dollars from what the administrator typed ("$1,250.50"); NaN when it isn't an amount. */
const dollarsOf = (text: string) => (/\d/.test(text) ? Number(text.replaceAll(/[$,\s]/g, "")) : Number.NaN)

/** "Count" for a number with no unit. */
const countUnit = "(count)"

const linesOf = (text: string) => [
  ...new Set(
    text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
  )
]

const slug = (text: string) =>
  text
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "") || "option"

const valuesSchema = z.object({
  label: z.string().trim().min(1, "Write the question.").max(200, "Keep the question under 200 characters."),
  help: z.string().trim().max(300, "Keep the help under 300 characters."),
  example: z.string().trim().max(80, "Keep the example under 80 characters."),
  isRequired: z.boolean(),
  isShared: z.boolean(),
  subject: z.string(),
  answerType: z.string(),
  options: z.string(),
  choices: z.array(
    z.object({ id: z.string(), value: z.string(), label: z.string(), isAdded: z.boolean(), isOffered: z.boolean() })
  ),
  allowsOther: z.boolean(),
  isBusiness: z.boolean(),
  unit: z.string(),
  fee: z.string(),
  citations: z.array(z.string())
})
type Values = z.infer<typeof valuesSchema>

/** What a custom question's form starts from. */
function customValues(field: ProjectField | null) {
  if (!field) {
    return { answerType: "text", options: "", unit: countUnit, fee: "" }
  }
  const options = field.kind === "choice" || field.kind === "choices" ? field.options.map((option) => option.label) : []
  return {
    answerType: field.kind,
    options: options.join("\n"),
    unit: field.kind === "number" ? (field.unit?.key ?? countUnit) : countUnit,
    fee: field.kind === "fee" ? String(field.amount) : ""
  }
}

export function QuestionDialog({
  editing,
  listed,
  sections,
  citations,
  units,
  loadProvisions,
  newKey,
  isOpen,
  onOpenChange,
  onSave,
  onAddDocument
}: QuestionDialogProps) {
  const [provisions, setProvisions] = useState<CitedProvision[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const field = editing?.field ?? null
  /** Whether the question stays the rules' detail: it was, and its answer type stays. */
  const staysBound = (answerType: string) => field !== null && field.binding !== null && answerType === field.kind
  const custom = customValues(field)
  /** The section's item, when it repeats: only there can a question be asked once for every item. */
  const itemOf = (subject: string) => sections.find((section) => section.subject === subject && section.isRepeatable)
  const repeats = (subject: string) => itemOf(subject) !== undefined
  const known = new Map([
    ...Object.entries(citations),
    ...(provisions ?? []).map((provision) => [provision.provisionKey, provision] as const)
  ])
  const ensureProvisions = async () => {
    if (provisions || isLoading) {
      return
    }
    setIsLoading(true)
    try {
      setProvisions(await loadProvisions())
    } finally {
      setIsLoading(false)
    }
  }
  const defaultValues: Values = {
    label: field?.label ?? "",
    help: field?.help ?? "",
    example: field?.example ?? "",
    isRequired: field?.isRequired ?? true,
    isShared: field?.isShared ?? false,
    subject: editing?.subject ?? sections[0]?.subject ?? "work",
    answerType: custom.answerType,
    options: custom.options,
    choices: field?.kind === "choice" ? choiceRows(field.options, listed) : [],
    allowsOther: field?.kind === "choice" ? field.allowsOther : false,
    isBusiness: field?.kind === "contact" ? field.isBusiness === true : false,
    unit: custom.unit,
    fee: custom.fee,
    citations: field?.citations ?? []
  }
  const form = useForm({
    defaultValues,
    validators: {
      onSubmit: valuesSchema.superRefine((value, context) => {
        if (staysBound(value.answerType)) {
          if (field?.kind === "choice") {
            for (const message of choiceErrors(value.choices, listed)) {
              context.addIssue({ code: "custom", path: ["choices"], message })
            }
          }
          return
        }
        if ((value.answerType === "choice" || value.answerType === "choices") && linesOf(value.options).length < 2) {
          context.addIssue({ code: "custom", path: ["options"], message: "Write at least two choices, one per line." })
        }
        if (value.answerType === "fee" && !(dollarsOf(value.fee) > 0)) {
          context.addIssue({ code: "custom", path: ["fee"], message: "Give the fee in dollars, such as 50." })
        }
      })
    },
    onSubmit: ({ value }) => {
      const subject = editing?.subject ?? value.subject
      const wording = {
        label: value.label.trim(),
        help: value.help.trim() || null,
        example: value.example.trim() || null,
        isRequired: value.isRequired,
        isShared: repeats(subject) && value.isShared,
        citations: value.citations
      }
      if (field && staysBound(value.answerType)) {
        onSave(
          subject,
          field.kind === "choice"
            ? {
                ...field,
                ...wording,
                options: offeredChoices(value.choices, listed),
                allowsOther: value.allowsOther
              }
            : { ...field, ...wording }
        )
      } else if (!editing && value.answerType === "file") {
        onAddDocument({
          documentType: newKey(wording.label),
          label: wording.label,
          mustShow: wording.help ? [wording.help] : [],
          ruleKeys: [],
          isRequired: wording.isRequired,
          citations: wording.citations,
          accepts: null
        })
      } else {
        onSave(subject, customField(value, wording))
      }
      onOpenChange(false)
    }
  })

  /** The administrator's own question from what they chose. */
  function customField(
    value: Values,
    wording: Pick<ProjectField, "label" | "help" | "example" | "isRequired" | "isShared" | "citations">
  ): ProjectField {
    const base = {
      ...wording,
      property: field?.property ?? newKey(wording.label),
      binding: null,
      answeredBy: "applicant" as const
    }
    const type = isAnswerType(value.answerType) ? value.answerType : "text"
    const options = () => {
      const taken = new Set<string>()
      return linesOf(value.options).map((label) => {
        let key = slug(label)
        for (let count = 2; taken.has(key); count += 1) {
          key = `${slug(label)}-${count}`
        }
        taken.add(key)
        return { value: key, label, isAdded: false }
      })
    }
    switch (type) {
      case "number": {
        const unit = units.find((item) => item.unit === value.unit)
        if (!unit) {
          return { ...base, kind: "number", unit: null, dimension: null, units: [] }
        }
        const same = units.filter((item) => item.dimension === unit.dimension && item.perBase !== null)
        return {
          ...base,
          kind: "number",
          unit: { key: unit.unit, label: unit.label },
          dimension: unit.dimension,
          units: [unit, ...same.filter((item) => item.unit !== unit.unit)].map((item) => ({
            unit: item.unit,
            labels: item.labels,
            perBase: item.perBase
          }))
        }
      }
      case "choice":
        return { ...base, kind: "choice", options: options(), allowsOther: false }
      case "choices":
        return { ...base, kind: "choices", options: options() }
      case "file":
        return { ...base, kind: "text" }
      case "fee":
        return { ...base, kind: "fee", amount: dollarsOf(value.fee) }
      case "contact":
        return { ...base, kind: "contact", isBusiness: value.isBusiness }
      default:
        return { ...base, kind: type }
    }
  }

  const unitGroups = [...Map.groupBy(units, (unit) => unit.dimension)]
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open, details) => {
        // Escape while a choice is lifted only cancels the move.
        if (!open && details.reason === "escape-key" && isSorting()) {
          details.cancel()
          return
        }
        onOpenChange(open)
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
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
            <DialogTitle>{editing ? "Edit question" : "Write a question"}</DialogTitle>
            <DialogDescription>Homeowners see the question and its help as you write them.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <form.Field name="label">
              {(item) => (
                <Field data-invalid={item.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor="question-label">
                    Question
                    <span aria-hidden className="ml-0.5 text-destructive">
                      *
                    </span>
                  </FieldLabel>
                  <Input
                    id="question-label"
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
            <form.Field name="help">
              {(item) => (
                <Field data-invalid={item.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor="question-help">Help</FieldLabel>
                  <Textarea
                    id="question-help"
                    rows={2}
                    value={item.state.value}
                    onBlur={item.handleBlur}
                    onChange={(event) => item.handleChange(event.target.value)}
                    aria-invalid={item.state.meta.errors.length > 0}
                  />
                  <FieldDescription>
                    A short line shows under the question; longer help, behind an info button.
                  </FieldDescription>
                  <FieldError errors={item.state.meta.errors} />
                </Field>
              )}
            </form.Field>
            <form.Subscribe selector={(state) => state.values.answerType}>
              {(answerType) => {
                const isOwn = !staysBound(answerType)
                return (
                  <>
                    {!editing && sections.length > 1 ? (
                      <form.Field name="subject">
                        {(item) => (
                          <Field>
                            <FieldLabel htmlFor="question-section">Section</FieldLabel>
                            <NativeSelect
                              id="question-section"
                              className="w-full"
                              value={item.state.value}
                              onChange={(event) => item.handleChange(event.target.value)}
                            >
                              {sections.map((section) => (
                                <NativeSelectOption key={section.subject} value={section.subject}>
                                  {sentenceCase(section.label)}
                                </NativeSelectOption>
                              ))}
                            </NativeSelect>
                          </Field>
                        )}
                      </form.Field>
                    ) : null}
                    <form.Field name="answerType">
                      {(item) => (
                        <Field>
                          <FieldLabel htmlFor="question-answer-type">Answer</FieldLabel>
                          <NativeSelect
                            id="question-answer-type"
                            className="w-full"
                            value={item.state.value}
                            onChange={(event) => item.handleChange(event.target.value)}
                          >
                            {answerTypes
                              .filter((type) => type.value !== "file" || !editing)
                              .map((type) => (
                                <NativeSelectOption key={type.value} value={type.value}>
                                  {type.label}
                                </NativeSelectOption>
                              ))}
                          </NativeSelect>
                          {item.state.value === "file" ? (
                            <FieldDescription>It goes in the documents, with the other uploads.</FieldDescription>
                          ) : null}
                          {item.state.value === "signature" ? (
                            <FieldDescription>
                              Write what homeowners sign as the question; they sign by typing their name.
                            </FieldDescription>
                          ) : null}
                          {item.state.value === "contact" ? (
                            <FieldDescription>Homeowners give a name, a phone and an email.</FieldDescription>
                          ) : null}
                          {item.state.value === "contact" ? (
                            <form.Field name="isBusiness">
                              {(business) => (
                                <Field orientation="horizontal" className="mt-1">
                                  <Checkbox
                                    id="question-business"
                                    checked={business.state.value}
                                    onCheckedChange={(checked) => business.handleChange(checked)}
                                  />
                                  <FieldContent>
                                    <FieldLabel htmlFor="question-business" className="font-normal">
                                      A business, such as a contractor
                                    </FieldLabel>
                                    <FieldDescription>
                                      Also asks for its company name and, if it has one, its website.
                                    </FieldDescription>
                                  </FieldContent>
                                </Field>
                              )}
                            </form.Field>
                          ) : null}
                          {field &&
                          item.state.value !== field.kind &&
                          (field.kind === "choice" || field.kind === "choices" || field.kind === "number") ? (
                            <FieldDescription>Changing the answer type clears its choices or unit.</FieldDescription>
                          ) : null}
                        </Field>
                      )}
                    </form.Field>
                    {isOwn && (answerType === "choice" || answerType === "choices") ? (
                      <form.Field name="options">
                        {(item) => (
                          <Field data-invalid={item.state.meta.errors.length > 0}>
                            <FieldLabel htmlFor="question-options">Choices</FieldLabel>
                            <Textarea
                              id="question-options"
                              rows={4}
                              placeholder={"One choice per line"}
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
                    {isOwn && answerType === "number" ? (
                      <form.Field name="unit">
                        {(item) => (
                          <Field>
                            <FieldLabel htmlFor="question-unit">Unit</FieldLabel>
                            <NativeSelect
                              id="question-unit"
                              className="w-full"
                              value={item.state.value}
                              onChange={(event) => item.handleChange(event.target.value)}
                            >
                              <NativeSelectOption value={countUnit}>None, a count</NativeSelectOption>
                              {unitGroups.map(([dimension, members]) => (
                                <NativeSelectOptGroup
                                  key={dimension}
                                  label={dimensionNames[dimension] ?? sentenceCase(dimension)}
                                >
                                  {members.map((unit) => (
                                    <NativeSelectOption key={unit.unit} value={unit.unit}>
                                      {sentenceCase(unit.label)}
                                    </NativeSelectOption>
                                  ))}
                                </NativeSelectOptGroup>
                              ))}
                            </NativeSelect>
                            <FieldDescription>
                              Homeowners answer in boxes for its kind, such as feet and inches.
                            </FieldDescription>
                          </Field>
                        )}
                      </form.Field>
                    ) : null}
                    {isOwn && answerType === "fee" ? (
                      <form.Field name="fee">
                        {(item) => (
                          <Field data-invalid={item.state.meta.errors.length > 0}>
                            <FieldLabel htmlFor="question-fee">Amount</FieldLabel>
                            <Input
                              id="question-fee"
                              inputMode="decimal"
                              className="max-w-40"
                              placeholder="$0.00"
                              value={item.state.value}
                              onBlur={item.handleBlur}
                              onChange={(event) => item.handleChange(event.target.value)}
                              aria-invalid={item.state.meta.errors.length > 0}
                            />
                            <FieldDescription>Say how to pay in the help.</FieldDescription>
                            <FieldError errors={item.state.meta.errors} />
                          </Field>
                        )}
                      </form.Field>
                    ) : null}
                    {answerType === "text" || answerType === "long-text" ? (
                      <form.Field name="example">
                        {(item) => (
                          <Field data-invalid={item.state.meta.errors.length > 0}>
                            <FieldLabel htmlFor="question-example">Example answer</FieldLabel>
                            <Input
                              id="question-example"
                              value={item.state.value}
                              onBlur={item.handleBlur}
                              onChange={(event) => item.handleChange(event.target.value)}
                              aria-invalid={item.state.meta.errors.length > 0}
                            />
                            <FieldDescription>Shown in the empty answer box.</FieldDescription>
                            <FieldError errors={item.state.meta.errors} />
                          </Field>
                        )}
                      </form.Field>
                    ) : null}
                  </>
                )
              }}
            </form.Subscribe>
            <form.Field name="isRequired">
              {(item) => (
                <Field orientation="horizontal">
                  <Checkbox
                    id="question-required"
                    checked={item.state.value}
                    onCheckedChange={(checked) => item.handleChange(checked)}
                  />
                  <FieldLabel htmlFor="question-required" className="font-normal">
                    Answer is required
                  </FieldLabel>
                </Field>
              )}
            </form.Field>
            <form.Subscribe selector={(state) => state.values.subject}>
              {(subject) => {
                const section = itemOf(editing?.subject ?? subject)
                return section ? (
                  <form.Field name="isShared">
                    {(item) => (
                      <Field orientation="horizontal">
                        <Checkbox
                          id="question-shared"
                          checked={item.state.value}
                          onCheckedChange={(checked) => item.handleChange(checked)}
                        />
                        <FieldContent>
                          <FieldLabel htmlFor="question-shared" className="font-normal">
                            Ask once for every {section.itemLabel.toLowerCase()}
                          </FieldLabel>
                          <FieldDescription>
                            Homeowners answer it once, above the list, for all of them.
                          </FieldDescription>
                        </FieldContent>
                      </Field>
                    )}
                  </form.Field>
                ) : null
              }}
            </form.Subscribe>
            <form.Subscribe selector={(state) => state.values.answerType}>
              {(answerType) =>
                field?.kind === "choice" && staysBound(answerType) ? (
                  <>
                    <form.Field name="choices">
                      {(item) => {
                        const rows = item.state.value
                        const change = (id: string, patch: Partial<ChoiceRow>) =>
                          item.handleChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)))
                        const add = () => {
                          const id = `new-${crypto.randomUUID()}`
                          item.handleChange([...rows, { id, value: "", label: "", isAdded: true, isOffered: true }])
                          setTimeout(() => document.getElementById(`question-choice-${id}`)?.focus(), 0)
                        }
                        return (
                          <FieldSet data-invalid={item.state.meta.errors.length > 0}>
                            <FieldLegend variant="label">Choices</FieldLegend>
                            <FieldDescription>The rulebook&apos;s list, and any you add.</FieldDescription>
                            <SortableList
                              items={rows}
                              getId={(row) => row.id}
                              getName={(row) => sentenceCase(row.label.trim() || "New choice")}
                              label="Choices"
                              className="gap-1"
                              onMove={(from, to) => item.handleChange(moveItem(rows, from, to))}
                              renderItem={(row, { index, handle }) => {
                                const id = `question-choice-${row.id}`
                                return (
                                  <div className="flex min-h-8 items-center gap-2">
                                    {handle}
                                    {row.isAdded ? (
                                      <>
                                        <Input
                                          id={id}
                                          className="h-8 min-w-0 flex-1"
                                          aria-label={`Choice ${index + 1}`}
                                          placeholder="Name the choice"
                                          value={row.label}
                                          onBlur={item.handleBlur}
                                          onChange={(event) => change(row.id, { label: event.target.value })}
                                        />
                                        <span className="shrink-0 text-xs text-muted-foreground">Added</span>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon-sm"
                                          aria-label={`Remove ${row.label.trim() || `choice ${index + 1}`}`}
                                          onClick={() => item.handleChange(rows.filter((entry) => entry.id !== row.id))}
                                        >
                                          <XIcon />
                                        </Button>
                                      </>
                                    ) : (
                                      <Field orientation="horizontal" className="flex-1">
                                        <Checkbox
                                          id={id}
                                          checked={row.isOffered}
                                          onCheckedChange={(checked) => change(row.id, { isOffered: checked })}
                                        />
                                        <FieldLabel htmlFor={id} className="font-normal">
                                          {sentenceCase(row.label)}
                                        </FieldLabel>
                                      </Field>
                                    )}
                                  </div>
                                )
                              }}
                            />
                            <Button type="button" variant="outline" size="sm" className="self-start" onClick={add}>
                              <PlusIcon />
                              Add a choice
                            </Button>
                            <FieldError errors={item.state.meta.errors} />
                          </FieldSet>
                        )
                      }}
                    </form.Field>
                    <form.Field name="allowsOther">
                      {(item) => (
                        <Field orientation="horizontal">
                          <Checkbox
                            id="question-allows-other"
                            checked={item.state.value}
                            onCheckedChange={(checked) => item.handleChange(checked)}
                          />
                          <FieldLabel htmlFor="question-allows-other" className="font-normal">
                            Allow &ldquo;Other&rdquo;, with a box to describe it
                          </FieldLabel>
                        </Field>
                      )}
                    </form.Field>
                  </>
                ) : null
              }
            </form.Subscribe>
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
                        onClick={() => void ensureProvisions()}
                      >
                        <PlusIcon />
                        Add citation
                      </Button>
                    }
                  />
                </FieldSet>
              )}
            </form.Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit">{editing ? "Save" : "Add question"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
