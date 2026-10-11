import { useQuery } from "@tanstack/react-query"
import { useRef } from "react"
import type { BuildResult } from "@/rulebook/buildResults"
import type { BuildResults } from "@/rulebook/buildResults.server"

/**
 * What the running build has produced so far, polled every 4 seconds for what's new since the last poll: the step list
 * counts from it.
 */
export function useBuildResults(
  jobId: string,
  loadResults: (since: string | null) => Promise<BuildResults>,
  isRunning: boolean
) {
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
      return [...store.current.results.values()]
    },
    refetchInterval: isRunning ? 4000 : false
  })
  return data ?? []
}
