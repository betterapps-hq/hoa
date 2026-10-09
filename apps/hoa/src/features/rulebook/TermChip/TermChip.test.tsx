import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { createVocabulary } from "@/schema/vocabulary"
import { sampleRecords } from "@/tests/rulebookWorkspace"
import { TermChip } from "./TermChip"

const vocabulary = createVocabulary(sampleRecords().terms)

describe("TermChip", () => {
  it("shows the term's label, and on activation its labels, definition and kind", async () => {
    const user = userEvent.setup()
    render(<TermChip termKey="organization" vocabulary={vocabulary} />)
    await user.click(screen.getByRole("button", { name: "Association" }))
    expect(await screen.findByText(/Also written: Trilogy at Redmond Ridge/)).toBeInTheDocument()
    expect(screen.getByText(/^the Trilogy at Redmond Ridge Residential Community Association/)).toBeInTheDocument()
    expect(screen.getByText("A party")).toBeInTheDocument()
    expect(screen.getByText("organization")).toBeInTheDocument()
  })

  it("describes a property by its thing and value type, and flags a key that isn't a term", async () => {
    const user = userEvent.setup()
    render(
      <>
        <TermChip termKey="lease-registration.term" vocabulary={vocabulary} />
        <TermChip termKey="gazebo" vocabulary={vocabulary} />
      </>
    )
    expect(screen.getByTitle("gazebo isn't a term")).toHaveTextContent("gazebo")
    await user.click(screen.getByRole("button"))
    expect(await screen.findByText(/^A property of .+: a quantity in /)).toBeInTheDocument()
  })
})
