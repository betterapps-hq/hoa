import * as ex from "./examples.test-data"
import type { DocumentKind } from "./types"
import type { Rulebook } from "./validate"
import { questionDraft, ruleDraft, termDraft } from "./zod"

// The examples as one rulebook, parsed from their drafts. The examples are excerpts: their rules cite provisions of
// documents the examples don't show, so those documents and provisions are stubbed here.
const stubDocuments: Record<string, DocumentKind> = {
  declaration: "declaration",
  rules: "rules",
  bylaws: "bylaws",
  "property-code": "statute",
  "decision-2026-0142": "decision"
}

export function exampleRulebook(): Rulebook {
  const rules = ex.exampleRules.map((draft) => ruleDraft.parse(draft))
  const cited = new Set(
    rules.flatMap((rule) => [...rule.citations, ...(rule.authority ? [rule.authority] : [])]).map((c) => c.provisionKey)
  )
  cited.delete(ex.provision542.key)
  const stubProvisions = [...cited].map((key) => ({ key, label: key.slice(key.indexOf(":") + 1), noRule: null }))
  return structuredClone({
    organization: { id: "org-sample" },
    documents: [
      ex.guidelines,
      ex.byLaws,
      ...Object.entries(stubDocuments).map(([key, kind]) => ({ key, kind, issuedBy: null, governs: null }))
    ],
    provisions: [ex.provision542, ...stubProvisions],
    terms: ex.organizationTerms.map((term) => termDraft.parse(term)),
    proposedCore: [],
    rules,
    settings: { clauses: ex.settings.clauses },
    questions: [questionDraft.parse(ex.interpretation)]
  })
}
