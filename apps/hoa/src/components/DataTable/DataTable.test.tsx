import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createSearch } from "@/lib/search"
import { DataTable, type DataTableProps } from "./DataTable"
import { dataTableColumns } from "./DataTable.utils"

type Plant = { id: string; name: string; height: number; kind: string }

const kinds = ["shrub", "tree", "grass"]
const plants: Plant[] = Array.from({ length: 30 }, (_, index) => ({
  id: `plant-${index + 1}`,
  name: `Plant ${String(index + 1).padStart(2, "0")}`,
  height: (index * 7) % 30,
  kind: kinds[index % 3]!
}))
const named = (id: string, name: string): Plant => ({ ...plants.find((plant) => plant.id === id)!, name })
// A few with words to find: "blue" matches best where it's the whole name.
const searchable = plants.map(
  (plant) =>
    ({
      "plant-3": named("plant-3", "Blue oat grass"),
      "plant-9": named("plant-9", "Blue"),
      "plant-20": named("plant-20", "Bluebeard shrub")
    })[plant.id] ?? plant
)
const search = createSearch(searchable, { id: (plant) => plant.id, fields: { name: { text: (plant) => plant.name } } })

const column = dataTableColumns<Plant>()
const columns = column.columns([
  column.accessor("name", { header: "Name", meta: { isRowHeader: true } }),
  column.accessor("height", { header: "Height" }),
  column.accessor("kind", { header: "Kind", enableSorting: false, enableHiding: true, meta: { label: "Kind" } })
])

function setup(props: Partial<DataTableProps<Plant>> = {}) {
  const base: DataTableProps<Plant> = {
    data: plants,
    columns,
    getRowId: (plant) => plant.id,
    label: "Plants",
    noun: "plants",
    empty: "No plants match."
  }
  const view = render(<DataTable {...base} {...props} />)
  return {
    user: userEvent.setup(),
    rerender: (next: Partial<DataTableProps<Plant>>) => view.rerender(<DataTable {...base} {...props} {...next} />)
  }
}

/** The names in the body's rows, in order. */
const namesShown = () =>
  within(screen.getByRole("table", { name: "Plants" }))
    .getAllByRole("rowheader")
    .map((cell) => cell.textContent)

const header = (name: string) => screen.getByRole("columnheader", { name })

describe("DataTable", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it("shows a page of 25 rows in the data's order, with the next pages", async () => {
    const { user } = setup()
    expect(namesShown()).toHaveLength(25)
    expect(namesShown()[0]).toBe("Plant 01")
    expect(screen.getByText("1 to 25 of 30")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Next 25 plants" }))
    expect(namesShown()).toEqual(["Plant 26", "Plant 27", "Plant 28", "Plant 29", "Plant 30"])
    await user.click(screen.getByRole("button", { name: "Previous 25 plants" }))
    expect(namesShown()[0]).toBe("Plant 01")
  })

  it("shows every row without a page size", () => {
    setup({ pageSize: null })
    expect(namesShown()).toHaveLength(30)
    expect(screen.queryByRole("navigation", { name: "Pages of plants" })).not.toBeInTheDocument()
  })

  it("sorts by a column from its header, one way, the other and back to the data's order", async () => {
    const { user } = setup({ pageSize: null })
    expect(header("Kind")).not.toHaveAttribute("aria-sort")
    expect(within(header("Kind")).queryByRole("button")).not.toBeInTheDocument()
    const height = within(header("Height")).getByRole("button", { name: "Height" })

    await user.click(height)
    expect(header("Height")).toHaveAttribute("aria-sort", "descending")
    await user.click(height)
    expect(header("Height")).toHaveAttribute("aria-sort", "ascending")
    const ascending = screen.getAllByRole("cell").filter((_, index) => index % 2 === 0)
    expect(ascending.map((cell) => Number(cell.textContent))).toEqual([...Array(30).keys()])
    await user.click(height)
    expect(header("Height")).toHaveAttribute("aria-sort", "none")
    expect(namesShown()[0]).toBe("Plant 01")

    await user.click(within(header("Name")).getByRole("button", { name: "Name" }))
    expect(header("Name")).toHaveAttribute("aria-sort", "ascending")
    expect(header("Height")).toHaveAttribute("aria-sort", "none")
  })

  it("goes back to the first page when the sort changes", async () => {
    const { user } = setup()
    await user.click(screen.getByRole("button", { name: "Next 25 plants" }))
    await user.click(within(header("Name")).getByRole("button", { name: "Name" }))
    expect(screen.getByText("1 to 25 of 30")).toBeInTheDocument()
  })

  it("filters by the search, best match first, until a column is sorted", async () => {
    const { user, rerender } = setup({
      data: searchable,
      initialSorting: [{ id: "name", desc: true }],
      search: { query: "", ids: search.ids }
    })
    expect(namesShown()[0]).toBe("Plant 30")

    rerender({ search: { query: "blue", ids: search.ids } })
    expect(namesShown()).toEqual(["Blue", "Blue oat grass", "Bluebeard shrub"])
    expect(header("Name")).toHaveAttribute("aria-sort", "none")

    await user.click(within(header("Name")).getByRole("button", { name: "Name" }))
    expect(namesShown()).toEqual(["Blue", "Blue oat grass", "Bluebeard shrub"])
    await user.click(within(header("Name")).getByRole("button", { name: "Name" }))
    expect(namesShown()).toEqual(["Bluebeard shrub", "Blue oat grass", "Blue"])
    rerender({ search: { query: "blue s", ids: search.ids } })
    expect(namesShown()).toEqual(["Bluebeard shrub"])

    // Clearing the words brings back the table's own sort, and new words their relevance order.
    rerender({ search: { query: "", ids: search.ids } })
    expect(namesShown()[0]).toBe("Plant 30")
    expect(header("Name")).toHaveAttribute("aria-sort", "descending")
    rerender({ search: { query: "blue", ids: search.ids } })
    expect(namesShown()).toEqual(["Blue", "Blue oat grass", "Bluebeard shrub"])
  })

  it("tells the summary which rows match, and says so when none do", () => {
    const { rerender } = setup({
      data: searchable,
      search: { query: "blue", ids: search.ids },
      renderSummary: (rows) => <p>{rows.length} plants match</p>
    })
    expect(screen.getByText("3 plants match")).toBeInTheDocument()
    rerender({ search: { query: "cactus", ids: search.ids } })
    expect(screen.getByText("No plants match.")).toBeInTheDocument()
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
    expect(screen.getByText("0 plants match")).toBeInTheDocument()
  })

  it("returns to the first page when the words or the caller's filters change, and keeps a page that still exists", async () => {
    const { user, rerender } = setup({ filterKey: "all" })
    await user.click(screen.getByRole("button", { name: "Next 25 plants" }))
    rerender({ filterKey: "all", data: plants.slice(0, 28) })
    expect(screen.getByText("26 to 28 of 28")).toBeInTheDocument()
    rerender({ filterKey: "all", data: plants.slice(0, 20) })
    expect(namesShown()).toHaveLength(20)
    rerender({ filterKey: "all", data: plants })
    expect(screen.getByText("1 to 25 of 30")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Next 25 plants" }))
    rerender({ filterKey: "trees", data: plants })
    expect(screen.getByText("1 to 25 of 30")).toBeInTheDocument()
  })

  it("hides and shows the columns that can be hidden", async () => {
    const { user } = setup({ initialColumnVisibility: { kind: false } })
    expect(screen.queryByRole("columnheader", { name: "Kind" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Columns" }))
    expect(screen.getAllByRole("menuitemcheckbox").map((item) => item.textContent)).toEqual(["Kind"])
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Kind" }))
    expect(screen.getByRole("columnheader", { name: "Kind" })).toBeInTheDocument()
  })

  it("heads each run of rows in a group, and shows a row's detail under it", () => {
    setup({
      data: plants.slice(0, 4).toSorted((a, b) => a.kind.localeCompare(b.kind)),
      groupOf: (plant) => ({ key: plant.kind, title: `${plant.kind} plants` }),
      renderDetail: (plant) => (plant.id === "plant-2" ? <p>Planted last spring</p> : null)
    })
    const rows = within(screen.getByRole("table", { name: "Plants" }))
      .getAllByRole("row")
      .slice(1)
    expect(rows.map((row) => row.textContent)).toEqual([
      "grass plants",
      "Plant 0314grass",
      "shrub plants",
      "Plant 010shrub",
      "Plant 0421shrub",
      "tree plants",
      "Plant 027tree",
      "Planted last spring"
    ])
    expect(screen.getByRole("rowheader", { name: "tree plants" })).toBeInTheDocument()
  })

  it("lets the viewer choose the rows per page, keeping the first row shown in view, and remembers it", async () => {
    const { user } = setup()
    await user.click(screen.getByRole("button", { name: "Next 25 plants" }))
    const size = screen.getByRole("combobox", { name: "Rows per page" })
    expect(size).toHaveValue("25")
    expect(
      within(size)
        .getAllByRole("option")
        .map((option) => option.textContent)
    ).toEqual(["10", "25", "50", "100"])
    await user.selectOptions(size, "10")
    expect(screen.getByText("21 to 30 of 30")).toBeInTheDocument()
    expect(namesShown()).toContain("Plant 26")
    await user.selectOptions(screen.getByRole("combobox", { name: "Rows per page" }), "50")
    expect(namesShown()).toHaveLength(30)
    expect(screen.queryByRole("button", { name: /^Next/ })).not.toBeInTheDocument()

    // Another table with the same name opens with the choice; one with another name doesn't.
    render(
      <DataTable data={plants} columns={columns} getRowId={(plant) => plant.id} label="Plants" noun="plants" empty="" />
    )
    expect(screen.getAllByRole("combobox", { name: "Rows per page" }).at(-1)).toHaveValue("50")
    render(
      <DataTable data={plants} columns={columns} getRowId={(plant) => plant.id} label="Trees" noun="trees" empty="" />
    )
    expect(screen.getAllByRole("combobox", { name: "Rows per page" }).at(-1)).toHaveValue("25")
  })

  it("hides the pager when every row fits on the smallest page", () => {
    setup({ data: plants.slice(0, 10) })
    expect(screen.queryByRole("navigation", { name: "Pages of plants" })).not.toBeInTheDocument()
  })

  it("still pages when the browser keeps no storage", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage is blocked.")
    })
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage is blocked.")
    })
    const { user } = setup()
    await user.selectOptions(screen.getByRole("combobox", { name: "Rows per page" }), "10")
    expect(screen.getByText("1 to 10 of 30")).toBeInTheDocument()
  })
})
