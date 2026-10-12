import {
  flightKeyframes,
  flightPeak,
  launchGap,
  lineAt,
  pageLines,
  slotCenter,
  trailKeyframes,
  type FindKind,
  type FindingsLayout,
  type Point
} from "./DocumentEncodingFindings.utils"

// The finds in motion (DocumentEncodingFindings.tsx): each new term or rule flies from the line the scan is on into its dot, and
// each newly drafted rule fills its dot with a ring. Drawn straight into an SVG group outside React, so a burst of a
// hundred finds is a hundred animations, not a hundred renders; what has landed goes back to React as counts, once a
// frame.

export type Shown = { terms: number; rules: number; drafted: number }

export type MotionHost = {
  /** The SVG group finds fly in, above the grids. */
  layer: SVGGElement
  layout(): FindingsLayout
  /** Where the scan line is now; null while it isn't showing. */
  scanY(): number | null
  /** What has landed, once a frame while it changes; drawn before it returns, so landed flights can go. */
  show(shown: Shown): void
}

type Launch = { kind: FindKind; slot: number; at: number }
type Flight = { kind: FindKind; slot: number; animations: Animation[]; elements: SVGElement[] }

const svg = "http://www.w3.org/2000/svg"
/** Every flight takes as long, so finds land in the order they left and their dots fill in order. */
const flightMs = 900
const kinds: FindKind[] = ["terms", "rules"]
/**
 * In the coverage tab's colors for terms and rules (styles.css). A term is a solid dot; a rule is found as an outline
 * and filled when drafted, as the build outlines rules and then drafts them.
 */
export const dotClass: Record<FindKind, string> = {
  terms: "fill-coverage-term",
  rules: "fill-coverage-rule/15 stroke-coverage-rule"
}
export const draftedClass = "fill-coverage-rule stroke-coverage-rule"
const flightClass: Record<FindKind, string> = {
  terms: dotClass.terms,
  rules: "fill-coverage-rule/40 stroke-coverage-rule"
}
/** The page line a find leaves from lights up in its kind's color, this strongly at most. */
const flash: Record<FindKind, { className: string; opacity: number }> = {
  terms: { className: "fill-coverage-term", opacity: 0.45 },
  rules: { className: "fill-coverage-rule", opacity: 0.35 }
}

const at = ({ x, y }: Point, scale = 1) => `translate(${x}px, ${y}px) scale(${scale})`

export class FindingsMotion {
  private readonly landed: Shown
  /** What has landed, is in flight or is waiting to launch. */
  private readonly promised: Shown
  private launches: Launch[] = []
  private drafts: number[] = []
  private readonly flights = new Set<Flight>()
  /** Flights that have landed, kept over their dots until the dots are drawn. */
  private arrived: SVGElement[] = []
  private nextLaunch = 0
  private nextDraft = 0
  private frame: number | null = null
  private showFrame: number | null = null
  private isDestroyed = false
  /** When each page line last lit up, by its height: a burst lights a line once, not once per find. */
  private readonly flashed = new Map<number, number>()

  constructor(
    private readonly host: MotionHost,
    initial: Shown
  ) {
    this.landed = { ...initial }
    this.promised = { ...initial }
    this.requestShow()
  }

  /** Moves toward `target`: new finds wait their turn to fly, and finds that went away leave their dots. */
  sync(target: Shown) {
    const now = performance.now()
    for (const kind of kinds) {
      const change = target[kind] - this.promised[kind]
      if (change > 0) {
        const gap = launchGap(change)
        const first = Math.max(now, this.nextLaunch)
        for (let index = 0; index < change; index++) {
          this.launches.push({ kind, slot: this.promised[kind] + index, at: first + index * gap })
        }
        this.nextLaunch = first + change * gap
      } else if (change < 0) {
        this.withdraw(kind, target[kind])
      }
      this.promised[kind] = target[kind]
    }

    const drafted = target.drafted - this.promised.drafted
    if (drafted > 0) {
      const gap = launchGap(drafted) * 1.4
      const first = Math.max(now, this.nextDraft)
      for (let index = 0; index < drafted; index++) {
        this.drafts.push(first + index * gap)
      }
      this.nextDraft = first + drafted * gap
    } else if (drafted < 0) {
      this.drafts = this.drafts.slice(0, Math.max(0, this.drafts.length + drafted))
      if (this.landed.drafted > target.drafted) {
        this.landed.drafted = target.drafted
        this.requestShow()
      }
    }
    this.promised.drafted = target.drafted
    this.loop()
  }

  destroy() {
    this.isDestroyed = true
    for (const frame of [this.frame, this.showFrame]) {
      if (frame !== null) {
        cancelAnimationFrame(frame)
      }
    }
    for (const flight of this.flights) {
      flight.animations.forEach((animation) => animation.cancel())
    }
    this.flights.clear()
    this.host.layer.replaceChildren()
  }

  private loop() {
    if (this.frame !== null || this.isDestroyed || (this.launches.length === 0 && this.drafts.length === 0)) {
      return
    }
    this.frame = requestAnimationFrame((now) => {
      this.frame = null
      while (this.launches[0] && this.launches[0].at <= now) {
        const launch = this.launches.shift()
        if (launch) {
          this.launch(launch)
        }
      }
      while (this.drafts[0] !== undefined && this.drafts[0] <= now) {
        this.drafts.shift()
        this.draft()
      }
      this.loop()
    })
  }

  private launch({ kind, slot }: Launch) {
    const layout = this.host.layout()
    const lines = pageLines(layout.page)
    const scanY = this.host.scanY()
    const line = (scanY === null ? lines[slot % lines.length] : lineAt(lines, scanY)) ?? lines[0]
    if (!line) {
      return
    }
    const from = { x: line.x + Math.random() * line.width, y: line.y + line.height / 2 }
    const to = slotCenter(layout, kind, slot)
    // Arcs stay below the counts: a short hop rises a little, a long one as far as the space above the grids allows.
    const lift = 8 + Math.abs(to.x - from.x) * 0.08 + Math.random() * 8
    const frames = flightKeyframes(from, to, flightPeak(from, to, lift, layout.gridTop - 4))

    this.flash(line, kind)
    const trail = this.circle(layout.radius * 0.6, flightClass[kind])
    const head = this.circle(layout.radius, flightClass[kind])
    this.host.layer.appendChild(trail)
    this.host.layer.appendChild(head)
    const flight: Flight = {
      kind,
      slot,
      elements: [trail, head],
      animations: [
        trail.animate(trailKeyframes(frames), { duration: flightMs, delay: 45, easing: "linear", fill: "both" }),
        head.animate(frames, { duration: flightMs, easing: "linear", fill: "both" })
      ]
    }
    this.flights.add(flight)
    flight.animations[1]?.finished.then(
      () => this.land(flight),
      () => undefined
    )
  }

  private land(flight: Flight) {
    if (this.isDestroyed || !this.flights.delete(flight)) {
      return
    }
    this.arrived.push(...flight.elements)
    this.landed[flight.kind] += 1
    this.requestShow()
  }

  /** A newly drafted rule: its dot fills, and a ring goes out from it. */
  private draft() {
    const slot = this.landed.drafted
    this.landed.drafted += 1
    this.requestShow()
    if (slot >= this.landed.rules) {
      return
    }
    const center = slotCenter(this.host.layout(), "rules", slot)
    const ring = this.circle(this.host.layout().radius, "fill-none stroke-coverage-rule")
    ring.setAttribute("stroke-width", "1.25")
    this.fade(
      ring,
      [
        { transform: at(center, 1), opacity: 0.9 },
        { transform: at(center, 3), opacity: 0 }
      ],
      650
    )
  }

  /** Finds the build took back, as a section read again can: dots past `target` fade, and their flights stop. */
  private withdraw(kind: FindKind, target: number) {
    this.launches = this.launches.filter((launch) => launch.kind !== kind || launch.slot < target)
    for (const flight of this.flights) {
      if (flight.kind === kind && flight.slot >= target) {
        flight.animations.forEach((animation) => animation.cancel())
        flight.elements.forEach((element) => element.remove())
        this.flights.delete(flight)
      }
    }
    if (this.landed[kind] > target) {
      const layout = this.host.layout()
      for (let slot = target; slot < this.landed[kind]; slot++) {
        const center = slotCenter(layout, kind, slot)
        this.fade(
          this.circle(layout.radius, dotClass[kind]),
          [
            { transform: at(center, 1), opacity: 1 },
            { transform: at(center, 0.2), opacity: 0 }
          ],
          320
        )
      }
      this.landed[kind] = target
      this.landed.drafted = Math.min(this.landed.drafted, this.landed.rules)
      this.requestShow()
    }
  }

  /** The page line a find leaves from is marked in its kind's color, as a highlighter marks a line of text. */
  private flash(line: { x: number; y: number; width: number; height: number }, kind: FindKind) {
    const now = performance.now()
    if (now - (this.flashed.get(line.y) ?? -Infinity) < 400) {
      return
    }
    this.flashed.set(line.y, now)
    const highlight = document.createElementNS(svg, "rect")
    highlight.setAttribute("x", String(line.x - 1))
    highlight.setAttribute("y", String(line.y - 1.2))
    highlight.setAttribute("width", String(line.width + 2))
    highlight.setAttribute("height", String(line.height + 2.4))
    highlight.setAttribute("rx", "1.6")
    highlight.setAttribute("class", flash[kind].className)
    this.fade(highlight, [{ opacity: 0 }, { opacity: flash[kind].opacity, offset: 0.2 }, { opacity: 0 }], 620)
  }

  private circle(radius: number, className: string) {
    const circle = document.createElementNS(svg, "circle")
    circle.setAttribute("r", String(radius))
    circle.setAttribute("class", className)
    circle.setAttribute("vector-effect", "non-scaling-stroke")
    return circle
  }

  /** Adds an element for one animation, then takes it away. */
  private fade(element: SVGElement, frames: Keyframe[], duration: number) {
    this.host.layer.appendChild(element)
    element.animate(frames, { duration, easing: "ease-out", fill: "both" }).finished.then(
      () => element.remove(),
      () => element.remove()
    )
  }

  private requestShow() {
    if (this.showFrame !== null || this.isDestroyed) {
      return
    }
    this.showFrame = requestAnimationFrame(() => {
      this.showFrame = null
      this.host.show({ ...this.landed })
      this.arrived.forEach((element) => element.remove())
      this.arrived = []
    })
  }
}
