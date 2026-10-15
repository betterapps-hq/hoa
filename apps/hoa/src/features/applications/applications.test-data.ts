import type { ProjectField } from "@/projectTypes/projectType"
import type { OfferedProjectType } from "../projectTypes/offeredTypes"

// Synthetic project types for the application pages' tests. They hold no packet or document text.

const base = { help: null, example: null, isRequired: false, answeredBy: "applicant" as const, citations: [] }

const height: ProjectField = {
  ...base,
  kind: "number",
  property: "structure.height",
  binding: "structure.height",
  label: "How tall is it?",
  help: "From the ground to the top",
  isRequired: true,
  citations: ["guidelines:5.5"],
  unit: { key: "inch", label: "inches" },
  dimension: "length",
  units: []
}

const material: ProjectField = {
  ...base,
  kind: "choice",
  property: "structure.material",
  binding: "structure.material",
  label: "What is it made of?",
  options: [
    { value: "material.wood", label: "wood", isAdded: false },
    { value: "material.metal", label: "metal", isAdded: false }
  ],
  allowsOther: false
}

/** A project type as an organization might define it: the work's own detail, a repeatable item and two documents. */
export const gardenStructure: OfferedProjectType = {
  id: "type-1",
  organizationId: "hoa",
  label: "Garden structure",
  description: "Building or changing a structure in the yard.",
  status: "active",
  rulebookId: "rb-1",
  createdAt: "2026-10-08T10:00:00.000Z",
  updatedAt: "2026-10-08T10:00:00.000Z",
  definition: {
    subjects: ["structure"],
    groups: [
      {
        subject: "work",
        label: "The project",
        itemLabel: "The project",
        help: null,
        isRepeatable: false,
        fields: [
          {
            ...base,
            kind: "text",
            property: "work.performed-by",
            binding: "work.performed-by",
            label: "Who does the work?"
          }
        ]
      },
      {
        subject: "structure",
        label: "Structures",
        itemLabel: "Structure",
        help: null,
        isRepeatable: true,
        fields: [height, material]
      }
    ],
    documents: [
      {
        documentType: "site-plan",
        label: "Site plan",
        mustShow: ["where the structure goes"],
        ruleKeys: ["rule-1"],
        isRequired: true,
        citations: [],
        accepts: ["pdf"]
      },
      {
        documentType: "photo",
        label: "Photo",
        mustShow: [],
        ruleKeys: ["rule-2"],
        isRequired: false,
        citations: [],
        accepts: null
      }
    ],
    formDocuments: [],
    unasked: []
  },
  reasons: {
    citations: {
      "guidelines:5.5": {
        provisionKey: "guidelines:5.5",
        label: "Guidelines 5.5",
        documentTitle: "Design Guidelines",
        heading: "Height",
        intros: [],
        text: "A structure must be at most 96 inches high.",
        wrapUps: [],
        highlight: null,
        anchors: [{ fileId: "doc-1", page: 3, start: 0, end: 10 }]
      }
    },
    rules: { "structure.height": ["structures at most 96 inches"] }
  }
}
