import type { GoverningDocument, Provision, ProvisionKey, TermKey } from "@/schema/types"
import { validateRulebook, type JsonPath, type RulebookIssue, type ValidationCode } from "@/schema/validate"
import { encodingDraft, type EncodingDraftContent, type TermContent } from "@/schema/zod"
import { questionId, type DraftLocation } from "./merge"

// Verify and repair (encoding.md, Verify and Repair): Zod and validateRulebook problems on one unit's draft, each with
// its JSON path in the draft, so hoa-encoding-repair can fix them; after merge, the whole rulebook's issues grouped
// back by unit. A unit whose only problems are terms another unit defines waits for the merge instead of a repair.

export type UnitProblem = {
  source: "zod" | "validator"
  code: string
  message: string
  path: JsonPath
  /** For an undefined term: its key. */
  term: TermKey | null
}

export type UnitContext = {
  organizationId: string
  documents: readonly GoverningDocument[]
  provisions: readonly Provision[]
  vocabulary: readonly TermContent[]
}

export type RepairDecision = "none" | "repair" | "after-merge"

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null

function valueAt(root: unknown, path: JsonPath) {
  let current = root
  for (const step of path) {
    if (Array.isArray(current) && typeof step === "number") {
      current = current[step]
    } else if (isRecord(current) && typeof step === "string") {
      current = current[step]
    } else {
      return undefined
    }
  }
  return current
}

/** The term an undefined-term issue names: the string at its path, or the first word of its message. */
function undefinedTerm(code: ValidationCode, draft: unknown, path: JsonPath, message: string) {
  if (code !== "undefined-term") {
    return null
  }
  const value = valueAt(draft, path)
  return typeof value === "string" ? value : (message.split(" ")[0] ?? null)
}

function validatorProblem(issue: RulebookIssue, path: JsonPath, draft: unknown): UnitProblem {
  return {
    source: "validator",
    code: issue.code,
    message: `${issue.recordKey}: ${issue.message}`,
    path,
    term: undefinedTerm(issue.code, draft, path, issue.message)
  }
}

/** Where each record of one draft sits in it, by the key validateRulebook reports. */
function draftLocations(draft: EncodingDraftContent) {
  const locations = new Map<string, JsonPath>()
  draft.rules.forEach((rule, i) => locations.set(rule.key, ["rules", i]))
  draft.terms.forEach((term, i) => locations.set(term.key, ["terms", i]))
  draft.provisions.forEach((provision, i) => locations.set(provision.key, ["provisions", i]))
  draft.questions.forEach((_question, i) => locations.set(questionId(i + 1), ["questions", i]))
  locations.set("settings", [])
  return locations
}

/**
 * Verifies one unit's answer (encoding.md, Verify): Zod first, then validateRulebook against the documents, every
 * provision and the shared vocabulary. Problems on records outside the draft, and coverage of provisions outside the
 * unit, are left to the merge.
 */
export function verifyUnit(answer: unknown, unitProvisions: readonly ProvisionKey[], context: UnitContext) {
  const parsed = encodingDraft.safeParse(answer)
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue): UnitProblem => ({
      source: "zod",
      code: issue.code,
      message: issue.message,
      path: issue.path.map((step) => (typeof step === "number" ? step : String(step))),
      term: null
    }))
    return { draft: null, problems }
  }
  const draft = parsed.data
  const terms = new Map(context.vocabulary.map((term) => [term.key, term]))
  for (const term of draft.terms) {
    terms.set(term.key, { ...term, organizationId: context.organizationId })
  }
  const noRules = new Map(draft.provisions.map((provision) => [provision.key, provision.noRule]))
  const inUnit = new Set(unitProvisions)
  const issues = validateRulebook({
    organization: { id: context.organizationId },
    documents: [
      ...context.documents,
      ...draft.referencedDocuments.map((document) => ({ ...document, issuedBy: null, governs: null }))
    ],
    provisions: context.provisions.map((provision) => ({ ...provision, noRule: noRules.get(provision.key) ?? null })),
    terms: [...terms.values()],
    proposedCore: [],
    rules: draft.rules,
    settings: { clauses: draft.clauses },
    questions: draft.questions.map((question, i) => ({ ...question, id: questionId(i + 1) }))
  })
  const locations = draftLocations(draft)
  const problems = issues.flatMap((issue) => {
    const isOtherProvision = issue.code === "coverage" && !inUnit.has(issue.recordKey)
    const location = locations.get(issue.recordKey) ?? (inUnit.has(issue.recordKey) ? ["provisions"] : null)
    if (isOtherProvision || location === null) {
      return []
    }
    const path = issue.recordKey === "settings" ? issue.path : [...location, ...issue.path]
    return [validatorProblem(issue, path, draft)]
  })
  return { draft, problems }
}

/** The merged rulebook's issues, back on the units whose drafts hold the records (merge's sources). */
export function groupByUnit(
  issues: readonly RulebookIssue[],
  sources: ReadonlyMap<string, readonly DraftLocation[]>,
  drafts: ReadonlyMap<string, EncodingDraftContent>
) {
  const byUnit = new Map<string, UnitProblem[]>()
  for (const issue of issues) {
    for (const { unitId, path } of sources.get(issue.recordKey) ?? []) {
      const draftPath = issue.recordKey === "settings" ? issue.path : [...path, ...issue.path]
      const problem = validatorProblem(issue, draftPath, drafts.get(unitId))
      byUnit.set(unitId, [...(byUnit.get(unitId) ?? []), problem])
    }
  }
  return byUnit
}

/**
 * Repair or wait (encoding.md, Repair): a unit whose only problems are references to terms that other units define
 * is verified again after the merge; any other problem goes to hoa-encoding-repair.
 */
export function decideRepair(problems: readonly UnitProblem[], definedElsewhere: ReadonlySet<TermKey>): RepairDecision {
  if (problems.length === 0) {
    return "none"
  }
  const isWaiting = problems.every((problem) => problem.term !== null && definedElsewhere.has(problem.term))
  return isWaiting ? "after-merge" : "repair"
}

/** The terms each unit's draft defines, so a unit can see which of its missing terms another unit defines. */
export function termsDefinedElsewhere(unitId: string, drafts: ReadonlyMap<string, EncodingDraftContent>) {
  return new Set(
    [...drafts].filter(([id]) => id !== unitId).flatMap(([, draft]) => draft.terms.map((term) => term.key))
  )
}
