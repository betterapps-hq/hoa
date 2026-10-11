import { compareCodeUnits } from "@/rulebook/canonical"
import type { Provision, ProvisionKey } from "@/schema/types"
import { definedNames } from "./provisions"

// Defined-term candidates for B (encoding.md, Defined terms): terms the documents define ("Unit"
// means, "Unit": …, (the "Act")), and capitalized multi-word phrases used at least three times away from sentence
// starts ("Common Area", "Class "B" Control Period"), each with its count and three sample sentences with the
// provisions they come from. An inline definition that opens the paragraph after a list ("(collectively, the "X")")
// names the list, so the list's items are among the provisions it's defined in.

/** A sentence a candidate is used in, and the provision it's from. */
export type CandidateSample = { provisionKey: ProvisionKey; text: string }

export type TermCandidate = {
  phrase: string
  source: "definition" | "usage"
  count: number
  definedIn: ProvisionKey[]
  samples: CandidateSample[]
}

const minUses = 3
const maxSamples = 3
const maxSample = 240
const joiners = new Set(["of", "and", "to", "for", "at", "on"])
/** An inline definition: (the "Act"), (collectively, "Bound Parties"). */
const inlineDefinition =
  /\((?:the\s+|collectively,?\s+|individually,?\s+|each,?\s+|hereinafter\s+)?(?:a\s+|an\s+|the\s+)?["“]([A-Z][^"“”]{0,60}?)["”]\)/g
const definitionPatterns = [
  /["“]([A-Z][^"“”]{0,60}?)[,.]?["”]\s*(?::|means\b|shall mean\b|shall refer to\b|refers to\b)/g,
  inlineDefinition
]
/** An inline definition opening a text, which names the list before it. */
const openingDefinition = new RegExp(`^\\s*${inlineDefinition.source}`)

/** A heading made only of quoted names joined by "or", "and" or commas, with an optional colon or period. */
const quotedHeading = /^\s*["“][^"“”]+[,.]?["”](?:\s*(?:,|or|and)\s*["“][^"“”]+[,.]?["”])*\s*[:.]?\s*$/

const textOf = (provision: Provision) => [provision.intro, provision.text, provision.wrapUp].filter(Boolean).join("\n")

function sentencesOf(text: string) {
  return text
    .split(/(?<=[.;!?]["”)]?)\s+(?=["“(]?[A-Z])|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

const isCapitalized = (word: string) => /^["“(]?[A-Z][\w'’-]*["”),.;:]*$/.test(word) && !/^[A-Z]{2,}\W*$/.test(word)
const clean = (word: string) =>
  word
    .replace(/^[(“]+/, "")
    .replace(/[),.;:”]+$/, "")
    .replace(/['’]s$/, "")
    .replace(/^"(?=[A-Z][a-z])/, "")

/** Capitalized runs of two or more words, allowing "of", "and" and the like inside, that don't start a sentence. */
function capitalizedPhrases(sentence: string) {
  const words = sentence.split(/\s+/)
  const phrases: string[] = []
  let run: string[] = []
  const flush = () => {
    while (run.length > 0 && joiners.has(run.at(-1) ?? "")) {
      run.pop()
    }
    if (run.filter((word) => !joiners.has(word)).length >= 2) {
      phrases.push(run.join(" "))
    }
    run = []
  }
  words.forEach((word, index) => {
    const ends = /[,.;:)]$/.test(word)
    if (index > 0 && isCapitalized(word)) {
      run.push(clean(word))
    } else if (run.length > 0 && joiners.has(word)) {
      run.push(word)
    } else {
      flush()
      return
    }
    if (ends) {
      flush()
    }
  })
  flush()
  return phrases
}

type Sentence = { provisionKey: ProvisionKey; text: string }

function samplesOf(phrase: string, sentences: readonly Sentence[]): CandidateSample[] {
  return sentences
    .filter((sentence) => sentence.text.includes(phrase))
    .slice(0, maxSamples)
    .map(({ provisionKey, text }) => ({
      provisionKey,
      text: text.length > maxSample ? `${text.slice(0, maxSample - 1)}…` : text
    }))
}

const isListItem = (provision: Provision) => provision.kind === "point"

/**
 * The list an inline definition at the very start of a text names: for the provision's text, the list items just
 * before it under the same parent; for its wrap-up, its own items.
 */
function listNamed(provisions: readonly Provision[], index: number, part: "text" | "wrapUp") {
  const provision = provisions[index]
  if (!provision) {
    return []
  }
  if (part === "wrapUp") {
    return provisions.filter((item) => item.parentLabel === provision.label && isListItem(item))
  }
  const items: Provision[] = []
  for (let before = index - 1; before >= 0; before -= 1) {
    const item = provisions[before]
    if (!item || item.parentLabel !== provision.parentLabel || !isListItem(item)) {
      break
    }
    items.unshift(item)
  }
  return items
}

export function findTermCandidates(provisions: readonly Provision[]): TermCandidate[] {
  const sentences = provisions.flatMap((provision) =>
    sentencesOf(textOf(provision)).map((text) => ({ provisionKey: provision.key, text }))
  )
  const definitions = new Map<string, Set<ProvisionKey>>()
  const define = (phrase: string, keys: readonly ProvisionKey[]) => {
    const found = definitions.get(phrase) ?? new Set()
    keys.forEach((key) => found.add(key))
    definitions.set(phrase, found)
  }
  provisions.forEach((provision, index) => {
    const text = textOf(provision)
    // A heading that is only quoted names ('"Unit"', '"Articles of Incorporation" or "Articles"') defines them: the
    // section under it is their definition, however the article is titled.
    const heading = provision.heading ?? ""
    const headingNames = quotedHeading.test(heading) ? definedNames(heading) : []
    const names = [...(provision.kind === "definition" ? definedNames(text) : []), ...headingNames]
    for (const name of names) {
      define(name.replace(/\([^)]*\)/g, "").trim(), [provision.key])
    }
    for (const pattern of definitionPatterns) {
      for (const found of text.matchAll(pattern)) {
        define((found[1] ?? "").trim(), [provision.key])
      }
    }
    // A defining parenthesis that opens the text or the wrap-up names the list before it.
    for (const part of ["text", "wrapUp"] as const) {
      const found = openingDefinition.exec(provision[part] ?? "")
      if (found) {
        define((found[1] ?? "").trim(), [...listNamed(provisions, index, part).map((item) => item.key), provision.key])
      }
    }
  })
  const usage = new Map<string, number>()
  for (const phrase of sentences.flatMap((sentence) => capitalizedPhrases(sentence.text))) {
    usage.set(phrase, (usage.get(phrase) ?? 0) + 1)
  }
  const countOf = (phrase: string) => sentences.filter((sentence) => sentence.text.includes(phrase)).length
  const order = new Map(provisions.map((provision, index) => [provision.key, index]))
  const defined = [...definitions]
    .map(([phrase, keys]): TermCandidate => ({
      phrase,
      source: "definition",
      count: countOf(phrase),
      definedIn: [...keys].toSorted((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)),
      samples: samplesOf(phrase, sentences)
    }))
    .toSorted((a, b) => compareCodeUnits(a.phrase, b.phrase))
  const used = [...usage]
    .filter(([phrase, count]) => count >= minUses && !definitions.has(phrase))
    .map(([phrase, count]): TermCandidate => ({
      phrase,
      source: "usage",
      count,
      definedIn: [],
      samples: samplesOf(phrase, sentences)
    }))
    .toSorted((a, b) => b.count - a.count || compareCodeUnits(a.phrase, b.phrase))
  return [...defined, ...used]
}
