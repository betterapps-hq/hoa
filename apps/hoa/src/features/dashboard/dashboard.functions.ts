import { createServerFn } from "@tanstack/react-start"
import { canSee, type Application } from "@/applications/application"
import { listApplications, listReviewSummaries, type ReviewSummary } from "@/db/applicationRepository"
import { getDb } from "@/db/client.server"
import { listUploadHistory } from "@/db/documentRepository"
import { getOrganizationLedgers } from "@/db/ledgerRepository"
import { accountNames, getRoll } from "@/db/peopleRepository"
import { listProjectTypeAdditions, listProjectTypes } from "@/db/projectTypeRepository"
import { getPublishedRulesFile, getRulebookContent } from "@/db/rulebookContentRepository"
import { getRulebookByStatus, listPublishedRulebooks } from "@/db/rulebookRepository"
import { listSchedules } from "@/db/scheduleRepository"
import { rulesUpdateOf } from "@/features/applications/rulesUpdate.server"
import { doesWorkOf } from "@/features/role/roles"
import { ownedUnits, violationSummaries, visibleViolations } from "@/features/violations/violations.server"
import { addDays } from "@/lib/days"
import { scheduleCollection } from "@/money/collections"
import { monthlyTotals, standingOf, totalAging } from "@/money/receivables"
import { amountFor, dueDays, nextDueOn, postingKeyOf } from "@/money/schedules"
import { isCurrent } from "@/people/people"
import { addressLine } from "@/places/address"
import type { ProjectTypeDefinition } from "@/projectTypes/projectType"
import { reviewSchema } from "@/review/reviewModel"
import { getRequestContext } from "@/session/requestContext.server"
import { applicationKeys } from "@/storage/keys"
import { getJson } from "@/storage/objects"
import { getBucket } from "@/storage/storage.server"
import { detailsOf } from "@/violations/violation"
import { recentActivity, type ActivityEvent } from "./activity"
import type { DashboardApplication } from "./dashboardData"
import type { DashboardOverview, HomeOverview, UnitBalance, UpcomingItem, ViolationItem } from "./overview"

/** The next rulebook, as the HOA management dashboard shows it: being built, or a draft with work left to review. */
export type NextRulebook =
  | { status: "building" }
  | { status: "draft"; createdAt: string; rulesToReview: number; openQuestions: number }

/** The rulebook that's coming, for administrators; null when there's none, and always for homeowners. */
export const getNextRulebook = createServerFn({ method: "GET" }).handler(async (): Promise<NextRulebook | null> => {
  const context = await getRequestContext()
  if (context.role !== "administrator") {
    return null
  }
  const db = getDb()
  const [building, draft] = await Promise.all([
    getRulebookByStatus(db, context.organization.id, "building"),
    getRulebookByStatus(db, context.organization.id, "draft")
  ])
  if (building) {
    return { status: "building" }
  }
  if (!draft) {
    return null
  }
  const content = await getRulebookContent(db, context.organization.id, draft.id)
  return {
    status: "draft",
    createdAt: draft.createdAt,
    rulesToReview: content?.rules.filter((rule) => rule.review.status === "proposed").length ?? 0,
    openQuestions: content?.questions.filter((question) => question.answer === null).length ?? 0
  }
})

/**
 * What the latest review asks the homeowner to add, while the application is theirs to change. A review the bucket
 * can't serve or parse is logged and read as asking for nothing, so the dashboard still lists the application.
 */
async function missingInformation(organizationId: string, application: Application): Promise<string[]> {
  if (!application.reviewId || !["reviewed", "information-requested"].includes(application.status)) {
    return []
  }
  try {
    const key = applicationKeys(organizationId, application.id).review(application.reviewId)
    const review = await getJson(getBucket(), key, reviewSchema)
    return review?.missingInformation.map((item) => item.text) ?? []
  } catch (error) {
    console.error(error)
    return []
  }
}

/**
 * Whether a newer rulebook changes the rules a draft's latest review applied (application-review.md, Rulebook
 * versions): read only for a reviewed draft never submitted whose review read an earlier rulebook than the published one.
 */
async function rulesChanged(
  organizationId: string,
  application: Application,
  latest: ReviewSummary | undefined,
  publishedId: string | null,
  definition: ProjectTypeDefinition | null
) {
  if (
    application.status !== "reviewed" ||
    application.submittedReviewId !== null ||
    !latest ||
    publishedId === null ||
    latest.rulebookId === publishedId
  ) {
    return false
  }
  try {
    const review = await getJson(
      getBucket(),
      applicationKeys(organizationId, application.id).review(latest.id),
      reviewSchema
    )
    return (await rulesUpdateOf(organizationId, application, review, definition)) !== null
  } catch (error) {
    console.error(error)
    return false
  }
}

/** A homeowner's own applications, or every application for the committee, as the dashboards list them. */
export const listDashboardApplications = createServerFn({ method: "GET" }).handler(
  async (): Promise<DashboardApplication[]> => {
    const context = await getRequestContext()
    const db = getDb()
    const [applications, types, published] = await Promise.all([
      listApplications(
        db,
        context.organization.id,
        context.role === "administrator" ? {} : { createdBy: context.user.id }
      ),
      listProjectTypes(db, context.organization.id),
      getPublishedRulesFile(db, context.organization.id)
    ])
    // A draft is its homeowner's own: the committee sees an application once it's submitted.
    const viewer = { userId: context.user.id, isCommittee: context.role === "administrator" }
    return Promise.all(
      applications
        .filter((application) => canSee(application, viewer))
        .map(async (application) => {
          const type = types.find((item) => item.id === application.projectTypeId)
          const [reviews, missing] = await Promise.all([
            listReviewSummaries(db, context.organization.id, application.id),
            missingInformation(context.organization.id, application)
          ])
          const changed = await rulesChanged(
            context.organization.id,
            application,
            reviews[0],
            published?.rulebookId ?? null,
            type?.definition ?? null
          )
          return {
            id: application.id,
            description: application.description,
            status: application.status,
            createdAt: application.createdAt,
            updatedAt: application.updatedAt,
            revisedAt: application.revisedAt,
            submittedAt: application.submittedAt,
            projectTypeLabel: application.projectTypeId === null ? null : (type?.label ?? null),
            decision: application.decision
              ? {
                  outcome: application.decision.outcome,
                  note: application.decision.note,
                  decidedAt: application.decision.decidedAt
                }
              : null,
            reviews: reviews.map(({ recommendation, createdAt }) => ({ recommendation, createdAt })),
            missingInformation: missing,
            rulesChanged: changed
          }
        })
    )
  }
)

/**
 * What happened lately, newest first, each naming the person who did it: across the HOA's areas for the committee; for a
 * homeowner, what happened to their applications and the rules.
 */
export const listRecentActivity = createServerFn({ method: "GET" }).handler(async (): Promise<ActivityEvent[]> => {
  const context = await getRequestContext()
  const isCommittee = context.role === "administrator"
  const isBoard = doesWorkOf(context.role, context.committees, "board")
  const db = getDb()
  const [applications, projectTypes, rulebooks, documents, names, ledgers, violations] = await Promise.all([
    listApplications(db, context.organization.id, isCommittee ? {} : { createdBy: context.user.id }),
    listProjectTypeAdditions(db, context.organization.id),
    listPublishedRulebooks(db, context.organization.id),
    isCommittee ? listUploadHistory(db, context.organization.id) : [],
    accountNames(db, context.organization.id),
    getOrganizationLedgers(db, context.organization.id),
    visibleViolations(context)
  ])
  const { roll, today } = violations
  const viewer = { userId: context.user.id, isCommittee }
  const labels = new Map(projectTypes.map((type) => [type.id, type.label]))
  const unitLabels = new Map(roll.units.map((unit) => [unit.id, unit.label]))
  // The board sees every unit's money; an owner, their own units'.
  const owned = new Set(ownedUnits(roll, context.person?.id, today))
  const entries = [...ledgers.entries()]
    .filter(([unitId]) => isBoard || owned.has(unitId))
    .flatMap(([, ledger]) => ledger.entries)
  const scheduled = Map.groupBy(
    entries.filter((entry) => entry.kind === "charge" && entry.sourceType === "schedule" && entry.dueOn !== null),
    (entry) => `${entry.sourceId}:${entry.dueOn}`
  )
  return recentActivity(
    {
      applications: applications
        .filter((application) => canSee(application, viewer))
        .map((application) => ({
          ...application,
          projectTypeLabel: application.projectTypeId ? (labels.get(application.projectTypeId) ?? null) : null
        })),
      projectTypes: isCommittee ? projectTypes : [],
      rulebooks,
      documents,
      payments: entries
        .filter((entry) => entry.kind === "payment")
        .map((entry) => ({
          id: entry.id,
          unit: { id: entry.unitId, label: unitLabels.get(entry.unitId) ?? "A unit no longer on the roll" },
          amountCents: -entry.amountCents,
          method: entry.category,
          createdBy: entry.createdBy,
          createdAt: entry.createdAt
        })),
      duesPostings: isBoard
        ? [...scheduled].flatMap(([id, charges]) => {
            const [first] = charges
            return first?.dueOn
              ? [
                  {
                    id,
                    name: first.description,
                    dueOn: first.dueOn,
                    units: charges.length,
                    totalCents: charges.reduce((total, charge) => total + charge.amountCents, 0),
                    at: charges.reduce((latest, charge) => (charge.createdAt > latest ? charge.createdAt : latest), "")
                  }
                ]
              : []
          })
        : [],
      violationSteps: violations.records.flatMap((record) =>
        record.events.flatMap((event) => {
          const kind = stepKinds.find((value) => value === event.kind)
          // An owner hears of a violation by its notice, not when it's reported.
          if (!kind || (kind === "reported" && !isBoard)) {
            return []
          }
          const sanction = detailsOf(event, "sanction")
          return [
            {
              id: event.id,
              kind,
              violation: {
                id: record.violation.id,
                title: record.violation.title,
                unit: unitLabels.get(record.violation.unitId) ?? "A unit no longer on the roll"
              },
              sanction: sanction?.type ?? null,
              amountCents: sanction?.amountCents ?? null,
              recordedBy: event.recordedBy,
              at: event.createdAt
            }
          ]
        })
      ),
      nameOf: (userId) => names.get(userId) ?? userId
    },
    activityCount
  )
})

/** The violation steps recent activity lists. */
const stepKinds = ["reported", "notice", "sanction", "cured"] as const

/** How many events recent activity reads, enough for either dashboard. */
const activityCount = 12

/** How many units the board's list of the largest balances shows. */
const largestCount = 5

/** How far ahead the dashboards look for due days, the end of a time to cure, and hearings. */
const upcomingDays = 45

/**
 * Money, dues and violations for the dashboards (docs/dashboard.md): the whole association's for the board, and the
 * reader's own homes' for anyone who owns one.
 */
export const getDashboardOverview = createServerFn({ method: "GET" }).handler(async (): Promise<DashboardOverview> => {
  const context = await getRequestContext()
  const organizationId = context.organization.id
  const db = getDb()
  const isBoard = doesWorkOf(context.role, context.committees, "board")
  const [roll, ledgers, schedules, violations] = await Promise.all([
    getRoll(db, organizationId),
    getOrganizationLedgers(db, organizationId),
    listSchedules(db, organizationId),
    violationSummaries(context)
  ])
  const { today } = violations
  const horizon = addDays(today, upcomingDays)
  const ledgerOf = (unitId: string) => ledgers.get(unitId) ?? { entries: [], allocations: [] }
  const ownersOf = (unitId: string) =>
    roll.links
      .filter((link) => link.unitId === unitId && link.relation === "owner" && isCurrent(link, today))
      .flatMap((link) => roll.people.find((person) => person.id === link.personId)?.name ?? [])
  const active = schedules.filter((schedule) => schedule.status === "active")
  const unitsText = roll.units.length === 1 ? "1 unit" : `${roll.units.length} units`

  const standings = roll.units.map((unit) => ({ unit, standing: standingOf(ledgerOf(unit.id), today) }))
  const money = isBoard
    ? {
        owedCents: standings.reduce((total, { standing }) => total + Math.max(0, standing.balanceCents), 0),
        owingUnits: standings.filter(({ standing }) => standing.balanceCents > 0).length,
        unitCount: roll.units.length,
        pastDueCents: standings.reduce((total, { standing }) => total + standing.pastDueCents, 0),
        pastDueUnits: standings.filter(({ standing }) => standing.pastDueCents > 0).length,
        pastDueSince:
          standings
            .flatMap(({ standing }) => standing.pastDueSince ?? [])
            .toSorted()
            .at(0) ?? null,
        aging: totalAging(standings.map(({ standing }) => standing)),
        months: monthlyTotals(ledgers.values(), today),
        largest: standings
          .filter(({ standing }) => standing.balanceCents > 0)
          .toSorted((a, b) => b.standing.balanceCents - a.standing.balanceCents)
          .slice(0, largestCount)
          .map(({ unit, standing }): UnitBalance => ({
            unitId: unit.id,
            label: unit.label,
            owners: ownersOf(unit.id),
            balanceCents: standing.balanceCents,
            pastDueCents: standing.pastDueCents,
            pastDueSince: standing.pastDueSince
          }))
      }
    : null

  const nextDue = active
    .flatMap((schedule) => {
      const dueOn = nextDueOn(schedule, today)
      const totalCents = roll.units.reduce((total, unit) => total + amountFor(schedule, unit.id), 0)
      return dueOn ? [{ name: schedule.name, dueOn, totalCents }] : []
    })
    .toSorted((a, b) => a.dueOn.localeCompare(b.dueOn))
  const latest = active
    .flatMap((schedule) => {
      const collection = scheduleCollection(ledgers.values(), schedule.id, today)
      return collection && collection.dueOn <= today ? [{ ...collection, name: schedule.name }] : []
    })
    .toSorted((a, b) => b.dueOn.localeCompare(a.dueOn))
  const dues = isBoard ? { next: nextDue.at(0) ?? null, latest: latest.at(0) ?? null } : null

  const violationItems = violations.items
    .filter((item) => item.status === "open")
    .map((item): ViolationItem => ({
      id: item.id,
      title: item.title,
      unit: item.unit,
      observedOn: item.observedOn,
      nextStep: item.nextStep,
      hearingOn:
        item.record.events
          .flatMap((event) => detailsOf(event, "hearing-set")?.hearingOn ?? [])
          .filter((day) => day >= today)
          .toSorted()
          .at(0) ?? null
    }))

  const owned = ownedUnits(roll, context.person?.id, today)
  const homes = roll.units
    .filter((unit) => owned.includes(unit.id))
    .map((unit): HomeOverview => {
      const ledger = ledgerOf(unit.id)
      const standing = standingOf(ledger, today)
      const next = active
        .flatMap((schedule) => {
          const [dueOn] = dueDays(schedule, today > schedule.postsFrom ? today : schedule.postsFrom, "9999-12-31", 1)
          if (!dueOn) {
            return []
          }
          const key = postingKeyOf(schedule.id, unit.id, dueOn)
          const isPosted = ledger.entries.some((entry) => entry.postingKey === key)
          return [{ name: schedule.name, dueOn, amountCents: amountFor(schedule, unit.id), isPosted }]
        })
        .toSorted((a, b) => a.dueOn.localeCompare(b.dueOn))
        .at(0)
      const payment = ledger.entries
        .filter((entry) => entry.kind === "payment")
        .toSorted((a, b) => b.postedOn.localeCompare(a.postedOn) || b.createdAt.localeCompare(a.createdAt))
        .at(0)
      return {
        unitId: unit.id,
        label: unit.label,
        address: addressLine(unit) || null,
        balanceCents: standing.balanceCents,
        pastDueCents: standing.pastDueCents,
        pastDueSince: standing.pastDueSince,
        next: next ?? null,
        lastPayment: payment ? { postedOn: payment.postedOn, amountCents: -payment.amountCents } : null
      }
    })

  const duesAhead: UpcomingItem[] = isBoard
    ? active.flatMap((schedule) =>
        dueDays(schedule, today, horizon, 3).map((dueOn): UpcomingItem => ({
          id: `dues:${schedule.id}:${dueOn}`,
          kind: "dues",
          unitId: null,
          on: dueOn,
          subject: `${schedule.name} due`,
          note: `From ${unitsText}.`
        }))
      )
    : homes.flatMap((home): UpcomingItem[] =>
        home.next && home.next.dueOn <= horizon
          ? [
              {
                id: `dues:${home.unitId}:${home.next.dueOn}`,
                kind: "dues",
                unitId: home.unitId,
                on: home.next.dueOn,
                subject: `${home.next.name} due`,
                note: [
                  homes.length > 1 ? `For ${home.label}.` : null,
                  home.next.isPosted ? "It's on your ledger." : "It posts to your ledger 30 days before."
                ]
                  .filter(Boolean)
                  .join(" ")
              }
            ]
          : []
      )
  const where = (item: ViolationItem) => (isBoard ? `${item.title}, at ${item.unit}.` : item.title)
  const violationsAhead = violationItems.flatMap((item): UpcomingItem[] => {
    const cureEnds = item.nextStep?.on ?? null
    return [
      ...(cureEnds !== null && cureEnds >= today && cureEnds <= horizon
        ? [
            {
              id: `cure:${item.id}`,
              kind: "violation" as const,
              violationId: item.id,
              on: cureEnds,
              subject: isBoard ? "Time to cure ends" : "Correct it by then",
              note: where(item)
            }
          ]
        : []),
      ...(item.hearingOn !== null && item.hearingOn <= horizon
        ? [
            {
              id: `hearing:${item.id}`,
              kind: "violation" as const,
              violationId: item.id,
              on: item.hearingOn,
              subject: "Hearing",
              note: where(item)
            }
          ]
        : [])
    ]
  })
  const upcoming = [...duesAhead, ...violationsAhead].toSorted((a, b) => a.on.localeCompare(b.on))

  return { today, isBoard, money, dues, violations: violationItems, homes, upcoming }
})
