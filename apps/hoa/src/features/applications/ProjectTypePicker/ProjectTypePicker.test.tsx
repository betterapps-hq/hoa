import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { ProjectTypePicker, somethingElse, type ProjectTypePickerProps } from "./ProjectTypePicker"

const types = [
  { id: "type-1", label: "Garden structure", description: "Building or changing a structure in the yard" },
  { id: "type-2", label: "Exterior change", description: null }
]

function Picker({ onChange, errors }: Pick<ProjectTypePickerProps, "onChange" | "errors">) {
  const [value, setValue] = useState("")
  return (
    <ProjectTypePicker
      types={types}
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
      errors={errors}
    />
  )
}

describe("ProjectTypePicker", () => {
  it("offers the organization's project types with what each covers, then something else", () => {
    render(<Picker onChange={vi.fn<(value: string) => void>()} errors={[]} />)
    expect(screen.getByRole("radiogroup")).toBeInTheDocument()
    expect(screen.getAllByRole("radio").map((radio) => radio.getAttribute("aria-checked"))).toEqual([
      "false",
      "false",
      "false"
    ])
    expect(screen.getByRole("radio", { name: /^Garden structure/ })).toBeInTheDocument()
    expect(screen.getByText("Building or changing a structure in the yard")).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: /^Something else/ })).toBeInTheDocument()
    expect(screen.getByText("A project the list doesn't name.")).toBeInTheDocument()
  })

  it("gives the chosen type's id, or something else, by pointer or keyboard", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn<(value: string) => void>()
    render(<Picker onChange={onChange} errors={[]} />)
    await user.click(screen.getByRole("radio", { name: /^Garden structure/ }))
    expect(onChange).toHaveBeenLastCalledWith("type-1")
    await user.keyboard("{ArrowDown}")
    expect(onChange).toHaveBeenLastCalledWith("type-2")
    await user.click(screen.getByRole("radio", { name: /^Something else/ }))
    expect(onChange).toHaveBeenLastCalledWith(somethingElse)
  })

  it("shows why a choice is needed", () => {
    render(<Picker onChange={vi.fn<(value: string) => void>()} errors={[{ message: "Choose the kind of project." }]} />)
    expect(screen.getByText("Choose the kind of project.")).toBeInTheDocument()
  })
})
