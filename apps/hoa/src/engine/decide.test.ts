import { describe, expect, it } from "vitest"
import { storedRule } from "@/schema/exampleRulebook.test-data"
import * as ex from "@/schema/examples.test-data"
import type { Finding, Outcome, Remedy, RulesFile } from "@/schema/types"
import { date, entity, exampleRequest, examples, fact, term } from "@/tests/engineContext"
import { decide } from "./decide"
import { evaluate } from "./evaluate"

const finding = (ruleKey: string, entityId: string, outcome: Outcome, remedy: Remedy | null = null): Finding => ({
  ruleKey,
  entity: entityId,
  outcome,
  remedy,
  reason: "",
  inputs: [],
  modifiedBy: [],
  judgment: null,
  statements: [],
  effects: [],
  sanction: null,
  asOf: "2026-02-03",
  evaluatedAt: "2026-02-03T15:01:00Z"
})

const recommend = (findings: Finding[], file: RulesFile = examples) =>
  decide(findings, file, "architectural-application").recommendation

describe("from findings to a recommendation (schema.md; application-review.md, Decide)", () => {
  it("recommends the most serious action: deny, request information, refer, approve with conditions, approve", () => {
    const colors = finding(ex.compositeColors.key, "run-1", "not-met", "change-detail")
    const neighbor = finding(ex.neighborApproval.key, "run-1", "not-met", "redesign")
    const height = finding(ex.maxHeight.key, "run-1", "missing-information", "provide-information")
    const otherMaker = finding(ex.manufacturers.key, "run-2", "committee")
    expect(recommend([finding(ex.manufacturers.key, "run-1", "met")])).toBe("approve")
    expect(recommend([colors])).toBe("approve-with-conditions")
    expect(recommend([colors, otherMaker])).toBe("refer-to-committee")
    expect(recommend([colors, otherMaker, height])).toBe("request-information")
    expect(recommend([colors, otherMaker, height, neighbor])).toBe("deny")
  })

  it("follows the organization's decision policy for each remedy", () => {
    const strict: RulesFile = {
      ...examples,
      settings: {
        ...examples.settings,
        policy: {
          ...examples.settings.policy,
          decisionPolicy: { "change-detail": "deny", redesign: "deny", none: "deny" }
        }
      }
    }
    expect(recommend([finding(ex.compositeColors.key, "run-1", "not-met", "change-detail")], strict)).toBe("deny")
  })

  it("lists advisory findings as suggestions, without changing the recommendation", () => {
    const decision = decide([finding(ex.frontSetback.key, "run-4", "advisory")], examples, "architectural-application")
    expect(decision).toMatchObject({
      recommendation: "approve",
      suggestions: [{ ruleKey: ex.frontSetback.key, entities: ["run-4"] }]
    })
  })

  it("groups each list by rule, with every entity it covers", () => {
    const decision = decide(
      [
        finding(ex.compositeColors.key, "run-1", "not-met", "change-detail"),
        finding(ex.maxHeight.key, "run-1", "missing-information", "provide-information"),
        finding(ex.compositeColors.key, "run-2", "not-met", "change-detail")
      ],
      examples,
      "architectural-application"
    )
    expect(decision.changes).toEqual([
      { ruleKey: ex.compositeColors.key, entities: ["run-1", "run-2"], remedy: "change-detail" }
    ])
    expect(decision.missingInformation).toEqual([
      { ruleKey: ex.maxHeight.key, entities: ["run-1"], remedy: "provide-information" }
    ])
  })

  it("never counts findings about the committee or board, nor the decider's own approval", () => {
    expect(recommend([finding(ex.committeeResponse.key, "request", "not-met")])).toBe("approve")
    expect(recommend([finding(ex.priorApproval.key, "work-1", "committee")])).toBe("approve")
    expect(recommend([finding(ex.eitherApproval.key, "vehicle-1", "committee")])).toBe("approve")
  })

  it("counts an approval by anyone else, and every approval when no decider is named", () => {
    const boardOnly = storedRule({
      ...ex.priorApproval,
      key: "declaration:4.1#board",
      check: { type: "approval", by: ["board"], needs: "all", prior: false, written: false }
    })
    const withBoard: RulesFile = { ...examples, rules: [...examples.rules, boardOnly] }
    expect(recommend([finding(boardOnly.key, "work-1", "committee")], withBoard)).toBe("refer-to-committee")
    const noDeciders: RulesFile = {
      ...examples,
      settings: { ...examples.settings, clauses: { ...examples.settings.clauses, deciders: [] } }
    }
    expect(recommend([finding(ex.priorApproval.key, "work-1", "committee")], noDeciders)).toBe("refer-to-committee")
  })

  it("counts a requirement on the application, which has no remedy, under the policy for none", () => {
    const fee = storedRule({
      ...ex.quorum,
      key: "declaration:4.2(d)#fee",
      requestTypes: ["architectural-application"],
      appliesTo: "architectural-application"
    })
    const file: RulesFile = { ...examples, rules: [...examples.rules, fee] }
    expect(recommend([finding(fee.key, "request", "not-met")], file)).toBe("deny")
    expect(recommend([finding("rules:9#unknown-rule", "request", "not-met")], file)).toBe("approve")
  })

  it("recommends a compliant application for approval despite the prior-approval rule", () => {
    const file: RulesFile = {
      ...examples,
      rules: examples.rules.filter((rule) =>
        [ex.compositeColors.key, ex.priorApproval.key, ex.committeeResponse.key].includes(rule.key)
      )
    }
    const request = exampleRequest()
    const findings = evaluate({
      rulesFile: file,
      request: {
        ...request,
        entities: [...request.entities, entity("work-1", "work"), entity("run-1", "fence-run")],
        facts: [
          fact("request", "architectural-application.submitted-on", date("2026-02-03")),
          fact("run-1", "fence-run.material", term("fence-material.composite")),
          fact("run-1", "fence-run.manufacturer", term("composite-manufacturer.trex")),
          fact("run-1", "fence-run.color", term("composite-color.saddle"))
        ]
      },
      evaluatedAt: "2026-02-03T15:01:00Z"
    })
    expect(findings.map(({ ruleKey, outcome }) => `${ruleKey} ${outcome}`)).toEqual([
      `${ex.compositeColors.key} met`,
      `${ex.committeeResponse.key} pending`,
      `${ex.priorApproval.key} committee`
    ])
    expect(decide(findings, file, request.type)).toEqual({
      recommendation: "approve",
      changes: [],
      missingInformation: [],
      committeeDecisions: [],
      suggestions: []
    })
  })
})
