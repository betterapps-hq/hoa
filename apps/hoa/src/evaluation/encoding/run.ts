import { z } from "zod"
import { modelCall } from "@/jobs/steps"
import { rulebookCoverage } from "@/rulebook/coverage"
import { governingDocument, provision, question, rule, settings, term } from "@/schema/zod"

// What an evaluation run (scripts/eval-encoding.ts) leaves in its folder, as the scorer reads it back: the merged draft
// and the run's description with each unit's validity and repair rounds.

export const runDraft = z.object({
  documents: z.array(
    z.object({
      documentId: z.string(),
      documents: z.array(z.object({ document: governingDocument, provisions: z.array(provision) }))
    })
  ),
  referenced: z.array(governingDocument),
  settings,
  coverage: rulebookCoverage,
  rules: z.array(rule),
  terms: z.array(term),
  questions: z.array(question)
})
export type RunDraft = z.infer<typeof runDraft>

export const runInfo = z.object({
  runId: z.string(),
  split: z.string(),
  documents: z.string(),
  units: z.string().nullable(),
  promptVersions: z.record(z.string(), z.number()),
  report: z.object({
    units: z.array(
      z.object({
        id: z.string(),
        provisions: z.number(),
        isValid: z.boolean(),
        repairRounds: z.number(),
        problems: z.number().nullable()
      })
    ),
    validAfterEncode: z.number(),
    problemsBefore: z.number(),
    calls: z.array(modelCall)
  })
})
export type RunInfo = z.infer<typeof runInfo>

/** Every provision the run structured. */
export const runProvisions = (draft: RunDraft) =>
  draft.documents.flatMap((upload) => upload.documents.flatMap((document) => document.provisions))

/** Every document the run knows: the uploads' documents and those they name. */
export const runDocuments = (draft: RunDraft) => [
  ...draft.documents.flatMap((upload) => upload.documents.map((document) => document.document)),
  ...draft.referenced
]

/** Units valid after repair, and units that needed repair, each as a share of the run's units. */
export function validityScores(report: RunInfo["report"]) {
  const { units } = report
  const share = (count: number) => (units.length === 0 ? 1 : count / units.length)
  return {
    units: units.length,
    validAfterRepair: share(units.filter((unit) => unit.isValid).length),
    repaired: share(units.filter((unit) => unit.repairRounds > 0).length),
    invalid: units.filter((unit) => !unit.isValid).map((unit) => unit.id),
    repairedUnits: units.filter((unit) => unit.repairRounds > 0).map((unit) => unit.id)
  }
}

/** The run's model spend in US dollars. */
export const runCost = (report: RunInfo["report"]) =>
  report.calls.reduce((total, call) => total + (call.costUsd ?? 0), 0)
