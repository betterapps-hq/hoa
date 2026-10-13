import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createAdapter, type UploadAdapterContext } from "@uploadcn/core"
import { describe, expect, it, vi } from "vitest"
import type {
  DocumentTemplate,
  ProjectField,
  ProjectTypeDefinition,
  ProjectTypeStatus
} from "@/projectTypes/projectType"
import type { CitedProvision } from "../../rulebook/citedProvision"
import type { ProjectTypeView } from "../projectTypes.functions"
import { ProjectTypePage, type ProjectTypeChanges, type ProjectTypePageProps } from "./ProjectTypePage"

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => undefined,
  Link: ({ to, children, ...props }: { to: string; children?: React.ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  )
}))

const provision = (key: string, heading: string, text: string): CitedProvision => ({
  provisionKey: `guidelines:${key}`,
  label: `Guidelines ${key}`,
  documentTitle: "Design Guidelines",
  heading,
  intros: [],
  text,
  wrapUps: [],
  highlight: null,
  anchors: []
})
const heightLimit = provision("5.5", "Height", "A structure must be at most 96 inches high.")
const colors = provision("5.4", "Colors", "Structures are grey or tan.")
const roofs = provision("5.8", "Roofs", "Roofs are shingled.")

const base = { help: null, example: null, isRequired: false, answeredBy: "applicant" as const }
const height: ProjectField = {
  ...base,
  property: "structure.height",
  binding: "structure.height",
  kind: "number",
  label: "How tall is it?",
  isRequired: true,
  citations: [heightLimit.provisionKey],
  unit: { key: "inch", label: "inches" },
  dimension: "length",
  units: [
    { unit: "inch", labels: ["inch", "in", "inches"], perBase: "1" },
    { unit: "foot", labels: ["foot", "ft", "feet"], perBase: "12" }
  ]
}
const color: ProjectField = {
  ...base,
  property: "structure.color",
  binding: "structure.color",
  kind: "choice",
  label: "What color is it?",
  citations: [colors.provisionKey, "guidelines:gone"],
  options: [
    { value: "color.grey", label: "grey", isAdded: false },
    { value: "color.tan", label: "tan", isAdded: false }
  ],
  allowsOther: false
}
const roofed: ProjectField = {
  ...base,
  property: "structure.roofed",
  binding: "structure.roofed",
  kind: "yes-no",
  label: "Does it have a roof?",
  citations: [roofs.provisionKey]
}
const group = { subject: "structure", label: "Structures", itemLabel: "Structure", help: null, isRepeatable: true }
const sitePlan = {
  documentType: "site-plan",
  label: "site plan",
  mustShow: ["where it goes"],
  ruleKeys: ["r1"],
  isRequired: true,
  citations: [],
  accepts: null
}
const photo = {
  documentType: "photo",
  label: "photo",
  mustShow: [],
  ruleKeys: ["r1"],
  isRequired: false,
  citations: [],
  accepts: null
}
const description = {
  documentType: "project-description",
  label: "Project description",
  mustShow: [],
  ruleKeys: ["r3"],
  isRequired: true,
  citations: [],
  accepts: null
}
const available: ProjectTypeDefinition = {
  subjects: ["structure"],
  groups: [{ ...group, fields: [height, color, roofed] }],
  documents: [sitePlan, photo],
  formDocuments: [description],
  unasked: []
}
const definition: ProjectTypeDefinition = {
  ...available,
  groups: [{ ...group, fields: [height, color] }],
  documents: [sitePlan],
  unasked: [{ subject: "structure", field: roofed }]
}

const view: ProjectTypeView = {
  projectType: {
    id: "type-1",
    hoaId: "hoa",
    label: "Garden structure",
    description: "Building or changing a structure in the yard.",
    status: "active",
    rulebookId: "rb",
    definition,
    createdAt: "2026-10-09T00:00:00.000Z",
    updatedAt: "2026-10-09T00:00:00.000Z"
  },
  applicationCount: 0,
  requirements: [
    {
      id: "limits",
      title: "Limits",
      rules: [
        {
          key: "r2",
          title: "Height limit",
          citations: [heightLimit],
          statement: "A structure must be at most 96 inches high.",
          isMetByForm: false
        }
      ]
    },
    {
      id: "documents",
      title: "Documents to include",
      rules: [
        { key: "r1", title: "A site plan", citations: [], statement: "Include a site plan.", isMetByForm: false },
        {
          key: "r3",
          title: "A project description",
          citations: [],
          statement: "Include a project description.",
          isMetByForm: true
        }
      ]
    }
  ],
  subjectLabels: ["structure"],
  isOutdated: false,
  updates: null,
  available,
  questionInfo: {
    "structure.height": { meaning: "From the ground to the highest point.", ruleKeys: ["r2"] },
    "structure.roofed": { meaning: "Whether it has a roof.", ruleKeys: [] }
  },
  citations: Object.fromEntries([heightLimit, colors, roofs].map((item) => [item.provisionKey, item])),
  units: [
    { unit: "inch", labels: ["inch", "in", "inches"], perBase: "1", dimension: "length", label: "inches" },
    { unit: "foot", labels: ["foot", "ft", "feet"], perBase: "12", dimension: "length", label: "feet" }
  ]
}

const uploadTemplate = vi.fn<(context: UploadAdapterContext) => Promise<DocumentTemplate>>(async ({ file }) => ({
  id: "00000000-0000-4000-8000-000000000001",
  fileName: file.name,
  mediaType: file.type,
  sizeBytes: file.size
}))

function setup(overrides: Partial<ProjectTypePageProps> = {}) {
  const props: ProjectTypePageProps = {
    view,
    onSave: vi.fn<(changes: ProjectTypeChanges) => Promise<void>>(async () => undefined),
    onApplyUpdates: vi.fn<(definition: ProjectTypeDefinition) => Promise<void>>(async () => undefined),
    onSetStatus: vi.fn<(status: ProjectTypeStatus) => Promise<void>>(async () => undefined),
    onDelete: vi.fn<() => Promise<void>>(async () => undefined),
    loadProvisions: vi.fn<() => Promise<CitedProvision[]>>(async () => [heightLimit, colors, roofs]),
    templateAdapter: createAdapter(uploadTemplate),
    ...overrides
  }
  uploadTemplate.mockClear()
  render(<ProjectTypePage {...props} />)
  return { props, user: userEvent.setup() }
}

/** Opens a menu from the keyboard and activates one of its items with Enter. */
async function chooseFromMenu(user: ReturnType<typeof userEvent.setup>, menu: string, item: string) {
  screen.getByRole("button", { name: menu }).focus()
  await user.keyboard("{Enter}")
  const found = await screen.findByRole("menuitem", { name: item })
  found.focus()
  await user.keyboard("{Enter}")
}

const savedDefinition = (props: ProjectTypePageProps) => vi.mocked(props.onSave).mock.lastCall?.[0].definition
const savedFields = (props: ProjectTypePageProps) =>
  savedDefinition(props)?.groups.flatMap((item) => item.fields.map((field) => field.property))

describe("ProjectTypePage", () => {
  it("renders each question as homeowners see it, with its citations and nothing about how the review uses it", () => {
    setup()
    expect(screen.getByRole("heading", { name: "Garden structure" })).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: /How tall is it\?.*ft/ })).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "Grey" })).toBeInTheDocument()
    expect(screen.queryByText("Optional")).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Guidelines 5.5" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Move “How tall is it?”" })).toHaveAttribute(
      "aria-roledescription",
      "sortable"
    )
    expect(screen.queryByRole("button", { name: /^About: How tall is it\?/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/checks this answer|unlink|linked/i)).not.toBeInTheDocument()
  })

  it("flags a cited passage the rulebook no longer has", () => {
    setup()
    expect(
      screen.getByText("A cited passage is no longer in the rulebook. Edit the question to fix it.")
    ).toBeInTheDocument()
  })

  it("previews answers without saving them", async () => {
    const { props, user } = setup()
    await user.type(screen.getByRole("textbox", { name: /How tall is it\?.*ft/ }), "6")
    await user.click(screen.getByRole("radio", { name: "Tan" }))
    expect(props.onSave).not.toHaveBeenCalled()
  })

  it("offers only edit, required or optional, asking once in a section that repeats, and remove, each with an icon", async () => {
    const { user } = setup()
    await user.click(screen.getByRole("button", { name: "Actions for How tall is it?" }))
    const items = await screen.findAllByRole("menuitem")
    expect(items.map((item) => item.textContent)).toEqual([
      "Edit",
      "Make optional",
      "Ask once for every structure",
      "Remove"
    ])
    expect(items.every((item) => item.querySelector("svg"))).toBe(true)
  })

  it("makes a question optional from its menu with the keyboard, and saves", async () => {
    const { props, user } = setup()
    await chooseFromMenu(user, "Actions for How tall is it?", "Make optional")
    await waitFor(() => expect(savedDefinition(props)?.groups[0]!.fields[0]).toMatchObject({ isRequired: false }))
    expect(await screen.findByText("Saved")).toBeInTheDocument()
  })

  it("asks a question once for every item from its menu, and for each again from its dialog", async () => {
    const { props, user } = setup()
    await chooseFromMenu(user, "Actions for What color is it?", "Ask once for every structure")
    await waitFor(() => expect(savedDefinition(props)?.groups[0]!.fields[1]).toMatchObject({ isShared: true }))
    expect(screen.getByText("Asked once for every structure")).toBeInTheDocument()
    await chooseFromMenu(user, "Actions for What color is it?", "Edit")
    const dialog = await screen.findByRole("dialog", { name: "Edit question" })
    const once = within(dialog).getByRole("checkbox", { name: "Ask once for every structure" })
    expect(once).toBeChecked()
    await user.click(once)
    await user.click(within(dialog).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(savedDefinition(props)?.groups[0]!.fields[1]).toMatchObject({ isShared: false }))
    expect(screen.queryByText("Asked once for every structure")).not.toBeInTheDocument()
  })

  it("removes a question, which Add question then suggests again", async () => {
    const { props, user } = setup()
    await chooseFromMenu(user, "Actions for What color is it?", "Remove")
    await waitFor(() => expect(savedFields(props)).toEqual(["structure.height"]))
    await user.click(screen.getByRole("button", { name: "Add question" }))
    const picker = await screen.findByRole("dialog", { name: "Add a question" })
    expect(within(picker).getByText("Whether it has a roof.")).toBeInTheDocument()
    await user.click(within(picker).getByRole("button", { name: /^What color is it\?/ }))
    await waitFor(() => expect(savedFields(props)).toEqual(["structure.height", "structure.color"]))
  })

  it("always lets the administrator write their own question, with the answer type they choose", async () => {
    const { props, user } = setup()
    await user.click(screen.getByRole("button", { name: "Add question" }))
    const picker = await screen.findByRole("dialog", { name: "Add a question" })
    await user.click(within(picker).getByRole("button", { name: /^Write your own question/ }))
    const dialog = await screen.findByRole("dialog", { name: "Write a question" })
    await user.type(within(dialog).getByLabelText(/^Question/), "Which contractor will build it?")
    await user.selectOptions(within(dialog).getByLabelText("Section"), "work")
    await user.selectOptions(within(dialog).getByLabelText("Answer"), "choice")
    await user.type(within(dialog).getByLabelText("Choices"), "Ourselves{Enter}A contractor")
    await user.click(within(dialog).getByRole("button", { name: "Add question" }))
    await waitFor(() => expect(savedDefinition(props)?.groups[0]?.subject).toBe("work"))
    expect(savedDefinition(props)?.groups[0]!.fields[0]).toMatchObject({
      property: "custom.which-contractor-will-build-it",
      binding: null,
      kind: "choice",
      label: "Which contractor will build it?",
      isRequired: true,
      options: [
        { value: "ourselves", label: "Ourselves" },
        { value: "a-contractor", label: "A contractor" }
      ]
    })
  })

  it("answers what a new question's citations state, silently, when its answer type fits", async () => {
    const { props, user } = setup()
    await user.click(screen.getByRole("button", { name: "Add question" }))
    await user.click(
      within(await screen.findByRole("dialog", { name: "Add a question" })).getByRole("button", {
        name: /^Write your own question/
      })
    )
    const dialog = await screen.findByRole("dialog", { name: "Write a question" })
    expect(within(dialog).queryByText(/link|rules check/i)).not.toBeInTheDocument()
    await user.type(within(dialog).getByLabelText(/^Question/), "Is the structure covered?")
    await user.selectOptions(within(dialog).getByLabelText("Section"), "structure")
    await user.selectOptions(within(dialog).getByLabelText("Answer"), "yes-no")
    await user.click(within(dialog).getByRole("button", { name: "Add citation" }))
    await user.click(await screen.findByRole("button", { name: /^Guidelines 5\.8 Roofs/ }))
    await user.click(within(dialog).getByRole("button", { name: "Add question" }))
    await waitFor(() =>
      expect(savedDefinition(props)?.groups[0]!.fields.at(-1)).toMatchObject({
        label: "Is the structure covered?",
        binding: "structure.roofed",
        kind: "yes-no",
        citations: [roofs.provisionKey]
      })
    )
  })

  it("edits a question's wording and citations: removing one and linking another from the documents", async () => {
    const { props, user } = setup()
    await chooseFromMenu(user, "Actions for What color is it?", "Edit")
    const dialog = await screen.findByRole("dialog", { name: "Edit question" })
    const linked = within(dialog).getByRole("list", { name: "Linked citations" })
    expect(linked).toHaveTextContent("Missing passage")
    await user.click(within(dialog).getByRole("button", { name: "Remove Missing passage" }))
    await user.click(within(dialog).getByRole("button", { name: "Add citation" }))
    const entry = await screen.findByRole("button", { name: /^Guidelines 5\.5 Height/ })
    expect(screen.getByRole("link", { name: "Read Guidelines 5.5" })).toHaveAttribute(
      "href",
      expect.stringContaining("provision=guidelines%3A5.5")
    )
    await user.click(entry)
    await user.clear(within(dialog).getByLabelText(/^Question/))
    await user.type(within(dialog).getByLabelText(/^Question/), "Which color?")
    await user.click(within(dialog).getByRole("checkbox", { name: "Tan" }))
    await user.click(within(dialog).getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(savedDefinition(props)?.groups[0]!.fields[1]).toMatchObject({
        label: "Which color?",
        citations: [colors.provisionKey, heightLimit.provisionKey],
        options: [{ value: "color.grey", label: "grey" }]
      })
    )
  })

  it("adds the administrator's own choices to a linked question beside the rulebook's, and allows Other", async () => {
    const { props, user } = setup()
    await chooseFromMenu(user, "Actions for What color is it?", "Edit")
    let dialog = await screen.findByRole("dialog", { name: "Edit question" })
    await user.click(within(dialog).getByRole("checkbox", { name: "Tan" }))
    await user.click(within(dialog).getByRole("button", { name: "Add a choice" }))
    const added = within(dialog).getByRole("textbox", { name: "Choice 3" })
    expect(added).toHaveFocus()
    await user.type(added, "grey")
    await user.click(within(dialog).getByRole("button", { name: "Save" }))
    expect(
      await within(dialog).findByText("The rulebook's list has “grey”: show it instead of adding it.")
    ).toBeInTheDocument()
    await user.clear(added)
    await user.type(added, "Sage green")
    expect(within(dialog).getByText("Added")).toBeInTheDocument()
    await user.click(within(dialog).getByRole("checkbox", { name: "Allow “Other”, with a box to describe it" }))
    await user.click(within(dialog).getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(savedDefinition(props)?.groups[0]!.fields[1]).toMatchObject({
        binding: "structure.color",
        options: [
          { value: "color.grey", label: "grey", isAdded: false },
          { value: "sage-green", label: "Sage green", isAdded: true }
        ],
        allowsOther: true
      })
    )
    // Homeowners see the added choice and Other, with nothing marking it as added.
    expect(screen.getByRole("radio", { name: "Sage green" })).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "Other" })).toBeInTheDocument()
    // A hidden rulebook value stays on the list to show again; a renamed added choice keeps its key.
    await chooseFromMenu(user, "Actions for What color is it?", "Edit")
    dialog = await screen.findByRole("dialog", { name: "Edit question" })
    expect(within(dialog).getByRole("checkbox", { name: "Tan" })).not.toBeChecked()
    const renamed = within(dialog).getByRole("textbox", { name: "Choice 2" })
    await user.clear(renamed)
    await user.type(renamed, "Sage")
    await user.click(within(dialog).getByRole("button", { name: "Remove Sage" }))
    expect(within(dialog).queryByRole("textbox", { name: "Choice 2" })).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(savedDefinition(props)?.groups[0]!.fields[1]).toMatchObject({
        options: [{ value: "color.grey", label: "grey", isAdded: false }]
      })
    )
  })

  it("keeps the documents in one list, required ones marked, each required or optional from its menu", async () => {
    const { props, user } = setup()
    expect(screen.getByText("Site plan")).toBeInTheDocument()
    await chooseFromMenu(user, "Actions for Site plan", "Make optional")
    await waitFor(() => expect(savedDefinition(props)?.documents[0]).toMatchObject({ isRequired: false }))
    await user.click(screen.getByRole("button", { name: "Add document" }))
    const picker = await screen.findByRole("dialog", { name: "Add a document" })
    await user.click(within(picker).getByRole("button", { name: /^Photo/ }))
    await waitFor(() =>
      expect(savedDefinition(props)?.documents.map((document) => document.documentType)).toEqual(["site-plan", "photo"])
    )
  })

  it("attaches a template to a document, uploaded only when it's saved, and links it to download", async () => {
    const { props, user } = setup()
    await chooseFromMenu(user, "Actions for Site plan", "Edit")
    const dialog = await screen.findByRole("dialog", { name: "Edit document" })
    const input = dialog.querySelector("input[type=file]")
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("No template input")
    }
    await user.upload(input, new File(["%PDF"], "neighbor approval.pdf", { type: "application/pdf" }))
    expect(await within(dialog).findByText("neighbor approval.pdf")).toBeInTheDocument()
    expect(uploadTemplate).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(savedDefinition(props)?.documents[0]?.template).toMatchObject({ fileName: "neighbor approval.pdf" })
    )
    expect(uploadTemplate).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("link", { name: "Template: neighbor approval.pdf" })).toHaveAttribute(
      "href",
      "/files/project-types/type-1/templates/00000000-0000-4000-8000-000000000001"
    )
    await chooseFromMenu(user, "Actions for Site plan", "Edit")
    const again = await screen.findByRole("dialog", { name: "Edit document" })
    await user.click(within(again).getByRole("button", { name: "Remove neighbor approval.pdf" }))
    await user.click(within(again).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(savedDefinition(props)?.documents[0]?.template).toBeUndefined())
    expect(uploadTemplate).toHaveBeenCalledTimes(1)
  })

  it("shows the documents the application form provides as met by it, never among the uploads", async () => {
    const { user } = setup()
    const provided = screen.getByRole("region", { name: "Provided by the application form" })
    expect(within(provided).getByText("Project description")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Actions for Project description" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /All requirements/ }))
    expect(screen.getAllByText("Met by the application form")).toHaveLength(1)
  })

  it("creates the administrator's own document requirement from Add document", async () => {
    const { props, user } = setup()
    await user.click(screen.getByRole("button", { name: "Add document" }))
    const picker = await screen.findByRole("dialog", { name: "Add a document" })
    await user.click(within(picker).getByRole("button", { name: /^Create your own document requirement/ }))
    const dialog = await screen.findByRole("dialog", { name: "Ask for a document" })
    await user.type(within(dialog).getByLabelText(/^Name/), "Contractor license")
    await user.type(within(dialog).getByLabelText("What it must show"), "License number{Enter}Expiry date")
    await user.click(within(dialog).getByRole("checkbox", { name: "Word" }))
    await user.click(within(dialog).getByRole("button", { name: "Add document" }))
    await waitFor(() =>
      expect(savedDefinition(props)?.documents.at(-1)).toEqual({
        documentType: "custom.contractor-license",
        label: "Contractor license",
        mustShow: ["License number", "Expiry date"],
        ruleKeys: [],
        isRequired: true,
        citations: [],
        accepts: ["pdf", "image"]
      })
    )
  })

  it("writes a question homeowners sign by typing their name", async () => {
    const { props, user } = setup()
    await user.click(screen.getByRole("button", { name: "Add question" }))
    await user.click(
      within(await screen.findByRole("dialog", { name: "Add a question" })).getByRole("button", {
        name: /^Write your own question/
      })
    )
    const dialog = await screen.findByRole("dialog", { name: "Write a question" })
    await user.type(within(dialog).getByLabelText(/^Question/), "I confirm the plans are complete")
    await user.selectOptions(within(dialog).getByLabelText("Answer"), "signature")
    expect(within(dialog).getByText(/they sign by typing their name/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "Add question" }))
    await waitFor(() =>
      expect(
        savedDefinition(props)
          ?.groups.flatMap((group) => group.fields)
          .find((field) => field.label === "I confirm the plans are complete")
      ).toMatchObject({ kind: "signature", binding: null })
    )
  })

  it("asks for a fee with its amount in dollars", async () => {
    const { props, user } = setup()
    await user.click(screen.getByRole("button", { name: "Add question" }))
    await user.click(
      within(await screen.findByRole("dialog", { name: "Add a question" })).getByRole("button", {
        name: /^Write your own question/
      })
    )
    const dialog = await screen.findByRole("dialog", { name: "Write a question" })
    await user.type(within(dialog).getByLabelText(/^Question/), "Filing fee")
    await user.selectOptions(within(dialog).getByLabelText("Answer"), "fee")
    await user.click(within(dialog).getByRole("button", { name: "Add question" }))
    expect(within(dialog).getByText("Give the fee in dollars, such as 50.")).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText("Amount"), "$1,250.50")
    await user.click(within(dialog).getByRole("button", { name: "Add question" }))
    await waitFor(() =>
      expect(
        savedDefinition(props)
          ?.groups.flatMap((group) => group.fields)
          .find((field) => field.label === "Filing fee")
      ).toMatchObject({ kind: "fee", amount: 1250.5, binding: null })
    )
  })

  it("puts a new question answered by a file upload in the documents, never among the questions", async () => {
    const { props, user } = setup()
    await user.click(screen.getByRole("button", { name: "Add question" }))
    await user.click(
      within(await screen.findByRole("dialog", { name: "Add a question" })).getByRole("button", {
        name: /^Write your own question/
      })
    )
    const dialog = await screen.findByRole("dialog", { name: "Write a question" })
    await user.type(within(dialog).getByLabelText(/^Question/), "Survey of the lot")
    await user.selectOptions(within(dialog).getByLabelText("Answer"), "file")
    expect(within(dialog).getByText("It goes in the documents, with the other uploads.")).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "Add question" }))
    await waitFor(() => expect(savedDefinition(props)?.documents.at(-1)?.label).toBe("Survey of the lot"))
    expect(savedFields(props)).toEqual(["structure.height", "structure.color"])
  })

  it("changes a question's answer type like any other edit", async () => {
    const { props, user } = setup()
    await chooseFromMenu(user, "Actions for What color is it?", "Edit")
    const dialog = await screen.findByRole("dialog", { name: "Edit question" })
    expect(within(dialog).queryByRole("button", { name: /unlink/i })).not.toBeInTheDocument()
    await user.selectOptions(within(dialog).getByLabelText("Answer"), "text")
    expect(within(dialog).getByText("Changing the answer type clears its choices or unit.")).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(savedDefinition(props)?.groups[0]!.fields[1]).toMatchObject({
        property: "structure.color",
        binding: null,
        kind: "text"
      })
    )
  })

  it("says when a change wasn't saved and saves it again", async () => {
    const onSave = vi.fn<(changes: ProjectTypeChanges) => Promise<void>>()
    onSave.mockRejectedValueOnce(new Error("Offline")).mockResolvedValue(undefined)
    const { user } = setup({ onSave })
    await chooseFromMenu(user, "Actions for How tall is it?", "Make optional")
    expect(await screen.findByText("Not saved")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByText("Saved")).toBeInTheDocument()
    expect(onSave).toHaveBeenCalledTimes(2)
  })

  it("edits the name and description from the page's menu", async () => {
    const { props, user } = setup()
    await chooseFromMenu(user, "More actions", "Edit name and description")
    const dialog = await screen.findByRole("dialog", { name: "Edit project type" })
    await user.clear(within(dialog).getByLabelText("Name"))
    await user.type(within(dialog).getByLabelText("Name"), "Yard structure")
    await user.click(within(dialog).getByRole("button", { name: "Save" }))
    expect(props.onSave).toHaveBeenCalledWith({
      label: "Yard structure",
      description: "Building or changing a structure in the yard.",
      definition
    })
  })

  it("deletes a type no application uses, after a confirmation that names it", async () => {
    const { props, user } = setup()
    await chooseFromMenu(user, "More actions", "Delete")
    const dialog = await screen.findByRole("alertdialog", { name: "Delete Garden structure?" })
    await user.click(within(dialog).getByRole("button", { name: "Delete" }))
    expect(props.onDelete).toHaveBeenCalled()
  })

  it("offers archiving a type applications use instead of deleting it", async () => {
    const { props, user } = setup({ view: { ...view, applicationCount: 2 } })
    await chooseFromMenu(user, "More actions", "Delete")
    const dialog = await screen.findByRole("alertdialog", { name: "Garden structure can't be deleted" })
    expect(dialog).toHaveTextContent("2 applications use it. Archive it instead")
    await user.click(within(dialog).getByRole("button", { name: "Archive" }))
    expect(props.onSetStatus).toHaveBeenCalledWith("archived")
    expect(props.onDelete).not.toHaveBeenCalled()
  })

  it("keeps every requirement behind a disclosure", async () => {
    const { user } = setup()
    expect(screen.queryByText("Height limit")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /^All requirements/ }))
    expect(screen.getByText("Height limit")).toBeInTheDocument()
  })

  it("says it's out of date with the rulebook, and saves the reviewed updates, each accepted or kept", async () => {
    const tan = { value: "color.tan", label: "tan", isAdded: false }
    const changedColor = { ...color, options: [tan] }
    const latest: ProjectTypeDefinition = {
      ...available,
      groups: [{ ...group, fields: [height, changedColor, roofed] }]
    }
    const updates = {
      publishedAt: "2026-10-12T09:00:00.000Z",
      latest,
      changes: [
        {
          id: "question-changed structure structure.color",
          kind: "question-changed" as const,
          label: "What color is it?",
          detail: "The rulebook's list drops “grey”.",
          subject: "structure",
          key: "structure.color"
        },
        {
          id: "question-new structure structure.roofed",
          kind: "question-new" as const,
          label: "Does it have a roof?",
          detail: "The rules now ask this.",
          subject: "structure",
          key: "structure.roofed"
        }
      ]
    }
    const { props, user } = setup({ view: { ...view, isOutdated: true, updates } })
    expect(screen.getByText("Out of date with the rulebook published Oct 12")).toBeInTheDocument()
    expect(screen.getByText("2 questions changed.")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Review updates" }))
    const dialog = await screen.findByRole("dialog", { name: "Review updates" })
    expect(within(dialog).getByText("The rulebook's list drops “grey”.")).toBeInTheDocument()
    await user.click(
      within(within(dialog).getByRole("group", { name: "For Does it have a roof?" })).getByRole("button", {
        name: "Keep mine"
      })
    )
    await user.click(within(dialog).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(props.onApplyUpdates).toHaveBeenCalled())
    const saved = vi.mocked(props.onApplyUpdates).mock.lastCall?.[0]
    expect(saved?.groups[0]?.fields.map((field) => field.property)).toEqual(["structure.height", "structure.color"])
    expect(saved?.groups[0]?.fields[1]).toMatchObject({ binding: "structure.color", options: [tan] })
  })
})
