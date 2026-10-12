import { describe, expect, it } from "vitest"
import { storedRule } from "@/schema/exampleRulebook.test-data"
import * as ex from "@/schema/examples.test-data"
import type { RulesFile } from "@/schema/types"
import type { RuleDraft } from "@/schema/zod"
import { date, entity, exampleContext, examples, fact, reference, term, yes } from "@/tests/engineContext"
import { indexRulebook, overridesOn } from "./overrides"

const rulebook = indexRulebook(examples)
const ruleOf = (file: RulesFile, key: string) => {
  const found = file.rules.find((rule) => rule.key === key)
  if (!found) {
    throw new Error(`no rule ${key}`)
  }
  return found
}
const keys = (rules: { key: string }[]) => rules.map((rule) => rule.key)
const effects = (overrides: ReturnType<typeof overridesOn>) => ({
  applying: overrides.applying.map(({ rule, effect }) => `${effect} by ${rule.key}`),
  unknown: overrides.unknown.map(({ rule, effect }) => `${effect} by ${rule.key}`)
})

describe("resolving overrides", () => {
  it("resolves rule keys and selectors, highest rank first", () => {
    expect(keys(rulebook.overridersOf(ruleOf(examples, ex.compositeColors.key)))).toEqual([
      ex.otherManufacturers.key,
      ex.grandfathered.key
    ])
    expect(keys(rulebook.overridersOf(ruleOf(examples, ex.noSolar.key)))).toEqual([
      ex.solarLaw.key,
      ex.grandfathered.key
    ])
    expect(keys(rulebook.overridersOf(ruleOf(examples, ex.maxHeight.key)))).toEqual([
      ex.variance.key,
      ex.grandfathered.key
    ])
    expect(keys(rulebook.targetsOf(ruleOf(examples, ex.otherManufacturers.key)))).toEqual([
      ex.compositeColors.key,
      ex.manufacturers.key
    ])
    expect(rulebook.targetsOf(ruleOf(examples, ex.lateFee.key))).toEqual([])
  })

  it("ignores an override by a lower-ranked rule, or of a rule that rules out exceptions unless it's law", () => {
    const guidelinesPermission: RuleDraft = {
      ...ex.grandfathered,
      key: "guidelines:1.4#prior-approval-waived",
      appliesTo: "work",
      overrides: [ex.priorApproval.key]
    }
    const lawPermission: RuleDraft = {
      ...ex.solarLaw,
      key: "property-code:202.010#fences",
      appliesTo: "fence-run",
      overrides: [ex.maxHeight.key]
    }
    const file: RulesFile = {
      ...examples,
      rules: [
        ...examples.rules.map((rule) =>
          rule.key === ex.maxHeight.key && rule.kind === "norm"
            ? { ...rule, noExceptions: { provisionKey: "guidelines:5.4.2(i)", highlight: null, region: null } }
            : rule
        ),
        storedRule(guidelinesPermission),
        storedRule(lawPermission)
      ]
    }
    const index = indexRulebook(file)
    expect(keys(index.overridersOf(ruleOf(file, ex.priorApproval.key)))).toEqual([])
    expect(keys(index.overridersOf(ruleOf(file, ex.maxHeight.key)))).toEqual([lawPermission.key])
  })
})

describe("overrides on a subject", () => {
  it("sends other manufacturers to the committee in an application, not in a violation", () => {
    const parts = {
      extra: [entity("run-1", "fence-run")],
      facts: [
        fact("run-1", "fence-run.material", term("fence-material.composite")),
        fact("run-1", "fence-run.manufacturer", { type: "value", term: null, text: "Fiberon" })
      ]
    }
    const colors = ruleOf(examples, ex.compositeColors.key)
    expect(effects(overridesOn(exampleContext(parts), rulebook, colors, "run-1"))).toEqual({
      applying: [`decided-by by ${ex.otherManufacturers.key}`],
      unknown: []
    })
    expect(
      effects(overridesOn(exampleContext({ ...parts, type: "violation" }), rulebook, colors, "run-1")).applying
    ).toEqual([])
  })

  it("exempts an existing fence installed with approval before the guidelines took effect", () => {
    const fence = (installed: ReturnType<typeof fact>[]) =>
      exampleContext({
        extra: [entity("run-1", "fence-run"), entity("approval-1", "approval")],
        facts: [
          ...installed,
          fact("approval-1", "approval.covers", reference("run-1")),
          fact("approval-1", "approval.by", term("committee")),
          fact("approval-1", "approval.status", term("approval-status.approved")),
          fact("approval-1", "approval.on", date("2024-05-01")),
          fact("approval-1", "approval.written", yes)
        ]
      })
    const maxHeight = ruleOf(examples, ex.maxHeight.key)
    const installedOn = (value: string) => [fact("run-1", "fence-run.installed-on", date(value))]
    expect(effects(overridesOn(fence(installedOn("2024-06-01")), rulebook, maxHeight, "run-1")).applying).toEqual([
      `exempt by ${ex.grandfathered.key}`
    ])
    expect(effects(overridesOn(fence(installedOn("2026-01-10")), rulebook, maxHeight, "run-1"))).toEqual({
      applying: [],
      unknown: []
    })
    expect(effects(overridesOn(fence([]), rulebook, maxHeight, "run-1")).unknown).toEqual([
      `exempt by ${ex.grandfathered.key}`
    ])
  })

  it("displaces a rule by a variance on the improvement it covers, and only there", () => {
    const lot = (runRef: string | null) =>
      exampleContext({
        entities: [
          entity("request", "architectural-application"),
          entity("lot", "lot", "lot-42"),
          entity("run-1", "fence-run", runRef)
        ]
      })
    const maxHeight = ruleOf(examples, ex.maxHeight.key)
    expect(effects(overridesOn(lot("improvement-0193"), rulebook, maxHeight, "run-1")).applying).toEqual([
      `displaced by ${ex.variance.key}`
    ])
    expect(effects(overridesOn(lot(null), rulebook, maxHeight, "run-1")).applying).toEqual([])
  })

  it("lets a rule that is itself exempted have no effect", () => {
    const waiver: RuleDraft = {
      ...ex.solarLaw,
      key: "guidelines:8.3#waiver",
      citations: [{ provisionKey: "guidelines:8.3", highlight: null, region: null }],
      appliesWhen: null,
      overrides: [ex.noSolar.key]
    }
    const lawAgainstWaiver: RuleDraft = {
      ...ex.solarLaw,
      key: "property-code:202.010#no-waiver",
      appliesWhen: null,
      overrides: [waiver.key]
    }
    const file: RulesFile = {
      ...examples,
      rules: [...examples.rules, storedRule(waiver), storedRule(lawAgainstWaiver)]
    }
    const context = exampleContext({ extra: [entity("panel-1", "solar-device")] }, {}, file)
    const overrides = overridesOn(context, indexRulebook(file), ruleOf(file, ex.noSolar.key), "panel-1")
    expect(effects(overrides)).toEqual({ applying: [], unknown: [`exempt by ${ex.solarLaw.key}`] })
  })

  it("stops at a cycle of overrides", () => {
    const a: RuleDraft = {
      ...ex.solarLaw,
      key: "property-code:202.010#cycle-a",
      appliesWhen: null,
      overrides: ["property-code:202.010#cycle-b"]
    }
    const b: RuleDraft = {
      ...ex.solarLaw,
      key: "property-code:202.010#cycle-b",
      appliesWhen: null,
      overrides: ["property-code:202.010#cycle-a"]
    }
    const file: RulesFile = { ...examples, rules: [storedRule(a), storedRule(b)] }
    const context = exampleContext({ extra: [entity("panel-1", "solar-device")] }, {}, file)
    expect(
      effects(overridesOn(context, indexRulebook(file), ruleOf(file, "property-code:202.010#cycle-a"), "panel-1"))
        .applying
    ).toEqual(["exempt by property-code:202.010#cycle-b"])
  })
})
