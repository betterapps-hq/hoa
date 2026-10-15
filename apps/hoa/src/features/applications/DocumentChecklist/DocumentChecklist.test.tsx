import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { ProjectDocument } from "@/projectTypes/projectType"
import { DocumentChecklist } from "./DocumentChecklist"

const document = (documentType: string, label: string): ProjectDocument => ({
  documentType,
  label,
  mustShow: [],
  ruleKeys: [],
  isRequired: true,
  citations: [],
  accepts: null
})

describe("DocumentChecklist", () => {
  it("offers a document's template to download, and says what's still needed", () => {
    render(
      <DocumentChecklist
        projectTypeId="type-1"
        documents={[
          {
            ...document("approval", "Neighbor approval form"),
            template: {
              id: "00000000-0000-4000-8000-000000000001",
              fileName: "approval.pdf",
              mediaType: "application/pdf",
              sizeBytes: 4
            }
          },
          document("plot-plan", "Plot plan")
        ]}
        files={[{ name: "plot.pdf", kind: "plot-plan" }]}
      />
    )
    expect(screen.getAllByRole("link")).toHaveLength(1)
    expect(screen.getByRole("link", { name: "Download the template for the neighbor approval form" })).toHaveAttribute(
      "href",
      "/files/project-types/type-1/templates/00000000-0000-4000-8000-000000000001"
    )
    expect(screen.getByText(/Still needed: neighbor approval form\./)).toBeInTheDocument()
  })
})
