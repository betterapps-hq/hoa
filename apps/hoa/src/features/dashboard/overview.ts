import type { NextStep } from "@/features/violations/violations.server"
import type { Collection } from "@/money/collections"
import type { Aging, MonthTotals } from "@/money/receivables"

// What the dashboards show of money, dues and violations (docs/dashboard.md): the board's view of the whole
// association, and an owner's of their own homes.

/** A unit's balance, for the board's list of the largest. */
export type UnitBalance = {
  unitId: string
  label: string
  owners: string[]
  balanceCents: number
  pastDueCents: number
  pastDueSince: string | null
}

/** What's owed to the association, how late it is, and what was billed and collected lately. */
export type MoneyOverview = {
  /** What the units that owe, owe together. */
  owedCents: number
  owingUnits: number
  unitCount: number
  /** What's unpaid past its due day, and on how many units. */
  pastDueCents: number
  pastDueUnits: number
  /** The due day of the oldest charge still unpaid past it. */
  pastDueSince: string | null
  aging: Aging
  /** The last six months, oldest first. */
  months: MonthTotals[]
  /** The units that owe the most, most first. */
  largest: UnitBalance[]
}

/** The dues the board set up: the next charge across them, and how the latest due day is being paid. */
export type DuesOverview = {
  next: { name: string; dueOn: string; totalCents: number } | null
  latest: (Collection & { name: string }) | null
}

/** An open violation, with what happens next and any hearing set. */
export type ViolationItem = {
  id: string
  title: string
  unit: string
  observedOn: string
  nextStep: NextStep | null
  hearingOn: string | null
}

/** One of an owner's homes: what they owe, what's past due, and what's coming due next. */
export type HomeOverview = {
  unitId: string
  label: string
  address: string | null
  balanceCents: number
  pastDueCents: number
  pastDueSince: string | null
  /** The next dues charge, and whether it has posted to the ledger yet. */
  next: { name: string; dueOn: string; amountCents: number; isPosted: boolean } | null
  lastPayment: { postedOn: string; amountCents: number } | null
}

/** Something dated ahead: a due day, the end of a time to cure, or a hearing. */
export type UpcomingItem = { id: string; on: string; subject: string; note: string } & (
  | { kind: "dues"; unitId: string | null }
  | { kind: "violation"; violationId: string }
)

export type DashboardOverview = {
  today: string
  /** Whether the reader does the board's work, and sees the whole association's money and violations. */
  isBoard: boolean
  money: MoneyOverview | null
  dues: DuesOverview | null
  /** Open violations: every one for the board; an owner's own once noticed. */
  violations: ViolationItem[]
  /** The reader's own homes. */
  homes: HomeOverview[]
  /** Soonest first. */
  upcoming: UpcomingItem[]
}
