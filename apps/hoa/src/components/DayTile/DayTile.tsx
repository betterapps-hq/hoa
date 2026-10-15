import { cn } from "cn"

const monthFormat = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" })

/** A day as a calendar leaf: its month over its date, for lists of things due on a day. */
export function DayTile({ day, className }: { day: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-10 shrink-0 flex-col items-center justify-center rounded-md border bg-muted/40 leading-none",
        className
      )}
    >
      <span className="text-[0.625rem] font-medium text-muted-foreground uppercase">
        {monthFormat.format(new Date(`${day}T00:00:00Z`))}
      </span>
      <span className="text-sm font-semibold tabular-nums">{Number(day.slice(8))}</span>
    </span>
  )
}
