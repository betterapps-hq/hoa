import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { emptyAnswers } from "@/projectTypes/answers"
import type { ProjectAnswers, ProjectField, ProjectTypeDefinition } from "@/projectTypes/projectType"
import { ProjectForm } from "./ProjectForm"

const base = { help: null, example: null, isRequired: false, answeredBy: "applicant" as const, citations: [] }
const bound = (property: string) => ({ property, binding: property })

// A synthetic vocabulary's lengths: a small unit and one twelve times its size, as inches and feet are.
const units = [
  { unit: "inch", labels: ["inch", "in", "inches"], perBase: "1" },
  { unit: "foot", labels: ["foot", "ft", "feet"], perBase: "12" }
]

const fields: ProjectField[] = [
  { ...base, ...bound("item.name"), kind: "text", label: "What do you call it?", isRequired: true, example: "Arbor" },
  { ...base, ...bound("item.notes"), kind: "long-text", label: "Anything else?" },
  { ...base, ...bound("item.lit"), kind: "yes-no", label: "Is it lit at night?" },
  { ...base, ...bound("item.on"), kind: "date", label: "When will it be installed?" },
  {
    ...base,
    ...bound("item.size"),
    kind: "number",
    label: "How tall is it?",
    unit: { key: "inch", label: "inches" },
    dimension: "length",
    units
  },
  {
    ...base,
    ...bound("item.count"),
    kind: "number",
    label: "How many are there?",
    unit: null,
    dimension: null,
    units: []
  },
  {
    ...base,
    ...bound("item.color"),
    kind: "choice",
    label: "What color is it?",
    help: "As the maker names it",
    options: [
      { value: "color.grey", label: "grey", isAdded: false },
      { value: "color.tan", label: "tan", isAdded: false }
    ],
    allowsOther: true
  },
  {
    ...base,
    ...bound("item.finish"),
    kind: "choice",
    label: "What finish does it have?",
    help: "The finish is what the surface is coated with once it's built, which the rules limit by material, so say what the maker calls it.",
    options: ["a", "b", "c", "d", "e", "f", "g"].map((value) => ({
      value: `finish.${value}`,
      label: `finish ${value}`,
      isAdded: false
    })),
    allowsOther: false
  },
  {
    ...base,
    property: "custom.extras",
    binding: null,
    kind: "choices",
    label: "What comes with it?",
    options: [
      { value: "lights", label: "lights" },
      { value: "planter", label: "planter" }
    ]
  }
]

const definition: ProjectTypeDefinition = {
  subjects: ["item"],
  groups: [
    {
      subject: "item",
      label: "Items",
      itemLabel: "Item",
      help: "Each item the project adds",
      isRepeatable: true,
      fields
    }
  ],
  documents: [],
  formDocuments: [],
  unasked: []
}

// The same items with their color asked once for every item.
const shared: ProjectTypeDefinition = {
  ...definition,
  groups: definition.groups.map((group) => ({
    ...group,
    fields: group.fields
      .filter((field) => field.property === "item.name" || field.property === "item.color")
      .map((field) => (field.property === "item.color" ? { ...field, isShared: true } : field))
  }))
}

function Form({
  onChange,
  showsAllErrors = false,
  of = definition
}: {
  onChange: (value: ProjectAnswers) => void
  showsAllErrors?: boolean
  of?: ProjectTypeDefinition
}) {
  const [value, setValue] = useState(emptyAnswers(of))
  return (
    <ProjectForm
      definition={of}
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
      showsAllErrors={showsAllErrors}
    />
  )
}

describe("ProjectForm", () => {
  it("renders each question with its control, every choice in sentence case, and short help under it", () => {
    render(<Form onChange={vi.fn<(value: ProjectAnswers) => void>()} />)
    expect(screen.getByRole("group", { name: "Items" })).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "What do you call it?" })).toHaveAttribute("placeholder", "e.g. Arbor")
    expect(screen.getByRole("textbox", { name: "Anything else?" })).toBeInTheDocument()
    expect(screen.getByRole("radiogroup", { name: "Is it lit at night?" })).toBeInTheDocument()
    expect(screen.getByLabelText("When will it be installed?")).toHaveAttribute("type", "date")
    expect(screen.getByRole("radio", { name: "Grey" })).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "Other" })).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "What finish does it have?" })).toHaveTextContent("Finish a")
    expect(screen.getByRole("checkbox", { name: "Lights" })).toBeInTheDocument()
    expect(screen.getByText("As the maker names it.")).toBeInTheDocument()
  })

  it("marks only required questions, with an asterisk for the eye and aria-required for screen readers", () => {
    render(<Form onChange={vi.fn<(value: ProjectAnswers) => void>()} />)
    expect(screen.queryByText("Optional")).not.toBeInTheDocument()
    expect(screen.getAllByText("*")).toHaveLength(1)
    expect(screen.getByRole("textbox", { name: "What do you call it?" })).toHaveAttribute("aria-required", "true")
  })

  it("keeps long help behind one info button that opens from the keyboard", async () => {
    const user = userEvent.setup()
    render(<Form onChange={vi.fn<(value: ProjectAnswers) => void>()} />)
    expect(screen.queryByText(/The finish is what the surface/)).not.toBeInTheDocument()
    screen.getByRole("button", { name: "About: What finish does it have?" }).focus()
    await user.keyboard("{Enter}")
    expect(await screen.findByText(/The finish is what the surface/)).toBeInTheDocument()
  })

  it("takes a length in feet and inches, a count by stepping, and several choices", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn<(value: ProjectAnswers) => void>()
    render(<Form onChange={onChange} />)
    await user.type(screen.getByRole("textbox", { name: "How tall is it? ft" }), "5")
    await user.type(screen.getByRole("textbox", { name: "How tall is it? in" }), "11.5")
    await user.click(screen.getByRole("button", { name: "One more" }))
    await user.click(screen.getByRole("button", { name: "One more" }))
    await user.click(screen.getByRole("checkbox", { name: "Planter" }))
    await user.click(screen.getByRole("radio", { name: "Other" }))
    await user.type(screen.getByRole("textbox", { name: /Other, described/ }), "Sage")
    expect(onChange).toHaveBeenLastCalledWith({
      item: [
        expect.objectContaining({
          "item.size": 71.5,
          "item.count": 2,
          "item.color": "Sage",
          "custom.extras": ["planter"]
        })
      ]
    })
  })

  it("adds and removes items, keeping each item's own answers", async () => {
    const user = userEvent.setup()
    render(<Form onChange={vi.fn<(value: ProjectAnswers) => void>()} />)
    await user.click(screen.getByRole("button", { name: "Add item" }))
    await user.click(screen.getByRole("button", { name: "Add item" }))
    const names = screen.getAllByRole("textbox", { name: "What do you call it?" })
    await user.type(names[1]!, "Second")
    await user.type(names[2]!, "Third")
    await user.click(screen.getByRole("button", { name: "Remove item 2" }))
    expect(
      screen
        .getAllByRole("textbox", { name: "What do you call it?" })
        .map((input) => (input instanceof HTMLInputElement ? input.value : null))
    ).toEqual(["", "Third"])
  })

  it("asks a question shared by every item once, above the items, and keeps its answer on each, new ones too", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn<(value: ProjectAnswers) => void>()
    render(<Form onChange={onChange} of={shared} />)
    await user.click(screen.getByRole("button", { name: "Add item" }))
    const every = screen.getByRole("region", { name: "Every item" })
    expect(screen.getAllByRole("radiogroup", { name: "What color is it?" })).toHaveLength(1)
    expect(within(every).getByRole("radiogroup", { name: "What color is it?" })).toBeInTheDocument()
    expect(within(screen.getByRole("region", { name: "Item 2" })).queryByRole("radiogroup")).not.toBeInTheDocument()
    await user.click(within(every).getByRole("radio", { name: "Grey" }))
    await user.click(screen.getByRole("button", { name: "Add item" }))
    const items = onChange.mock.lastCall?.[0].item ?? []
    expect(items.map((item) => item["item.color"])).toEqual(["color.grey", "color.grey", "color.grey"])
    expect(screen.getAllByRole("textbox", { name: "What do you call it?" })).toHaveLength(3)
  })

  it("says what's wrong once a question is left, or all at once after a submit", async () => {
    const user = userEvent.setup()
    const { rerender } = render(<Form onChange={vi.fn<(value: ProjectAnswers) => void>()} />)
    const feet = screen.getByRole("textbox", { name: "How tall is it? ft" })
    await user.type(feet, "tall")
    expect(screen.queryByText(/Use numbers only/)).not.toBeInTheDocument()
    await user.tab()
    expect(screen.getByText("Use numbers only, such as 6 or 5.5.")).toBeInTheDocument()
    expect(feet).toHaveAttribute("aria-invalid", "true")
    expect(screen.queryByText("Answer this question.")).not.toBeInTheDocument()
    rerender(<Form onChange={vi.fn<(value: ProjectAnswers) => void>()} showsAllErrors />)
    expect(screen.getByText("Answer this question.")).toBeInTheDocument()
  })
})
