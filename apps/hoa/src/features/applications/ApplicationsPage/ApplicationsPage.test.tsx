import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { ProjectField } from "@/projectTypes/projectType"
import type { OfferedProjectType } from "../../projectTypes/projectTypes.functions"
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
    { value: "material.wood", label: "wood" },
    { value: "material.metal", label: "metal" }
  ],
  allowsOther: false
}

// A project type as an organization might define it: the work's own detail, a repeatable item and two documents.
const gardenStructure: OfferedProjectType = {
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
        accepts: null
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

const pdf = (name: string) => new File(["%PDF"], name, { type: "application/pdf" })

/** The drop zone's file input, which browsing and dropping both fill. */
const filesInput = () => {
  const input = document.getElementById("application-files")
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("No drop zone")
  }
  return input
}

describe("ApplicationsPage", () => {
  it("shows only the project types until one is chosen", () => {
    setup()
    expect(within(screen.getByRole("radiogroup")).getAllByRole("radio")).toHaveLength(2)
    expect(screen.getByText("Building or changing a structure in the yard.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Upload and review" })).not.toBeInTheDocument()
  })

  it("asks the type's questions, takes several files, says what each is, and sends it all", async () => {
    const { props, user } = setup()
    await user.click(screen.getByRole("radio", { name: /^Garden structure/ }))
    await user.type(screen.getByRole("textbox", { name: /^How tall is it/ }), "72")
    await user.click(screen.getByRole("radio", { name: "Wood" }))
    await user.click(screen.getByRole("button", { name: "Add structure" }))
    await user.type(screen.getAllByRole("textbox", { name: /^How tall is it/ })[1]!, "48")
    const sitePlan = pdf("Site_Plan.pdf")
    const packet = pdf("packet.pdf")
    await user.upload(filesInput(), [sitePlan, packet])
    // The site plan's name says what it is; the packet's doesn't.
    expect(await screen.findByRole("combobox", { name: "What Site_Plan.pdf is" })).toHaveValue("site-plan")
    expect(screen.getByRole("combobox", { name: "What packet.pdf is" })).toHaveValue("")
    const checklist = screen.getByRole("list", { name: "Documents to include" })
    expect(within(checklist).getByText(/Added/)).toBeInTheDocument()
    await user.selectOptions(screen.getByRole("combobox", { name: "What packet.pdf is" }), "(other)")
    await user.type(screen.getByRole("textbox", { name: /^Describe your project/ }), "  A new pergola  ")
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
      files: [sitePlan, packet],
      purposes: new Map([[sitePlan, "Uploaded as the site plan, which must show: where the structure goes."]])
    })
  })

  it("shows why a question is asked behind its one info button, citations opening over the form", async () => {
    const { user } = setup()
    await user.click(screen.getByRole("radio", { name: /^Garden structure/ }))
    expect(screen.queryByText("Why we ask")).not.toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "About: How tall is it?" })).toHaveLength(1)
    screen.getByRole("button", { name: "About: How tall is it?" }).focus()
    await user.keyboard("{Enter}")
    expect(await screen.findByText("Why we ask")).toBeInTheDocument()
    expect(screen.getByText("Structures at most 96 inches")).toBeInTheDocument()
    const link = screen.getByRole("link", { name: "Guidelines 5.5" })
    // A real link (a new tab on a middle-click); a plain click opens the reader in a sheet (ReaderSheet.test.tsx).
    expect(link).toHaveAttribute("href", "/documents/doc-1?provision=guidelines%3A5.5")
    expect(link).not.toHaveAttribute("target")
  })

  it("names the required documents still missing, and lets a file be removed", async () => {
    const { user } = setup()
    await user.click(screen.getByRole("radio", { name: /^Garden structure/ }))
    expect(screen.getByText(/Still needed: site plan\./)).toBeInTheDocument()
    await user.upload(filesInput(), pdf("site plan.pdf"))
    await waitFor(() => expect(screen.queryByText(/Still needed/)).not.toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: "Remove site plan.pdf" }))
    expect(screen.getByText(/Still needed: site plan\./)).toBeInTheDocument()
  })

  it("marks what a required question needs on submit, and takes the homeowner to it", async () => {
    const { props, user } = setup()
    await user.click(screen.getByRole("radio", { name: /^Garden structure/ }))
    await user.upload(filesInput(), pdf("form.pdf"))
    await screen.findByText("form.pdf")
    await user.click(screen.getByRole("button", { name: "Upload and review" }))
    expect(screen.getByText("Answer this question.")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole("textbox", { name: /^How tall is it/ })).toHaveFocus())
    expect(props.onCreate).not.toHaveBeenCalled()
  })

  it("asks for files for something else, which asks no questions", async () => {
    const { props, user } = setup()
    await user.click(screen.getByRole("radio", { name: /^Something else/ }))
    expect(screen.queryByRole("textbox", { name: /^How tall/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Upload and review" }))
    expect(screen.getByText("Add your application packet.")).toBeInTheDocument()
    await user.upload(filesInput(), pdf("form.pdf"))
    await screen.findByText("form.pdf")
    expect(screen.queryByRole("combobox", { name: "What form.pdf is" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Upload and review" }))
    expect(props.onCreate).toHaveBeenCalledWith(expect.objectContaining({ projectTypeId: null, answers: null }))
  })

  it("turns away a file it can't read, saying why", async () => {
    const { props, user } = setup()
    await user.click(screen.getByRole("radio", { name: /^Something else/ }))
    const loose = userEvent.setup({ applyAccept: false })
    await loose.upload(filesInput(), new File(["x"], "photo.heic", { type: "image/heic" }))
    expect(await screen.findByText(/photo\.heic isn't a PDF, Word, JPEG or PNG file/)).toBeInTheDocument()
    expect(screen.queryByRole("list", { name: "Chosen files" })).not.toBeInTheDocument()
    expect(props.onCreate).not.toHaveBeenCalled()
  })

  it("shows why an application wasn't created", async () => {
    const { user } = setup({
      onCreate: vi.fn<(input: NewApplication) => Promise<void>>(async () => {
        throw new Error("Not now.")
      })
    })
    await user.click(screen.getByRole("radio", { name: /^Something else/ }))
    await user.upload(filesInput(), pdf("form.pdf"))
    await screen.findByText("form.pdf")
    await user.click(screen.getByRole("button", { name: "Upload and review" }))
    expect(await screen.findByText("Not now.")).toBeInTheDocument()
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
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument()
    expect(screen.getByText("Applications appear here once homeowners start them.")).toBeInTheDocument()
  })
})
