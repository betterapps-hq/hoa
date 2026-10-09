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

/** A label's normalized forms: the text and its plural (stored, or else generated), without duplicates. */
export function labelForms(label: { text: string; plural?: string | null }) {
  const forms = [label.text, label.plural ?? pluralOf(label.text)].map((form) => normalizeForMatching(form))
  return [...new Set(forms.filter(Boolean))]
}
