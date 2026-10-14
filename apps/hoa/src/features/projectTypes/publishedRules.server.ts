import { applicationRequestType } from "@/applications/application"
import { getDb } from "@/db/client.server"
import { listProjectTypes, updateProjectType } from "@/db/projectTypeRepository"
import { getPublishedRulesFile, getRulesFileOf } from "@/db/rulebookContentRepository"
import { buildDefinition } from "@/projectTypes/build"
import type { ProjectType } from "@/projectTypes/projectType"
import { carriedForward } from "@/projectTypes/updates"
import { readRulesFile } from "@/rulebook/assemble"
import type * as T from "@/schema/types"
import { getBucket } from "@/storage/storage.server"

// Project types and the rulebook they're built against (application-review.md, Project types): the published one, and
// the earlier one a type out of date still rests on until its updates are reviewed.

/**
 * The published rulebook's id, rules file and publish date; null before the organization publishes one. Written out
 * rather than read off `publishedRulebook`: a `typeof` of a server-only helper keeps it, and its storage import, in the
 * browser bundle, which the build refuses.
 */
export type Published = { id: string; publishedAt: string | null; rulesFile: T.RulesFile } | null

/** Reads the published rulebook, or null before the organization publishes one. */
export async function publishedRulebook(organizationId: string): Promise<Published> {
  const published = await getPublishedRulesFile(getDb(), organizationId)
  return published
    ? {
        id: published.rulebookId,
        publishedAt: published.publishedAt,
        rulesFile: await readRulesFile(getBucket(), published)
      }
    : null
}

/** Whether a type was built against an earlier rulebook than the published one. */
export const isOutdatedType = (type: ProjectType, published: Published) =>
  published !== null && type.rulebookId !== published.id

/**
 * The rules file a type's form is kept against: the rulebook it was built with while it's out of date (so editing it
 * doesn't take the published rulebook's changes unreviewed), else the published one. Null when there's neither, or
 * when the type is out of date and its own rulebook can't be read: never the published one in its place, which would
 * drop every question and document its rules don't test without the administrator reviewing it.
 */
export async function ownRulesFile(organizationId: string, type: ProjectType, published: Published) {
  if (!isOutdatedType(type, published) || type.rulebookId === null) {
    return published ? { id: published.id, rulesFile: published.rulesFile } : null
  }
  const file = await getRulesFileOf(getDb(), organizationId, type.rulebookId)
  return file ? { id: type.rulebookId, rulesFile: await readRulesFile(getBucket(), file) } : null
}

/**
 * Moves every type whose form the published rulebook doesn't change onto it, so only a type with something to review
 * shows as out of date. Run once a rulebook is published.
 */
export async function carryForwardProjectTypes(organizationId: string, now: string) {
  const [types, published] = await Promise.all([
    listProjectTypes(getDb(), organizationId),
    publishedRulebook(organizationId)
  ])
  if (!published) {
    return
  }
  const on = now.slice(0, 10)
  const provisions = new Set(published.rulesFile.provisions.map((provision) => provision.key))
  for (const type of types.filter((item) => isOutdatedType(item, published))) {
    const own = await ownRulesFile(organizationId, type, published)
    const build = (rulesFile: T.RulesFile) =>
      buildDefinition(rulesFile, applicationRequestType, type.definition.subjects, on)
    const definition = carriedForward(
      type.definition,
      own && own.id !== published.id ? build(own.rulesFile) : null,
      build(published.rulesFile),
      provisions
    )
    if (definition) {
      await updateProjectType(getDb(), organizationId, type.id, {
        definition,
        rulebookId: published.id,
        updatedAt: now
      })
    }
  }
}
