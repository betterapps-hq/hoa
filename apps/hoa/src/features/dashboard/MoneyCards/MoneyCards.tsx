import { Link } from "@tanstack/react-router"
import type { ComponentProps } from "react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from "@/components/ui/chart"
import { dayText } from "@/lib/days"
import { money } from "@/lib/money"
import { agingBuckets, type Aging } from "@/money/receivables"
import type { MoneyOverview } from "../overview"

// The board's money on its dashboard (docs/dashboard.md): what was billed and collected month by month, and what's
// owed by how late it is, with the units that owe the most.

const monthFormat = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" })
const longMonthFormat = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
const monthNameFormat = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" })

/** "Oct" for "2026-10". */
const monthLabel = (month: string) => monthFormat.format(new Date(`${month}-01T00:00:00Z`))

/** "October" for "2026-10". */
export const monthName = (month: string) => monthNameFormat.format(new Date(`${month}-01T00:00:00Z`))

/** "October 2026" for "2026-10". */
const longMonthLabel = (month: string) => longMonthFormat.format(new Date(`${month}-01T00:00:00Z`))

/** "$1.2k" on the chart's axis. */
const axisMoney = (cents: number) => {
  const dollars = cents / 100
  return dollars >= 1000 ? `$${(dollars / 1000).toFixed(dollars >= 10_000 ? 0 : 1)}k` : `$${Math.round(dollars)}`
}

// Keyed by each bar's data, as the chart's legend and tooltip look them up.
const collectionsConfig = {
  billedCents: { label: "Billed", color: "color-mix(in oklch, var(--primary) 28%, var(--muted))" },
  collectedCents: { label: "Collected", color: "var(--primary)" }
} satisfies ChartConfig

/** A tooltip's line for one bar: billed or collected, and the amount. */
const tooltipRow: NonNullable<ComponentProps<typeof ChartTooltipContent>["formatter"]> = (value, name) => (
  <div className="flex w-full items-center justify-between gap-4">
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <span className="size-2 rounded-xs" style={{ background: `var(--color-${String(name)})` }} aria-hidden />
      {name === "billedCents" ? collectionsConfig.billedCents.label : collectionsConfig.collectedCents.label}
    </span>
    <span className="font-medium text-foreground tabular-nums">{money(typeof value === "number" ? value : 0)}</span>
  </div>
)

/** What was billed and collected each of the last six months. */
export function CollectionsCard({ months }: { months: MoneyOverview["months"] }) {
  const current = months.at(-1)
  const share =
    current && current.billedCents > 0 ? Math.round((current.collectedCents / current.billedCents) * 100) : null
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>
          <h2>Billed and collected</h2>
        </CardTitle>
        <CardDescription>
          Charges by the month they&apos;re due, and payments by the month they came in.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        <ChartContainer config={collectionsConfig} className="aspect-auto h-60 w-full">
          <BarChart data={months} margin={{ left: 4, right: 4 }} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={monthLabel} />
            <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={axisMoney} />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => {
                    const month: unknown = payload[0]?.payload?.month
                    return typeof month === "string" ? longMonthLabel(month) : null
                  }}
                  formatter={tooltipRow}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="billedCents" fill="var(--color-billedCents)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="collectedCents" fill="var(--color-collectedCents)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
      {current ? (
        <CardFooter className="text-sm text-muted-foreground">
          {share === null
            ? `Nothing billed for ${longMonthLabel(current.month)} yet; ${money(current.collectedCents)} collected.`
            : `${money(current.collectedCents)} collected in ${longMonthLabel(current.month)}, ${share}% of the ${money(current.billedCents)} billed for it.`}
        </CardFooter>
      ) : null}
    </Card>
  )
}

const agingLabels: Record<keyof Aging, string> = {
  current: "Not due yet",
  late30: "1 to 30 days late",
  late60: "31 to 60 days late",
  late90: "61 to 90 days late",
  over90: "Over 90 days late"
}

const agingColors: Record<keyof Aging, string> = {
  current: "var(--primary)",
  late30: "var(--chart-2)",
  late60: "var(--chart-3)",
  late90: "var(--chart-4)",
  over90: "var(--destructive)"
}

/** What's owed by how late it is, and the units that owe the most. */
export function ReceivablesCard({ overview }: { overview: MoneyOverview }) {
  const total = agingBuckets.reduce((sum, bucket) => sum + overview.aging[bucket], 0)
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>
          <h2>What&apos;s owed</h2>
        </CardTitle>
        <CardDescription>
          {total > 0 ? `${money(total)} unpaid, by how late it is.` : "Nothing is unpaid on any unit's ledger."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {total > 0 ? (
          <div className="flex flex-col gap-3">
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
              {agingBuckets.map((bucket) =>
                overview.aging[bucket] > 0 ? (
                  <span
                    key={bucket}
                    className="h-full first:rounded-l-full last:rounded-r-full"
                    style={{ width: `${(overview.aging[bucket] / total) * 100}%`, background: agingColors[bucket] }}
                  />
                ) : null
              )}
            </div>
            <dl className="grid gap-1.5 text-sm">
              {agingBuckets.map((bucket) => (
                <div key={bucket} className="flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-2 text-muted-foreground">
                    <span className="size-2 rounded-full" style={{ background: agingColors[bucket] }} aria-hidden />
                    {agingLabels[bucket]}
                  </dt>
                  <dd className="font-medium tabular-nums">{money(overview.aging[bucket])}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
        {overview.largest.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">
              {overview.largest.length === 1 ? "The unit that owes" : "Owing the most"}
            </h3>
            <ul className="flex flex-col divide-y">
              {overview.largest.map((unit) => (
                <li key={unit.unitId} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 flex-col">
                    <Link
                      to="/ledger/$unitId"
                      params={{ unitId: unit.unitId }}
                      className="truncate font-medium underline-offset-4 hover:underline"
                    >
                      {unit.label}
                    </Link>
                    <span className="truncate text-sm text-muted-foreground">
                      {unit.owners.join(", ") || "No owner on the roll"}
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-medium tabular-nums">{money(unit.balanceCents)}</span>
                    {unit.pastDueSince ? (
                      <Badge variant="destructive">Late since {dayText(unit.pastDueSince)}</Badge>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
      <CardFooter className="mt-auto">
        <Button variant="outline" size="sm" render={<Link to="/ledger" />} nativeButton={false}>
          Open the ledger
        </Button>
      </CardFooter>
    </Card>
  )
}
