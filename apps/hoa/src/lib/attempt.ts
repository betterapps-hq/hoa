import { toast } from "sonner"

/** What went wrong, in words to show: the Error's own, or a plain "try again". */
export const messageOf = (error: unknown) => (error instanceof Error ? error.message : "That didn't work. Try again.")

/**
 * Runs a change, saying in a toast how it went. A failure throws again, so the form or dialog that ran it stays open
 * (`saveThenClose`); a caller with nothing to keep open catches it.
 */
export async function attempt<T>(run: () => Promise<T>, success?: string): Promise<T> {
  try {
    const result = await run()
    if (success) {
      toast.success(success)
    }
    return result
  } catch (caught) {
    toast.error(messageOf(caught))
    throw caught
  }
}
