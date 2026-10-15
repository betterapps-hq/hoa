import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { SanctionView, ViolationView } from "../violations.server"
import { ViolationPage, type ViolationActions } from "./ViolationPage"

vi.mock("sonner", () => ({
  toast: { error: vi.fn<(message: string) => void>(), success: vi.fn<(message: string) => void>() }
}))

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => undefined,
  Link: ({ children }: { children?: React.ReactNode }) => <a href="/ledger">{children}</a>
}))

const rule = {
  key: "rules:4#trash",
  title: "Trash containers out of sight",
  statement: "Trash containers must be kept out of sight from the street.",
  reference: { key: "rules:4#trash", title: "Trash containers out of sight", citations: [] }
}

const fine: SanctionView = {
  ruleKey: "declaration:7.4#fine",
  enforced: rule.key,
  outcome: "available",
  reason: "May be imposed.",
  availableOn: null,
  needs: [],
  modality: "permission",
  type: "fine",
  occurrence: 1,
  amount: { type: "fixed", each: 10_000, repeats: null, total: 10_000, cappedBy: null },
  against: ["owner"],
  imposedBy: "board",
  suspends: [],
  lasts: null,
  limitedBy: [],
  rule: {
    key: "declaration:7.4#fine",
    title: "Fines for violations",
    statement: "The board may fine.",
    reference: { key: "declaration:7.4#fine", title: "Fines for violations", citations: [] }
  },
  imposedCents: 0,
  labels: { against: ["owner"], imposedBy: "board", suspends: [] },
  procedure: null
}

const jordan = { personId: "person-jordan", name: "Jordan Avery", party: "owner" as const, email: "jordan@example.com" }

const running = {
  ruleKey: rule.key,
  status: "running" as const,
  reason: "",
  startsOn: "2026-10-14",
  endsOn: "2026-10-28",
  curedOn: null,
  citations: [],
  needs: []
}

const view: ViolationView = {
  violation: {
    id: "violation-1",
    title: "Trash cans at the curb",
    description: "Seen on the walk-through.",
    observedOn: "2026-10-10",
    status: "open"
  },
  association: "Sudden Valley Community Association",
  unit: { id: "unit-12", label: "12 Lakeview Drive", address: "12 Lakeview Drive, Bellingham, WA 98229" },
  people: [jordan],
  rules: [rule],
  photos: [],
  events: [
    {
      id: "event-1",
      kind: "reported",
      occurredOn: "2026-10-10",
      note: null,
      by: "Sam Rivera",
      delivery: null,
      hearing: null,
      curedInTime: null,
      sanction: null,
      fact: null
    }
  ],
  steps: {
    noticeDeliveredOn: null,
    hearingRequestedOn: null,
    hearingHeldOn: null,
    curedOn: null
  },
  today: "2026-10-14",
  cures: [
    {
      ruleKey: rule.key,
      status: "not-started",
      reason: "It starts on the notice delivered on date.",
      startsOn: null,
      endsOn: null,
      curedOn: null,
      citations: [],
      needs: []
    }
  ],
  curesFromNotice: [running],
  sanctions: [{ ...fine, outcome: "pending", reason: "First: …", procedure: { steps: ["notice"] } }],
  facts: [],
  canManage: true,
  canRespond: false
}

function setup(overrides: Partial<ViolationView> = {}) {
  const actions: ViolationActions = {
    sendNotice: vi.fn<ViolationActions["sendNotice"]>().mockResolvedValue(undefined),
    recordStep: vi.fn<ViolationActions["recordStep"]>().mockResolvedValue(undefined),
    impose: vi.fn<ViolationActions["impose"]>().mockResolvedValue(undefined),
    respond: vi.fn<ViolationActions["respond"]>().mockResolvedValue(undefined),
    addPhotos: vi.fn<ViolationActions["addPhotos"]>().mockResolvedValue(undefined),
    stateFact: vi.fn<ViolationActions["stateFact"]>().mockResolvedValue(undefined)
  }
  render(
    <ViolationPage
      view={{ ...view, ...overrides }}
      actions={actions}
      onChanged={vi.fn<() => void>()}
      onBack={vi.fn<() => void>()}
    />
  )
  return { actions, user: userEvent.setup() }
}

const pageActions = () => within(screen.getByRole("group", { name: "Page actions" }))

describe("ViolationPage for the board", () => {
  it("makes sending the notice the next step, and says what it gives to correct it", async () => {
    const { actions, user } = setup()
    expect(screen.getByText("First, deliver the notice.")).toBeInTheDocument()
    await user.click(pageActions().getByRole("button", { name: "Send the notice" }))
    const dialog = screen.getByRole("dialog", { name: "Send the notice" })
    expect(within(dialog).getByText("Sent today, it gives until Oct 28, 2026 to correct it.")).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "Send it" }))
    expect(actions.sendNotice).toHaveBeenCalledOnce()
  })

  it("imposes an available fine for an amount the documents allow", async () => {
    const { actions, user } = setup({
      steps: { ...view.steps, noticeDeliveredOn: "2026-10-11" },
      sanctions: [fine]
    })
    await user.click(screen.getByRole("button", { name: "Impose: Fines for violations" }))
    const dialog = screen.getByRole("dialog")
    const amount = within(dialog).getByLabelText(/Amount/)
    expect(amount).toHaveValue("100.00")
    await user.clear(amount)
    await user.type(amount, "150")
    await user.click(within(dialog).getByRole("button", { name: "Impose it" }))
    expect(await within(dialog).findByText("That's more than the $100.00 allowed.")).toBeInTheDocument()
    await user.clear(amount)
    await user.type(amount, "75")
    await user.click(within(dialog).getByRole("button", { name: "Impose it" }))
    expect(actions.impose).toHaveBeenCalledWith({
      ruleKey: fine.ruleKey,
      enforced: rule.key,
      amountCents: 7500,
      note: ""
    })
  })

  it("asks the facts the documents need, and answers one", async () => {
    const { actions, user } = setup({
      facts: [
        {
          key: "violation.cure-by",
          label: "cure by",
          note: "The time to cure the notice states.",
          input: { type: "date" },
          value: null,
          valueText: null
        }
      ]
    })
    await user.click(screen.getByRole("button", { name: "Answer: cure by" }))
    const dialog = screen.getByRole("dialog", { name: "Cure by" })
    await user.type(within(dialog).getByLabelText(/Answer/), "2026-11-01")
    await user.click(within(dialog).getByRole("button", { name: "Save" }))
    expect(actions.stateFact).toHaveBeenCalledWith("violation.cure-by", { type: "date", value: "2026-11-01" })
  })
})

describe("ViolationPage for whoever answers for it", () => {
  const owner = {
    canManage: false,
    canRespond: true,
    sanctions: [],
    people: [{ ...jordan, email: null }],
    steps: { ...view.steps, noticeDeliveredOn: "2026-10-11" },
    cures: [{ ...running, startsOn: "2026-10-11", endsOn: "2026-10-25" }]
  } satisfies Partial<ViolationView>

  it("says by when to correct it, and leaves out what the board weighs", () => {
    setup(owner)
    expect(screen.getByText("Correct it by Oct 25, 2026")).toBeInTheDocument()
    expect(screen.queryByText("What the documents allow")).not.toBeInTheDocument()
    expect(pageActions().queryByRole("button", { name: "Send the notice" })).not.toBeInTheDocument()
  })

  it("replies, or asks for a hearing once", async () => {
    const { actions, user } = setup(owner)
    await user.click(pageActions().getByRole("button", { name: "Reply" }))
    const dialog = screen.getByRole("dialog", { name: "Reply to the board" })
    await user.type(within(dialog).getByLabelText(/Your reply/), "The cans are back in the garage.")
    await user.click(within(dialog).getByRole("button", { name: "Send the reply" }))
    expect(actions.respond).toHaveBeenCalledWith("reply", "The cans are back in the garage.")
  })
})
