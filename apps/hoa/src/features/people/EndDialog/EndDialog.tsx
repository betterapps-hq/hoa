import { useForm } from "@tanstack/react-form"
import { z } from "zod"
import { RequiredMark } from "@/components/RequiredMark/RequiredMark"
import { Button } from "@/components/ui/button"
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
  FieldSet,
  FieldTitle
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { saveThenClose } from "@/lib/form"
import { seatTermLabel, type CommitteeMember } from "@/people/people"

/** One of the things the dialog can end: someone's time at a home, or a seat on a committee. */
export type EndChoice = { id: string; title: string; subtitle: string }

type EndDialogProps = {
  title: string
  /** What they're picking from: "Who" or "Which". */
  legend: string
  choices: readonly EndChoice[]
  /** Today, where the viewer is, as the day it ends unless they pick another. */
  today: string
  /** A line under the title; with one choice, that choice says what ends unless this is given. */
  description?: string
  /** The first day it may end on; any day without it. */
  earliest?: string
  /** The button that ends it: "End it" unless given. */
  confirmLabel?: string
  onEnd: (end: { id: string; endedOn: string }) => Promise<void>
  onOpenChange: (open: boolean) => void
}

/**
 * Ends one of someone's links on a day: their time at a home, or a seat on the board or a committee. Nothing is
 * deleted: the history stays. With one choice it's picked already, and named under the title.
 */
export function EndDialog({
  title,
  legend,
  choices,
  today,
  description,
  earliest,
  confirmLabel = "End it",
  onEnd,
  onOpenChange
}: EndDialogProps) {
  const only = choices.length === 1 ? choices[0] : undefined
  const form = useForm({
    defaultValues: { id: only?.id ?? "", endedOn: today },
    validators: {
      onSubmit: z.object({
        id: z.string().min(1, `Pick ${legend.toLowerCase()}.`),
        endedOn: z.iso.date("Give a date.").refine((day) => !earliest || day >= earliest, "Pick today or a later day.")
      })
    },
    onSubmit: ({ value }) =>
      saveThenClose(
        () => onEnd({ id: value.id, endedOn: value.endedOn }),
        () => onOpenChange(false)
      )
  })
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
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
            <DialogTitle>{title}</DialogTitle>
            {description || only ? (
              <DialogDescription>{description ?? `${only?.title}, ${only?.subtitle}`}</DialogDescription>
            ) : null}
          </DialogHeader>
          <FieldGroup>
            <form.Field name="id">
              {(field) =>
                only ? null : (
                  <FieldSet data-invalid={field.state.meta.errors.length > 0}>
                    <FieldLegend variant="label">
                      {legend}
                      <RequiredMark />
                    </FieldLegend>
                    <RadioGroup className="gap-2" value={field.state.value} onValueChange={field.handleChange}>
                      {choices.map((choice) => (
                        <FieldLabel key={choice.id} htmlFor={`end-${choice.id}`}>
                          <Field orientation="horizontal" className="items-center gap-3 py-2.5!">
                            <RadioGroupItem id={`end-${choice.id}`} value={choice.id} />
                            <FieldContent className="gap-0.5">
                              <FieldTitle className="font-normal">{choice.title}</FieldTitle>
                              <FieldDescription className="text-xs">{choice.subtitle}</FieldDescription>
                            </FieldContent>
                          </Field>
                        </FieldLabel>
                      ))}
                    </RadioGroup>
                    <FieldError errors={field.state.meta.errors} />
                  </FieldSet>
                )
              }
            </form.Field>
            <form.Field name="endedOn">
              {(field) => (
                <Field data-invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor="end-day">
                    Ends on
                    <RequiredMark />
                  </FieldLabel>
                  <Input
                    id="end-day"
                    type="date"
                    className="w-44"
                    min={earliest}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" variant="destructive" disabled={isSubmitting}>
                  {confirmLabel}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type ResignDialogProps = {
  /** The committee's name. */
  committee: string
  /** Their seat on it, by its id. */
  seat: { id: string } & Pick<CommitteeMember, "office" | "role" | "startedOn" | "termEndsOn" | "endedOn">
  today: string
  onResign: (endedOn: string) => Promise<void>
  onOpenChange: (open: boolean) => void
}

/** Someone leaving their own seat on the board or a committee, today or on a later day. */
export function ResignDialog({ committee, seat, today, onResign, onOpenChange }: ResignDialogProps) {
  return (
    <EndDialog
      title={`Resign from ${committee}?`}
      description="You stop doing its work that day. Your term stays on record."
      legend="Which"
      choices={[{ id: seat.id, title: committee, subtitle: seatTermLabel(seat, today) }]}
      today={today}
      earliest={today}
      confirmLabel="Resign"
      onOpenChange={onOpenChange}
      onEnd={({ endedOn }) => onResign(endedOn)}
    />
  )
}
