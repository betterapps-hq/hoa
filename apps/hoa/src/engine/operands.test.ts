import { describe, expect, it } from "vitest"
import { storedTerm } from "@/schema/exampleRulebook.test-data"
import type { Operand } from "@/schema/types"
import { date, entity, exampleContext, examples, fact, quantity, reference, term } from "@/tests/engineContext"
import * as D from "./decimal"
import { evaluateOperand } from "./operands"
import * as V from "./values"

const scope = (id: string) => ({ subject: { type: "entity" as const, id } })
const ref = (...path: string[]): Operand => ({ type: "ref", path })
const community = (...path: string[]): Operand => ({ type: "ref", from: "community", path })
const usd = (value: number): Operand => ({ type: "quantity", value, unit: "usd" })
const number = (min: number | null, max: number | null, dimension: string | null = null) => ({
  kind: "value",
  value: {
    type: "number",
    range: { min: min === null ? null : D.exact(min), max: max === null ? null : D.exact(max) },
    dimension
  }
})
const day = (value: string) => ({
  kind: "value",
  value: { type: "date", range: V.point(D.integer(Date.parse(value) / 86_400_000)) }
})

// The examples plus a pet's weight, for aggregates over a list.
const withWeights = {
  ...examples,
  terms: [
    ...examples.terms,
    storedTerm({
      key: "pet.weight",
      organizationId: "org-sample",
      kind: "property",
      of: "pet",
      valueType: { type: "quantity", unit: "pound" },
      ifUnstated: "unknown",
      labels: [{ text: "weight", role: "preferred" }]
    }),
    storedTerm({
      key: "pound",
      organizationId: "org-sample",
      kind: "unit",
      dimension: "weight",
      perBase: "1",
      labels: [{ text: "lb", role: "preferred" }]
    })
  ]
}

const pets = (facts: ReturnType<typeof fact>[], isComplete: boolean) =>
  exampleContext(
    {
      type: "violation",
      extra: [entity("pet-1", "pet"), entity("pet-2", "pet"), entity("pet-3", "pet")],
      facts: [
        fact("lot", "lot.pets", reference("pet-1")),
        fact("lot", "lot.pets", reference("pet-2")),
        { ...fact("lot", "lot.pets", reference("pet-3")), complete: isComplete },
        ...facts
      ]
    },
    {},
    withWeights
  )

describe("constants and references", () => {
  it("converts quantities to their dimension's base: 6 feet are 72 inches", () => {
    const context = exampleContext()
    // The base is the millimeter, so every unit converts exactly; what matters is that the two agree.
    expect(evaluateOperand(context, scope("lot"), { type: "quantity", value: 6, unit: "foot" })).toEqual(
      evaluateOperand(context, scope("lot"), { type: "quantity", value: 72, unit: "inch" })
    )
    expect(evaluateOperand(context, scope("lot"), { type: "quantity", value: 6, unit: "furlong" })).toEqual(V.unknown)
    expect(evaluateOperand(context, scope("lot"), { type: "fraction", numerator: 2, denominator: 3 })).toEqual({
      kind: "value",
      value: { type: "number", range: V.point(D.fraction(2, 3)), dimension: null }
    })
    expect(evaluateOperand(context, scope("lot"), { type: "value", term: "committee" })).toEqual({
      kind: "value",
      value: { type: "term", term: "committee", text: "Reviewer" }
    })
    expect(evaluateOperand(context, scope("lot"), { type: "time", value: "02:00" })).toEqual({
      kind: "value",
      value: { type: "time", minutes: 120 }
    })
    expect(evaluateOperand(context, scope("lot"), { type: "governing-date" })).toEqual(day("2026-02-03"))
    expect(evaluateOperand(context, scope("lot"), { type: "boolean", value: false })).toEqual({
      kind: "value",
      value: { type: "boolean", value: false }
    })
  })

  it("makes an unknown quantity a range from 0, an absent one 0, and an unknown date any date", () => {
    const context = exampleContext({ extra: [entity("run-1", "fence-run")] })
    expect(evaluateOperand(context, scope("run-1"), ref("fence-run.height"))).toEqual(number(0, null, "length"))
    expect(evaluateOperand(context, scope("run-1"), ref("fence-run.lattice-height"))).toEqual(number(0, 0, "length"))
    expect(evaluateOperand(context, scope("run-1"), ref("fence-run.installed-on"))).toEqual({
      kind: "value",
      value: { type: "date", range: V.anyRange }
    })
    expect(evaluateOperand(context, scope("run-1"), ref("fence-run.material"))).toEqual(V.unknown)
    expect(evaluateOperand(context, scope("lot"), community("community.lot-count"))).toEqual(number(0, null))
  })

  it("keeps an absent date absent", () => {
    const context = exampleContext({
      extra: [entity("run-1", "fence-run")],
      facts: [fact("run-1", "fence-run.installed-on", null, "absent")]
    })
    expect(evaluateOperand(context, scope("run-1"), ref("fence-run.installed-on"))).toEqual(V.absent)
  })
})

describe("arithmetic carries ranges (schema.md, Expressions 4 and 7)", () => {
  it("adds a stated height and an unclear lattice into a range", () => {
    const context = exampleContext({
      extra: [entity("run-1", "fence-run")],
      facts: [
        fact("run-1", "fence-run.height", quantity(95)),
        fact("run-1", "fence-run.lattice-height", quantity(12), "uncertain")
      ]
    })
    const sum: Operand = { type: "sum", of: [ref("fence-run.height"), ref("fence-run.lattice-height")] }
    // 95 inches is 2,413 millimeters, the base; the unclear lattice leaves the top open.
    expect(evaluateOperand(context, scope("run-1"), sum)).toEqual(number(2413, null, "length"))
  })

  it("takes the greater of $25 and a tenth of the balance", () => {
    const lateFee: Operand = {
      type: "greatest",
      of: [
        usd(25),
        {
          type: "product",
          of: [
            { type: "fraction", numerator: 1, denominator: 10 },
            { type: "ref", from: "request", path: ["assessment.unpaid-balance"] }
          ]
        }
      ]
    }
    const stated = exampleContext({
      type: "assessment",
      facts: [fact("request", "assessment.unpaid-balance", quantity(400, "usd"))]
    })
    expect(evaluateOperand(stated, scope("request"), lateFee)).toEqual(number(40, 40, "money"))
    expect(evaluateOperand(exampleContext({ type: "assessment" }), scope("request"), lateFee)).toEqual(
      number(25, null, "money")
    )
  })

  it("divides counts into a ratio, and quantities of one dimension into a number", () => {
    const context = exampleContext({
      type: "lease-registration",
      facts: [
        fact("community", "community.leased-lots", { type: "number", value: 19 }),
        fact("community", "community.lot-count", { type: "number", value: 100 })
      ]
    })
    const share: Operand = {
      type: "quotient",
      of: [
        { type: "sum", of: [community("community.leased-lots"), { type: "number", value: 1 }] },
        community("community.lot-count")
      ]
    }
    expect(evaluateOperand(context, scope("request"), share)).toEqual({
      kind: "value",
      value: { type: "number", range: V.point(D.fraction(1, 5)), dimension: null }
    })
    const feet: Operand = { type: "quotient", of: [usd(10), usd(4)] }
    expect(evaluateOperand(context, scope("request"), feet)).toEqual(number(2.5, 2.5))
    const difference: Operand = { type: "difference", of: [usd(10), usd(4)] }
    expect(evaluateOperand(context, scope("request"), difference)).toEqual(number(6, 6, "money"))
    expect(
      evaluateOperand(context, scope("request"), { type: "product", of: [{ type: "value", term: "board" }, usd(4)] })
    ).toEqual(V.unknown)
    expect(
      evaluateOperand(context, scope("request"), { type: "sum", of: [{ type: "value", term: "board" }, usd(4)] })
    ).toEqual(V.unknown)
  })

  it("takes the earlier or later of dates, and an absent date makes either absent", () => {
    const context = exampleContext({
      extra: [entity("run-1", "fence-run")],
      facts: [fact("run-1", "fence-run.installed-on", null, "absent")]
    })
    const dates: Operand[] = [
      { type: "date", value: "2026-02-03" },
      { type: "date", value: "2026-01-05" }
    ]
    expect(evaluateOperand(context, scope("run-1"), { type: "least", of: dates })).toEqual(day("2026-01-05"))
    expect(evaluateOperand(context, scope("run-1"), { type: "greatest", of: dates })).toEqual(day("2026-02-03"))
    expect(
      evaluateOperand(context, scope("run-1"), { type: "least", of: [...dates, ref("fence-run.installed-on")] })
    ).toEqual(V.absent)
    expect(evaluateOperand(context, scope("run-1"), { type: "sum", of: dates })).toEqual(V.unknown)
  })

  it("shifts dates by days, business days, months and years", () => {
    const context = exampleContext({
      type: "nomination",
      facts: [fact("request", "nomination.ownership-start", date("2025-01-31"))]
    })
    const shift = (value: number, unit: string): Operand => ({
      type: "shift",
      of: { type: "ref", from: "request", path: ["nomination.ownership-start"] },
      by: { value, unit }
    })
    expect(evaluateOperand(context, scope("request"), shift(12, "month"))).toEqual(day("2026-01-31"))
    expect(evaluateOperand(context, scope("request"), shift(1, "month"))).toEqual(day("2025-02-28"))
    expect(evaluateOperand(context, scope("request"), shift(1, "year"))).toEqual(day("2026-01-31"))
    expect(evaluateOperand(context, scope("request"), shift(3, "calendar-day"))).toEqual(day("2025-02-03"))
    expect(evaluateOperand(context, scope("request"), shift(1, "business-day"))).toEqual(day("2025-02-03"))
    expect(evaluateOperand(context, scope("request"), shift(1, "usd"))).toEqual(V.unknown)
    expect(
      evaluateOperand(context, scope("request"), { type: "shift", of: usd(1), by: { value: 1, unit: "month" } })
    ).toEqual(V.unknown)
    const unknownStart = exampleContext({ type: "nomination" })
    expect(evaluateOperand(unknownStart, scope("request"), shift(12, "month"))).toEqual({
      kind: "value",
      value: { type: "date", range: V.anyRange }
    })
  })
})

describe("aggregates over a list (schema.md, Expressions 5)", () => {
  const dogsAndCats: Operand = {
    type: "count",
    path: ["lot.pets"],
    where: {
      type: "in",
      left: ref("pet.species"),
      values: [
        { type: "value", term: "species.dog" },
        { type: "value", term: "species.cat" }
      ]
    }
  }
  const species = [fact("pet-1", "pet.species", term("species.dog")), fact("pet-2", "pet.species", term("species.cat"))]

  it("counts the items that satisfy where, an unclear one as maybe", () => {
    expect(evaluateOperand(pets(species, true), scope("lot"), dogsAndCats)).toEqual(number(2, 3))
    expect(
      evaluateOperand(
        pets([...species, fact("pet-3", "pet.species", term("species.dog"))], true),
        scope("lot"),
        dogsAndCats
      )
    ).toEqual(number(3, 3))
  })

  it("leaves an incomplete list open-ended", () => {
    expect(evaluateOperand(pets(species, false), scope("lot"), dogsAndCats)).toEqual(number(2, null))
    expect(evaluateOperand(exampleContext(), scope("lot"), dogsAndCats)).toEqual(number(0, null))
  })

  it("sums, and takes the greatest and least of, a value over the items", () => {
    const weights = [
      fact("pet-1", "pet.weight", quantity(10, "pound")),
      fact("pet-2", "pet.weight", quantity(30, "pound")),
      fact("pet-3", "pet.weight", quantity(20, "pound"))
    ]
    const over = (
      type: "sum-of" | "greatest-of" | "least-of",
      where: Operand | null = null
    ): Extract<Operand, { type: "sum-of" | "greatest-of" | "least-of" }> => ({
      type,
      path: ["lot.pets"],
      value: ["pet.weight"],
      where: where && { type: "compare", left: ref("pet.weight"), op: ">", right: where }
    })
    const context = pets(weights, true)
    // Pounds in the weight base (the milligram): 1 pound is 453,592.37 mg exactly.
    const mg = (pounds: number) => pounds * 453592.37
    const lb = (min: number, max: number | null) => number(mg(min), max === null ? null : mg(max), "weight")
    expect(evaluateOperand(context, scope("lot"), over("sum-of"))).toEqual(lb(60, 60))
    expect(evaluateOperand(context, scope("lot"), over("greatest-of"))).toEqual(lb(30, 30))
    expect(evaluateOperand(context, scope("lot"), over("least-of"))).toEqual(lb(10, 10))
    expect(
      evaluateOperand(context, scope("lot"), over("sum-of", { type: "quantity", value: 15, unit: "pound" }))
    ).toEqual(lb(50, 50))
    expect(
      evaluateOperand(context, scope("lot"), over("greatest-of", { type: "quantity", value: 99, unit: "pound" }))
    ).toEqual(V.absent)
    const open = pets(weights, false)
    expect(evaluateOperand(open, scope("lot"), over("greatest-of"))).toEqual(lb(30, null))
    expect(evaluateOperand(open, scope("lot"), over("least-of"))).toEqual(number(null, mg(10), "weight"))
    expect(
      evaluateOperand(
        pets([], false),
        scope("lot"),
        over("greatest-of", { type: "quantity", value: 99, unit: "pound" })
      )
    ).toEqual(lb(0, null))
    expect(evaluateOperand(pets([], true), scope("lot"), { ...over("sum-of"), value: ["pet.species"] })).toEqual(
      V.unknown
    )
    expect(evaluateOperand(pets([], true), scope("lot"), { ...over("sum-of"), path: [] })).toEqual(V.unknown)
  })
})
