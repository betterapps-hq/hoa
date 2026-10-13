import { useDebouncedCallback, useWindowEvent } from "@mantine/hooks"
import { useRef, useState } from "react"

// Editing in place (ux.md, Saving as you go): a page that keeps each change as it's made, with no Save button.

export type SaveState = "idle" | "saving" | "saved" | "failed"

export type AutosaveOptions = {
  /** How long a change waits for the next one before it's saved, in milliseconds; 0 saves each change at once. */
  delay?: number
}

/**
 * A value edited in place and saved as it changes: one save at a time, then the latest change, so what's stored always
 * ends as the screen shows it. With a delay, typing saves at its pauses, and at least every few pauses' worth while it
 * goes on. Leaving the page with a change not yet saved asks first; leaving the screen saves it.
 */
export function useAutosave<T>(initial: T, save: (value: T) => Promise<void>, { delay = 0 }: AutosaveOptions = {}) {
  const [value, setValue] = useState(initial)
  const [state, setState] = useState<SaveState>("idle")
  const latest = useRef(initial)
  const saved = useRef(initial)
  const running = useRef<Promise<boolean> | null>(null)

  /** Saves until what's stored is the latest value: true once it is, false when a save fails. */
  const drain = (): Promise<boolean> => {
    if (running.current) {
      return running.current
    }
    // The saves start after `running` is set, so a call in the meantime joins them.
    const run = Promise.resolve().then(async () => {
      try {
        while (latest.current !== saved.current) {
          const pending = latest.current
          await save(pending)
          saved.current = pending
        }
        setState("saved")
        return true
      } catch {
        setState("failed")
        return false
      } finally {
        running.current = null
      }
    })
    running.current = run
    setState("saving")
    return run
  }
  const debounced = useDebouncedCallback(() => void drain(), {
    delay,
    maxWait: delay * 4,
    flushOnUnmount: true
  })

  const update = (change: (current: T) => T) => {
    const next = change(latest.current)
    latest.current = next
    setValue(next)
    if (delay > 0) {
      setState("saving")
      debounced()
    } else {
      void drain()
    }
  }
  /** Saves now whatever is waiting: true once everything is saved, false when a save fails. */
  const flush = () => {
    debounced.cancel()
    return latest.current === saved.current && !running.current ? Promise.resolve(true) : drain()
  }
  /** Drops a change still waiting, such as on a draft being deleted. */
  const discard = () => {
    debounced.cancel()
    saved.current = latest.current
  }
  useWindowEvent("beforeunload", (event) => {
    if (latest.current !== saved.current) {
      event.preventDefault()
    }
  })
  return { value, latest, state, update, flush, discard, retry: () => void drain() }
}
