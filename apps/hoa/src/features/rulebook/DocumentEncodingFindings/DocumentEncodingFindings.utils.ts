// The picture of what a build finds (encoding.md, UX, The build's progress): the page being read in the middle, and a
// grid of dots on each side of it, terms to the left and rules to the right, one dot per find. Each grid piles up from
// the bottom, every row starting beside the page, so a find flies over neither the other kind's grid nor the dots
// already landed in its own, and the two piles' heights compare the counts. Coordinates are CSS pixels from the
// picture's top left.

export type Point = { x: number; y: number }
export type Box = { x: number; y: number; width: number; height: number }

/** The kinds of find, each with its own grid. */
export type FindKind = "terms" | "rules"

/** The page's column and the gaps beside it: the counts above the grids sit in the same columns. */
export const pageColumn = 52
export const columnGap = 24
/** The counts above each grid. */
const headerHeight = 66
/** The grids' height: dots shrink to keep every find in it, so the picture never grows while the build runs. */
const gridHeight = 64
/** Distances between dot centers, largest first. */
const pitches = [10, 8, 7, 6, 5, 4]
const pageWidth = 46
const pageHeight = 62

/** A kind's grid: each row starts beside the page and runs away from it. */
export type GridLayout = {
  /** Where the grid meets the gap beside the page. */
  inner: number
  /** Which way rows run from `inner`: -1 left of the page, 1 right of it. */
  side: -1 | 1
  columns: number
}

export type FindingsLayout = {
  width: number
  height: number
  /** Distance between dot centers. */
  pitch: number
  radius: number
  /** Where the grids' space starts, under the counts. */
  gridTop: number
  /** What the piles stand on. */
  gridBottom: number
  page: Box
  terms: GridLayout
  rules: GridLayout
}

/**
 * The largest dots that keep this many finds of each kind in two grids `gridWidth` wide within `gridHeight`, with the
 * grids' height: dots shrink to keep every find in it, and only the smallest let it grow.
 */
export function gridFit(gridWidth: number, counts: Record<FindKind, number>, gridHeight: number) {
  const columnsAt = (pitch: number) => Math.max(1, Math.floor(gridWidth / pitch))
  const rowsAt = (pitch: number) =>
    Math.max(Math.ceil(counts.terms / columnsAt(pitch)), Math.ceil(counts.rules / columnsAt(pitch)))
  const pitch = pitches.find((candidate) => rowsAt(candidate) * candidate <= gridHeight) ?? pitches.at(-1) ?? 4
  // Before the picture is measured it has no grid to fill: it keeps its usual height so nothing jumps.
  const height = gridWidth > 0 ? Math.max(gridHeight, rowsAt(pitch) * pitch) : gridHeight
  return { pitch, columns: columnsAt(pitch), height }
}

/** The picture at `width` for this many finds of each kind. */
export function findingsLayout(width: number, counts: Record<FindKind, number>): FindingsLayout {
  const gridWidth = Math.max(0, (width - pageColumn - 2 * columnGap) / 2)
  const { pitch, columns, height: gridsHeight } = gridFit(gridWidth, counts, gridHeight)
  return {
    width,
    height: headerHeight + gridsHeight,
    pitch,
    radius: pitch * 0.34,
    gridTop: headerHeight,
    gridBottom: headerHeight + gridsHeight,
    page: {
      x: gridWidth + columnGap + (pageColumn - pageWidth) / 2,
      y: headerHeight + Math.round((gridsHeight - pageHeight) / 2),
      width: pageWidth,
      height: pageHeight
    },
    terms: { inner: gridWidth, side: -1, columns },
    rules: { inner: gridWidth + 2 * columnGap + pageColumn, side: 1, columns }
  }
}

/** The piles' part of a picture's layout. */
export type PilesLayout = Pick<FindingsLayout, "pitch" | "gridBottom" | "terms" | "rules">

/** Where the dot for a kind's `index`th find sits: row by row up from the bottom, each row from beside the page out. */
export function slotCenter(layout: PilesLayout, kind: FindKind, index: number): Point {
  const { pitch, gridBottom } = layout
  const { inner, side, columns } = layout[kind]
  return {
    x: inner + side * ((index % columns) * pitch + pitch / 2),
    y: gridBottom - Math.floor(index / columns) * pitch - pitch / 2
  }
}

/** The page's lines of text, as bars of the lengths a paragraph's lines have. */
const lineLengths = [0.62, 0.94, 0.86, 0.97, 0.7, 0.92, 0.88, 0.95, 0.54]

export function pageLines(page: Box): Box[] {
  const inset = 6
  const top = page.y + 11
  const step = (page.height - 11 - 9) / (lineLengths.length - 1)
  return lineLengths.map((length, index) => ({
    x: page.x + inset,
    y: top + index * step - 1.1,
    width: (page.width - 2 * inset) * length,
    height: 2.2
  }))
}

/** How far the scan line travels down the page and back. */
export function scanRange(page: Box) {
  return { top: page.y + 8, bottom: page.y + page.height - 8 }
}

/** The page line nearest the scan line, where a find starts. */
export function lineAt(lines: readonly Box[], y: number): Box | undefined {
  return lines.reduce<Box | undefined>(
    (nearest, line) => (nearest === undefined || Math.abs(line.y - y) < Math.abs(nearest.y - y) ? line : nearest),
    undefined
  )
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const transform = ({ x, y }: Point, scale: number) => `translate(${x}px, ${y}px) scale(${scale})`
/** Past where it's going, then back: for a find popping out of its line and settling on its dot. */
const overshoot = "cubic-bezier(0.34, 1.56, 0.64, 1)"

/** When a flight's travel ends and its landing bounce starts, as a share of its time. */
const travelEnd = 0.8

/**
 * How high a find's flight goes: `lift` pixels above its higher end, but never above `ceiling`, so it doesn't cross
 * the counts above the grids.
 */
export function flightPeak(from: Point, to: Point, lift: number, ceiling: number) {
  return Math.max(ceiling, Math.min(from.y, to.y) - lift)
}

/**
 * A find's flight from its line on the page to its dot: it pops out of the line, arcs with its highest point at `peak`
 * (or at its higher end, when that's higher), and lands with a bounce. Keyframes for `Element.animate`: the arc is
 * eased in its points, linear between them; the pop and the landing ease each on their own.
 */
export function flightKeyframes(from: Point, to: Point, peak: number): Keyframe[] {
  // A quadratic curve's highest point is `apex` when its control point is above it by the geometric mean of how far
  // each end is below it. The control point halfway across keeps the flight's sideways speed even.
  const apex = Math.min(peak, from.y, to.y)
  const control = { x: (from.x + to.x) / 2, y: apex - Math.sqrt((from.y - apex) * (to.y - apex)) }
  const along = (t: number): Point => ({
    x: (1 - t) ** 2 * from.x + 2 * (1 - t) * t * control.x + t ** 2 * to.x,
    y: (1 - t) ** 2 * from.y + 2 * (1 - t) * t * control.y + t ** 2 * to.y
  })
  const steps = 20
  const start = 0.1
  return [
    { offset: 0, transform: transform(from, 0.2), opacity: 0, easing: overshoot },
    { offset: start, transform: transform(from, 1.25), opacity: 1 },
    ...Array.from({ length: steps }, (_, index) => {
      const t = (index + 1) / steps
      return {
        offset: start + (travelEnd - start) * t,
        transform: transform(along(easeInOut(t)), 1.25 - 0.25 * t),
        opacity: 1,
        ...(index === steps - 1 ? { easing: "ease-out" } : {})
      }
    }),
    { offset: 0.9, transform: transform(to, 1.4), opacity: 1, easing: overshoot },
    { offset: 1, transform: transform(to, 1), opacity: 1 }
  ]
}

/** The faint trail behind a find: its path, fading out before it lands. */
export function trailKeyframes(flight: readonly Keyframe[]): Keyframe[] {
  return flight.map((frame) => {
    const offset = frame.offset ?? 0
    return { ...frame, opacity: offset === 0 || offset >= travelEnd ? 0 : 0.25 }
  })
}

/**
 * Milliseconds between the launches of `count` finds that arrive together: a burst takes about a second and a half
 * however big it is, and a few finds still go one by one.
 */
export function launchGap(count: number) {
  return Math.min(90, Math.max(16, 1400 / Math.max(1, count)))
}
