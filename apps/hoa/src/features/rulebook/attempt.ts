import { toast } from "sonner"
import type { RecordRef } from "@/rulebook/review"
import type * as T from "@/schema/types"
import type { RulebookActions } from "./useRulebookWorkspace"

/** Runs an action, showing its error; resolves to its result, or undefined when it failed. */
export async function attempt<R>(action: () => Promise<R>, fallback: string): Promise<R | undefined> {
  try {
    return await action()
  } catch (error) {
    toast.error(error instanceof Error ? error.message : fallback)
    return undefined
  }
}

/** Reviews one record, saying why when it can't be approved yet. */
export async function reviewRecord(actions: RulebookActions, ref: RecordRef, status: T.Review["status"]) {
  const result = await attempt(() => actions.review([ref], status, null), "The review wasn't saved.")
  const [skipped] = result?.skipped ?? []
  if (skipped) {
    toast.error(`It can’t be approved yet. ${skipped.reasons.join(" ")}`)
  }
  return result
}
