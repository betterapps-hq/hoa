// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/tests/testDatabase"
import { getDefaultHoa, getHoa } from "./hoaRepository"
import { hoas } from "./schema"

describe("hoaRepository", () => {
  let database: TestDatabase

  beforeEach(async () => {
    database = await createTestDatabase()
  })

  afterEach(async () => {
    await database.dispose()
  })

  it("explains how to seed when no HOA exists", async () => {
    await expect(getDefaultHoa(database.db)).rejects.toThrow("No HOA exists yet. Run the seed script")
  })

  it("returns the first HOA with its settings, filling in defaults", async () => {
    await database.db.insert(hoas).values([
      { id: "second", name: "Second", slug: "second", settings: {}, createdAt: "2026-10-09T00:00:00.000Z" },
      {
        id: "first",
        name: "First",
        slug: "first",
        settings: { curableOutcome: "reject" },
        createdAt: "2026-10-08T00:00:00.000Z"
      }
    ])

    expect(await getDefaultHoa(database.db)).toEqual({
      id: "first",
      name: "First",
      slug: "first",
      settings: { curableOutcome: "reject", retentionDays: 365, draftRetentionDays: 30, unitSystem: "imperial" }
    })
    expect((await getHoa(database.db, "second"))?.settings.curableOutcome).toBe("approve-with-conditions")
    expect(await getHoa(database.db, "missing")).toBeNull()
  })
})
