import { useForm } from "@tanstack/react-form"
import { z } from "zod"
import { DialogForm } from "@/components/DialogForm/DialogForm"
import { MoneyInput } from "@/components/MoneyInput/MoneyInput"
import { RequiredMark } from "@/components/RequiredMark/RequiredMark"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { saveThenClose } from "@/lib/form"
import { centsFrom, dollarsSchema, dollarsText, money } from "@/lib/money"
import { sentenceCase } from "@/lib/text"
import { noticeDeliveries, noticeDeliveryLabels, type FactValue, type NoticeDelivery } from "@/violations/violation"
import { amountText, remainingCents, sanctionTypeLabels } from "../violationDisplay"
import type { ViolationStep } from "../violations.functions"
import type { FactQuestion, SanctionView } from "../violations.server"

// The violation page's dialogs (violations.md, Steps): sending or recording the notice, recording a step the board took
// or learned of, imposing a sanction, and an owner's reply or request for a hearing.

type DayFieldProps = {
  id: string
  label: string
  value: string
  errors: FieldErrors
  min?: string
  max?: string
  onChange: (value: string) => void
  onBlur: () => void
}

function DayField({ id, label, value, errors, min, max, onChange, onBlur }: DayFieldProps) {
  return (
    <Field data-invalid={errors.length > 0}>
      <FieldLabel htmlFor={id}>
        {label}
        <RequiredMark />
      </FieldLabel>
      <Input
        id={id}
        type="date"
        className="w-44"
        min={min}
        max={max}
        value={value}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={errors.length > 0}
      />
      <FieldError errors={errors} />
    </Field>
  )
}

type NoteFieldProps = {
  id: string
  label: string
  value: string
  errors: FieldErrors
  isRequired?: boolean
  description?: string
  onChange: (value: string) => void
  onBlur: () => void
}

function NoteField({ id, label, value, errors, isRequired = false, description, onChange, onBlur }: NoteFieldProps) {
  return (
    <Field data-invalid={errors.length > 0}>
      <FieldLabel htmlFor={id}>
        {label}
        {isRequired ? <RequiredMark /> : null}
      </FieldLabel>
      <Textarea
        id={id}
        rows={3}
        maxLength={4000}
        value={value}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={errors.length > 0}
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError errors={errors} />
    </Field>
  )
}

type FieldErrors = Array<{ message?: string } | undefined>

/** A day that's happened, on or after the violation was seen. */
const pastDay = (earliest: string, today: string) =>
  z.iso
    .date("Give a date.")
    .refine((day) => day <= today, "Pick today or a day before.")
    .refine((day) => day >= earliest, "That's before the violation was seen.")

type SendNoticeDialogProps = {
  /** Who would be emailed: the people who answer for it with an email on the roll. */
  emailTo: string[]
  /** What a notice sent today gives as the time to correct it, in words. */
  cureText: string
  observedOn: string
  today: string
  onSend: () => Promise<void>
  onRecord: (step: Extract<ViolationStep, { kind: "notice" }>) => Promise<void>
  onOpenChange: (open: boolean) => void
}

/** Emails the notice now, or records one mailed, posted or handed over on a day. */
export function SendNoticeDialog({
  emailTo,
  cureText,
  observedOn,
  today,
  onSend,
  onRecord,
  onOpenChange
}: SendNoticeDialogProps) {
  const canEmail = emailTo.length > 0
  const form = useForm({
    defaultValues: { delivery: (canEmail ? "email" : "mail") as NoticeDelivery, occurredOn: today, note: "" },
    validators: {
      onSubmit: z.object({
        delivery: z.enum(noticeDeliveries),
        occurredOn: pastDay(observedOn, today),
        note: z.string()
      })
    },
    onSubmit: ({ value }) =>
      saveThenClose(
        () => (value.delivery === "email" ? onSend() : onRecord({ kind: "notice", ...value })),
        () => onOpenChange(false)
      )
  })
  return (
    <form.Subscribe selector={(state) => [state.values.delivery, state.isSubmitting] as const}>
      {([delivery, isSubmitting]) => (
        <DialogForm
          title="Send the notice"
          description={cureText}
          submitLabel={delivery === "email" ? "Send it" : "Record it"}
          isSubmitting={isSubmitting}
          onSubmit={() => void form.handleSubmit()}
          onOpenChange={onOpenChange}
        >
          <form.Field name="delivery">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="notice-delivery">How</FieldLabel>
                <NativeSelect
                  id="notice-delivery"
                  className="w-full"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(z.enum(noticeDeliveries).parse(event.target.value))}
                >
                  {noticeDeliveries.map((option) => (
                    <NativeSelectOption key={option} value={option} disabled={option === "email" && !canEmail}>
                      {noticeDeliveryLabels[option]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <FieldDescription>
                  {delivery === "email"
                    ? `Emails ${new Intl.ListFormat("en-US").format(emailTo)} now, with a link to reply or ask for a hearing.`
                    : "Record it once it's delivered. The time to correct it starts that day."}
                </FieldDescription>
              </Field>
            )}
          </form.Field>
          {delivery === "email" ? null : (
            <>
              <form.Field name="occurredOn">
                {(field) => (
                  <DayField
                    id="notice-day"
                    label="Delivered on"
                    min={observedOn}
                    max={today}
                    value={field.state.value}
                    errors={field.state.meta.errors}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                  />
                )}
              </form.Field>
              <form.Field name="note">
                {(field) => (
                  <NoteField
                    id="notice-note"
                    label="Note"
                    value={field.state.value}
                    errors={field.state.meta.errors}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                  />
                )}
              </form.Field>
            </>
          )}
        </DialogForm>
      )}
    </form.Subscribe>
  )
}

/** The steps the board records by hand, besides the notice. */
export type StepKind = Exclude<ViolationStep["kind"], "notice">

/** The steps offered together; dismissing, closing and reopening each have their own. */
const progressKinds = ["hearing-requested", "hearing-set", "hearing-held", "cured", "note"] as const

/** Each step's day, as the dialog asks for it, and its button. */
const stepTexts: Record<StepKind, { day: string; submit: string }> = {
  "hearing-requested": { day: "Asked on", submit: "Record it" },
  "hearing-set": { day: "Set on", submit: "Record it" },
  "hearing-held": { day: "Held on", submit: "Record it" },
  cured: { day: "Corrected on", submit: "Record it" },
  note: { day: "Day", submit: "Add the note" },
  dismissed: { day: "Dismissed on", submit: "Dismiss it" },
  closed: { day: "Closed on", submit: "Close it" },
  reopened: { day: "Reopened on", submit: "Reopen it" }
}

const progressLabels: Record<(typeof progressKinds)[number], string> = {
  "hearing-requested": "They asked for a hearing",
  "hearing-set": "A hearing was set",
  "hearing-held": "The hearing was held",
  cured: "It was corrected",
  note: "A note"
}

const statusTitles: Record<Exclude<StepKind, (typeof progressKinds)[number]>, string> = {
  dismissed: "Dismiss this violation?",
  closed: "Close this violation?",
  reopened: "Reopen this violation?"
}

const isProgressKind = (kind: StepKind): kind is (typeof progressKinds)[number] =>
  progressKinds.some((progress) => progress === kind)

type StepDialogProps = {
  /** The step it records; a hearing, a cure or a note can be switched for another of them. */
  kind: StepKind
  observedOn: string
  today: string
  onRecord: (step: ViolationStep) => Promise<void>
  onOpenChange: (open: boolean) => void
}

/** Records a step on the day it happened: a hearing, a cure, a note, or dismissing, closing or reopening it. */
export function StepDialog({ kind, observedOn, today, onRecord, onOpenChange }: StepDialogProps) {
  const form = useForm({
    defaultValues: { kind, occurredOn: today, hearingOn: "", place: "", note: "" },
    validators: {
      onSubmit: z
        .object({
          kind: z.enum([...progressKinds, "dismissed", "closed", "reopened"]),
          occurredOn: pastDay(observedOn, today),
          hearingOn: z.string(),
          place: z.string(),
          note: z.string()
        })
        .superRefine((value, context) => {
          if (value.kind === "hearing-set" && !z.iso.date().safeParse(value.hearingOn).success) {
            context.addIssue({ code: "custom", path: ["hearingOn"], message: "Give the hearing's day." })
          }
          if (value.kind === "note" && !value.note.trim()) {
            context.addIssue({ code: "custom", path: ["note"], message: "Write the note." })
          }
          if (value.kind === "dismissed" && !value.note.trim()) {
            context.addIssue({ code: "custom", path: ["note"], message: "Say why it's dismissed." })
          }
        })
    },
    onSubmit: ({ value }) =>
      saveThenClose(
        () => onRecord(stepOf(value)),
        () => onOpenChange(false)
      )
  })
  return (
    <form.Subscribe selector={(state) => [state.values.kind, state.isSubmitting] as const}>
      {([current, isSubmitting]) => (
        <DialogForm
          title={isProgressKind(kind) ? "Record a step" : statusTitles[kind]}
          description={descriptionOf(kind)}
          submitLabel={stepTexts[current].submit}
          isDestructive={current === "dismissed"}
          isSubmitting={isSubmitting}
          onSubmit={() => void form.handleSubmit()}
          onOpenChange={onOpenChange}
        >
          {isProgressKind(kind) ? (
            <form.Field name="kind">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="step-kind">What happened</FieldLabel>
                  <NativeSelect
                    id="step-kind"
                    className="w-full"
                    value={field.state.value}
                    onChange={(event) => {
                      const chosen = progressKinds.find((option) => option === event.target.value)
                      if (chosen) {
                        field.handleChange(chosen)
                      }
                    }}
                  >
                    {progressKinds.map((option) => (
                      <NativeSelectOption key={option} value={option}>
                        {progressLabels[option]}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
              )}
            </form.Field>
          ) : null}
          <form.Field name="occurredOn">
            {(field) => (
              <DayField
                id="step-day"
                label={stepTexts[current].day}
                min={observedOn}
                max={today}
                value={field.state.value}
                errors={field.state.meta.errors}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
              />
            )}
          </form.Field>
          {current === "hearing-set" ? (
            <>
              <form.Field name="hearingOn">
                {(field) => (
                  <DayField
                    id="step-hearing-day"
                    label="Hearing on"
                    value={field.state.value}
                    errors={field.state.meta.errors}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                  />
                )}
              </form.Field>
              <form.Field name="place">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor="step-place">Where</FieldLabel>
                    <Input
                      id="step-place"
                      placeholder="The clubhouse, or a video call"
                      maxLength={200}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                    />
                  </Field>
                )}
              </form.Field>
            </>
          ) : null}
          <form.Field name="note">
            {(field) => (
              <NoteField
                id="step-note"
                label={current === "dismissed" ? "Why" : "Note"}
                isRequired={current === "note" || current === "dismissed"}
                value={field.state.value}
                errors={field.state.meta.errors}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
              />
            )}
          </form.Field>
        </DialogForm>
      )}
    </form.Subscribe>
  )
}

function descriptionOf(kind: StepKind) {
  switch (kind) {
    case "dismissed":
      return "It stops here, and doesn't count as an earlier violation."
    case "closed":
      return "Close it once it's corrected and any sanction is settled."
    case "reopened":
      return "It goes back to open, with its history kept."
    default:
      return "Record it on the day it happened. The documents' dates count from it."
  }
}

/** The step a dialog's values record. */
function stepOf(value: { kind: StepKind; occurredOn: string; hearingOn: string; place: string; note: string }) {
  const { kind, occurredOn, note } = value
  if (kind === "hearing-set") {
    return { kind, occurredOn, note, hearingOn: value.hearingOn, place: value.place } satisfies ViolationStep
  }
  return { kind, occurredOn, note } satisfies ViolationStep
}

type ImposeDialogProps = {
  sanction: SanctionView
  /** The rule it enforces, when the violation breaks more than one. */
  enforcedTitle: string | null
  onImpose: (imposed: { amountCents: number | null; note: string }) => Promise<void>
  onOpenChange: (open: boolean) => void
}

/** Imposes a sanction the documents make available now, for an amount they allow. */
export function ImposeDialog({ sanction, enforcedTitle, onImpose, onOpenChange }: ImposeDialogProps) {
  const hasAmount = sanction.amount.type !== "none"
  const most = remainingCents(sanction.amount, sanction.imposedCents)
  const prefilled = sanction.amount.type === "fixed" && most !== null ? dollarsText(most) : ""
  const form = useForm({
    defaultValues: { amount: prefilled, note: "" },
    validators: {
      onSubmit: z.object({
        amount: hasAmount ? dollarsSchema(most) : z.string(),
        note: z.string()
      })
    },
    onSubmit: ({ value }) =>
      saveThenClose(
        () => onImpose({ amountCents: hasAmount ? centsFrom(value.amount) : null, note: value.note }),
        () => onOpenChange(false)
      )
  })
  const amount = amountText(sanction.amount)
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <DialogForm
          title={`Impose: ${sanctionTypeLabels[sanction.type].toLowerCase()}`}
          description={
            <>
              {sanction.rule.title}
              {enforcedTitle ? `, for ${enforcedTitle}` : ""}. {amount}
              {sanction.imposedCents > 0 ? ` ${money(sanction.imposedCents)} has been imposed already.` : ""}
            </>
          }
          submitLabel="Impose it"
          isSubmitting={isSubmitting}
          onSubmit={() => void form.handleSubmit()}
          onOpenChange={onOpenChange}
        >
          {hasAmount ? (
            <form.Field name="amount">
              {(field) => (
                <Field data-invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor="impose-amount">
                    Amount
                    <RequiredMark />
                  </FieldLabel>
                  <MoneyInput
                    id="impose-amount"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={field.handleChange}
                    isInvalid={field.state.meta.errors.length > 0}
                  />
                  {most === null ? null : <FieldDescription>At most {money(most)}.</FieldDescription>}
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>
          ) : null}
          <form.Field name="note">
            {(field) => (
              <NoteField
                id="impose-note"
                label="Note"
                value={field.state.value}
                errors={field.state.meta.errors}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
              />
            )}
          </form.Field>
        </DialogForm>
      )}
    </form.Subscribe>
  )
}

type RespondDialogProps = {
  kind: "reply" | "hearing-requested"
  onRespond: (note: string) => Promise<void>
  onOpenChange: (open: boolean) => void
}

/** An owner's reply to the board, or their request for a hearing before it. */
export function RespondDialog({ kind, onRespond, onOpenChange }: RespondDialogProps) {
  const isReply = kind === "reply"
  const form = useForm({
    defaultValues: { note: "" },
    validators: {
      onSubmit: z.object({ note: isReply ? z.string().trim().min(1, "Write your reply.") : z.string() })
    },
    onSubmit: ({ value }) =>
      saveThenClose(
        () => onRespond(value.note),
        () => onOpenChange(false)
      )
  })
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <DialogForm
          title={isReply ? "Reply to the board" : "Ask for a hearing"}
          description={
            isReply
              ? "The board reads your reply with the violation. Say what's been done, or why it isn't a violation."
              : "The board sets a day to hear you before it decides on any fine, and lets you know."
          }
          submitLabel={isReply ? "Send the reply" : "Ask for it"}
          isSubmitting={isSubmitting}
          onSubmit={() => void form.handleSubmit()}
          onOpenChange={onOpenChange}
        >
          <form.Field name="note">
            {(field) => (
              <NoteField
                id="respond-note"
                label={isReply ? "Your reply" : "Anything the board should know"}
                isRequired={isReply}
                value={field.state.value}
                errors={field.state.meta.errors}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
              />
            )}
          </form.Field>
        </DialogForm>
      )}
    </form.Subscribe>
  )
}

type FactDialogProps = {
  question: FactQuestion
  onAnswer: (value: FactValue) => Promise<void>
  onOpenChange: (open: boolean) => void
}

/** The answer as the form holds it: the date, number or choice typed or picked. */
function answerText(value: FactValue | null) {
  switch (value?.type) {
    case "date":
      return value.value
    case "boolean":
      return value.value ? "yes" : "no"
    case "number":
    case "quantity":
      return String(value.value)
    case "value":
      return value.term
    default:
      return ""
  }
}

/** The answer the form holds as a fact's value; null when it doesn't parse. */
function factValueOf(question: FactQuestion, answer: string): FactValue | null {
  const { input } = question
  const amount = Number(answer)
  switch (input.type) {
    case "date":
      return z.iso.date().safeParse(answer).success ? { type: "date", value: answer } : null
    case "boolean":
      return answer ? { type: "boolean", value: answer === "yes" } : null
    case "number":
      return answer && Number.isInteger(amount) && amount >= 0 ? { type: "number", value: amount } : null
    case "quantity": {
      // Dollars are typed as money; other units as a plain number.
      const value = input.unit === "usd" ? (centsFrom(answer) ?? Number.NaN) / 100 : amount
      return answer && Number.isFinite(value) && value >= 0 ? { type: "quantity", value, unit: input.unit } : null
    }
    case "choice": {
      const option = input.options.find((candidate) => candidate.term === answer)
      return option ? { type: "value", term: option.term, text: option.label } : null
    }
  }
}

/** Answers a fact the documents ask about the violation, such as the day the board set to cure by. */
export function FactDialog({ question, onAnswer, onOpenChange }: FactDialogProps) {
  const { input } = question
  const form = useForm({
    defaultValues: { answer: answerText(question.value) },
    validators: {
      onSubmit: z.object({
        answer: z.string().refine((answer) => factValueOf(question, answer) !== null, "Give an answer.")
      })
    },
    onSubmit: ({ value }) => {
      const fact = factValueOf(question, value.answer)
      return fact
        ? saveThenClose(
            () => onAnswer(fact),
            () => onOpenChange(false)
          )
        : undefined
    }
  })
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <DialogForm
          title={sentenceCase(question.label)}
          description={question.note ?? "The documents turn on it. Answer as it stands for this violation."}
          submitLabel="Save"
          isSubmitting={isSubmitting}
          onSubmit={() => void form.handleSubmit()}
          onOpenChange={onOpenChange}
        >
          <form.Field name="answer">
            {(field) => {
              const isInvalid = field.state.meta.errors.length > 0
              const change = (value: string) => field.handleChange(value)
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor="fact-answer">
                    Answer
                    <RequiredMark />
                  </FieldLabel>
                  {input.type === "date" ? (
                    <Input
                      id="fact-answer"
                      type="date"
                      className="w-44"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => change(event.target.value)}
                      aria-invalid={isInvalid}
                    />
                  ) : null}
                  {input.type === "number" ? (
                    <Input
                      id="fact-answer"
                      inputMode="numeric"
                      className="w-32"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => change(event.target.value)}
                      aria-invalid={isInvalid}
                    />
                  ) : null}
                  {input.type === "quantity" && input.unit === "usd" ? (
                    <MoneyInput
                      id="fact-answer"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={change}
                      isInvalid={isInvalid}
                    />
                  ) : null}
                  {input.type === "quantity" && input.unit !== "usd" ? (
                    <InputGroup className="w-56">
                      <InputGroupInput
                        id="fact-answer"
                        inputMode="decimal"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => change(event.target.value)}
                        aria-invalid={isInvalid}
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupText>{input.unitLabel}</InputGroupText>
                      </InputGroupAddon>
                    </InputGroup>
                  ) : null}
                  {input.type === "boolean" || input.type === "choice" ? (
                    <NativeSelect
                      id="fact-answer"
                      className="w-full"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => change(event.target.value)}
                      aria-invalid={isInvalid}
                    >
                      <NativeSelectOption value="">Choose</NativeSelectOption>
                      {(input.type === "boolean"
                        ? [
                            { term: "yes", label: "Yes" },
                            { term: "no", label: "No" }
                          ]
                        : input.options
                      ).map((option) => (
                        <NativeSelectOption key={option.term} value={option.term}>
                          {sentenceCase(option.label)}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  ) : null}
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              )
            }}
          </form.Field>
        </DialogForm>
      )}
    </form.Subscribe>
  )
}
