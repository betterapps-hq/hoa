import { z } from "zod"
import { modelCall } from "@/jobs/steps"
import { rulebookCoverage } from "@/rulebook/coverage"
import {
  encodingDraft,
  governingDocument,
  issueCode,
  provision,
  questionDraft,
  ruleDraft,
  termDraft
} from "@/schema/zod"
import { structureProblemCodes } from "./check"
import { consolidationProblemCodes } from "./consolidate"

// What each build step returns (encoding.md, Stages). A Workflow stores step outputs in R2 and reads them back on
// replay, so every output is plain JSON, checked by these schemas when it's read.

const jsonPath = z.array(z.union([z.string(), z.number()]))

const structureCheck = z.object({
  outside: z.number(),
  problems: z.array(z.object({ code: z.enum(structureProblemCodes), message: z.string(), key: z.string().nullable() })),
  needsRepair: z.boolean()
})

export const structureOutput = z.object({
  documents: z.array(z.object({ key: z.string(), provisions: z.array(provision) })),
  check: structureCheck,
  isRepaired: z.boolean(),
  calls: z.array(modelCall)
})

const referencedDocument = z.object({
  key: governingDocument.shape.key,
  kind: governingDocument.shape.kind,
  title: z.string().min(1)
})

export const analysisOutput = z.object({
  /** The provisions each provision cites. */
  references: z.array(z.tuple([z.string(), z.array(z.string())])),
  referencedDocuments: z.array(referencedDocument)
})

export const vocabularyOutput = z.object({
  terms: z.array(termDraft),
  notes: z.array(z.string()),
  /** Whether an earlier build's terms were reused because the document's definitions read the same. */
  isReused: z.boolean(),
  calls: z.array(modelCall)
})

const provisionContext = provision.pick({
  key: true,
  kind: true,
  label: true,
  heading: true,
  intro: true,
  wrapUp: true
})

export const encodingUnit = z.object({
  id: z.string(),
  documentKey: z.string(),
  provisions: z.array(provision),
  context: z.array(provisionContext),
  references: z.array(
    provision.pick({ key: true, label: true, heading: true }).extend({ text: z.string(), isTruncated: z.boolean() })
  ),
  terms: z.array(termDraft),
  matches: z.array(
    z.object({ key: z.string(), kind: z.enum(["exact", "fuzzy"]), score: z.number(), found: z.string() })
  ),
  requestTypes: z.array(termDraft)
})

export const encodeOutput = z.object({ answer: z.unknown(), call: modelCall })

const unitProblem = z.object({
  source: z.enum(["zod", "validator"]),
  code: z.string(),
  message: z.string(),
  path: jsonPath,
  reference: z.string().nullable()
})

/** A unit's latest answer, its draft when the answer passes Zod, and its problems. */
export const unitState = z.object({
  unitId: z.string(),
  answer: z.unknown(),
  draft: encodingDraft.nullable(),
  problems: z.array(unitProblem)
})
export type UnitState = z.infer<typeof unitState>

/**
 * One repair: the unit's state once the model's patch is applied and verified, or null when the patch failed Zod; the
 * call; and notes on what the patch named that the draft doesn't have.
 */
export const repairOutput = z.object({ state: unitState.nullable(), call: modelCall, notes: z.array(z.string()) })
export type RepairOutput = z.infer<typeof repairOutput>

export const unitProblems = z.array(z.tuple([z.string(), z.array(unitProblem)]))

const rulebookIssue = z.object({ code: issueCode, message: z.string(), recordKey: z.string(), path: jsonPath })

export const mergedRulebook = z.object({
  organization: z.object({ id: z.string() }),
  documents: z.array(governingDocument),
  provisions: z.array(provision),
  terms: z.array(termDraft),
  proposedCore: z.array(termDraft),
  rules: z.array(ruleDraft),
  settings: z.object({ clauses: encodingDraft.shape.clauses }),
  questions: z.array(questionDraft.extend({ id: z.string() }))
})

export const mergeOutput = z.object({
  rulebook: mergedRulebook,
  conflicts: z.array(z.object({ recordKey: z.string(), message: z.string(), related: z.array(z.string()) })),
  coverage: rulebookCoverage,
  termPairs: z.array(
    z.object({ keys: z.tuple([z.string(), z.string()]), labels: z.tuple([z.string(), z.string()]), score: z.number() })
  ),
  issues: z.array(rulebookIssue)
})
export type MergeOutput = z.infer<typeof mergeOutput>

export const consolidateOutput = z.object({
  rulebook: mergedRulebook,
  problems: z.array(
    z.object({
      code: z.enum(consolidationProblemCodes),
      recordKey: z.string(),
      message: z.string()
    })
  ),
  issues: z.array(rulebookIssue),
  call: modelCall.nullable()
})
export type ConsolidateOutput = z.infer<typeof consolidateOutput>
