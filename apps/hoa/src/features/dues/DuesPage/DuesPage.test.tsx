import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { ScheduleView } from "../dues.functions"
import { DuesPage, type DuesActions } from "./DuesPage"

vi.mock("sonner", () => ({
  toast: { error: vi.fn<(message: string) => void>(), success: vi.fn<(message: string) => void>() }
}))

vi.mock("@tanstack/react-router", () => ({ useRouter: () => undefined }))

const units = [
  { id: "unit-12", label: "12 Lakeview Drive" },
  { id: "unit-31", label: "31 Fir Court" }
]

const monthly: ScheduleView = {
  id: "dues",
  organizationId: "hoa",
  name: "Monthly dues",
  category: "dues",
  frequency: "monthly",
  amountCents: 35_000,
  unitAmounts: null,
  firstDueOn: "2026-11-01",
  lastDueOn: null,
  postsFrom: "2026-10-14",
  status: "active",
  createdBy: "user-sam",
  createdAt: "2026-10-14T17:00:00.000Z",
  updatedAt: "2026-10-14T17:00:00.000Z",
  nextDueOn: "2026-11-01",
  totalCents: 70_000,
  ownAmounts: 0,
  collection: { dueOn: "2026-11-01", chargedCents: 70_000, paidCents: 35_000, units: 2, paidUnits: 1 }
}

function setup(schedules: ScheduleView[]) {
  const actions: DuesActions = {
    create: vi.fn<DuesActions["create"]>().mockResolvedValue({ posted: 2 }),
    end: vi.fn<DuesActions["end"]>().mockResolvedValue(undefined)
  }
  render(
    <DuesPage
      today="2026-10-14"
      schedules={schedules}
      units={units}
      actions={actions}
      onChanged={vi.fn<() => void>()}
    />
  )
  return { actions, user: userEvent.setup() }
}

describe("DuesPage", () => {
  it("invites setting up dues when there are none", () => {
    setup([])
    expect(screen.getByText("No dues set up")).toBeInTheDocument()
  })

  it("shows each schedule's amount, next due day and how its latest is being paid", () => {
    setup([monthly])
    expect(screen.getByText("Monthly dues")).toBeInTheDocument()
    expect(screen.getByText(/\$350\.00 a unit\. Every month\. From Nov 1, 2026\./)).toBeInTheDocument()
    expect(screen.getByText("$350.00 of $700.00 paid")).toBeInTheDocument()
    expect(screen.getByText("1 of 2 units paid.")).toBeInTheDocument()
    expect(screen.getByText("$8,400.00")).toBeInTheDocument()
  })

  it("sets up dues in cents, with the units that owe their own amount", async () => {
    const { actions, user } = setup([])
    await user.click(
      within(screen.getByRole("group", { name: "Page actions" })).getByRole("button", { name: "Set up dues" })
    )
    const dialog = screen.getByRole("dialog", { name: "Set up dues" })
    await user.type(within(dialog).getByLabelText(/Name/), "Monthly dues")
    await user.type(within(dialog).getByLabelText(/Amount for each unit/), "350")
    await user.type(within(dialog).getByLabelText(/First due on/), "2026-11-01")
    await user.click(within(dialog).getByRole("checkbox", { name: "Some units owe a different amount" }))
    await user.type(within(dialog).getByLabelText("31 Fir Court"), "420")
    expect(
      within(dialog).getByText(/Each unit is charged \$350\.00, or its own amount, every month/)
    ).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "Set it up" }))
    expect(actions.create).toHaveBeenCalledWith({
      name: "Monthly dues",
      category: "dues",
      frequency: "monthly",
      amountCents: 35_000,
      unitAmounts: { "unit-31": 42_000 },
      firstDueOn: "2026-11-01",
      lastDueOn: null
    })
  })

  it("ends a schedule once confirmed", async () => {
    const { actions, user } = setup([monthly])
    await user.click(screen.getByRole("button", { name: "Actions for Monthly dues" }))
    await user.click(await screen.findByRole("menuitem", { name: "End" }))
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "End it" }))
    expect(actions.end).toHaveBeenCalledWith("dues")
  })
})
