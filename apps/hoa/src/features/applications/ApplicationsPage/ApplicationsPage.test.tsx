import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { ProjectType } from "@/projectTypes/projectType"
import type { ApplicationListItem } from "../applications.functions"
import { ApplicationsPage, type ApplicationsPageProps, type NewApplication } from "./ApplicationsPage"

const application: ApplicationListItem = {
  id: "app-1",
  hoaId: "hoa",
  projectTypeId: "type-1",
  answers: null,
  description: "Add a structure in the yard",
  createdBy: "demo-homeowner",
  createdAt: "2026-10-08T10:00:00.000Z",
  updatedAt: "2026-10-08T11:00:00.000Z",
  status: "submitted",
  reviewId: "r1",
  submittedReviewId: "r1",
  submittedAt: "2026-10-08T11:00:00.000Z",
  decision: null,
  deleteAfter: null,
  recommendation: "request-information",
  projectTypeLabel: "Garden structure"
}

// A project type as an organization might define it: the work's own detail, a repeatable item and a document.
const gardenStructure: ProjectType = {
  id: "type-1",
  hoaId: "hoa",
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
          { kind: "text", property: "work.performed-by", label: "Who does the work", help: null, isRequired: false }
        ]
      },
      {
        subject: "structure",
        label: "Structures",
        itemLabel: "Structure",
        help: null,
        isRepeatable: true,
        fields: [
          {
            kind: "number",
            property: "structure.height",
            label: "Height",
            help: "From the ground to the top",
            isRequired: true,
            unit: { key: "inch", label: "inches" }
          },
          {
            kind: "choice",
            property: "structure.material",
            label: "Material",
            help: null,
            isRequired: false,
            options: [
              { value: "material.wood", label: "wood" },
              { value: "material.metal", label: "metal" }
            ],
            allowsOther: false
          }
        ]
      }
    ],
    documents: [
      {
        documentType: "site-plan",
        label: "Site plan",
        mustShow: ["where the structure goes"],
        ruleKeys: ["rule-1"],
        isRequired: true
      }
    ]
  }
}

function setup(overrides: Partial<ApplicationsPageProps> = {}) {
  const props: ApplicationsPageProps = {
    applications: [application],
    projectTypes: [gardenStructure],
    isCommittee: false,
    onCreate: vi.fn<(input: NewApplication) => Promise<void>>(async () => undefined),
    onOpen: vi.fn<(id: string) => void>(),
    ...overrides
  }
  render(<ApplicationsPage {...props} />)
  return { props, user: userEvent.setup() }
}

const pdf = () => new File(["%PDF"], "form.pdf", { type: "application/pdf" })

describe("ApplicationsPage", () => {
  it("asks the chosen project type's questions and sends the answers with the files", async () => {
    const { props, user } = setup()
    await user.click(screen.getByRole("radio", { name: "Garden structure" }))
    await user.type(screen.getByLabelText(/^Height/), "72")
    await user.selectOptions(screen.getByLabelText(/^Material/), "material.wood")
    await user.click(screen.getByRole("button", { name: "Add another structure" }))
    await user.type(screen.getAllByLabelText(/^Height/)[1]!, "48")
    const sitePlan = pdf()
    await user.upload(screen.getByLabelText("Site plan"), sitePlan)
    await user.type(screen.getByLabelText("Project description"), "  A new pergola  ")
    await user.click(screen.getByRole("button", { name: "Upload and review" }))
    expect(props.onCreate).toHaveBeenCalledWith({
      projectTypeId: "type-1",
      answers: {
        work: [{ "work.performed-by": null }],
        structure: [
          { "structure.height": 72, "structure.material": "material.wood" },
          { "structure.height": 48, "structure.material": null }
        ]
      },
      description: "A new pergola",
      files: [sitePlan],
      purposes: new Map([[sitePlan, "Uploaded as the site plan, which must show: where the structure goes."]])
    })
  })

  it("asks for what a required question needs before creating the application", async () => {
    const { props, user } = setup()
    await user.click(screen.getByRole("radio", { name: "Garden structure" }))
    await user.upload(screen.getByLabelText("Files"), pdf())
    await user.click(screen.getByRole("button", { name: "Upload and review" }))
    expect(screen.getByText('Answer "Height".')).toBeInTheDocument()
    expect(props.onCreate).not.toHaveBeenCalled()
  })

  it("offers the project types with what each covers, and something else, which asks no questions", async () => {
    const { props, user } = setup()
    const picker = screen.getByRole("radiogroup")
    expect(within(picker).getAllByRole("radio")).toHaveLength(2)
    expect(screen.getByText("Building or changing a structure in the yard.")).toBeInTheDocument()
    await user.click(screen.getByRole("radio", { name: "Something else" }))
    expect(screen.queryByLabelText(/^Height/)).not.toBeInTheDocument()
    await user.upload(screen.getByLabelText("Files"), pdf())
    await user.click(screen.getByRole("button", { name: "Upload and review" }))
    expect(props.onCreate).toHaveBeenCalledWith(expect.objectContaining({ projectTypeId: null, answers: null }))
  })

  it("asks for the project type and the packet, and refuses files it can't read", async () => {
    const { props, user } = setup()
    await user.click(screen.getByRole("button", { name: "Upload and review" }))
    expect(screen.getByText("Choose the type of project, or Something else.")).toBeInTheDocument()
    expect(screen.getByText("Add your application packet.")).toBeInTheDocument()
    const loose = userEvent.setup({ applyAccept: false })
    await loose.upload(screen.getByLabelText("Files"), new File(["x"], "photo.heic", { type: "image/heic" }))
    await user.click(screen.getByRole("radio", { name: "Something else" }))
    await user.click(screen.getByRole("button", { name: "Upload and review" }))
    expect(screen.getByText(/Save photos as JPEG or PNG/)).toBeInTheDocument()
    expect(props.onCreate).not.toHaveBeenCalled()
  })

  it("shows why an application wasn't created", async () => {
    const { user } = setup({
      onCreate: vi.fn<(input: NewApplication) => Promise<void>>(async () => {
        throw new Error("Not now.")
      })
    })
    await user.click(screen.getByRole("radio", { name: "Something else" }))
    await user.upload(screen.getByLabelText("Files"), pdf())
    await user.click(screen.getByRole("button", { name: "Upload and review" }))
    expect(screen.getByText("Not now.")).toBeInTheDocument()
  })

  it("lists applications with status and latest recommendation, and opens one", async () => {
    const { props, user } = setup()
    expect(within(screen.getByRole("table")).getByText("Garden structure")).toBeInTheDocument()
    expect(screen.getByText("With the committee")).toBeInTheDocument()
    expect(screen.getByText("More information needed")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Open" }))
    expect(props.onOpen).toHaveBeenCalledWith("app-1")
  })

  it("shows the committee its queue without the form", () => {
    setup({ isCommittee: true, applications: [] })
    expect(screen.queryByRole("button", { name: "Upload and review" })).not.toBeInTheDocument()
    expect(screen.getByText("Applications appear here once homeowners start them.")).toBeInTheDocument()
  })
})
