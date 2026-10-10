import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { OfferedProjectType } from "../../projectTypes/projectTypes.functions"
import { clearDraft, draftFor, readDraft, saveDraft } from "./applicationDraft"
import { ApplicationsPage, type NewApplication } from "./ApplicationsPage"

const fence: OfferedProjectType = {
  id: "type-1",
  hoaId: "hoa",
  label: "Fence",
  description: "A new or replaced fence.",
  status: "active",
  rulebookId: "rb-1",
  createdAt: "2026-10-08T10:00:00.000Z",
  updatedAt: "2026-10-08T10:00:00.000Z",
  definition: {
    subjects: ["work"],
    groups: [
      {
        subject: "work",
        label: "The project",
        itemLabel: "The project",
        help: null,
        isRepeatable: false,
        fields: [
          {
            kind: "text",
            property: "work.material",
            binding: "work.material",
            label: "What is it made of?",
            help: null,
            example: null,
            isRequired: false,
            answeredBy: "applicant",
            citations: []
          }
        ]
      }
    ],
    documents: [],
    formDocuments: [],
    unasked: []
  },
  reasons: { citations: {}, rules: {} }
}

const draftKey = "Sample HOA:jordan@example.com"

function setup() {
  const onCreate = vi.fn<(input: NewApplication) => Promise<void>>(async () => undefined)
  render(
    <ApplicationsPage
      applications={[]}
      projectTypes={[fence]}
      isCommittee={false}
      onCreate={onCreate}
      onOpen={vi.fn<(id: string) => void>()}
      draftKey={draftKey}
    />
  )
  return { onCreate, user: userEvent.setup() }
}

beforeEach(() => {
  window.sessionStorage.clear()
})

describe("the application draft", () => {
  it("keeps each project type's answers in the tab, and forgets them when asked", () => {
    expect(readDraft(draftKey)).toBeNull()
    saveDraft(draftKey, "", { description: "ignored", answers: {} })
    expect(readDraft(draftKey)).toBeNull()
    saveDraft(draftKey, "type-1", { description: "A fence", answers: { work: [{ "work.material": "wood" }] } })
    saveDraft(draftKey, "type-2", { description: "A shed", answers: {} })
    const draft = readDraft(draftKey)
    expect(draft?.projectTypeId).toBe("type-2")
    expect(draftFor(draft, "type-1")?.description).toBe("A fence")
    expect(draftFor(draft, "type-3")).toBeNull()
    window.sessionStorage.setItem(`application-draft:${draftKey}`, "{ not json")
    expect(readDraft(draftKey)).toBeNull()
    clearDraft(draftKey)
    expect(window.sessionStorage.length).toBe(0)
  })

  it("saves the answers as they're typed and restores them when the form opens again", async () => {
    const first = setup()
    await first.user.click(screen.getByRole("radio", { name: /^Fence/ }))
    await first.user.type(screen.getByRole("textbox", { name: "Describe your project" }), "Cedar along the back")
    await first.user.type(screen.getByRole("textbox", { name: /What is it made of/ }), "cedar")
    expect(screen.queryByText("We restored your answers")).not.toBeInTheDocument()
    document.body.replaceChildren()

    const second = setup()
    expect(await screen.findByText("We restored your answers")).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Describe your project" })).toHaveValue("Cedar along the back")
    expect(screen.getByRole("textbox", { name: /What is it made of/ })).toHaveValue("cedar")
    await second.user.click(screen.getByRole("button", { name: "Dismiss" }))
    expect(screen.queryByText("We restored your answers")).not.toBeInTheDocument()
  })
})
