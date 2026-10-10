import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { ProjectTypeDefinition, ProjectTypeStatus } from "@/projectTypes/projectType"
import type { ProjectTypeSuggestion } from "@/projectTypes/suggest"
import type { ProjectTypesOverview } from "../projectTypes.functions"
import { ProjectTypesPage, type NewProjectType, type ProjectTypesPageProps } from "./ProjectTypesPage"

const definition: ProjectTypeDefinition = {
  subjects: ["structure"],
  groups: [
    {
      subject: "structure",
      label: "Structures",
      itemLabel: "Structure",
      help: null,
      isRepeatable: true,
      fields: [
        {
          kind: "yes-no",
          property: "structure.roofed",
          binding: "structure.roofed",
          label: "Roofed",
          help: null,
          isRequired: false,
          example: null,
          answeredBy: "applicant",
          citations: []
        }
      ]
    }
  ],
  documents: [
    {
      documentType: "site-plan",
      label: "Site plan",
      mustShow: [],
      ruleKeys: ["r1"],
      isRequired: true,
      citations: [],
      accepts: null
    }
  ],
  formDocuments: [],
  unasked: []
}

const overview: ProjectTypesOverview = {
  projectTypes: [
    {
      id: "type-1",
      hoaId: "hoa",
      label: "Garden structure",
      description: "Building or changing a structure in the yard.",
      status: "active",
      rulebookId: "rb",
      definition,
      createdAt: "2026-10-09T00:00:00.000Z",
      updatedAt: "2026-10-09T00:00:00.000Z",
      applicationCount: 0
    }
  ],
  subjects: [
    { key: "structure", label: "structure", definition: "a building in the yard", scopeNote: null, kinds: [] },
    { key: "planting", label: "planting", definition: null, scopeNote: null, kinds: [] }
  ],
  hasPublishedRulebook: true
}

const suggestion: ProjectTypeSuggestion = {
  label: "Plantings",
  description: "Trees and beds the rules regulate.",
  definition: { ...definition, subjects: ["planting"] },
  basis: ["r2"]
}

function setup(overrides: Partial<ProjectTypesPageProps> = {}) {
  const props: ProjectTypesPageProps = {
    overview,
    onCreate: vi.fn<(input: NewProjectType) => Promise<void>>(async () => undefined),
    onSuggest: vi.fn<() => Promise<ProjectTypeSuggestion[]>>(async () => [suggestion]),
    onOpen: vi.fn<(id: string) => void>(),
    onSetStatus: vi.fn<(id: string, status: ProjectTypeStatus) => Promise<void>>(async () => undefined),
    onDelete: vi.fn<(id: string) => Promise<void>>(async () => undefined),
    ...overrides
  }
  render(<ProjectTypesPage {...props} />)
  return { props, user: userEvent.setup() }
}

describe("ProjectTypesPage", () => {
  it("lists the organization's project types with what each asks, and opens one", async () => {
    const { props, user } = setup()
    expect(screen.getByText("1 question and 1 document")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Garden structure" }))
    expect(props.onOpen).toHaveBeenCalledWith("type-1")
  })

  it("opens, archives and deletes a type from its menu, with the keyboard", async () => {
    const { props, user } = setup()
    const open = async (item: string) => {
      screen.getByRole("button", { name: "Actions for Garden structure" }).focus()
      await user.keyboard("{Enter}")
      const found = await screen.findByRole("menuitem", { name: item })
      found.focus()
      await user.keyboard("{Enter}")
    }
    await open("Open")
    expect(props.onOpen).toHaveBeenCalledWith("type-1")
    await open("Archive")
    await waitFor(() => expect(props.onSetStatus).toHaveBeenCalledWith("type-1", "archived"))
    await open("Delete")
    const dialog = await screen.findByRole("alertdialog", { name: "Delete Garden structure?" })
    expect(props.onDelete).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole("button", { name: "Delete" }))
    expect(props.onDelete).toHaveBeenCalledWith("type-1")
  })

  it("keeps an archived type that applications use, saying so, and offers to unarchive it", async () => {
    const [type] = overview.projectTypes
    const { props, user } = setup({
      overview: { ...overview, projectTypes: [{ ...type!, status: "archived", applicationCount: 1 }] }
    })
    expect(screen.getByText("Archived")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Actions for Garden structure" }))
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }))
    const dialog = await screen.findByRole("alertdialog", { name: "Garden structure can't be deleted" })
    expect(dialog).toHaveTextContent("1 application uses it, so it stays. It's already archived")
    await user.click(within(dialog).getByRole("button", { name: "Close" }))
    await user.click(screen.getByRole("button", { name: "Actions for Garden structure" }))
    await user.click(await screen.findByRole("menuitem", { name: "Unarchive" }))
    await waitFor(() => expect(props.onSetStatus).toHaveBeenCalledWith("type-1", "active"))
    expect(props.onDelete).not.toHaveBeenCalled()
  })

  it("says why an action didn't work", async () => {
    const { user } = setup({
      onDelete: vi.fn<(id: string) => Promise<void>>(async () => {
        throw new Error("Only an administrator can do this.")
      })
    })
    await user.click(screen.getByRole("button", { name: "Actions for Garden structure" }))
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }))
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }))
    expect(await screen.findByText("Only an administrator can do this.")).toBeInTheDocument()
  })

  it("adds a project type by hand from the keyboard, with what it covers", async () => {
    const { props, user } = setup()
    await user.click(screen.getByRole("button", { name: "Add project type" }))
    const dialog = screen.getByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: "Add project type" }))
    expect(within(dialog).getByText("Give the project type a name.")).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText("Name"), "Yard work")
    await user.type(within(dialog).getByLabelText("Description"), "Changes in the yard.")
    await user.click(within(dialog).getByRole("checkbox", { name: "Structure" }))
    await user.keyboard("{Enter}")
    expect(props.onCreate).toHaveBeenCalledWith({
      label: "Yard work",
      description: "Changes in the yard.",
      subjects: ["structure"],
      definition: null
    })
  })

  it("suggests project types from the rulebook, to add or dismiss", async () => {
    const { props, user } = setup()
    await user.click(screen.getByRole("button", { name: "Suggest project types" }))
    expect(await screen.findByText("Plantings")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Add Plantings" }))
    expect(props.onCreate).toHaveBeenCalledWith({
      label: "Plantings",
      description: "Trees and beds the rules regulate.",
      subjects: ["planting"],
      definition: suggestion.definition
    })
    expect(screen.queryByText("Plantings")).not.toBeInTheDocument()
  })

  it("dismisses a suggestion and says when there's nothing new", async () => {
    const { user } = setup()
    await user.click(screen.getByRole("button", { name: "Suggest project types" }))
    await user.click(await screen.findByRole("button", { name: "Dismiss" }))
    expect(screen.getByText("Nothing new to suggest.")).toBeInTheDocument()
  })

  it("asks for a published rulebook before anything can be added", () => {
    setup({ overview: { ...overview, projectTypes: [], hasPublishedRulebook: false } })
    expect(screen.getByText("Publish the rulebook first")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add project type" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Suggest project types" })).toBeDisabled()
    expect(screen.getByText("No project types yet")).toBeInTheDocument()
  })
})
