// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/tests/testDatabase"
import {
  claimUnit,
  committeesInView,
  endCommitteeMember,
  endUnitLink,
  getRoll,
  insertCommittee,
  insertCommitteeMember,
  insertPerson,
  insertUnit,
  insertUnitLink,
  removeCommittee,
  removeUnit
} from "./peopleRepository"

// The rules the database enforces: a home is claimed by one statement, so only a home with no owner can be; and whose
// committee work someone does follows the terms they sit on.

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

describe("committeesInView", () => {
  let database: TestDatabase

  beforeEach(async () => {
    database = await createTestDatabase()
  })

  afterEach(async () => {
    await database.dispose()
  })

  async function setUp() {
    const { db } = database
    const fields = { email: null, phone: null, mailingAddress: null }
    const [member, administrator] = await Promise.all([
      insertPerson(db, hoaId, { name: "Jordan Avery", ...fields, access: "member" }, now),
      insertPerson(db, hoaId, { name: "Casey Lin", ...fields, access: "administrator" }, now)
    ])
    const board = await insertCommittee(db, hoaId, { name: "Board of Directors", kind: "board" }, now)
    const architectural = await insertCommittee(db, hoaId, { name: "Design Review", kind: "architectural" }, now)
    const seat = (committeeId: string, startedOn: string | null) =>
      insertCommitteeMember(
        db,
        hoaId,
        { committeeId, personId: member.id, role: "member", office: null, startedOn },
        now
      )
    return { db, member, administrator, board, architectural, seat }
  }

  const namesIn = async (db: TestDatabase["db"], person: Parameters<typeof committeesInView>[1]) =>
    (await committeesInView(db, person, today)).map((committee) => committee.name)

  it("gives someone the committees they sit on today", async () => {
    const { db, member, board, architectural, seat } = await setUp()
    await seat(board.id, "2025-01-01")
    await seat(architectural.id, "2026-11-01")
    expect(await namesIn(db, member)).toEqual(["Board of Directors"])
  })

  it("drops a committee once their term ends or it's dissolved", async () => {
    const { db, member, board, architectural, seat } = await setUp()
    await Promise.all([seat(board.id, null), seat(architectural.id, null)])
    const { members } = await getRoll(db, hoaId)
    const boardSeat = members.find((candidate) => candidate.committeeId === board.id)
    await endCommitteeMember(db, hoaId, boardSeat?.id ?? "", today)
    await removeCommittee(db, hoaId, architectural.id, now)
    expect(await namesIn(db, member)).toEqual([])
  })

  it("gives an administrator every committee, seated or not", async () => {
    const { db, administrator } = await setUp()
    expect((await namesIn(db, administrator)).toSorted()).toEqual(["Board of Directors", "Design Review"])
  })
})
