import { z } from "zod"
import { coreTerms } from "@/schema/coreTerms"
import type { ProvisionKey, TermKey } from "@/schema/types"
import { ifUnstated, termDraft, termKey, valueType, type TermContent } from "@/schema/zod"

// Parts the drafted steps' answers share (prompt drafts v2, "Output schema"): labels as one preferred wording and its
// alternatives, references to terms by a label or a given key, and the property shape B, C and F propose properties
// with. B and C write no term key: code builds every key from the preferred label (termKeys.ts). Only build-wide
// enums: keys that vary per call are strings code checks.

/** One key segment: code composes `{thing}.{name}` (F's proposed properties) and `{provision}#{aspect}`. */
export const segment = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "one key segment like height")

/** A term named by one of its labels, or by its key when it's a given term. */
export const reference = z
  .string()
  .min(1)
  .describe("A given term's key, or the exact preferred label of a term this answer adds (never a key made up for it)")

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

export const thingNature = z.enum(["party", "event", "document", "object"])

export const citationsOf = (keys: readonly ProvisionKey[]) =>
  keys.map((provisionKey) => ({ provisionKey, highlight: null, region: null }))

const propertyContent = {
  ...labelsDraft,
  valueType,
  many: z.boolean(),
  ifUnstated,
  definition: z.string().nullable()
}

/** A property as B and C propose it: its thing (a label or a given key) and its labels; code builds the key. */
export const labeledPropertyFields = { of: reference, ...propertyContent }

/** A property as F proposes it: its thing's key and the last part of its key. */
export const propertyFields = { of: termKey, name: segment, ...propertyContent }
const propertyShape = z.object(propertyFields)
export type PropertyDraft = z.output<typeof propertyShape>

type PropertyContent = LabelsDraft & {
  valueType: z.output<typeof valueType>
  many: boolean
  ifUnstated: z.output<typeof ifUnstated>
  definition: string | null
  derived?: unknown
}

/** A drafted property as a term, under the key code built for it. */
export function propertyTerm(
  draft: PropertyContent,
  key: TermKey,
  of: TermKey,
  citations: readonly ProvisionKey[] = []
): TermContent {
  return termDraft.parse({
    key,
    kind: "property",
    of,
    valueType: draft.valueType,
    many: draft.many,
    ifUnstated: draft.ifUnstated,
    derived: draft.derived ?? null,
    labels: labelsOf(draft),
    definition: draft.definition,
    citations: citationsOf(citations)
  })
}

/** F's proposed property as a term: key `{of}.{name}`. */
export const proposedPropertyTerm = (draft: PropertyDraft) => propertyTerm(draft, `${draft.of}.${draft.name}`, draft.of)

/** A drafted value set as a term, under the key code built for it. */
export const valueSetTerm = (
  set: LabelsDraft & { complete: boolean },
  key: TermKey,
  citations: readonly ProvisionKey[] = []
): TermContent =>
  termDraft.parse({
    key,
    kind: "value-set",
    complete: set.complete,
    labels: labelsOf(set),
    citations: citationsOf(citations)
  })

/** A drafted value as a term, under the key code built for it, with the keys of its broader values. */
export const valueTerm = (
  value: LabelsDraft,
  key: TermKey,
  set: TermKey,
  broader: readonly TermKey[],
  citations: readonly ProvisionKey[] = []
): TermContent =>
  termDraft.parse({ key, kind: "value", set, broader, labels: labelsOf(value), citations: citationsOf(citations) })

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
