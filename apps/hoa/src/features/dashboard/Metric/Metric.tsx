import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

// The board's figures across the top of its dashboard (docs/dashboard.md): each one number, what it counts, and where
// to act on it.

type MetricProps = {
  label: string
  icon: LucideIcon
  value: string
  /** What the number is made of, in a line. */
  detail: ReactNode
  /** How it's trending, or what in it needs a look. */
  badge?: ReactNode
  /** Where it's dealt with: a link, styled as one. */
  action: ReactNode
}

/** One figure, with what it counts and where to act on it. */
export function Metric({ label, icon: Icon, value, detail, badge, action }: MetricProps) {
  return (
    <Card className="@container/metric gap-4">
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          <Icon className="size-4" aria-hidden />
          {label}
        </CardDescription>
        <CardTitle className="text-2xl font-semibold tracking-tight tabular-nums @[15rem]/metric:text-3xl">
          {value}
        </CardTitle>
        {badge ? <CardAction>{badge}</CardAction> : null}
      </CardHeader>
      <CardFooter className="mt-auto flex-col items-start gap-1.5 text-sm">
        <span className="text-muted-foreground">{detail}</span>
        {action}
      </CardFooter>
    </Card>
  )
}
