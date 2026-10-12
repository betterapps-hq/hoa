import { describe, expect, it } from "vitest"
import { fakeMotion } from "@/tests/fakeMotion"
import { simulatedBuildSeconds } from "@/tests/simulatedBuild"
import { readingDocument, readingResults } from "@/tests/simulatedReading"
import type { Shown } from "../DocumentEncodingFindings/DocumentEncodingFindings.motion"
import { slotCenter, type Point } from "../DocumentEncodingFindings/DocumentEncodingFindings.utils"
import { ReaderMotion } from "./DocumentEncodingReader.motion"
import {
  beatMs,
  countsOf,
  nextSpot,
  readerDocuments,
  readerEvents,
  readerLayout,
  type ReaderEvent,
  type Scene
} from "./DocumentEncodingReader.utils"

const documents = readerDocuments([readingDocument])
const layout = readerLayout(576, { terms: 63, rules: 37 })
const everything = readerEvents(readingResults(simulatedBuildSeconds), documents)

const terms = everything.filter((event) => event.kind === "term")
const passageAt = (label: string) =>
  everything.find((event) => event.kind === "passage" && event.spot?.blockKey === `declaration:${label}`)
const residentialUse = passageAt("3.1")
const drafts = everything.filter((event) => event.kind === "draft")
const firstDraft = drafts[0]
const draftedAgain = drafts.find((event) => event.kind === "draft" && event.isRetry)

/** An engine drawing into a fresh layer, finds leaving from `origin`, and every scene and count it showed. */
function start(initial: readonly ReaderEvent[], isRunning = true, origin: Point | null = { x: 288, y: 120 }) {
  const motion = fakeMotion()
  const layer = document.createElementNS("http://www.w3.org/2000/svg", "g")
  const scenes: Scene[] = []
  const shown: Shown[] = []
  const engine = new ReaderMotion(
    {
      layer,
      layout: () => layout,
      origin: () => origin,
      play: (scene) => scenes.push(scene),
      show: (value) => shown.push(value),
      next: (spot) => nextSpot(documents, spot)
    },
    initial,
    isRunning
  )
  return { motion, layer, scenes, shown, engine }
}

/** The finds in the air: their heads, not their trails, which start a moment later. */
const flightsOf = (motion: ReturnType<typeof fakeMotion>) =>
  motion.animations.filter((item) => item.element.localName === "circle" && item.options.delay === undefined)

const momentsOf = (scenes: readonly Scene[], event: ReaderEvent | undefined) =>
  scenes.filter((scene) => scene.event === event).map((scene) => [scene.phase, scene.step])

describe("ReaderMotion", () => {
  it("shows what was found before it opened without flying it in, and reads on from where the build was", async () => {
    const initial = readerEvents(readingResults(600), documents)
    const { motion, layer, scenes, shown } = start(initial)
    await motion.advance(100)
    expect(shown).toEqual([countsOf(initial)])
    expect(flightsOf(motion)).toHaveLength(0)
    expect(layer.childElementCount).toBe(0)
    // The last term named, "tenant", is first used where Resident is defined; the window drifts on from there.
    expect(scenes.map((scene) => [scene.phase, scene.spot?.blockKey])).toEqual([
      ["drift", "declaration:article-2/resident"]
    ])
    await motion.advance(beatMs.drift)
    expect(scenes.at(-1)).toMatchObject({ phase: "drift", spot: { blockKey: "declaration:article-2/vehicle" } })
  })

  it("gets to each term's passage, marks the term, then flies it to its pile and counts it as it lands", async () => {
    const [lot, owner] = terms
    const { motion, scenes, shown, engine } = start([])
    engine.sync([lot, owner].filter((event) => event !== undefined))
    await motion.advance(16)
    expect(momentsOf(scenes, lot)).toEqual([["found", 0]])
    expect(scenes.at(-1)?.spot).toEqual({ documentKey: "declaration", blockKey: lot?.spot?.blockKey })

    await motion.advance(beatMs.move + beatMs.mark)
    expect(momentsOf(scenes, lot)).toEqual([
      ["found", 0],
      ["found", 1],
      ["found", 1]
    ])
    const [flight] = flightsOf(motion)
    const to = slotCenter(layout, "terms", 0)
    expect(flight?.keyframes[0]?.transform).toBe("translate(288px, 120px) scale(0.2)")
    expect(flight?.keyframes.at(-1)?.transform).toBe(`translate(${to.x}px, ${to.y}px) scale(1)`)
    expect(shown.at(-1)?.terms ?? 0).toBe(0)

    await motion.advance(1000)
    expect(shown.at(-1)).toEqual({ terms: 1, rules: 0, drafted: 0 })
    // One beat at a time: the next term shows once this one is done.
    expect(momentsOf(scenes, owner)).toEqual([["found", 0]])
    await motion.advance(3000)
    expect(shown.at(-1)).toEqual({ terms: 2, rules: 0, drafted: 0 })
  })

  it("scans a passage, then gives it its verdict and flies each rule found in it to the rules", async () => {
    const { motion, scenes, shown, engine } = start([])
    engine.sync([residentialUse].filter((event) => event !== undefined))
    await motion.advance(16)
    expect(momentsOf(scenes, residentialUse)).toEqual([["scan", 0]])
    await motion.advance(beatMs.scan + beatMs.rule)
    expect(momentsOf(scenes, residentialUse)).toEqual([
      ["scan", 0],
      ["verdict", 0],
      ["verdict", 1]
    ])
    await motion.advance(2000)
    expect(flightsOf(motion)).toHaveLength(2)
    expect(shown.at(-1)).toEqual({ terms: 0, rules: 2, drafted: 0 })
  })

  it("fills a drafted rule's blanks and then its dot, with a ring; a second draft shows the problem and fills nothing", async () => {
    const { motion, scenes, shown, engine } = start([residentialUse].filter((event) => event !== undefined))
    engine.sync([residentialUse, firstDraft, draftedAgain].filter((event) => event !== undefined))
    await motion.advance(6000)
    // "Each {{lot}} may hold only one single-family {{dwelling}}.": three blanks.
    expect(momentsOf(scenes, firstDraft)).toEqual([
      ["fill", 0],
      ["fill", 1],
      ["fill", 2],
      ["fill", 3],
      ["drafted", 3]
    ])
    expect(momentsOf(scenes, draftedAgain)[0]).toEqual(["problem", 0])
    expect(momentsOf(scenes, draftedAgain).at(-1)?.[0]).toBe("drafted")
    expect(shown.at(-1)).toEqual({ terms: 0, rules: 2, drafted: 1 })
    expect(
      motion.animations.filter((item) => item.element.getAttribute("class") === "fill-none stroke-coverage-rule")
    ).toHaveLength(1)
  })

  it("counts a find at once when nothing shows where it leaves from", async () => {
    const { motion, shown, engine } = start([], true, null)
    engine.sync(terms.slice(0, 1))
    await motion.advance(beatMs.term + 32)
    expect(flightsOf(motion)).toHaveLength(0)
    expect(shown.at(-1)).toEqual({ terms: 1, rules: 0, drafted: 0 })
  })

  it("takes back what the build dropped: its dots fade, and what's waiting never plays", async () => {
    const [queued] = terms
    const { motion, scenes, shown, engine } = start([residentialUse].filter((event) => event !== undefined))
    await motion.advance(16)
    engine.sync([residentialUse, queued].filter((event) => event !== undefined))
    engine.sync([])
    await motion.advance(2000)
    expect(shown.at(-1)).toEqual({ terms: 0, rules: 0, drafted: 0 })
    const faded = motion.animations.filter((item) => item.options.duration === 320)
    expect(faded).toHaveLength(2)
    expect(momentsOf(scenes, queued)).toEqual([])
  })

  it("plays what's left quickly once the build has stopped, then rests at the last thing it showed", async () => {
    const named = terms.slice(0, 10)
    const { motion, scenes, shown, engine } = start([], false)
    await motion.advance(16)
    expect(scenes).toEqual([{ event: null, spot: null, phase: "rest", step: 0, ms: 0, moveMs: 900 }])
    engine.sync(named)
    // Ten terms' worth of beats, 15 seconds at their own pace, take about four.
    await motion.advance(5000)
    expect(shown.at(-1)?.terms).toBe(10)
    expect(scenes.at(-1)).toMatchObject({ event: named.at(-1), phase: "found", step: 1 })
    expect(scenes.some((scene) => scene.phase === "drift")).toBe(false)
  })

  it("lands at once what's too far behind to play, and keeps its counts true", async () => {
    const many: ReaderEvent[] = Array.from({ length: 400 }, (_, index) => ({
      kind: "term",
      id: `term:${index}`,
      label: `Term ${index}`,
      spot: null
    }))
    const { motion, shown, engine } = start([])
    engine.sync(many)
    await motion.advance(32)
    // 400 terms of 1.5 seconds play no faster than 8 times: the oldest beyond a minute land at once.
    expect(shown.at(-1)?.terms).toBe(80)
    engine.destroy()
  })

  it("stops everything when it's done with", async () => {
    const { motion, layer, shown, engine } = start([])
    engine.sync(terms.slice(0, 3))
    await motion.advance(beatMs.move + beatMs.mark + 16)
    expect(layer.childElementCount).toBeGreaterThan(0)
    const before = shown.length
    engine.destroy()
    expect(layer.childElementCount).toBe(0)
    await motion.advance(5000)
    expect(shown).toHaveLength(before)
  })
})
