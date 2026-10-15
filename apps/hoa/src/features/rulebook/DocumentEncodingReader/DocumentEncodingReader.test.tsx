import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeMotion } from "@/tests/fakeMotion"
import { simulatedBuildSeconds } from "@/tests/simulatedBuild"
import { readingDocuments, readingResults } from "@/tests/simulatedReading"
import { DocumentEncodingReader } from "./DocumentEncodingReader"
import { beatMs } from "./DocumentEncodingReader.utils"

// The picture's width and the person's motion setting, as each test needs them.
const viewer = vi.hoisted(() => ({ width: 576, isReduced: false }))
vi.mock("@mantine/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@mantine/hooks")>()),
  useElementSize: () => ({ ref: () => undefined, width: viewer.width, height: 0 }),
  useReducedMotion: () => viewer.isReduced
}))

beforeEach(() => {
  viewer.width = 576
  viewer.isReduced = false
})

const documents = readingDocuments(simulatedBuildSeconds)

/** The count a heading in the picture shows. */
const countOf = (label: string) => screen.getByText(label).nextElementSibling?.textContent
/** What the window's caption says. */
const captionOf = (container: HTMLElement) => container.querySelector("[aria-hidden] .border-t")?.textContent

describe("DocumentEncodingReader", () => {
  it("shows the counts, every find's dot and the last thing named, at rest, when the person asked for less motion", () => {
    viewer.isReduced = true
    const { container } = render(
      <DocumentEncodingReader results={readingResults(simulatedBuildSeconds)} documents={documents} isRunning={false} />
    )
    // 12 terms the documents define, and the 51 entries the vocabulary adds, each in its own pile.
    expect(countOf("Defined terms")).toBe("12")
    expect(countOf("Vocabulary")).toBe("51")
    expect(countOf("Rules found")).toBe("37")
    expect(screen.getByText("37 drafted")).toBeInTheDocument()
    expect(container.querySelectorAll("circle")).toHaveLength(12 + 51 + 37)
    expect(container.querySelectorAll('circle[class~="fill-coverage-term"]')).toHaveLength(12)
    expect(container.querySelectorAll('circle[class~="fill-vocabulary"]')).toHaveLength(51)
    expect(container.querySelectorAll('circle[class~="fill-coverage-rule"]')).toHaveLength(37)
    // The roofing rule, drafted again, at its passage.
    expect(captionOf(container)).toBe(
      "Drafted againRoofs of architectural shingles or standing-seam metalA roof must be architectural shingles or standing-seam metal, in an earth tone."
    )
    expect(container.querySelector("[data-active]")?.textContent).toContain("Roofs must be architectural shingles")
    expect(screen.getByText("Declaration of Covenants for Maple Hollow")).toBeInTheDocument()
  })

  it("shows the document's whole title on hover only when the window cuts it short", async () => {
    viewer.isReduced = true
    const user = userEvent.setup()
    render(<DocumentEncodingReader results={readingResults(600)} documents={documents} isRunning />)
    const title = screen.getByText("Declaration of Covenants for Maple Hollow")
    await user.hover(title)
    await new Promise((resolve) => setTimeout(resolve, 800))
    expect(document.querySelector("[data-slot=tooltip-content]")).toBeNull()
    await user.unhover(title)

    Object.defineProperty(title, "scrollWidth", { value: 320 })
    Object.defineProperty(title, "clientWidth", { value: 220 })
    await user.hover(title)
    await waitFor(() =>
      expect(document.querySelector("[data-slot=tooltip-content]")).toHaveTextContent(
        "Declaration of Covenants for Maple Hollow"
      )
    )
  })

  it("shows just the counts until it knows how wide it is", () => {
    viewer.width = 0
    const { container } = render(
      <DocumentEncodingReader results={readingResults(600)} documents={documents} isRunning />
    )
    expect(container.querySelector("svg")).toBeNull()
    expect(container.querySelector("[data-block]")).toBeNull()
    expect(countOf("Defined terms")).toBe("12")
    expect(countOf("Vocabulary")).toBe("22")
  })

  it("gets to a term's passage, marks the term green there, then counts it once it lands", async () => {
    const motion = fakeMotion()
    const { container, rerender } = render(
      <DocumentEncodingReader results={readingResults(15)} documents={documents} isRunning />
    )
    rerender(<DocumentEncodingReader results={readingResults(16)} documents={documents} isRunning />)
    await act(() => motion.advance(16))
    expect(captionOf(container)).toBe("Defined termAssociation")
    // The window gets there first.
    expect(container.querySelector("[data-term-mark]")).toBeNull()

    await act(() => motion.advance(beatMs.move))
    const mark = container.querySelector("[data-term-mark]")
    expect(mark?.textContent).toBe("Association")
    expect(mark?.closest("[data-active]")?.getAttribute("data-block")).toBe("declaration:article-2/association")
    expect(countOf("Defined terms")).toBe("0")

    await act(() => motion.advance(beatMs.term))
    expect(countOf("Defined terms")).toBe("1")
  })

  it("fills a drafted rule's blanks one at a time, then calls it drafted", async () => {
    const motion = fakeMotion()
    const { container, rerender } = render(
      <DocumentEncodingReader results={readingResults(838)} documents={documents} isRunning />
    )
    rerender(<DocumentEncodingReader results={readingResults(839)} documents={documents} isRunning />)
    const blanks = () => container.querySelectorAll("[aria-hidden] .border-t .text-transparent").length
    await act(() => motion.advance(16))
    // "Each {{lot}} may hold only one single-family {{dwelling}}.": a term, a value and a term.
    expect(captionOf(container)).toContain("DraftingLots hold one single-family home")
    expect(blanks()).toBe(3)
    expect(container.querySelector("[data-active]")?.getAttribute("data-block")).toBe("declaration:3.1")

    await act(() => motion.advance(beatMs.move))
    expect(blanks()).toBe(2)
    await act(() => motion.advance(2 * beatMs.blank))
    expect(blanks()).toBe(0)
    // The last word holds a moment before the draft is done.
    await act(() => motion.advance(beatMs.blank))
    expect(captionOf(container)).toBe(
      "DraftedLots hold one single-family homeEach lot may hold only one single-family dwelling."
    )
    await act(() => motion.advance(32))
    expect(screen.getByText("1 drafted")).toBeInTheDocument()
  })
})
