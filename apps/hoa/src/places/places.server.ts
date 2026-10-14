import { z } from "zod"
import { env } from "@/env.server"
import { addressParts, type AddressSuggestion, type FoundAddress } from "./address"

// The address search: Google's Places API (New), from the server so the key stays there. A search session, from the
// first suggestion to the address picked, is billed once; its token ties the calls together.

const placesApi = "https://places.googleapis.com/v1"

/** The countries the search suggests addresses in. */
const regionCodes = ["us"]

/** How far from the association's units, in meters, the search looks first. */
const nearbyMeters = 20_000

/** Whether the address search is on: it needs a Google Maps Platform key. */
export const isAddressSearchOn = () => Boolean(env.GOOGLE_MAPS_API_KEY)

const unavailable = "The address search isn't working right now. Type the address instead."

const suggestionsSchema = z.object({
  suggestions: z
    .array(
      z.object({
        placePrediction: z
          .object({
            placeId: z.string(),
            structuredFormat: z.object({
              mainText: z.object({ text: z.string() }),
              secondaryText: z.object({ text: z.string() }).optional()
            })
          })
          .optional()
      })
    )
    .default([])
})

const placeSchema = z.object({
  id: z.string(),
  addressComponents: z
    .array(z.object({ longText: z.string(), shortText: z.string(), types: z.array(z.string()) }))
    .default([]),
  location: z.object({ latitude: z.number(), longitude: z.number() })
})

async function callPlaces(path: string, fieldMask: string, init: RequestInit = {}) {
  const key = env.GOOGLE_MAPS_API_KEY
  if (!key) {
    throw new Error(unavailable)
  }
  const response = await fetch(`${placesApi}/${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": fieldMask }
  })
  if (!response.ok) {
    throw new Error(unavailable)
  }
  return response.json()
}

/** Street addresses for what's been typed, those near `near` first when the association has units on the map. */
export async function suggestAddresses(
  input: string,
  sessionToken: string,
  near: { latitude: number; longitude: number } | null
): Promise<AddressSuggestion[]> {
  const body = await callPlaces(
    "places:autocomplete",
    "suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat",
    {
      method: "POST",
      body: JSON.stringify({
        input,
        sessionToken,
        includedRegionCodes: regionCodes,
        includedPrimaryTypes: ["street_address", "premise", "subpremise"],
        ...(near ? { locationBias: { circle: { center: near, radius: nearbyMeters } } } : {})
      })
    }
  )
  return suggestionsSchema.parse(body).suggestions.flatMap(({ placePrediction }) =>
    placePrediction
      ? [
          {
            placeId: placePrediction.placeId,
            main: placePrediction.structuredFormat.mainText.text,
            secondary: placePrediction.structuredFormat.secondaryText?.text ?? null
          }
        ]
      : []
  )
}

/** A suggested address's parts and where it is, ending the search session. */
export async function lookUpAddress(placeId: string, sessionToken: string): Promise<FoundAddress> {
  const body = await callPlaces(
    `places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(sessionToken)}`,
    "id,addressComponents,location"
  )
  const place = placeSchema.parse(body)
  return {
    parts: addressParts(place.addressComponents),
    place: { id: place.id, latitude: place.location.latitude, longitude: place.location.longitude }
  }
}
