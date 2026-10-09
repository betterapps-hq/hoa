import { compareCodeUnits } from "@/rulebook/canonical"
import type { Provision, ProvisionKey } from "@/schema/types"
import { definedNames } from "./provisions"

// Defined-term candidates for the vocabulary stage (encoding.md, Vocabulary): terms the documents define ("Unit"
// means, "Unit": …, (the "Act")), and capitalized multi-word phrases used at least three times away from sentence
// starts ("Common Area", "Class "B" Control Period"), each with its count and three sample sentences.

export type TermCandidate = {
  phrase: string
  source: "definition" | "usage"
  count: number
  definedIn: ProvisionKey[]
  samples: string[]
}

const minUses = 3
const maxSamples = 3
const maxSample = 240
const joiners = new Set(["of", "and", "to", "for", "at", "on"])
const definitionPatterns = [
  /["“]([A-Z][^"“”]{0,60}?)[,.]?["”]\s*(?::|means\b|shall mean\b|shall refer to\b|refers to\b)/g,
  /\((?:the\s+|collectively,?\s+|individually,?\s+|each,?\s+|hereinafter\s+)?(?:a\s+|an\s+|the\s+)?["“]([A-Z][^"“”]{0,60}?)["”]\)/g
]

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

function samplesOf(phrase: string, sentences: readonly string[]) {
  return sentences
    .filter((sentence) => sentence.includes(phrase))
    .slice(0, maxSamples)
    .map((sentence) => (sentence.length > maxSample ? `${sentence.slice(0, maxSample - 1)}…` : sentence))
}

export function findTermCandidates(provisions: readonly Provision[]): TermCandidate[] {
  const sentences = provisions.flatMap((provision) => sentencesOf(textOf(provision)))
  const definitions = new Map<string, Set<ProvisionKey>>()
  const define = (phrase: string, key: ProvisionKey) =>
    definitions.set(phrase, (definitions.get(phrase) ?? new Set()).add(key))
  for (const provision of provisions) {
    const text = textOf(provision)
    const names = provision.kind === "definition" ? definedNames(text) : []
    for (const name of names) {
      define(name.replace(/\([^)]*\)/g, "").trim(), provision.key)
    }
    for (const pattern of definitionPatterns) {
      for (const found of text.matchAll(pattern)) {
        define((found[1] ?? "").trim(), provision.key)
      }
    }
  }
  const usage = new Map<string, number>()
  for (const phrase of sentences.flatMap(capitalizedPhrases)) {
    usage.set(phrase, (usage.get(phrase) ?? 0) + 1)
  }
  const countOf = (phrase: string) => sentences.filter((sentence) => sentence.includes(phrase)).length
  const defined = [...definitions]
    .map(([phrase, keys]): TermCandidate => ({
      phrase,
      source: "definition",
      count: countOf(phrase),
      definedIn: [...keys],
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
