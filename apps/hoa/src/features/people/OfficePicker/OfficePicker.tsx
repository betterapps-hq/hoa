import { useState } from "react"
import { Input } from "@/components/ui/input"
import { ChoiceSelect, type Choice } from "@/features/rulebook/ChoiceSelect/ChoiceSelect"
import { boardOffices } from "@/people/people"

type OfficeChoice = "" | (typeof boardOffices)[number] | "other"

const officeChoices: readonly Choice<OfficeChoice>[] = [
  { value: "", label: "No office" },
  ...boardOffices.map((office) => ({ value: office, label: office })),
  { value: "other", label: "Other" }
]

type OfficePickerProps = {
  id: string
  /** Its name for a screen reader, when no label names it. */
  label?: string
  /** The office's title; empty for none. */
  value: string
  onChange: (office: string) => void
}

/** A board seat's office: one of the usual officers, or, under Other, another title typed in. */
export function OfficePicker({ id, label, value, onChange }: OfficePickerProps) {
  const [isOther, setOther] = useState(() => value !== "" && !boardOffices.some((office) => office === value))
  const chosen = isOther ? "other" : (boardOffices.find((office) => office === value) ?? "")
  return (
    <div className="flex flex-col gap-2">
      <ChoiceSelect
        id={id}
        label={label}
        className="w-full"
        value={chosen}
        choices={officeChoices}
        onChange={(choice) => {
          setOther(choice === "other")
          if (choice === "other") {
            onChange("")
            requestAnimationFrame(() => document.getElementById(`${id}-title`)?.focus())
          } else {
            onChange(choice)
          }
        }}
      />
      {isOther ? (
        <Input
          id={`${id}-title`}
          aria-label="Office title"
          placeholder="Member at large"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : null}
    </div>
  )
}
