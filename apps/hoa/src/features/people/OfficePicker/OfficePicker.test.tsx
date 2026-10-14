import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it } from "vitest"
import { OfficePicker } from "./OfficePicker"

function Picker({ office }: { office: string }) {
  const [value, setValue] = useState(office)
  return (
    <>
      <OfficePicker id="office" label="Office" value={value} onChange={setValue} />
      <output>{value}</output>
    </>
  )
}

describe("OfficePicker", () => {
  it("picks one of the usual officers", async () => {
    const user = userEvent.setup()
    render(<Picker office="" />)
    expect(screen.getByRole("combobox", { name: "Office" })).toHaveValue("")
    await user.selectOptions(screen.getByRole("combobox", { name: "Office" }), "Treasurer")
    expect(screen.getByRole("status")).toHaveTextContent("Treasurer")
    expect(screen.queryByRole("textbox", { name: "Office title" })).not.toBeInTheDocument()
  })

  it("takes another title, typed in under Other", async () => {
    const user = userEvent.setup()
    render(<Picker office="Secretary" />)
    await user.selectOptions(screen.getByRole("combobox", { name: "Office" }), "Other")
    expect(screen.getByRole("status")).toBeEmptyDOMElement()
    await user.type(screen.getByRole("textbox", { name: "Office title" }), "Member at large")
    expect(screen.getByRole("status")).toHaveTextContent("Member at large")
  })

  it("opens a title it doesn't list under Other", () => {
    render(<Picker office="Social chair" />)
    expect(screen.getByRole("combobox", { name: "Office" })).toHaveValue("other")
    expect(screen.getByRole("textbox", { name: "Office title" })).toHaveValue("Social chair")
  })
})
