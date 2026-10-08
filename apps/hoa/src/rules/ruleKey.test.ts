import { describe, expect, it } from "vitest"
import { fenceRules } from "@/tests/fenceRulebook"
import { assignUniqueKeys, generateRuleKey, slugify } from "./ruleKey"

const byId = (id: string) => fenceRules.find((rule) => rule.id === id)!

describe("generateRuleKey", () => {
  it("builds the key from the check's subject and sorted conditions", () => {
    expect(byId("max-height").ruleKey).toBe(
      "fence:segment:range:segment.height:segment.location in rear|return|side&segment.material in composite|wood"
    )
    expect(byId("composite-colors").ruleKey).toBe(
      "fence:segment:allowed-values-by:segment.manufacturer>segment.color:segment.material equals composite"
    )
    expect(byId("posts").ruleKey).toBe("fence:segment:matches:segment.color=segment.postColor:")
    expect(byId("arbor-total").ruleKey).toBe(
      "fence:segment:range:segment.arborHeight+segment.height+segment.latticeHeight:segment.hasArbor equals true"
    )
    expect(byId("checklist").ruleKey).toBe("fence:project:required-document:checklist:")
    expect(byId("like-for-like").ruleKey).toBe(
      "fence:project:informational:like-for-like-replacement-still-needs-approval:"
    )
  })

  it("gives every sample rule its own key", () => {
    expect(new Set(fenceRules.map((rule) => rule.ruleKey)).size).toBe(fenceRules.length)
  })

  it("keys text conditions by their wording", () => {
    const key = generateRuleKey({
      projectTypes: ["fence"],
      appliesTo: "segment",
      title: "Visible",
      check: { type: "qualitative", criterion: "x" },
      appliesWhen: [{ type: "text", description: "Visible from the street!" }]
    })
    expect(key).toBe("fence:segment:qualitative:visible:visible-from-the-street")
  })
})

describe("assignUniqueKeys", () => {
  it("suffixes a duplicate with its section, and counts further duplicates", () => {
    const keys = assignUniqueKeys([
      { key: "a", section: "5.1" },
      { key: "a", section: "5.2" },
      { key: "a", section: "5.2" }
    ])
    expect(keys.map((item) => [item.key, item.isDuplicate])).toEqual([
      ["a", false],
      ["a#5.2", true],
      ["a#5.2-2", true]
    ])
  })
})

describe("slugify", () => {
  it("lowercases and joins words with hyphens", () => {
    expect(slugify("  Gate height, with an Arbor ")).toBe("gate-height-with-an-arbor")
  })
})
