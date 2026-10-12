import { act, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeMotion } from "@/tests/fakeMotion"
import { BuildFindings } from "./BuildFindings"

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

/** The count a heading in the picture shows. */
const countOf = (label: string) => screen.getByText(label).nextElementSibling?.textContent

describe("BuildFindings", () => {
  it("shows the counts and every find's dot at once when the person asked for less motion", () => {
    viewer.isReduced = true
    const { container } = render(
      <BuildFindings counts={{ terms: 182, rulesFound: 95, rulesDrafted: 40 }} documents={1} isRunning />
    )
    expect(countOf("Terms found")).toBe("182")
    expect(countOf("Rules found")).toBe("95")
    expect(screen.getByText("40 drafted")).toBeInTheDocument()
    expect(container.querySelectorAll("circle")).toHaveLength(182 + 95)
    // Drafted rules are filled; the rest are open.
    expect(container.querySelectorAll('circle[class~="fill-coverage-rule"]')).toHaveLength(40)
  })

  it("shows just the counts until it knows how wide it is", () => {
    viewer.width = 0
    const { container } = render(
      <BuildFindings counts={{ terms: 18, rulesFound: 0, rulesDrafted: 0 }} documents={1} isRunning />
    )
    expect(container.querySelector("svg")).toBeNull()
    expect(countOf("Terms found")).toBe("18")
    expect(screen.queryByText(/drafted/)).toBeNull()
  })

  it("counts new finds as they land, and shows the stack of documents it reads", async () => {
    const motion = fakeMotion()
    const { container, rerender } = render(
      <BuildFindings counts={{ terms: 18, rulesFound: 0, rulesDrafted: 0 }} documents={3} isRunning />
    )
    // What was found before it opened shows at once.
    await act(() => motion.advance(16))
    expect(countOf("Terms found")).toBe("18")
    // Two pages behind the one being read, with its folded corner.
    expect(container.querySelectorAll("path.fill-card")).toHaveLength(3)

    rerender(<BuildFindings counts={{ terms: 30, rulesFound: 0, rulesDrafted: 0 }} documents={3} isRunning />)
    await act(() => motion.advance(1000))
    const midway = Number(countOf("Terms found"))
    expect(midway).toBeGreaterThan(18)
    expect(midway).toBeLessThan(30)

    await act(() => motion.advance(2000))
    expect(countOf("Terms found")).toBe("30")
    expect(container.querySelectorAll('circle[class~="fill-coverage-term"]')).toHaveLength(30)
  })

  it("lets the scan line fade where it is when the build stops", async () => {
    const motion = fakeMotion()
    const counts = { terms: 18, rulesFound: 95, rulesDrafted: 95 }
    const { container, rerender } = render(<BuildFindings counts={counts} documents={1} isRunning />)
    const scan = () => container.querySelector("[clip-path] > g")
    expect(scan()).toHaveClass("opacity-100")
    const scanning = motion.animations.find((item) => item.options.iterations === Infinity)
    expect(scanning?.animation.playState).not.toBe("paused")

    rerender(<BuildFindings counts={counts} documents={1} isRunning={false} />)
    expect(scan()).toHaveClass("opacity-0")
    expect(scanning?.animation.playState).toBe("paused")
  })
})
