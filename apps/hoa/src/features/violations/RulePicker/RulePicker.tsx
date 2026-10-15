import { useMemo, useState } from "react"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor
} from "@/components/ui/combobox"
import { createSearch } from "@/lib/search"

/** A rule to pick: its key, its title, what it says, and where the documents say it. */
export type RuleChoice = { key: string; title: string; statement: string; citation: string }

type RulePickerProps = {
  id: string
  rules: readonly RuleChoice[]
  value: readonly string[]
  onChange: (keys: string[]) => void
  isInvalid?: boolean
}

/** Picks the rules a violation breaks, found by typing words from a rule's title, what it says or its citation. */
export function RulePicker({ id, rules, value, onChange, isInvalid = false }: RulePickerProps) {
  const anchor = useComboboxAnchor()
  const [typed, setTyped] = useState("")
  const search = useMemo(
    () =>
      createSearch(rules, {
        id: (rule) => rule.key,
        fields: {
          title: { text: (rule) => rule.title, boost: 3 },
          citation: { text: (rule) => rule.citation, boost: 2 },
          statement: { text: (rule) => rule.statement }
        }
      }),
    [rules]
  )
  const byKey = useMemo(() => new Map(rules.map((rule) => [rule.key, rule])), [rules])
  const selected = value.flatMap((key) => byKey.get(key) ?? [])
  return (
    <Combobox
      multiple
      items={[...rules]}
      filteredItems={search.rank(rules, typed)}
      value={selected}
      onValueChange={(chosen) => onChange(chosen.map((rule) => rule.key))}
      onInputValueChange={setTyped}
      itemToStringLabel={(rule) => rule.title}
      isItemEqualToValue={(rule, current) => rule.key === current.key}
      limit={50}
    >
      <ComboboxChips ref={anchor}>
        {selected.map((rule) => (
          <ComboboxChip key={rule.key} className="max-w-full">
            <span className="truncate">{rule.title}</span>
          </ComboboxChip>
        ))}
        <ComboboxChipsInput
          id={id}
          placeholder={selected.length > 0 ? "" : "Find a rule by what it says"}
          aria-invalid={isInvalid}
        />
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>No rule says that. Try other words.</ComboboxEmpty>
        <ComboboxList>
          {(rule: RuleChoice) => (
            <ComboboxItem key={rule.key} value={rule}>
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{rule.title}</span>
                <span className="line-clamp-2 text-xs text-muted-foreground">
                  {rule.citation ? `${rule.citation}: ` : ""}
                  {rule.statement}
                </span>
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
