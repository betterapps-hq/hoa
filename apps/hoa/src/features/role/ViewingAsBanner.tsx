import { EyeIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { authClient } from "@/auth/authClient"
import { throwIfFailed } from "@/auth/authErrors"
import { Button } from "@/components/ui/button"

/**
 * Across the top of the whole app while one of the platform's operators views it as someone, with the way back to their
 * own account. The shell sets `--banner-height` so the sidebar and header sit below it.
 */
export function ViewingAsBanner({ name }: { name: string }) {
  const [isStopping, setStopping] = useState(false)
  const stop = async () => {
    setStopping(true)
    try {
      throwIfFailed(await authClient.admin.stopImpersonating())
      // A full load, so nothing of theirs stays on the page.
      window.location.assign("/people")
    } catch (caught) {
      setStopping(false)
      toast.error(caught instanceof Error ? caught.message : "That didn't work. Try again.")
    }
  }
  return (
    <div className="fixed inset-x-0 top-0 z-30 flex h-(--banner-height) items-center gap-3 bg-yellow-300 px-4 text-sm text-yellow-950 lg:px-6">
      <EyeIcon className="size-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1 truncate">
        Viewing as <span className="font-medium">{name}</span>
      </p>
      <Button size="xs" variant="secondary" disabled={isStopping} onClick={() => void stop()}>
        Stop viewing
      </Button>
    </div>
  )
}
