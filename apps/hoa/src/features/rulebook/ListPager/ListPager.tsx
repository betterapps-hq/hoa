import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

export type ListPagerProps = {
  total: number
  /** The first page is 0. */
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  /** What the list holds, in the plural, for the accessible names: "rules". */
  noun: string
}

/** The page of a long list: "51 to 100 of 307", with the previous and next pages. Shows nothing for one page. */
export function ListPager({ total, page, pageSize, onPageChange, noun }: ListPagerProps) {
  if (total <= pageSize) {
    return null
  }
  const last = Math.ceil(total / pageSize) - 1
  const first = page * pageSize + 1
  return (
    <nav aria-label={`Pages of ${noun}`} className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground" aria-live="polite">
        {first} to {Math.min(total, first + pageSize - 1)} of {total}
      </span>
      <span className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          disabled={page <= 0}
          aria-label={`Previous ${pageSize} ${noun}`}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeftIcon />
          Previous
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={page >= last}
          aria-label={`Next ${pageSize} ${noun}`}
          onClick={() => onPageChange(page + 1)}
        >
          Next
          <ChevronRightIcon />
        </Button>
      </span>
    </nav>
  )
}

/** A page that still exists once the list shrinks, such as when approving empties the last page of a filter. */
export const clampPage = (total: number, page: number, pageSize: number) =>
  Math.max(0, Math.min(page, Math.ceil(total / pageSize) - 1))

/** The items on a page of a list. */
export const pageOf = <T,>(items: readonly T[], page: number, pageSize: number) =>
  items.slice(page * pageSize, (page + 1) * pageSize)
