import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getDb } from "@/db/client.server"
import { unitsCenter } from "@/db/peopleRepository"
import { isAddressSearchOn, lookUpAddress, suggestAddresses } from "@/places/places.server"
import { getRequestContext } from "@/session/requestContext.server"

// The address search (Google Places) behind every address in the app: a unit's, the association's, and someone's
// mailing address. Anyone signed in to the association can search, near its units.

/** Addresses for what's been typed, nearest the association's units first, and whether the search is on at all. */
export const suggestAddressesFor = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ input: z.string().trim().min(3).max(200), sessionToken: z.uuid() }).parse(data)
  )
  .handler(async ({ data }) => {
    const context = await getRequestContext()
    if (!isAddressSearchOn()) {
      return { isOn: false, suggestions: [] }
    }
    const near = await unitsCenter(getDb(), context.organization.id)
    return { isOn: true, suggestions: await suggestAddresses(data.input, data.sessionToken, near) }
  })

/** A suggested address's parts and where it is. */
export const lookUpSuggestedAddress = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ placeId: z.string().min(1).max(300), sessionToken: z.uuid() }).parse(data))
  .handler(async ({ data }) => {
    await getRequestContext()
    return lookUpAddress(data.placeId, data.sessionToken)
  })
