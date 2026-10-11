import { z } from "zod"
import { modelCall } from "@/jobs/steps"
import { rulebookCoverage } from "@/rulebook/coverage"
import {
  domain,
  encodingDraft,
  governingDocument,
  issueCode,
  provision,
  questionDraft,
  ruleDraft,
  ruleSelection,
  termDraft
} from "@/schema/zod"
import { structureProblemCodes } from "./check"
import { consolidationProblemCodes } from "./consolidate"
import type { Outline } from "./steps/outline"
import { vocabularyMergeAnswer } from "./steps/vocabularyMerge"

// What each build step returns (encoding.md, Stages). A Workflow stores step outputs in R2 and reads them back on
// replay, so every output is plain JSON, checked by these schemas when it's read. A model step stores its answer, or
// what code built from it, and each code step between rounds what the next round reads. The plan's units and each
// unit's state are also how the naive encoder's saved runs read back (savedRun.ts).

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

const itemProblem = z.object({ code: z.string(), message: z.string() })
const stepProblem = z.object({ recordKey: z.string(), code: z.string(), message: z.string(), path: jsonPath })

/**
 * B over one document: its terms (none when its last answer failed Zod), what they still have, how many problems its
 * first answer had, and its calls.
 */
export const definedTermsOutput = z.object({
  terms: z.array(termDraft).nullable(),
  problems: z.array(itemProblem),
  found: z.number().int(),
  calls: z.array(modelCall)
})

/** E over one section, first answer or rerun: its answer in the build's answer format, or why it failed Zod. */
export const findRulesOutput = <A>(answer: z.ZodType<A>) =>
  z.object({ answer: answer.nullable(), problems: z.array(itemProblem), call: modelCall })

/** E's check across sections: each answered section's problems, by section. */
export const findingCheckOutput = z.array(
  z.tuple([z.string(), z.array(z.object({ provisionKey: z.string(), code: z.string(), message: z.string() }))])
)

const outlineTargets = z.object({
  rules: z.array(z.string()),
  provisions: z.array(z.string()),
  documents: z.array(z.string())
})

/** An outline as a step stores it. */
export const outlineSchema: z.ZodType<Outline> = z.object({
  key: z.string(),
  provisionKey: z.string(),
  unitId: z.string(),
  summary: z.string(),
  domain,
  citations: z.array(z.string()),
  interpretation: z.boolean(),
  reads: z.array(z.object({ about: z.string(), fact: z.string() })),
  readKeys: z.array(z.string()),
  kind: z.enum(["norm", "discretion", "sanction", "limit"]),
  modality: z.string().nullable(),
  bearer: z.string().nullable(),
  appliesTo: z.string().nullable(),
  requestTypes: z.array(z.string()),
  check: z.enum(["test", "table", "document", "deadline", "approval", "judgment"]).nullable(),
  decidedBy: z.string().nullable(),
  targets: outlineTargets.nullable(),
  except: outlineTargets.nullable(),
  sanction: z.object({ type: z.string(), imposedBy: z.string(), against: z.array(z.string()) }).nullable(),
  resolved: z
    .object({ rules: z.array(z.string()), documents: z.array(z.string()), except: z.array(z.string()) })
    .nullable(),
  selector: ruleSelection.options[1].nullable()
})

/**
 * E's handoff once every section is answered: the outlines with their targets resolved, the targets that resolved to
 * nothing, the settings flags, and each section's part of the draft (reasons, questions, named documents) and problems.
 */
export const findingsOutput = z.object({
  outlines: z.array(outlineSchema),
  unresolved: z.array(z.object({ key: z.string(), target: z.string() })),
  settingsFlags: z.array(z.object({ provisionKey: z.string(), clause: z.string(), summary: z.string() })),
  sections: z.array(z.object({ unitId: z.string(), draft: encodingDraft, problems: z.array(itemProblem) }))
})

/** C over one group, first answer or rerun: its terms with the outlines each serves, or why it failed Zod. */
export const groupVocabularyOutput = z.object({
  group: z
    .object({
      terms: z.array(termDraft),
      serves: z.record(z.string(), z.array(z.string())),
      /** What building the terms found. */
      problems: z.array(stepProblem)
    })
    .nullable(),
  notes: z.array(z.string()),
  problems: z.array(itemProblem),
  call: modelCall
})

/** C's check across groups: each group's problems, by group. */
export const vocabularyCheckOutput = z.array(z.tuple([z.string(), z.array(stepProblem)]))

/** C-merge's answer, or why it failed Zod. */
export const vocabularyMergeOutput = z.object({
  answer: vocabularyMergeAnswer.nullable(),
  problems: z.array(itemProblem),
  call: modelCall
})

/**
 * F over one batch, or a retry of its failing rules: each rule's draft (its structure merged with its outline), the
 * rule when the draft passes Zod and what code found, the batch's proposed terms, clauses and notes, and the calls (a
 * first pass whose whole answer fails Zod is rerun once).
 */
export const structureRulesOutput = z.object({
  rules: z.array(
    z.object({
      key: z.string(),
      draft: z.record(z.string(), z.unknown()),
      rule: ruleDraft.nullable(),
      issues: z.array(z.string())
    })
  ),
  proposedTerms: z.array(termDraft),
  clauses: encodingDraft.shape.clauses,
  notes: z.array(z.string()),
  problems: z.array(itemProblem),
  calls: z.array(modelCall)
})
export type StructureRulesOutput = z.infer<typeof structureRulesOutput>

/** F's check before a retry round: each batch's rules that still have problems, with them. */
export const structureCheckOutput = z.array(
  z.object({
    batchId: z.string(),
    rules: z.array(
      z.object({
        key: z.string(),
        problems: z.array(z.object({ code: z.string(), message: z.string(), path: jsonPath }))
      })
    )
  })
)

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
  /** The call, and its rerun when the first answer failed Zod. */
  calls: z.array(modelCall),
  /** What failed Zod in an answer the rulebook was left unconsolidated for. */
  answerProblems: z.array(itemProblem)
})
export type ConsolidateOutput = z.infer<typeof consolidateOutput>
