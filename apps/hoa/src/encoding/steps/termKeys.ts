import { coreTerms } from "@/schema/coreTerms"
import type { TermKey } from "@/schema/types"
import type { TermContent } from "@/schema/zod"
import { singularOf } from "@/text/normalize"
import type { StepProblem } from "./check"

// Term keys built by code (no model writes one): a key is its term's preferred label, lowercased, its last word in the
// singular, its words joined by hyphens, punctuation dropped; a property's key is `{thing key}.{that}` and a value's
// `{set key}.{that}`. A key already taken gets `-2`, `-3`, … in the order terms are built, and the collision is a
// problem. A model names a term it returns, or one it was given, by a label or by a key-shaped reference, and code
// resolves it here through the same normalization.

/** The words of a text, accents and apostrophes dropped, split on everything that isn't a letter or digit. */
function wordsOf(text: string) {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/['’‘`]/g, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
}

/**
 * A label as one key segment: "Shared Driveways" → `shared-driveway`, "Owner's Lot" → `owners-lot`, "Class "B"
 * Member" → `class-b-member`. Empty when the label has no letter or digit.
 */
export function keySegment(label: string, singular = true) {
  const words = wordsOf(label)
  const last = words.pop()
  if (last === undefined) {
    return ""
  }
  return [...words, singular ? singularOf(last) : last].join("-").toLowerCase()
}

/** The forms a label or a reference is matched by: its key segment, with and without the singular. */
export function segmentForms(text: string) {
  return [...new Set([keySegment(text), keySegment(text, false)].filter(Boolean))]
}

type Labels = { preferred: { text: string; plural: string | null }; alternatives: readonly string[] }

/** The fields of a condition, operand or value type that hold term keys. */
const referenceFields = new Set(["path", "unit", "term", "category", "set", "to", "among", "by", "value"])

/**
 * Builds the keys of one answer's terms and resolves the answer's references to terms, given the terms the step may
 * reference (the core is always among them). Problems (collisions, unresolvable references, empty labels) collect in
 * `problems`, keyed by the record they're about.
 */
export function termKeyBuilder(known: readonly TermContent[] = []) {
  const problems: StepProblem[] = []
  /** Every key the answer may name, in order (core, given, then built), with the forms of its labels. */
  const forms = new Map<TermKey, Set<string>>()
  const given = new Set<TermKey>()

  const addForms = (key: TermKey, texts: readonly (string | null | undefined)[]) => {
    const found = forms.get(key) ?? new Set<string>()
    for (const text of [key.slice(key.lastIndexOf(".") + 1), ...texts]) {
      if (text) {
        segmentForms(text).forEach((form) => found.add(form))
      }
    }
    forms.set(key, found)
  }
  for (const term of [...coreTerms, ...known]) {
    given.add(term.key)
    addForms(
      term.key,
      term.labels.flatMap((label) => (label.role === "avoid" ? [] : [label.text, label.plural]))
    )
  }

  const childrenOf = (parent: TermKey | null) =>
    [...forms.keys()].filter((key) =>
      parent === null ? !key.includes(".") : key.startsWith(`${parent}.`) && !key.slice(parent.length + 1).includes(".")
    )

  /** A term among `parent`'s children (top-level terms when null) by its key, last key segment or a label. */
  const find = (parent: TermKey | null, text: string): TermKey | null => {
    const exact = parent === null ? text : `${parent}.${text}`
    if (forms.has(exact)) {
      return exact
    }
    const wanted = segmentForms(text)
    return childrenOf(parent).find((key) => wanted.some((form) => forms.get(key)?.has(form))) ?? null
  }

  /** A key-shaped reference (`thing`, `thing.property`, `set.value`) as a key, each part resolved by its forms. */
  const resolve = (reference: string): TermKey | null => {
    if (forms.has(reference)) {
      return reference
    }
    const dot = reference.lastIndexOf(".")
    if (dot === -1) {
      return find(null, reference)
    }
    const parent = resolve(reference.slice(0, dot))
    return parent === null ? null : find(parent, reference.slice(dot + 1))
  }

  return {
    problems,

    /**
     * A new term's key from its preferred label, under `parent` for a property or value; made unique with a numeric
     * suffix when taken (a collision, reported). Null, with a problem, when the label has no letter or digit.
     */
    build(labels: Labels, parent: TermKey | null, what: string): TermKey | null {
      const segment = keySegment(labels.preferred.text)
      if (segment === "") {
        problems.push({
          recordKey: labels.preferred.text,
          code: "empty-label",
          message: `the ${what} "${labels.preferred.text}" has no letter or digit to key it by`,
          path: ["preferred"]
        })
        return null
      }
      const base = parent === null ? segment : `${parent}.${segment}`
      let key = base
      for (let suffix = 2; forms.has(key); suffix += 1) {
        key = `${base}-${suffix}`
      }
      if (key !== base) {
        const holder = given.has(base) ? "a core or given term" : "another term of this answer"
        problems.push({
          recordKey: key,
          code: "key-collision",
          message: `the ${what} "${labels.preferred.text}" keys as ${base}, which ${holder} already is; it was keyed ${key}. Reuse or refine that term, or give this one the document's distinguishing wording`,
          path: ["preferred"]
        })
      }
      addForms(key, [labels.preferred.text, labels.preferred.plural, ...labels.alternatives])
      return key
    },

    /** Adds labels to a known term (a refinement, a reused term), so references by them resolve. */
    addLabels(key: TermKey, texts: readonly string[]) {
      addForms(key, texts)
    },

    resolve,

    /**
     * A thing, category, value set or unit named by its key or a label (`of`, `set`), or a key-shaped dotted
     * reference; null, with a problem about `recordKey`, when nothing matches.
     */
    named(text: string, recordKey: string, path: string): TermKey | null {
      const key = resolve(text) ?? find(null, text)
      if (key === null) {
        problems.push({
          recordKey,
          code: "unresolved-reference",
          message: `${path} names "${text}", which is neither a term of this answer nor a given one: name a term this answer adds by its exact preferred label, or add the term`,
          path: [path]
        })
      }
      return key
    },

    /**
     * A value (criteria, a value type, a derivation) with every term reference resolved to a key. A reference that
     * resolves to nothing is left as written, for the step's check to report as an undefined term.
     */
    rewrite<T>(value: T): T {
      const swap = (item: unknown) => (typeof item === "string" ? (resolve(item) ?? item) : item)
      // A date's `value` is data, not a term: a lone string is a reference only outside `value`; a list of strings
      // (a path, a sum's values, approvers) is references in every term field.
      return JSON.parse(
        JSON.stringify(value, (field, item: unknown) => {
          if (!referenceFields.has(field)) {
            return item
          }
          if (Array.isArray(item)) {
            return item.map(swap)
          }
          return field === "value" ? item : swap(item)
        })
      )
    }
  }
}
