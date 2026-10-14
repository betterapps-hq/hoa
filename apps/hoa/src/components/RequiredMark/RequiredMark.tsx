/** The asterisk after a required field's label; the input's `required` tells a screen reader. */
export function RequiredMark() {
  return (
    <span aria-hidden className="ml-0.5 text-destructive">
      *
    </span>
  )
}
