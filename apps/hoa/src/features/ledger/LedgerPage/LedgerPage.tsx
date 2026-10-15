import { WalletIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { money } from "@/lib/money"
import type { LedgerUnit } from "../ledger.functions"
import { balanceText } from "../ledgerDisplay"

// The ledgers (money.md): every unit's balance for the board, the owner's own units for them.

export type LedgerPageProps = {
  units: LedgerUnit[]
  /** The board sees every unit; an owner sees their own. */
  canManage: boolean
  onOpen: (unitId: string) => void
}

/** Each unit's balance, to open its ledger from. */
export function LedgerPage({ units, canManage, onOpen }: LedgerPageProps) {
  const owing = units.filter((unit) => unit.balanceCents > 0)
  const owed = owing.reduce((total, unit) => total + unit.balanceCents, 0)
  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <Card>
        <CardHeader>
          <CardTitle>{canManage ? "Balances" : "Your balance"}</CardTitle>
          <CardDescription>
            {canManage
              ? `${owing.length === 1 ? "1 unit owes" : `${owing.length} units owe`} ${money(owed)} in all.`
              : "What's charged to your home, and what you've paid."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {units.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <WalletIcon />
                </EmptyMedia>
                <EmptyTitle>No units</EmptyTitle>
                <EmptyDescription>
                  {canManage ? "Add units to the roll, and their ledgers appear here." : "You don't own a unit here."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unit</TableHead>
                  <TableHead>Owners</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>
                    <span className="sr-only">Open</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {units.map((unit) => (
                  <TableRow key={unit.id}>
                    <TableCell className="max-w-80">
                      <div className="truncate font-medium">{unit.label}</div>
                      {unit.detail && unit.detail !== unit.label ? (
                        <div className="truncate text-muted-foreground">{unit.detail}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {unit.owners.join(", ") || <span className="text-muted-foreground">None</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{balanceText(unit.balanceCents)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => onOpen(unit.id)}>
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
