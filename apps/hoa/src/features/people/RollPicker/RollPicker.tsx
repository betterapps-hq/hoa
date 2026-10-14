import { PlusIcon } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
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
  /** Its name for a screen reader, when no label names it. */
  label?: string
  /** Makes a new one from what's been typed, offered under the choices as `createLabel`. */
  onCreate?: (typed: string) => void
  createLabel?: string
}

/** Picks a person or a unit from the roll, found by typing part of a name, email or address. */
export function RollPicker({
  id,
  choices,
  value,
  onChange,
  placeholder,
  empty,
  isInvalid = false,
  label,
  onCreate,
  createLabel
}: RollPickerProps) {
  const selected = choices.find((choice) => choice.value === value) ?? null
  const [typed, setTyped] = useState("")
  return (
    <Combobox
      items={[...choices]}
      value={selected}
      onValueChange={(choice) => onChange(choice?.value ?? "")}
      onInputValueChange={setTyped}
      itemToStringLabel={(choice) => choice.label}
      isItemEqualToValue={(choice, current) => choice.value === current.value}
    >
      <ComboboxInput id={id} placeholder={placeholder} aria-label={label} aria-invalid={isInvalid} />
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
        {onCreate ? (
          <div className="border-t p-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => onCreate(typed === selected?.label ? "" : typed.trim())}
            >
              <PlusIcon />
              {createLabel}
            </Button>
          </div>
        ) : null}
      </ComboboxContent>
    </Combobox>
  )
}
