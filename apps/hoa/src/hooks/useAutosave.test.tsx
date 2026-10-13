import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useAutosave } from "./useAutosave"

/** A save the test finishes when it chooses, failing it with an error or not. */
function controlledSave() {
  const calls: { value: number; finish: (error?: Error) => void }[] = []
  const save = vi.fn<(value: number) => Promise<void>>(
    (value) =>
      new Promise((resolve, reject) => {
        calls.push({ value, finish: (error) => (error ? reject(error) : resolve()) })
      })
  )
  return { save, calls }
}

const leave = () => {
  const event = new Event("beforeunload", { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

describe("useAutosave", () => {
  it("saves one change at a time, then only the latest", async () => {
    const { save, calls } = controlledSave()
    const { result } = renderHook(() => useAutosave<number>(0, save))
    act(() => result.current.update(() => 1))
    await waitFor(() => expect(calls).toHaveLength(1))
    act(() => {
      result.current.update(() => 2)
      result.current.update((current) => current + 1)
    })
    expect(result.current.value).toBe(3)
    expect(result.current.state).toBe("saving")
    await act(async () => calls[0]?.finish())
    await waitFor(() => expect(calls).toHaveLength(2))
    expect(calls[1]?.value).toBe(3)
    await act(async () => calls[1]?.finish())
    await waitFor(() => expect(result.current.state).toBe("saved"))
    expect(save).toHaveBeenCalledTimes(2)
  })

  it("says when a save fails, and tries the latest again", async () => {
    const { calls, save } = controlledSave()
    const { result } = renderHook(() => useAutosave<number>(0, save))
    act(() => result.current.update(() => 1))
    await waitFor(() => expect(calls).toHaveLength(1))
    await act(async () => calls[0]?.finish(new Error("Offline.")))
    await waitFor(() => expect(result.current.state).toBe("failed"))
    act(() => result.current.retry())
    await waitFor(() => expect(calls).toHaveLength(2))
    expect(calls[1]?.value).toBe(1)
  })

  it("waits for a pause in typing before it saves", async () => {
    vi.useFakeTimers()
    try {
      const save = vi.fn<(value: number) => Promise<void>>(async () => undefined)
      const { result } = renderHook(() => useAutosave<number>(0, save, { delay: 500 }))
      act(() => result.current.update(() => 1))
      await act(() => vi.advanceTimersByTimeAsync(300))
      act(() => result.current.update(() => 2))
      await act(() => vi.advanceTimersByTimeAsync(300))
      expect(result.current.state).toBe("saving")
      expect(save).not.toHaveBeenCalled()
      await act(() => vi.advanceTimersByTimeAsync(200))
      expect(save).toHaveBeenCalledOnce()
      expect(save).toHaveBeenCalledWith(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it("saves a waiting change at once when asked, resolving once everything is saved", async () => {
    const save = vi.fn<(value: number) => Promise<void>>(async () => undefined)
    const { result } = renderHook(() => useAutosave<number>(0, save, { delay: 10_000 }))
    await act(async () => expect(await result.current.flush()).toBe(true))
    expect(save).not.toHaveBeenCalled()
    act(() => result.current.update(() => 5))
    await act(async () => expect(await result.current.flush()).toBe(true))
    expect(save).toHaveBeenCalledWith(5)
  })

  it("asks before the page closes with a change not saved, unless the change is dropped", () => {
    const save = vi.fn<(value: number) => Promise<void>>(async () => undefined)
    const { result } = renderHook(() => useAutosave<number>(0, save, { delay: 10_000 }))
    expect(leave()).toBe(false)
    act(() => result.current.update(() => 1))
    expect(leave()).toBe(true)
    act(() => result.current.discard())
    expect(leave()).toBe(false)
    expect(save).not.toHaveBeenCalled()
  })
})
