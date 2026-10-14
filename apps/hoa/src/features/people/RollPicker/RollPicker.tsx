import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList
} from "@/components/ui/combobox"

/** Someone or something on the roll to pick: its id, its name, and a line that tells look-alikes apart. */
export type RollChoice = { value: string; label: string; detail?: string | null }

type RollPickerProps = {
  id: string
  choices: readonly RollChoice[]
  value: string
  onChange: (value: string) => void
  placeholder: string
  empty: string
  isInvalid?: boolean
}

/** Picks a person or a unit from the roll, found by typing part of a name, email or address. */
export function RollPicker({ id, choices, value, onChange, placeholder, empty, isInvalid = false }: RollPickerProps) {
  const selected = choices.find((choice) => choice.value === value) ?? null
  return (
    <Combobox
      items={[...choices]}
      value={selected}
      onValueChange={(choice) => onChange(choice?.value ?? "")}
      itemToStringLabel={(choice) => choice.label}
      isItemEqualToValue={(choice, current) => choice.value === current.value}
    >
      <ComboboxInput id={id} placeholder={placeholder} aria-invalid={isInvalid} />
      <ComboboxContent>
        <ComboboxEmpty>{empty}</ComboboxEmpty>
        <ComboboxList>
          {(choice: RollChoice) => (
            <ComboboxItem key={choice.value} value={choice}>
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{choice.label}</span>
                {choice.detail ? <span className="truncate text-xs text-muted-foreground">{choice.detail}</span> : null}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
