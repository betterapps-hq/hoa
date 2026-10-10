import { useQuery } from "@tanstack/react-query"
import { useId, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { ReaderLink } from "@/features/documents/ReaderLink/ReaderLink"
import { CitationsOpenInSheet } from "@/features/documents/ReaderSheet/ReaderSheet"
import type { BuildResult } from "@/rulebook/buildResults"
import type { BuildDocument, BuildResults } from "@/rulebook/buildResults.server"
import { citationLabel } from "../rulebookRecords"
import { newestFirst, provisionHref, resultSentence } from "./BuildFeed.utils"

export type BuildFeedProps = {
  jobId: string
  /** The build's results since a cursor (`getBuildResults`). */
  loadResults: (since: string | null) => Promise<BuildResults>
  /** Polls while the build runs. */
  isRunning: boolean
}

/** How many results show before "Show all". */
const latestCount = 4
/** The most term labels or rules one result lists. */
const listedCount = 8

/**
 * What the running build has produced so far, newest first (encoding.md, UX, Results as they arrive): terms found,
 * rules drafted per section, problems found and fixed, conflicts. Read-only: the review happens in the draft. Polls
 * every 4 seconds for what's new since the last poll.
 */
export function BuildFeed({ jobId, loadResults, isRunning }: BuildFeedProps) {
  const [isShowingAll, setIsShowingAll] = useState(false)
  const headingId = useId()
  const store = useRef<{ cursor: string | null; results: Map<string, BuildResult> }>({
    cursor: null,
    results: new Map()
  })
  const { data } = useQuery({
    queryKey: ["build-results", jobId],
    queryFn: async () => {
      const page = await loadResults(store.current.cursor)
      for (const result of page.results) {
        store.current.results.set(result.id, result)
      }
      store.current.cursor = page.cursor
      return { results: newestFirst(store.current.results.values()), documents: page.documents }
    },
    refetchInterval: isRunning ? 4000 : false
  })
  const results = data?.results ?? []
  if (results.length === 0) {
    return null
  }
  const shown = isShowingAll ? results : results.slice(0, latestCount)
  return (
    <CitationsOpenInSheet>
      <section className="flex flex-col gap-2">
        <h3 id={headingId} className="text-sm font-medium">
          Found so far
        </h3>
        <ul aria-labelledby={headingId} aria-live="polite" className="flex flex-col gap-3">
          {shown.map((result) => (
            <li key={result.id} className="flex flex-col gap-1 text-sm motion-safe:animate-in motion-safe:fade-in-0">
              <span>{resultSentence(result, data?.documents ?? [])}</span>
              <ResultDetail result={result} documents={data?.documents ?? []} />
            </li>
          ))}
        </ul>
        {results.length > latestCount ? (
          <Button variant="ghost" size="sm" className="w-fit" onClick={() => setIsShowingAll(!isShowingAll)}>
            {isShowingAll ? "Show the latest" : `Show all ${results.length}`}
          </Button>
        ) : null}
      </section>
    </CitationsOpenInSheet>
  )
}

function ResultDetail({ result, documents }: { result: BuildResult; documents: readonly BuildDocument[] }) {
  if (result.kind === "terms" && result.labels.length > 0) {
    const more = result.labels.length - listedCount
    return (
      <span className="text-muted-foreground">
        {result.labels.slice(0, listedCount).join(", ")}
        {more > 0 ? `, and ${more} more` : ""}
      </span>
    )
  }
  if (result.kind === "rules" && result.rules.length > 0) {
    const more = result.rules.length - listedCount
    return (
      <ul className="flex flex-col gap-0.5 text-muted-foreground">
        {result.rules.slice(0, listedCount).map((rule) => {
          const href = rule.provisionKey ? provisionHref(rule.provisionKey, documents) : null
          return (
            <li key={rule.key} className="flex flex-wrap gap-x-1.5">
              <span className="text-foreground">{rule.title}</span>
              {rule.provisionKey && href ? (
                <ReaderLink href={href} className="text-link underline decoration-dotted underline-offset-4">
                  {citationLabel(rule.provisionKey)}
                </ReaderLink>
              ) : null}
            </li>
          )
        })}
        {more > 0 ? <li>and {more} more</li> : null}
      </ul>
    )
  }
  return null
}
