import { useState } from "react"
import { InfoTip } from "@/components/InfoTip/InfoTip"
import { QuantityInput } from "@/components/QuantityInput/QuantityInput"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import { citedProvisionHref } from "@/features/documents/citationLink"
import { ReaderLink } from "@/features/documents/ReaderLink/ReaderLink"
import { moneyText, sentenceCase } from "@/lib/text"
import { invalidParts, isAnswerRecord } from "@/projectTypes/answers"
import type { AnswerValue, ProjectField } from "@/projectTypes/projectType"
import { asSentence, exampleOf } from "@/projectTypes/wording"
import type { CitedProvision } from "../../rulebook/citedProvision"

// One question of a project type's form, exactly as the homeowner sees it (application-review.md, Project types): the
// question, a red asterisk when it's required, its help (under it when short, behind one help button when long), and
// its control by kind, amounts through the shared quantity inputs. The homeowner's form and the administrator's
// editor both render questions with it, so they can't drift.

export type QuestionFieldProps = {
  field: ProjectField
  /** The control's id; other ids derive from it. */
  id: string
  value: AnswerValue
  onChange: (value: AnswerValue) => void
  onBlur?: () => void
  errors: readonly string[]
  /** Why the homeowner is asked: the rules that read the answer and the passages the question cites. */
  reasons?: { rules: readonly string[]; citations: readonly CitedProvision[] }
}

/** Help this long or shorter shows under the question; longer help sits behind the info button. */
const shortHelp = 90
/** Choices this many or fewer show as radio buttons, all visible; more use a list. */
const fewChoices = 6
const otherChoice = "(other)"

type InputProps<Kind extends ProjectField["kind"] = ProjectField["kind"]> = {
  field: Extract<ProjectField, { kind: Kind }>
  id: string
  value: AnswerValue
  onChange: (value: AnswerValue) => void
  onBlur?: () => void
  isInvalid: boolean
  describedBy: string | undefined
}

const placeholderOf = (field: ProjectField) => {
  const example = exampleOf(field)
  return example ? `e.g. ${example}` : undefined
}

/** A choice: radio buttons when there are few, a list when there are many; "Other", described, when it's allowed. */
function ChoiceInput({ field, id, value, onChange, onBlur, isInvalid, describedBy }: InputProps<"choice">) {
  const text = typeof value === "string" ? value : ""
  const isListed = field.options.some((option) => option.value === value)
  const [isOther, setIsOther] = useState(field.allowsOther && !isListed && text !== "")
  const choose = (next: string) => {
    setIsOther(next === otherChoice)
    onChange(next === otherChoice || next === "" ? null : next)
  }
  const other = isOther ? (
    <Input
      aria-label={`${field.label} Other, described`}
      placeholder="Describe it"
      value={text}
      onBlur={onBlur}
      onChange={(event) => onChange(event.target.value || null)}
    />
  ) : null
  const selected = isOther ? otherChoice : text
  if (field.options.length <= fewChoices) {
    const choices = [...field.options, ...(field.allowsOther ? [{ value: otherChoice, label: "Other" }] : [])]
    return (
      <div className="flex flex-col gap-3">
        <RadioGroup
          value={selected}
          onValueChange={(next) => choose(String(next))}
          aria-labelledby={`${id}-label`}
          aria-describedby={describedBy}
          aria-invalid={isInvalid}
          aria-required={field.isRequired}
          className="gap-2.5"
        >
          {choices.map((option) => (
            <Field key={option.value} orientation="horizontal">
              <RadioGroupItem id={`${id}-${option.value}`} value={option.value} onBlur={onBlur} />
              <FieldLabel htmlFor={`${id}-${option.value}`} className="font-normal">
                {sentenceCase(option.label)}
              </FieldLabel>
            </Field>
          ))}
        </RadioGroup>
        {other}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <NativeSelect
        id={id}
        value={selected}
        onBlur={onBlur}
        onChange={(event) => choose(event.target.value)}
        aria-invalid={isInvalid}
        aria-describedby={describedBy}
        required={field.isRequired}
        className="w-full"
      >
        <NativeSelectOption value="">Choose one</NativeSelectOption>
        {field.options.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {sentenceCase(option.label)}
          </NativeSelectOption>
        ))}
        {field.allowsOther ? <NativeSelectOption value={otherChoice}>Other</NativeSelectOption> : null}
      </NativeSelect>
      {other}
    </div>
  )
}

/** Any number of the options, each a checkbox. */
function ChoicesInput({ field, id, value, onChange, onBlur, isInvalid, describedBy }: InputProps<"choices">) {
  const chosen = Array.isArray(value) ? value : []
  return (
    <fieldset
      id={id}
      aria-labelledby={`${id}-label`}
      aria-describedby={describedBy}
      data-invalid={isInvalid}
      className="m-0 flex min-w-0 flex-col gap-2.5 border-0 p-0"
    >
      {field.options.map((option) => (
        <Field key={option.value} orientation="horizontal">
          <Checkbox
            id={`${id}-${option.value}`}
            checked={chosen.includes(option.value)}
            onBlur={onBlur}
            onCheckedChange={(checked) => {
              const next = field.options
                .map((item) => item.value)
                .filter((item) => (item === option.value ? checked : chosen.includes(item)))
              onChange(next.length > 0 ? next : null)
            }}
          />
          <FieldLabel htmlFor={`${id}-${option.value}`} className="font-normal">
            {sentenceCase(option.label)}
          </FieldLabel>
        </Field>
      ))}
    </fieldset>
  )
}

const signedFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" })

/** Today in the homeowner's own time zone, as the day they signed. */
const today = () => {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

/** A signature: the homeowner types their full name, which signs what the question states, on the day they type it. */
function SignatureInput({ field, id, value, onChange, onBlur, isInvalid, describedBy }: InputProps<"signature">) {
  const signature = isAnswerRecord(value) ? value : null
  return (
    <div className="flex flex-col gap-1.5">
      <Input
        id={id}
        autoComplete="name"
        placeholder="Type your full name"
        value={signature?.name ?? ""}
        onBlur={onBlur}
        onChange={(event) => {
          const name = event.target.value
          onChange(name.trim() === "" ? null : { name, signedOn: today() })
        }}
        aria-invalid={isInvalid}
        aria-describedby={[describedBy, `${id}-signed`].filter(Boolean).join(" ")}
        aria-required={field.isRequired}
      />
      <p id={`${id}-signed`} className="text-sm text-muted-foreground">
        {signature?.signedOn
          ? `Signed ${signedFormat.format(new Date(signature.signedOn))}`
          : "Typing your name signs it."}
      </p>
    </div>
  )
}

const contactParts = [
  { part: "name", label: "Name", type: "text" },
  { part: "phone", label: "Phone", type: "tel" },
  { part: "email", label: "Email", type: "email" }
] as const

/** A person's details: their name, then a phone and an email to reach them by. */
function ContactInput({ field, id, value, onChange, onBlur, isInvalid, describedBy }: InputProps<"contact">) {
  const contact = isAnswerRecord(value) ? value : {}
  // Only the part that's wrong is marked; a missing answer marks the name, which it needs first.
  const wrong = isInvalid ? invalidParts(field, value) : new Set<string>()
  const isPartInvalid = (part: string) => isInvalid && (wrong.size === 0 ? part === "name" : wrong.has(part))
  const set = (part: string, text: string) => {
    const next = { name: contact.name ?? "", phone: contact.phone ?? "", email: contact.email ?? "", [part]: text }
    onChange(Object.values(next).every((item) => item.trim() === "") ? null : next)
  }
  return (
    <fieldset
      aria-labelledby={`${id}-label`}
      aria-describedby={describedBy}
      className="m-0 grid min-w-0 gap-3 border-0 p-0 text-foreground sm:grid-cols-2"
    >
      {contactParts.map(({ part, label, type }) => {
        const partId = part === "name" ? id : `${id}-${part}`
        return (
          <div key={part} className={part === "name" ? "flex flex-col gap-1.5 sm:col-span-2" : "flex flex-col gap-1.5"}>
            <Label htmlFor={partId} className="text-xs font-normal text-muted-foreground">
              {label}
            </Label>
            <Input
              id={partId}
              type={type}
              autoComplete="off"
              value={contact[part] ?? ""}
              onBlur={onBlur}
              onChange={(event) => set(part, event.target.value)}
              aria-invalid={isPartInvalid(part)}
              aria-required={part === "name" && field.isRequired}
            />
          </div>
        )
      })}
    </fieldset>
  )
}

/** A fee: its amount, and a box the homeowner checks to confirm they'll pay it. */
function FeeInput({ field, id, value, onChange, onBlur, isInvalid, describedBy }: InputProps<"fee">) {
  return (
    <div id={id} className="flex flex-col gap-2.5">
      <p className="text-lg font-semibold tabular-nums">{moneyText(field.amount)}</p>
      <Field orientation="horizontal" className="text-foreground">
        <Checkbox
          id={`${id}-confirm`}
          checked={value === true}
          onBlur={onBlur}
          onCheckedChange={(checked) => onChange(checked ? true : null)}
          aria-invalid={isInvalid}
          aria-describedby={describedBy}
          aria-required={field.isRequired}
        />
        <Label htmlFor={`${id}-confirm`} className="font-normal">
          I&apos;ll pay this fee
        </Label>
      </Field>
    </div>
  )
}

/** A yes-or-no answer as the radio group's value: "" before an answer. */
function yesNoValue(value: AnswerValue) {
  if (value === null || Array.isArray(value)) {
    return ""
  }
  return value ? "yes" : "no"
}

function QuestionInput(props: InputProps) {
  const { field, id, value, onChange, onBlur, isInvalid, describedBy } = props
  const text =
    value === null || typeof value === "boolean" || Array.isArray(value) || isAnswerRecord(value) ? "" : String(value)
  const common = {
    id,
    onBlur,
    "aria-invalid": isInvalid,
    "aria-describedby": describedBy,
    "aria-required": field.isRequired
  }
  switch (field.kind) {
    case "number":
      return (
        <QuantityInput
          id={id}
          labelId={`${id}-label`}
          spec={field}
          value={typeof value === "number" || typeof value === "string" ? value : null}
          onChange={onChange}
          onBlur={onBlur}
          isInvalid={isInvalid}
          isRequired={field.isRequired}
          describedBy={describedBy}
        />
      )
    case "choice":
      return <ChoiceInput {...props} field={field} />
    case "choices":
      return <ChoicesInput {...props} field={field} />
    case "signature":
      return <SignatureInput {...props} field={field} />
    case "contact":
      return <ContactInput {...props} field={field} />
    case "fee":
      return <FeeInput {...props} field={field} />
    case "yes-no":
      return (
        <RadioGroup
          value={yesNoValue(value)}
          onValueChange={(next) => onChange(next === "yes")}
          aria-labelledby={`${id}-label`}
          aria-describedby={describedBy}
          aria-invalid={isInvalid}
          aria-required={field.isRequired}
          className="flex gap-6"
        >
          {(["yes", "no"] as const).map((choice) => (
            <Field key={choice} orientation="horizontal" className="w-auto">
              <RadioGroupItem id={`${id}-${choice}`} value={choice} onBlur={onBlur} />
              <FieldLabel htmlFor={`${id}-${choice}`} className="font-normal">
                {choice === "yes" ? "Yes" : "No"}
              </FieldLabel>
            </Field>
          ))}
        </RadioGroup>
      )
    case "date":
    case "time":
      return (
        <Input
          {...common}
          type={field.kind}
          className="w-auto max-w-48"
          value={text}
          onChange={(event) => onChange(event.target.value || null)}
        />
      )
    case "long-text":
      return (
        <Textarea
          {...common}
          placeholder={placeholderOf(field)}
          value={text}
          onChange={(event) => onChange(event.target.value)}
        />
      )
    default:
      return (
        <Input
          {...common}
          placeholder={placeholderOf(field)}
          value={text}
          onChange={(event) => onChange(event.target.value)}
        />
      )
  }
}

/** A question with its control, help and errors. */
/**
 * "Why we ask": the rules in plain titles, then each cited passage, which opens in the reader sheet the form provides
 * (CitationsOpenInSheet), so answers aren't lost.
 */
function WhyWeAsk({ rules, citations }: NonNullable<QuestionFieldProps["reasons"]>) {
  return (
    <div className="flex flex-col gap-2 border-t pt-2 first:border-t-0 first:pt-0">
      <p className="text-xs font-medium text-muted-foreground">Why we ask</p>
      {rules.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {[...new Set(rules)].map((title) => (
            <li key={title}>{sentenceCase(title)}</li>
          ))}
        </ul>
      ) : null}
      {citations.length > 0 ? (
        <ul className="flex flex-wrap gap-x-3 gap-y-1">
          {citations.map((citation) => (
            <li key={citation.provisionKey}>
              <ReaderLink href={citedProvisionHref(citation)} className="text-link underline underline-offset-4">
                {citation.label}
              </ReaderLink>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export function QuestionField({ field, id, value, onChange, onBlur, errors, reasons }: QuestionFieldProps) {
  const isInvalid = errors.length > 0
  const isShortHelp = field.help !== null && field.help.length <= shortHelp
  const help = field.help ? asSentence(field.help) : null
  const longHelp = help && !isShortHelp ? <p>{help}</p> : null
  const hasReasons = reasons !== undefined && (reasons.rules.length > 0 || reasons.citations.length > 0)
  const describedBy =
    [isShortHelp ? `${id}-help` : null, isInvalid ? `${id}-error` : null].filter(Boolean).join(" ") || undefined
  return (
    <Field data-invalid={isInvalid}>
      <div className="flex items-start gap-1">
        <FieldLabel htmlFor={id} id={`${id}-label`} className="block leading-snug">
          {field.label}
          {field.isRequired ? (
            <span aria-hidden className="ml-0.5 text-destructive">
              *
            </span>
          ) : null}
        </FieldLabel>
        {longHelp || hasReasons ? (
          <InfoTip label={`About: ${field.label}`} icon={hasReasons ? "info" : "help"}>
            {longHelp}
            {reasons && hasReasons ? <WhyWeAsk rules={reasons.rules} citations={reasons.citations} /> : null}
          </InfoTip>
        ) : null}
      </div>
      {isShortHelp ? <FieldDescription id={`${id}-help`}>{help}</FieldDescription> : null}
      <QuestionInput
        field={field}
        id={id}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        isInvalid={isInvalid}
        describedBy={describedBy}
      />
      {isInvalid ? <FieldError id={`${id}-error`} errors={errors.map((message) => ({ message }))} /> : null}
    </Field>
  )
}
