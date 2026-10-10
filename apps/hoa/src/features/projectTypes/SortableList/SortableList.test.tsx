import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SortableList } from "./SortableList"

const items = ["Size", "Color", "Finish"]

// The test DOM has no layout: each item gets a 40-pixel row, stacked, so the keyboard sensor has places to move to.
function rowRect(element: Element) {
  const row = element.closest("li")
  const index = row?.parentElement ? [...row.parentElement.children].indexOf(row) : 0
  const top = index * 50
  return { x: 0, y: top, top, left: 0, right: 300, bottom: top + 40, width: 300, height: 40, toJSON: () => ({}) }
}

let restore: () => void = () => undefined
beforeEach(() => {
  const original = Element.prototype.getBoundingClientRect
  Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return rowRect(this) as DOMRect
  }
  restore = () => {
    Element.prototype.getBoundingClientRect = original
  }
})
afterEach(() => restore())

function setup() {
  const onMove = vi.fn<(from: number, to: number) => void>()
  render(
    <SortableList
      items={items}
      getId={(item) => item}
      getName={(item) => item}
      label="Questions"
      onMove={onMove}
      renderItem={(item, { handle }) => (
        <div>
          {handle}
          {item}
        </div>
      )}
    />
  )
  return { onMove, user: userEvent.setup() }
}

describe("SortableList", () => {
  it("gives each item a handle that says how to move it", () => {
    setup()
    const handle = screen.getByRole("button", { name: "Move “Size”" })
    expect(handle).toHaveAttribute("aria-roledescription", "sortable")
    expect(handle).toHaveAccessibleDescription(/press Space or Enter, choose a place with the arrow keys/)
  })

  it("moves an item with the keyboard and says where it went", async () => {
    const { onMove, user } = setup()
    screen.getByRole("button", { name: "Move “Size”" }).focus()
    await user.keyboard(" ")
    await user.keyboard("{ArrowDown}")
    await user.keyboard(" ")
    await waitFor(() => expect(onMove).toHaveBeenCalledWith(0, 1))
    expect(await screen.findByText("Moved “Size” to position 2 of 3.")).toBeInTheDocument()
  })

  it("leaves the order as it was when a move is cancelled", async () => {
    const { onMove, user } = setup()
    screen.getByRole("button", { name: "Move “Color”" }).focus()
    await user.keyboard(" ")
    await user.keyboard("{Escape}")
    expect(await screen.findByText("Stopped moving “Color”. It stays at position 2 of 3.")).toBeInTheDocument()
    expect(onMove).not.toHaveBeenCalled()
  })
})
