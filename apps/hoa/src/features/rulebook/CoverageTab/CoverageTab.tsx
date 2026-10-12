import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { Field, FieldLabel } from "@/components/ui/field"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import {
  coverageKinds,
  coverageReport,
  coveredShare,
  totalOf,
  type CoverageKind,
  type CoverageTotals,
  type DocumentCoverage
} from "@/rulebook/coverage"
import { CoverageBar } from "../CoverageBar/CoverageBar"
import { coverageKindLabels, coverageKindStyles, percentText } from "../coverageKinds"
import { CoverageReader } from "../CoverageReader/CoverageReader"
import { fileOf } from "../CoverageReader/CoverageReader.utils"
import { ProvisionCoverageList } from "../ProvisionCoverageList/ProvisionCoverageList"
import { filterOf } from "../ProvisionCoverageList/ProvisionCoverageList.utils"
import { countOf } from "../rulebookRecords"
import { useRulebookWorkspace } from "../useRulebookWorkspace"

export type CoverageTabProps = {
  /** Opens the provision list with this filter, such as "uncovered" from a to-do link. */
  initialFilter?: string | null
}

function sumTotals(items: readonly { totals: CoverageTotals }[]): CoverageTotals {
  const sum = (kind: CoverageKind) => items.reduce((total, item) => total + item.totals[kind], 0)
  return {
    rule: sum("rule"),
    term: sum("term"),
    settings: sum("settings"),
    reason: sum("reason"),
    "to-review": sum("to-review"),
    outside: sum("outside"),
    uncovered: sum("uncovered")
  }
}

const provisionCount = (document: DocumentCoverage) =>
  document.articles
    .flatMap((article) => article.passages)
    .filter((passage) => passage.type === "provision" && passage.part === "main").length

/**
 * How much of the governing documents the rulebook covers (encoding.md, UX, Coverage): one share for the documents
 * the build read from their pages, a plain word for any it hasn't, then either a document's own pages with every
 * passage highlighted by what covers it, or every provision as a list to search and review.
 */
export function CoverageTab({ initialFilter = null }: CoverageTabProps) {
  const { records, coverage, vocabulary, source } = useRulebookWorkspace()
  const listFilter = filterOf(initialFilter)
  const [view, setView] = useState<"read" | "list">(listFilter ? "list" : "read")
  const sourceText = useQuery({
    queryKey: ["rulebook-source-text"],
    queryFn: () => source.loadSourceText(),
    staleTime: Number.POSITIVE_INFINITY
  })
  const report = coverageReport(records, coverage, vocabulary, sourceText.data ?? [])
  const built = report.documents.filter((document) => fileOf(document) !== null)
  const unbuilt = report.documents.filter((document) => fileOf(document) === null)
  const [documentKey, setDocumentKey] = useState<string | null>(null)
  const shown = built.find((document) => document.key === documentKey) ?? built[0]
  const totals = sumTotals(built)

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="coverage-summary" className="flex flex-col gap-3">
        {built.length > 0 ? (
          <>
            <h3 id="coverage-summary" className="text-base">
              <span className="font-semibold tabular-nums">{percentText(coveredShare(totals))}</span> of the text of{" "}
              {built.length === 1 ? (built[0]?.title ?? "the document") : `${built.length} documents`} is covered by a
              rule, a term, a setting or a reason for having no rule.
            </h3>
            <CoverageBar totals={totals} label="The documents" className="h-2" />
            <CoverageLegend totals={totals} />
          </>
        ) : (
          <h3 id="coverage-summary" className="text-base">
            No document has been read from its pages yet, so coverage can&rsquo;t be measured.
          </h3>
        )}
        {unbuilt.map((document) => (
          <p key={document.key} className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{document.title}: not built yet.</span> Its{" "}
            {countOf(provisionCount(document), "provision isn’t", "provisions aren’t")} linked to the pages of an
            upload, so its coverage can&rsquo;t be measured until the rulebook is built from it.
          </p>
        ))}
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

      <div className="flex flex-wrap items-end justify-between gap-3">
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          aria-label="View"
          value={[view]}
          onValueChange={(value) => setView(value[0] === "list" ? "list" : "read")}
        >
          <ToggleGroupItem value="read" disabled={built.length === 0}>
            On the pages
          </ToggleGroupItem>
          <ToggleGroupItem value="list">As a list</ToggleGroupItem>
        </ToggleGroup>
        {view === "read" && built.length > 1 && shown ? (
          <Field className="w-full sm:w-80">
            <FieldLabel htmlFor="coverage-document" className="sr-only">
              Document
            </FieldLabel>
            <NativeSelect
              id="coverage-document"
              className="w-full"
              value={shown.key}
              onChange={(event) => setDocumentKey(event.target.value)}
            >
              {built.map((document) => (
                <NativeSelectOption key={document.key} value={document.key}>
                  {document.title} ({percentText(coveredShare(document.totals))} covered)
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        ) : null}
      </div>
      {view === "read" && shown ? (
        <CoverageReader key={shown.key} report={report} document={shown} />
      ) : (
        <ProvisionCoverageList initialFilter={listFilter} />
      )}
    </div>
  )
}

/** Each kind's swatch and label, so the tints on the pages read without the colors alone. */
function CoverageLegend({ totals }: { totals: CoverageTotals }) {
  const total = totalOf(totals)
  return (
    <ul aria-label="What the colors mean" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {coverageKinds
        .filter((kind) => totals[kind] > 0)
        .map((kind) => {
          const style = coverageKindStyles[kind]
          const Icon = style.icon
          return (
            <li key={kind} className="flex items-center gap-1.5">
              <span className={cn("size-2.5 shrink-0 rounded-sm", style.fill)} aria-hidden />
              <Icon className={cn("size-3 shrink-0", style.iconColor)} aria-hidden />
              <span>
                {coverageKindLabels[kind]} {percentText(total === 0 ? 0 : totals[kind] / total)}
              </span>
            </li>
          )
        })}
    </ul>
  )
}
