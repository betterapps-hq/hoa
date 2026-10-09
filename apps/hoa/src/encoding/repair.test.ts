import { describe, expect, it } from "vitest"
import {
  draftDocuments,
  draftProvisions,
  firstDraft,
  heightRule,
  parsedDraft,
  secondDraft,
  vocabulary
} from "@/tests/encodingDrafts"
import { decideRepair, groupByUnit, keysDefinedElsewhere, verifyUnit, type UnitProblem } from "./repair"

const context = { organizationId: "org-1", documents: draftDocuments, provisions: draftProvisions, vocabulary }
const firstUnit = ["declaration:4.1", "rules:1"]

describe("verifyUnit", () => {
  it("passes a draft whose references resolve and whose provisions are covered", () => {
    expect(verifyUnit(firstDraft, firstUnit, context)).toMatchObject({ problems: [] })
  })

  it("reports Zod problems with their paths in the draft", () => {
    const { title: _title, ...untitled } = heightRule("rules:1#max-height", "rules:1")
    const { draft, problems } = verifyUnit({ ...firstDraft, rules: [untitled] }, firstUnit, context)
    expect(draft).toBeNull()
    expect(problems).toEqual([
      { source: "zod", code: "invalid_type", message: expect.any(String), path: ["rules", 0, "title"], reference: null }
    ])
  })

  it("reports validator problems at their paths in the draft, with the terms they miss", () => {
    const gazebo = { ...heightRule("rules:1#gazebo", "rules:1"), appliesTo: "gazebo" }
    const { problems } = verifyUnit({ ...firstDraft, rules: [firstDraft.rules?.[0], gazebo] }, firstUnit, context)
    expect(problems).toEqual([
      {
        source: "validator",
        code: "undefined-term",
        message: "rules:1#gazebo: gazebo isn't a term",
        path: ["rules", 1, "appliesTo"],
        reference: "gazebo"
      }
    ])
  })

  it("reports an uncovered provision of the unit (a term's citation covers rules:1), but not one outside it", () => {
    const { problems } = verifyUnit({ ...firstDraft, rules: [], clauses: {} }, firstUnit, context)
    expect(problems.map((problem) => [problem.code, problem.path])).toEqual([["coverage", ["provisions", 0, "noRule"]]])
  })
})

describe("groupByUnit", () => {
  it("puts the merged rulebook's issues back on the units' drafts", () => {
    const drafts = new Map([
      ["unit-1", parsedDraft(firstDraft)],
      ["unit-2", parsedDraft(secondDraft)]
    ])
    const sources = new Map([
      ["rules:2(a)#max-height", [{ unitId: "unit-2", path: ["rules", 1] }]],
      ["settings", [{ unitId: "unit-1", path: [] }]]
    ])
    const grouped = groupByUnit(
      [
        {
          code: "undefined-term",
          message: "shed isn't a term",
          recordKey: "rules:2(a)#max-height",
          path: ["appliesTo"]
        },
        {
          code: "type-mismatch",
          message: "isn't a party",
          recordKey: "settings",
          path: ["clauses", "deciders", 0, "party"]
        },
        { code: "coverage", message: "nothing cites it", recordKey: "rules:3", path: ["noRule"] }
      ],
      sources,
      drafts
    )
    expect(grouped.get("unit-2")).toEqual([
      {
        source: "validator",
        code: "undefined-term",
        message: "rules:2(a)#max-height: shed isn't a term",
        path: ["rules", 1, "appliesTo"],
        reference: "shed"
      }
    ])
    expect(grouped.get("unit-1")?.[0]?.path).toEqual(["clauses", "deciders", 0, "party"])
  })
})

describe("decideRepair", () => {
  const missing = (term: string): UnitProblem => ({
    source: "validator",
    code: "undefined-term",
    message: `${term} isn't a term`,
    path: [],
    reference: term
  })

  it("waits for the merge when every problem is a term another unit defines", () => {
    expect(decideRepair([], new Set())).toBe("none")
    expect(decideRepair([missing("garden-shed")], new Set(["garden-shed"]))).toBe("after-merge")
    expect(decideRepair([missing("gazebo")], new Set(["garden-shed"]))).toBe("repair")
    expect(
      decideRepair(
        [missing("garden-shed"), { ...missing("x"), code: "invariant", reference: null }],
        new Set(["garden-shed"])
      )
    ).toBe("repair")
  })

  it("knows which terms and rules the other units define", () => {
    const drafts = new Map([
      ["unit-1", parsedDraft(firstDraft)],
      ["unit-2", parsedDraft(secondDraft)]
    ])
    expect([...keysDefinedElsewhere("unit-1", drafts)]).toEqual([
      "shed",
      "garden-shed",
      "rules:1#max-height",
      "rules:2(a)#max-height"
    ])
  })
})
