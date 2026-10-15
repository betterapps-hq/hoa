import { useForm } from "@tanstack/react-form"
import { z } from "zod"
import { DialogForm } from "@/components/DialogForm/DialogForm"
import { MoneyInput } from "@/components/MoneyInput/MoneyInput"
import { RequiredMark } from "@/components/RequiredMark/RequiredMark"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldError, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { addDays, dayText } from "@/lib/days"
import { saveThenClose } from "@/lib/form"
import { centsFrom, dollarsSchema, money } from "@/lib/money"
import { frequencies, frequencyLabels, postsDaysAhead, scheduleCategories } from "@/money/schedules"
import type { ScheduleInput } from "../dues.functions"
import { categoryLabels } from "../duesDisplay"

// Setting up dues or a special assessment (money.md, Dues): its name, the amount for every unit or each unit's own, how
// often, and from when.

type ScheduleDialogProps = {
  today: string
  units: readonly { id: string; label: string }[]
  onCreate: (schedule: ScheduleInput) => Promise<void>
  onOpenChange: (open: boolean) => void
}

/** What a unit owes when it has no amount of its own. */
function usualText(amount: string) {
  const cents = centsFrom(amount)
  return cents ? money(cents) : "the amount above"
}

/** Sets up a schedule of dues or a special assessment. */
export function ScheduleDialog({ today, units, onCreate, onOpenChange }: ScheduleDialogProps) {
  const form = useForm({
    defaultValues: {
      name: "",
      category: "dues" as ScheduleInput["category"],
      frequency: "monthly" as ScheduleInput["frequency"],
      amount: "",
      firstDueOn: "",
      lastDueOn: "",
      varies: false,
      unitAmounts: Object.fromEntries(units.map((unit) => [unit.id, ""])) as Record<string, string>
    },
    validators: {
      onSubmit: z
        .object({
          name: z.string().trim().min(1, "Name it."),
          category: z.enum(scheduleCategories),
          frequency: z.enum(frequencies),
          amount: dollarsSchema(),
          firstDueOn: z.iso.date("Give the first due day."),
          lastDueOn: z.union([z.literal(""), z.iso.date()]),
          varies: z.boolean(),
          unitAmounts: z.record(z.string(), z.string())
        })
        .refine((value) => !value.lastDueOn || value.lastDueOn >= value.firstDueOn, {
          message: "The last due day can't be before the first.",
          path: ["lastDueOn"]
        })
        .refine(
          (value) =>
            !value.varies || Object.values(value.unitAmounts).every((amount) => !amount || centsFrom(amount) !== null),
          {
            message: "Give each unit's amount in dollars, or leave it empty for the usual amount.",
            path: ["unitAmounts"]
          }
        )
    },
    onSubmit: ({ value }) => {
      const amountCents = centsFrom(value.amount) ?? 0
      const own = value.varies
        ? Object.entries(value.unitAmounts).flatMap(([unitId, amount]) => {
            const cents = amount ? centsFrom(amount) : null
            return cents === null || cents === amountCents ? [] : [[unitId, cents] as const]
          })
        : []
      return saveThenClose(
        () =>
          onCreate({
            name: value.name,
            category: value.category,
            frequency: value.frequency,
            amountCents,
            unitAmounts: own.length > 0 ? Object.fromEntries(own) : null,
            firstDueOn: value.firstDueOn,
            lastDueOn: value.frequency === "once" || !value.lastDueOn ? null : value.lastDueOn
          }),
        () => onOpenChange(false)
      )
    }
  })
  return (
    <form.Subscribe
      selector={(state) =>
        [state.values.frequency, state.values.varies, state.values.amount, state.isSubmitting] as const
      }
    >
      {([frequency, varies, amount, isSubmitting]) => (
        <DialogForm
          title="Set up dues"
          description={`Each charge posts to every unit's ledger ${postsDaysAhead} days before it's due.`}
          submitLabel="Set it up"
          isSubmitting={isSubmitting}
          onSubmit={() => void form.handleSubmit()}
          onOpenChange={onOpenChange}
        >
          <form.Field name="name">
            {(field) => (
              <Field data-invalid={field.state.meta.errors.length > 0}>
                <FieldLabel htmlFor="schedule-name">
                  Name
                  <RequiredMark />
                </FieldLabel>
                <Input
                  id="schedule-name"
                  placeholder="Monthly dues"
                  maxLength={120}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={field.state.meta.errors.length > 0}
                />
                <FieldError errors={field.state.meta.errors} />
              </Field>
            )}
          </form.Field>
          <form.Field name="category">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="schedule-category">Kind</FieldLabel>
                <NativeSelect
                  id="schedule-category"
                  className="w-full"
                  value={field.state.value}
                  onChange={(event) => {
                    const category = z.enum(scheduleCategories).parse(event.target.value)
                    field.handleChange(category)
                    // A special assessment is usually charged once; dues, every month.
                    if (!form.getFieldMeta("frequency")?.isDirty) {
                      form.setFieldValue("frequency", category === "dues" ? "monthly" : "once", {
                        dontUpdateMeta: true
                      })
                    }
                  }}
                >
                  {scheduleCategories.map((option) => (
                    <NativeSelectOption key={option} value={option}>
                      {categoryLabels[option]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            )}
          </form.Field>
          <form.Field name="amount">
            {(field) => (
              <Field data-invalid={field.state.meta.errors.length > 0}>
                <FieldLabel htmlFor="schedule-amount">
                  Amount for each unit
                  <RequiredMark />
                </FieldLabel>
                <MoneyInput
                  id="schedule-amount"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={field.handleChange}
                  isInvalid={field.state.meta.errors.length > 0}
                />
                <FieldError errors={field.state.meta.errors} />
              </Field>
            )}
          </form.Field>
          <form.Field name="frequency">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="schedule-frequency">How often</FieldLabel>
                <NativeSelect
                  id="schedule-frequency"
                  className="w-full"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(z.enum(frequencies).parse(event.target.value))}
                >
                  {frequencies.map((option) => (
                    <NativeSelectOption key={option} value={option}>
                      {frequencyLabels[option]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            )}
          </form.Field>
          <div className="flex flex-wrap gap-4">
            <form.Field name="firstDueOn">
              {(field) => (
                <Field data-invalid={field.state.meta.errors.length > 0} className="w-auto">
                  <FieldLabel htmlFor="schedule-first">
                    {frequency === "once" ? "Due on" : "First due on"}
                    <RequiredMark />
                  </FieldLabel>
                  <Input
                    id="schedule-first"
                    type="date"
                    className="w-44"
                    min={today}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>
            {frequency === "once" ? null : (
              <form.Field name="lastDueOn">
                {(field) => (
                  <Field data-invalid={field.state.meta.errors.length > 0} className="w-auto">
                    <FieldLabel htmlFor="schedule-last">Last due on</FieldLabel>
                    <Input
                      id="schedule-last"
                      type="date"
                      className="w-44"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={field.state.meta.errors.length > 0}
                    />
                    <FieldError errors={field.state.meta.errors} />
                  </Field>
                )}
              </form.Field>
            )}
          </div>
          <form.Field name="varies">
            {(field) => (
              <Field orientation="horizontal">
                <Checkbox
                  id="schedule-varies"
                  checked={field.state.value}
                  onCheckedChange={(checked) => field.handleChange(checked === true)}
                />
                <FieldLabel htmlFor="schedule-varies" className="font-normal">
                  Some units owe a different amount
                </FieldLabel>
              </Field>
            )}
          </form.Field>
          {varies ? (
            <form.Field name="unitAmounts">
              {(field) => (
                <FieldSet data-invalid={field.state.meta.errors.length > 0}>
                  <FieldLegend variant="label">Each unit&apos;s amount</FieldLegend>
                  <FieldDescription>Leave one empty and it owes {usualText(amount)}.</FieldDescription>
                  <div className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
                    {units.map((unit) => (
                      <div key={unit.id} className="flex items-center justify-between gap-3">
                        <label htmlFor={`schedule-unit-${unit.id}`} className="min-w-0 truncate text-sm">
                          {unit.label}
                        </label>
                        <MoneyInput
                          id={`schedule-unit-${unit.id}`}
                          className="w-36 shrink-0"
                          value={field.state.value[unit.id] ?? ""}
                          onChange={(value) => field.handleChange({ ...field.state.value, [unit.id]: value })}
                        />
                      </div>
                    ))}
                  </div>
                  <FieldError errors={field.state.meta.errors} />
                </FieldSet>
              )}
            </form.Field>
          ) : null}
          <form.Subscribe selector={(state) => state.values}>
            {(values) => <Preview values={values} today={today} />}
          </form.Subscribe>
        </DialogForm>
      )}
    </form.Subscribe>
  )
}

/** What setting it up does, in a sentence, once there's an amount and a first due day. */
function Preview({
  values,
  today
}: {
  values: {
    frequency: ScheduleInput["frequency"]
    amount: string
    firstDueOn: string
    lastDueOn: string
    varies: boolean
  }
  today: string
}) {
  const cents = centsFrom(values.amount)
  if (cents === null || cents <= 0 || !values.firstDueOn) {
    return null
  }
  const postsOn = addDays(values.firstDueOn, -postsDaysAhead)
  const each = values.varies ? `${money(cents)}, or its own amount,` : money(cents)
  const when =
    values.frequency === "once"
      ? `once, due ${dayText(values.firstDueOn)}`
      : `${frequencyLabels[values.frequency].toLowerCase()} from ${dayText(values.firstDueOn)}${
          values.lastDueOn && values.lastDueOn >= values.firstDueOn ? ` to ${dayText(values.lastDueOn)}` : ""
        }`
  return (
    <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
      Each unit is charged {each} {when}.{" "}
      {postsOn <= today ? "The first charges post today." : `The first charges post ${dayText(postsOn)}.`}
    </p>
  )
}
