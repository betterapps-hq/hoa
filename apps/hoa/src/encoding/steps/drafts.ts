import { z } from "zod"
import { coreTerms } from "@/schema/coreTerms"
import type { ProvisionKey, TermKey } from "@/schema/types"
import { ifUnstated, termDraft, termKey, valueType, type TermContent } from "@/schema/zod"

// Parts the drafted steps' answers share (prompt drafts v2, "Output schema"): labels as one preferred wording and its
// alternatives, key segments code composes into full keys, new keys that can't be a core term's, and the property
// shape B, C and F propose properties with. Only build-wide enums: keys that vary per call are strings code checks.

/** One key segment: code composes `{thing}.{name}`, `{set}.{name}` and `{provision}#{aspect}`. */
export const segment = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "one key segment like height")

/** A term's labels as the model writes them: exactly one preferred wording, then the others the documents use. */
export const labelsDraft = {
  preferred: z.object({ text: z.string().min(1), plural: z.string().nullable() }),
  alternatives: z.array(z.string().min(1))
}

type LabelsDraft = { preferred: { text: string; plural: string | null }; alternatives: readonly string[] }

/** The schema's labels for a drafted term: the preferred one, then the alternatives. */
export function labelsOf(draft: LabelsDraft): TermContent["labels"] {
  const seen = new Set([draft.preferred.text])
  return [
    { text: draft.preferred.text, role: "preferred", plural: draft.preferred.plural, citation: null },
    ...draft.alternatives.flatMap((text) => {
      if (seen.has(text)) {
        return []
      }
      seen.add(text)
      return [{ text, role: "alternative" as const, plural: null, citation: null }]
    })
  ]
}

/** An enum of build-wide keys; when there are none, a value no answer can hold. */
export function keyEnum(keys: Iterable<string>): z.ZodType<string> {
  const [first, ...rest] = [...new Set(keys)]
  return first === undefined ? z.never() : z.enum([first, ...rest])
}

export const coreKeys = coreTerms.map((term) => term.key)

/** A key that isn't a core term's: refused by Zod and, in the tool's schema, by `not`. */
export const newKey = termKey
  .refine((key) => !coreKeys.includes(key), "a core term's key: refine the core term instead")
  .meta({ not: { enum: coreKeys } })

export const thingNature = z.enum(["party", "event", "document", "object"])

export const citationsOf = (keys: readonly ProvisionKey[]) =>
  keys.map((provisionKey) => ({ provisionKey, highlight: null, region: null }))

/** A property as a step proposes it: its thing and the last part of its key. */
export const propertyFields = {
  of: termKey,
  name: segment,
  ...labelsDraft,
  valueType,
  many: z.boolean(),
  ifUnstated,
  definition: z.string().nullable()
}
const propertyShape = z.object(propertyFields)
export type PropertyDraft = z.output<typeof propertyShape>

/** A drafted property as a term: key `{of}.{name}`. */
export function propertyTerm(
  draft: PropertyDraft & { derived?: unknown },
  citations: readonly ProvisionKey[] = []
): TermContent {
  return termDraft.parse({
    key: `${draft.of}.${draft.name}`,
    kind: "property",
    of: draft.of,
    valueType: draft.valueType,
    many: draft.many,
    ifUnstated: draft.ifUnstated,
    derived: draft.derived ?? null,
    labels: labelsOf(draft),
    definition: draft.definition,
    citations: citationsOf(citations)
  })
}

type ValueDraft = LabelsDraft & { name: string; broader?: readonly string[] }

/** Drafted values of a set as terms: each key `{set}.{name}`, broader values named among their siblings. */
export function valueTerms(set: TermKey, values: readonly ValueDraft[], citations: readonly ProvisionKey[] = []) {
  return values.map((value) =>
    termDraft.parse({
      key: `${set}.${value.name}`,
      kind: "value",
      set,
      broader: (value.broader ?? []).map((name) => `${set}.${name}`),
      labels: labelsOf(value),
      citations: citationsOf(citations)
    })
  )
}

/** A drafted value set and its values as terms: the set's key is its name. */
export function valueSetTerms(
  set: LabelsDraft & { name: string; complete: boolean },
  values: readonly ValueDraft[],
  citations: readonly ProvisionKey[] = []
): TermContent[] {
  return [
    termDraft.parse({
      key: set.name,
      kind: "value-set",
      complete: set.complete,
      labels: labelsOf(set),
      citations: citationsOf(citations)
    }),
    ...valueTerms(set.name, values, citations)
  ]
}

/** The outlines each term serves (C's servesOutlines), kept beside the vocabulary as build data. */
export type Serves = Map<TermKey, string[]>

export function addServes(serves: Serves, key: TermKey, outlines: readonly string[]) {
  serves.set(key, [...new Set([...(serves.get(key) ?? []), ...outlines])])
}

/** Every string anywhere in a value that is one of the given keys. */
export function keysIn(value: unknown, keys: ReadonlySet<string>) {
  const found = new Set<string>()
  const visit = (item: unknown) => {
    if (typeof item === "string") {
      if (keys.has(item)) {
        found.add(item)
      }
    } else if (Array.isArray(item)) {
      item.forEach(visit)
    } else if (typeof item === "object" && item !== null) {
      Object.values(item).forEach(visit)
    }
  }
  visit(value)
  return found
}
