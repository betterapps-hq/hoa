// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/tests/testDatabase"
import {
  claimUnit,
  endUnitLink,
  getRoll,
  insertPerson,
  insertUnit,
  insertUnitLink,
  removeUnit
} from "./peopleRepository"

// The rule the database enforces: a home is claimed by one statement, so only a home with no owner can be.

const hoaId = "demo-hoa"
const now = "2026-10-14T00:00:00.000Z"
const today = "2026-10-14"

describe("claimUnit", () => {
  let database: TestDatabase

  beforeEach(async () => {
    database = await createTestDatabase()
  })

  afterEach(async () => {
    await database.dispose()
  })

  async function setUp() {
    const { db } = database
    const person = (name: string) =>
      insertPerson(db, hoaId, { name, email: null, phone: null, mailingAddress: null, access: "member" }, now)
    const [jordan, casey] = await Promise.all([person("Jordan Avery"), person("Casey Lin")])
    const unit = await insertUnit(db, hoaId, { label: "12 Birch Lane", address: null, lot: null }, now)
    return { db, jordan, casey, unit }
  }

  const ownersOf = async (db: TestDatabase["db"], unitId: string) =>
    (await getRoll(db, hoaId)).links.filter((link) => link.unitId === unitId && link.relation === "owner")

  it("makes the first to claim a home with no owner its owner, and refuses the next", async () => {
    const { db, jordan, casey, unit } = await setUp()
    expect(await claimUnit(db, hoaId, { unitId: unit.id, personId: jordan.id }, today, now)).toBe(true)
    expect(await claimUnit(db, hoaId, { unitId: unit.id, personId: casey.id }, today, now)).toBe(false)
    expect((await ownersOf(db, unit.id)).map((link) => link.personId)).toEqual([jordan.id])
  })

  it("lets a home be claimed once its owner's ownership has ended", async () => {
    const { db, jordan, casey, unit } = await setUp()
    await insertUnitLink(db, hoaId, { unitId: unit.id, personId: jordan.id, relation: "owner", startedOn: null }, now)
    const [owned] = await ownersOf(db, unit.id)
    await endUnitLink(db, hoaId, owned?.id ?? "", today)
    expect(await claimUnit(db, hoaId, { unitId: unit.id, personId: casey.id }, today, now)).toBe(true)
  })

  it("ignores a resident or tenant, who doesn't own it", async () => {
    const { db, jordan, casey, unit } = await setUp()
    await insertUnitLink(db, hoaId, { unitId: unit.id, personId: jordan.id, relation: "tenant", startedOn: null }, now)
    expect(await claimUnit(db, hoaId, { unitId: unit.id, personId: casey.id }, today, now)).toBe(true)
  })

  it("refuses a home taken off the roll or in another association", async () => {
    const { db, jordan, unit } = await setUp()
    expect(await claimUnit(db, "other-hoa", { unitId: unit.id, personId: jordan.id }, today, now)).toBe(false)
    await removeUnit(db, hoaId, unit.id, now)
    expect(await claimUnit(db, hoaId, { unitId: unit.id, personId: jordan.id }, today, now)).toBe(false)
  })
})
