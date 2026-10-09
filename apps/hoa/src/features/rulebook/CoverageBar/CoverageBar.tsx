import { cn } from "@/lib/utils"
import { coverageKinds, coveredShare, totalOf, type CoverageTotals } from "@/rulebook/coverage"
import { coverageKindLabels, coverageKindStyles, percentText } from "../coverageKinds"

export type CoverageBarProps = {
  totals: CoverageTotals
  /** What the bar measures, for the text a screen reader reads: "Declaration", "Article 4". */
  label: string
  /** Its height: h-2.5 by default. */
  className?: string
}

/** The share of characters each kind covers, as one stacked bar, read out as text for a screen reader. */
export function CoverageBar({ totals, label, className }: CoverageBarProps) {
  const total = totalOf(totals)
  const shown = coverageKinds.filter((kind) => totals[kind] > 0)
  const description = shown.map((kind) => `${coverageKindLabels[kind]} ${percentText(totals[kind] / total)}`).join(", ")
  return (
    <div className={cn("h-2.5 w-full", className)}>
      <div aria-hidden className="flex h-full w-full gap-0.5 overflow-hidden rounded-full bg-muted">
        {shown.map((kind) => (
          <div
            key={kind}
            title={`${coverageKindLabels[kind]}: ${percentText(totals[kind] / total)}`}
            className={cn("h-full min-w-0.75 basis-0", coverageKindStyles[kind].fill)}
            style={{ flexGrow: totals[kind] }}
          />
        ))}
      </div>
      <span className="sr-only">
        {label}: {percentText(coveredShare(totals))} covered{description ? `; ${description}` : ""}
      </span>
    </div>
  )
}
