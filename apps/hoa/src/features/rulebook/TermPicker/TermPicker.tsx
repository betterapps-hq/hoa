import { XIcon } from "lucide-react"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList
} from "@/components/ui/combobox"
import { InputGroupAddon, InputGroupButton } from "@/components/ui/input-group"
import type { TermOption } from "./TermPicker.utils"

export type TermPickerProps = {
  id?: string
  /** The accessible name, when no visible label names it. */
  label?: string
  value: string | null
  options: TermOption[]
  onChange: (key: string | null) => void
  placeholder?: string
  isClearable?: boolean
  isInvalid?: boolean
}

/** Picks one term by its label; the list narrows as you type. */
export function TermPicker({
  id,
  label,
  value,
  options,
  onChange,
  placeholder = "Choose a term",
  isClearable = false,
  isInvalid = false
}: TermPickerProps) {
  const selected =
    value === null
      ? null
      : (options.find((option) => option.key === value) ?? { key: value, label: value, hint: "not a term here" })
  return (
    <Combobox
      items={options}
      value={selected}
      onValueChange={(option) => onChange(option?.key ?? null)}
      itemToStringLabel={(option) => option.label}
      isItemEqualToValue={(option, current) => option.key === current.key}
      limit={60}
    >
      <ComboboxInput
        id={id}
        aria-label={label}
        aria-invalid={isInvalid || undefined}
        placeholder={placeholder}
        className="w-full"
        onKeyDown={(event) => {
          // Enter chooses a term; it never submits the form around the picker.
          if (event.key === "Enter") {
            event.preventDefault()
          }
        }}
      >
        {isClearable && value !== null ? (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              variant="ghost"
              aria-label={`Clear ${label ?? "the choice"}`}
              onClick={() => onChange(null)}
            >
              <XIcon />
            </InputGroupButton>
          </InputGroupAddon>
        ) : null}
      </ComboboxInput>
      <ComboboxContent>
        <ComboboxEmpty>No terms match.</ComboboxEmpty>
        <ComboboxList>
          {(option: TermOption) => (
            <ComboboxItem key={option.key} value={option}>
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{option.label}</span>
                <span className="truncate font-mono text-xs text-muted-foreground">{option.hint}</span>
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
