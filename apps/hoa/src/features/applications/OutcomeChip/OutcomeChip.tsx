import {
  BanIcon,
  CircleCheckIcon,
  CircleHelpIcon,
  CircleXIcon,
  ClockIcon,
  LightbulbIcon,
  ShieldCheckIcon,
  UsersIcon,
  type LucideIcon
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { Outcome } from "@/schema/types"
import { cellLabels } from "../applicationDisplay"

// Status colors from Tailwind's palette, as shadcn's dashboard block colors its status icons.
export const outcomeIcons: Record<Exclude<Outcome, "not-applicable">, { icon: LucideIcon; className: string }> = {
  met: { icon: CircleCheckIcon, className: "text-green-600 dark:text-green-400" },
  "not-met": { icon: CircleXIcon, className: "text-red-600 dark:text-red-400" },
  "missing-information": { icon: CircleHelpIcon, className: "text-amber-600 dark:text-amber-400" },
  committee: { icon: UsersIcon, className: "text-blue-600 dark:text-blue-400" },
  advisory: { icon: LightbulbIcon, className: "text-violet-600 dark:text-violet-400" },
  pending: { icon: ClockIcon, className: "text-sky-600 dark:text-sky-400" },
  exempt: { icon: ShieldCheckIcon, className: "text-muted-foreground" },
  available: { icon: CircleCheckIcon, className: "text-green-600 dark:text-green-400" },
  blocked: { icon: BanIcon, className: "text-red-600 dark:text-red-400" }
}

export type OutcomeChipProps = { outcome: Outcome }

/** A finding's outcome as a chip; "doesn't apply" is a muted n/a. */
export function OutcomeChip({ outcome }: OutcomeChipProps) {
  if (outcome === "not-applicable") {
    return <span className="text-xs text-muted-foreground">{cellLabels[outcome]}</span>
  }
  const { icon: Icon, className } = outcomeIcons[outcome]
  return (
    <Badge variant="outline">
      <Icon className={className} aria-hidden />
      {cellLabels[outcome]}
    </Badge>
  )
}
