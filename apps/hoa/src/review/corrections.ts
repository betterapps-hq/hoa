import { z } from "zod"
import type * as T from "@/schema/types"
import { evidence, fact, factValue } from "@/schema/zod"
import { valueProblems } from "./valueCheck"

// Corrections become data (application-review.md, Recognition): every time code rejects a model's value, a fast check
// reads the words differently, a second reading disagrees, a dispute escalates, or (later) a person corrects a fact,
// the review records it with every reading. `pnpm review:corrections` exports them as items of the Langfuse dataset
// `entity-facts`, so the cases the models get wrong become the cases they're measured on.

export const correctionKinds = [
  "verifier-rejected",
  "check-disagrees",
  "second-reading-disagrees",
  "escalated",
  "person-corrected"
] as const

export const readers = ["model", "grammar", "second-reading", "escalation", "human"] as const
export type Reader = (typeof readers)[number]

/** One reading of a value: who read it, what they read, and from where. */
export const correctionReading = z.object({
  by: z.enum(readers),
  /** The model that read it, when known. */
  modelId: z.string().nullable(),
  /** Null for a value code read (the grammar). */
  state: fact.shape.state.nullable(),
  value: factValue.nullable(),
  confidence: z.number().nullable(),
  evidence: z.array(evidence)
})
export type CorrectionReading = z.infer<typeof correctionReading>

export const correctionSchema = z.object({
  kind: z.enum(correctionKinds),
  entity: z.string(),
  property: z.string(),
  /** The words the value was read from, as the first reading quoted them. */
  stated: z.string().nullable(),
  /** What the verifier found wrong with the rejected value. */
  problems: z.array(z.enum(valueProblems)),
  readings: z.array(correctionReading),
  /** The fact as the review used it: a value only when the readings settled it. */
  result: z.object({ state: fact.shape.state, value: factValue.nullable() }),
  at: z.string()
})
export type Correction = z.infer<typeof correctionSchema>

/** A fact as one reading of its value. */
export const readingOf = (item: T.Fact, by: Reader, modelId: string | null): CorrectionReading => ({
  by,
  modelId,
  state: item.state,
  value: item.value ?? item.candidates[0] ?? null,
  confidence: item.confidence,
  evidence: item.evidence
})

/** Where corrections come from: a saved review, or one case of an evaluation run. */
export type CorrectionSource =
  | { kind: "review"; applicationId: string; jobId: string }
  | { kind: "evaluation"; run: string; case: string }

const sourceId = (source: CorrectionSource) =>
  source.kind === "review" ? `review:${source.jobId}` : `evaluation:${source.run}:${source.case}`

/**
 * Corrections as Langfuse dataset items: the input names the packet, the entity and the property (what a focused facts
 * call reads); the expected output is the value the readings settled on, or null with `needsLabel` when they didn't, so
 * a person labels it before it scores anything.
 */
export function correctionItems(
  source: CorrectionSource,
  corrections: readonly Correction[],
  entities: readonly T.EvaluationRequest["entities"][number][]
) {
  return corrections.map((correction) => {
    const entity = entities.find((item) => item.id === correction.entity)
    const isSettled = correction.result.state === "known" || correction.kind === "person-corrected"
    return {
      id: `${sourceId(source)}:${correction.entity}:${correction.property}:${correction.kind}`.replaceAll(
        /[^\w:.-]/g,
        "-"
      ),
      input: {
        source,
        entity: { id: correction.entity, type: entity?.type ?? null, label: entity?.label ?? null },
        property: correction.property,
        stated: correction.stated,
        pages: [
          ...new Map(
            correction.readings
              .flatMap((reading) => reading.evidence)
              .map((item) => [`${item.fileId} ${item.page}`, { fileId: item.fileId, page: item.page }])
          ).values()
        ]
      },
      expectedOutput: isSettled ? correction.result : null,
      metadata: {
        kind: correction.kind,
        needsLabel: !isSettled,
        problems: correction.problems,
        readings: correction.readings,
        at: correction.at
      }
    }
  })
}
