import { describe, expect, it } from "vitest"
import { createVocabulary } from "@/schema/vocabulary"
import { comparisonFileName, comparisonIndex, provisionGroups, ruleComparison, termComparison } from "./compare"
import { exampleRun, golden, goldenRule, inSplit, relabeledManufacturer } from "./pair.test-data"
import { splitRules } from "./score"
import { alignTerms, unmatchedTermGroups } from "./terms"

const maxHeight = goldenRule("guidelines:5.5.1(i)#max-height")
const colors = goldenRule("guidelines:5.4.2(i)#colors")

describe("provisionGroups", () => {
  it("groups both sides' rules by main citation, in key order", () => {
    const ours = { ...maxHeight, key: "guidelines:5.5.1(i)#height" }
    const groups = provisionGroups([maxHeight, colors], [ours, { ...maxHeight, key: "guidelines:5.5.1(i)#extra" }])
    expect(groups.map((group) => [group.provisionKey, group.reference.length, group.pipeline.length])).toEqual([
      ["guidelines:5.4.2(i)", 1, 0],
      ["guidelines:5.5.1(i)", 1, 2]
    ])
  })
})

describe("comparisonFileName", () => {
  it("keeps a provision key readable in a path", () => {
    expect(comparisonFileName("declaration:4.3(a)/p2")).toBe("rules/declaration~4.3(a)~p2.md")
  })
})

describe("ruleComparison", () => {
  const { draft, scores } = exampleRun()
  const groups = provisionGroups(splitRules(golden, inSplit), draft.rules)
  const vocabulary = createVocabulary([...golden.terms])
  const compare = (provisionKey: string) => {
    const group = groups.find((item) => item.provisionKey === provisionKey)
    if (!group) {
      throw new Error(`No group ${provisionKey}`)
    }
    return ruleComparison(group, {
      provisions: new Map(golden.provisions.map((provision) => [provision.key, provision])),
      vocabularies: { reference: vocabulary, pipeline: vocabulary },
      details: scores.details
    })
  }

  it("shows the text and both sides' rules as sentences and JSON", () => {
    const text = compare("guidelines:5.5.1(ii)")
    expect(text).toContain("[guidelines:5.5.1(ii)]")
    expect(text).toMatch(/## Golden rules \(1\)\n\n### guidelines:5\.5\.1\(ii\)#fence-and-lattice\n\n.+\n\n```json\n\{/)
    expect(text).not.toContain("provenance")
    expect(text).toContain("## Pipeline rules (0)\n\nNone.")
    expect(text).toContain("Golden rules without a pair:\n\n- guidelines:5.5.1(ii)#fence-and-lattice")
  })

  it("says what code found about each pair", () => {
    const text = compare("guidelines:5.5.2")
    expect(text).toContain(
      "- guidelines:5.5.2#metal-height = guidelines:5.5.2#metal-limit (pairs.json); modality differs: golden norm obligation, pipeline norm prohibition; checks agree in"
    )
    expect(compare("guidelines:5.5.1(i)")).toContain(
      "- guidelines:5.5.1(i)#max-height = guidelines:5.5.1(i)#max-height (same key); same modality"
    )
  })

  it("indexes every provision's file with its counts", () => {
    const index = comparisonIndex("run-1", groups, scores.details)
    expect(index).toContain("| [guidelines:5.5.2](<rules/guidelines~5.5.2.md>) | 2 | 1 | 1 | 0 |")
    expect(index).toContain("[terms.md](terms.md)")
  })
})

describe("termComparison", () => {
  it("lists the golden terms nothing matches with their candidates, then those with none", () => {
    const pipeline = relabeledManufacturer()
    const groups = unmatchedTermGroups(
      golden.terms,
      pipeline,
      alignTerms(golden.terms, pipeline),
      new Set(["fence-run.manufacturer"])
    )
    const text = termComparison(groups, ["fence-run.manufacturer", "gate"])
    expect(text).toContain("## property terms of fence-run (pipeline fence-run)")
    expect(text).toMatch(/Golden:\n\n- `fence-run\.manufacturer` \{/)
    expect(text).toContain("trade name of the maker")
    expect(text).toContain("## Golden terms with no candidate (1)")
    expect(text).toContain("- gate")
  })
})
