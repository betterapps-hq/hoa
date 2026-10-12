import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { useId } from "react"
import { Button } from "@/components/ui/button"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"

export type ListPagerProps = {
  total: number
  /** The first page is 0. */
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  /** What the list holds, in the plural, for the accessible names: "rules". */
  noun: string
  /** The page sizes a person can choose from; without them the size is fixed. */
  pageSizes?: readonly number[]
  /** A new page size, with the page that keeps the first row shown in view. */
  onPageSizeChange?: (pageSize: number, page: number) => void
}

/**
 * The page of a long list: "51 to 100 of 307", the previous and next pages and, where the list lets a person choose,
 * how many rows a page shows. Shows nothing when every row fits on a page of the smallest size.
 */
export function ListPager({ total, page, pageSize, onPageChange, noun, pageSizes, onPageSizeChange }: ListPagerProps) {
  const sizeId = useId()
  const canResize = pageSizes !== undefined && pageSizes.length > 1 && onPageSizeChange !== undefined
  if (total <= (canResize ? Math.min(...pageSizes) : pageSize)) {
    return null
  }
  const last = Math.ceil(total / pageSize) - 1
  const first = page * pageSize + 1
  return (
    <nav
      aria-label={`Pages of ${noun}`}
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm"
    >
      <span className="text-muted-foreground" aria-live="polite">
        {first} to {Math.min(total, first + pageSize - 1)} of {total}
      </span>
      <span className="flex items-center gap-4">
        {canResize ? (
          <span className="flex items-center gap-2">
            <label htmlFor={sizeId} className="whitespace-nowrap text-muted-foreground">
              Rows per page
            </label>
            <NativeSelect
              id={sizeId}
              size="sm"
              value={String(pageSize)}
              onChange={(event) => {
                const next = Number(event.target.value)
                onPageSizeChange(next, Math.floor((page * pageSize) / next))
              }}
            >
              {pageSizes.map((size) => (
                <NativeSelectOption key={size} value={size}>
                  {size}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </span>
        ) : null}
        {last > 0 ? (
          <span className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={page <= 0}
              aria-label={`Previous ${pageSize} ${noun}`}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeftIcon />
              <span className="hidden sm:inline">Previous</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={page >= last}
              aria-label={`Next ${pageSize} ${noun}`}
              onClick={() => onPageChange(page + 1)}
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRightIcon />
            </Button>
          </span>
        ) : null}
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
