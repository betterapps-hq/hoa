/** A person using the app: their account's id, their name and their email. */
export type RequestUser = { id: string; name: string; email: string }

/** Initials for an avatar: the first letters of the first and last words of a name, or of the email. */
export function initialsOf(name: string, email: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const first = words[0]?.[0] ?? email[0] ?? "?"
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? "") : ""
  return `${first}${last}`.toUpperCase()
}
