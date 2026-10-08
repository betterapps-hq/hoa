import type { Review } from "@/review/review"
import type { Rule, Rulebook } from "@/rules/rules"

export const fenceRules: Rule[] = [
  {
    id: "rule-1",
    title: "Composite fence colors",
    requirement: "Trex composite fences must be Winchester Grey or Saddle.",
    kind: "allowed-values",
    projectTypes: ["fence"],
    source: {
      document: "Design Guidelines.pdf",
      section: "5.4.2",
      page: 17,
      quote: "Trex: Winchester Grey, Saddle"
    }
  },
  {
    id: "rule-2",
    title: "Fence height",
    requirement: "Boundary fences are 40 to 72 inches tall.",
    kind: "numeric-limit",
    projectTypes: ["fence"],
    source: { document: "Design Guidelines.pdf", section: "5.5.1", page: 18, quote: "maximum height of 72 inches" }
  },
  {
    id: "rule-3",
    title: "Approved composite manufacturers",
    requirement: "Composite fences must be made by Trex, Frame It All or Neoline.",
    kind: "allowed-values",
    projectTypes: ["fence"],
    source: { document: "Design Guidelines.pdf", section: "5.3.2", page: null, quote: "" }
  }
]

export const rulebook: Rulebook = {
  hoaName: "Sample Ridge HOA",
  documents: ["CC&Rs.pdf", "Design Guidelines.pdf"],
  publishedAt: "2026-10-07T12:00:00.000Z",
  rules: fenceRules
}

export const review: Review = {
  project: {
    summary: "Replace the existing wood fence with a Trex composite fence in River Birch.",
    details: [
      { label: "Material", value: "Trex composite" },
      { label: "Height", value: "Not provided" }
    ]
  },
  findings: [
    {
      ruleId: "rule-1",
      status: "not-met",
      explanation: "River Birch isn't an approved Trex color.",
      evidence: "Appendix A, page 1"
    },
    {
      ruleId: "rule-2",
      status: "unclear",
      explanation: "The application doesn't state the height.",
      evidence: "Not in the application"
    },
    { ruleId: "rule-3", status: "met", explanation: "Trex is an approved manufacturer.", evidence: "Appendix A" }
  ],
  missingInformation: ["Provide the fence height."],
  recommendation: "request-information",
  assessment: "The color conflicts with the approved Trex colors and the height is missing.",
  conditions: [],
  feedback: "Thank you for your application. Please choose an approved Trex color (section 5.4.2)."
}
