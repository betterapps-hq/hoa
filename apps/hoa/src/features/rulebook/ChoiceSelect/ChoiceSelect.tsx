import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"

export type Choice<V extends string> = { value: V; label: string }

export type ChoiceSelectProps<V extends string> = {
  id?: string
  /** The accessible name, when no visible label names it. */
  label?: string
  value: V
  choices: readonly Choice<V>[]
  onChange: (value: V) => void
  className?: string
}

/** A native select over a fixed set of choices, typed by their values. */
export function ChoiceSelect<V extends string>({
  id,
  label,
  value,
  choices,
  onChange,
  className
}: ChoiceSelectProps<V>) {
  return (
    <NativeSelect
      id={id}
      aria-label={label}
      value={value}
      className={className}
      onChange={(event) => {
        const chosen = choices.find((choice) => choice.value === event.target.value)
        if (chosen) {
          onChange(chosen.value)
        }
      }}
    >
      {choices.map((choice) => (
        <NativeSelectOption key={choice.value} value={choice.value}>
          {choice.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
}
