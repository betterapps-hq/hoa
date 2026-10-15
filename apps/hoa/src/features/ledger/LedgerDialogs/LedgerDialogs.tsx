import { useForm } from "@tanstack/react-form"
import { z } from "zod"
import { DialogForm } from "@/components/DialogForm/DialogForm"
import { MoneyInput } from "@/components/MoneyInput/MoneyInput"
import { RequiredMark } from "@/components/RequiredMark/RequiredMark"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { saveThenClose } from "@/lib/form"
import { centsFrom, dollarsSchema, money } from "@/lib/money"
import {
  chargeCategories,
  chargeCategoryLabels,
  paymentMethodLabels,
  paymentMethods,
  type ChargeCategory,
  type PaymentMethod
} from "@/money/ledger"

// The ledger's dialogs (money.md): recording a payment, adding a charge, giving a credit, and reversing an entry.

type Errors = Array<{ message?: string } | undefined>

type TextFieldProps = {
  id: string
  label: string
  value: string
  errors: Errors
  isRequired?: boolean
  type?: "text" | "date"
  max?: string
  placeholder?: string
  onChange: (value: string) => void
  onBlur: () => void
}

function TextField({
  id,
  label,
  value,
  errors,
  isRequired = false,
  type = "text",
  max,
  placeholder,
  onChange,
  onBlur
}: TextFieldProps) {
  return (
    <Field data-invalid={errors.length > 0}>
      <FieldLabel htmlFor={id}>
        {label}
        {isRequired ? <RequiredMark /> : null}
      </FieldLabel>
      <Input
        id={id}
        type={type}
        className={type === "date" ? "w-44" : undefined}
        max={max}
        placeholder={placeholder}
        maxLength={type === "text" ? 200 : undefined}
        value={value}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={errors.length > 0}
      />
      <FieldError errors={errors} />
    </Field>
  )
}

function AmountField({
  id,
  value,
  errors,
  onChange,
  onBlur
}: Pick<TextFieldProps, "id" | "value" | "errors" | "onChange" | "onBlur">) {
  return (
    <Field data-invalid={errors.length > 0}>
      <FieldLabel htmlFor={id}>
        Amount
        <RequiredMark />
      </FieldLabel>
      <MoneyInput id={id} value={value} onChange={onChange} onBlur={onBlur} isInvalid={errors.length > 0} />
      <FieldError errors={errors} />
    </Field>
  )
}

type PaymentDialogProps = {
  today: string
  onRecord: (payment: {
    amountCents: number
    method: PaymentMethod
    reference: string
    postedOn: string
  }) => Promise<void>
  onOpenChange: (open: boolean) => void
}

/** Records a payment by check, cash or another way; it pays the oldest charges due first. */
export function PaymentDialog({ today, onRecord, onOpenChange }: PaymentDialogProps) {
  const form = useForm({
    defaultValues: { amount: "", method: "check" as PaymentMethod, reference: "", postedOn: today },
    validators: {
      onSubmit: z.object({
        amount: dollarsSchema(),
        method: z.enum(paymentMethods),
        reference: z.string(),
        postedOn: z.iso.date("Give a date.").refine((day) => day <= today, "Pick today or a day before.")
      })
    },
    onSubmit: ({ value: { amount, ...payment } }) =>
      saveThenClose(
        () => onRecord({ ...payment, amountCents: centsFrom(amount) ?? 0 }),
        () => onOpenChange(false)
      )
  })
  return (
    <form.Subscribe selector={(state) => [state.values.method, state.isSubmitting] as const}>
      {([method, isSubmitting]) => (
        <DialogForm
          title="Record a payment"
          description="It pays the oldest charges due first. Payments made online record themselves."
          submitLabel="Record it"
          isSubmitting={isSubmitting}
          onSubmit={() => void form.handleSubmit()}
          onOpenChange={onOpenChange}
        >
          <form.Field name="amount">
            {(field) => (
              <AmountField
                id="payment-amount"
                value={field.state.value}
                errors={field.state.meta.errors}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
              />
            )}
          </form.Field>
          <form.Field name="method">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="payment-method">How</FieldLabel>
                <NativeSelect
                  id="payment-method"
                  className="w-full"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(z.enum(paymentMethods).parse(event.target.value))}
                >
                  {paymentMethods.map((option) => (
                    <NativeSelectOption key={option} value={option}>
                      {paymentMethodLabels[option]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            )}
          </form.Field>
          {method === "check" || method === "other" ? (
            <form.Field name="reference">
              {(field) => (
                <TextField
                  id="payment-reference"
                  label={method === "check" ? "Check number" : "Reference"}
                  value={field.state.value}
                  errors={field.state.meta.errors}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                />
              )}
            </form.Field>
          ) : null}
          <form.Field name="postedOn">
            {(field) => (
              <TextField
                id="payment-day"
                label="Received on"
                type="date"
                isRequired
                max={today}
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

type ChargeDialogProps = {
  today: string
  onAdd: (charge: {
    amountCents: number
    category: ChargeCategory
    description: string
    dueOn: string
  }) => Promise<void>
  onOpenChange: (open: boolean) => void
}

/** Adds a charge by hand, such as a fee no schedule or violation posts. */
export function ChargeDialog({ today, onAdd, onOpenChange }: ChargeDialogProps) {
  const form = useForm({
    defaultValues: { amount: "", category: "fee" as ChargeCategory, description: "", dueOn: today },
    validators: {
      onSubmit: z.object({
        amount: dollarsSchema(),
        category: z.enum(chargeCategories),
        description: z.string().trim().min(1, "Say what it's for."),
        dueOn: z.iso.date("Give a date.")
      })
    },
    onSubmit: ({ value: { amount, ...charge } }) =>
      saveThenClose(
        () => onAdd({ ...charge, amountCents: centsFrom(amount) ?? 0 }),
        () => onOpenChange(false)
      )
  })
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <DialogForm
          title="Add a charge"
          description="Dues and fines post themselves. Add one here that nothing else posts."
          submitLabel="Add it"
          isSubmitting={isSubmitting}
          onSubmit={() => void form.handleSubmit()}
          onOpenChange={onOpenChange}
        >
          <form.Field name="category">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="charge-category">Kind</FieldLabel>
                <NativeSelect
                  id="charge-category"
                  className="w-full"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(z.enum(chargeCategories).parse(event.target.value))}
                >
                  {chargeCategories.map((option) => (
                    <NativeSelectOption key={option} value={option}>
                      {chargeCategoryLabels[option]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            )}
          </form.Field>
          <form.Field name="description">
            {(field) => (
              <TextField
                id="charge-description"
                label="What it's for"
                isRequired
                placeholder="Replacement pool key"
                value={field.state.value}
                errors={field.state.meta.errors}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
              />
            )}
          </form.Field>
          <form.Field name="amount">
            {(field) => (
              <AmountField
                id="charge-amount"
                value={field.state.value}
                errors={field.state.meta.errors}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
              />
            )}
          </form.Field>
          <form.Field name="dueOn">
            {(field) => (
              <TextField
                id="charge-due"
                label="Due on"
                type="date"
                isRequired
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

type CreditDialogProps = {
  onGive: (credit: { amountCents: number; description: string }) => Promise<void>
  onOpenChange: (open: boolean) => void
}

/** Gives a credit, which pays the oldest charges due first, or the next ones. */
export function CreditDialog({ onGive, onOpenChange }: CreditDialogProps) {
  const form = useForm({
    defaultValues: { amount: "", description: "" },
    validators: {
      onSubmit: z.object({ amount: dollarsSchema(), description: z.string().trim().min(1, "Say what it's for.") })
    },
    onSubmit: ({ value }) =>
      saveThenClose(
        () => onGive({ description: value.description, amountCents: centsFrom(value.amount) ?? 0 }),
        () => onOpenChange(false)
      )
  })
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <DialogForm
          title="Give a credit"
          description="It pays the oldest charges due first; what's left pays the next ones."
          submitLabel="Give it"
          isSubmitting={isSubmitting}
          onSubmit={() => void form.handleSubmit()}
          onOpenChange={onOpenChange}
        >
          <form.Field name="amount">
            {(field) => (
              <AmountField
                id="credit-amount"
                value={field.state.value}
                errors={field.state.meta.errors}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
              />
            )}
          </form.Field>
          <form.Field name="description">
            {(field) => (
              <TextField
                id="credit-description"
                label="What it's for"
                isRequired
                placeholder="Overpaid in March"
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

type ReverseDialogProps = {
  /** The entry: a charge has its unpaid amount waived; a payment or credit is undone. */
  entry: { kind: "charge" | "payment" | "credit"; description: string; amountCents: number; openCents: number | null }
  onReverse: (reason: string) => Promise<void>
  onOpenChange: (open: boolean) => void
}

/** Waives what's unpaid on a charge, or undoes a payment or credit, such as a returned check. */
export function ReverseDialog({ entry, onReverse, onOpenChange }: ReverseDialogProps) {
  const isCharge = entry.kind === "charge"
  const form = useForm({
    defaultValues: { reason: "" },
    validators: { onSubmit: z.object({ reason: z.string().trim().min(1, "Say why.") }) },
    onSubmit: ({ value }) =>
      saveThenClose(
        () => onReverse(value.reason),
        () => onOpenChange(false)
      )
  })
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <DialogForm
          title={isCharge ? "Waive this charge?" : `Reverse this ${entry.kind}?`}
          description={
            isCharge
              ? `${entry.description}: ${money(entry.openCents ?? 0)} unpaid is taken off. What's been paid on it stays paid.`
              : `${entry.description}: ${money(-entry.amountCents)} is undone, and the charges it paid are owed again.`
          }
          submitLabel={isCharge ? "Waive it" : "Reverse it"}
          isDestructive
          isSubmitting={isSubmitting}
          onSubmit={() => void form.handleSubmit()}
          onOpenChange={onOpenChange}
        >
          <form.Field name="reason">
            {(field) => (
              <TextField
                id="reverse-reason"
                label="Why"
                isRequired
                placeholder={isCharge ? "Waived at the hearing" : "Check returned"}
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
