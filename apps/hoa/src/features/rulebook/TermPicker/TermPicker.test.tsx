import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { TermPicker } from "./TermPicker"
import type { TermOption } from "./TermPicker.utils"

const options: TermOption[] = [
  { key: "deck", label: "deck", hint: "deck" },
  { key: "fence", label: "fence", hint: "fence" },
  { key: "fence.height", label: "fence height", hint: "fence.height" },
  { key: "pool", label: "swimming pool", hint: "pool" }
]

function setup(value: string | null = null) {
  const onChange = vi.fn<(key: string | null) => void>()
  render(<TermPicker label="Term" value={value} options={options} onChange={onChange} />)
  return { user: userEvent.setup(), onChange }
}

const optionNames = () => screen.getAllByRole("option").map((option) => option.textContent)

describe("TermPicker", () => {
  it("narrows the terms through a typo and a partial word, best match first", async () => {
    const { user, onChange } = setup()
    await user.type(screen.getByRole("combobox", { name: "Term" }), "fense")
    expect(optionNames()).toEqual(["fencefence", "fence heightfence.height"])
    await user.clear(screen.getByRole("combobox", { name: "Term" }))
    await user.type(screen.getByRole("combobox", { name: "Term" }), "swim")
    expect(optionNames()).toEqual(["swimming poolpool"])
    await user.keyboard("{ArrowDown}{Enter}")
    expect(onChange).toHaveBeenCalledWith("pool")
  })

  it("lists every term when the input shows the chosen one", async () => {
    const { user } = setup("fence")
    expect(screen.getByRole("combobox", { name: "Term" })).toHaveValue("fence")
    await user.click(screen.getByRole("combobox", { name: "Term" }))
    await user.keyboard("{ArrowDown}")
    expect(await screen.findAllByRole("option")).toHaveLength(options.length)
  })
})
