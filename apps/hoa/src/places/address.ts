/** A part of an address from Google Places: its text in full and short, and what it is ("street_number", "route"…). */
export type AddressComponent = { longText: string; shortText: string; types: readonly string[] }

/** A unit's address in parts, as its form and the roll keep them. */
export type AddressParts = { street: string; unitNumber: string; city: string; state: string; postalCode: string }

/** Where an address is, from the address search: the place's id and its coordinates. */
export type Place = { id: string; latitude: number; longitude: number }

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
