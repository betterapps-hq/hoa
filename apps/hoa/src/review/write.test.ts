import { describe, expect, it } from "vitest"
import { decide } from "@/engine/decide"
import { evaluate } from "@/engine/evaluate"
import { fenceAnswers, fenceRequest, fenceRulesFile } from "@/tests/fenceSchemaFixture"
import { rulebookVocabulary } from "./documentTypes"
import { actionItems, applySummary, markableRules, summaryAnswerSchema, summaryVariables } from "./write"

const rulesFile = fenceRulesFile()
const request = fenceRequest()
const findings = evaluate({ rulesFile, request, answers: fenceAnswers(), evaluatedAt: "2026-09-10T12:00:00Z" })
const decision = decide(findings, rulesFile, request.type)
const context = {
  rules: new Map(rulesFile.rules.map((rule) => [rule.key, rule])),
  entities: request.entities,
  findings,
  vocabulary: rulebookVocabulary(rulesFile)
}
const items = actionItems(decision, context)

describe("the writer's input and output", () => {
  it("words each action group with its entities and reasons until the writer phrases it", () => {
    expect(items.changes.map((item) => item.id)).toEqual(["change-1", "change-2", "change-3"])
    const height = items.missingInformation.find((item) => item.ruleKey === "guidelines:5.5.1(i)#max-height")
    expect(height?.text).toContain("Left side run, Right side run")
    expect(height?.text).toContain("Needs height.")
  })

  it("gives the writer findings with their provisions and the action items, but no not-applicable findings", () => {
    const variables = summaryVariables(rulesFile, decision.recommendation, items, context)
    const listed: { rule: string; outcome: string; provision: string }[] = JSON.parse(variables.findings)
    expect(listed.some((finding) => finding.outcome === "not-applicable")).toBe(false)
    expect(listed.find((finding) => finding.rule === "guidelines:5.4.2(i)#colors")?.provision).not.toBe("")
    expect(JSON.parse(variables.actionItems)).toHaveLength(
      items.changes.length + items.missingInformation.length + items.committeeDecisions.length
    )
    expect(variables.suggestions).toBe("none")
  })

  it("applies the phrasing and keeps code's text for skipped items", () => {
    const answer = { assessment: "Request information.", feedback: "See below.", items: [] }
    const written = applySummary({ ...answer, items: [{ id: "change-1", text: "Use vertical boards." }] }, items)
    expect(written.changes[0]?.text).toBe("Use vertical boards.")
    expect(written.changes[1]?.text).toBe(items.changes[1]?.text)
  })

  it("refuses an answer marking a rule outside the findings, their modifiers and the rules their reasons name", () => {
    const reasoned = findings
      .slice(0, 1)
      .map((finding) => ({ ...finding, reason: "Needs what decides whether Exempt (declaration:4.1/p4#x) applies." }))
    const known = markableRules(reasoned, ["declaration:4.1/p4#x", "declaration:99#y"])
    expect(known.has("declaration:4.1/p4#x")).toBe(true)
    expect(known.has("declaration:99#y")).toBe(false)
    const schema = summaryAnswerSchema(known)
    const answer = { assessment: "{{rule:declaration:4.1/p4#x}}", feedback: "", items: [] }
    expect(schema.safeParse(answer).success).toBe(true)
    expect(schema.safeParse({ ...answer, feedback: "{{rule:declaration:99#y}}" }).success).toBe(false)
  })
})
