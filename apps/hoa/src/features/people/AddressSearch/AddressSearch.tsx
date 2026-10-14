import { useDebouncedValue } from "@mantine/hooks"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"
import { Combobox, ComboboxContent, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox"
import type { AddressSuggestion, FoundAddress } from "@/places/address"
import { lookUpUnitAddress, suggestUnitAddresses } from "../people.functions"

type AddressSearchProps = {
  id: string
  /** The street address as typed. */
  value: string
  onChange: (street: string) => void
  /** A suggested address picked: its parts, to fill the rest of the form, and where it is. */
  onFind: (found: FoundAddress) => void
  isInvalid?: boolean
}

/** The street address, typed or found: the search suggests addresses as it's typed, and picking one fills the rest. */
export function AddressSearch({ id, value, onChange, onFind, isInvalid = false }: AddressSearchProps) {
  // One search session runs from the first suggestion to the address picked; Google bills it once.
  const [sessionToken, setSessionToken] = useState(() => crypto.randomUUID())
  const [typed] = useDebouncedValue(value.trim(), 250)
  const { data: suggestions = [] } = useQuery({
    queryKey: ["address-suggestions", typed, sessionToken],
    queryFn: () => suggestUnitAddresses({ data: { input: typed, sessionToken } }),
    enabled: typed.length >= 3,
    staleTime: Number.POSITIVE_INFINITY
  })
  const find = async (suggestion: AddressSuggestion) => {
    try {
      onFind(await lookUpUnitAddress({ data: { placeId: suggestion.placeId, sessionToken } }))
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "That address didn't load. Type it instead.")
    } finally {
      setSessionToken(crypto.randomUUID())
    }
  }
  return (
    <Combobox<AddressSuggestion>
      items={suggestions}
      filter={null}
      value={null}
      inputValue={value}
      onInputValueChange={onChange}
      onValueChange={(suggestion) => {
        if (suggestion) {
          void find(suggestion)
        }
      }}
      itemToStringLabel={(suggestion) => suggestion.main}
    >
      <ComboboxInput
        id={id}
        className="w-full"
        showTrigger={false}
        placeholder="Start typing an address"
        autoComplete="off"
        aria-invalid={isInvalid}
      />
      {suggestions.length > 0 ? (
        <ComboboxContent>
          <ComboboxList>
            {(suggestion: AddressSuggestion) => (
              <ComboboxItem key={suggestion.placeId} value={suggestion}>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{suggestion.main}</span>
                  {suggestion.secondary ? (
                    <span className="truncate text-xs text-muted-foreground">{suggestion.secondary}</span>
                  ) : null}
                </span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      ) : null}
    </Combobox>
  )
}
