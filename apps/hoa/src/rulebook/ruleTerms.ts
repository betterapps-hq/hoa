import { match, P } from "ts-pattern"
import { coreTerms } from "@/schema/coreTerms"
import { parseStatement } from "@/schema/statement"
import type * as T from "@/schema/types"
import { createVocabulary, type Vocabulary } from "@/schema/vocabulary"
import { rule as ruleSchema, term as termSchema, type TermContent } from "@/schema/zod"
import type { RulebookRecords } from "./assemble"
import { mapTermKeys, termFields, termKeysOf } from "./review"

// The terms a rule uses (encoding.md, UX, Rule card). A term means the same in every rule that uses it, so a rule whose
// words mean something else uses a different term: one the rulebook has that fits where the rule uses it, or a new one
// made for it from a copy. Only that rule changes. What fits comes from the schema's structure (what a term is, what
// it hangs off, what values it holds), never from what a term is called.

/** The terms a rule can use: the organization's that aren't rejected, and the core ones they don't refine. */
export function pickableTerms(terms: T.Term[]): TermContent[] {
  const live = terms.filter((term) => term.review.status !== "rejected")
  const refined = new Set(live.map((term) => term.key))
  return [...coreTerms.filter((term) => !refined.has(term.key)), ...live]
}

/** A term's fields that hold term keys: a rule's, and what a term hangs off, draws its values from or narrows. */
export const termRefFields: ReadonlySet<string> = new Set([...termFields, "of", "set", "broader", "to"])

/** The term keys a term's own fields name: what it hangs off, its values' list, its criteria's and derivations' terms. */
export function keysNamedBy(term: TermContent) {
  const keys: T.TermKey[] = []
  mapTermKeys(
    term,
    (key) => {
      keys.push(key)
      return key
    },
    termRefFields
  )
  return keys
}

/** The rule with its terms swapped as the mapping says, in its statement's links and its fields. */
export function withTermsReplaced(rule: T.Rule, mapping: ReadonlyMap<T.TermKey, T.TermKey>): T.Rule {
  const replace = (key: T.TermKey) => mapping.get(key) ?? key
  const statement = parseStatement(rule.statement)
    .map((part) => (part.type === "text" ? part.text : `{{${replace(part.key)}${part.plural ? ":plural" : ""}}}`))
    .join("")
  return ruleSchema.parse(mapTermKeys({ ...rule, statement }, replace))
}

const natureOf = (vocabulary: Vocabulary, key: T.TermKey) => {
  const thing = vocabulary.get(vocabulary.thingOf(key))
  return thing?.kind === "thing" ? thing.nature : null
}

const dimensionOf = (vocabulary: Vocabulary, key: T.TermKey) => {
  const unit = vocabulary.get(key)
  return unit?.kind === "unit" ? unit.dimension : null
}

/** Whether two properties hold the same kind of value: a quantity of the same dimension, a choice from the same list. */
export function isSameValueType(vocabulary: Vocabulary, a: T.ValueType, b: T.ValueType) {
  return match(a)
    .with(
      { type: "quantity" },
      ({ unit }) => b.type === "quantity" && dimensionOf(vocabulary, unit) === dimensionOf(vocabulary, b.unit)
    )
    .with({ type: "choice" }, ({ set }) => b.type === "choice" && b.set === set)
    .with({ type: "reference" }, ({ to }) => b.type === "reference" && b.to === to)
    .otherwise(() => a.type === b.type)
}

/**
 * The terms that can stand in for `from` in this rule and leave it reading as before: a thing or kind of the same
 * nature, or only the same thing's kinds when the rule reads that thing's details or kinds too; a detail of the same
 * thing holding the same kind of value; another choice from the same list; a unit of the same dimension.
 */
export function swapCandidates(vocabulary: Vocabulary, terms: TermContent[], rule: T.Rule, from: T.TermKey) {
  const term = vocabulary.get(from)
  if (!term) {
    return []
  }
  const fits = match(term)
    .returnType<(candidate: TermContent) => boolean>()
    .with({ kind: P.union("thing", "category") }, () => {
      const thing = vocabulary.thingOf(from)
      const readsMore = [...termKeysOf(rule)].some((key) => {
        const used = key === from ? undefined : vocabulary.get(key)
        return (used?.kind === "property" || used?.kind === "category") && vocabulary.thingOf(used.of) === thing
      })
      return (candidate) =>
        (candidate.kind === "thing" || candidate.kind === "category") &&
        (readsMore
          ? vocabulary.thingOf(candidate.key) === thing
          : natureOf(vocabulary, candidate.key) === natureOf(vocabulary, from))
    })
    .with(
      { kind: "property" },
      (property) => (candidate) =>
        candidate.kind === "property" &&
        candidate.many === property.many &&
        vocabulary.thingOf(candidate.of) === vocabulary.thingOf(property.of) &&
        isSameValueType(vocabulary, candidate.valueType, property.valueType)
    )
    .with({ kind: "value" }, (value) => (candidate) => candidate.kind === "value" && candidate.set === value.set)
    .with(
      { kind: "unit" },
      (unit) => (candidate) => candidate.kind === "unit" && candidate.dimension === unit.dimension
    )
    .with({ kind: "value-set" }, () => () => false)
    .exhaustive()
  return terms.filter((candidate) => candidate.key !== from && fits(candidate))
}

/** Whether a new term can be made from a copy of this one: a unit or a list of choices is shared, not a reading. */
export const isCopyable = (term: TermContent) => term.kind !== "unit" && term.kind !== "value-set"

/** A new term's name and meaning, for the copy a rule uses instead. */
export type TermCopy = { label: string; definition: string | null }

/** Who makes a change, and when. */
export type ChangeStamp = { by: T.Id; at: string }

/** A key's part made from a name: "Subdivided lot" is subdivided-lot. */
export const keyPart = (text: string) =>
  text
    .normalize("NFKD")
    .replaceAll(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")

const lastPart = (key: T.TermKey) => key.split(".").at(-1) ?? key

/**
 * What a copy of `from` for this rule takes along: every term the rule, or something taken, reads that hangs off a copy
 * (a thing's details and kinds, and theirs; a detail a kind's criteria read), so the rule reads the copies the way it
 * read the originals. Each comes after what it hangs off.
 */
export function copiedAlong(vocabulary: Vocabulary, rule: T.Rule, from: T.TermKey) {
  const term = vocabulary.get(from)
  const copied = new Set([from])
  const along: Extract<TermContent, { kind: "property" | "category" }>[] = []
  const reached = new Set([...termKeysOf(rule), ...(term ? keysNamedBy(term) : [])])
  for (let grew = true; grew;) {
    grew = false
    for (const key of reached) {
      const used = copied.has(key) ? undefined : vocabulary.get(key)
      if ((used?.kind === "property" || used?.kind === "category") && copied.has(used.of)) {
        copied.add(key)
        along.push(used)
        keysNamedBy(used).forEach((named) => reached.add(named))
        grew = true
      }
    }
  }
  return along
}

/**
 * New terms for one rule, copied from `from`: the term itself under its new name and meaning, and what it takes along
 * (`copiedAlong`). Keys follow the schema: a detail's starts with its thing's, a choice's with its list's.
 */
export function copiesForRule(
  vocabulary: Vocabulary,
  rule: T.Rule,
  from: T.TermKey,
  copy: TermCopy,
  stamp: ChangeStamp & { organizationId: T.Id }
) {
  const term = vocabulary.get(from)
  if (!term || !isCopyable(term)) {
    throw new Error("That term can't be copied.")
  }
  const taken = new Set<T.TermKey>()
  const unique = (base: T.TermKey) => {
    let key = base
    for (let count = 2; vocabulary.get(key) || taken.has(key); count += 1) {
      key = `${base}-${count}`
    }
    taken.add(key)
    return key
  }
  const part = keyPart(copy.label) || `${lastPart(from)}-copy`
  const named = match(term)
    .with({ kind: "property" }, ({ of }) => `${of}.${part}`)
    .with({ kind: "value" }, ({ set }) => `${set}.${part}`)
    .otherwise(() => part)
  const mapping = new Map<T.TermKey, T.TermKey>([[from, unique(named)]])
  for (const used of copiedAlong(vocabulary, rule, from)) {
    const parent = mapping.get(used.of) ?? used.of
    const local = used.key.startsWith(`${used.of}.`) ? used.key.slice(used.of.length + 1) : lastPart(used.key)
    mapping.set(used.key, unique(used.kind === "property" ? `${parent}.${local}` : `${parent}-${local}`))
  }
  const replace = (key: T.TermKey) => mapping.get(key) ?? key
  const provenance: T.Provenance = { by: "person", userId: stamp.by, at: stamp.at }
  const terms = [...mapping].flatMap(([original, key]) => {
    const source = vocabulary.get(original)
    if (!source) {
      return []
    }
    const isNamed = original === from
    const labels = isNamed
      ? [{ text: copy.label, role: "preferred" as const, plural: null, citation: null, provenance }]
      : source.labels.map((label) => ({ ...label, provenance }))
    return [
      termSchema.parse(
        mapTermKeys(
          {
            ...source,
            key,
            organizationId: stamp.organizationId,
            labels,
            definition: isNamed ? copy.definition : source.definition,
            context: isNamed ? null : source.context,
            provenance,
            review: { status: "proposed", by: null, at: null, note: null },
            issues: []
          },
          replace,
          termRefFields
        )
      )
    ]
  })
  return { terms, mapping }
}

/** Another term the rule uses in place of one, or a new one made for it from a copy. */
export type TermChange = { type: "term"; key: T.TermKey } | ({ type: "copy" } & TermCopy)

/**
 * Changes which term one rule uses, in that rule only: to a term that fits where it's used, or to a new term made from
 * a copy. The rule is the administrator's edit now, so it goes back to proposed; a new term is proposed with it.
 */
export function changeRuleTerm(
  records: RulebookRecords,
  { ruleKey, from, change }: { ruleKey: T.RuleKey; from: T.TermKey; change: TermChange },
  stamp: ChangeStamp
): { rule: T.Rule; terms: T.Term[] } {
  const rule = records.rules.find((item) => item.key === ruleKey)
  if (!rule) {
    throw new Error("The rule no longer exists.")
  }
  if (!termKeysOf(rule).has(from)) {
    throw new Error("The rule doesn't use that term.")
  }
  const vocabulary = createVocabulary(records.terms)
  const edited = {
    provenance: { by: "person", userId: stamp.by, at: stamp.at },
    review: { status: "proposed", by: null, at: null, note: null }
  } satisfies Pick<T.Rule, "provenance" | "review">
  if (change.type === "term") {
    const fits = swapCandidates(vocabulary, pickableTerms(records.terms), rule, from).some(
      (candidate) => candidate.key === change.key
    )
    if (!fits) {
      throw new Error("That term doesn't fit where the rule uses this one.")
    }
    return { rule: { ...withTermsReplaced(rule, new Map([[from, change.key]])), ...edited }, terms: [] }
  }
  const { terms, mapping } = copiesForRule(vocabulary, rule, from, change, {
    ...stamp,
    organizationId: records.organization.id
  })
  return { rule: { ...withTermsReplaced(rule, mapping), ...edited }, terms }
}
