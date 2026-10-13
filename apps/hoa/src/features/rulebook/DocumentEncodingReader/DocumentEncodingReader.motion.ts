import { dotClass, findKinds, type Shown } from "./DocumentEncodingReader.piles"
import {
  flightKeyframes,
  flightPeak,
  slotCenter,
  trailKeyframes,
  type FindKind,
  type Point
} from "./DocumentEncodingReader.piles"
import {
  beatMs,
  beatPlan,
  countsOf,
  findsOf,
  paceOf,
  settledScene,
  spotOf,
  type BeatStep,
  type ReaderEvent,
  type ReaderLayout,
  type Scene,
  type Spot
} from "./DocumentEncodingReader.utils"

// The reader in motion (DocumentEncodingReader.tsx): one beat at a time from a queue of what the build's results name,
// each moment a scene React draws, and each find flying into its pile in an SVG group outside React, so a burst of a
// hundred finds is a hundred animations, not a hundred renders. Beats keep their own pace until the queue would take longer than the build takes between results, then
// play faster; while nothing new has come, the window drifts on through the document.

export type ReaderHost = {
  /** The SVG group finds fly in, above the window and the piles. */
  layer: SVGGElement
  layout(): ReaderLayout
  /** Where the showing beat's find of `kind` leaves from, in the picture; null when nothing shows it. */
  origin(kind: FindKind): Point | null
  /** Shows a scene; drawn before it returns. */
  play(scene: Scene): void
  /** What has landed, once a frame while it changes; drawn before it returns, so landed flights can go. */
  show(shown: Shown): void
  /** The passage to drift to after `spot`. */
  next(spot: Spot | null): Spot | null
}

type Flight = { eventId: string; kind: FindKind; animations: Animation[]; elements: SVGElement[] }
type Beat = { event: ReaderEvent; steps: BeatStep[]; next: number; start: number; ends: number; moveMs: number }

const svg = "http://www.w3.org/2000/svg"
const flightMs = 900
/** A find in the air is as plain to see as a term's: a rule lands open, to fill once it's drafted. */
const flightClass: Record<FindKind, string> = {
  terms: dotClass.terms,
  vocabulary: dotClass.vocabulary,
  rules: "fill-coverage-rule/75 stroke-coverage-rule"
}
const nothing: Shown = { terms: 0, vocabulary: 0, rules: 0, drafted: 0 }
const one = (kind: FindKind): Shown => ({ ...nothing, [kind]: 1 })
const plus = (a: Shown, b: Shown): Shown => ({
  terms: a.terms + b.terms,
  vocabulary: a.vocabulary + b.vocabulary,
  rules: a.rules + b.rules,
  drafted: a.drafted + b.drafted
})

/**
 * The fastest beats play, and how long what's queued may take to play: most of the time the build takes between
 * results that name something new, and only a few seconds once the build has stopped.
 */
const fastest = 8
const budget = { share: 0.8, least: 6000, most: 90_000, finishing: 4000 }
/** A queue that would take longer than this even at its fastest lands its oldest beats at once, to catch up. */
const maxBehind = 60_000
/** How long a beat's last moment stays before the window drifts on. */
const linger = 1600
const driftMoveMs = 900

const at = ({ x, y }: Point, scale = 1) => `translate(${x}px, ${y}px) scale(${scale})`
const lengthOf = (events: readonly ReaderEvent[]) => events.reduce((sum, event) => sum + beatPlan(event).length, 0)

export class ReaderMotion {
  private readonly known = new Map<string, ReaderEvent>()
  private queue: ReaderEvent[] = []
  private readonly landed: Shown
  /** What each event's finds have added to the piles, to take back if the build drops it. */
  private readonly landedBy = new Map<string, Shown>()
  private readonly inFlight: Record<FindKind, number> = { terms: 0, vocabulary: 0, rules: 0 }
  private readonly flights = new Set<Flight>()
  /** Flights that have landed, kept over their dots until the dots are drawn. */
  private arrived: SVGElement[] = []
  private beat: Beat | null = null
  /** The last moment a beat showed, for the window to rest at once the build has stopped. */
  private last: Scene
  private spot: Spot | null
  /** When the window next drifts on, or rests once the build has stopped. */
  private driftAt: number
  /** The first drift stays on the passage the window opened at. */
  private driftStays = true
  private isResting = false
  /** About how long the build takes between results that name something new, in milliseconds. */
  private gap = 45_000
  private lastNew: number | null = null
  /** When what's queued should have played. */
  private deadline = 0
  private frame: number | null = null
  private showFrame: number | null = null
  private isDestroyed = false

  constructor(
    private readonly host: ReaderHost,
    initial: readonly ReaderEvent[],
    private isRunning: boolean
  ) {
    for (const event of initial) {
      this.known.set(event.id, event)
      this.landedBy.set(event.id, findsOf(event))
    }
    this.landed = { ...countsOf(initial) }
    this.last = settledScene(initial)
    const last = initial.findLast((event) => event.spot !== null)?.spot
    this.spot = last ? spotOf(last) : null
    this.driftAt = performance.now()
    this.requestShow()
    this.loop()
  }

  /**
   * Queues what's new to show, and takes back what the build dropped. What's queued already takes the newest word on
   * it: a term named before its document came now has its place in the document.
   */
  sync(events: readonly ReaderEvent[]) {
    const ids = new Set(events.map((event) => event.id))
    for (const event of this.known.values()) {
      if (!ids.has(event.id)) {
        this.withdraw(event)
      }
    }
    const fresh = events.filter((event) => !this.known.has(event.id))
    for (const event of events) {
      this.known.set(event.id, event)
    }
    this.queue = [...this.queue.map((queued) => this.known.get(queued.id) ?? queued), ...fresh]
    if (fresh.length > 0) {
      const now = performance.now()
      if (this.lastNew !== null) {
        this.gap = (this.gap + (now - this.lastNew)) / 2
      }
      this.lastNew = now
      const share = Math.min(budget.most, Math.max(budget.least, this.gap * budget.share))
      this.deadline = now + (this.isRunning ? share : budget.finishing)
    }
    this.loop()
  }

  /** While the build runs, the window drifts on between beats; once it stops, what's queued plays out quickly. */
  setRunning(isRunning: boolean) {
    this.isRunning = isRunning
    if (!isRunning) {
      this.deadline = Math.min(this.deadline, performance.now() + budget.finishing)
    }
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
    if (this.frame !== null || this.isDestroyed) {
      return
    }
    this.frame = requestAnimationFrame(() => {
      this.frame = null
      this.tick(performance.now())
    })
  }

  private tick(now: number) {
    if (this.beat) {
      this.runDue(this.beat, now)
      if (now >= this.beat.ends) {
        this.beat = null
        this.driftAt = now + linger
      }
    }
    if (!this.beat) {
      this.catchUp()
      const next = this.queue.shift()
      if (next) {
        this.start(next, now)
      } else if (now >= this.driftAt && this.isRunning) {
        this.drift(now)
      } else if (now >= this.driftAt && !this.isResting) {
        this.rest()
      }
    }
    if (this.beat || this.queue.length > 0 || this.isRunning || !this.isResting) {
      this.loop()
    }
  }

  private start(event: ReaderEvent, now: number) {
    const speed = paceOf(lengthOf([event, ...this.queue]), Math.max(1, this.deadline - now), fastest)
    const { steps, length } = beatPlan(event, speed)
    if (event.spot) {
      this.spot = spotOf(event.spot)
    }
    this.isResting = false
    this.driftStays = false
    this.beat = { event, steps, next: 0, start: now, ends: now + length, moveMs: beatMs.move / speed }
    this.runDue(this.beat, now)
  }

  private runDue(beat: Beat, now: number) {
    for (let step = beat.steps[beat.next]; step && beat.start + step.at <= now; step = beat.steps[beat.next]) {
      beat.next += 1
      this.last = {
        event: beat.event,
        spot: this.spot,
        phase: step.phase,
        step: step.step,
        ms: step.ms,
        moveMs: beat.moveMs
      }
      this.host.play(this.last)
      if (step.launch) {
        this.launch(beat.event, step.launch)
      }
      if (step.fills) {
        this.fill(beat.event)
      }
    }
  }

  /** Beats too far behind to play even at their fastest land at once, oldest first, keeping the newest to play. */
  private catchUp() {
    let behind = lengthOf(this.queue) / fastest
    while (this.queue.length > 1 && behind > maxBehind) {
      const skipped = this.queue.shift()
      if (!skipped) {
        break
      }
      behind -= beatPlan(skipped).length / fastest
      this.add(skipped.id, findsOf(skipped))
    }
  }

  private drift(now: number) {
    this.spot = this.driftStays ? (this.spot ?? this.host.next(null)) : this.host.next(this.spot)
    this.driftStays = false
    this.isResting = false
    this.driftAt = now + beatMs.drift
    this.host.play({ event: null, spot: this.spot, phase: "drift", step: 0, ms: beatMs.drift, moveMs: driftMoveMs })
  }

  /** Once the build has stopped, the window goes back to the last thing it showed, and stays. */
  private rest() {
    this.isResting = true
    this.spot = this.last.spot ?? this.spot
    this.host.play(
      this.last.event
        ? { ...this.last, ms: 0, moveMs: driftMoveMs }
        : { event: null, spot: this.spot, phase: "rest", step: 0, ms: 0, moveMs: driftMoveMs }
    )
  }

  /** A find leaves the beat's word or passage for the next free place in its pile, and counts once it lands. */
  private launch(event: ReaderEvent, kind: FindKind) {
    const from = this.host.origin(kind)
    if (!from) {
      this.add(event.id, one(kind))
      return
    }
    const layout = this.host.layout()
    const to = slotCenter(layout, kind, this.landed[kind] + this.inFlight[kind])
    const lift = 10 + Math.abs(to.x - from.x) * 0.06
    const frames = flightKeyframes(from, to, flightPeak(from, to, lift, layout.ceiling))
    const trail = this.circle(layout.radius * 0.6, flightClass[kind])
    const head = this.circle(layout.radius, flightClass[kind])
    this.host.layer.appendChild(trail)
    this.host.layer.appendChild(head)
    const flight: Flight = {
      eventId: event.id,
      kind,
      elements: [trail, head],
      animations: [
        trail.animate(trailKeyframes(frames), { duration: flightMs, delay: 45, easing: "linear", fill: "both" }),
        head.animate(frames, { duration: flightMs, easing: "linear", fill: "both" })
      ]
    }
    this.flights.add(flight)
    this.inFlight[kind] += 1
    flight.animations[1]?.finished.then(
      () => this.land(flight),
      () => undefined
    )
  }

  private land(flight: Flight) {
    if (this.isDestroyed || !this.flights.delete(flight)) {
      return
    }
    this.inFlight[flight.kind] -= 1
    this.arrived.push(...flight.elements)
    this.add(flight.eventId, one(flight.kind))
  }

  /** A rule drafted for the first time: the next rule's dot fills, and a ring goes out from it. */
  private fill(event: ReaderEvent) {
    const slot = this.landed.drafted
    this.add(event.id, { ...nothing, drafted: 1 })
    const layout = this.host.layout()
    const center = slotCenter(layout, "rules", slot)
    const ring = this.circle(layout.radius, "fill-none stroke-coverage-rule")
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

  /** Counts an event's finds as landed. */
  private add(eventId: string, finds: Shown) {
    this.landedBy.set(eventId, plus(this.landedBy.get(eventId) ?? nothing, finds))
    this.landed.terms += finds.terms
    this.landed.vocabulary += finds.vocabulary
    this.landed.rules += finds.rules
    this.landed.drafted += finds.drafted
    this.requestShow()
  }

  /** Something the build dropped, as a section answered again can: it won't show, and its dots fade. */
  private withdraw(event: ReaderEvent) {
    this.known.delete(event.id)
    this.queue = this.queue.filter((queued) => queued.id !== event.id)
    if (this.beat?.event.id === event.id) {
      this.beat = null
    }
    for (const flight of this.flights) {
      if (flight.eventId === event.id) {
        flight.animations.forEach((animation) => animation.cancel())
        flight.elements.forEach((element) => element.remove())
        this.inFlight[flight.kind] -= 1
        this.flights.delete(flight)
      }
    }
    const finds = this.landedBy.get(event.id)
    if (!finds) {
      return
    }
    this.landedBy.delete(event.id)
    const layout = this.host.layout()
    for (const kind of findKinds) {
      for (let slot = this.landed[kind] - finds[kind]; slot < this.landed[kind]; slot++) {
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
      this.landed[kind] -= finds[kind]
    }
    this.landed.drafted -= finds.drafted
    this.requestShow()
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
