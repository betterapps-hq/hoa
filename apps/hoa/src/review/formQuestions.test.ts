import { describe, expect, it } from "vitest"
import { citedProvisions, withAnswersPage, withFormQuestions } from "@/projectTypes/answers"
import type { ProjectField, ProjectTypeDefinition } from "@/projectTypes/projectType"
import { limitsListed, permitsListed, widgetProvisions, widgetRulesFile } from "@/tests/widgetRulebook"
import { planFacts } from "./factPlan"
import { selectRules } from "./select"

// A question's citations are what its answer is checked against (application-review.md, Project types): the rules
// citing a question's passages are selected whatever the request's entities, the facts stage is told which form
// questions to read their details from, and the answers page names the passages, all over a synthetic rulebook.

const question: ProjectField = {
  kind: "text",
  property: "custom.how-it-looks",
  binding: null,
  label: "How will it look?",
  help: "Describe its surface.",
  example: null,
  isRequired: false,
  answeredBy: "applicant",
  citations: [widgetProvisions[1]]
}
const definition: ProjectTypeDefinition = {
  subjects: [],
  groups: [
    {
      subject: "work",
      label: "The project",
      itemLabel: "The project",
      help: null,
      isRepeatable: false,
      fields: [question]
    }
  ],
  documents: [],
  formDocuments: [],
  unasked: []
}
const requestType = "architectural-application"
const select = (cited: readonly string[]) =>
  selectRules(widgetRulesFile, {
    type: requestType,
    governingDate: "2026-02-03",
    entityTypes: ["architectural-application", "lot", "community", "work"],
    lotRef: null,
    cited
  })

describe("a cited form question", () => {
  it("pulls the rules citing its passages into the review, even with no entity they apply to", () => {
    expect(select([])).not.toContain(permitsListed.key)
    expect(select(citedProvisions(definition))).toContain(permitsListed.key)
    expect(select(citedProvisions(definition))).not.toContain(limitsListed.key)
  })

  it("tells the facts stage which details those rules test to read from the answer", () => {
    const selected = select(citedProvisions(definition))
    const plan = withFormQuestions(planFacts(widgetRulesFile, selected, requestType), {
      definition,
      rulesFile: widgetRulesFile,
      selected,
      requestType
    })
    expect(plan.properties.find((property) => property.key === "widget.finish")?.askedInForm).toEqual([
      "How will it look?"
    ])
    // A question that already answers a detail itself isn't a hint.
    const answering = {
      ...definition,
      groups: [{ ...definition.groups[0]!, fields: [{ ...question, binding: "widget.finish" }] }]
    }
    const unchanged = withFormQuestions(planFacts(widgetRulesFile, selected, requestType), {
      definition: answering,
      rulesFile: widgetRulesFile,
      selected,
      requestType
    })
    expect(unchanged.properties.every((property) => property.askedInForm.length === 0)).toBe(true)
  })

  it("writes the answer with its question's help and cited passages on the answers page", () => {
    const packet = withAnswersPage(
      { files: [], images: [] },
      {
        projectType: null,
        definition,
        answers: { work: [{ "custom.how-it-looks": "Brushed metal" }] },
        citationLabel: (key) => (key === widgetProvisions[1] ? "Design Guidelines 2.1" : null)
      }
    )
    expect(packet.files[0]?.pages[0]?.text).toBe(
      [
        "ANSWERS GIVEN IN THE APPLICATION FORM",
        "The project",
        "How will it look? Brushed metal",
        "  Help: Describe its surface.",
        "  Cites: Design Guidelines 2.1"
      ].join("\n")
    )
  })
})
