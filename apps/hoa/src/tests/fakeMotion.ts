import { onTestFinished, vi } from "vitest"

// Motion on a clock the test moves, for tests of what's animated (DocumentEncodingFindings): `performance.now()` reads it,
// animation frames run as it moves, and an `Element.animate` animation finishes once its time is up, not before. Each
// animation keeps its element, keyframes and options for the test to look at.

export type FakeAnimation = {
  animation: Animation
  element: Element
  keyframes: Keyframe[]
  options: KeyframeAnimationOptions
  /** When it ends: Infinity for one that repeats forever. */
  ends: number
  wasCanceled: () => boolean
}

export function fakeMotion() {
  let clock = 1000
  let nextFrame = 1
  const frames = new Map<number, FrameRequestCallback>()
  const animations: FakeAnimation[] = []

  const now = vi.spyOn(performance, "now").mockImplementation(() => clock)
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(nextFrame, callback)
    return nextFrame++
  })
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frames.delete(id)
  })
  const animate = vi.spyOn(Element.prototype, "animate").mockImplementation(function (
    this: Element,
    keyframes,
    timing
  ) {
    const options = typeof timing === "number" ? { duration: timing } : (timing ?? {})
    // A real animation that never plays on its own: it finishes when `advance` says so.
    const animation = new Animation(new KeyframeEffect(this, keyframes, options), document.timeline)
    // Canceling rejects the animation's finished promise, which browsers mark as handled and happy-dom doesn't.
    const cancel = animation.cancel.bind(animation)
    const canceled = vi.spyOn(animation, "cancel").mockImplementation(() => {
      animation.finished.catch(() => undefined)
      cancel()
    })
    animations.push({
      animation,
      element: this,
      keyframes: Array.isArray(keyframes) ? keyframes : [],
      options,
      ends: clock + (options.delay ?? 0) + Number(options.duration ?? 0) * (options.iterations ?? 1),
      wasCanceled: () => canceled.mock.calls.length > 0
    })
    return animation
  })
  onTestFinished(() => {
    now.mockRestore()
    animate.mockRestore()
    vi.unstubAllGlobals()
  })

  return {
    animations,
    /** Moves the clock on by `ms`, a frame at a time: animations whose time is up finish, then the frame's callbacks run. */
    async advance(ms: number) {
      const end = clock + ms
      while (clock < end) {
        clock = Math.min(end, clock + 16)
        for (const item of animations) {
          if (item.ends <= clock && item.animation.playState !== "finished" && !item.wasCanceled()) {
            item.animation.finish()
          }
        }
        // Lets what waits on the finished animations run before the frame does, as a browser does. Not a timer: on
        // Windows even a 0 ms timeout waits for the system's 15 ms tick.
        await new Promise((resolve) => setImmediate(resolve))
        const due = [...frames.values()]
        frames.clear()
        due.forEach((callback) => callback(clock))
      }
    }
  }
}
