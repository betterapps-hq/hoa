import { describe, expect, it } from "vitest"
import {
  draftDocuments,
  draftProvisions,
  firstDraft,
  parsedDraft,
  secondDraft,
  vocabulary
} from "@/tests/encodingDrafts"
import { applyConsolidation, candidateRulePairs, candidateTermPairs } from "./consolidate"
import { mergeDrafts } from "./merge"

const { rulebook } = mergeDrafts({
  organizationId: "org-1",
  documents: draftDocuments,
  provisions: draftProvisions,
  vocabulary,
  units: [
    { unitId: "unit-1", draft: parsedDraft(firstDraft) },
    { unitId: "unit-2", draft: parsedDraft(secondDraft) }
  ]
})
const findRule = (rules: typeof rulebook.rules, key: string) => rules.find((rule) => rule.key === key)

describe("candidate pairs", () => {
  it("pairs rules on the same subject that read alike", () => {
    expect(candidateRulePairs(rulebook.rules, rulebook.terms)).toEqual([
      { keys: ["rules:1#max-height", "rules:1#max-height-2"], score: 1 },
      { keys: ["rules:1#max-height", "rules:2(a)#max-height"], score: 1 },
      { keys: ["rules:1#max-height-2", "rules:2(a)#max-height"], score: 1 }
    ])
  })

  it("pairs terms of the same kind whose labels match", () => {
    expect(candidateTermPairs(rulebook.terms)).toEqual([
      { keys: ["shed", "garden-shed"], labels: ["shed", "Sheds"], score: 0.9 }
    ])
    expect(candidateTermPairs(vocabulary)).toEqual([])
  })
})

describe("applyConsolidation", () => {
  const applied = applyConsolidation(rulebook, {
    duplicates: [{ keep: "rules:1#max-height", drop: ["rules:1#max-height-2", "rules:2(a)#max-height"] }],
    overrides: [
      { rule: "declaration:4.1#sheds-allowed", overrides: ["rules:1#max-height"] },
      { rule: "rules:1#max-height", overrides: ["declaration:4.1#sheds-allowed"] }
    ],
    conflicts: [{ rules: ["rules:1#max-height", "declaration:4.1#sheds-allowed"], description: "Which applies?" }]
  })

  it("merges duplicates, keeping every citation and rewriting references to them", () => {
    expect(applied.rulebook.rules.map((rule) => rule.key)).toEqual([
      "declaration:4.1#sheds-allowed",
      "rules:1#max-height"
    ])
    const kept = findRule(applied.rulebook.rules, "rules:1#max-height")
    expect(kept?.citations.map((citation) => citation.provisionKey)).toEqual(["rules:1", "rules:2(a)"])
    expect(applied.rulebook.questions[0]?.about.rules).toEqual(["rules:1#max-height"])
    expect(applied.rulebook.questions[0]?.options[0]?.keeps).toEqual(["rules:1#max-height"])
  })

  it("adds overrides precedence allows and reports the others", () => {
    const allowed = findRule(applied.rulebook.rules, "declaration:4.1#sheds-allowed")
    expect(allowed?.kind === "norm" && allowed.overrides).toEqual(["rules:1#max-height"])
    expect(applied.problems).toEqual([
      {
        code: "override-not-allowed",
        recordKey: "rules:1#max-height",
        message: "rules:1#max-height's document ranks below declaration:4.1#sheds-allowed's, so it can't override it"
      }
    ])
  })

  it("turns conflicts into questions with an option per rule", () => {
    expect(applied.rulebook.questions[1]).toEqual({
      id: "conflict-1",
      kind: "conflict",
      question: "Which applies?",
      citations: [
        { provisionKey: "rules:1", highlight: null, region: null },
        { provisionKey: "declaration:4.1", highlight: null, region: null }
      ],
      about: { rules: ["rules:1#max-height", "declaration:4.1#sheds-allowed"], terms: [] },
      options: [
        { label: "Shed height", keeps: ["rules:1#max-height"] },
        { label: "Sheds allowed", keeps: ["declaration:4.1#sheds-allowed"] }
      ],
      answer: null
    })
  })

  it("verifies again and leaves the merged rulebook as it was", () => {
    expect(applied.issues.map((issue) => issue.recordKey)).toEqual(["rules:2", "rules:3"])
    expect(rulebook.rules).toHaveLength(4)
  })

  it("reports what the answer names but the rulebook doesn't hold", () => {
    const result = applyConsolidation(rulebook, {
      duplicates: [{ keep: "rules:9#x", drop: [] }],
      overrides: [
        { rule: "rules:9#x", overrides: [] },
        { rule: "declaration:4.1#sheds-allowed", overrides: ["rules:9#y"] },
        { rule: "rules:1#max-height", overrides: [] }
      ]
    })
    expect(result.problems.map((problem) => problem.code)).toEqual([
      "undefined-rule",
      "undefined-rule",
      "undefined-rule"
    ])
  })
})
