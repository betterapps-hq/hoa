import { useForm } from "@tanstack/react-form"
import { ArrowLeftIcon } from "lucide-react"
import { useState } from "react"
import { z } from "zod"
import type { ChosenFile } from "@/components/FileDropzone/FileDropzone"
import { FileDropzone } from "@/components/FileDropzone/FileDropzone"
import { RequiredMark } from "@/components/RequiredMark/RequiredMark"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { RollPicker } from "@/features/people/RollPicker/RollPicker"
import { reportInputSchema, type ReportInput } from "@/violations/violation"
import { RulePicker, type RuleChoice } from "../RulePicker/RulePicker"

// Reporting a violation (violations.md, Steps 1): the unit, the rules it breaks, what was seen and when, whoever did it
// when they live there, and photos. Its owners answer for it; nobody hears of it until the board sends the notice.

export type ReportUnit = {
  id: string
  label: string
  detail: string | null
  residents: { personId: string; name: string; relation: string; party: "occupant" | "tenant" }[]
  owners: string[]
}

export type ReportViolationPageProps = {
  today: string
  units: readonly ReportUnit[]
  rules: readonly RuleChoice[]
  /** Reports it, and adds the photos; resolves once it's saved. */
  onReport: (report: ReportInput, photos: File[]) => Promise<void>
  onBack: () => void
}

const { unitId, ruleKeys, title, observedOn } = reportInputSchema.shape

/** The report of a violation, which the board sends a notice for once it's saved. */
export function ReportViolationPage({ today, units, rules, onReport, onBack }: ReportViolationPageProps) {
  const [error, setError] = useState<string | null>(null)
  const [photos, setPhotos] = useState<ChosenFile[]>([])
  const form = useForm({
    defaultValues: {
      unitId: "",
      ruleKeys: [] as string[],
      title: "",
      description: "",
      observedOn: today,
      actorId: ""
    },
    validators: {
      onSubmit: z.object({
        unitId,
        ruleKeys,
        title,
        description: z.string(),
        observedOn: observedOn.refine((day) => day <= today, "Pick today or a day before."),
        actorId: z.string()
      })
    },
    onSubmit: async ({ value }) => {
      setError(null)
      const unit = units.find((candidate) => candidate.id === value.unitId)
      const actor = unit?.residents.find((resident) => resident.personId === value.actorId)
      try {
        await onReport(
          {
            unitId: value.unitId,
            ruleKeys: value.ruleKeys,
            title: value.title,
            description: value.description,
            observedOn: value.observedOn,
            actor: actor ? { personId: actor.personId, party: actor.party } : null
          },
          photos.map(({ file }) => file)
        )
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The violation couldn't be reported.")
      }
    }
  })
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 lg:px-6">
      <Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" onClick={onBack}>
        <ArrowLeftIcon />
        Violations
      </Button>
      <p className="mb-1 max-w-prose text-pretty text-muted-foreground">
        The unit&apos;s owners answer for it. Nobody hears of it until you send the notice from its page.
      </p>
      <Card>
        <CardContent>
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              void form.handleSubmit()
            }}
          >
            <FieldGroup className="gap-6">
              <form.Field name="unitId" listeners={{ onChange: () => form.setFieldValue("actorId", "") }}>
                {(field) => (
                  <Field data-invalid={field.state.meta.errors.length > 0}>
                    <FieldLabel htmlFor="report-unit">
                      Unit
                      <RequiredMark />
                    </FieldLabel>
                    <RollPicker
                      id="report-unit"
                      choices={units.map((unit) => ({ value: unit.id, label: unit.label, detail: unit.detail }))}
                      value={field.state.value}
                      onChange={field.handleChange}
                      placeholder="Find a unit by its name or address"
                      empty="No unit on the roll matches."
                      isInvalid={field.state.meta.errors.length > 0}
                    />
                    <form.Subscribe selector={(state) => state.values.unitId}>
                      {(unitId) => <OwnersLine unit={units.find((unit) => unit.id === unitId)} />}
                    </form.Subscribe>
                    <FieldError errors={field.state.meta.errors} />
                  </Field>
                )}
              </form.Field>
              <form.Field name="ruleKeys">
                {(field) => (
                  <Field data-invalid={field.state.meta.errors.length > 0}>
                    <FieldLabel htmlFor="report-rules">
                      Rules it breaks
                      <RequiredMark />
                    </FieldLabel>
                    <RulePicker
                      id="report-rules"
                      rules={rules}
                      value={field.state.value}
                      onChange={field.handleChange}
                      isInvalid={field.state.meta.errors.length > 0}
                    />
                    <FieldError errors={field.state.meta.errors} />
                  </Field>
                )}
              </form.Field>
              <form.Field name="title">
                {(field) => (
                  <Field data-invalid={field.state.meta.errors.length > 0}>
                    <FieldLabel htmlFor="report-title">
                      What was seen
                      <RequiredMark />
                    </FieldLabel>
                    <Input
                      id="report-title"
                      placeholder="A boat parked in the driveway"
                      maxLength={160}
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
                  <Field>
                    <FieldLabel htmlFor="report-description">Details</FieldLabel>
                    <Textarea
                      id="report-description"
                      rows={3}
                      maxLength={4000}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                    />
                    <FieldDescription>The notice quotes these, so write them for the owner to read.</FieldDescription>
                  </Field>
                )}
              </form.Field>
              <form.Field name="observedOn">
                {(field) => (
                  <Field data-invalid={field.state.meta.errors.length > 0}>
                    <FieldLabel htmlFor="report-day">
                      Seen on
                      <RequiredMark />
                    </FieldLabel>
                    <Input
                      id="report-day"
                      type="date"
                      className="w-44"
                      max={today}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={field.state.meta.errors.length > 0}
                    />
                    <FieldError errors={field.state.meta.errors} />
                  </Field>
                )}
              </form.Field>
              <form.Subscribe selector={(state) => state.values.unitId}>
                {(unitId) => {
                  const residents = units.find((unit) => unit.id === unitId)?.residents ?? []
                  return residents.length > 0 ? (
                    <form.Field name="actorId">
                      {(field) => (
                        <Field>
                          <FieldLabel htmlFor="report-actor">Who did it</FieldLabel>
                          <NativeSelect
                            id="report-actor"
                            className="w-full sm:w-80"
                            value={field.state.value}
                            onChange={(event) => field.handleChange(event.target.value)}
                          >
                            <NativeSelectOption value="">Not known, or an owner</NativeSelectOption>
                            {residents.map((resident) => (
                              <NativeSelectOption key={resident.personId} value={resident.personId}>
                                {resident.name}, {resident.relation.toLowerCase()}
                              </NativeSelectOption>
                            ))}
                          </NativeSelect>
                          <FieldDescription>Someone who lives there answers for it with the owners.</FieldDescription>
                        </Field>
                      )}
                    </form.Field>
                  ) : null
                }}
              </form.Subscribe>
              <Field>
                <FieldLabel htmlFor="report-photos">Photos</FieldLabel>
                <FileDropzone id="report-photos" target="photo" value={photos} onChange={setPhotos} />
              </Field>
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                  <Field orientation="horizontal">
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting ? <Spinner /> : null}
                      Report it
                    </Button>
                  </Field>
                )}
              </form.Subscribe>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

/** Who answers for a violation at the picked unit. */
function OwnersLine({ unit }: { unit: ReportUnit | undefined }) {
  if (!unit) {
    return null
  }
  return (
    <FieldDescription>
      {unit.owners.length > 0
        ? `Owned by ${new Intl.ListFormat("en-US").format(unit.owners)}.`
        : "Nobody owns it on the roll, so nobody can be sent the notice yet."}
    </FieldDescription>
  )
}
