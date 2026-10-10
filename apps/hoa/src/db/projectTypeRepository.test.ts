import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { ProjectTypeDefinition } from "@/projectTypes/projectType"
import { createTestDatabase, type TestDatabase } from "@/tests/testDatabase"
import { createApplication, getApplication } from "./applicationRepository"
import {
  countApplicationsOfType,
  deleteProjectType,
  getProjectType,
  insertProjectType,
  listProjectTypes,
  updateProjectType
} from "./projectTypeRepository"

const hoaId = "demo-hoa"
const now = "2026-10-09T00:00:00.000Z"
const definition: ProjectTypeDefinition = { subjects: [], groups: [], documents: [], formDocuments: [], unasked: [] }

describe("projectTypeRepository", () => {
  let database: TestDatabase

  beforeEach(async () => {
    database = await createTestDatabase()
  })

  afterEach(async () => {
    await database.dispose()
  })

  it("adds, lists by label, edits, archives and deletes an organization's project types", async () => {
    const { db } = database
    const later = await insertProjectType(db, {
      hoaId,
      label: "Second",
      description: null,
      rulebookId: "rb",
      definition,
      now
    })
    const first = await insertProjectType(db, {
      hoaId,
      label: "First",
      description: "What it covers",
      rulebookId: "rb",
      definition,
      now
    })
    await insertProjectType(db, {
      hoaId: "other",
      label: "Elsewhere",
      description: null,
      rulebookId: null,
      definition,
      now
    })
    expect((await listProjectTypes(db, hoaId)).map((type) => type.label)).toEqual(["First", "Second"])
    expect(first.status).toBe("active")

    await updateProjectType(db, hoaId, later.id, { label: "Renamed", status: "archived", updatedAt: now })
    expect(await getProjectType(db, hoaId, later.id)).toMatchObject({ label: "Renamed", status: "archived" })
    expect(await getProjectType(db, "other", later.id)).toBeNull()

    await deleteProjectType(db, hoaId, later.id)
    expect(await getProjectType(db, hoaId, later.id)).toBeNull()
  })

  it("counts the applications that chose a type and keeps their answers", async () => {
    const { db } = database
    const type = await insertProjectType(db, {
      hoaId,
      label: "A type",
      description: null,
      rulebookId: "rb",
      definition,
      now
    })
    expect(await countApplicationsOfType(db, hoaId, type.id)).toBe(0)
    const application = await createApplication(db, {
      hoaId,
      projectTypeId: type.id,
      answers: { work: [{ "work.replaces-existing": true }] },
      description: null,
      createdBy: "demo-homeowner",
      now,
      deleteAfter: now
    })
    expect(await countApplicationsOfType(db, hoaId, type.id)).toBe(1)
    expect((await getApplication(db, hoaId, application.id))?.answers).toEqual({
      work: [{ "work.replaces-existing": true }]
    })
  })
})
