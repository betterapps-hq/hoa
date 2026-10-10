import {
  functionalUpdate,
  useTable,
  type ColumnVisibilityState,
  type RowData,
  type SortDirection,
  type SortingState
} from "@tanstack/react-table"
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon, Columns3Icon } from "lucide-react"
import { Fragment, useState, type ReactNode } from "react"
import { clampPage, ListPager } from "@/components/ListPager/ListPager"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { usePageSize } from "@/hooks/usePageSize"
import { cn } from "@/lib/utils"
import {
  byRelevance,
  dataTableFeatures,
  defaultPageSize,
  rankOf,
  relevanceColumns,
  relevanceColumnId,
  searchFilter,
  type DataTableColumns
} from "./DataTable.utils"

/** A search over the rows: the words to find, and the ids of the rows matching them, best first (null for no words). */
type DataTableSearch = { query: string; ids: (query: string) => string[] | null }

/** The heading a row sits under. */
type DataTableGroup = { key: string; title: string }

export type DataTableProps<Row extends RowData> = {
  data: readonly Row[]
  /** Written with `dataTableColumns<Row>()`. A column sorts unless `enableSorting: false`, and the column picker offers it when `enableHiding: true`. */
  columns: DataTableColumns<Row>
  getRowId: (row: Row) => string
  /** The table's accessible name: "Rules". */
  label: string
  /** What the rows are, in the plural, for the pages' accessible names: "rules". */
  noun: string
  /** Words to find: the rows that match, best match first until someone sorts a column. */
  search?: DataTableSearch
  /** Rows per page until the viewer picks another (remembered per table label), 25 by default; null shows every row. */
  pageSize?: number | null
  /** The order before anyone sorts; the data's own order without it. */
  initialSorting?: SortingState
  /** Columns that start hidden, by id: `{ kind: false }`. */
  initialColumnVisibility?: ColumnVisibilityState
  /** Changes whenever the caller's own filters change, which returns to the first page. */
  filterKey?: string
  /** Controls before the column picker, such as the search box and filters. */
  toolbar?: ReactNode
  /** A line above the table about the rows that match, in the table's order, such as a count or an action on all of them. */
  renderSummary?: (rows: readonly Row[]) => ReactNode
  /** What the table says when no row matches. */
  empty: ReactNode
  /** The heading a row sits under: a heading row starts each run of rows with the same key. */
  groupOf?: (row: Row) => DataTableGroup
  /** More about a row, shown across the table under it; null for nothing. */
  renderDetail?: (row: Row) => ReactNode
  className?: string
}

const ariaSort = { asc: "ascending", desc: "descending" } as const
const sortIcons = { asc: ArrowUpIcon, desc: ArrowDownIcon }

/** A sortable header's aria-sort. */
const sortOf = (direction: false | SortDirection) => (direction ? ariaSort[direction] : "none")

/**
 * A header's or cell's content: its text, or what its render function returns. The function is called, not mounted
 * as a component as TanStack's FlexRender does, so a column list rebuilt with new closures (a caller's state changed)
 * updates its cells in place instead of remounting them, which would drop focus and close open popovers. Render
 * functions therefore don't call hooks; they return components that do.
 */
function render<Context>(template: string | ((context: Context) => ReactNode) | undefined, context: Context) {
  return typeof template === "function" ? template(context) : (template ?? null)
}

/**
 * The app's data table (shadcn's Data Table pattern on TanStack Table): sortable headers, a page at a time, a column
 * picker for the columns that can be hidden, and an empty state. A search filters it as its global filter: while there
 * are words, the matches stay in relevance order until someone sorts a column; without them the table's sort applies.
 * Narrow screens scroll the table sideways inside its border.
 */
export function DataTable<Row extends RowData>({
  data,
  columns,
  getRowId,
  label,
  noun,
  search,
  pageSize = defaultPageSize,
  initialSorting = [],
  initialColumnVisibility = {},
  filterKey = "",
  toolbar,
  renderSummary,
  empty,
  groupOf,
  renderDetail,
  className
}: DataTableProps<Row>) {
  const [sorting, setSorting] = useState(initialSorting)
  // A sort chosen while searching lasts until the words are cleared; until then the best match comes first.
  const [searchSorting, setSearchSorting] = useState<SortingState | null>(null)
  const [columnVisibility, setColumnVisibility] = useState(initialColumnVisibility)
  const [pageIndex, setPageIndex] = useState(0)
  const [relevance] = useState(relevanceColumns<Row>)
  const query = search?.query ?? ""
  const rank = rankOf(search ? search.ids(query) : null)

  const resetKey = JSON.stringify([query, filterKey])
  const [lastResetKey, setLastResetKey] = useState(resetKey)
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey)
    setPageIndex(0)
    if (rank === undefined) {
      setSearchSorting(null)
    }
  }

  const chosen = usePageSize(`table:${label}`, pageSize ?? defaultPageSize)
  const rowsPerPage = pageSize === null ? Number.MAX_SAFE_INTEGER : chosen.pageSize
  const matchCount = rank ? data.filter((row) => rank.has(getRowId(row))).length : data.length
  // A page that still exists once the rows shrink, such as when approving empties the last page.
  const pagination = { pageIndex: clampPage(matchCount, pageIndex, rowsPerPage), pageSize: rowsPerPage }
  if (pagination.pageIndex !== pageIndex) {
    setPageIndex(pagination.pageIndex)
  }
  const shownSorting = rank ? (searchSorting ?? byRelevance) : sorting

  const table = useTable({
    features: dataTableFeatures,
    data,
    columns: [...columns, ...relevance],
    getRowId: (row) => getRowId(row),
    state: {
      sorting: shownSorting,
      globalFilter: rank,
      columnVisibility: { ...columnVisibility, [relevanceColumnId]: false },
      pagination
    },
    onSortingChange: (updater) => {
      const next = functionalUpdate(updater, shownSorting)
      if (rank) {
        setSearchSorting(next.length > 0 ? next : null)
      } else {
        setSorting(next)
      }
      setPageIndex(0)
    },
    onColumnVisibilityChange: (updater) => setColumnVisibility((current) => functionalUpdate(updater, current)),
    onPaginationChange: (updater) => setPageIndex(functionalUpdate(updater, pagination).pageIndex),
    globalFilterFn: searchFilter,
    getColumnCanGlobalFilter: (column) => column.id === relevanceColumnId,
    autoResetPageIndex: false,
    enableMultiSort: false
  })

  const matches = table.getPrePaginatedRowModel().rows
  const rows = table.getRowModel().rows
  const columnCount = table.getVisibleLeafColumns().length
  const optional = table.getAllLeafColumns().filter((column) => column.columnDef.enableHiding === true)

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {toolbar || optional.length > 0 ? (
        <div className="flex items-center gap-2">
          {toolbar}
          {optional.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" aria-label="Columns" />}>
                <Columns3Icon />
                <span className="hidden sm:inline">Columns</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Show columns</DropdownMenuLabel>
                  {optional.map((column) => (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      checked={column.getIsVisible()}
                      onCheckedChange={(checked) => column.toggleVisibility(checked)}
                    >
                      {column.columnDef.meta?.label ?? column.id}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      ) : null}
      {renderSummary?.(matches.map((row) => row.original))}
      {matches.length === 0 ? (
        <p className="rounded-lg border py-10 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table className="border-separate border-spacing-0 [&_tbody_tr:last-child>*]:border-b-0">
            <caption className="sr-only">{label}</caption>
            <TableHeader>
              {table.getHeaderGroups().map((group) => (
                <TableRow key={group.id} className="hover:bg-transparent">
                  {group.headers.map((header) => {
                    const { meta } = header.column.columnDef
                    const canSort = header.column.getCanSort()
                    const direction = header.column.getIsSorted()
                    const content = render(header.column.columnDef.header, header.getContext())
                    const sortable = canSort ? (
                      <SortButton direction={direction} onToggle={header.column.getToggleSortingHandler()}>
                        {content}
                      </SortButton>
                    ) : (
                      content
                    )
                    return (
                      <TableHead
                        key={header.id}
                        scope="col"
                        colSpan={header.colSpan}
                        aria-sort={canSort ? sortOf(direction) : undefined}
                        className={cn("border-b text-muted-foreground", meta?.headerClassName)}
                      >
                        {header.isPlaceholder ? null : sortable}
                      </TableHead>
                    )
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => {
                const group = groupOf?.(row.original)
                const previous = index > 0 && groupOf ? groupOf(rows[index - 1]!.original) : null
                const detail = renderDetail?.(row.original)
                return (
                  <Fragment key={row.id}>
                    {group && group.key !== previous?.key ? (
                      <TableRow className="hover:bg-transparent">
                        <TableHead
                          scope="rowgroup"
                          colSpan={columnCount}
                          className="border-b bg-muted/50 text-xs font-semibold text-muted-foreground"
                        >
                          {/* The cell spans every column, so its label is what stays in view while the columns scroll. */}
                          <span className="sticky left-2 inline-block">{group.title}</span>
                        </TableHead>
                      </TableRow>
                    ) : null}
                    <TableRow>
                      {row.getVisibleCells().map((cell) => {
                        const { meta } = cell.column.columnDef
                        const content = render(cell.column.columnDef.cell, cell.getContext())
                        const cellClass = cn(
                          "border-b px-3 py-2.5 align-top whitespace-normal",
                          detail ? "border-b-0" : null,
                          meta?.cellClassName
                        )
                        return meta?.isRowHeader ? (
                          <TableHead key={cell.id} scope="row" className={cn("h-auto font-normal", cellClass)}>
                            {content}
                          </TableHead>
                        ) : (
                          <TableCell key={cell.id} className={cellClass}>
                            {content}
                          </TableCell>
                        )
                      })}
                    </TableRow>
                    {detail ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={columnCount} className="border-b px-3 pt-0 pb-3 whitespace-normal">
                          {detail}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <ListPager
        total={matches.length}
        page={pagination.pageIndex}
        pageSize={rowsPerPage}
        pageSizes={pageSize === null ? undefined : chosen.choices}
        onPageSizeChange={(size, page) => {
          chosen.setPageSize(size)
          setPageIndex(page)
        }}
        onPageChange={(page) => table.setPageIndex(page)}
        noun={noun}
      />
    </div>
  )
}

type SortButtonProps = {
  direction: false | SortDirection
  onToggle: ((event: unknown) => void) | undefined
  children: ReactNode
}

/** A sortable column's header: activating it sorts by the column, then the other way, then not by it. */
function SortButton({ direction, onToggle, children }: SortButtonProps) {
  const Icon = direction ? sortIcons[direction] : ChevronsUpDownIcon
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 h-8 px-2 font-medium text-muted-foreground hover:text-foreground data-[sorted]:text-foreground"
      data-sorted={direction || undefined}
      onClick={onToggle}
    >
      {children}
      <Icon aria-hidden className={direction ? undefined : "opacity-50"} />
    </Button>
  )
}
