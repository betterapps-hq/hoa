import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  globalFilteringFeature,
  metaHelper,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_text,
  tableFeatures,
  type ColumnHelper,
  type Row,
  type RowData,
  type SortingState
} from "@tanstack/react-table"

// The shared data table's TanStack Table setup (shadcn's Data Table pattern): the features every table registers, the
// column helper its columns are written with, and the search that filters it as its global filter.

/** How a column lays out and names itself. */
type DataTableColumnMeta = {
  /** The column's name in the column picker, where its header isn't plain text. */
  label?: string
  headerClassName?: string
  cellClassName?: string
  /** The column's cell names its row, so it's read as the row's header. */
  isRowHeader?: boolean
}

export const dataTableFeatures = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  rowPaginationFeature,
  columnVisibilityFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic, text: sortFn_text },
  columnMeta: metaHelper<DataTableColumnMeta>()
})

type DataTableFeatures = typeof dataTableFeatures

/** The columns of a data table of these rows, as the column helper's `columns` makes them. */
export type DataTableColumns<Row extends RowData> = ReturnType<ColumnHelper<DataTableFeatures, Row>["columns"]>

/** Writes a data table's columns: `const columns = dataTableColumns<Rule>()`, then `columns.accessor(...)`. */
export const dataTableColumns = <Row extends RowData>() => createColumnHelper<DataTableFeatures, Row>()

/** The page size where a list pages. */
export const defaultPageSize = 25

/** The search's ranking as the table's global filter: each matching row's id and its place, best first. */
type SearchRank = ReadonlyMap<string, number>

export const rankOf = (ids: readonly string[] | null): SearchRank | undefined =>
  ids === null ? undefined : new Map(ids.map((id, place) => [id, place]))

const isRank = (value: unknown): value is SearchRank => value instanceof Map

/** The table's global filter: keeps the rows the search found. */
export function searchFilter<Data extends RowData>(
  row: Row<DataTableFeatures, Data>,
  _columnId: string,
  rank: unknown
) {
  return isRank(rank) && rank.has(row.id)
}

/** The hidden column the search's ranking sorts by; the only one the global filter reads. */
export const relevanceColumnId = "relevance"

function placeOf<Data extends RowData>(row: Row<DataTableFeatures, Data>) {
  const rank: unknown = row.table.atoms.globalFilter.get()
  return (isRank(rank) ? rank.get(row.id) : undefined) ?? Number.MAX_SAFE_INTEGER
}

/** Best match first. */
function relevanceSort<Data extends RowData>(a: Row<DataTableFeatures, Data>, b: Row<DataTableFeatures, Data>) {
  return placeOf(a) - placeOf(b)
}

/** The hidden relevance column for a table of these rows: its value is nothing, and it sorts by the search's ranking. */
export function relevanceColumns<Data extends RowData>() {
  const column = dataTableColumns<Data>()
  return column.columns([
    column.accessor(() => "", { id: relevanceColumnId, enableHiding: false, sortFn: relevanceSort })
  ])
}

/** Sorted by relevance: what the table shows while there are words to find and no column is sorted. */
export const byRelevance: SortingState = [{ id: relevanceColumnId, desc: false }]
