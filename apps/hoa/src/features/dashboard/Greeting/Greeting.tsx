import type { ReactNode } from "react"

const longDay = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC"
})

type GreetingProps = {
  /** The reader's name; their first name greets them. */
  name: string
  association: string
  /** Today where the association is. */
  today: string
  /** What sits beside it on a wide screen. */
  children?: ReactNode
}

/** The top of a dashboard: the reader by name, the association, and the day. */
export function Greeting({ name, association, today, children }: GreetingProps) {
  const [first] = name.trim().split(/\s+/)
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight text-balance">
          {first ? `Welcome back, ${first}` : "Welcome back"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {association}. {longDay.format(new Date(`${today}T00:00:00Z`))}.
        </p>
      </div>
      {children}
    </div>
  )
}
