import { and, asc, count, eq } from "drizzle-orm"
import { projectTypeSchema, type ProjectType } from "@/projectTypes/projectType"
import type { Database } from "./database"
import { applications, projectTypes } from "./schema"

/** The organization's project types, by label; archived ones too, for the administrator. */
export async function listProjectTypes(db: Database, organizationId: string): Promise<ProjectType[]> {
  const rows = await db
    .select()
    .from(projectTypes)
    .where(eq(projectTypes.organizationId, organizationId))
    .orderBy(asc(projectTypes.label))
  return rows.map((row) => projectTypeSchema.parse(row))
}

export async function getProjectType(db: Database, organizationId: string, id: string): Promise<ProjectType | null> {
  const row = await db
    .select()
    .from(projectTypes)
    .where(and(eq(projectTypes.organizationId, organizationId), eq(projectTypes.id, id)))
    .get()
  return row ? projectTypeSchema.parse(row) : null
}

/** Adds a project type, keeping who added it for the committee's recent activity. */
export async function insertProjectType(
  db: Database,
  input: Pick<ProjectType, "organizationId" | "label" | "description" | "rulebookId" | "definition"> & {
    createdBy: string
    now: string
  }
): Promise<ProjectType> {
  const type: ProjectType = projectTypeSchema.parse({
    id: crypto.randomUUID(),
    organizationId: input.organizationId,
    label: input.label,
    description: input.description,
    status: "active",
    rulebookId: input.rulebookId,
    definition: input.definition,
    createdAt: input.now,
    updatedAt: input.now
  })
  await db.insert(projectTypes).values({ ...type, createdBy: input.createdBy })
  return type
}

/** When each project type was added and who added it, archived ones too, for what happened to the project types. */
export function listProjectTypeAdditions(db: Database, organizationId: string) {
  return db
    .select({
      id: projectTypes.id,
      label: projectTypes.label,
      createdBy: projectTypes.createdBy,
      createdAt: projectTypes.createdAt
    })
    .from(projectTypes)
    .where(eq(projectTypes.organizationId, organizationId))
}

export async function updateProjectType(
  db: Database,
  organizationId: string,
  id: string,
  patch: Partial<Pick<ProjectType, "label" | "description" | "status" | "rulebookId" | "definition">> & {
    updatedAt: string
  }
) {
  await db
    .update(projectTypes)
    .set(patch)
    .where(and(eq(projectTypes.organizationId, organizationId), eq(projectTypes.id, id)))
}

/** How many applications chose the project type; one that any did can be archived but not deleted. */
export async function countApplicationsOfType(db: Database, organizationId: string, id: string) {
  const row = await db
    .select({ total: count() })
    .from(applications)
    .where(and(eq(applications.organizationId, organizationId), eq(applications.projectTypeId, id)))
    .get()
  return row?.total ?? 0
}

export async function deleteProjectType(db: Database, organizationId: string, id: string) {
  await db.delete(projectTypes).where(and(eq(projectTypes.organizationId, organizationId), eq(projectTypes.id, id)))
}
