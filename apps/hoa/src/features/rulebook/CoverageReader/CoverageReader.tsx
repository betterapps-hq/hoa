import { useMediaQuery } from "@mantine/hooks"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { DocumentViewer } from "@/features/documents/DocumentViewer/DocumentViewer"
import { cn } from "@/lib/utils"
import type { CoveragePassage, CoverageReport, DocumentCoverage } from "@/rulebook/coverage"
import { coverageKindLabels, coverageKindStyles } from "../coverageKinds"
import { PassageCoverage } from "../PassageCoverage/PassageCoverage"
import { countOf } from "../rulebookRecords"
import { useRulebookWorkspace } from "../useRulebookWorkspace"
import {
  fileOf,
  gapsOf,
  highlightsOf,
  pageOfPassage,
  passageLabel,
  passageName,
  passagesOnPage
} from "./CoverageReader.utils"

export type CoverageReaderProps = {
  report: CoverageReport
  /** The document read, one the build linked to its upload's pages. */
  document: DocumentCoverage
}

// Wide enough for the page beside a persistent panel; narrower screens show the panel in a sheet.
const wideScreen = "(min-width: 80rem)"

/**
 * A document's coverage on its own pages (encoding.md, UX, Coverage): every passage highlighted by what covers it.
 * Choosing a passage, on the page or from the list beside it, shows what covers or cites it in a panel (a sheet on
 * narrow screens); the gaps are listed to jump to.
 */
export function CoverageReader({ report, document }: CoverageReaderProps) {
  const { source } = useRulebookWorkspace()
  const isWide = useMediaQuery(wideScreen) === true
  const fileId = fileOf(document)
  const gaps = gapsOf(document)
  const startPage = (() => {
    const [firstGap] = gaps
    const firstPassage = document.articles[0]?.passages[0]
    const from = firstGap ?? firstPassage
    return from && fileId ? (pageOfPassage(from, fileId) ?? 1) : 1
  })()
  const [page, setPage] = useState(startPage)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [focusRequest, setFocusRequest] = useState(0)
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (focusRequest > 0) {
      headingRef.current?.focus()
    }
  }, [focusRequest])

  const file = source.documents.find((item) => item.id === fileId)
  if (!fileId || !file) {
    return (
      <p className="rounded-lg border py-10 text-center text-sm text-muted-foreground">
        This document&rsquo;s pages aren&rsquo;t available, so its coverage can&rsquo;t be shown on them.
      </p>
    )
  }
  const passages = document.articles.flatMap((article) => article.passages)
  const selected = passages.find((passage) => passage.key === selectedKey)
  const onPage = passagesOnPage(document, fileId, page)

  const select = (passage: CoveragePassage, isFromList: boolean) => {
    setSelectedKey(passage.key)
    const at = pageOfPassage(passage, fileId)
    if (at !== null && at !== page) {
      setPage(at)
    }
    if (!isWide) {
      setIsSheetOpen(true)
    } else if (isFromList) {
      setFocusRequest((count) => count + 1)
    }
  }

  const panel = selected ? (
    <div className="flex flex-col gap-4">
      <PassageCoverage
        passage={selected}
        referencedBy={selected.type === "provision" ? (report.referencedBy.get(selected.provision.key) ?? []) : []}
        headingRef={headingRef}
      />
      {isWide ? (
        <Button size="sm" variant="ghost" className="w-fit" onClick={() => setSelectedKey(null)}>
          Back to the page&rsquo;s passages
        </Button>
      ) : null}
    </div>
  ) : null

  return (
    <div className={cn("grid gap-4", isWide && "grid-cols-[minmax(0,1fr)_22rem]")}>
      <DocumentViewer
        className="h-[75vh] min-h-96"
        source={source}
        documentId={fileId}
        page={page}
        onPageChange={(next) => {
          setPage(next)
          setSelectedKey(null)
        }}
        highlights={highlightsOf(document, fileId)}
        selectedId={selectedKey}
        onSelect={(key) => {
          const passage = passages.find((item) => item.key === key)
          if (passage) {
            select(passage, false)
          }
        }}
      />
      <aside
        aria-label="Passages and what covers them"
        className={cn(
          "flex flex-col gap-5 text-sm",
          isWide && "sticky top-4 max-h-[75vh] self-start overflow-y-auto rounded-lg border bg-card p-4"
        )}
      >
        {isWide && panel ? (
          panel
        ) : (
          <>
            <PassageList
              title={`On page ${page}`}
              empty="No provision is on this page."
              passages={onPage}
              selectedKey={selectedKey}
              onChoose={(passage) => select(passage, true)}
            />
            <PassageList
              title={gaps.length === 0 ? "No gaps" : countOf(gaps.length, "gap", "gaps")}
              empty="Every passage is covered or has a reason for having no rule."
              passages={gaps}
              selectedKey={selectedKey}
              onChoose={(passage) => select(passage, true)}
              isPaged
            />
          </>
        )}
      </aside>
      {isWide ? null : (
        <Sheet open={isSheetOpen && selected !== undefined} onOpenChange={setIsSheetOpen}>
          <SheetContent className="w-full gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md">
            <SheetHeader>
              <SheetTitle>What covers it</SheetTitle>
              <SheetDescription className="sr-only">
                The rules, terms and reasons that cover the passage
              </SheetDescription>
            </SheetHeader>
            <div className="px-4 pb-6">{panel}</div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}

const listPageSize = 12

function PassageList({
  title,
  empty,
  passages,
  selectedKey,
  onChoose,
  isPaged = false
}: {
  title: string
  empty: string
  passages: CoveragePassage[]
  selectedKey: string | null
  onChoose: (passage: CoveragePassage) => void
  isPaged?: boolean
}) {
  const [count, setCount] = useState(listPageSize)
  const shown = isPaged ? passages.slice(0, count) : passages
  const id = `coverage-list-${title.toLowerCase().replaceAll(/\W+/g, "-")}`
  return (
    <section aria-labelledby={id} className="flex flex-col gap-1.5">
      <h3 id={id} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      {passages.length === 0 ? (
        <p className="text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col">
          {shown.map((passage) => {
            const style = coverageKindStyles[passage.kind]
            const Icon = style.icon
            return (
              <li key={passage.key}>
                <button
                  type="button"
                  aria-label={passageName(passage)}
                  aria-pressed={passage.key === selectedKey}
                  className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-pressed:bg-muted"
                  onClick={() => onChoose(passage)}
                >
                  <Icon className={cn("mt-0.5 size-3.5 shrink-0", style.iconColor)} aria-hidden />
                  <span className="flex min-w-0 flex-col">
                    <span>
                      <span className="font-medium">{passageLabel(passage)}</span>{" "}
                      <span className="text-muted-foreground">{coverageKindLabels[passage.kind]}</span>
                    </span>
                    <span className="line-clamp-1 text-xs text-muted-foreground">{passage.text}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {isPaged && passages.length > count ? (
        <Button size="sm" variant="ghost" className="w-fit" onClick={() => setCount((value) => value + listPageSize)}>
          Show {Math.min(listPageSize, passages.length - count)} more
        </Button>
      ) : null}
    </section>
  )
}
