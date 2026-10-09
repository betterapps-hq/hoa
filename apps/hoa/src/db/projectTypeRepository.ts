import { and, asc, count, eq } from "drizzle-orm"
import { projectTypeSchema, type ProjectType } from "@/projectTypes/projectType"
import type { Database } from "./database"
import { applications, projectTypes } from "./schema"

/** The organization's project types, by label; retired ones too, for the administrator. */
export async function listProjectTypes(db: Database, hoaId: string): Promise<ProjectType[]> {
  const rows = await db
    .select()
    .from(projectTypes)
    .where(eq(projectTypes.hoaId, hoaId))
    .orderBy(asc(projectTypes.label))
  return rows.map((row) => projectTypeSchema.parse(row))
}

export async function getProjectType(db: Database, hoaId: string, id: string): Promise<ProjectType | null> {
  const row = await db
    .select()
    .from(projectTypes)
    .where(and(eq(projectTypes.hoaId, hoaId), eq(projectTypes.id, id)))
    .get()
  return row ? projectTypeSchema.parse(row) : null
}

export async function insertProjectType(
  db: Database,
  input: Pick<ProjectType, "hoaId" | "label" | "description" | "rulebookId" | "definition"> & { now: string }
): Promise<ProjectType> {
  const type: ProjectType = projectTypeSchema.parse({
    id: crypto.randomUUID(),
    hoaId: input.hoaId,
    label: input.label,
    description: input.description,
    status: "active",
    rulebookId: input.rulebookId,
    definition: input.definition,
    createdAt: input.now,
    updatedAt: input.now
  })
  await db.insert(projectTypes).values(type)
  return type
}

export async function updateProjectType(
  db: Database,
  hoaId: string,
  id: string,
  patch: Partial<Pick<ProjectType, "label" | "description" | "status" | "rulebookId" | "definition">> & {
    updatedAt: string
  }
) {
  await db
    .update(projectTypes)
    .set(patch)
    .where(and(eq(projectTypes.hoaId, hoaId), eq(projectTypes.id, id)))
}

/** How many applications chose the project type; one that any did can be retired but not deleted. */
export async function countApplicationsOfType(db: Database, hoaId: string, id: string) {
  const row = await db
    .select({ total: count() })
    .from(applications)
    .where(and(eq(applications.hoaId, hoaId), eq(applications.projectTypeId, id)))
    .get()
  return row?.total ?? 0
}

export async function deleteProjectType(db: Database, hoaId: string, id: string) {
  await db.delete(projectTypes).where(and(eq(projectTypes.hoaId, hoaId), eq(projectTypes.id, id)))
}
