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
  /** A passage of text: a tint, its edge, and stripes for the gaps. */
  passage: string
  /** An icon in the kind's color. */
  iconColor: string
}

export const coverageKindStyles: Record<CoverageKind, KindStyle> = {
  rule: {
    icon: ScaleIcon,
    fill: "bg-coverage-rule",
    passage: "border-coverage-rule bg-coverage-rule/10",
    iconColor: "text-coverage-rule"
  },
  term: {
    icon: BookOpenIcon,
    fill: "bg-coverage-term",
    passage: "border-coverage-term bg-coverage-term/10",
    iconColor: "text-coverage-term"
  },
  settings: {
    icon: Settings2Icon,
    fill: "bg-coverage-settings",
    passage: "border-coverage-settings bg-coverage-settings/10",
    iconColor: "text-coverage-settings"
  },
  reason: {
    icon: CircleSlash2Icon,
    fill: "bg-coverage-reason",
    passage: "border-coverage-reason bg-coverage-reason/10",
    iconColor: "text-coverage-reason"
  },
  "to-review": {
    icon: CircleDashedIcon,
    fill: "bg-coverage-to-review",
    passage: "border-coverage-to-review border-dashed bg-coverage-to-review/10",
    iconColor: "text-coverage-to-review"
  },
  outside: {
    icon: SquareDashedIcon,
    fill: "bg-coverage-outside coverage-hatch",
    passage: "border-coverage-outside border-dashed coverage-stripes-outside",
    iconColor: "text-muted-foreground"
  },
  uncovered: {
    icon: CircleAlertIcon,
    fill: "bg-coverage-uncovered coverage-hatch",
    passage: "border-coverage-uncovered bg-coverage-uncovered/10 coverage-stripes-uncovered",
    iconColor: "text-coverage-uncovered"
  }
}

/** "60.4%": a share, rounded down so a gap never reads as 100%, and a sliver never as nothing. */
export function percentText(share: number) {
  const tenths = Math.floor(share * 1000)
  return share > 0 && tenths === 0 ? "under 0.1%" : `${tenths / 10}%`
}
