import * as ex from "./examples.test-data"
import type { DocumentKind, Provenance, Review, Rule, RulesFile, Term } from "./types"
import type { Rulebook } from "./validate"
import { questionDraft, type RuleDraft, ruleDraft, rulesFile, type TermDraft, termDraft } from "./zod"

// The examples as one rulebook, parsed from their drafts. The examples are excerpts: their rules cite provisions of
// documents the examples don't show, so those documents and provisions are stubbed here.
const stubDocuments: Record<string, DocumentKind> = {
  declaration: "declaration",
  rules: "rules",
  bylaws: "bylaws",
  "property-code": "state-law",
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

// ─── Stored records ───────────────────────────────────────────────────────────────────────────────

const system: Provenance = { by: "system", at: "2026-10-09T00:00:00Z" }
const proposed: Review = { status: "proposed", by: null, at: null, note: null }

/** A term draft as stored: the bookkeeping filled, every record proposed. */
export function storedTerm(draft: TermDraft): Term {
  const parsed = termDraft.parse(draft)
  const labels = parsed.labels.map((label) => ({ ...label, provenance: system }))
  return { ...parsed, labels, provenance: system, review: proposed, issues: [] }
}

/** A rule draft as stored. */
export const storedRule = (draft: RuleDraft): Rule => ({
  ...ruleDraft.parse(draft),
  provenance: system,
  review: proposed,
  issues: []
})

/** The examples as a whole rules file, the stubbed documents and provisions given the fields a file needs. */
export function exampleRulesFile(): RulesFile {
  const rulebook = exampleRulebook()
  return rulesFile.parse({
    organization: { id: rulebook.organization.id, name: "Sample organization" },
    documents: rulebook.documents.map((document) => ({ title: document.key, edition: null, ...document })),
    provisions: rulebook.provisions.map((provision) => ({
      kind: "section",
      num: null,
      heading: null,
      parentLabel: null,
      intro: null,
      text: provision.label,
      wrapUp: null,
      anchors: [],
      ...provision
    })),
    terms: ex.organizationTerms.map(storedTerm),
    proposedCore: [],
    rules: ex.exampleRules.map(storedRule),
    settings: { ...ex.settings, review: proposed, issues: [] },
    questions: rulebook.questions.map((question, i) => ({ id: `question-${i + 1}`, ...question }))
  })
}
