import type { Meta, StoryObj } from "@storybook/react-vite"
import { fn } from "storybook/test"
import type { ProjectTypeDefinition } from "@/projectTypes/projectType"
import type { ProjectTypeSuggestion } from "@/projectTypes/suggest"
import type { ProjectTypesOverview } from "../projectTypes.functions"
import { ProjectTypesPage } from "./ProjectTypesPage"

// The administrator's project types once a rulebook is published: the types as cards, and suggestions on demand.

const field = (property: string, label: string) => ({
  kind: "text" as const,
  property,
  binding: property,
  label,
  help: null,
  isRequired: false,
  example: null,
  answeredBy: "applicant" as const,
  citations: []
})

const document = (documentType: string, label: string) => ({
  documentType,
  label,
  mustShow: [],
  ruleKeys: [],
  isRequired: true,
  citations: [],
  accepts: null
})

const definition = (subject: string, questions: number, documents: number): ProjectTypeDefinition => ({
  subjects: [subject],
  groups: [
    {
      subject,
      label: "Details",
      itemLabel: "Item",
      help: null,
      isRepeatable: false,
      fields: Array.from({ length: questions }, (_, index) => field(`${subject}.q${index}`, `Question ${index + 1}`))
    }
  ],
  documents: Array.from({ length: documents }, (_, index) => document(`doc-${index}`, `Document ${index + 1}`)),
  formDocuments: [],
  unasked: []
})

const type = (
  id: string,
  label: string,
  description: string,
  more: Partial<ProjectTypesOverview["projectTypes"][number]> = {}
): ProjectTypesOverview["projectTypes"][number] => ({
  id,
  organizationId: "hoa",
  label,
  description,
  status: "active",
  rulebookId: "rb",
  definition: definition(id, 12, 4),
  createdAt: "2026-10-09T00:00:00.000Z",
  updatedAt: "2026-10-09T00:00:00.000Z",
  applicationCount: 0,
  outdatedSince: null,
  ...more
})

const overview: ProjectTypesOverview = {
  projectTypes: [
    type("fence", "Fence", "Building, replacing or changing a fence or a gate.", {
      definition: definition("fence", 21, 7),
      applicationCount: 3
    }),
    type("deck", "Deck or patio", "A new deck, patio or porch, or changes to one.", {
      outdatedSince: "2026-10-12T09:00:00.000Z"
    }),
    type("paint", "Exterior paint", "Repainting the house, trim or doors in new colors.", {
      status: "archived",
      applicationCount: 1
    })
  ],
  subjects: [],
  hasPublishedRulebook: true
}

const suggestions: ProjectTypeSuggestion[] = [
  {
    label: "Landscaping",
    description: "Trees, beds and lawn changes the rules regulate.",
    definition: definition("planting", 6, 2),
    basis: []
  },
  {
    label: "Solar panels",
    description: "Panels on the roof or the ground, and their wiring.",
    definition: definition("solar", 4, 3),
    basis: []
  }
]

const meta = {
  component: ProjectTypesPage,
  parameters: { layout: "fullscreen" },
  args: {
    overview,
    onCreate: fn(async () => undefined),
    onSuggest: fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200))
      return suggestions
    }),
    onOpen: fn(),
    onSetStatus: fn(async () => undefined),
    onDelete: fn(async () => undefined)
  }
} satisfies Meta<typeof ProjectTypesPage>

export default meta

type Story = StoryObj<typeof meta>

export const Types: Story = {}

export const NoTypes: Story = { args: { overview: { ...overview, projectTypes: [] } } }
