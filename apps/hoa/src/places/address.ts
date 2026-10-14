import { z } from "zod"
import { optionalText } from "@/lib/fields"

/** A part of an address from Google Places: its text in full and short, and what it is ("street_number", "route"…). */
export type AddressComponent = { longText: string; shortText: string; types: readonly string[] }

/** A unit's address in parts, as its form and the roll keep them. */
export type AddressParts = { street: string; unitNumber: string; city: string; state: string; postalCode: string }

/** Where an address is, from the address search: the place's id and its coordinates. */
export type Place = { id: string; latitude: number; longitude: number }

/** An address as the app keeps it, a unit's or an association's: in parts, with the place the search found it at. */
export type Address = {
  street: string | null
  unitNumber: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  place: Place | null
}

/** An address as its form gives it. */
export const addressInputSchema = z.object({
  street: optionalText(200),
  unitNumber: optionalText(30),
  city: optionalText(100),
  state: optionalText(40),
  postalCode: optionalText(20),
  place: z
    .object({
      id: z.string().min(1).max(300),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180)
    })
    .nullable()
})

export type AddressInput = z.input<typeof addressInputSchema>

/** Whether an address has nothing in it. */
export const isEmptyAddress = (address: Omit<Address, "place"> | AddressInput) =>
  ![address.street, address.unitNumber, address.city, address.state, address.postalCode].some((part) => part?.trim())

/** An address someone may leave out, such as a mailing address: null when its form has nothing in it. */
export const optionalAddressSchema = addressInputSchema.transform((address) =>
  isEmptyAddress(address) ? null : address
)

/** An address as a JSON column keeps it. */
export const storedAddressSchema = z.object({
  street: z.string().nullable(),
  unitNumber: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  postalCode: z.string().nullable(),
  place: z.object({ id: z.string(), latitude: z.number(), longitude: z.number() }).nullable()
})

/** A form's start for an address: the one kept, or a new one from the street typed so far. */
export const addressValues = (address: Address | null, street = ""): AddressInput => ({
  street: address?.street ?? street,
  unitNumber: address?.unitNumber ?? "",
  city: address?.city ?? "",
  state: address?.state ?? "",
  postalCode: address?.postalCode ?? "",
  place: address?.place ?? null
})

/** An address on one line, as on an envelope: "12 Lakeview Drive #3B, Bellingham, WA 98229". */
export function addressLine(address: Omit<Address, "place">) {
  const street = [address.street, address.unitNumber ? unitNumberText(address.unitNumber) : null]
    .filter(Boolean)
    .join(" ")
  const region = [address.state, address.postalCode].filter(Boolean).join(" ")
  return [street, address.city, region].filter(Boolean).join(", ")
}

/** An address the search suggests for what's been typed: the street, and the city and state under it. */
export type AddressSuggestion = { placeId: string; main: string; secondary: string | null }

/** A suggested address once picked: its parts, and where it is. */
export type FoundAddress = { parts: AddressParts; place: Place }

const partOf = (components: readonly AddressComponent[], type: string, form: "longText" | "shortText" = "longText") =>
  components.find((component) => component.types.includes(type))?.[form] ?? ""

/**
 * An address's parts from a place's components: the house number and street, the apartment, suite or unit, the city
 * (or the town, for a place outside one), the state's abbreviation and the ZIP code.
 */
export function addressParts(components: readonly AddressComponent[]): AddressParts {
  return {
    street: [partOf(components, "street_number"), partOf(components, "route")].filter(Boolean).join(" "),
    unitNumber: partOf(components, "subpremise"),
    city: partOf(components, "locality") || partOf(components, "postal_town") || partOf(components, "sublocality"),
    state: partOf(components, "administrative_area_level_1", "shortText"),
    postalCode: partOf(components, "postal_code")
  }
}

/** An apartment's, suite's or unit's number as an address writes it: "#3B", or "Apt 3" as given. */
export function unitNumberText(unitNumber: string) {
  return /^[\w-]+$/.test(unitNumber) ? `#${unitNumber}` : unitNumber
}

/**
 * The name a unit gets from its address until someone gives it another: the house number, "12" of "12 Lakeview
 * Drive", with the apartment, suite or unit's number when it has one. Empty for an address without a number.
 */
export function unitNameFrom(street: string, unitNumber: string) {
  const houseNumber = /^\s*(\d+[a-z]?)\b/i.exec(street)?.[1] ?? ""
  return houseNumber && unitNumber.trim() ? `${houseNumber} ${unitNumberText(unitNumber.trim())}` : houseNumber
}

/** The states, the District of Columbia and the territories, for an address's State: their codes and names. */
export const usStates = [
  ["AL", "Alabama"],
  ["AK", "Alaska"],
  ["AZ", "Arizona"],
  ["AR", "Arkansas"],
  ["CA", "California"],
  ["CO", "Colorado"],
  ["CT", "Connecticut"],
  ["DE", "Delaware"],
  ["DC", "District of Columbia"],
  ["FL", "Florida"],
  ["GA", "Georgia"],
  ["HI", "Hawaii"],
  ["ID", "Idaho"],
  ["IL", "Illinois"],
  ["IN", "Indiana"],
  ["IA", "Iowa"],
  ["KS", "Kansas"],
  ["KY", "Kentucky"],
  ["LA", "Louisiana"],
  ["ME", "Maine"],
  ["MD", "Maryland"],
  ["MA", "Massachusetts"],
  ["MI", "Michigan"],
  ["MN", "Minnesota"],
  ["MS", "Mississippi"],
  ["MO", "Missouri"],
  ["MT", "Montana"],
  ["NE", "Nebraska"],
  ["NV", "Nevada"],
  ["NH", "New Hampshire"],
  ["NJ", "New Jersey"],
  ["NM", "New Mexico"],
  ["NY", "New York"],
  ["NC", "North Carolina"],
  ["ND", "North Dakota"],
  ["OH", "Ohio"],
  ["OK", "Oklahoma"],
  ["OR", "Oregon"],
  ["PA", "Pennsylvania"],
  ["RI", "Rhode Island"],
  ["SC", "South Carolina"],
  ["SD", "South Dakota"],
  ["TN", "Tennessee"],
  ["TX", "Texas"],
  ["UT", "Utah"],
  ["VT", "Vermont"],
  ["VA", "Virginia"],
  ["WA", "Washington"],
  ["WV", "West Virginia"],
  ["WI", "Wisconsin"],
  ["WY", "Wyoming"],
  ["AS", "American Samoa"],
  ["GU", "Guam"],
  ["MP", "Northern Mariana Islands"],
  ["PR", "Puerto Rico"],
  ["VI", "U.S. Virgin Islands"]
] as const satisfies readonly (readonly [string, string])[]
