import { normalizeForMatching } from "@/ocr/page"
import { labelForms } from "./normalize"

// Label matching (encoding.md, Recognition): normalized exact first, then a similarity score with RapidFuzz's
// semantics (ratio, partial ratio, token-set ratio, combined as its WRatio). A fuzzy match is always reported as fuzzy,
// with its score, and no label under four characters is ever matched fuzzily.

export type MatchKind = "exact" | "fuzzy"
export type LabelMatch = { kind: MatchKind; score: number }

const wordBits = 32

// The common subsequence is computed on bit vectors, so its bitwise operators are meant, not mistyped logic.
/* oxlint-disable no-bitwise */

/**
 * The length of the longest common subsequence of `pattern` and any text, bit-parallel (Allison and Dix, as Hyyrö
 * describes it): one bit per pattern character, so each text character costs a pass over pattern length / 32 words
 * rather than over every character. The pattern's masks are built once, for comparing it with many texts.
 */
function commonSubsequenceWith(pattern: string) {
  const size = Math.ceil(pattern.length / wordBits)
  const masks = new Map<number, Uint32Array>()
  for (let i = 0; i < pattern.length; i += 1) {
    const code = pattern.charCodeAt(i)
    const mask = masks.get(code) ?? new Uint32Array(size)
    mask[Math.floor(i / wordBits)] = (mask[Math.floor(i / wordBits)] ?? 0) | (1 << (i % wordBits))
    masks.set(code, mask)
  }
  return (text: string) => {
    if (size === 0 || text.length === 0) {
      return 0
    }
    // A zero bit marks a pattern character matched so far; matching a character moves a zero up (V + U) and keeps it.
    const row = new Uint32Array(size).fill(0xffffffff)
    for (let j = 0; j < text.length; j += 1) {
      const mask = masks.get(text.charCodeAt(j))
      if (!mask) {
        continue
      }
      let carry = 0
      for (let k = 0; k < size; k += 1) {
        const v = row[k] ?? 0
        const u = (v & (mask[k] ?? 0)) >>> 0
        const sum = v + u + carry
        carry = sum > 0xffffffff ? 1 : 0
        row[k] = (sum | (v & ~u)) >>> 0
      }
    }
    // Bits past the pattern's end stay set, so only the pattern's own bits count.
    let zeros = 0
    for (const word of row) {
      zeros += wordBits - popCount(word)
    }
    return zeros
  }
}

function popCount(word: number) {
  let rest = word - ((word >>> 1) & 0x55555555)
  rest = (rest & 0x33333333) + ((rest >>> 2) & 0x33333333)
  return Math.imul((rest + (rest >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24
}

/* oxlint-enable no-bitwise */

/** The length of the longest common subsequence. */
function commonSubsequence(a: string, b: string) {
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a]
  return commonSubsequenceWith(shorter)(longer)
}

/** The Levenshtein distance: insertions, deletions and substitutions, each costing one. */
export function levenshtein(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = row[0] ?? 0
    row[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const above = row[j] ?? 0
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1
      row[j] = Math.min(above + 1, (row[j - 1] ?? 0) + 1, diagonal + cost)
      diagonal = above
    }
  }
  return row[b.length] ?? 0
}

/** RapidFuzz's ratio, from 0 to 1: one minus the normalized insert-and-delete distance. */
export function ratio(a: string, b: string) {
  const total = a.length + b.length
  return total === 0 ? 1 : (2 * commonSubsequence(a, b)) / total
}

/** The best ratio of the shorter text against every window of the longer one of the same length. */
export function partialRatio(a: string, b: string) {
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a]
  if (shorter.length === 0) {
    return longer.length === 0 ? 1 : 0
  }
  const common = commonSubsequenceWith(shorter)
  let best = 0
  for (let start = 0; start + shorter.length <= longer.length && best < 1; start += 1) {
    best = Math.max(best, (2 * common(longer.slice(start, start + shorter.length))) / (2 * shorter.length))
  }
  return best
}

const words = (text: string) => text.split(" ").filter(Boolean)

/** Compares the words both texts share with each text's whole word set, ignoring order and repeats. */
export function tokenSetRatio(a: string, b: string) {
  const setA = new Set(words(a))
  const setB = new Set(words(b))
  const shared = [...setA].filter((word) => setB.has(word)).toSorted()
  const onlyA = [...setA].filter((word) => !setB.has(word)).toSorted()
  const onlyB = [...setB].filter((word) => !setA.has(word)).toSorted()
  if (shared.length > 0 && (onlyA.length === 0 || onlyB.length === 0)) {
    return 1
  }
  const base = shared.join(" ")
  const withA = [base, ...onlyA].filter(Boolean).join(" ")
  const withB = [base, ...onlyB].filter(Boolean).join(" ")
  return Math.max(ratio(base, withA), ratio(base, withB), ratio(withA, withB))
}

/** RapidFuzz's WRatio on normalized text: partial and token scores count for less as the lengths diverge. */
export function similarity(a: string, b: string) {
  const left = normalizeForMatching(a)
  const right = normalizeForMatching(b)
  if (left.length === 0 || right.length === 0) {
    return 0
  }
  const lengthRatio = Math.max(left.length, right.length) / Math.min(left.length, right.length)
  const base = ratio(left, right)
  if (lengthRatio < 1.5) {
    return Math.max(base, tokenSetRatio(left, right) * 0.95)
  }
  const scale = lengthRatio < 8 ? 0.9 : 0.6
  return Math.max(base, partialRatio(left, right) * scale, tokenSetRatio(left, right) * 0.95 * scale)
}

/** The score a fuzzy match needs, by the label's normalized length; null below four characters (exact only). */
export function fuzzyThreshold(length: number) {
  if (length < 4) {
    return null
  }
  return length < 8 ? 0.9 : 0.85
}

/** Matches a stated text to one label (and its plural): exact after normalizing, else fuzzy above the threshold. */
export function matchLabel(text: string, label: { text: string; plural?: string | null }): LabelMatch | null {
  const stated = normalizeForMatching(text)
  const forms = labelForms(label)
  if (forms.includes(stated)) {
    return { kind: "exact", score: 1 }
  }
  const threshold = fuzzyThreshold(Math.min(stated.length, normalizeForMatching(label.text).length))
  if (threshold === null) {
    return null
  }
  const score = Math.max(...forms.map((form) => similarity(stated, form)))
  return score >= threshold ? { kind: "fuzzy", score: round(score) } : null
}

const round = (score: number) => Math.round(score * 1000) / 1000

export type LabelEntry<T> = { item: T; text: string; plural?: string | null }
export type LabelHit<T> = LabelMatch & { item: T; label: string; found: string }

/**
 * The edits OCR noise may make to a label found in running text before it stops being that label. Short words have
 * too many real neighbours ("wall", "well"), so labels under eight characters must appear exactly.
 */
const allowedEdits = (length: number) => {
  if (length < 8) {
    return 0
  }
  return length < 16 ? 1 : 2
}

/** Runs of the text's words, by word count and first letter, for comparing labels with. */
function wordRuns(textWords: readonly string[]) {
  const bySize = new Map<number, Map<string, Set<string>>>()
  return (size: number, first: string) => {
    let byFirst = bySize.get(size)
    if (!byFirst) {
      byFirst = new Map()
      for (let start = 0; start + size <= textWords.length; start += 1) {
        const run = textWords.slice(start, start + size).join(" ")
        byFirst.set(run.charAt(0), (byFirst.get(run.charAt(0)) ?? new Set()).add(run))
      }
      bySize.set(size, byFirst)
    }
    return byFirst.get(first) ?? new Set<string>()
  }
}
/** A run is the label with OCR noise when short words agree exactly and the edits stay within the label's allowance. */
function noisyMatch(form: string, run: string) {
  const allowed = allowedEdits(form.length)
  if (allowed === 0 || Math.abs(run.length - form.length) > allowed) {
    return null
  }
  const formWords = words(form)
  const runWords = words(run)
  const isShortWordChanged = formWords.some(
    (word, i) => (word.length < 4 || (runWords[i] ?? "").length < 4) && word !== runWords[i]
  )
  const edits = isShortWordChanged ? allowed + 1 : levenshtein(form, run)
  return edits <= allowed ? round(1 - edits / Math.max(form.length, run.length)) : null
}

/**
 * Finds which labels a text mentions: a label's normalized words (or its plural's) among the text's words, else a run
 * of as many words that differs by a few OCR edits ("Use Restnctions"), never in a word under four characters. One
 * hit per entry, the best.
 */
export function findLabels<T>(text: string, entries: readonly LabelEntry<T>[]): LabelHit<T>[] {
  const textWords = words(normalizeForMatching(text))
  const joined = ` ${textWords.join(" ")} `
  const runsOf = wordRuns(textWords)
  const hits: LabelHit<T>[] = []
  for (const entry of entries) {
    const forms = labelForms(entry)
    const exact = forms.find((form) => joined.includes(` ${form} `))
    if (exact) {
      hits.push({ item: entry.item, label: entry.text, found: exact, kind: "exact", score: 1 })
      continue
    }
    let best: LabelHit<T> | null = null
    for (const form of forms) {
      for (const run of runsOf(words(form).length, form.charAt(0))) {
        const score = noisyMatch(form, run)
        if (score !== null && score > (best?.score ?? 0)) {
          best = { item: entry.item, label: entry.text, found: run, kind: "fuzzy", score }
        }
      }
    }
    if (best) {
      hits.push(best)
    }
  }
  return hits
}
