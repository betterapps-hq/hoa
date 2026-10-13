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
