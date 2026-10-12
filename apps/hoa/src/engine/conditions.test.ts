import { describe, expect, it } from "vitest"
import { storedTerm } from "@/schema/exampleRulebook.test-data"
import type { Condition, Operand, RulesFile } from "@/schema/types"
import {
  date,
  dateTime,
  entity,
  exampleContext,
  examples,
  fact,
  no,
  quantity,
  reference,
  term,
  yes
} from "@/tests/engineContext"
import { approvalOf, evaluateCondition, isA } from "./conditions"
import type { Context } from "./context"

const ref = (...path: string[]): Operand => ({ type: "ref", path })
const val = (key: string): Operand => ({ type: "value", term: key })
const inches = (value: number): Operand => ({ type: "quantity", value, unit: "inch" })
const day = (value: string): Operand => ({ type: "date", value })
const compare = (left: Operand, op: "=" | "!=" | "<" | "<=" | ">" | ">=", right: Operand): Condition => ({
  type: "compare",
  left,
  op,
  right
})
const on = (id: string) => ({ subject: { type: "entity" as const, id } })
const holds = (context: Context, id: string, condition: Condition) => evaluateCondition(context, on(id), condition)

const fence = (...facts: ReturnType<typeof fact>[]) =>
  exampleContext({
    extra: [entity("run-1", "fence-run"), entity("run-2", "return-fence"), entity("gate-1", "gate")],
    facts
  })

describe("compare", () => {
  it("converts units before comparing: 72 inches are 6 feet", () => {
    const context = fence(fact("run-1", "fence-run.height", quantity(6, "foot")))
    expect(holds(context, "run-1", compare(ref("fence-run.height"), "=", inches(72)))).toBe(true)
    expect(holds(context, "run-1", compare(ref("fence-run.height"), "<=", inches(72)))).toBe(true)
    expect(holds(context, "run-1", compare(ref("fence-run.height"), "<", inches(72)))).toBe(false)
    expect(
      holds(context, "run-1", compare(ref("fence-run.height"), "=", { type: "quantity", value: 1, unit: "usd" }))
    ).toBeNull()
  })

  it("is unknown for an unknown height unless every height decides it", () => {
    const context = fence()
    expect(holds(context, "run-1", compare(ref("fence-run.height"), "<=", inches(72)))).toBeNull()
    expect(holds(context, "run-1", compare(ref("fence-run.height"), ">=", inches(0)))).toBe(true)
  })

  it("makes every comparison with an absent value false, except !=", () => {
    const context = fence(
      fact("run-1", "fence-run.installed-on", null, "absent"),
      fact("run-1", "fence-run.color", null, "absent")
    )
    expect(holds(context, "run-1", compare(ref("fence-run.installed-on"), "<", day("2025-11-12")))).toBe(false)
    expect(holds(context, "run-1", compare(ref("fence-run.installed-on"), ">=", day("2025-11-12")))).toBe(false)
    expect(holds(context, "run-1", compare(ref("fence-run.color"), "!=", val("composite-color.teak")))).toBe(true)
  })

  it("compares value terms exactly, parties through their categories, and text never", () => {
    const context = fence(
      fact("run-1", "fence-run.color", term("composite-color.teak")),
      fact("run-1", "fence-run.manufacturer", { type: "value", term: null, text: "Fiberon" })
    )
    expect(holds(context, "run-1", compare(ref("fence-run.color"), "=", val("composite-color.teak")))).toBe(true)
    expect(holds(context, "run-1", compare(ref("fence-run.color"), "!=", val("composite-color.saddle")))).toBe(true)
    expect(holds(context, "run-1", compare(ref("fence-run.color"), "<", val("composite-color.saddle")))).toBeNull()
    expect(
      holds(context, "run-1", compare(ref("fence-run.manufacturer"), "=", val("composite-manufacturer.trex")))
    ).toBe(false)
    expect(holds(context, "run-1", compare(val("neighbor"), "=", val("owner")))).toBe(true)
    expect(holds(context, "run-1", compare(val("board"), "=", val("owner")))).toBe(false)
  })

  it("compares booleans, references, times, and dates with date-times by day", () => {
    const context = fence(
      fact("gate-1", "gate.fence-run", reference("run-1")),
      fact("run-1", "fence-run.installed-on", date("2026-02-03"))
    )
    const gate = (condition: Condition) => holds(context, "gate-1", condition)
    expect(gate(compare({ type: "boolean", value: true }, "!=", { type: "boolean", value: false }))).toBe(true)
    expect(gate(compare({ type: "boolean", value: true }, "<", { type: "boolean", value: false }))).toBeNull()
    expect(gate(compare(ref("gate.fence-run"), "=", { type: "ref", from: "subject", path: ["gate.fence-run"] }))).toBe(
      true
    )
    expect(gate(compare({ type: "time", value: "02:00" }, "<", { type: "time", value: "05:00" }))).toBe(true)
    expect(gate(compare(ref("gate.fence-run", "fence-run.installed-on"), "=", { type: "governing-date" }))).toBe(true)
    expect(gate(compare({ type: "time", value: "02:00" }, "=", day("2026-02-03")))).toBeNull()
  })
})

describe("in, between and exists", () => {
  const withGreys: RulesFile = {
    ...examples,
    terms: [
      ...examples.terms,
      storedTerm({
        key: "composite-color.storm",
        kind: "value",
        set: "composite-color",
        broader: ["composite-color.winchester-grey"],
        labels: [{ text: "Storm", role: "preferred" }]
      })
    ]
  }

  it("puts a value under a listed broader value (Expressions 8)", () => {
    const context = exampleContext(
      {
        extra: [entity("run-1", "fence-run")],
        facts: [fact("run-1", "fence-run.color", term("composite-color.storm"))]
      },
      {},
      withGreys
    )
    const color = (...listed: string[]): Condition => ({
      type: "in",
      left: ref("fence-run.color"),
      values: listed.map(val)
    })
    expect(holds(context, "run-1", color("composite-color.winchester-grey"))).toBe(true)
    expect(holds(context, "run-1", color("composite-color.saddle", "composite-color.teak"))).toBe(false)
    expect(holds(fence(), "run-1", color("composite-color.saddle"))).toBeNull()
    expect(
      holds(fence(), "run-1", { type: "in", left: ref("fence-run.height"), values: [inches(72), inches(0)] })
    ).toBeNull()
  })

  it("takes between's bounds as inclusive or not", () => {
    const context = fence(fact("run-1", "fence-run.height", quantity(48)))
    const between = (includeMin: boolean): Condition => ({
      type: "between",
      left: ref("fence-run.height"),
      min: inches(48),
      max: inches(72),
      includeMin,
      includeMax: true
    })
    expect(holds(context, "run-1", between(true))).toBe(true)
    expect(holds(context, "run-1", between(false))).toBe(false)
  })

  it("is true when known, false when absent, unknown when unknown (Expressions 9)", () => {
    const context = fence(fact("run-1", "fence-run.color", term("composite-color.teak")))
    expect(holds(context, "run-1", { type: "exists", path: ["fence-run.color"] })).toBe(true)
    expect(holds(context, "run-1", { type: "exists", path: ["fence-run.lattice-height"] })).toBe(false)
    expect(holds(context, "run-1", { type: "exists", path: ["fence-run.height"] })).toBeNull()
    expect(holds(context, "lot", { type: "exists", path: ["lot.pets"] })).toBeNull()
    const pets = exampleContext({
      extra: [entity("pet-1", "pet")],
      facts: [fact("lot", "lot.pets", reference("pet-1"))]
    })
    expect(holds(pets, "lot", { type: "exists", path: ["lot.pets"] })).toBe(true)
    const none = exampleContext({ facts: [fact("lot", "lot.pets", null, "absent")] })
    expect(holds(none, "lot", { type: "exists", path: ["lot.pets"] })).toBe(false)
    expect(holds(none, "lot", { type: "exists", path: ["gate.fence-run", "lot.pets"] })).toBeNull()
  })
})

describe("categories", () => {
  it("decides membership by the category's criteria, or by an entity typed as the category", () => {
    const context = fence(
      fact("run-1", "fence-run.location", term("fence-location.return")),
      fact("gate-1", "gate.fence-run", reference("run-1"))
    )
    expect(isA(context, "run-1", "return-fence")).toBe(true)
    expect(isA(context, "run-2", "return-fence")).toBe(true)
    expect(isA(context, "run-2", "fence-run")).toBe(true)
    expect(isA(context, "run-1", "boundary-fence")).toBeNull()
    expect(isA(context, "gate-1", "return-fence")).toBe(false)
    expect(isA(context, "gate-1", "gate")).toBe(true)
    expect(isA(context, "nobody", "gate")).toBeNull()
    expect(holds(context, "gate-1", { type: "is-a", path: ["gate.fence-run"], category: "return-fence" })).toBe(true)
    expect(
      holds(fence(fact("gate-1", "gate.fence-run", null, "absent")), "gate-1", {
        type: "is-a",
        path: ["gate.fence-run"],
        category: "return-fence"
      })
    ).toBe(false)
    expect(holds(fence(), "gate-1", { type: "is-a", path: ["gate.fence-run"], category: "return-fence" })).toBeNull()
    expect(holds(context, "run-1", { type: "is-a", path: ["fence-run.location"], category: "return-fence" })).toBe(
      false
    )
  })
})

describe("approvals (Expressions 9)", () => {
  const approval = (id: string, facts: Partial<Record<"by" | "status" | "on" | "covers", string>>, written = true) => [
    fact(id, "approval.covers", reference(facts.covers ?? "run-1")),
    fact(id, "approval.by", term(facts.by ?? "committee")),
    fact(id, "approval.status", term(facts.status ?? "approval-status.approved")),
    fact(id, "approval.on", date(facts.on ?? "2026-01-10")),
    fact(id, "approval.written", written ? yes : no)
  ]
  const withApprovals = (...facts: ReturnType<typeof fact>[]) =>
    exampleContext({
      extra: [entity("run-1", "fence-run"), ...(facts.length > 0 ? [entity("approval-1", "approval")] : [])],
      facts
    })
  const test = { by: ["committee"], needs: "all" as const, prior: true, written: true }

  it("is satisfied by a written approval on or before the governing date", () => {
    expect(approvalOf(withApprovals(...approval("approval-1", {})), "run-1", test)).toEqual({
      satisfied: true,
      impossible: false
    })
    expect(approvalOf(withApprovals(...approval("approval-1", { on: "2026-03-01" })), "run-1", test).satisfied).toBe(
      false
    )
    expect(approvalOf(withApprovals(...approval("approval-1", {}, false)), "run-1", test).satisfied).toBe(false)
    expect(approvalOf(withApprovals(...approval("approval-1", { covers: "lot" })), "run-1", test).satisfied).toBe(false)
  })

  it("is false with no approval at all, and can't be satisfied once denied", () => {
    expect(approvalOf(withApprovals(), "run-1", test)).toEqual({ satisfied: false, impossible: false })
    const denied = withApprovals(...approval("approval-1", { status: "approval-status.denied" }))
    expect(approvalOf(denied, "run-1", test)).toEqual({ satisfied: false, impossible: true })
  })

  it("needs every party, or any one of them", () => {
    const either = { by: ["board", "committee"], needs: "any" as const, prior: false, written: false }
    const both = { ...either, needs: "all" as const }
    const committeeOnly = withApprovals(...approval("approval-1", {}))
    expect(approvalOf(committeeOnly, "run-1", either).satisfied).toBe(true)
    expect(approvalOf(committeeOnly, "run-1", both).satisfied).toBe(false)
    const oneDenied = withApprovals(...approval("approval-1", { by: "board", status: "approval-status.denied" }))
    expect(approvalOf(oneDenied, "run-1", either)).toEqual({ satisfied: false, impossible: false })
    expect(approvalOf(oneDenied, "run-1", both).impossible).toBe(true)
  })

  it("is unknown when an approval's facts are unclear", () => {
    const unclear = withApprovals(
      ...approval("approval-1", {}).map((found) =>
        found.property === "approval.covers" ? { ...found, state: "uncertain" as const } : found
      )
    )
    expect(approvalOf(unclear, "run-1", test).satisfied).toBeNull()
    expect(holds(unclear, "run-1", { type: "approved", path: [], ...test })).toBeNull()
    expect(holds(withApprovals(...approval("approval-1", {})), "run-1", { type: "approved", path: [], ...test })).toBe(
      true
    )
  })
})

describe("quantifiers (Expressions 3 and 5)", () => {
  const pets = (isComplete: boolean, ...facts: ReturnType<typeof fact>[]) =>
    exampleContext({
      type: "violation",
      extra: [entity("pet-1", "pet"), entity("pet-2", "pet")],
      facts: [
        fact("lot", "lot.pets", reference("pet-1")),
        { ...fact("lot", "lot.pets", reference("pet-2")), complete: isComplete },
        ...facts
      ]
    })
  const dog: Condition = compare(ref("pet.species"), "=", val("species.dog"))
  const quantified = (
    type: "every" | "some" | "none",
    where: Condition | null = null
  ): Extract<Condition, { type: "every" | "some" | "none" }> => ({
    type,
    path: ["lot.pets"],
    where,
    test: dog
  })

  it("applies all, any and not any to the items", () => {
    const dogs = pets(
      true,
      fact("pet-1", "pet.species", term("species.dog")),
      fact("pet-2", "pet.species", term("species.dog"))
    )
    expect(holds(dogs, "lot", quantified("every"))).toBe(true)
    expect(holds(dogs, "lot", quantified("some"))).toBe(true)
    expect(holds(dogs, "lot", quantified("none"))).toBe(false)
    const mixed = pets(
      true,
      fact("pet-1", "pet.species", term("species.dog")),
      fact("pet-2", "pet.species", term("species.cat"))
    )
    expect(holds(mixed, "lot", quantified("every"))).toBe(false)
    expect(
      holds(
        mixed,
        "lot",
        quantified("every", { type: "not", of: compare(ref("pet.species"), "=", val("species.cat")) })
      )
    ).toBe(true)
  })

  it("counts an item whose where is unknown as unknown, and keeps an incomplete list open", () => {
    const unclear = pets(true, fact("pet-1", "pet.species", term("species.cat")))
    expect(holds(unclear, "lot", quantified("some"))).toBeNull()
    expect(holds(unclear, "lot", quantified("some", { type: "exists", path: ["pet.species"] }))).toBeNull()
    const open = pets(
      false,
      fact("pet-1", "pet.species", term("species.dog")),
      fact("pet-2", "pet.species", term("species.dog"))
    )
    expect(holds(open, "lot", quantified("every"))).toBeNull()
    expect(holds(open, "lot", quantified("some"))).toBe(true)
    const openCats = pets(
      false,
      fact("pet-1", "pet.species", term("species.cat")),
      fact("pet-2", "pet.species", term("species.cat"))
    )
    expect(holds(openCats, "lot", quantified("none"))).toBeNull()
    expect(holds(exampleContext(), "lot", { ...quantified("some"), path: [] })).toBeNull()
  })

  it("quantifies over values that aren't things", () => {
    const parties: RulesFile = {
      ...examples,
      terms: [
        ...examples.terms,
        storedTerm({
          key: "community.owned-by",
          kind: "property",
          of: "community",
          valueType: { type: "party", among: null },
          many: true,
          ifUnstated: "unknown",
          labels: [{ text: "owned by", role: "preferred" }]
        })
      ]
    }
    const context = exampleContext(
      { facts: [{ ...fact("community", "community.owned-by", term("board")), complete: true }] },
      {},
      parties
    )
    const owners: Condition = {
      type: "some",
      from: "community",
      path: ["community.owned-by"],
      where: null,
      test: { type: "in", left: ref(), values: [val("board"), val("committee")] }
    }
    expect(holds(context, "lot", owners)).toBe(true)
  })
})

describe("time windows (Expressions 10)", () => {
  const parked = (start: string, end: string | null) =>
    exampleContext({
      type: "violation",
      extra: [entity("parking-1", "parking")],
      facts: [
        fact("parking-1", "parking.start", dateTime(start)),
        ...(end ? [fact("parking-1", "parking.end", dateTime(end))] : [])
      ]
    })
  const overnight = (match: "within" | "overlaps"): Condition => ({
    type: "during",
    start: ref("parking.start"),
    end: ref("parking.end"),
    window: { type: "daily", from: "02:00", to: "05:00" },
    match
  })

  // Chicago is six hours behind UTC in February.
  it("tells a span overlapping or within a daily window, in local time", () => {
    expect(holds(parked("2026-02-03T07:00:00Z", "2026-02-03T09:00:00Z"), "parking-1", overnight("overlaps"))).toBe(true)
    expect(holds(parked("2026-02-03T07:00:00Z", "2026-02-03T09:00:00Z"), "parking-1", overnight("within"))).toBe(false)
    expect(holds(parked("2026-02-03T09:00:00Z", "2026-02-03T10:00:00Z"), "parking-1", overnight("within"))).toBe(true)
    expect(holds(parked("2026-02-03T12:00:00Z", "2026-02-03T14:00:00Z"), "parking-1", overnight("overlaps"))).toBe(
      false
    )
  })

  it("treats an unknown end as a span that may run on", () => {
    expect(holds(parked("2026-02-03T09:00:00Z", null), "parking-1", overnight("overlaps"))).toBe(true)
    expect(holds(parked("2026-02-03T12:00:00Z", null), "parking-1", overnight("overlaps"))).toBeNull()
    expect(holds(parked("2026-02-03T09:00:00Z", null), "parking-1", overnight("within"))).toBeNull()
    expect(holds(parked("2026-02-03T12:00:00Z", null), "parking-1", overnight("within"))).toBe(false)
    const unknownStart = exampleContext({ type: "violation", extra: [entity("parking-1", "parking")] })
    expect(holds(unknownStart, "parking-1", overnight("overlaps"))).toBeNull()
  })

  it("wraps a daily window past midnight, and checks weekly and annual windows", () => {
    const late: Condition = {
      type: "during",
      start: ref("parking.start"),
      end: ref("parking.end"),
      window: { type: "daily", from: "22:00", to: "06:00" },
      match: "within"
    }
    expect(holds(parked("2026-02-04T05:00:00Z", "2026-02-04T09:00:00Z"), "parking-1", late)).toBe(true)
    const weekend = (from: string | null): Condition => ({
      ...late,
      window: { type: "weekly", days: ["sat", "sun"], from, to: null }
    })
    // February 7, 2026 is a Saturday.
    expect(holds(parked("2026-02-07T16:00:00Z", "2026-02-07T18:00:00Z"), "parking-1", weekend(null))).toBe(true)
    expect(holds(parked("2026-02-07T16:00:00Z", "2026-02-07T18:00:00Z"), "parking-1", weekend("12:00"))).toBe(false)
    const winter: Condition = {
      type: "during",
      start: day("2026-01-10"),
      end: day("2026-01-12"),
      window: { type: "annual", from: "11-15", to: "02-15" },
      match: "within"
    }
    expect(holds(exampleContext(), "lot", winter)).toBe(true)
    expect(holds(exampleContext(), "lot", { ...winter, window: { type: "annual", from: "03-01", to: "10-31" } })).toBe(
      false
    )
  })

  it("puts a window around each date of a schedule", () => {
    const weeklyPickup = (start: string, end: string) =>
      exampleContext({
        type: "violation",
        extra: [entity("bin-1", "curbside-placement")],
        facts: [
          fact("community", "community.trash-pickup", { type: "schedule", weekly: ["tue"], annual: [], every: null }),
          fact("bin-1", "curbside-placement.start", dateTime(start)),
          fact("bin-1", "curbside-placement.end", dateTime(end))
        ]
      })
    const rule = examples.rules.find((found) => found.key === "rules:5.1#trash-out")
    const test = rule?.kind === "norm" && rule.check?.type === "test" ? rule.check.test : null
    if (!test) {
      throw new Error("the trash example has a test")
    }
    // Pickup is Tuesday February 3: out from 18:00 Monday until 21:00 Tuesday.
    expect(holds(weeklyPickup("2026-02-03T01:00:00Z", "2026-02-04T02:00:00Z"), "bin-1", test)).toBe(true)
    expect(holds(weeklyPickup("2026-02-02T23:00:00Z", "2026-02-04T02:00:00Z"), "bin-1", test)).toBe(false)
    const noSchedule = exampleContext({
      type: "violation",
      extra: [entity("bin-1", "curbside-placement")],
      facts: [fact("bin-1", "curbside-placement.start", dateTime("2026-02-03T01:00:00Z"))]
    })
    expect(holds(noSchedule, "bin-1", test)).toBeNull()
  })
})

describe("text conditions (Expressions 13)", () => {
  it("are answered by the review pipeline, and unknown without an answer", () => {
    const text = "owns a lot that shares a boundary with the applicant's lot"
    const neighbor: Condition = { type: "text", text }
    const context = exampleContext(
      { extra: [entity("owner-2", "owner"), entity("owner-3", "owner")] },
      { conditionAnswers: [{ entity: "owner-2", text, holds: true }] }
    )
    expect(holds(context, "owner-2", neighbor)).toBe(true)
    expect(holds(context, "owner-3", neighbor)).toBeNull()
    expect(isA(context, "owner-2", "neighbor")).toBe(true)
    expect(
      evaluateCondition(context, { subject: { type: "value", value: { type: "boolean", value: true } } }, neighbor)
    ).toBeNull()
  })
})
