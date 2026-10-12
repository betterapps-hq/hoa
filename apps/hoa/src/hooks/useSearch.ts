import { useState } from "react"
import { createSearch, type Search, type SearchSetup } from "@/lib/search"

/**
 * A search over items, built once per data set: kept in state with the items it indexes, and rebuilt only when another
 * items array arrives, never on a keystroke. The fields should read only the items and data that changes with them.
 */
export function useSearch<Item>(items: readonly Item[], setup: SearchSetup<Item>): Search<Item> {
  const [built, setBuilt] = useState(() => ({ items, search: createSearch(items, setup) }))
  if (built.items === items) {
    return built.search
  }
  const next = { items, search: createSearch(items, setup) }
  setBuilt(next)
  return next.search
}
