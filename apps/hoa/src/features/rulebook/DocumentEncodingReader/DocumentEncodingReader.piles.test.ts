import { describe, expect, it } from "vitest"
import {
  flightKeyframes,
  flightPeak,
  slotCenter,
  trailKeyframes,
  type PilesLayout,
  type Point
} from "./DocumentEncodingReader.piles"

describe("slotCenter", () => {
  it("piles each kind's dots up from the bottom, every row starting beside the window", () => {
    const layout = {
      pitch: 10,
      gridBottom: 130,
      terms: { inner: 238, side: -1, columns: 23 },
      rules: { inner: 338, side: 1, columns: 23 }
    } satisfies PilesLayout
    expect(slotCenter(layout, "terms", 0)).toEqual({ x: 233, y: 125 })
    expect(slotCenter(layout, "terms", 1)).toEqual({ x: 223, y: 125 })
    expect(slotCenter(layout, "rules", 0)).toEqual({ x: 343, y: 125 })
    expect(slotCenter(layout, "rules", 22)).toEqual({ x: 563, y: 125 })
    expect(slotCenter(layout, "rules", 23)).toEqual({ x: 343, y: 115 })
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
