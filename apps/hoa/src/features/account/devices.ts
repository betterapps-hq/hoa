import Bowser from "bowser"

/** What a signed-in browser is, for the account page's devices. */
export type DeviceKind = "desktop" | "mobile" | "tablet"

export type Device = { name: string; kind: DeviceKind }

const kinds: Record<string, DeviceKind> = { mobile: "mobile", tablet: "tablet" }

const relative = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" })

// By UTC day, as the server renders it, so the page reads the same before and after it hydrates.
const dayOf = (at: string) => Math.floor(Date.parse(at) / 86_400_000)

/**
 * The day a browser was last used, as of `asOf`: "Last used yesterday". A session's time moves at most once a day, so
 * the day is as close as it can say.
 */
export function lastUsedText(lastActiveAt: string, asOf: string) {
  const days = Math.max(0, dayOf(asOf) - dayOf(lastActiveAt))
  return `Last used ${relative.format(-days, "day")}`
}

/** A browser as people name it, from its user agent: "Chrome on Windows". */
export function deviceOf(userAgent: string | null): Device {
  if (!userAgent) {
    return { name: "Unknown browser", kind: "desktop" }
  }
  const parser = Bowser.getParser(userAgent)
  const browser = parser.getBrowserName()
  const os = parser.getOSName()
  const name = [browser, os].filter(Boolean).join(" on ")
  return { name: name || "Unknown browser", kind: kinds[parser.getPlatformType(true)] ?? "desktop" }
}
