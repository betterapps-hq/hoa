import { useQuery } from "@tanstack/react-query"
import { useRef } from "react"
import type { BuildResult, BuildResultsPage } from "@/rulebook/buildResults"
import type { BuildDocument } from "@/rulebook/buildResults.server"

/**
 * What the reader shows of a running build (encoding.md, UX, Counts as they arrive): its results, polled every 4
 * seconds for what's new since the last poll, and the documents it reads, asked for until the build has structured
 * them and then kept, as they don't change.
 */
export function useBuildReading(
  jobId: string,
  loadResults: (since: string | null) => Promise<BuildResultsPage>,
  loadDocuments: () => Promise<BuildDocument[]>
) {
  const store = useRef<{ cursor: string | null; results: Map<string, BuildResult> }>({
    cursor: null,
    results: new Map()
  })
  const { data: results } = useQuery({
    queryKey: ["build-results", jobId],
    queryFn: async () => {
      const page = await loadResults(store.current.cursor)
      for (const result of page.results) {
        store.current.results.set(result.id, result)
      }
      store.current.cursor = page.cursor
      return [...store.current.results.values()]
    },
    refetchInterval: 4000
  })
  const { data: documents } = useQuery({
    queryKey: ["build-documents", jobId],
    queryFn: loadDocuments,
    refetchInterval: (query) => ((query.state.data?.length ?? 0) > 0 ? false : 4000),
    staleTime: Infinity
  })
  return { results: results ?? [], documents: documents ?? [] }
}
