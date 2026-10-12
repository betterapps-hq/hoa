import { useMemo } from "react"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList
} from "@/components/ui/combobox"
import { zoneLabel, zoneOffset } from "./SettingsTab.utils"

type Zone = { value: string; label: string }

type TimeZonePickerProps = { id: string; value: string; onChange: (zone: string) => void }

/**
 * Every time zone the browser knows, west to east by its offset from UTC today, found by its offset, name or city:
 * "-07", "Pacific", "Los Angeles".
 */
export function TimeZonePicker({ id, value, onChange }: TimeZonePickerProps) {
  const zones = useMemo(
    () =>
      Intl.supportedValuesOf("timeZone")
        .map((zone) => ({ zone, offset: zoneOffset(zone) }))
        .toSorted((a, b) => a.offset - b.offset || a.zone.localeCompare(b.zone))
        .map(({ zone }): Zone => ({ value: zone, label: zoneLabel(zone) })),
    []
  )
  const selected = zones.find((zone) => zone.value === value) ?? { value, label: zoneLabel(value) }
  return (
    <Combobox
      items={zones}
      value={selected}
      onValueChange={(zone) => {
        if (zone) {
          onChange(zone.value)
        }
      }}
      itemToStringLabel={(zone) => zone.label}
      isItemEqualToValue={(zone, current) => zone.value === current.value}
    >
      <ComboboxInput id={id} className="w-96" placeholder="Search time zones" />
      <ComboboxContent>
        <ComboboxEmpty>No time zones match.</ComboboxEmpty>
        <ComboboxList>
          {(zone: Zone) => (
            <ComboboxItem key={zone.value} value={zone}>
              {zone.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
