import { CheckIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import type { SaveState } from "@/hooks/useAutosave"

/** Whether what's on screen is saved (ux.md, Saving as you go): saving, saved, or not saved with a way to try again. */
export function SaveStatus({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  return (
    <output className="flex items-center gap-1.5 text-sm text-muted-foreground">
      {state === "saving" ? (
        <>
          <Spinner className="size-3.5" />
          Saving
        </>
      ) : null}
      {state === "saved" ? (
        <>
          <CheckIcon className="size-3.5" aria-hidden />
          Saved
        </>
      ) : null}
      {state === "failed" ? (
        <>
          <span className="text-destructive">Not saved</span>
          <Button variant="link" size="sm" className="h-auto p-0 text-link" onClick={onRetry}>
            Try again
          </Button>
        </>
      ) : null}
    </output>
  )
}
