import { describe, expect, it } from "vitest"
import {
  draftDocuments,
  draftProvisions,
  firstDraft,
  parsedDraft,
  provision,
  secondDraft,
  vocabulary
} from "@/tests/encodingDrafts"
import { findTermCandidates } from "./definedTerms"
import { mergeDrafts } from "./merge"
import { planUnits } from "./plan"
import {
  encodingRepairVariables,
  provisionEncodingVariables,
  rulebookConsolidationVariables,
  termExtractionVariables
} from "./promptVariables"

const [declaration, rules] = draftDocuments
const documents = draftDocuments.map((document) => ({
  key: document.key,
  provisions: draftProvisions.filter((provision) => provision.key.startsWith(`${document.key}:`))
}))
const units = planUnits({
  documents,
  references: new Map([["rules:2(a)", ["rules:1", "declaration:4.1"]]]),
  vocabulary
})
const rulesUnit = units.find((unit) => unit.id === "rules:2")

describe("prompt variables", () => {
  it("serializes a unit for hoa-provision-encoding", () => {
    expect(rulesUnit && rules && provisionEncodingVariables(rulesUnit, rules)).toMatchSnapshot()
  })

  it("serializes the same unit the same way every time", () => {
    const again = planUnits({
      documents,
      references: new Map([["rules:2(a)", ["declaration:4.1", "rules:1"]]]),
      vocabulary
    })
    const unit = again.find((item) => item.id === "rules:2")
    expect(unit && rules && provisionEncodingVariables(unit, rules).terms).toBe(
      rulesUnit && rules && provisionEncodingVariables(rulesUnit, rules).terms
    )
  })

  it("serializes a draft and its problems for hoa-encoding-repair", () => {
    const problems = [
      {
        source: "validator" as const,
        code: "undefined-term",
        message: "rules:1#max-height: gazebo isn't a term",
        path: ["rules", 1, "appliesTo"],
        term: "gazebo"
      },
      { source: "zod" as const, code: "invalid_type", message: "Required", path: [], term: null }
    ]
    expect(encodingRepairVariables(parsedDraft(firstDraft), problems, vocabulary)).toMatchSnapshot()
  })

  it("serializes definitions and candidates for hoa-term-extraction", () => {
    const definitions = [
      {
        ...provision("declaration:2.1", null, '"Shed" or "Outbuilding": A building for storage.'),
        kind: "definition" as const
      }
    ]
    const usage = ["paint", "roof", "trim"].map((part, i) =>
      provision(`declaration:3.${i + 1}`, null, `Owners pick ${part} colors from the Color Guide.`)
    )
    const candidates = findTermCandidates([...definitions, ...usage])
    expect(declaration && termExtractionVariables(declaration, definitions, candidates)).toMatchSnapshot()
  })

  it("serializes summaries, term pairs and documents for hoa-rulebook-consolidation", () => {
    const merged = mergeDrafts({
      organizationId: "org-1",
      documents: draftDocuments,
      provisions: draftProvisions,
      vocabulary,
      units: [
        { unitId: "unit-1", draft: parsedDraft(firstDraft) },
        { unitId: "unit-2", draft: parsedDraft(secondDraft) }
      ]
    })
    const { rulebook, termPairs } = merged
    expect(
      rulebookConsolidationVariables(rulebook.rules, rulebook.terms, termPairs, rulebook.documents)
    ).toMatchSnapshot()
  })
})
