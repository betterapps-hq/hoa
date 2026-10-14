import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { LedgerLine, UnitLedgerView } from "../ledger.functions"
import { UnitLedgerPage, type LedgerActions } from "./UnitLedgerPage"

vi.mock("sonner", () => ({
  toast: { error: vi.fn<(message: string) => void>(), success: vi.fn<(message: string) => void>() }
}))

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => undefined,
  Link: ({ children }: { children?: React.ReactNode }) => <a href="/violations">{children}</a>
}))

const fine: LedgerLine = {
  id: "fine",
  kind: "charge",
  postedOn: "2026-10-14",
  dueOn: "2026-10-14",
  label: "Fine",
  description: "Fines: Boat in the driveway",
  amountCents: 7500,
  balanceCents: 7500,
  openCents: 2500,
  isReversed: false,
  violationId: "violation-1",
  canReverse: true
}

const payment: LedgerLine = {
  id: "payment",
  kind: "payment",
  postedOn: "2026-10-15",
  dueOn: null,
  label: "Payment, check",
  description: "Check 1042",
  amountCents: -5000,
  balanceCents: 2500,
  openCents: null,
  isReversed: false,
  violationId: null,
  canReverse: true
}

const view: UnitLedgerView = {
  unit: { id: "unit-31", label: "31 Fir Court", address: "31 Fir Court, Bellingham, WA 98229" },
  owners: ["Casey Morgan"],
  balanceCents: 2500,
  lines: [payment, fine],
  today: "2026-10-15",
  canManage: true
}

function setup(overrides: Partial<UnitLedgerView> = {}) {
  const actions: LedgerActions = {
    recordPayment: vi.fn<LedgerActions["recordPayment"]>().mockResolvedValue(undefined),
    addCharge: vi.fn<LedgerActions["addCharge"]>().mockResolvedValue(undefined),
    giveCredit: vi.fn<LedgerActions["giveCredit"]>().mockResolvedValue(undefined),
    reverse: vi.fn<LedgerActions["reverse"]>().mockResolvedValue(undefined)
  }
  render(
    <UnitLedgerPage
      view={{ ...view, ...overrides }}
      actions={actions}
      onChanged={vi.fn<() => void>()}
      onBack={vi.fn<() => void>()}
    />
  )
  return { actions, user: userEvent.setup() }
}

describe("UnitLedgerPage", () => {
  it("shows the balance, what's unpaid on each charge, and where a fine came from", () => {
    setup()
    expect(screen.getByText("$25.00 unpaid")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "the violation" })).toBeInTheDocument()
  })

  it("records a payment by check, in cents", async () => {
    const { actions, user } = setup()
    await user.click(
      within(screen.getByRole("group", { name: "Page actions" })).getByRole("button", { name: "Record a payment" })
    )
    const dialog = screen.getByRole("dialog", { name: "Record a payment" })
    await user.type(within(dialog).getByLabelText(/Amount/), "25.50")
    await user.type(within(dialog).getByLabelText("Check number"), "1043")
    await user.click(within(dialog).getByRole("button", { name: "Record it" }))
    expect(actions.recordPayment).toHaveBeenCalledWith({
      amountCents: 2550,
      method: "check",
      reference: "1043",
      postedOn: "2026-10-15"
    })
  })

  it("lets an owner read it, without changing it", () => {
    setup({
      canManage: false,
      lines: [
        { ...payment, canReverse: false },
        { ...fine, canReverse: false }
      ]
    })
    expect(screen.queryByRole("group", { name: "Page actions" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Actions for/ })).not.toBeInTheDocument()
  })

  it("says a waived charge was waived", () => {
    setup({ lines: [{ ...fine, openCents: 0, isReversed: true, canReverse: false }] })
    expect(screen.getByText("Waived")).toBeInTheDocument()
  })
})
