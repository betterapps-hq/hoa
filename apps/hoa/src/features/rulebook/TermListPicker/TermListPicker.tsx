import { XIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TermPicker } from "../TermPicker/TermPicker"
import type { TermOption } from "../TermPicker/TermPicker.utils"

export type TermListPickerProps = {
  id?: string
  label: string
  values: string[]
  options: TermOption[]
  onChange: (keys: string[]) => void
  placeholder?: string
}

/** Picks several terms: each picked one is a chip that can be removed. */
export function TermListPicker({
  id,
  label,
  values,
  options,
  onChange,
  placeholder = "Add a term"
}: TermListPickerProps) {
  const labelOf = (key: string) => options.find((option) => option.key === key)?.label ?? key
  return (
    <div className="flex flex-col gap-2">
      {values.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={label}>
          {values.map((key) => (
            <li key={key}>
              <Badge variant="secondary" className="gap-1 pr-0.5">
                {labelOf(key)}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove ${labelOf(key)}`}
                  onClick={() => onChange(values.filter((item) => item !== key))}
                >
                  <XIcon />
                </Button>
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
      <TermPicker
        id={id}
        label={values.length > 0 ? `Add to ${label}` : label}
        value={null}
        options={options.filter((option) => !values.includes(option.key))}
        onChange={(key) => (key ? onChange([...values, key]) : undefined)}
        placeholder={placeholder}
      />
    </div>
  )
}
