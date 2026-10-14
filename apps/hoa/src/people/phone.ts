import { parsePhoneNumberFromString } from "libphonenumber-js/min"
import { z } from "zod"

/** Where a number without a country code is read as from: the associations are in the United States. */
const homeCountry = "US"

/** A phone number as kept, in E.164 ("+13605550101"); null when the text isn't a phone number. */
export function phoneKey(text: string) {
  const phone = parsePhoneNumberFromString(text, homeCountry)
  return phone?.isValid() ? phone.number : null
}

/** A kept phone number as people read it: "(360) 555-0101" at home, "+44 20 7946 0958" elsewhere. */
export function phoneText(kept: string) {
  const phone = parsePhoneNumberFromString(kept, homeCountry)
  if (!phone) {
    return kept
  }
  return phone.country === homeCountry ? phone.formatNational() : phone.formatInternational()
}

/** An optional phone number: kept in E.164, or null when left empty. */
export const optionalPhone = z
  .string()
  .trim()
  .transform((text, context) => {
    if (text === "") {
      return null
    }
    const kept = phoneKey(text)
    if (kept === null) {
      context.addIssue({ code: "custom", message: "Give a phone number such as 360-555-0101." })
      return z.NEVER
    }
    return kept
  })
