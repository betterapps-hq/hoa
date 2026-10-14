import { CalendarSyncIcon, CircleStopIcon, PlusIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { DangerDialog } from "@/components/DangerDialog/DangerDialog"
import { PageActions } from "@/components/PageActions/PageActions"
import { RowActions } from "@/components/RowActions/RowActions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress"
import { attempt } from "@/lib/attempt"
import { dayText } from "@/lib/days"
import { money } from "@/lib/money"
import { frequencyLabels, postsDaysAhead } from "@/money/schedules"
import type { ScheduleInput, ScheduleView } from "../dues.functions"
import { amountText, categoryLabels, paidPercent, periodText } from "../duesDisplay"
import { ScheduleDialog } from "../ScheduleDialog/ScheduleDialog"

// Dues (money.md, Dues): the board's schedules of dues and special assessments, each with its next due day and how its
// latest due day is being paid. Setting one up is the page's action; ending one stops its charges.

export type DuesActions = {
  create: (schedule: ScheduleInput) => Promise<{ posted: number }>
  end: (scheduleId: string) => Promise<void>
}

export type DuesPageProps = {
  today: string
  schedules: ScheduleView[]
  units: readonly { id: string; label: string }[]
  actions: DuesActions
  onChanged: () => void
}

/** The association's dues and special assessments. */
export function DuesPage({ today, schedules, units, actions, onChanged }: DuesPageProps) {
  const [isCreating, setCreating] = useState(false)
  const [ending, setEnding] = useState<ScheduleView | null>(null)
  const active = schedules.filter((schedule) => schedule.status === "active")
  const ended = schedules.filter((schedule) => schedule.status === "ended")
  const create = async (schedule: ScheduleInput) => {
    const { posted } = await attempt(() => actions.create(schedule))
    toast.success(postedText(posted))
    onChanged()
  }
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 lg:px-6">
      <PageActions primary={{ label: "Set up dues", icon: PlusIcon, onSelect: () => setCreating(true) }} />
      {schedules.length === 0 ? (
        <Card>
          <CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CalendarSyncIcon />
                </EmptyMedia>
                <EmptyTitle>No dues set up</EmptyTitle>
                <EmptyDescription>
                  Set up the association&apos;s dues or a special assessment, and each charge posts to every unit&apos;s
                  ledger {postsDaysAhead} days before it&apos;s due.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={() => setCreating(true)} disabled={units.length === 0}>
                  <PlusIcon data-icon="inline-start" />
                  Set up dues
                </Button>
                {units.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Add units to the roll first.</p>
                ) : null}
              </EmptyContent>
            </Empty>
          </CardContent>
        </Card>
      ) : (
        <>
          {active.length > 0 ? <Overview schedules={active} unitCount={units.length} /> : null}
          <section className="flex flex-col gap-3" aria-labelledby="dues-active">
            <h2 id="dues-active" className="text-sm font-medium text-muted-foreground">
              {active.length === 0 ? "Nothing is due" : "Active"}
            </h2>
            {active.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Every schedule has ended. Set up another to post charges again.
              </p>
            ) : (
              active.map((schedule) => (
                <ScheduleCard key={schedule.id} schedule={schedule} today={today} onEnd={() => setEnding(schedule)} />
              ))
            )}
          </section>
          {ended.length > 0 ? (
            <section className="flex flex-col gap-3" aria-labelledby="dues-ended">
              <h2 id="dues-ended" className="text-sm font-medium text-muted-foreground">
                Ended
              </h2>
              {ended.map((schedule) => (
                <ScheduleCard key={schedule.id} schedule={schedule} today={today} />
              ))}
            </section>
          ) : null}
        </>
      )}
      {isCreating ? <ScheduleDialog today={today} units={units} onCreate={create} onOpenChange={setCreating} /> : null}
      {ending ? (
        <DangerDialog
          title={`End ${ending.name}?`}
          description="It stops posting charges. What it has posted stays on each unit's ledger, and can be waived there."
          confirmLabel="End it"
          onConfirm={async () => {
            await attempt(() => actions.end(ending.id), `${ending.name} ended.`)
            onChanged()
          }}
          onOpenChange={(open) => {
            if (!open) {
              setEnding(null)
            }
          }}
        />
      ) : null}
    </div>
  )
}

const postedText = (posted: number) =>
  posted === 0
    ? `Set up. Its first charges post ${postsDaysAhead} days before they're due.`
    : `Set up, and ${posted === 1 ? "1 charge" : `${posted} charges`} posted.`

const monthsApart = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 } as const

/** The next charge across every schedule, and what the recurring ones bill in a year. */
function Overview({ schedules, unitCount }: { schedules: ScheduleView[]; unitCount: number }) {
  const next = schedules
    .flatMap((schedule) => (schedule.nextDueOn ? [{ schedule, dueOn: schedule.nextDueOn }] : []))
    .toSorted((a, b) => a.dueOn.localeCompare(b.dueOn))
  const nextDueOn = next.at(0)?.dueOn
  const dueThen = next.filter((item) => item.dueOn === nextDueOn)
  const yearly = schedules.reduce(
    (total, schedule) =>
      schedule.frequency === "once" ? total : total + (schedule.totalCents * 12) / monthsApart[schedule.frequency],
    0
  )
  return (
    <Card size="sm">
      <CardContent className="grid gap-6 sm:grid-cols-3">
        <Stat
          label="Next due"
          value={nextDueOn ? dayText(nextDueOn) : "Nothing"}
          detail={
            nextDueOn
              ? `${money(dueThen.reduce((total, item) => total + item.schedule.totalCents, 0))} from ${dueThen
                  .map((item) => item.schedule.name)
                  .join(" and ")}`
              : "No schedule has another due day."
          }
        />
        <Stat label="Billed a year" value={money(Math.round(yearly))} detail="From recurring dues." />
        <Stat
          label="Units"
          value={String(unitCount)}
          detail={unitCount === 1 ? "On the roll, and charged." : "On the roll, each charged."}
        />
      </CardContent>
    </Card>
  )
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
      <span className="truncate text-sm text-muted-foreground">{detail}</span>
    </div>
  )
}

/** When an active schedule is next due, or the day an ended one ended. */
function nextDueText(schedule: ScheduleView) {
  if (schedule.status === "ended") {
    return dayText(schedule.updatedAt.slice(0, 10))
  }
  return schedule.nextDueOn ? dayText(schedule.nextDueOn) : "No more due"
}

/** A schedule: what it charges, how often and when, and how its latest due day is being paid. */
function ScheduleCard({ schedule, today, onEnd }: { schedule: ScheduleView; today: string; onEnd?: () => void }) {
  const isActive = schedule.status === "active"
  const { collection } = schedule
  return (
    <Card className={isActive ? undefined : "bg-muted/40"}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold">{schedule.name}</h3>
          <Badge variant={schedule.category === "dues" ? "secondary" : "outline"}>
            {categoryLabels[schedule.category]}
          </Badge>
        </CardTitle>
        <CardDescription>
          {amountText(schedule.amountCents, schedule.ownAmounts)}. {frequencyLabels[schedule.frequency]}.{" "}
          {periodText(schedule)}.
        </CardDescription>
        {onEnd ? (
          <CardAction>
            <RowActions
              name={schedule.name}
              actions={[{ label: "End", icon: CircleStopIcon, isDestructive: true, onSelect: onEnd }]}
            />
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-6 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">{isActive ? "Next due" : "Ended"}</span>
          <span className="font-medium tabular-nums">{nextDueText(schedule)}</span>
          {isActive && schedule.nextDueOn ? (
            <span className="text-sm text-muted-foreground tabular-nums">{money(schedule.totalCents)} in all</span>
          ) : null}
        </div>
        {collection ? (
          <div className="flex flex-col gap-2">
            <Progress value={paidPercent(collection)} className="gap-2">
              <ProgressLabel>
                {collection.dueOn > today ? "Due " : "Was due "}
                {dayText(collection.dueOn)}
              </ProgressLabel>
              <ProgressValue>
                {() => `${money(collection.paidCents)} of ${money(collection.chargedCents)} paid`}
              </ProgressValue>
            </Progress>
            <span className="text-sm text-muted-foreground">
              {collection.paidUnits === collection.units
                ? "Every unit has paid."
                : `${collection.paidUnits} of ${collection.units === 1 ? "1 unit" : `${collection.units} units`} paid.`}
            </span>
          </div>
        ) : (
          <p className="self-center text-sm text-muted-foreground">
            {isActive
              ? `Nothing has posted yet. Charges post ${postsDaysAhead} days before they're due.`
              : "It never posted a charge."}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
