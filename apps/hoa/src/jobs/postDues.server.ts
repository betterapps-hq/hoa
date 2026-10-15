import { getDb } from "@/db/client.server"
import { postCharges } from "@/db/ledgerRepository"
import { listOrganizations } from "@/db/organizationRepository"
import { duesUnits, listSchedules } from "@/db/scheduleRepository"
import { publishedRules, todayIn } from "@/features/violations/violations.server"
import { chargesDue, type Schedule } from "@/money/schedules"

// The daily job's dues (docs/design/money.md, Dues): each active schedule's charges, posted 30 days before they're due,
// once per unit and due day, so a missed run catches up and a repeated one posts nothing twice.

/** Today where the association is, as its published rulebook sets it. */
export async function associationToday(organizationId: string) {
  const published = await publishedRules(organizationId)
  return todayIn(published?.rulesFile ?? null)
}

/** Posts the charges an association's schedules have due to post; only the given ones when named. Returns how many. */
export async function postDues(organizationId: string, only?: readonly Schedule[]) {
  const db = getDb()
  const [today, units, schedules] = await Promise.all([
    associationToday(organizationId),
    duesUnits(db, organizationId),
    only ?? listSchedules(db, organizationId)
  ])
  const charges = schedules.flatMap((schedule) =>
    chargesDue(schedule, units, today).map((charge) => ({
      ...charge,
      kind: "charge" as const,
      postedOn: today,
      category: schedule.category,
      description: schedule.name,
      reference: null,
      ruleKey: null,
      rulebookId: null,
      sourceType: "schedule" as const,
      sourceId: schedule.id,
      createdBy: schedule.createdBy
    }))
  )
  return postCharges(db, { organizationId, now: new Date().toISOString() }, charges)
}

/** Every association's dues, each on its own so one's failure doesn't stop the rest. */
export async function postEveryonesDues() {
  const organizations = await listOrganizations(getDb())
  for (const organization of organizations) {
    try {
      await postDues(organization.id)
    } catch (error) {
      console.error(`Posting dues for ${organization.id} failed`, error)
    }
  }
}
