import { useElementSize, useReducedMotion } from "@mantine/hooks"
import { useEffect, useId, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { cn } from "@/lib/utils"
import type { FindingCounts } from "../DocumentEncodingSteps/DocumentEncodingSteps.utils"
import { dotClass, draftedClass, FindingsMotion, type Shown } from "./DocumentEncodingFindings.motion"
import {
  findingsLayout,
  pageLines,
  scanRange,
  slotCenter,
  type Box,
  type FindKind,
  type FindingsLayout
} from "./DocumentEncodingFindings.utils"

export type DocumentEncodingFindingsProps = {
  /** What the build has found so far (`findingCounts`). */
  counts: FindingCounts
  /** How many documents the build reads: more than one shows as a stack of pages. */
  documents: number
  /** While the build runs its page is scanned, and each new find flies from the scan line into its dot. */
  isRunning: boolean
}

/**
 * What a build finds, as it finds it (encoding.md, UX, The build's progress): the page being read, with a scan line
 * going over it, between a dot for every term found and one for every rule, each flying from the page into its grid
 * as it arrives. Rules fill in as they're drafted. Only counts are shown, never the finds themselves. Without motion
 * (the person asked for less, or the picture hasn't been measured yet) the dots and counts just show.
 */
export function DocumentEncodingFindings({ counts, documents, isRunning }: DocumentEncodingFindingsProps) {
  const { ref, width } = useElementSize<HTMLDivElement>()
  const isReduced = useReducedMotion()
  const target: Shown = {
    terms: counts.terms,
    rules: Math.max(counts.rulesFound, counts.rulesDrafted),
    drafted: counts.rulesDrafted
  }
  const layout = findingsLayout(width, target)
  const isAnimated = !isReduced && width > 0
  const { shown, layerRef, scanRef } = useFindingsMotion(target, layout, isAnimated, isRunning)
  const visible = isAnimated ? shown : target
  const ids = useId().replace(/[^\w-]/g, "")
  const { top } = scanRange(layout.page)

  return (
    <div ref={ref} className="relative" style={{ height: layout.height }}>
      {width > 0 ? (
        <svg
          aria-hidden
          width={width}
          height={layout.height}
          className="pointer-events-none absolute inset-0 overflow-visible"
        >
          <defs>
            <clipPath id={`${ids}-page`}>
              <path d={pagePath(layout.page)} />
            </clipPath>
            <linearGradient id={`${ids}-scan`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" style={{ stopColor: "var(--color-link)", stopOpacity: 0 }} />
              <stop offset="0.5" style={{ stopColor: "var(--color-link)", stopOpacity: 0.22 }} />
              <stop offset="1" style={{ stopColor: "var(--color-link)", stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <Pages page={layout.page} documents={documents} />
          <g clipPath={`url(#${ids}-page)`}>
            <g
              ref={scanRef}
              className={cn("transition-opacity duration-700", isAnimated && isRunning ? "opacity-100" : "opacity-0")}
              style={{ transform: `translateY(${top}px)` }}
            >
              <rect x={layout.page.x} y={-10} width={layout.page.width} height={20} fill={`url(#${ids}-scan)`} />
              <rect x={layout.page.x} y={-0.6} width={layout.page.width} height={1.2} className="fill-link" />
            </g>
          </g>
          <Dots layout={layout} kind="terms" count={visible.terms} drafted={visible.terms} />
          <Dots layout={layout} kind="rules" count={visible.rules} drafted={visible.drafted} />
          <g ref={layerRef} />
        </svg>
      ) : null}
      <dl className="relative grid grid-cols-[1fr_52px_1fr] gap-x-6">
        <div className="flex min-w-0 flex-col items-end text-right">
          <dt className="text-xs text-muted-foreground">Terms found</dt>
          <dd className="text-xl font-semibold tabular-nums">{visible.terms}</dd>
        </div>
        <div className="col-start-3 flex min-w-0 flex-col">
          <dt className="text-xs text-muted-foreground">Rules found</dt>
          <dd className="text-xl font-semibold tabular-nums">{Math.min(visible.rules, counts.rulesFound)}</dd>
          {visible.drafted > 0 ? (
            <dd className="text-xs text-muted-foreground tabular-nums">{visible.drafted} drafted</dd>
          ) : null}
        </div>
      </dl>
    </div>
  )
}

/**
 * The counts and dots as they land, with the scan line and the layer finds fly in. The motion lives outside React
 * (`FindingsMotion`); this keeps it in step with the counts, the picture's size and whether the build runs.
 */
function useFindingsMotion(target: Shown, layout: FindingsLayout, isAnimated: boolean, isRunning: boolean) {
  const [shown, setShown] = useState(target)
  const layerRef = useRef<SVGGElement>(null)
  const scanRef = useRef<SVGGElement>(null)
  const scan = useRef<Animation | null>(null)
  const motion = useRef<FindingsMotion | null>(null)
  const latest = useRef({ layout, target })
  useEffect(() => {
    latest.current = { layout, target }
  })

  const { top, bottom } = scanRange(layout.page)
  useEffect(() => {
    const element = scanRef.current
    if (!isAnimated || !element) {
      return
    }
    const animation = element.animate(
      [{ transform: `translateY(${top}px)` }, { transform: `translateY(${bottom}px)` }],
      { duration: 2400, iterations: Infinity, direction: "alternate", easing: "ease-in-out" }
    )
    scan.current = animation
    return () => {
      animation.cancel()
      scan.current = null
    }
  }, [isAnimated, top, bottom])

  // When the build stops, the scan line stops where it is and fades there; a scan started over follows suit.
  useEffect(() => {
    if (isRunning) {
      scan.current?.play()
    } else {
      scan.current?.pause()
    }
  }, [isRunning, isAnimated, top, bottom])

  useEffect(() => {
    const layer = layerRef.current
    if (!isAnimated || !layer) {
      return
    }
    const engine = new FindingsMotion(
      {
        layer,
        layout: () => latest.current.layout,
        scanY: () => {
          const progress = scan.current?.effect?.getComputedTiming().progress
          const range = scanRange(latest.current.layout.page)
          return progress === null || progress === undefined ? null : range.top + progress * (range.bottom - range.top)
        },
        // Committed at once, so a landed dot is drawn in the frame its flight ends: never a frame with neither.
        show: (shown) => flushSync(() => setShown(shown))
      },
      latest.current.target
    )
    motion.current = engine
    return () => {
      engine.destroy()
      motion.current = null
    }
  }, [isAnimated])

  const { terms, rules, drafted } = target
  useEffect(() => {
    motion.current?.sync({ terms, rules, drafted })
  }, [terms, rules, drafted])

  return { shown, layerRef, scanRef }
}

/** A page with its top right corner folded over; strokes on half pixels so they're crisp. */
function pagePath({ x: left, y: top, width, height }: Box, fold = 9) {
  const x = left + 0.5
  const y = top + 0.5
  const right = x + width
  const bottom = y + height
  return `M${x + 3} ${y} H${right - fold} L${right} ${y + fold} V${bottom - 3} Q${right} ${bottom} ${right - 3} ${bottom} H${x + 3} Q${x} ${bottom} ${x} ${bottom - 3} V${y + 3} Q${x} ${y} ${x + 3} ${y} Z`
}

function foldPath({ x: left, y: top, width }: Box, fold = 9) {
  const right = left + 0.5 + width
  const y = top + 0.5
  return `M${right - fold} ${y} V${y + fold - 2} Q${right - fold} ${y + fold} ${right - fold + 2} ${y + fold} H${right} Z`
}

/** The page being read, with the documents behind it when there are more. */
function Pages({ page, documents }: { page: Box; documents: number }) {
  const behind = Math.min(2, Math.max(0, documents - 1))
  return (
    <g>
      {Array.from({ length: behind }, (_, index) => {
        const offset = (behind - index) * 3
        return (
          <path
            key={offset}
            d={pagePath({ ...page, x: page.x + offset, y: page.y - offset })}
            className="fill-card stroke-border"
          />
        )
      })}
      <path d={pagePath(page)} className="fill-card stroke-border" />
      <path d={foldPath(page)} className="fill-muted stroke-border" />
      {pageLines(page).map((line) => (
        <rect key={line.y} {...line} rx={1.1} className="fill-muted-foreground/30" />
      ))}
    </g>
  )
}

/**
 * A kind's dots, one per find, piled row by row. Rules found but not drafted yet are open; drafting fills them. Dots
 * move and shrink smoothly when there are more finds than fit.
 */
function Dots({
  layout,
  kind,
  count,
  drafted
}: {
  layout: FindingsLayout
  kind: FindKind
  count: number
  drafted: number
}) {
  return (
    <g>
      {Array.from({ length: count }, (_, index) => {
        const { x, y } = slotCenter(layout, kind, index)
        return (
          <circle
            key={index}
            r={1}
            vectorEffect="non-scaling-stroke"
            className={cn(
              "transition-[transform,fill,stroke] duration-500 ease-out",
              dotClassOf(kind, index < drafted)
            )}
            style={{ transform: `translate(${x}px, ${y}px) scale(${layout.radius})` }}
          />
        )
      })}
    </g>
  )
}

const dotClassOf = (kind: FindKind, isDrafted: boolean) =>
  kind === "rules" && isDrafted ? draftedClass : dotClass[kind]
