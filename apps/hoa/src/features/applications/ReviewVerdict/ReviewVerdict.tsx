import { CircleCheckIcon, CircleHelpIcon, CircleXIcon, UsersIcon, type LucideIcon } from "lucide-react"
import { useId, type ReactNode } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { VerdictTone } from "./ReviewVerdict.utils"

// Status colors from Tailwind's palette, as the outcome chips use them, on a tint of their own.
export const verdictTones: Record<VerdictTone, { icon: LucideIcon; className: string; dot: string }> = {
  positive: {
    icon: CircleCheckIcon,
    className: "bg-green-500/10 text-green-600 dark:text-green-400",
    dot: "bg-green-500"
  },
  caution: {
    icon: CircleHelpIcon,
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500"
  },
  committee: { icon: UsersIcon, className: "bg-blue-500/10 text-blue-600 dark:text-blue-400", dot: "bg-blue-500" },
  negative: { icon: CircleXIcon, className: "bg-red-500/10 text-red-600 dark:text-red-400", dot: "bg-red-500" }
}

export type ReviewVerdictProps = {
  /** Whose verdict it is: "The review recommends", "Committee decision". */
  eyebrow: string
  headline: string
  /** Why: the review's summary, or the committee's note. */
  reason: ReactNode
  tone: VerdictTone
  /** A quiet line under the reason, such as when the review ran. */
  meta?: ReactNode
  /** The counts under it. */
  children?: ReactNode
}

/** The top of the application page: the recommendation or the decision, with why, and what it rests on. */
export function ReviewVerdict({ eyebrow, headline, reason, tone, meta, children }: ReviewVerdictProps) {
  const headingId = useId()
  const { icon: Icon, className } = verdictTones[tone]
  return (
    <section aria-labelledby={headingId}>
      <Card>
        <CardContent className="flex flex-col gap-5">
          <div className="flex items-start gap-4">
            <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", className)}>
              <Icon className="size-5" aria-hidden />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-sm text-muted-foreground">{eyebrow}</p>
              <h2 id={headingId} className="text-xl font-semibold tracking-tight text-balance">
                {headline}
              </h2>
              {reason ? <p className="max-w-prose text-pretty whitespace-pre-line">{reason}</p> : null}
              {meta}
            </div>
          </div>
          {children}
        </CardContent>
      </Card>
    </section>
  )
}
