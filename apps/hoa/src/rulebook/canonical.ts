import { toHex } from "@/storage/objects"

// Canonical JSON: object keys sorted by code unit at every depth, no whitespace. The same value always serializes to
// the same text, in Node and in Workers, so its hash identifies it.

/** Orders strings by UTF-16 code unit, which unlike localeCompare is the same in every runtime. */
export function compareCodeUnits(a: string, b: string) {
  if (a === b) {
    return 0
  }
  return a < b ? -1 : 1
}

export function canonicalJson(value: unknown) {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === "object" && item !== null && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).toSorted(([a], [b]) => compareCodeUnits(a, b)))
      : item
  )
}

/** The SHA-256 of a text's UTF-8 bytes, as lowercase hex, with Web Crypto. */
export async function sha256Hex(text: string) {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))
}
