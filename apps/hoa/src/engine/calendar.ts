import type * as T from "@/schema/types"

// Calendar arithmetic in the organization's local time (schema.md, Expressions 10 and 11). Dates are whole days since
// 1970-01-01; date-times are local minutes since 1970-01-01 00:00.

export type Schedule = Extract<T.FactValue, { type: "schedule" }>

const msPerDay = 86_400_000
export const minutesPerDay = 1440
const weekdays: T.Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]

export function toDay(date: T.IsoDate) {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number)
  return Date.UTC(year, month - 1, day) / msPerDay
}

export const fromDay = (day: number): T.IsoDate => new Date(day * msPerDay).toISOString().slice(0, 10)

const parts = (day: number) => {
  const date = new Date(day * msPerDay)
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, date: date.getUTCDate() }
}

export const weekdayOf = (day: number): T.Weekday => weekdays[new Date(day * msPerDay).getUTCDay()] ?? "sun"

/** Months keep the day of the month, clamped to the month's last day. */
export function addMonths(day: number, months: number) {
  const { year, month, date } = parts(day)
  const target = new Date(Date.UTC(year, month - 1 + months, 1))
  const lastDate = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  return Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(date, lastDate)) / msPerDay
}

export const minutesOf = (time: T.TimeOfDay) => {
  const [hours = 0, minutes = 0] = time.split(":").map(Number)
  return hours * 60 + minutes
}

/** A timestamp as local minutes in the zone. */
export function localMinutes(timestamp: T.Timestamp, zone: string) {
  const instant = new Date(timestamp)
  if (Number.isNaN(instant.getTime())) {
    throw new Error(`not a timestamp: ${timestamp}`)
  }
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23"
  })
  const field = (type: Intl.DateTimeFormatPartTypes) =>
    Number(format.formatToParts(instant).find((part) => part.type === type)?.value ?? 0)
  const day = Date.UTC(field("year"), field("month") - 1, field("day")) / msPerDay
  return day * minutesPerDay + field("hour") * 60 + field("minute")
}

// ─── Business days ────────────────────────────────────────────────────────────────────────────────

/** The holiday calendars evaluation knows; any other name means weekends only. */
export type HolidayCalendar = (year: number) => Set<number>

function nthWeekday(year: number, month: number, weekday: number, n: number) {
  const first = Date.UTC(year, month - 1, 1) / msPerDay
  const offset = (weekday - new Date(first * msPerDay).getUTCDay() + 7) % 7
  return first + offset + (n - 1) * 7
}

function lastWeekday(year: number, month: number, weekday: number) {
  const last = Date.UTC(year, month, 0) / msPerDay
  return last - ((new Date(last * msPerDay).getUTCDay() - weekday + 7) % 7)
}

// A fixed-date holiday on a Saturday is observed the Friday before, on a Sunday the Monday after.
function observed(day: number) {
  const weekday = new Date(day * msPerDay).getUTCDay()
  if (weekday === 6) {
    return day - 1
  }
  return weekday === 0 ? day + 1 : day
}

const usFederal: HolidayCalendar = (year) => {
  const fixed = (month: number, date: number) => observed(Date.UTC(year, month - 1, date) / msPerDay)
  return new Set([
    fixed(1, 1),
    nthWeekday(year, 1, 1, 3),
    nthWeekday(year, 2, 1, 3),
    lastWeekday(year, 5, 1),
    fixed(6, 19),
    fixed(7, 4),
    nthWeekday(year, 9, 1, 1),
    nthWeekday(year, 10, 1, 2),
    fixed(11, 11),
    nthWeekday(year, 11, 4, 4),
    fixed(12, 25)
  ])
}

export const holidayCalendar = (name: string): HolidayCalendar =>
  name === "us-federal" ? usFederal : () => new Set<number>()

export function isBusinessDay(day: number, holidays: HolidayCalendar) {
  const weekday = weekdayOf(day)
  if (weekday === "sat" || weekday === "sun") {
    return false
  }
  return !holidays(parts(day).year).has(day)
}

/** Business days skip weekends and holidays; 0 business days is the day itself. */
export function addBusinessDays(day: number, count: number, holidays: HolidayCalendar) {
  const step = count < 0 ? -1 : 1
  let current = day
  for (let remaining = Math.abs(count); remaining > 0;) {
    current += step
    if (isBusinessDay(current, holidays)) {
      remaining -= 1
    }
  }
  return current
}

export function nextBusinessDay(day: number, holidays: HolidayCalendar) {
  let current = day
  while (!isBusinessDay(current, holidays)) {
    current += 1
  }
  return current
}

// ─── Schedules ────────────────────────────────────────────────────────────────────────────────────

/** Moves a day by an amount of time in a unit; undefined when the unit isn't one of time. */
export type Shift = (day: number, amount: number, unit: T.TermKey) => number | undefined

/** The days of a schedule from first to last, inclusive. */
export function scheduleDays(schedule: Schedule, first: number, last: number, shift: Shift) {
  const days = new Set<number>()
  for (let day = first; day <= last; day += 1) {
    const { month, date } = parts(day)
    const monthDay = `${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`
    if (schedule.weekly.includes(weekdayOf(day)) || schedule.annual.includes(monthDay)) {
      days.add(day)
    }
  }
  const { every } = schedule
  if (every && every.value > 0) {
    const start = toDay(every.from)
    for (let k = 0, day: number | undefined = start; day !== undefined && day <= last; k += 1) {
      if (day >= first) {
        days.add(day)
      }
      day = shift(start, every.value * (k + 1), every.unit)
    }
  }
  return [...days].toSorted((a, b) => a - b)
}

/** The schedule's occurrence on the day, or the latest before it. */
export function latestOccurrence(schedule: Schedule, day: number, shift: Shift) {
  const { every } = schedule
  // Weekly and annual dates recur within a year; a period can be longer.
  const periodStart = every ? shift(day, -every.value, every.unit) : undefined
  const first = Math.min(day - 366, periodStart ?? day)
  return scheduleDays(schedule, first, day, shift).at(-1)
}
