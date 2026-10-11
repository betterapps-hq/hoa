import { readFileSync } from "node:fs"
import { join } from "node:path"
import invariant from "tiny-invariant"
import { describe, expect, it } from "vitest"
import { reviewCase } from "@/evaluation/review/cases"
import { mergeRulesFiles } from "@/evaluation/review/rulesFile"
import type * as T from "@/schema/types"
import { fenceReview } from "@/tests/fenceReview"
import { fenceRulesFile, runs } from "@/tests/fenceSchemaFixture"
import { sampleDeclarationRulesFile } from "@/tests/sampleRulesFile"
import { reportRules } from "../applicationView"
import { entityCards, filterMatrix, outcomeCounts, reviewMatrix, type ReviewMatrixModel } from "./ReviewMatrix.utils"

const rulesByKey = (rules: ReturnType<typeof reportRules>) => new Map(rules.map((rule) => [rule.key, rule]))

/** The grid as outcomes: rule, then entity, with null for a rule that doesn't apply to the entity. */
const grid = (groups: ReviewMatrixModel["groups"]) =>
  Object.fromEntries(
    groups.flatMap((group) =>
      group.rows.map((row) => [row.ruleKey, row.cells.map((cell) => cell.finding?.outcome ?? null)])
    )
  )

describe("reviewMatrix on the sample fence application's expected result", () => {
  const { review, rules } = fenceReview()
  const model = reviewMatrix(review, rulesByKey(rules))

  it("has a column for each run, the gate and the work, then the application", () => {
    expect(model.columns.map((column) => column.id)).toEqual([...runs, "gate-1", "work-1", "request"])
  })

  it("has a column for the lot only when a rule applies to it", () => {
    const [first] = review.findings
    invariant(first, "the fence review has findings")
    const onLot = (outcome: T.Outcome) => ({
      ...review,
      findings: [...review.findings, { ...first, entity: "lot", outcome }]
    })
    expect(reviewMatrix(onLot("not-applicable"), rulesByKey(rules)).columns.map((column) => column.id)).not.toContain(
      "lot"
    )
    expect(reviewMatrix(onLot("not-met"), rulesByKey(rules)).columns.at(-1)?.id).toBe("lot")
  })

  it("gives each rule its outcome per entity, and n/a where its subject is another type", () => {
    const rows = grid(model.groups)
    const notApplicable = ["not-applicable", "not-applicable", "not-applicable", "not-applicable"]
    expect(rows["guidelines:5.4.2(i)#colors"]).toEqual(["not-met", "not-met", "not-met", "not-met", null, null, null])
    expect(rows["guidelines:5.6.1(i)#neighbor-approval"]).toEqual([
      "missing-information",
      "missing-information",
      "not-applicable",
      "not-applicable",
      null,
      null,
      null
    ])
    expect(rows["guidelines:5.3#no-vinyl"]).toEqual([...notApplicable, null, null, null])
    expect(rows["guidelines:5.9.1#gate-boards"]).toEqual([null, null, null, null, "not-met", null, null])
    expect(rows["declaration:4.3(b)/p2#harmony"]).toEqual([null, null, null, null, null, "committee", null])
    expect(rows["guidelines:3.1.5#owner-signatures"]).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      "missing-information"
    ])
    expect(Object.keys(rows)).toHaveLength(new Set(review.findings.map((finding) => finding.ruleKey)).size)
  })

  it("groups rows by their main citation's provision, in document order", () => {
    const group = model.groups.find((item) => item.provisionKey === "guidelines:5.4.2(iii)")
    expect(group?.title).toBe("Guidelines 5.4.2(iii)")
    expect(group?.rows.map((row) => row.ruleKey)).toEqual([
      "guidelines:5.4.2(iii)#gate-color",
      "guidelines:5.4.2(iii)#gate-material"
    ])
    const keys = model.groups.map((item) => item.provisionKey)
    expect(keys.indexOf("guidelines:5.9.1")).toBeGreaterThan(keys.indexOf("guidelines:5.4.2(i)"))
  })

  it("keeps only what needs attention, or the rows with chosen outcomes", () => {
    const attention = grid(filterMatrix(model, { isAttentionOnly: true, outcomes: [] }))
    expect(attention["guidelines:5.3#materials"]).toBeUndefined()
    expect(attention["guidelines:5.3#no-vinyl"]).toBeUndefined()
    expect(attention["guidelines:5.4.2(i)#colors"]).toBeDefined()
    expect(attention["declaration:4.3(b)/p2#harmony"]).toBeDefined()
    const committee = grid(filterMatrix(model, { isAttentionOnly: false, outcomes: ["committee"] }))
    expect(Object.keys(committee).toSorted()).toEqual([
      "declaration:4.1/p1#approval-required",
      "declaration:4.2(d)#reasonable-fees",
      "declaration:4.3(b)/p2#harmony"
    ])
  })

  it("counts outcomes in the order people act on them", () => {
    expect(outcomeCounts(model).map((count) => count.outcome)).toEqual([
      "not-met",
      "missing-information",
      "committee",
      "pending",
      "met",
      "not-applicable"
    ])
    expect(outcomeCounts(model).find((count) => count.outcome === "not-met")?.count).toBe(9)
  })

  it("lists each entity's findings on its card, counting the rules that don't apply", () => {
    const [left] = entityCards(model, model.groups)
    expect(left?.entity.id).toBe("run-1")
    expect(left?.findings.map((finding) => finding.ruleKey)).toContain("guidelines:5.4.2(i)#colors")
    expect(left?.findings.every((finding) => finding.outcome !== "not-applicable")).toBe(true)
    expect(left?.notApplicable).toBeGreaterThan(0)
  })
})

describe("reviewMatrix on the garage enclosure's expected result", () => {
  const garage = reviewCase.parse(
    JSON.parse(
      readFileSync(join(import.meta.dirname, "../../../../samples/garage-enclosure/baseline/case.json"), "utf8")
    )
  )
  const findings = Object.entries(garage.expected.findings).map(([key, outcome]): T.Finding => {
    const [ruleKey = key, entity = "request"] = key.split(" ")
    return {
      ruleKey,
      entity,
      outcome,
      remedy: null,
      reason: "",
      inputs: [],
      modifiedBy: [],
      judgment: null,
      statements: [],
      effects: [],
      sanction: null,
      asOf: "2026-10-01",
      evaluatedAt: garage.now
    }
  })
  const entities = [
    { id: "request", type: "architectural-application", label: "The application", ref: null },
    { id: "lot", type: "lot", label: "The lot", ref: null },
    ...garage.expected.entities.map((entity) => ({ ...entity, ref: null }))
  ]
  const rulesFile = mergeRulesFiles(sampleDeclarationRulesFile(), fenceRulesFile())
  const rules = rulesByKey(
    reportRules(
      rulesFile,
      findings.map((finding) => finding.ruleKey)
    )
  )
  const model = reviewMatrix({ request: { ...fenceReview().review.request, entities }, findings }, rules)

  it("has the converted space, the work and the application, and none for entities without findings", () => {
    expect(model.columns.map((column) => column.id)).toEqual(["space-1", "work-1", "request"])
  })

  it("gives the use restrictions' garage rules on the space and the Declaration's on the work", () => {
    const rows = grid(model.groups)
    expect(rows["use-restrictions:a(vii)#replacement-garage-plans"]).toEqual(["missing-information", null, null])
    expect(rows["use-restrictions:a(vii)#reviewer-garage-enclosure"]).toEqual(["committee", null, null])
    expect(rows["use-restrictions:a(vii)#no-conversion"]).toEqual(["not-applicable", null, null])
    expect(rows["declaration:4.3(b)/p2#harmony"]).toEqual([null, "committee", null])
    expect(rows["declaration:4.2(d)#fee-before-review"]).toEqual([null, null, "met"])
    expect(rows["declaration:4.3(b)/p3#written-response"]).toEqual([null, null, "pending"])
  })

  it("keeps the replacement plans and the committee's decisions as what needs attention", () => {
    const attention = Object.keys(grid(filterMatrix(model, { isAttentionOnly: true, outcomes: [] }))).toSorted()
    expect(attention).toEqual([
      "declaration:4.1/p1#approval-required",
      "declaration:4.3(b)/p2#harmony",
      "use-restrictions:a(vii)#replacement-garage-plans",
      "use-restrictions:a(vii)#reviewer-garage-enclosure"
    ])
  })
})
