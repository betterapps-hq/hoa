import { Link } from "@tanstack/react-router"
import { ArrowLeftIcon, BadgePercentIcon, CirclePlusIcon, HandCoinsIcon, Undo2Icon, WalletIcon } from "lucide-react"
import { useState } from "react"
import { PageActions } from "@/components/PageActions/PageActions"
import { RowActions } from "@/components/RowActions/RowActions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { attempt } from "@/lib/attempt"
import { dayText } from "@/lib/days"
import { money } from "@/lib/money"
import type { ChargeCategory, PaymentMethod } from "@/money/ledger"
import type { LedgerLine, UnitLedgerView } from "../ledger.functions"
import { ChargeDialog, CreditDialog, PaymentDialog, ReverseDialog } from "../LedgerDialogs/LedgerDialogs"
import { balanceText } from "../ledgerDisplay"

// A unit's ledger (money.md): each charge, payment, credit and reversal with the balance after it, newest first. The
// board records payments and credits, adds charges, and waives or reverses entries; an owner reads it.

export type LedgerActions = {
  recordPayment: (payment: {
    amountCents: number
    method: PaymentMethod
    reference: string
    postedOn: string
  }) => Promise<void>
  addCharge: (charge: {
    amountCents: number
    category: ChargeCategory
    description: string
    dueOn: string
  }) => Promise<void>
  giveCredit: (credit: { amountCents: number; description: string }) => Promise<void>
  reverse: (entryId: string, reason: string) => Promise<void>
}

export type UnitLedgerPageProps = {
  view: UnitLedgerView
  actions: LedgerActions
  onChanged: () => void
  onBack: () => void
}

type OpenDialog =
  | { type: "payment" }
  | { type: "charge" }
  | { type: "credit" }
  | { type: "reverse"; line: LedgerLine & { kind: "charge" | "payment" | "credit" } }
  | null

const isReversible = (line: LedgerLine): line is LedgerLine & { kind: "charge" | "payment" | "credit" } =>
  line.kind !== "reversal" && line.canReverse

/** A unit's ledger and balance. */
export function UnitLedgerPage({ view, actions, onChanged, onBack }: UnitLedgerPageProps) {
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const close = (open: boolean) => {
    if (!open) {
      setDialog(null)
    }
  }
  const run = async (change: () => Promise<unknown>, success: string) => {
    await attempt(change, success)
    onChanged()
  }
  const { unit, balanceCents } = view
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 lg:px-6">
      {view.canManage ? (
        <PageActions
          primary={{ label: "Record a payment", icon: HandCoinsIcon, onSelect: () => setDialog({ type: "payment" }) }}
          more={[
            { label: "Add a charge", icon: CirclePlusIcon, onSelect: () => setDialog({ type: "charge" }) },
            { label: "Give a credit", icon: BadgePercentIcon, onSelect: () => setDialog({ type: "credit" }) }
          ]}
        />
      ) : null}
      <Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" onClick={onBack}>
        <ArrowLeftIcon />
        Ledger
      </Button>
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-xl font-semibold text-balance">{unit.label}</h2>
          <p className="text-sm text-muted-foreground">
            {[unit.address && unit.address !== unit.label ? unit.address : null, ownersText(view.owners)]
              .filter(Boolean)
              .join(". ")}
            .
          </p>
        </div>
        <div className="flex flex-col items-start sm:items-end">
          <span className="text-sm text-muted-foreground">{balanceCents < 0 ? "Credit" : "Balance"}</span>
          <span className="text-2xl font-semibold tabular-nums">{money(Math.abs(balanceCents))}</span>
        </div>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Entries</CardTitle>
          <CardDescription>Newest first. Payments and credits pay the oldest charges due first.</CardDescription>
        </CardHeader>
        <CardContent>
          {view.lines.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <WalletIcon />
                </EmptyMedia>
                <EmptyTitle>Nothing yet</EmptyTitle>
                <EmptyDescription>Charges and payments appear here as they post.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Entry</TableHead>
                  <TableHead className="text-right">Charge</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  {view.canManage ? (
                    <TableHead>
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell className="align-top tabular-nums">{dayText(line.postedOn)}</TableCell>
                    <TableCell className="max-w-96 whitespace-normal">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{line.description}</span>
                        <LineStatus line={line} />
                      </div>
                      <div className="text-muted-foreground">
                        {line.label}
                        {line.kind === "charge" && line.dueOn ? `, due ${dayText(line.dueOn)}` : ""}
                        {line.violationId ? (
                          <>
                            {", "}
                            <Link
                              to="/violations/$violationId"
                              params={{ violationId: line.violationId }}
                              className="text-link underline-offset-4 hover:underline"
                            >
                              the violation
                            </Link>
                          </>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {line.amountCents > 0 ? money(line.amountCents) : ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {line.amountCents < 0 ? money(-line.amountCents) : ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{balanceText(line.balanceCents)}</TableCell>
                    {view.canManage ? (
                      <TableCell className="text-right">
                        {isReversible(line) ? (
                          <RowActions
                            name={line.description}
                            actions={[
                              {
                                label: line.kind === "charge" ? "Waive what's unpaid" : "Reverse",
                                icon: Undo2Icon,
                                isDestructive: true,
                                onSelect: () => setDialog({ type: "reverse", line })
                              }
                            ]}
                          />
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {dialog?.type === "payment" ? (
        <PaymentDialog
          today={view.today}
          onRecord={(payment) => run(() => actions.recordPayment(payment), "Payment recorded")}
          onOpenChange={close}
        />
      ) : null}
      {dialog?.type === "charge" ? (
        <ChargeDialog
          today={view.today}
          onAdd={(charge) => run(() => actions.addCharge(charge), "Charge added")}
          onOpenChange={close}
        />
      ) : null}
      {dialog?.type === "credit" ? (
        <CreditDialog onGive={(credit) => run(() => actions.giveCredit(credit), "Credit given")} onOpenChange={close} />
      ) : null}
      {dialog?.type === "reverse" ? (
        <ReverseDialog
          entry={dialog.line}
          onReverse={(reason) =>
            run(() => actions.reverse(dialog.line.id, reason), dialog.line.kind === "charge" ? "Waived" : "Reversed")
          }
          onOpenChange={close}
        />
      ) : null}
    </div>
  )
}

/** Whether a charge is paid or open, and whether an entry was reversed. */
function LineStatus({ line }: { line: LedgerLine }) {
  if (line.isReversed) {
    return <Badge variant="outline">{line.kind === "charge" ? "Waived" : "Reversed"}</Badge>
  }
  if (line.kind !== "charge" || line.openCents === null) {
    return null
  }
  if (line.openCents <= 0) {
    return <Badge variant="secondary">Paid</Badge>
  }
  return line.openCents < line.amountCents ? (
    <Badge variant="outline">{money(line.openCents)} unpaid</Badge>
  ) : (
    <Badge variant="outline">Unpaid</Badge>
  )
}

const ownersText = (owners: readonly string[]) =>
  owners.length > 0 ? `Owned by ${new Intl.ListFormat("en-US").format(owners)}` : "No owner on the roll"
