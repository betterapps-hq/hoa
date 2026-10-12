import { describe, expect, it } from "vitest"
import { syntheticPages } from "@/tests/syntheticDeclaration"
import { checkStructure } from "./check"
import { cleanPages } from "./clean"
import { structureRepairVariables } from "./promptVariables"
import { structureDocument } from "./provisions"
import { applyMarkers, cleanText, isBetter, parserOutline, repairStructure } from "./structureRepair"

const options = { documentKey: "declaration", fileId: "file-1" }

/** A one-page document whose section 1.2 starts mid-line, so the parser reads it as 1.1's text. */
function runOnPage() {
  const [page] = syntheticPages()
  if (!page) {
    throw new Error("The synthetic declaration has pages.")
  }
  const text = [
    "## Article 1 General",
    "",
    "### 1.1 First",
    "",
    "Owners keep their lots tidy. 1.2 Second. Owners mow their lawns weekly.",
    "",
    "### 1.3 Third",
    "",
    "Owners trim their hedges."
  ].join("\n")
  return cleanPages([{ ...page, pageIndex: 1, text, normalizedText: text.toLowerCase(), header: null }])
}

describe("structure repair", () => {
  it("shows the model the text with the parser's outline and problems", () => {
    const clean = runOnPage()
    const documents = structureDocument(clean, options)
    const check = checkStructure(clean, documents)
    expect(check.needsRepair).toBe(true)
    const variables = structureRepairVariables("Declaration", clean, documents, check)
    expect(variables.pageText).toBe(cleanText(clean).text)
    expect(variables.parserOutline.split("\n")).toEqual([
      '0 "1" level 1 (declaration:article-1)',
      '19 "1.1" level 2 (declaration:1.1)',
      '103 "1.3" level 2 (declaration:1.3)'
    ])
    expect(variables.problems).toContain("[broken-sequence]")
    expect(parserOutline(clean, documents)).toBe(variables.parserOutline)
  })

  it("starts a provision at each marker the model proposes, and keeps the repair when it checks better", () => {
    const clean = runOnPage()
    const documents = structureDocument(clean, options)
    const check = checkStructure(clean, documents)
    const { text } = cleanText(clean)
    const offset = text.indexOf("1.2 Second")
    const repaired = repairStructure(clean, options, { documents, check }, [{ offset, marker: "1.2", level: 2 }])
    expect(repaired.isRepaired).toBe(true)
    expect(repaired.check.needsRepair).toBe(false)
    expect(repaired.documents[0]?.provisions.map((provision) => provision.label)).toEqual(
      expect.arrayContaining(["1.1", "1.2", "1.3"])
    )
  })

  it("keeps the parser's structure when the model's outline doesn't help", () => {
    const clean = runOnPage()
    const documents = structureDocument(clean, options)
    const check = checkStructure(clean, documents)
    expect(repairStructure(clean, options, { documents, check }, [])).toMatchObject({ isRepaired: false, documents })
  })

  it("splits a line's page pieces where a marker starts", () => {
    const clean = runOnPage()
    const { text, offsets } = cleanText(clean)
    const offset = text.indexOf("1.2 Second")
    const index = offsets.findLastIndex((start) => start <= offset)
    const split = applyMarkers(clean, [{ offset, marker: "1.2", level: 2 }])
    const line = clean.lines[index]
    const [before, blank, after] = split.lines.slice(index, index + 3)
    expect(before?.text).toBe("Owners keep their lots tidy.")
    expect(blank?.text).toBe("")
    expect(after?.text.startsWith("1.2 Second")).toBe(true)
    expect(after?.pieces[0]?.start).toBe((line?.pieces[0]?.start ?? 0) + (offset - (offsets[index] ?? 0)))
  })

  it("ranks checks: no repair needed, then fewer problems, then less text outside", () => {
    const base = { outside: 0.01, problems: [], needsRepair: false }
    const problem = { code: "broken-sequence" as const, message: "", key: null }
    expect(isBetter(base, { ...base, needsRepair: true })).toBe(true)
    expect(isBetter({ ...base, problems: [problem] }, base)).toBe(false)
    expect(isBetter({ ...base, outside: 0 }, base)).toBe(true)
  })
})
