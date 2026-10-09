import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { emptyAnswers } from "@/projectTypes/answers"
import type { ProjectAnswers, ProjectTypeDefinition } from "@/projectTypes/projectType"
import { ProjectForm, type AnswerIssue } from "./ProjectForm"

const definition: ProjectTypeDefinition = {
  subjects: ["item"],
  groups: [
    {
      subject: "item",
      label: "Items",
      itemLabel: "Item",
      help: "Each item the project adds",
      isRepeatable: true,
      fields: [
        { kind: "text", property: "item.name", label: "Name", help: null, isRequired: true },
        { kind: "long-text", property: "item.notes", label: "Notes", help: null, isRequired: false },
        { kind: "yes-no", property: "item.lit", label: "Lit at night", help: null, isRequired: false },
        { kind: "date", property: "item.on", label: "Installed on", help: null, isRequired: false },
        {
          kind: "choice",
          property: "item.color",
          label: "Color",
          help: "As the maker names it",
          isRequired: false,
          options: [{ value: "color.grey", label: "grey" }],
          allowsOther: true
        }
      ]
    }
  ],
  documents: []
}

function Form({ onChange, issues = [] }: { onChange: (value: ProjectAnswers) => void; issues?: AnswerIssue[] }) {
  const [value, setValue] = useState(emptyAnswers(definition))
  return (
    <ProjectForm
      definition={definition}
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
      issues={issues}
    />
  )
}

describe("ProjectForm", () => {
  it("renders an input per field kind, with optional fields marked and help shown", () => {
    render(<Form onChange={vi.fn<(value: ProjectAnswers) => void>()} />)
    expect(screen.getByRole("group", { name: "Items" })).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Name" })).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: /^Notes/ })).toBeInTheDocument()
    expect(screen.getByRole("radiogroup", { name: /^Lit at night/ })).toBeInTheDocument()
    expect(screen.getByLabelText(/^Installed on/)).toHaveAttribute("type", "date")
    expect(screen.getByRole("combobox", { name: /^Color/ })).toBeInTheDocument()
    expect(screen.getByText("As the maker names it")).toBeInTheDocument()
    expect(screen.getAllByText("Optional")).toHaveLength(4)
  })

  it("answers from the keyboard, takes a value the list doesn't name, and repeats an item", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn<(value: ProjectAnswers) => void>()
    render(<Form onChange={onChange} />)
    await user.click(screen.getByRole("textbox", { name: "Name" }))
    await user.keyboard("Arbor")
    await user.tab()
    await user.tab()
    await user.keyboard(" ")
    await user.selectOptions(screen.getByRole("combobox", { name: /^Color/ }), "(other)")
    await user.type(screen.getByRole("textbox", { name: "Color, in your words" }), "Sage")
    await user.click(screen.getByRole("button", { name: "Add another item" }))
    expect(screen.getByRole("heading", { name: "Item 2" })).toBeInTheDocument()
    expect(onChange).toHaveBeenLastCalledWith({
      item: [
        { "item.name": "Arbor", "item.notes": null, "item.lit": true, "item.on": null, "item.color": "Sage" },
        { "item.name": null, "item.notes": null, "item.lit": null, "item.on": null, "item.color": null }
      ]
    })
    await user.click(screen.getByRole("button", { name: "Remove Item 2" }))
    expect(screen.queryByRole("heading", { name: "Item 2" })).not.toBeInTheDocument()
  })

  it("shows each issue under its field", () => {
    render(
      <Form
        onChange={vi.fn<(value: ProjectAnswers) => void>()}
        issues={[{ path: ["item", 0, "item.name"], message: 'Answer "Name".' }]}
      />
    )
    expect(screen.getByText('Answer "Name".')).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveAttribute("aria-invalid", "true")
  })
})
