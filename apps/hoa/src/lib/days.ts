// Days as the app keeps them: YYYY-MM-DD, with no time of day.

const dayFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" })

/** A day as people read it: "May 31, 2027". */
export const dayText = (day: string) => dayFormat.format(new Date(`${day}T00:00:00Z`))

/** The day a number of days after another, or before it for a negative number. */
export const addDays = (day: string, days: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

/** Today where the viewer is. */
export const localToday = () => new Date().toLocaleDateString("en-CA")
