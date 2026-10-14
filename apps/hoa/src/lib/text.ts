/**
 * Display text in sentence case: the first letter capitalized and the rest as written, so names and acronyms keep
 * their case ("front" becomes "Front", "CC&Rs amendment" stays as is). For rendering only; stored labels keep their
 * case (docs/ux.md).
 */
export const sentenceCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** "1 rule", "12 rules": a count with its noun. */
export const counted = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** "A, B and C": names in a sentence. */
export function listNames(names: readonly string[]) {
  if (names.length <= 1) {
    return names[0] ?? ""
  }
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
}

const sizeFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 })

/** A file's size as people read it: "240 KB", "2.5 MB". */
export function fileSizeText(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${sizeFormat.format(Math.max(bytes / 1024, 0.1))} KB`
  }
  return `${sizeFormat.format(bytes / (1024 * 1024))} MB`
}

const dayFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" })

/** A day (YYYY-MM-DD) as people read it: "May 31, 2027". */
export const dayText = (day: string) => dayFormat.format(new Date(`${day}T00:00:00Z`))

const moneyFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

/** An amount of dollars as people read it: "$50.00". */
export const moneyText = (dollars: number) => moneyFormat.format(dollars)
