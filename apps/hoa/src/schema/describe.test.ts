import { describe, expect, it } from "vitest"
import { describeCheck, describeCondition, describeRule } from "./describe"
import { exampleRulebook } from "./exampleRulebook.test-data"
import * as ex from "./examples.test-data"
import type { Check, Condition } from "./types"
import { createVocabulary } from "./vocabulary"
import type { RuleContent } from "./zod"

const rulebook = exampleRulebook()
const vocabulary = createVocabulary(rulebook.terms)

describe("describeRule", () => {
  it.each(rulebook.rules.map((rule) => [rule.key, rule] as const))("describes %s", (_, rule) => {
    expect(describeRule(rule, vocabulary)).toMatchSnapshot()
  })
})

describe("describeCondition", () => {
  it("describes category criteria and settings conditions", () => {
    const conditions = [
      ...rulebook.terms.flatMap((term) => (term.kind === "category" ? [term.criteria] : [])),
      ...(rulebook.settings.clauses.sanctionPreconditions ?? []).map((precondition) => precondition.condition)
    ]
    expect(conditions.map((condition) => describeCondition(condition, vocabulary))).toMatchSnapshot()
  })

  it("describes quantifiers, windows and ranges", () => {
    const pets = {
      type: "in" as const,
      left: { type: "ref" as const, path: ["pet.species"] },
      values: [{ type: "value" as const, term: "species.dog" }]
    }
    expect([
      describeCondition(
        { type: "every", path: ["lot.pets"], where: pets, test: { type: "exists", path: ["pet.species"] } },
        vocabulary
      ),
      describeCondition({ type: "none", path: ["lot.pets"], where: null, test: pets }, vocabulary),
      describeCondition(
        {
          type: "during",
          start: { type: "ref", path: ["parking.start"] },
          end: { type: "ref", path: ["parking.end"] },
          window: { type: "weekly", days: ["sat", "sun"], from: "08:00", to: "10:00" },
          match: "overlaps"
        },
        vocabulary
      ),
      describeCondition(
        {
          type: "during",
          start: { type: "ref", path: ["parking.start"] },
          end: { type: "ref", path: ["parking.end"] },
          window: { type: "annual", from: "11-15", to: "01-15" },
          match: "within"
        },
        vocabulary
      ),
      describeCondition(
        {
          type: "between",
          left: { type: "ref", from: "lot", path: [] },
          min: { type: "number", value: 1 },
          max: { type: "number", value: 2 },
          includeMin: false,
          includeMax: false
        },
        vocabulary
      )
    ]).toMatchSnapshot()
  })
})

describe("every other form", () => {
  const ref = (...path: string[]) => ({ type: "ref" as const, path })
  const usd = (value: number) => ({ type: "quantity" as const, value, unit: "usd" })
  const days = (value: number) => ({ value, unit: "calendar-day", at: null })
  const [norm] = rulebook.rules
  const sanction = rulebook.rules.find((rule) => rule.kind === "sanction")
  const limit = rulebook.rules.find((rule) => rule.kind === "limit")
  const discretion = rulebook.rules.find((rule) => rule.kind === "discretion")

  it("describes operands, conditions and checks", () => {
    const conditions: Condition[] = [
      { type: "compare", left: ref("approval.written"), op: "!=", right: { type: "boolean", value: false } },
      { type: "compare", left: ref("parking.start"), op: ">", right: { type: "time", value: "22:00" } },
      {
        type: "compare",
        left: { type: "difference", of: [usd(10), { type: "product", of: [usd(2), { type: "number", value: 3 }] }] },
        op: ">=",
        right: { type: "least", of: [usd(1), usd(2)] }
      },
      {
        type: "compare",
        left: { type: "greatest", of: [usd(1), usd(2), usd(3)] },
        op: "<",
        right: { type: "sum-of", path: ["lot.pets"], value: ["pet.weight"], where: null }
      },
      {
        type: "compare",
        left: {
          type: "greatest-of",
          path: ["lot.pets"],
          value: ["pet.age"],
          where: { type: "exists", path: ["pet.species"] }
        },
        op: "<=",
        right: { type: "least-of", path: ["lot.pets"], value: ["pet.age"], where: null }
      },
      {
        type: "compare",
        left: { type: "shift", of: { type: "governing-date" }, by: { value: -1, unit: "year" } },
        op: ">",
        right: { type: "date", value: "2020-01-01" }
      },
      {
        type: "during",
        start: ref("parking.start"),
        end: ref("parking.end"),
        window: { type: "weekly", days: ["mon"], from: null, to: null },
        match: "within"
      },
      {
        type: "during",
        start: ref("parking.start"),
        end: ref("parking.end"),
        window: { type: "recurring", schedule: ref("community.trash-pickup"), from: null, to: null },
        match: "within"
      }
    ]
    const checks: Check[] = [
      {
        type: "table",
        inputs: [ref("fence-run.material"), ref("fence-run.height")],
        rows: [
          {
            when: [{ type: "not-in", values: [{ type: "value", term: "fence-material.wood" }] }, { type: "any" }],
            result: "not-met",
            citation: null
          },
          {
            when: [
              { type: "any" },
              {
                type: "range",
                min: null,
                max: { type: "quantity", value: 72, unit: "inch" },
                includeMin: true,
                includeMax: false
              }
            ],
            result: "met",
            citation: null
          },
          { when: [{ type: "any" }, { type: "any" }], result: "not-met", citation: null }
        ],
        otherwise: "met"
      },
      { type: "document", document: "site-plan", per: "request", mustState: [], signedBy: [] },
      {
        type: "deadline",
        act: ref("parking.end"),
        anchor: ref("parking.start"),
        earliest: days(1),
        latest: null,
        onMiss: []
      },
      {
        type: "deadline",
        act: ref("parking.end"),
        anchor: ref("parking.start"),
        earliest: null,
        latest: null,
        onMiss: []
      },
      { type: "judgment", question: "Is it tidy?", evidence: [] }
    ]
    const rules: RuleContent[] = []
    if (norm?.kind === "norm") {
      rules.push(
        {
          ...norm,
          appliesTo: [],
          modality: "prohibition",
          check: null,
          overrides: { documents: [], provisions: ["guidelines:5"], adoptedAfter: null, except: [norm.key] }
        },
        { ...norm, modality: "permission", check: null, overrides: [ex.maxHeight.key] }
      )
    }
    if (discretion?.kind === "discretion") {
      rules.push({
        ...discretion,
        overrides: { documents: ["guidelines"], provisions: [], adoptedAfter: null, except: [] }
      })
    }
    if (sanction?.kind === "sanction") {
      rules.push(
        { ...sanction, sanction: { ...sanction.sanction, amounts: "none" } },
        { ...sanction, sanction: { ...sanction.sanction, amounts: "set-by-imposer" } }
      )
    }
    if (limit?.kind === "limit") {
      rules.push({ ...limit, forbids: true, maxAmount: usd(100), maxTotal: null })
    }
    expect([
      ...conditions.map((condition) => describeCondition(condition, vocabulary)),
      ...checks.map((check) => describeCheck(check, vocabulary)),
      ...rules.map((rule) => describeRule(rule, vocabulary))
    ]).toMatchSnapshot()
  })
})

describe("describeCheck", () => {
  it("describes a check on its own", () => {
    const inches = (value: number) => ({ type: "quantity" as const, value, unit: "inch" })
    const height = { type: "ref" as const, path: ["fence-run.height"] }
    const between = {
      type: "between" as const,
      left: height,
      min: inches(48),
      max: inches(72),
      includeMin: true,
      includeMax: true
    }
    expect(describeCheck({ type: "test", test: between }, vocabulary)).toBe(
      "its height is at least 48 in and at most 72 in"
    )
    expect(
      describeCheck({ type: "approval", by: ["committee"], needs: "all", prior: true, written: true }, vocabulary)
    ).toBe("it was approved by the Reviewer in writing beforehand")
  })
})

describe("linked terms", () => {
  it("writes terms as statement links, units as labels, and keeps the article the label needs", () => {
    const options = { linkTerms: true }
    const height = { type: "ref" as const, path: ["fence-run.height"] }
    expect(
      describeCondition(
        { type: "compare", left: height, op: "<=", right: { type: "quantity", value: 72, unit: "inch" } },
        vocabulary,
        options
      )
    ).toBe("its {{fence-run.height}} is at most 72 in")
    expect(describeCondition({ type: "is-a", path: [], category: "return-fence" }, vocabulary, options)).toBe(
      "it is a {{return-fence}}"
    )
    expect(
      describeCheck(
        { type: "approval", by: ["committee"], needs: "all", prior: false, written: false },
        vocabulary,
        options
      )
    ).toBe("it was approved by the {{committee}}")
  })
})
