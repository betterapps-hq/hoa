import { sentenceCase } from "@/lib/text"
import type { ProjectField } from "./projectType"

// How a project type's questions read before an administrator words them (application-review.md, Project types):
// written by code from the property's label and the thing it describes, so it reads as a question in any
// organization's vocabulary. It knows no organization's terms; the administrator rewords any question in the editor.

const prepositions = new Set(["about", "at", "by", "for", "from", "in", "of", "on", "to", "with", "within"])

/**
 * A label as it reads mid-sentence: a word capitalized only because it's a defined term ("Work") is lowercased; a
 * word in capitals or with capitals inside ("HOA", "CC&Rs") is kept.
 */
const midSentence = (text: string) =>
  text
    .split(/(\s+)/)
    .map((word) => (/^\p{Lu}[\p{Ll}'-]*$/u.test(word) ? word.toLowerCase() : word))
    .join("")

/** Help as a form shows it: a sentence, capitalized and ending in a period. */
export const asSentence = (text: string) => {
  const trimmed = sentenceCase(text.trim())
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

/** "fence run's", "project's" */
const possessive = (subject: string) => (subject.endsWith("s") ? `${subject}'` : `${subject}'s`)

/**
 * Code's question for a property of a subject ("fence run", or "project" for the work as a whole):
 * - a detail named by a noun: "What is the fence run's height?" ("gate height" of a gate: "What is the gate's
 *   height?");
 * - a kind or type: "What kind of work is it?";
 * - a yes or no that reads as a state: "Is the project built to a pre-approved plan?";
 * - a date named by what happens on it: "What is the date construction commenced?";
 * - anything else, such as a label ending in a preposition: the label as a question, "Boundary with?".
 */
export function fallbackQuestion(label: string, kind: ProjectField["kind"], subject: string): string {
  const text = label.trim().replace(/[.?:]+$/, "")
  const words = text.toLowerCase().split(/\s+/)
  const first = words[0] ?? ""
  const last = words.at(-1) ?? ""
  // "approved", "exempted", "taken"; a short word like "open" is an adjective, not a participle.
  const isParticiple = first.length > 4 && /(ed|en)$/.test(first)
  const noun = midSentence(text.replace(/^(the|a|an) /i, ""))
  if (kind === "yes-no") {
    return isParticiple ? `Is the ${subject} ${noun}?` : `${sentenceCase(midSentence(text))}?`
  }
  if (kind === "date" && last === "on" && words.length > 1) {
    return `What is the date ${noun.replace(/\s+on$/i, "")}?`
  }
  if (/^(kind|type|sort|style) of /i.test(noun)) {
    return `What ${noun} is it?`
  }
  if (prepositions.has(last) || isParticiple) {
    return `${sentenceCase(midSentence(text))}?`
  }
  // A label that starts with the subject's own name doesn't repeat it: "gate height" of a gate is its height.
  const own = noun.toLowerCase().startsWith(`${subject.toLowerCase()} `) ? noun.slice(subject.length + 1) : noun
  return `What is the ${possessive(subject)} ${own}?`
}

/** The example a question shows in its empty input, for questions answered in words. */
export const exampleOf = (field: ProjectField) =>
  field.kind === "text" || field.kind === "long-text" ? field.example : null
