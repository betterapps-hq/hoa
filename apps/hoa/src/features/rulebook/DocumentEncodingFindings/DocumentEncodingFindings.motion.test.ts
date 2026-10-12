import { describe, expect, it } from "vitest"
import { fakeMotion } from "@/tests/fakeMotion"
import { FindingsMotion, type Shown } from "./DocumentEncodingFindings.motion"
import { findingsLayout, pageLines, scanRange, slotCenter } from "./DocumentEncodingFindings.utils"

const layout = findingsLayout(576, { terms: 40, rules: 40 })
const lines = pageLines(layout.page)

/** An engine drawing into a fresh layer, with the scan line at `scanY`, and everything it showed. */
function start(initial: Shown, scanY: number | null = null) {
  const motion = fakeMotion()
  const layer = document.createElementNS("http://www.w3.org/2000/svg", "g")
  const shown: Shown[] = []
  const engine = new FindingsMotion(
    { layer, layout: () => layout, scanY: () => scanY, show: (value) => shown.push(value) },
    initial
  )
  return { motion, layer, shown, engine }
}

/** The flying dots of a kind, by their class: not their trails, which start a moment later, nor the lit lines. */
const flightsOf = (motion: ReturnType<typeof fakeMotion>, className: string) =>
  motion.animations.filter(
    (item) =>
      item.element.localName === "circle" &&
      item.element.getAttribute("class") === className &&
      item.options.delay === undefined
  )

describe("FindingsMotion", () => {
  it("shows what was found before it started, without flying it in", async () => {
    const { motion, layer, shown } = start({ terms: 5, rules: 3, drafted: 1 })
    await motion.advance(100)
    expect(shown).toEqual([{ terms: 5, rules: 3, drafted: 1 }])
    expect(motion.animations).toHaveLength(0)
    expect(layer.childElementCount).toBe(0)
  })

  it("flies each new find from the page line the scan is on into its dot, counting it as it lands", async () => {
    const { motion, layer, shown, engine } = start({ terms: 0, rules: 0, drafted: 0 }, scanRange(layout.page).top)
    engine.sync({ terms: 3, rules: 2, drafted: 0 })
    await motion.advance(16)

    // The first term is in the air, leaving the top line, lit in its color.
    const lit = layer.querySelector("rect")
    expect(lit?.getAttribute("y")).toBe(String((lines[0]?.y ?? 0) - 1.2))
    expect(lit?.getAttribute("class")).toBe("fill-coverage-term")
    const [first] = flightsOf(motion, "fill-coverage-term")
    const to = slotCenter(layout, "terms", 0)
    expect(first?.keyframes.at(-1)?.transform).toBe(`translate(${to.x}px, ${to.y}px) scale(1)`)

    await motion.advance(3000)
    expect(shown.at(-1)).toEqual({ terms: 3, rules: 2, drafted: 0 })
    // Counts only rise as finds land, one kind's finds after the other's.
    const terms = shown.map((value) => value.terms)
    expect(terms).toEqual([...terms].sort((a, b) => a - b))
    expect(flightsOf(motion, "fill-coverage-rule/40 stroke-coverage-rule")).toHaveLength(2)
    // Every flight and light is gone once it's done.
    expect(layer.childElementCount).toBe(0)
  })

  it("fills drafted rules one at a time, each with a ring", async () => {
    const { motion, shown, engine } = start({ terms: 0, rules: 3, drafted: 0 })
    engine.sync({ terms: 0, rules: 3, drafted: 2 })
    // One frame drafts the first; the next shows it.
    await motion.advance(32)
    expect(shown.at(-1)?.drafted).toBe(1)
    await motion.advance(1000)
    expect(shown.at(-1)).toEqual({ terms: 0, rules: 3, drafted: 2 })
    expect(
      motion.animations.filter((item) => item.element.getAttribute("class") === "fill-none stroke-coverage-rule")
    ).toHaveLength(2)
  })

  it("takes back finds the build withdrew: their dots fade, and flights to them stop", async () => {
    const { motion, shown, engine } = start({ terms: 5, rules: 0, drafted: 0 })
    engine.sync({ terms: 8, rules: 0, drafted: 0 })
    await motion.advance(16)
    const [inTheAir] = flightsOf(motion, "fill-coverage-term")
    engine.sync({ terms: 4, rules: 0, drafted: 0 })
    expect(inTheAir?.wasCanceled()).toBe(true)

    await motion.advance(3000)
    expect(shown.at(-1)).toEqual({ terms: 4, rules: 0, drafted: 0 })
    expect(Math.max(...shown.slice(1).map((value) => value.terms))).toBe(4)
    // The one dot taken back fades where it was.
    const faded = motion.animations.filter(
      (item) => item.keyframes.at(-1)?.opacity === 0 && item.options.duration === 320
    )
    const gone = slotCenter(layout, "terms", 4)
    expect(faded.map((item) => item.keyframes[0]?.transform)).toEqual([`translate(${gone.x}px, ${gone.y}px) scale(1)`])
  })

  it("stops everything when it's done with", async () => {
    const { motion, layer, shown, engine } = start({ terms: 0, rules: 0, drafted: 0 })
    engine.sync({ terms: 3, rules: 0, drafted: 0 })
    await motion.advance(16)
    const before = shown.length
    engine.destroy()
    expect(layer.childElementCount).toBe(0)
    await motion.advance(3000)
    expect(shown).toHaveLength(before)
  })
})
