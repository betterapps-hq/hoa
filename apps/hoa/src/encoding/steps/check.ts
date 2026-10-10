import type { GoverningDocument, Provision, TermKey } from "@/schema/types"
import { validateRulebook, type JsonPath } from "@/schema/validate"
import type { RuleContent, TermContent } from "@/schema/zod"

// The checks code runs on a drafted step's output before the next step reads it (the review's per-step checks): the
// rulebook validator over just the records the step produced, with the vocabulary they may use.

export type StepProblem = { recordKey: string; code: string; message: string; path: JsonPath }

type CheckInput = {
  terms: readonly TermContent[]
  rules?: readonly RuleContent[]
  /** The provisions citations may name; without them, citations aren't checked. */
  provisions?: readonly Pick<Provision, "key" | "label">[]
  documents?: readonly Pick<GoverningDocument, "key" | "kind">[]
  /** Only problems on these records are reported; all of them when left out. */
  about?: ReadonlySet<string>
}

/** The validator's problems with a set of terms and rules, coverage aside. */
export function recordProblems(input: CheckInput): StepProblem[] {
  const issues = validateRulebook({
    organization: { id: "check" },
    documents: (input.documents ?? []).map((document) => ({
      key: document.key,
      kind: document.kind,
      issuedBy: null,
      governs: null
    })),
    provisions: (input.provisions ?? []).map((provision) => ({
      key: provision.key,
      label: provision.label,
      noRule: null
    })),
    terms: [...input.terms],
    proposedCore: [],
    rules: [...(input.rules ?? [])],
    settings: { clauses: {} },
    questions: []
  })
  return issues
    .filter((issue) => issue.code !== "coverage")
    .filter((issue) => input.provisions !== undefined || issue.code !== "citation-not-found")
    .filter((issue) => input.documents !== undefined || issue.code !== "undefined-document")
    .filter((issue) => input.about === undefined || input.about.has(issue.recordKey))
    .map((issue) => ({ recordKey: issue.recordKey, code: issue.code, message: issue.message, path: issue.path }))
}

/** Keys that appear more than once. */
export function repeatedKeys(keys: readonly TermKey[]) {
  const seen = new Set<string>()
  const repeated = new Set<string>()
  for (const key of keys) {
    if (seen.has(key)) {
      repeated.add(key)
    }
    seen.add(key)
  }
  return [...repeated]
}
