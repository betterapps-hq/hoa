import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { cn } from "@/lib/utils"

export type MoneyInputProps = {
  id: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  isInvalid?: boolean
  className?: string
}

/** A dollar amount, typed after a dollar sign. */
export function MoneyInput({ id, value, onChange, onBlur, isInvalid = false, className }: MoneyInputProps) {
  return (
    <InputGroup className={cn("w-44", className)}>
      <InputGroupAddon>
        <InputGroupText>$</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput
        id={id}
        inputMode="decimal"
        value={value}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={isInvalid}
      />
    </InputGroup>
  )
}
