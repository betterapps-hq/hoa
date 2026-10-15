import { and, desc, eq, isNotNull, max } from "drizzle-orm"
import { rulebookSchema } from "@/rules/rule"
import type { Database } from "./database"
import { rulebooks } from "./schema"

type Rulebook = ReturnType<typeof rulebookSchema.parse>

function toRulebook(row: typeof rulebooks.$inferSelect): Rulebook {
  return rulebookSchema.parse(row)
}

export function insertRulebook(db: Database, rulebook: Rulebook) {
  return db.insert(rulebooks).values(rulebook)
}

export async function getRulebook(db: Database, organizationId: string, id: string) {
  const row = await db
    .select()
    .from(rulebooks)
    .where(and(eq(rulebooks.organizationId, organizationId), eq(rulebooks.id, id)))
    .get()
  return row ? toRulebook(row) : null
}

/** The HOA's rulebook in a status; at most one is building, one is a draft and one is published. */
export async function getRulebookByStatus(
  db: Database,
  organizationId: string,
  status: "building" | "draft" | "published"
) {
  const row = await db
    .select()
    .from(rulebooks)
    .where(and(eq(rulebooks.organizationId, organizationId), eq(rulebooks.status, status)))
    .orderBy(desc(rulebooks.createdAt))
    .limit(1)
    .get()
  return row ? toRulebook(row) : null
}

/** Every rulebook that was published, the one in force and those it superseded, for what happened to the rulebook. */
export function listPublishedRulebooks(db: Database, organizationId: string) {
  return db
    .select({
      id: rulebooks.id,
      version: rulebooks.version,
      publishedBy: rulebooks.publishedBy,
      publishedAt: rulebooks.publishedAt
    })
    .from(rulebooks)
    .where(and(eq(rulebooks.organizationId, organizationId), isNotNull(rulebooks.publishedAt)))
}

export async function failRulebook(db: Database, organizationId: string, id: string, error: Rulebook["error"]) {
  await db
    .update(rulebooks)
    .set({ status: "failed", error })
    .where(and(eq(rulebooks.organizationId, organizationId), eq(rulebooks.id, id), eq(rulebooks.status, "building")))
}

/** Marks a building rulebook cancelled (its build was stopped); false when it wasn't building any more. */
export async function cancelRulebook(db: Database, organizationId: string, id: string) {
  const result = await db
    .update(rulebooks)
    .set({ status: "cancelled" })
    .where(and(eq(rulebooks.organizationId, organizationId), eq(rulebooks.id, id), eq(rulebooks.status, "building")))
    .returning({ id: rulebooks.id })
  return result.length > 0
}

/** Publishes a draft as the next version, superseding the published one, in one batch. */
export async function publishRulebook(
  db: Database,
  organizationId: string,
  input: { rulebookId: string; userId: string; now: string }
) {
  const latest = await db
    .select({ version: max(rulebooks.version) })
    .from(rulebooks)
    .where(eq(rulebooks.organizationId, organizationId))
    .get()
  const version = (latest?.version ?? 0) + 1
  await db.batch([
    db
      .update(rulebooks)
      .set({ status: "superseded" })
      .where(and(eq(rulebooks.organizationId, organizationId), eq(rulebooks.status, "published"))),
    db
      .update(rulebooks)
      .set({ status: "published", version, publishedBy: input.userId, publishedAt: input.now })
      .where(
        and(
          eq(rulebooks.organizationId, organizationId),
          eq(rulebooks.id, input.rulebookId),
          eq(rulebooks.status, "draft")
        )
      )
  ])
  return version
}
