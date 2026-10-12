import {
  BookOpenIcon,
  CircleAlertIcon,
  CircleDashedIcon,
  CircleSlash2Icon,
  ScaleIcon,
  Settings2Icon,
  SquareDashedIcon,
  type LucideIcon
} from "lucide-react"
import type { CoverageKind } from "@/rulebook/coverage"

// How the coverage tab shows each kind of coverage (encoding.md, UX, Coverage): a label, an icon and the kind's color
// tokens (styles.css), so a kind never relies on color alone.

export const coverageKindLabels: Record<CoverageKind, string> = {
  rule: "Rule",
  term: "Term definition",
  settings: "Settings clause",
  reason: "No rule, reason approved",
  "to-review": "No rule, reason to review",
  outside: "Outside any provision",
  uncovered: "Uncovered"
}

type KindStyle = {
  icon: LucideIcon
  /** A bar segment or swatch. */
  fill: string
  /** An icon in the kind's color. */
  iconColor: string
  /** A passage highlighted on a document page: a tint, and an underline or stripes so the gaps don't rely on color. */
  mark: string
}

export const coverageKindStyles: Record<CoverageKind, KindStyle> = {
  rule: {
    icon: ScaleIcon,
    fill: "bg-coverage-rule",
    iconColor: "text-coverage-rule",
    mark: "bg-coverage-rule/15 dark:bg-coverage-rule/25"
  },
  term: {
    icon: BookOpenIcon,
    fill: "bg-coverage-term",
    iconColor: "text-coverage-term",
    mark: "bg-coverage-term/15 dark:bg-coverage-term/25"
  },
  settings: {
    icon: Settings2Icon,
    fill: "bg-coverage-settings",
    iconColor: "text-coverage-settings",
    mark: "bg-coverage-settings/15 dark:bg-coverage-settings/30"
  },
  reason: {
    icon: CircleSlash2Icon,
    fill: "bg-coverage-reason",
    iconColor: "text-coverage-reason",
    mark: "bg-coverage-reason/15 dark:bg-coverage-reason/25"
  },
  "to-review": {
    icon: CircleDashedIcon,
    fill: "bg-coverage-to-review",
    iconColor: "text-coverage-to-review",
    mark: "bg-coverage-to-review/15 underline decoration-coverage-to-review decoration-dashed decoration-2 underline-offset-4"
  },
  outside: {
    icon: SquareDashedIcon,
    fill: "bg-coverage-outside coverage-hatch",
    iconColor: "text-muted-foreground",
    mark: "bg-transparent coverage-stripes-outside underline decoration-coverage-outside decoration-dotted decoration-2 underline-offset-4"
  },
  uncovered: {
    icon: CircleAlertIcon,
    fill: "bg-coverage-uncovered coverage-hatch",
    iconColor: "text-coverage-uncovered",
    mark: "bg-coverage-uncovered/15 coverage-stripes-uncovered underline decoration-coverage-uncovered decoration-wavy underline-offset-4"
  }
}

/** "60.4%": a share, rounded down so a gap never reads as 100%, and a sliver never as nothing. */
export function percentText(share: number) {
  const tenths = Math.floor(share * 1000)
  return share > 0 && tenths === 0 ? "under 0.1%" : `${tenths / 10}%`
}
