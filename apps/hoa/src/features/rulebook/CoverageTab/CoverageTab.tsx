import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import { coverageKinds, coverageReport, coveredShare, totalOf, type CoverageTotals } from "@/rulebook/coverage"
import { CoverageBar } from "../CoverageBar/CoverageBar"
import { CoverageDocument } from "../CoverageDocument/CoverageDocument"
import { coverageKindLabels, coverageKindStyles, percentText } from "../coverageKinds"
import { ProvisionCoverageList } from "../ProvisionCoverageList/ProvisionCoverageList"
import { countOf } from "../rulebookRecords"
import { useRulebookWorkspace } from "../useRulebookWorkspace"

const views = [
  { value: "text", label: "Document text" },
  { value: "list", label: "Provision list" }
] as const
type View = (typeof views)[number]["value"]

/**
 * How much of the governing documents the rulebook covers (encoding.md, UX, Coverage), like a test coverage report:
 * the share of the text each kind covers, then either the documents' text marked passage by passage, or every
 * provision as a list to search and review.
 */
export function CoverageTab() {
  const { records, coverage, vocabulary, source, actions } = useRulebookWorkspace()
  const [view, setView] = useState<View>("text")
  const sourceText = useQuery({
    queryKey: ["rulebook-source-text"],
    queryFn: () => source.loadSourceText(),
    staleTime: Number.POSITIVE_INFINITY
  })
  const report = coverageReport(records, coverage, vocabulary, sourceText.data ?? [])
  const reasonsToReview = records.provisions.filter((provision) => provision.noRule?.review.status === "proposed")
  const outsideCount = report.documents.reduce(
    (sum, document) =>
      sum + document.articles.flatMap((article) => article.passages).filter((item) => item.kind === "outside").length,
    0
  )

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="coverage-summary" className="flex flex-col gap-3 rounded-lg border p-4">
        <h3 id="coverage-summary" className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-3xl font-semibold tabular-nums">{percentText(coveredShare(report.totals))}</span>
          <span className="text-sm text-muted-foreground">of the documents&rsquo; text is covered</span>
        </h3>
        <CoverageBar totals={report.totals} label="All documents" className="h-3" />
        <CoverageLegend totals={report.totals} />
        <p className="text-sm text-muted-foreground">
          {totalOf(report.totals).toLocaleString("en-US")} characters in {records.provisions.length} provisions:{" "}
          {countOf(coverage.uncovered.length, "uncovered provision", "uncovered provisions")},{" "}
          {countOf(outsideCount, "passage", "passages")} outside any provision
          {actions ? `, ${countOf(reasonsToReview.length, "reason", "reasons")} for having no rule to review` : ""}.
        </p>
        {sourceText.isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> Reading the pages for text outside any provision
          </p>
        ) : null}
        {sourceText.error ? (
          <p className="text-sm text-destructive">
            The pages couldn&rsquo;t be read, so text outside any provision isn&rsquo;t counted.
          </p>
        ) : null}
      </section>
      <ToggleGroup
        variant="outline"
        size="sm"
        spacing={0}
        aria-label="View"
        value={[view]}
        onValueChange={(value) => {
          const next = views.find((choice) => choice.value === value[0])
          if (next) {
            setView(next.value)
          }
        }}
      >
        {views.map((choice) => (
          <ToggleGroupItem key={choice.value} value={choice.value}>
            {choice.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {view === "text" ? <CoverageDocument report={report} /> : <ProvisionCoverageList />}
    </div>
  )
}

/** Each kind's color, icon and share of the characters, and how encoded values are marked. */
function CoverageLegend({ totals }: { totals: CoverageTotals }) {
  const total = totalOf(totals)
  return (
    <ul aria-label="Legend" className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
      {coverageKinds.map((kind) => {
        const style = coverageKindStyles[kind]
        const Icon = style.icon
        return (
          <li key={kind} className="flex items-center gap-1.5">
            <span className={cn("size-3 shrink-0 rounded-sm", style.fill)} aria-hidden />
            <Icon className={cn("size-3.5 shrink-0", style.iconColor)} aria-hidden />
            <span>{coverageKindLabels[kind]}</span>
            <span className="tabular-nums text-muted-foreground">
              {percentText(total === 0 ? 0 : totals[kind] / total)}
            </span>
          </li>
        )
      })}
      <li className="flex items-center gap-1.5">
        <span className="font-semibold underline decoration-2 underline-offset-4">30 days</span>
        <span className="text-muted-foreground">A value a rule encodes</span>
      </li>
    </ul>
  )
}
