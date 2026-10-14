import { createServerFn } from "@tanstack/react-start"
import { getRequestUrl } from "@tanstack/react-start/server"
import { match } from "ts-pattern"
import { z } from "zod"
import { sendEmail } from "@/auth/email.server"
import { getDb } from "@/db/client.server"
import { getRoll } from "@/db/peopleRepository"
import {
  addViolationEvent,
  getViolationRecords,
  insertViolation,
  insertViolationPhoto,
  listViolationIds,
  type NewEvent
} from "@/db/violationRepository"
import { env } from "@/env.server"
import { relationLabels } from "@/people/people"
import { unitRows } from "@/people/roll"
import { addressLine } from "@/places/address"
import { getRequestContext, requireWorkOf, type RequestContext } from "@/session/requestContext.server"
import { violationKeys } from "@/storage/keys"
import { getBucket } from "@/storage/storage.server"
import { validateUpload } from "@/storage/uploadRules"
import { violationNoticeEmail } from "@/violations/notice"
import {
  factValueSchema,
  noticeDeliveries,
  reportInputSchema,
  stepDates,
  type ViolationPerson,
  type ViolationStatus
} from "@/violations/violation"
import {
  answers,
  breakableRules,
  evaluationOf,
  factInputOf,
  loadViolation,
  mainCitation,
  managesViolations,
  ownedUnits,
  publishedRules,
  respondsTo,
  rulesFiles,
  ruleViewOf,
  todayIn,
  violationView,
  type LoadedViolation
} from "./violations.server"

// Violations (docs/design/violations.md): the board reports them and takes them through the documents' steps; the
// people who answer for one see it once its notice goes out, and reply or ask for a hearing.

export type ViolationListItem = {
  id: string
  title: string
  unit: string
  observedOn: string
  status: "open" | "closed" | "dismissed"
  rules: string[]
  /** What happens next, as the requester would act on it; null once it's over. */
  nextStep: string | null
}

const dayFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" })
const day = (value: string) => dayFormat.format(new Date(`${value}T00:00:00Z`))

/** What the board, or the owner, does next with an open violation. */
function nextStepOf(
  evaluation: Awaited<ReturnType<typeof evaluationOf>>,
  steps: ReturnType<typeof stepDates>,
  forBoard: boolean
): string | null {
  const running = evaluation.cures.filter((cure) => cure.status === "running" && cure.endsOn)
  const cureEnds = running.map((cure) => cure.endsOn ?? "").toSorted()[0]
  if (!forBoard) {
    if (steps.curedOn) {
      return null
    }
    return cureEnds ? `Correct it by ${day(cureEnds)}` : "Correct it"
  }
  if (steps.curedOn) {
    return `Cured ${day(steps.curedOn)}`
  }
  if (!steps.noticeDeliveredOn) {
    return "Send the notice"
  }
  if (steps.hearingRequestedOn && !steps.hearingHeldOn) {
    return "Hold the hearing"
  }
  if (cureEnds) {
    return `Time to cure ends ${day(cureEnds)}`
  }
  const money = ["fine", "charge", "self-help"]
  return evaluation.sanctions.some((sanction) => sanction.outcome === "available" && money.includes(sanction.type))
    ? "A fine can be imposed"
    : null
}

/** The violations the requester may see: every one for the board, an owner's own once noticed. */
export const listViolations = createServerFn({ method: "GET" }).handler(async () => {
  const context = await getRequestContext()
  const db = getDb()
  const organizationId = context.organization.id
  const canManage = managesViolations(context)
  const [roll, published] = await Promise.all([getRoll(db, organizationId), publishedRules(organizationId)])
  const today = todayIn(published?.rulesFile ?? null)
  const ids = await listViolationIds(
    db,
    organizationId,
    canManage ? {} : { unitIds: ownedUnits(roll, context.person?.id, today), personId: context.person?.id ?? "" }
  )
  const records = (await getViolationRecords(db, organizationId, ids)).filter(
    (record) => canManage || respondsTo(record, roll, context.person?.id, today)
  )
  const files = rulesFiles(organizationId)
  const units = new Map(roll.units.map((unit) => [unit.id, unit.label]))
  const items = await Promise.all(
    records.map(async (record): Promise<ViolationListItem> => {
      const rulesFile = await files(record.violation.rulebookId)
      const titles = new Map(rulesFile.rules.map((rule) => [rule.key, rule.title]))
      const loaded: LoadedViolation = { record, roll, rulesFile, today, canManage, canRespond: !canManage }
      const nextStep =
        record.violation.status === "open"
          ? nextStepOf(await evaluationOf(loaded, organizationId), stepDates(record.events), canManage)
          : null
      return {
        id: record.violation.id,
        title: record.violation.title,
        unit: units.get(record.violation.unitId) ?? "A unit no longer on the roll",
        observedOn: record.violation.observedOn,
        status: record.violation.status,
        rules: record.ruleKeys.map((key) => titles.get(key) ?? key),
        nextStep
      }
    })
  )
  return { items, canReport: canManage, hasRulebook: published !== null }
})

/** What reporting a violation picks from: the units with who lives there, and the rules a violation can break. */
export const getReportOptions = createServerFn({ method: "GET" }).handler(async () => {
  const context = await requireWorkOf("board")
  const published = await publishedRules(context.organization.id)
  const today = todayIn(published?.rulesFile ?? null)
  const roll = await getRoll(getDb(), context.organization.id)
  return {
    today,
    units: unitRows(roll, today).map(({ unit, people }) => ({
      id: unit.id,
      label: unit.label,
      detail: addressLine(unit) || null,
      // Who lives there, for naming who did it.
      residents: people
        .filter(({ link }) => link.relation !== "owner")
        .map(({ person, link }) => ({
          personId: person.id,
          name: person.name,
          relation: relationLabels[link.relation],
          party: link.relation === "tenant" ? ("tenant" as const) : ("occupant" as const)
        })),
      owners: people.filter(({ link }) => link.relation === "owner").map(({ person }) => person.name)
    })),
    rules: published
      ? breakableRules(published.rulesFile).map((rule) => ({
          key: rule.key,
          title: rule.title,
          statement: ruleViewOf(published.rulesFile, rule).statement,
          citation: mainCitation(rule)
        }))
      : []
  }
})

/** Reports a violation on the published rulebook: its unit's owners answer for it, with whoever did it. */
export const reportViolation = createServerFn({ method: "POST" })
  .validator((data: unknown) => reportInputSchema.parse(data))
  .handler(async ({ data }) => {
    const context = await requireWorkOf("board")
    const db = getDb()
    const organizationId = context.organization.id
    const published = await publishedRules(organizationId)
    if (!published) {
      throw new Error("Publish the rulebook first: a violation cites the rules it breaks.")
    }
    const today = todayIn(published.rulesFile)
    if (data.observedOn > today) {
      throw new Error("The day it was seen can't be after today.")
    }
    const breakable = new Set(breakableRules(published.rulesFile).map((rule) => rule.key))
    const unknown = data.ruleKeys.find((key) => !breakable.has(key))
    if (unknown) {
      throw new Error(`${unknown} isn't a rule a violation can break.`)
    }
    const roll = await getRoll(db, organizationId)
    const row = unitRows(roll, today).find(({ unit }) => unit.id === data.unitId)
    if (!row) {
      throw new Error("That unit isn't on the roll.")
    }
    const owners: ViolationPerson[] = row.people
      .filter(({ link }) => link.relation === "owner")
      .map(({ person }) => ({ personId: person.id, party: "owner" }))
    const actor = data.actor
    if (actor && !row.people.some(({ person }) => person.id === actor.personId)) {
      throw new Error("Whoever did it should live at the unit. Pick someone on its roll, or leave it empty.")
    }
    const people = [...owners, ...(actor && !owners.some((owner) => owner.personId === actor.personId) ? [actor] : [])]
    const id = await insertViolation(db, {
      organizationId,
      unitId: data.unitId,
      title: data.title,
      description: data.description ?? null,
      observedOn: data.observedOn,
      rulebookId: published.id,
      reportedBy: context.user.id,
      ruleKeys: [...new Set(data.ruleKeys)],
      people,
      now: new Date().toISOString()
    })
    return { id }
  })

/** A violation the board works on, or an error saying why it can't be. */
async function managed(context: RequestContext, violationId: string, isOpen = true) {
  const loaded = await loadViolation(context, violationId)
  if (!loaded?.canManage) {
    throw new Error("That violation isn't one you can change.")
  }
  if (isOpen && loaded.record.violation.status !== "open") {
    throw new Error("Reopen it first: it's closed.")
  }
  return loaded
}

/** Adds a photo to a violation, as the board takes it. */
export const uploadViolationPhoto = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const file = data instanceof FormData ? data.get("file") : null
    const violationId = data instanceof FormData ? data.get("violationId") : null
    if (!(file instanceof File) || typeof violationId !== "string") {
      throw new Error("Expected a photo.")
    }
    const validation = validateUpload(file, "photo")
    if (!validation.isValid) {
      throw new Error(validation.message)
    }
    return { file, violationId, mediaType: validation.upload.mediaType }
  })
  .handler(async ({ data }) => {
    const context = await requireWorkOf("board")
    await managed(context, data.violationId, false)
    const id = crypto.randomUUID()
    const organizationId = context.organization.id
    await getBucket().put(violationKeys(organizationId, data.violationId).photo(id), await data.file.arrayBuffer(), {
      httpMetadata: { contentType: data.mediaType }
    })
    await insertViolationPhoto(getDb(), {
      id,
      organizationId,
      violationId: data.violationId,
      fileName: data.file.name,
      mediaType: data.mediaType,
      sizeBytes: data.file.size,
      createdBy: context.user.id,
      createdAt: new Date().toISOString()
    })
  })

/** A violation's page. */
export const getViolationView = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ violationId: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const context = await getRequestContext()
    const loaded = await loadViolation(context, data.violationId)
    if (!loaded) {
      throw new Error("That violation isn't one you can see.")
    }
    return violationView(context, loaded)
  })

/** Emails the notice to everyone who answers for it, and records it delivered today. */
export const sendViolationNotice = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ violationId: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const context = await requireWorkOf("board")
    const loaded = await managed(context, data.violationId)
    const { record, roll, rulesFile, today } = loaded
    const people = new Map(roll.people.map((person) => [person.id, person]))
    const recipients = record.people.flatMap((named) => {
      const person = people.get(named.personId)
      return person?.email ? [person] : []
    })
    if (recipients.length === 0) {
      throw new Error("Nobody who answers for it has an email on the roll. Deliver it another way, then record it.")
    }
    const { cures } = await evaluationOf(loaded, context.organization.id, { noticeDeliveredOn: today })
    const unknown = [...new Set(cures.filter((cure) => cure.status === "unknown").flatMap((cure) => cure.needs))]
    if (unknown.length > 0) {
      throw new Error(`The notice gives the time to correct it, which needs ${unknown.join(" and ")} first.`)
    }
    const cureEndsOn =
      cures
        .filter((cure) => cure.endsOn && cure.status !== "none")
        .map((cure) => cure.endsOn ?? "")
        .toSorted()[0] ?? null
    const rules = new Map(rulesFile.rules.map((rule) => [rule.key, rule]))
    const noticed = record.ruleKeys.flatMap((key) => {
      const rule = rules.get(key)
      return rule
        ? [{ title: rule.title, citation: mainCitation(rule), statement: ruleViewOf(rulesFile, rule).statement }]
        : []
    })
    const unit = roll.units.find((candidate) => candidate.id === record.violation.unitId)
    const origin = env.BETTER_AUTH_URL ?? new URL(getRequestUrl()).origin
    for (const person of recipients) {
      await sendEmail(
        violationNoticeEmail({
          to: person.email ?? "",
          name: person.name,
          association: context.organization.name,
          unit: unit?.label ?? "your unit",
          title: record.violation.title,
          description: record.violation.description,
          observedOn: record.violation.observedOn,
          rules: noticed,
          cureEndsOn,
          link: `${origin}/violations/${record.violation.id}`
        })
      )
    }
    await addViolationEvent(getDb(), {
      organizationId: context.organization.id,
      violationId: record.violation.id,
      event: {
        kind: "notice",
        occurredOn: today,
        note: null,
        details: { delivery: "email", to: recipients.map((person) => person.name) }
      },
      recordedBy: context.user.id,
      now: new Date().toISOString()
    })
  })

const optionalNote = z
  .string()
  .trim()
  .max(4000)
  .transform((value) => value || null)

const stepSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("notice"),
    occurredOn: z.iso.date(),
    delivery: z.enum(noticeDeliveries),
    note: optionalNote
  }),
  z.object({ kind: z.literal("hearing-requested"), occurredOn: z.iso.date(), note: optionalNote }),
  z.object({
    kind: z.literal("hearing-set"),
    occurredOn: z.iso.date(),
    hearingOn: z.iso.date("Give the hearing's day."),
    place: optionalNote,
    note: optionalNote
  }),
  z.object({ kind: z.literal("hearing-held"), occurredOn: z.iso.date(), note: optionalNote }),
  z.object({ kind: z.literal("cured"), occurredOn: z.iso.date(), note: optionalNote }),
  z.object({
    kind: z.literal("note"),
    occurredOn: z.iso.date(),
    note: z.string().trim().min(1, "Write the note.").max(4000)
  }),
  z.object({
    kind: z.literal("dismissed"),
    occurredOn: z.iso.date(),
    note: z.string().trim().min(1, "Say why it's dismissed.").max(4000)
  }),
  z.object({ kind: z.literal("closed"), occurredOn: z.iso.date(), note: optionalNote }),
  z.object({ kind: z.literal("reopened"), occurredOn: z.iso.date(), note: optionalNote })
])
export type ViolationStep = z.input<typeof stepSchema>

/** The steps that open or close a violation. */
const statusAfter: Partial<Record<ViolationStep["kind"], ViolationStatus>> = {
  dismissed: "dismissed",
  closed: "closed",
  reopened: "open"
}

/** Records a step the board took or learned of, on the day it happened. */
export const recordViolationStep = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ violationId: z.string().min(1), step: stepSchema }).parse(data))
  .handler(async ({ data }) => {
    const context = await requireWorkOf("board")
    const { step } = data
    const reopening = step.kind === "reopened"
    const loaded = await managed(context, data.violationId, !reopening && step.kind !== "note")
    const { record, today } = loaded
    if (reopening && record.violation.status === "open") {
      throw new Error("It's open already.")
    }
    if (step.occurredOn > today) {
      throw new Error("That day hasn't come yet. Record it once it's happened.")
    }
    if (step.occurredOn < record.violation.observedOn) {
      throw new Error("That's before the violation was seen.")
    }
    const details = await (async (): Promise<NewEvent["details"]> => {
      if (step.kind === "notice") {
        return { delivery: step.delivery, to: [] }
      }
      if (step.kind === "hearing-requested") {
        return { personId: null }
      }
      if (step.kind === "hearing-set") {
        return { hearingOn: step.hearingOn, place: step.place }
      }
      if (step.kind === "cured") {
        // Cured in time when every rule it breaks was cured within its time to cure; no time to cure, no answer.
        const { cures } = await evaluationOf(loaded, context.organization.id, { curedOn: step.occurredOn })
        const timed = cures.filter((cure) => cure.status !== "none")
        return { inTime: timed.length === 0 ? null : timed.every((cure) => cure.status === "cured") }
      }
      return null
    })()
    const status = statusAfter[step.kind]
    await addViolationEvent(getDb(), {
      organizationId: context.organization.id,
      violationId: record.violation.id,
      event: { kind: step.kind, occurredOn: step.occurredOn, note: step.note, details },
      recordedBy: context.user.id,
      ...(status ? { status } : {}),
      now: new Date().toISOString()
    })
  })

/** Imposes a sanction the documents make available, for an amount they allow. */
export const imposeSanction = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        violationId: z.string().min(1),
        ruleKey: z.string().min(1),
        enforced: z.string().min(1),
        amountCents: z.number().int().positive("Give an amount above $0.").nullable(),
        note: optionalNote
      })
      .parse(data)
  )
  .handler(async ({ data }) => {
    const context = await requireWorkOf("board")
    const loaded = await managed(context, data.violationId)
    const view = await violationView(context, loaded)
    const sanction = view.sanctions.find(
      (candidate) => candidate.ruleKey === data.ruleKey && candidate.enforced === data.enforced
    )
    if (sanction?.outcome !== "available") {
      throw new Error("The documents don't allow that sanction for this violation now.")
    }
    const amountCents = checkedAmount(sanction.amount, sanction.imposedCents, data.amountCents)
    await addViolationEvent(getDb(), {
      organizationId: context.organization.id,
      violationId: data.violationId,
      event: {
        kind: "sanction",
        occurredOn: loaded.today,
        note: data.note,
        details: { ruleKey: sanction.ruleKey, enforced: sanction.enforced, type: sanction.type, amountCents }
      },
      recordedBy: context.user.id,
      now: new Date().toISOString()
    })
  })

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`

/** The amount to impose: within what the schedule, its cap and any limit allow, less what's been imposed already. */
export function checkedAmount(
  amount: Awaited<ReturnType<typeof violationView>>["sanctions"][number]["amount"],
  imposedCents: number,
  requested: number | null
): number | null {
  if (amount.type === "none") {
    return null
  }
  if (requested === null) {
    throw new Error("Give the amount.")
  }
  const most = match(amount)
    .with({ type: "fixed" }, ({ total }) => total - imposedCents)
    .with({ type: "set-by-imposer" }, ({ maxEach, maxTotal }) =>
      Math.min(maxEach ?? Infinity, (maxTotal ?? Infinity) - imposedCents)
    )
    .otherwise(() => Infinity)
  if (most <= 0) {
    throw new Error("Everything the documents allow for it has been imposed already.")
  }
  if (requested > most) {
    throw new Error(`The documents allow at most ${dollars(most)} more.`)
  }
  return requested
}

/** States a fact the documents ask about the violation, such as the day the board set to cure by; null takes it back. */
export const stateViolationFact = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({ violationId: z.string().min(1), property: z.string().min(1), value: factValueSchema.nullable() })
      .parse(data)
  )
  .handler(async ({ data }) => {
    const context = await requireWorkOf("board")
    const loaded = await managed(context, data.violationId)
    const input = factInputOf(loaded.rulesFile, data.property)
    if (!input) {
      throw new Error("That isn't something the documents ask about a violation.")
    }
    if (data.value && !answers(input, data.value)) {
      throw new Error("That answer doesn't fit the question.")
    }
    await addViolationEvent(getDb(), {
      organizationId: context.organization.id,
      violationId: data.violationId,
      event: {
        kind: "fact",
        occurredOn: loaded.today,
        note: null,
        details: { property: data.property, value: data.value }
      },
      recordedBy: context.user.id,
      now: new Date().toISOString()
    })
  })

/** An owner's reply, or their request for a hearing, on a violation they answer for. */
export const respondToViolation = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        violationId: z.string().min(1),
        kind: z.enum(["reply", "hearing-requested"]),
        note: optionalNote
      })
      .parse(data)
  )
  .handler(async ({ data }) => {
    const context = await getRequestContext()
    const loaded = await loadViolation(context, data.violationId)
    if (!loaded?.canRespond) {
      throw new Error("That violation isn't one you can reply to.")
    }
    if (loaded.record.violation.status !== "open") {
      throw new Error("It's closed.")
    }
    if (data.kind === "reply" && !data.note) {
      throw new Error("Write your reply.")
    }
    if (data.kind === "hearing-requested" && stepDates(loaded.record.events).hearingRequestedOn) {
      throw new Error("A hearing has been asked for already.")
    }
    await addViolationEvent(getDb(), {
      organizationId: context.organization.id,
      violationId: data.violationId,
      event: {
        kind: data.kind,
        occurredOn: loaded.today,
        note: data.note,
        details: { personId: context.person?.id ?? null }
      },
      recordedBy: context.user.id,
      now: new Date().toISOString()
    })
  })
