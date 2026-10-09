import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { ProjectField, ProjectTypeDefinition } from "@/projectTypes/projectType"
import type { ProjectTypeView } from "../projectTypes.functions"
import { ProjectTypePage, type ProjectTypeChanges, type ProjectTypePageProps } from "./ProjectTypePage"

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: { to: string; children?: React.ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  )
}))

const height: ProjectField = {
  kind: "number",
  property: "structure.height",
  label: "Height",
  help: null,
  isRequired: false,
  unit: { key: "inch", label: "inches" }
}
const roofed: ProjectField = {
  kind: "yes-no",
  property: "structure.roofed",
  label: "Roofed",
  help: null,
  isRequired: false
}
const group = { subject: "structure", label: "Structures", itemLabel: "Structure", help: null, isRepeatable: true }
const available: ProjectTypeDefinition = {
  subjects: ["structure"],
  groups: [{ ...group, fields: [height, roofed] }],
  documents: [
    { documentType: "site-plan", label: "Site plan", mustShow: ["where it goes"], ruleKeys: ["r1"], isRequired: true }
  ]
}

const view: ProjectTypeView = {
  projectType: {
    id: "type-1",
    hoaId: "hoa",
    label: "Garden structure",
    description: "Building or changing a structure in the yard.",
    status: "active",
    rulebookId: "rb",
    definition: { ...available, groups: [{ ...group, fields: [height] }] },
    createdAt: "2026-10-09T00:00:00.000Z",
    updatedAt: "2026-10-09T00:00:00.000Z"
  },
  applicationCount: 0,
  requirements: [
    {
      id: "limits",
      title: "Limits",
      rules: [
        { key: "r2", title: "Height limit", citations: [], statement: "A structure must be at most 96 inches high." }
      ]
    }
  ],
  subjectLabels: ["structure"],
  isOutdated: false,
  available
}

function setup(overrides: Partial<ProjectTypePageProps> = {}) {
  const props: ProjectTypePageProps = {
    view,
    onSave: vi.fn<(changes: ProjectTypeChanges) => Promise<void>>(async () => undefined),
    onRefresh: vi.fn<() => Promise<void>>(async () => undefined),
    onSetStatus: vi.fn<(status: "active" | "retired") => Promise<void>>(async () => undefined),
    onDelete: vi.fn<() => Promise<void>>(async () => undefined),
    ...overrides
  }
  render(<ProjectTypePage {...props} />)
  return { props, user: userEvent.setup() }
}

describe("ProjectTypePage", () => {
  it("shows the questions, documents and every requirement with its statement", () => {
    setup()
    expect(screen.getByRole("heading", { name: "Garden structure" })).toBeInTheDocument()
    expect(screen.getByText("A number in inches")).toBeInTheDocument()
    expect(screen.getByText("Must show: where it goes.")).toBeInTheDocument()
    expect(screen.getByText("Height limit")).toBeInTheDocument()
    expect(screen.getByText("A structure must be at most 96 inches high.")).toBeInTheDocument()
  })

  it("makes a question required, adds one back and saves the form", async () => {
    const { props, user } = setup()
    expect(screen.queryByRole("button", { name: "Save questions" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("checkbox", { name: "Required" }))
    await user.selectOptions(screen.getByLabelText("Add a question about structures"), "structure.roofed")
    await user.click(screen.getByRole("button", { name: "Save questions" }))
    expect(props.onSave).toHaveBeenCalledWith({
      label: "Garden structure",
      description: "Building or changing a structure in the yard.",
      definition: { ...available, groups: [{ ...group, fields: [{ ...height, isRequired: true }, roofed] }] }
    })
  })

  it("removes a question and discards the change", async () => {
    const { user } = setup()
    await user.click(screen.getByRole("button", { name: "Remove Height" }))
    expect(screen.getByText("No questions.")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Discard changes" }))
    expect(screen.getByText("A number in inches")).toBeInTheDocument()
  })

  it("edits the name and description", async () => {
    const { props, user } = setup()
    await user.click(screen.getByRole("button", { name: "Edit" }))
    const dialog = screen.getByRole("dialog")
    await user.clear(within(dialog).getByLabelText("Name"))
    await user.type(within(dialog).getByLabelText("Name"), "Yard structure")
    await user.click(within(dialog).getByRole("button", { name: "Save" }))
    expect(props.onSave).toHaveBeenCalledWith({
      label: "Yard structure",
      description: "Building or changing a structure in the yard.",
      definition: view.projectType.definition
    })
  })

  it("deletes a type no application uses, after confirming", async () => {
    const { props, user } = setup()
    await user.click(screen.getByRole("button", { name: "Delete" }))
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }))
    expect(props.onDelete).toHaveBeenCalled()
  })

  it("retires a type applications use instead of deleting it, and offers an update when the rulebook changed", async () => {
    const { props, user } = setup({ view: { ...view, applicationCount: 2, isOutdated: true } })
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Retire" }))
    expect(props.onSetStatus).toHaveBeenCalledWith("retired")
    await user.click(screen.getByRole("button", { name: "Update" }))
    expect(props.onRefresh).toHaveBeenCalled()
  })
})
