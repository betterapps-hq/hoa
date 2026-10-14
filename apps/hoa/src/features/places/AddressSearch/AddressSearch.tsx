import { useDebouncedValue } from "@mantine/hooks"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { CircleCheckIcon, MapPinIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor
} from "@/components/ui/combobox"
import { InputGroupAddon } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import type { AddressSuggestion, FoundAddress } from "@/places/address"
import { lookUpSuggestedAddress, suggestAddressesFor } from "../places.functions"

type AddressSearchProps = {
  id: string
  /** The street address as typed. */
  value: string
  onChange: (street: string) => void
  /** A suggested address picked: its parts, to fill the rest of the form, and where it is. */
  onFind: (found: FoundAddress) => void
  /** Whether the address is one the search found, rather than typed by hand. */
  isFound?: boolean
  isInvalid?: boolean
}

const searchesFrom = 3

/**
 * The street address, typed or found: the search suggests addresses near the association as it's typed, and picking
 * one fills in the rest. While the search is off it's a plain text box.
 */
export function AddressSearch({ id, value, onChange, onFind, isFound = false, isInvalid = false }: AddressSearchProps) {
  // One search session runs from the first suggestion to the address picked; Google bills it once.
  const [sessionToken, setSessionToken] = useState(() => crypto.randomUUID())
  const [isLookingUp, setLookingUp] = useState(false)
  // The suggestions open under the whole box, the pin included.
  const anchor = useComboboxAnchor()
  // It searches once someone types: an address the form opens with isn't looked up again.
  const [hasTyped, setTyped] = useState(false)
  const [typed] = useDebouncedValue(value.trim(), 250)
  const isSearchable = hasTyped && value.trim().length >= searchesFrom
  const { data, isFetching } = useQuery({
    queryKey: ["address-suggestions", typed, sessionToken],
    queryFn: () => suggestAddressesFor({ data: { input: typed, sessionToken } }),
    enabled: hasTyped && typed.length >= searchesFrom,
    staleTime: Number.POSITIVE_INFINITY,
    placeholderData: keepPreviousData
  })
  const isOn = data?.isOn ?? true
  const suggestions = isSearchable ? (data?.suggestions ?? []) : []
  const isSearching = isFetching || typed !== value.trim()
  const isBusy = isLookingUp || (isOn && isSearchable && isFetching)
  const find = async (suggestion: AddressSuggestion) => {
    setLookingUp(true)
    try {
      onFind(await lookUpSuggestedAddress({ data: { placeId: suggestion.placeId, sessionToken } }))
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "That address didn't load. Type it instead.")
    } finally {
      setLookingUp(false)
      setTyped(false)
      setSessionToken(crypto.randomUUID())
    }
  }
  return (
    <Combobox<AddressSuggestion>
      items={suggestions}
      filter={null}
      value={null}
      inputValue={value}
      // Only what's typed changes the street: closing the list would otherwise empty it, as nothing stays picked.
      onInputValueChange={(next, { reason }) => {
        if (reason === "input-change") {
          setTyped(true)
          onChange(next)
        }
      }}
      onValueChange={(suggestion) => {
        if (suggestion) {
          void find(suggestion)
        }
      }}
      itemToStringLabel={(suggestion) => suggestion.main}
    >
      <div ref={anchor}>
        <ComboboxInput
          id={id}
          className="w-full"
          showTrigger={false}
          placeholder="Start typing an address"
          autoComplete="off"
          aria-invalid={isInvalid}
        >
          <InputGroupAddon align="inline-start">
            <MapPinIcon className="text-muted-foreground" />
          </InputGroupAddon>
          {isBusy ? (
            <InputGroupAddon align="inline-end">
              <Spinner aria-label="Searching addresses" />
            </InputGroupAddon>
          ) : null}
          {isFound && !isBusy ? (
            <InputGroupAddon align="inline-end">
              <CircleCheckIcon aria-hidden className="text-emerald-600 dark:text-emerald-400" />
              <span className="sr-only">Found by the address search</span>
            </InputGroupAddon>
          ) : null}
        </ComboboxInput>
      </div>
      {isOn && isSearchable ? (
        <ComboboxContent anchor={anchor}>
          <ComboboxEmpty className="px-3 py-3">
            {isSearching ? (
              <span className="flex items-center gap-2">
                <Spinner aria-hidden />
                Searching addresses
              </span>
            ) : (
              "No address matches. Keep typing, or fill in the rest yourself."
            )}
          </ComboboxEmpty>
          <ComboboxList>
            {(suggestion: AddressSuggestion) => (
              <ComboboxItem key={suggestion.placeId} value={suggestion} className="items-start py-2">
                <MapPinIcon className="mt-0.5 text-muted-foreground" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{suggestion.main}</span>
                  {suggestion.secondary ? (
                    <span className="truncate text-xs text-muted-foreground">{suggestion.secondary}</span>
                  ) : null}
                </span>
              </ComboboxItem>
            )}
          </ComboboxList>
          <p className="border-t px-3 py-1.5 text-right text-[0.6875rem] text-muted-foreground">Powered by Google</p>
        </ComboboxContent>
      ) : null}
    </Combobox>
  )
}
