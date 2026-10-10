import { normalizeForMatching } from "@/ocr/page"

// Label normalization (encoding.md, Recognition): case, spacing, punctuation and quote marks don't count, and a
// label matches its plural too, the stored one or the regular English one.

/** The regular English plural of a word or phrase: its last word takes the ending. */
export function pluralOf(text: string) {
  if (/(s|x|z|ch|sh)$/i.test(text)) {
    return `${text}es`
  }
  if (/[^aeiou]y$/i.test(text)) {
    return `${text.slice(0, -1)}ies`
  }
  return `${text}s`
}

/** Plurals the regular rules can't undo. */
const irregularPlurals = new Map([
  ["people", "person"],
  ["children", "child"],
  ["men", "man"],
  ["women", "woman"],
  ["feet", "foot"],
  ["teeth", "tooth"],
  ["mice", "mouse"],
  ["geese", "goose"],
  ["criteria", "criterion"]
])

/** Words ending in s that are the same in the singular. */
const unchangedPlurals = new Set(["series", "species", "news", "means", "premises"])

/**
 * The regular English singular of one word, undoing `pluralOf`: "policies" → "policy", "boxes" → "box", "fences" →
 * "fence". A word of three letters or fewer, an acronym ("HOAS"), and a word ending in -ss, -us or -is stay as they are.
 */
export function singularOf(word: string) {
  const lower = word.toLowerCase()
  const irregular = irregularPlurals.get(lower)
  if (irregular !== undefined) {
    return irregular
  }
  if (lower.length <= 3 || (word === word.toUpperCase() && /[A-Z]/.test(word)) || unchangedPlurals.has(lower)) {
    return word
  }
  if (/(ss|us|is)$/i.test(word) || !/s$/i.test(word)) {
    return word
  }
  if (/[^aeiou]ies$/i.test(word) && lower.length > 4) {
    return `${word.slice(0, -3)}${word.endsWith("S") ? "Y" : "y"}`
  }
  if (/(ss|x|zz|ch|sh)es$/i.test(word)) {
    return word.slice(0, -2)
  }
  return word.slice(0, -1)
}

/** A label's normalized forms: the text and its plural (stored, or else generated), without duplicates. */
export function labelForms(label: { text: string; plural?: string | null }) {
  const forms = [label.text, label.plural ?? pluralOf(label.text)].map((form) => normalizeForMatching(form))
  return [...new Set(forms.filter(Boolean))]
}
