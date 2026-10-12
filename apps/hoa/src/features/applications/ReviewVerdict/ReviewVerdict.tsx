import { CircleCheckIcon, CircleHelpIcon, CircleXIcon, UsersIcon, type LucideIcon } from "lucide-react"
import { useId, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import type { VerdictTone } from "./ReviewVerdict.utils"

// Status colors from Tailwind's palette, as the outcome chips use them.
const tones: Record<VerdictTone, { icon: LucideIcon; className: string }> = {
  positive: { icon: CircleCheckIcon, className: "text-green-600 dark:text-green-400" },
  caution: { icon: CircleHelpIcon, className: "text-amber-600 dark:text-amber-400" },
  committee: { icon: UsersIcon, className: "text-blue-600 dark:text-blue-400" },
  negative: { icon: CircleXIcon, className: "text-red-600 dark:text-red-400" }
}

export type ReviewVerdictProps = {
  /** Whose verdict it is: "The review recommends", "Committee decision". */
  eyebrow: string
  headline: string
  /** One sentence of why. */
  reason: ReactNode
  tone: VerdictTone
  /** Quiet lines under the reason, such as when the review ran. */
  children?: ReactNode
}

/** The top of the application page: the recommendation or the decision, large, with why. */
export function ReviewVerdict({ eyebrow, headline, reason, tone, children }: ReviewVerdictProps) {
  const headingId = useId()
  const { icon: Icon, className } = tones[tone]
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className={cn("size-4", className)} aria-hidden />
        {eyebrow}
      </p>
      <h2 id={headingId} className="text-3xl font-semibold tracking-tight text-balance">
        {headline}
      </h2>
      {reason ? <p className="max-w-prose text-base text-pretty">{reason}</p> : null}
      {children}
    </section>
  )
}
