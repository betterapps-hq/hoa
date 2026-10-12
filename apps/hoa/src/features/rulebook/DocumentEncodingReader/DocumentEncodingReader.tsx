import { useElementSize, useMergedRef, useReducedMotion } from "@mantine/hooks"
import {
  BookOpenIcon,
  CheckIcon,
  CircleAlertIcon,
  CircleSlash2Icon,
  FileTextIcon,
  PenLineIcon,
  ScaleIcon,
  ScanTextIcon,
  Settings2Icon,
  type LucideIcon
} from "lucide-react"
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react"
import { flushSync } from "react-dom"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { ReadingBlock } from "@/documents/reading"
import { cn } from "@/lib/utils"
import type { BuildResult } from "@/rulebook/buildResults"
import type * as T from "@/schema/types"
import { dotClass, draftedClass } from "../DocumentEncodingFindings/DocumentEncodingFindings.motion"
import {
  slotCenter,
  type Box,
  type FindKind,
  type Point
} from "../DocumentEncodingFindings/DocumentEncodingFindings.utils"
import { ReaderMotion } from "./DocumentEncodingReader.motion"
import {
  countsOf,
  nextSpot,
  readerDocuments,
  readerEvents,
  readerLayout,
  settledScene,
  statementPieces,
  type ReaderDocument,
  type ReaderEvent,
  type ReaderLayout,
  type Scene,
  type Verdict,
  type WordSpot
} from "./DocumentEncodingReader.utils"

export type DocumentEncodingReaderProps = {
  /** What the build's steps have written so far. */
  results: readonly BuildResult[]
  /** The documents the build has structured, with their provisions as its structure step made them. */
  documents: readonly { key: string; title: string; provisions: readonly T.Provision[] }[]
  /** While the build runs the window drifts on through the document between what the results name. */
  isRunning: boolean
}

/**
 * A build reading its documents (encoding.md, UX, The build's progress), the variation of DocumentEncodingFindings that shows the
 * document: one passage at a time in a window between the piles, as the build's results name it. Each term is marked
 * where it's defined or first used and flies to the terms; each passage is scanned and gets its verdict, its rules
 * flying to the rules; each drafted rule shows its statement with its blanks filling in, and fills its dot. Without
 * motion it shows the counts, the piles and the last thing named, at rest.
 */
export function DocumentEncodingReader({ results, documents, isRunning }: DocumentEncodingReaderProps) {
  const { ref: sizeRef, width } = useElementSize<HTMLDivElement>()
  const isReduced = useReducedMotion()
  const read = useMemo(() => readerDocuments(documents), [documents])
  const events = useMemo(() => readerEvents(results, read), [results, read])
  const target = countsOf(events)
  const layout = readerLayout(width, { terms: target.terms, rules: Math.max(target.rules, target.drafted) })
  const isAnimated = !isReduced && width > 0
  const {
    shown: landed,
    scene: playing,
    parts,
    layerRef
  } = useReaderMotion(events, read, layout, isAnimated, isRunning)
  const ref = useMergedRef(sizeRef, parts.picture)
  const shown = isAnimated ? landed : target
  const scene = isAnimated ? playing : settledScene(events)
  const document = read.find((item) => item.key === scene.spot?.documentKey) ?? read[0]

  // Until the picture is measured, the counts sit side by side where they'll show.
  const isMeasured = width > 0
  return (
    <div ref={ref} className="relative" style={{ height: layout.height }}>
      <dl className={isMeasured ? undefined : "flex justify-center gap-12"}>
        <div
          className={cn("flex flex-col items-end text-right", isMeasured && "absolute")}
          style={isMeasured ? boxStyle(layout.counts.terms) : undefined}
        >
          <dt className="text-xs text-muted-foreground">Terms found</dt>
          <dd className="text-xl font-semibold tabular-nums">{shown.terms}</dd>
        </div>
        <div
          className={cn("flex flex-col", isMeasured && "absolute")}
          style={isMeasured ? boxStyle(layout.counts.rules) : undefined}
        >
          <dt className="text-xs text-muted-foreground">Rules found</dt>
          <dd className="text-xl font-semibold tabular-nums">{Math.min(shown.rules, target.rules)}</dd>
          {shown.drafted > 0 ? (
            <dd className="text-xs text-muted-foreground tabular-nums">{shown.drafted} drafted</dd>
          ) : null}
        </div>
      </dl>
      {isMeasured ? (
        <>
          <ReaderWindow
            box={layout.window}
            document={document}
            scene={scene}
            isAnimated={isAnimated}
            textRef={parts.text}
            captionRef={parts.caption}
          />
          <svg
            aria-hidden
            width={width}
            height={layout.height}
            className="pointer-events-none absolute inset-0 overflow-visible"
          >
            <Pile layout={layout} kind="terms" count={shown.terms} drafted={shown.terms} />
            <Pile layout={layout} kind="rules" count={Math.max(shown.rules, shown.drafted)} drafted={shown.drafted} />
            <g ref={layerRef} />
          </svg>
        </>
      ) : null}
    </div>
  )
}

const boxStyle = ({ x, y, width, height }: Box) => ({ left: x, top: y, width, height })

/** The picture, the window's text and its caption, where finds leave from. */
type PictureParts = Record<"picture" | "text" | "caption", RefObject<HTMLDivElement | null>>

/**
 * Where a find pops out of the text, in the picture's own pixels: the marked term, or the middle of the passage's
 * words in view, or the caption when no passage shows.
 */
function originOf({ picture, text, caption }: PictureParts, kind: FindKind): Point | null {
  const element = picture.current
  const view = text.current
  const mark = kind === "terms" ? view?.querySelector("[data-term-mark]") : null
  const from = mark ?? view?.querySelector("[data-active]") ?? caption.current
  if (!element || !view || !from) {
    return null
  }
  const frame = element.getBoundingClientRect()
  // A parent may scale the picture.
  const scale = element.offsetWidth > 0 ? frame.width / element.offsetWidth : 1
  const local = (x: number, y: number) => ({ x: (x - frame.left) / scale, y: (y - frame.top) / scale })
  const box = from.getBoundingClientRect()
  if (mark || from === caption.current) {
    return local(box.left + box.width / 2, box.top + box.height / 2)
  }
  const bounds = view.getBoundingClientRect()
  const top = Math.max(box.top, bounds.top)
  const bottom = Math.min(box.bottom, bounds.bottom)
  return local(box.left + box.width / 2, bottom > top ? (top + bottom) / 2 : bounds.top + bounds.height / 2)
}

/**
 * The scene and the counts as they land, with the parts of the picture finds leave from and the layer they fly in. The
 * motion lives outside React (`ReaderMotion`); this keeps it in step with the build's results and whether it runs.
 */
function useReaderMotion(
  events: readonly ReaderEvent[],
  documents: readonly ReaderDocument[],
  layout: ReaderLayout,
  isAnimated: boolean,
  isRunning: boolean
) {
  const [shown, setShown] = useState(() => countsOf(events))
  const [scene, setScene] = useState(() => settledScene(events))
  const layerRef = useRef<SVGGElement>(null)
  const picture = useRef<HTMLDivElement>(null)
  const text = useRef<HTMLDivElement>(null)
  const caption = useRef<HTMLDivElement>(null)
  const motion = useRef<ReaderMotion | null>(null)
  const latest = useRef({ events, documents, layout, isRunning })
  useEffect(() => {
    latest.current = { events, documents, layout, isRunning }
  })

  useEffect(() => {
    const layer = layerRef.current
    if (!isAnimated || !layer) {
      return
    }
    const engine = new ReaderMotion(
      {
        layer,
        layout: () => latest.current.layout,
        origin: (kind) => originOf({ picture, text, caption }, kind),
        // Committed at once, so the window and a landed dot are drawn in the frame they change.
        play: (next) => flushSync(() => setScene(next)),
        show: (next) => flushSync(() => setShown(next)),
        next: (spot) => nextSpot(latest.current.documents, spot)
      },
      latest.current.events,
      latest.current.isRunning
    )
    motion.current = engine
    return () => {
      engine.destroy()
      motion.current = null
    }
  }, [isAnimated])

  useEffect(() => {
    motion.current?.sync(events)
  }, [events])
  useEffect(() => {
    motion.current?.setRunning(isRunning)
  }, [isRunning])

  return { shown, scene, parts: { picture, text, caption }, layerRef }
}

/** How a passage shows: being read, drifted over, holding a term found, or with its verdict. */
type Tone = "reading" | "drifting" | "found" | "rule" | "settings" | "term" | "none" | "problem"

const toneClass: Record<Tone, string> = {
  reading: "bg-link/10 text-foreground before:bg-link",
  drifting: "bg-muted/60 text-foreground",
  found: "bg-muted/70 text-foreground before:bg-coverage-term",
  rule: "bg-coverage-rule/15 text-foreground before:bg-coverage-rule dark:bg-coverage-rule/25",
  settings: "bg-coverage-settings/15 text-foreground before:bg-coverage-settings dark:bg-coverage-settings/30",
  term: "bg-coverage-term/15 text-foreground before:bg-coverage-term dark:bg-coverage-term/25",
  none: "bg-muted text-foreground before:bg-muted-foreground/40",
  problem: "bg-destructive/10 text-foreground before:bg-destructive"
}

const verdictTone: Record<Verdict["kind"], Tone> = {
  rules: "rule",
  settings: "settings",
  definition: "term",
  none: "none"
}

function toneOf(scene: Scene): Tone | null {
  const { event, phase } = scene
  if (!event) {
    return phase === "drift" ? "drifting" : null
  }
  switch (event.kind) {
    case "term":
      return "found"
    case "passage":
      if (phase === "scan") {
        return "reading"
      }
      return verdictTone[event.verdict.kind]
    case "draft":
      return phase === "problem" ? "problem" : "rule"
  }
}

/** The block of `content` for a passage. */
const blockElement = (content: HTMLElement, key: string | undefined) =>
  key === undefined
    ? undefined
    : [...content.querySelectorAll<HTMLElement>("[data-block]")].find((element) => element.dataset.block === key)

type WindowProps = {
  box: Box
  document: ReaderDocument | undefined
  scene: Scene
  isAnimated: boolean
  textRef: RefObject<HTMLDivElement | null>
  captionRef: RefObject<HTMLDivElement | null>
}

/** How the window moves and the scan line sweeps: slow out, quick through the middle, slow in. */
const easeInOut = "cubic-bezier(0.65, 0, 0.35, 1)"
/** The scan line's soft band above it, in pixels, and how far above the window's bottom edge it stops. */
const scanBand = 12
const scanEdge = 20

/**
 * Where the window rests at a passage: its top a little below the window's, or, for a term further down than that
 * shows, the term a little above the window's middle.
 */
function restingScroll(
  view: HTMLElement,
  content: HTMLElement,
  block: HTMLElement | undefined,
  focus: HTMLElement | null
) {
  if (!block) {
    return 0
  }
  const most = Math.max(0, content.scrollHeight - view.clientHeight)
  let scroll = block.offsetTop - Math.round(view.clientHeight * 0.22)
  if (focus) {
    const top = focus.getBoundingClientRect().top - content.getBoundingClientRect().top
    if (top + focus.offsetHeight > scroll + view.clientHeight - scanEdge) {
      scroll = top - Math.round(view.clientHeight * 0.4)
    }
  }
  return Math.min(most, Math.max(0, scroll))
}

/** Scrolls the window's text to `scroll` over `ms`, from wherever a sweep through a long passage left it. */
function scrollText(
  content: HTMLElement,
  refs: { scrolled: { current: number }; follow: { current: Animation | null } },
  scroll: number,
  ms: number
) {
  const { follow } = refs
  if (follow.current) {
    follow.current.commitStyles()
    follow.current.cancel()
    follow.current = null
  }
  content.style.transition = ms > 0 ? `transform ${ms}ms ${easeInOut}` : "none"
  content.style.transform = `translateY(${-scroll}px)`
  refs.scrolled.current = scroll
}

/** The document in a window, moved to the passage showing, and under it what the build made of it. */
function ReaderWindow({ box, document, scene, isAnimated, textRef, captionRef }: WindowProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const scanRef = useRef<HTMLDivElement>(null)
  const sweep = useRef<Animation | null>(null)
  // Where the window has scrolled to, and its scroll along a sweep through a passage longer than it.
  const scrolled = useRef(0)
  const follow = useRef<Animation | null>(null)
  const shownDocument = useRef(document?.key)
  const isHere = scene.spot !== null && scene.spot.documentKey === document?.key
  const activeKey = isHere && (scene.event?.spot || scene.phase === "drift") ? scene.spot?.blockKey : undefined
  const tone = toneOf(scene)
  // A term's words, which the window gets to first and marks once it's there.
  const termSpot =
    scene.event?.kind === "term" && scene.event.spot?.documentKey === document?.key ? scene.event.spot : null
  const isMarked = termSpot !== null && scene.step > 0

  // The window moves to the passage, a little below its top, or on to a term further down it; to another document, at
  // once.
  useLayoutEffect(() => {
    const view = textRef.current
    const content = contentRef.current
    if (!view || !content) {
      return
    }
    const block = blockElement(content, scene.spot?.blockKey)
    const isSameDocument = shownDocument.current === document?.key
    shownDocument.current = document?.key
    scrollText(
      content,
      { scrolled, follow },
      restingScroll(view, content, block, content.querySelector<HTMLElement>("[data-term-spot]")),
      isAnimated && isSameDocument ? scene.moveMs : 0
    )
  }, [scene.spot?.blockKey, termSpot?.start, scene.moveMs, document?.key, isAnimated, box.width, textRef])

  // The scan line waits at the top of the passage being read or drifted over while the window gets there, then sweeps
  // down it; through a passage longer than the window, the window scrolls along with it. It fades where it is when
  // that's done. It spans the passage, its ends fading out at the passage's edges, so nothing shows past its rounded
  // corners.
  useLayoutEffect(() => {
    const line = scanRef.current
    const content = contentRef.current
    const view = textRef.current
    if (!line || !content || !view) {
      return
    }
    const block =
      isAnimated && (scene.phase === "scan" || scene.phase === "drift") ? blockElement(content, activeKey) : undefined
    if (!block) {
      sweep.current?.pause()
      line.style.opacity = "0"
      return
    }
    sweep.current?.cancel()
    // A passage read again after a sweep scrolled through it starts from its top again.
    const resting = restingScroll(view, content, block, null)
    const isAway = follow.current !== null || scrolled.current !== resting
    if (isAway) {
      scrollText(content, { scrolled, follow }, resting, scene.moveMs)
    }
    line.style.opacity = "1"
    line.style.left = `${block.offsetLeft}px`
    line.style.width = `${block.offsetWidth}px`
    const top = block.offsetTop + 2
    const end = block.offsetTop + block.offsetHeight - 2
    // The window scrolls as far as the passage's end needs, and the line goes no further than its faded bottom edge.
    const most = Math.max(0, content.scrollHeight - view.clientHeight)
    const from = scrolled.current
    const to = Math.min(most, Math.max(from, end - (view.clientHeight - scanEdge)))
    const bottom = Math.max(top, Math.min(end, to + view.clientHeight - scanEdge))
    const wait = Math.min(scene.moveMs, scene.ms * 0.4)
    const timing = { duration: Math.max(1, scene.ms - wait), delay: wait, easing: easeInOut }
    sweep.current = line.animate(
      [{ transform: `translateY(${top - scanBand}px)` }, { transform: `translateY(${bottom - scanBand}px)` }],
      { ...timing, fill: "both" }
    )
    if (to > from) {
      follow.current = content.animate(
        [{ transform: `translateY(${-from}px)` }, { transform: `translateY(${-to}px)` }],
        { ...timing, fill: "forwards" }
      )
      scrolled.current = to
    }
  }, [scene, activeKey, isAnimated, textRef])
  useEffect(
    () => () => {
      sweep.current?.cancel()
      follow.current?.cancel()
    },
    []
  )

  return (
    <div
      aria-hidden
      className="absolute flex flex-col overflow-hidden rounded-lg border bg-card shadow-xs"
      style={boxStyle(box)}
    >
      <div className="flex h-7 shrink-0 items-center gap-1.5 border-b px-3 text-[11px] text-muted-foreground">
        <FileTextIcon aria-hidden className="size-3.5 shrink-0" />
        <DocumentTitle title={document?.title ?? "Reading the documents"} />
      </div>
      <div
        ref={textRef}
        className="relative min-h-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_10px,black_calc(100%-18px),transparent)]"
      >
        <div ref={contentRef} className="relative px-3 py-2.5 text-xs/[1.45]">
          {document?.blocks.map((block) => (
            <Passage
              key={block.key}
              block={block}
              tone={block.key === activeKey ? tone : null}
              mark={termSpot?.blockKey === block.key ? termSpot : null}
              isMarked={isMarked}
              isAnimated={isAnimated}
            />
          ))}
          <div
            ref={scanRef}
            className="pointer-events-none absolute top-0 h-3 [mask-image:linear-gradient(to_right,transparent,black_15%,black_85%,transparent)] opacity-0 transition-opacity duration-300 ease-out"
          >
            <div className="h-full bg-linear-to-b from-transparent to-link/15" />
            <div className="absolute inset-x-0 bottom-0 h-px bg-link" />
          </div>
        </div>
      </div>
      <div ref={captionRef} className="h-[104px] shrink-0 border-t bg-muted/30 px-3 py-2">
        <Caption scene={scene} document={document} />
      </div>
    </div>
  )
}

type MarkRange = { start: number; end: number }

/** The document's title, whole in a tooltip when the window cuts it short. */
function DocumentTitle({ title }: { title: string }) {
  const [isOpen, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const isCut = () => (ref.current ? ref.current.scrollWidth > ref.current.clientWidth : false)
  return (
    <Tooltip open={isOpen} onOpenChange={(open) => setOpen(open && isCut())}>
      <TooltipTrigger render={<span ref={ref} className="min-w-0 flex-1 truncate" />}>{title}</TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  )
}

/** Text with a term's words marked green, swept on from the left as with a highlighter. */
function Marked({
  text,
  range,
  isMarked,
  isAnimated
}: {
  text: string
  range: MarkRange | null
  isMarked: boolean
  isAnimated: boolean
}) {
  const ref = useRef<HTMLElement>(null)
  const start = isMarked ? range?.start : undefined
  useLayoutEffect(() => {
    if (isAnimated && start !== undefined) {
      ref.current?.animate([{ backgroundSize: "0% 100%" }, { backgroundSize: "100% 100%" }], {
        duration: 320,
        easing: "ease-out"
      })
    }
  }, [isAnimated, start])
  if (!range) {
    return text
  }
  // Before it's marked, the words are only where the window is going.
  if (!isMarked) {
    return (
      <>
        {text.slice(0, range.start)}
        <span data-term-spot>{text.slice(range.start, range.end)}</span>
        {text.slice(range.end)}
      </>
    )
  }
  return (
    <>
      {text.slice(0, range.start)}
      <mark
        ref={ref}
        data-term-spot
        data-term-mark
        className="-mx-0.5 rounded-[3px] bg-transparent bg-linear-to-r from-coverage-term/30 to-coverage-term/30 bg-no-repeat px-0.5 font-medium text-foreground dark:from-coverage-term/40 dark:to-coverage-term/40"
      >
        {text.slice(range.start, range.end)}
      </mark>
      {text.slice(range.end)}
    </>
  )
}

/** Indentation for a depth: articles and their sections at the margin, each level below a step in. */
const indentClass = (depth: number) => ["", "", "ml-3", "ml-6"][Math.min(depth, 3)] ?? ""

/** One passage of the document, compactly: an article's heading, or a numbered provision with its heading run in. */
function Passage({
  block,
  tone,
  mark,
  isMarked,
  isAnimated
}: {
  block: ReadingBlock
  tone: Tone | null
  mark: WordSpot | null
  isMarked: boolean
  isAnimated: boolean
}) {
  const className = cn(
    "relative -mx-2 mt-1 rounded-md px-2 py-0.5 text-muted-foreground transition-colors duration-300 before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:transition-colors before:duration-300",
    tone ? toneClass[tone] : "before:bg-transparent"
  )
  if (block.type !== "provision") {
    return (
      <div data-block={block.key} className={className}>
        <p className="whitespace-pre-line">{block.text}</p>
      </div>
    )
  }
  const text = block.text ? (
    <Marked text={block.text} range={mark?.part === "text" ? mark : null} isMarked={isMarked} isAnimated={isAnimated} />
  ) : null
  const intro = block.intro ? (
    <Marked
      text={block.intro}
      range={mark?.part === "intro" ? mark : null}
      isMarked={isMarked}
      isAnimated={isAnimated}
    />
  ) : null
  const active = tone ? { "data-active": "" } : {}
  if (block.level === 2) {
    return (
      <div data-block={block.key} {...active} className={cn(className, "mt-3 first:mt-0")}>
        {block.number ? (
          <p className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">{block.number}</p>
        ) : null}
        <p className="text-[13px] font-semibold text-foreground">{block.heading}</p>
        {text ? <p className="mt-0.5">{text}</p> : null}
        {intro ? <p className="mt-0.5">{intro}</p> : null}
      </div>
    )
  }
  return (
    <div data-block={block.key} {...active} className={cn(className, indentClass(block.depth))}>
      <p>
        {block.number ? (
          <span className="mr-1.5 font-semibold text-foreground tabular-nums">{block.number}</span>
        ) : null}
        {block.heading ? <span className="font-semibold text-foreground">{block.heading}. </span> : null}
        {text}
      </p>
      {intro ? <p className="mt-0.5">{intro}</p> : null}
    </div>
  )
}

/** Why E gave a passage no rule, in words. */
const reasonWords: Record<string, string> = {
  heading: "A heading",
  recital: "A recital, saying why",
  reserved: "Reserved",
  explanatory: "Explains rather than requires",
  duplicate: "Repeats another passage"
}

/** A caption's line of what it shows, with its icon in its kind's color. */
function CaptionLabel({
  icon: Icon,
  tone,
  label,
  aside
}: {
  icon: LucideIcon
  tone: string
  label: string
  aside?: string
}) {
  return (
    <div className={cn("flex items-center gap-1.5 text-[10px] font-medium tracking-wider uppercase", tone)}>
      <Icon aria-hidden className="size-3.5 shrink-0" />
      <span className="truncate">{label}</span>
      {aside ? (
        <span className="ml-auto shrink-0 tracking-normal text-muted-foreground normal-case">{aside}</span>
      ) : null}
    </div>
  )
}

/** What the build made of what's showing: the term, the passage's verdict, or the rule being drafted. */
function Caption({ scene, document }: { scene: Scene; document: ReaderDocument | undefined }) {
  const { event, phase, step } = scene
  if (!event) {
    return null
  }
  // A new moment slides in; a term's mark and a draft's blanks show in place.
  const key = `${event.id}:${phase === "fill" || phase === "drafted" || phase === "found" ? "same" : `${phase}:${step}`}`
  return (
    <div key={key} className="flex h-full animate-in flex-col gap-1 duration-200 fade-in-0 slide-in-from-bottom-1">
      <CaptionBody scene={scene} event={event} document={document} />
    </div>
  )
}

function CaptionBody({
  scene,
  event,
  document
}: {
  scene: Scene
  event: ReaderEvent
  document: ReaderDocument | undefined
}): ReactNode {
  const { phase, step } = scene
  switch (event.kind) {
    case "term":
      return (
        <>
          <CaptionLabel icon={BookOpenIcon} tone="text-coverage-term" label="Term found" />
          <p className="truncate text-sm font-medium">{event.label}</p>
        </>
      )
    case "passage": {
      const block = document?.blocks.find((item) => item.key === event.spot?.blockKey)
      const name = block?.type === "provision" ? [block.number, block.heading].filter(Boolean).join(" ") : ""
      if (phase === "scan") {
        return (
          <>
            <CaptionLabel icon={ScanTextIcon} tone="text-link" label="Reading" />
            <p className="truncate text-sm text-muted-foreground">{name}</p>
          </>
        )
      }
      const { verdict } = event
      switch (verdict.kind) {
        case "rules":
          return (
            <>
              <CaptionLabel
                icon={ScaleIcon}
                tone="text-coverage-rule"
                label="Rule found"
                aside={verdict.rules.length > 1 ? `${step + 1} of ${verdict.rules.length}` : undefined}
              />
              <p className="line-clamp-2 text-sm font-medium">{verdict.rules[step]?.title}</p>
            </>
          )
        case "settings":
          return (
            <>
              <CaptionLabel icon={Settings2Icon} tone="text-coverage-settings" label="Sets how rules apply" />
              <p className="line-clamp-2 text-sm">{verdict.settings.join("; ")}</p>
            </>
          )
        case "definition":
          return (
            <>
              <CaptionLabel icon={BookOpenIcon} tone="text-coverage-term" label="Defines a term" />
              <p className="truncate text-sm text-muted-foreground">Rules cite it rather than hold one</p>
            </>
          )
        case "none":
          return (
            <>
              <CaptionLabel icon={CircleSlash2Icon} tone="text-muted-foreground" label="No rule" />
              <p className="truncate text-sm text-muted-foreground">
                {verdict.reason === null
                  ? "Rules elsewhere cite it"
                  : (reasonWords[verdict.reason] ?? "Nothing to enforce")}
              </p>
            </>
          )
      }
      return null
    }
    case "draft": {
      if (phase === "problem") {
        return (
          <>
            <CaptionLabel icon={CircleAlertIcon} tone="text-destructive" label="A check found a problem" />
            <p className="truncate text-xs font-medium">{event.title}</p>
            {event.previous ? (
              <p className="line-clamp-2 text-xs text-muted-foreground line-through decoration-destructive/60">
                <Blanks statement={event.previous} filled={Infinity} />
              </p>
            ) : null}
          </>
        )
      }
      const isDrafted = phase === "drafted"
      const label = isDrafted ? "Drafted" : "Drafting"
      return (
        <>
          <CaptionLabel
            icon={isDrafted ? CheckIcon : PenLineIcon}
            tone="text-coverage-rule"
            label={event.isRetry ? `${label} again` : label}
          />
          <p className="truncate text-xs font-medium">{event.title}</p>
          {event.statement ? <Statement statement={event.statement} filled={step} isDone={isDrafted} /> : null}
        </>
      )
    }
  }
}

/**
 * A statement three lines high. One longer than that moves up a line at a time to keep the blank being filled in view,
 * and once it's drafted, to show its end.
 */
function Statement({ statement, filled, isDone }: { statement: string; filled: number; isDone: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLParagraphElement>(null)
  useLayoutEffect(() => {
    const box = boxRef.current
    const text = textRef.current
    if (!box || !text) {
      return
    }
    const line = Number.parseFloat(getComputedStyle(text).lineHeight) || 16
    const blanks = text.querySelectorAll<HTMLElement>("[data-blank]")
    const last = blanks[Math.min(filled, blanks.length) - 1]
    // How far down it has to show: its end once drafted, else the last blank filled.
    let shown = last ? last.offsetTop + last.offsetHeight : 0
    if (isDone) {
      shown = text.scrollHeight
    }
    const lines = Math.max(0, Math.ceil((shown - box.clientHeight - 1) / line))
    const most = Math.max(0, text.scrollHeight - box.clientHeight)
    text.style.transform = `translateY(${-Math.min(lines * line, most)}px)`
  }, [statement, filled, isDone])
  return (
    <div ref={boxRef} className="h-12 overflow-hidden text-xs text-muted-foreground">
      <p ref={textRef} className="relative transition-transform duration-300 ease-out">
        <Blanks statement={statement} filled={filled} />
      </p>
    </div>
  )
}

/** A statement with its first `filled` blanks filled: a term in a term link's style, a value in bold. */
function Blanks({ statement, filled }: { statement: string; filled: number }) {
  const pieces = statementPieces(statement)
  const blankIndex = pieces.map((_, index) => pieces.slice(0, index).filter((item) => item.type === "blank").length)
  return pieces.map((piece, index) => {
    if (piece.type === "text") {
      // Pieces never reorder; the index is their identity.
      return <Fragment key={index}>{piece.text}</Fragment>
    }
    const isFilled = (blankIndex[index] ?? 0) < filled
    // A blank holds its word's place; filling it writes the word in.
    return (
      <span
        key={index}
        data-blank
        className={cn(
          "inline-block rounded-[3px] font-medium",
          isFilled
            ? "animate-in text-foreground duration-300 ease-out fade-in-0 slide-in-from-bottom-1"
            : "bg-muted-foreground/20 text-transparent",
          isFilled &&
            piece.kind === "term" &&
            "underline decoration-muted-foreground decoration-dotted underline-offset-2"
        )}
      >
        {piece.text}
      </span>
    )
  })
}

/**
 * A kind's dots, one per find, piled row by row. Rules found but not drafted yet are open; drafting fills them. Dots
 * move and shrink smoothly when there are more finds than fit.
 */
function Pile({
  layout,
  kind,
  count,
  drafted
}: {
  layout: ReaderLayout
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
              kind === "rules" && index < drafted ? draftedClass : dotClass[kind]
            )}
            style={{ transform: `translate(${x}px, ${y}px) scale(${layout.radius})` }}
          />
        )
      })}
    </g>
  )
}
