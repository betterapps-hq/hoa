import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ReaderSheetContext } from "@/features/documents/ReaderSheet/readerSheetContext"
import type { CitedProvision } from "../../rulebook/citedProvision"
import { CitationChips } from "./CitationChips"

vi.mock("@tanstack/react-router", () => ({ useRouter: () => undefined }))

const cited: CitedProvision = {
  provisionKey: "guidelines:2.1",
  label: "Guidelines 2.1",
  documentTitle: "Design Guidelines",
  heading: "Placement",
  intros: [],
  text: "Items stay out of the setback.",
  wrapUps: [],
  highlight: null,
  anchors: []
}

function setup() {
  const open = vi.fn<(href: string) => boolean>(() => true)
  const onRemove = vi.fn<(key: string) => void>()
  render(
    <ReaderSheetContext.Provider value={{ open }}>
      <CitationChips
        keys={[cited.provisionKey, "guidelines:gone"]}
        known={new Map([[cited.provisionKey, cited]])}
        onRemove={onRemove}
      />
    </ReaderSheetContext.Provider>
  )
  return { open, onRemove, user: userEvent.setup() }
}

describe("CitationChips", () => {
  it("opens a chip's passage in the reader sheet from its label, with a real link for a new tab", async () => {
    const { open, onRemove, user } = setup()
    const link = screen.getByRole("link", { name: "Guidelines 2.1" })
    expect(link).toHaveAttribute("href", expect.stringContaining("provision=guidelines%3A2.1"))
    await user.click(link)
    expect(open).toHaveBeenCalledWith(link.getAttribute("href"))
    expect(onRemove).not.toHaveBeenCalled()
  })

  it("removes only from the chip's own button, and flags a passage the rulebook no longer has", async () => {
    const { open, onRemove, user } = setup()
    await user.click(screen.getByRole("button", { name: "Remove Guidelines 2.1" }))
    expect(onRemove).toHaveBeenCalledWith(cited.provisionKey)
    expect(open).not.toHaveBeenCalled()
    expect(screen.queryByRole("link", { name: "Missing passage" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Remove Missing passage" }))
    expect(onRemove).toHaveBeenLastCalledWith("guidelines:gone")
  })
})
