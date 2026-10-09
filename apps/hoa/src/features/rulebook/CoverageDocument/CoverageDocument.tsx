import { useMediaQuery } from "@mantine/hooks"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import {
  coveredShare,
  type CoveragePassage as Passage,
  type CoverageReport,
  type DocumentCoverage
} from "@/rulebook/coverage"
import { CoverageBar } from "../CoverageBar/CoverageBar"
import { coverageKindLabels, coverageKindStyles, percentText } from "../coverageKinds"
import { CoveragePassage } from "../CoveragePassage/CoveragePassage"
import { PassageCoverage } from "../PassageCoverage/PassageCoverage"
import { countOf, readableLabel } from "../rulebookRecords"
import { gapsOf, passageId, passageLabel } from "./CoverageDocument.utils"

export type CoverageDocumentProps = { report: CoverageReport }

const gapPageSize = 20
// Wide enough for the text beside a persistent panel; narrower screens show the panel in a sheet.
const wideScreen = "(min-width: 80rem)"

/**
 * A coverage report's documents (encoding.md, UX, Coverage): pick a document, see its coverage per article as stacked
 * bars and its gaps, and read its text passage by passage, each marked by what covers it. Choosing a passage shows
 * everything that covers or cites it in a panel beside the text (a sheet on narrow screens); a bar or a gap jumps to
 * its passage.
 */
export function CoverageDocument({ report }: CoverageDocumentProps) {
  const isWide = useMediaQuery(wideScreen) === true
  const [documentKey, setDocumentKey] = useState(report.documents[0]?.key ?? "")
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [focusRequest, setFocusRequest] = useState(0)
  const headingRef = useRef<HTMLHeadingElement>(null)
  // A passage chosen from its label moves focus to the panel that lists what covers it.
  useEffect(() => {
    if (focusRequest > 0) {
      headingRef.current?.focus()
    }
  }, [focusRequest])

  const shown = report.documents.find((item) => item.key === documentKey) ?? report.documents[0]
  if (!shown) {
    return (
      <p className="rounded-lg border py-8 text-center text-sm text-muted-foreground">No document has provisions.</p>
    )
  }
  const selected = shown.articles.flatMap((article) => article.passages).find((item) => item.key === selectedKey)

  const select = (key: string, isFocusMoved: boolean) => {
    setSelectedKey(key)
    if (!isWide) {
      setIsSheetOpen(true)
    } else if (isFocusMoved) {
      setFocusRequest((count) => count + 1)
    }
  }
  const passageButton = (key: string) => document.getElementById(passageId(key))?.querySelector("button")
  const jumpTo = (key: string, isSelected: boolean) => {
    document.getElementById(passageId(key))?.scrollIntoView({ block: "start", behavior: "smooth" })
    passageButton(key)?.focus({ preventScroll: true })
    if (isSelected) {
      select(key, false)
    }
  }
  const panel = selected ? (
    <PassageCoverage
      passage={selected}
      referencedBy={selected.type === "provision" ? (report.referencedBy.get(selected.provision.key) ?? []) : []}
      headingRef={headingRef}
    />
  ) : null

  return (
    <div className="@container flex flex-col gap-4">
      {report.documents.length > 1 ? (
        <DocumentPicker
          report={report}
          shownKey={shown.key}
          onPick={(key) => {
            setDocumentKey(key)
            setSelectedKey(null)
          }}
        />
      ) : null}
      <div className="grid gap-4 @3xl:grid-cols-2">
        <ArticleBars coverage={shown} onJump={(key) => jumpTo(key, false)} />
        <GapList key={shown.key} gaps={gapsOf(shown)} onJump={(key) => jumpTo(key, true)} />
      </div>
      {shown.skippedPages.map((skipped) => (
        <p key={skipped.fileId} className="text-xs text-muted-foreground">
          {skipped.pages.length === 1 ? `Page ${skipped.pages[0]} was` : `Pages ${skipped.pages.join(", ")} were`} read
          as front matter (a cover or contents) and not counted.
        </p>
      ))}
      <div className={cn("grid gap-4", isWide && "grid-cols-[minmax(0,1fr)_22rem]")}>
        <div className="flex min-w-0 flex-col gap-4">
          {shown.articles.map((article) => (
            <section
              key={article.provision.key}
              aria-label={`${readableLabel(article.provision.label)}${article.provision.heading ? ` ${article.provision.heading}` : ""}`}
              className="flex flex-col gap-1"
            >
              {article.passages.map((passage) => (
                <CoveragePassage
                  key={passage.key}
                  passage={passage}
                  isSelected={passage.key === selectedKey}
                  onSelect={(isFromLabel) => select(passage.key, isFromLabel)}
                />
              ))}
            </section>
          ))}
        </div>
        {isWide ? (
          <aside
            aria-label="What covers the passage"
            className="sticky top-4 flex max-h-[calc(100vh-2rem)] flex-col gap-4 self-start overflow-y-auto rounded-lg border bg-card p-4"
          >
            {selected ? (
              <>
                {panel}
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-fit"
                  onClick={() => passageButton(selected.key)?.focus()}
                >
                  Back to the passage
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Choose a passage to see the rules, terms, settings, questions and reasons that cover it, and the
                provisions that refer to it.
              </p>
            )}
          </aside>
        ) : (
          <Sheet open={isSheetOpen && selected !== undefined} onOpenChange={setIsSheetOpen}>
            <SheetContent className="w-full gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md">
              <SheetHeader>
                <SheetTitle>What covers it</SheetTitle>
              </SheetHeader>
              <div className="px-4 pb-6">{panel}</div>
            </SheetContent>
          </Sheet>
        )}
      </div>
    </div>
  )
}

function DocumentPicker({
  report,
  shownKey,
  onPick
}: {
  report: CoverageReport
  shownKey: string
  onPick: (key: string) => void
}) {
  return (
    <section aria-labelledby="coverage-documents" className="flex flex-col gap-2">
      <h3 id="coverage-documents" className="text-sm font-medium">
        Documents
      </h3>
      <ul className="grid gap-2 @xl:grid-cols-2">
        {report.documents.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              aria-pressed={item.key === shownKey}
              className={cn(
                "flex w-full flex-col gap-1.5 rounded-lg border p-3 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                item.key === shownKey && "border-primary bg-muted"
              )}
              onClick={() => onPick(item.key)}
            >
              <span className="flex w-full items-baseline justify-between gap-2">
                <span className="font-medium">{item.title}</span>
                <span className="shrink-0 tabular-nums">{percentText(coveredShare(item.totals))}</span>
              </span>
              <CoverageBar totals={item.totals} label={item.title} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Each article's coverage as a stacked bar, like a coverage report's file list; a bar jumps to its article. */
function ArticleBars({ coverage, onJump }: { coverage: DocumentCoverage; onJump: (key: string) => void }) {
  return (
    <section aria-labelledby="coverage-articles" className="flex min-w-0 flex-col gap-2">
      <h3 id="coverage-articles" className="text-sm font-medium">
        {coverage.title} by article
      </h3>
      <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto rounded-lg border p-1">
        {coverage.articles.map((article) => {
          const label = readableLabel(article.provision.label)
          return (
            <li key={article.provision.key}>
              <button
                type="button"
                className="flex w-full flex-col gap-1 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                onClick={() => onJump(article.provision.key)}
              >
                <span className="flex w-full items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{label}</span>
                    {article.provision.heading ? (
                      <span className="text-muted-foreground"> {article.provision.heading}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 tabular-nums">{percentText(coveredShare(article.totals))}</span>
                </span>
                <CoverageBar totals={article.totals} label={label} className="h-2" />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** The passages to act on, in order; each jumps to its passage and shows what covers it. */
function GapList({ gaps, onJump }: { gaps: Passage[]; onJump: (key: string) => void }) {
  const [count, setCount] = useState(gapPageSize)
  return (
    <section aria-labelledby="coverage-gaps" className="flex min-w-0 flex-col gap-2">
      <h3 id="coverage-gaps" className="text-sm font-medium">
        {gaps.length === 0 ? "No gaps" : countOf(gaps.length, "gap", "gaps")}
      </h3>
      {gaps.length === 0 ? (
        <p className="text-sm text-muted-foreground">Every passage is covered or has a reason for having no rule.</p>
      ) : (
        <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto rounded-lg border p-1">
          {gaps.slice(0, count).map((gap) => {
            const style = coverageKindStyles[gap.kind]
            const Icon = style.icon
            return (
              <li key={gap.key}>
                <button
                  type="button"
                  className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  onClick={() => onJump(gap.key)}
                >
                  <Icon className={cn("mt-px size-3.5 shrink-0", style.iconColor)} aria-hidden />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">
                      {passageLabel(gap)}: {coverageKindLabels[gap.kind]}
                    </span>
                    <span className="line-clamp-1 text-muted-foreground">{gap.text}</span>
                  </span>
                </button>
              </li>
            )
          })}
          {gaps.length > count ? (
            <li>
              <Button
                size="sm"
                variant="ghost"
                className="w-fit"
                onClick={() => setCount((shown) => shown + gapPageSize)}
              >
                Show {Math.min(gapPageSize, gaps.length - count)} more
              </Button>
            </li>
          ) : null}
        </ul>
      )}
    </section>
  )
}
