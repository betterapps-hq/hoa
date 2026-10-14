import { useForm } from "@tanstack/react-form"
import { z } from "zod"
import { RequiredMark } from "@/components/RequiredMark/RequiredMark"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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

/** One of the things the dialog can end: someone's time at a home, or a seat on a committee. */
export type EndChoice = { id: string; title: string; subtitle: string }

type EndDialogProps = {
  title: string
  /** What they're picking from: "Who" or "Which". */
  legend: string
  choices: readonly EndChoice[]
  /** Today, where the viewer is, as the day it ends unless they pick another. */
  today: string
  onEnd: (end: { id: string; endedOn: string }) => Promise<void>
  onOpenChange: (open: boolean) => void
}

/**
 * Ends one of someone's links on a day: their time at a home, or a seat on the board or a committee. Nothing is
 * deleted: the history stays. With one choice it's picked already.
 */
export function EndDialog({ title, legend, choices, today, onEnd, onOpenChange }: EndDialogProps) {
  const form = useForm({
    defaultValues: { id: choices.length === 1 ? (choices[0]?.id ?? "") : "", endedOn: today },
    validators: {
      onSubmit: z.object({
        id: z.string().min(1, `Pick ${legend.toLowerCase()}.`),
        endedOn: z.iso.date("Give a date.")
      })
    },
    onSubmit: async ({ value }) => {
      await onEnd({ id: value.id, endedOn: value.endedOn })
      onOpenChange(false)
    }
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
          </DialogHeader>
          <FieldGroup>
            <form.Field name="id">
              {(field) => (
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
              )}
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
                  End it
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
