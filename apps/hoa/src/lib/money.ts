import { z } from "zod"

// Money as people read and type it: whole cents in US dollars, shown as "$1,250.00" and typed as "1250" or "1250.50".

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

/** Cents as dollars: "$1,250.00". */
export const money = (cents: number) => usd.format(cents / 100)

/** Cents as a dollar amount to type over: "1250.00". */
export const dollarsText = (cents: number) => (cents / 100).toFixed(2)

/** Typed dollars as cents; null when it isn't an amount. */
export function centsFrom(text: string): number | null {
  const typed = text.trim().replaceAll(",", "").replace(/^\$/, "")
  return /^\d+(\.\d{1,2})?$/.test(typed) ? Math.round(Number(typed) * 100) : null
}

/** A typed dollar amount above $0, and at most `most` cents when given. */
export const dollarsSchema = (most: number | null = null) =>
  z
    .string()
    .refine((text) => centsFrom(text) !== null, "Give an amount in dollars, such as 25 or 25.50.")
    .refine((text) => (centsFrom(text) ?? 0) > 0, "Give an amount above $0.")
    .refine(
      (text) => most === null || (centsFrom(text) ?? 0) <= most,
      `That's more than the ${money(most ?? 0)} allowed.`
    )
