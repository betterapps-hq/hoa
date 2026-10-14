import type { Address } from "@/places/address"

/** An address as a row keeps it: in parts, with the place in columns of its own (schema.ts, `addressColumns`). */
type AddressRow = {
  street: string | null
  unitNumber: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  placeId: string | null
  latitude: number | null
  longitude: number | null
}

export const toAddress = (row: AddressRow): Address => ({
  street: row.street,
  unitNumber: row.unitNumber,
  city: row.city,
  state: row.state,
  postalCode: row.postalCode,
  place:
    row.placeId !== null && row.latitude !== null && row.longitude !== null
      ? { id: row.placeId, latitude: row.latitude, longitude: row.longitude }
      : null
})

export const addressRow = ({ place, ...parts }: Address): AddressRow => ({
  ...parts,
  placeId: place?.id ?? null,
  latitude: place?.latitude ?? null,
  longitude: place?.longitude ?? null
})
