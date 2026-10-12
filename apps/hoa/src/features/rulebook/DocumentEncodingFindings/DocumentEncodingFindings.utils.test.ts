import { describe, expect, it } from "vitest"
import {
  findingsLayout,
  flightKeyframes,
  flightPeak,
  launchGap,
  lineAt,
  pageLines,
  scanRange,
  slotCenter,
  trailKeyframes,
  type Point
} from "./DocumentEncodingFindings.utils"

describe("findingsLayout", () => {
  it("puts the page in the middle, a grid on each side of it, and the grids under the counts", () => {
    // (576 - 52 for the page's column - 2 × 24 between columns) / 2 = 238 for each grid.
    const layout = findingsLayout(576, { terms: 18, rules: 50 })
    expect(layout.terms).toEqual({ inner: 238, side: -1, columns: 23 })
    expect(layout.rules).toEqual({ inner: 338, side: 1, columns: 23 })
    expect(layout.page.x + layout.page.width / 2).toBe(288)
    expect(layout).toMatchObject({ pitch: 10, gridTop: 66, height: 130 })
    expect(layout.page.y).toBeGreaterThanOrEqual(layout.gridTop)
    expect(layout.page.y + layout.page.height).toBeLessThanOrEqual(layout.height)
  })

  it("shrinks the dots to keep every find in the grids, and grows only when the smallest don't fit", () => {
    expect(findingsLayout(576, { terms: 182, rules: 95 }).pitch).toBe(8)
    expect(findingsLayout(576, { terms: 892, rules: 617 })).toMatchObject({ pitch: 4, height: 130 })
    const phone = findingsLayout(343, { terms: 892, rules: 617 })
    expect(phone.pitch).toBe(4)
    // 892 terms in 30 columns: 30 rows of 4 pixels.
    expect(phone.height).toBe(66 + 120)
  })

  it("keeps its usual height before it's measured", () => {
    expect(findingsLayout(0, { terms: 892, rules: 617 }).height).toBe(130)
  })
})

describe("slotCenter", () => {
  it("piles each kind's dots up from the bottom, every row starting beside the page", () => {
    const layout = findingsLayout(576, { terms: 18, rules: 50 })
    expect(slotCenter(layout, "terms", 0)).toEqual({ x: 233, y: 125 })
    expect(slotCenter(layout, "terms", 1)).toEqual({ x: 223, y: 125 })
    expect(slotCenter(layout, "rules", 0)).toEqual({ x: 343, y: 125 })
    expect(slotCenter(layout, "rules", 22)).toEqual({ x: 563, y: 125 })
    expect(slotCenter(layout, "rules", 23)).toEqual({ x: 343, y: 115 })
  })
})

describe("the page", () => {
  const { page } = findingsLayout(576, { terms: 0, rules: 0 })
  const lines = pageLines(page)

  it("has lines of text on it, which the scan line passes over top to bottom", () => {
    for (const line of lines) {
      expect(line.x).toBeGreaterThan(page.x)
      expect(line.x + line.width).toBeLessThan(page.x + page.width)
      expect(line.y).toBeGreaterThan(page.y)
      expect(line.y + line.height).toBeLessThan(page.y + page.height)
    }
    const { top, bottom } = scanRange(page)
    expect(lineAt(lines, top)).toBe(lines[0])
    expect(lineAt(lines, (top + bottom) / 2)).toBe(lines[4])
    expect(lineAt(lines, bottom)).toBe(lines.at(-1))
    expect(lineAt([], top)).toBeUndefined()
  })
})

/** Where each keyframe puts the flying dot. */
const pointsOf = (frames: Keyframe[]): Point[] =>
  frames.map((frame) => {
    const [, x = "", y = ""] = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(String(frame.transform)) ?? []
    return { x: Number(x), y: Number(y) }
  })

describe("a find's flight", () => {
  const from = { x: 280, y: 100 }
  const to = { x: 120, y: 125 }

  it("rises above its higher end, but never into the counts", () => {
    expect(flightPeak(from, to, 12, 62)).toBe(88)
    expect(flightPeak(from, to, 60, 62)).toBe(62)
  })

  it("leaves from its line, arcs as high as its peak and no higher, and lands on its dot", () => {
    const frames = flightKeyframes(from, to, 70)
    const points = pointsOf(frames)
    expect(points[0]).toEqual(from)
    expect(points.at(-1)).toEqual(to)
    expect(frames[0]).toMatchObject({ offset: 0, opacity: 0 })
    expect(frames.at(-1)).toMatchObject({ offset: 1, opacity: 1 })
    const offsets = frames.map((frame) => frame.offset ?? 0)
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b))
    // Its highest sampled point is at the peak, give or take a pixel between samples.
    const highest = Math.min(...points.map((point) => point.y))
    expect(highest).toBeGreaterThanOrEqual(70 - 1e-9)
    expect(highest).toBeLessThan(71.5)
    // It moves one way across, never back.
    const xs = points.map((point) => point.x)
    expect(xs).toEqual([...xs].sort((a, b) => b - a))
  })

  it("doesn't rise when its peak is below its higher end", () => {
    const points = pointsOf(flightKeyframes({ x: 280, y: 60 }, to, 70))
    expect(Math.min(...points.map((point) => point.y))).toBe(60)
  })

  it("leaves a faint trail that's gone before it lands", () => {
    const trail = trailKeyframes(flightKeyframes(from, to, 70))
    expect(trail[0]?.opacity).toBe(0)
    expect(Math.max(...trail.map((frame) => Number(frame.opacity)))).toBe(0.25)
    expect(trail.filter((frame) => (frame.offset ?? 0) >= 0.8).every((frame) => frame.opacity === 0)).toBe(true)
  })
})

describe("launchGap", () => {
  it("spreads a burst of finds over about a second and a half, and sends a few one by one", () => {
    expect(launchGap(1)).toBe(90)
    expect(launchGap(50) * 50).toBe(1400)
    expect(launchGap(1000)).toBe(16)
  })
})
