import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { ProjectKindPicker, somethingElse, type ProjectKindPickerProps } from "./ProjectKindPicker"

const kinds = [
  { key: "fence-work", label: "Fence", description: "Building, replacing or changing a fence or a gate" },
  { key: "utility-work", label: "Installation or relocation of utilities", description: null }
]

function Picker({ onChange, errors }: Pick<ProjectKindPickerProps, "onChange" | "errors">) {
  const [value, setValue] = useState("")
  return (
    <ProjectKindPicker
      kinds={kinds}
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
      errors={errors}
    />
  )
}

describe("ProjectKindPicker", () => {
  it("offers the rulebook's kinds with what each covers, then something else", () => {
    render(<Picker onChange={vi.fn<(value: string) => void>()} errors={[]} />)
    expect(screen.getByRole("radiogroup")).toBeInTheDocument()
    expect(screen.getAllByRole("radio").map((radio) => radio.getAttribute("aria-checked"))).toEqual([
      "false",
      "false",
      "false"
    ])
    expect(screen.getByRole("radio", { name: "Fence" })).toBeInTheDocument()
    expect(screen.getByText("Building, replacing or changing a fence or a gate")).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "Something else" })).toBeInTheDocument()
    expect(screen.getByText("A project the list doesn't name.")).toBeInTheDocument()
  })

  it("gives the chosen kind's key, or something else, by pointer or keyboard", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn<(value: string) => void>()
    render(<Picker onChange={onChange} errors={[]} />)
    await user.click(screen.getByRole("radio", { name: "Fence" }))
    expect(onChange).toHaveBeenLastCalledWith("fence-work")
    await user.keyboard("{ArrowDown}")
    expect(onChange).toHaveBeenLastCalledWith("utility-work")
    await user.click(screen.getByRole("radio", { name: "Something else" }))
    expect(onChange).toHaveBeenLastCalledWith(somethingElse)
  })

  it("shows why a choice is needed", () => {
    render(<Picker onChange={vi.fn<(value: string) => void>()} errors={[{ message: "Choose the kind of project." }]} />)
    expect(screen.getByText("Choose the kind of project.")).toBeInTheDocument()
  })
})
