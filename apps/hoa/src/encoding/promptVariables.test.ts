import { describe, expect, it } from "vitest"
import { draftDocuments, draftProvisions, vocabulary } from "@/tests/encodingDrafts"
import { planUnits } from "./plan"
import { termLines } from "./promptVariables"

const documents = draftDocuments.map((document) => ({
  key: document.key,
  provisions: draftProvisions.filter((provision) => provision.key.startsWith(`${document.key}:`))
}))
const unitsFor = (references: string[]) =>
  planUnits({ documents, references: new Map([["rules:2(a)", references]]), vocabulary })

describe("prompt variables", () => {
  it("serializes the same unit's vocabulary the same way every time", () => {
    const unit = unitsFor(["rules:1", "declaration:4.1"]).find((item) =>
      item.provisions.some((provision) => provision.key === "rules:2")
    )
    const again = unitsFor(["declaration:4.1", "rules:1"]).find((item) => item.id === unit?.id)
    expect(unit?.terms.length).toBeGreaterThan(0)
    expect(again && termLines(again.terms)).toBe(unit && termLines(unit.terms))
  })
})
