import { Link } from "@tanstack/react-router"
import { HouseIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { dayText } from "@/lib/days"
import { money } from "@/lib/money"
import type { HomeOverview } from "../overview"

// A homeowner's home on their dashboard (docs/dashboard.md): what they owe, whether any of it is late, what's due next
// and what they last paid, opening its ledger.

function StandingBadge({ home }: { home: HomeOverview }) {
  if (home.pastDueCents > 0) {
    return <Badge variant="destructive">{money(home.pastDueCents)} past due</Badge>
  }
  if (home.balanceCents > 0) {
    return <Badge variant="outline">Nothing late</Badge>
  }
  return <Badge variant="secondary">Paid up</Badge>
}

/** One of a homeowner's homes and its balance. */
export function HomeCard({ home }: { home: HomeOverview }) {
  const isCredit = home.balanceCents < 0
  return (
    <Card className="h-full">
      <CardHeader>
        <CardDescription className="flex min-w-0 items-center gap-2">
          <HouseIcon className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{home.address && home.address !== home.label ? home.address : "Your home"}</span>
        </CardDescription>
        <CardTitle className="min-w-0">
          <h2 className="truncate text-base font-semibold">{home.label}</h2>
        </CardTitle>
        <CardAction>
          <StandingBadge home={home} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">{isCredit ? "Your credit" : "Your balance"}</span>
          <span className="text-4xl font-semibold tracking-tight tabular-nums">
            {money(Math.abs(home.balanceCents))}
          </span>
          {home.pastDueSince ? (
            <span className="text-sm text-destructive">Some has been due since {dayText(home.pastDueSince)}.</span>
          ) : null}
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">Next due</dt>
            <dd className="font-medium">
              {home.next ? `${money(home.next.amountCents)} on ${dayText(home.next.dueOn)}` : "Nothing scheduled"}
            </dd>
            {home.next ? (
              <dd className="text-muted-foreground">
                {home.next.name}
                {home.next.isPosted ? ", on your ledger" : ""}
              </dd>
            ) : null}
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">Last payment</dt>
            <dd className="font-medium">
              {home.lastPayment
                ? `${money(home.lastPayment.amountCents)} on ${dayText(home.lastPayment.postedOn)}`
                : "None yet"}
            </dd>
          </div>
        </dl>
      </CardContent>
      <CardFooter className="mt-auto">
        <Button render={<Link to="/ledger/$unitId" params={{ unitId: home.unitId }} />} nativeButton={false}>
          Open your ledger
        </Button>
      </CardFooter>
    </Card>
  )
}
