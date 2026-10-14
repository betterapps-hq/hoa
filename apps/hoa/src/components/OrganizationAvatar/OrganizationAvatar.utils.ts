/** Words an association's initials skip, so "The Highlands at Lake Whatcom" is HL. */
const minorWords = new Set(["the", "a", "an", "of", "at", "and", "&", "on", "in"])

/** An association's initials: the first letters of its first two words that aren't minor ones. */
export function organizationInitials(name: string) {
  const words = name.split(/\s+/).filter((word) => word && !minorWords.has(word.toLowerCase()))
  return (
    words
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase() || "?"
  )
}

/** A hue (0 to 359) of an association's own, the same every time, so each one's avatar keeps its color. */
export function organizationHue(id: string) {
  let hue = 0
  for (const character of id) {
    hue = (hue * 31 + (character.codePointAt(0) ?? 0)) % 360
  }
  return hue
}
