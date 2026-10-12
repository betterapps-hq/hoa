import { screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { createVocabulary } from "@/schema/vocabulary"
import { renderInWorkspace, ruleIn, sampleWithTermsApproved } from "@/tests/rulebookWorkspace"
import { RulePreview } from "./RulePreview"
import { factValue, previewInputs } from "./RulePreview.utils"

const records = sampleWithTermsApproved()
const leaseRule = ruleIn(records, "declaration:3.1(c)/p2#minimum-term")
const vocabulary = createVocabulary(records.terms)

describe("previewInputs", () => {
  it("asks for the facts the rule and the rules overriding it read", () => {
    const overriders = records.rules.filter(
      (rule) =>
        (rule.kind === "norm" || rule.kind === "discretion") &&
        Array.isArray(rule.overrides) &&
        rule.overrides.includes(leaseRule.key)
    )
    const { inputs } = previewInputs(leaseRule, vocabulary, overriders)
    expect(inputs.map((input) => input.id)).toEqual(["subject lease-registration.term", "lot lot.owned-by"])
  })

  it("reads typed text as facts of the property's type", () => {
    const term = vocabulary.get("lease-registration.term")
    if (term?.kind !== "property") {
      throw new Error("lease-registration.term is a core property.")
    }
    expect(factValue(term, "12", vocabulary)).toEqual({ type: "quantity", value: 12, unit: "month" })
    expect(factValue(term, "", vocabulary)).toBeNull()
    expect(factValue(term, "twelve", vocabulary)).toBeNull()
  })
})

describe("RulePreview", () => {
  it("evaluates the rule with the engine as facts are typed", async () => {
    const { user } = renderInWorkspace(<RulePreview rule={leaseRule} />, { records })
    const result = screen.getByRole("region", { name: "What the rule decides" })
    expect(within(result).getByText("Missing information")).toBeInTheDocument()
    await user.type(screen.getByRole("spinbutton", { name: "Lease term (months)" }), "12")
    await user.type(screen.getByLabelText("The lot’s owned by"), "Owner")
    await user.keyboard("{ArrowDown}{Enter}")
    expect(await within(result).findByText("Met")).toBeInTheDocument()
  })

  it("explains that permissions and sanctions act through other rules", () => {
    const sanction = records.rules.find((rule) => rule.kind === "sanction")
    if (!sanction) {
      throw new Error("The sample has sanctions.")
    }
    renderInWorkspace(<RulePreview rule={sanction} />, { records })
    expect(screen.getByText(/act through the rules they change/)).toBeInTheDocument()
  })
})
