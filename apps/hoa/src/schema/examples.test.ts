import { describe, expect, it } from "vitest"
import { coreTerms } from "./coreTerms"
import { exampleRulebook } from "./exampleRulebook.test-data"
import * as ex from "./examples.test-data"
import { validateRulebook } from "./validate"
import { governingDocument, provision, questionDraft, ruleDraft, settings, termDraft } from "./zod"

describe("the schema's examples", () => {
  it.each(ex.organizationTerms.map((term) => [term.key, term] as const))("term %s validates", (_, term) => {
    expect(termDraft.safeParse(term).error).toBeUndefined()
  })

  it.each(ex.exampleRules.map((rule) => [rule.key, rule] as const))("rule %s validates", (_, rule) => {
    expect(ruleDraft.safeParse(rule).error).toBeUndefined()
  })

  it("validates the amended rule, the sources, the settings and the question", () => {
    expect(ruleDraft.safeParse({ ...ex.maxHeight, ...ex.maxHeightAmended }).error).toBeUndefined()
    expect(governingDocument.safeParse(ex.guidelines).error).toBeUndefined()
    expect(governingDocument.safeParse(ex.byLaws).error).toBeUndefined()
    expect(provision.safeParse({ ...ex.provision542, anchors: [] }).error).toBeUndefined()
    const review = { status: "approved", by: null, at: null, note: null }
    expect(settings.safeParse({ ...ex.settings, review, issues: [] }).error).toBeUndefined()
    expect(questionDraft.safeParse(ex.interpretation).error).toBeUndefined()
  })

  it("resolves every term and rule they reference, and keeps the invariants", () => {
    expect(validateRulebook(exampleRulebook())).toEqual([])
  })

  it("resolves the evaluation request's and the findings' terms and rules", () => {
    const terms = new Set([...coreTerms, ...ex.organizationTerms].map((term) => term.key))
    const rules = new Set(ex.exampleRules.map((rule) => rule.key))
    const termKeys = [
      ...ex.request.entities.map((entity) => entity.type),
      ...ex.request.facts.flatMap((fact) => [fact.property, fact.value?.type === "value" ? fact.value.term : null]),
      ...ex.findings.flatMap((finding) => finding.inputs.map((input) => input.property))
    ]
    const ruleKeys = ex.findings.flatMap((finding) => [finding.ruleKey, ...finding.modifiedBy.map((m) => m.ruleKey)])
    expect(termKeys.filter((key) => key !== null && !terms.has(key))).toEqual([])
    expect(ruleKeys.filter((key) => !rules.has(key))).toEqual([])
  })
})
