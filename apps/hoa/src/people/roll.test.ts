import { describe, expect, it } from "vitest"
import { emailKey, isCurrent, peopleOfAccount, personInputSchema, roleOf, type Person } from "./people"
import { committeeViews, isLastAdministrator, personRows, accountStatusOf, unitRows, type RollData } from "./roll"

const person = (id: string, fields: Partial<Person> = {}): Person => ({
  id,
  hoaId: "hoa",
  name: id,
  email: `${id}@example.com`,
  phone: null,
  mailingAddress: null,
  access: "member",
  userId: null,
  invitedAt: null,
  ...fields
})

const roll: RollData = {
  people: [person("pat"), person("sam", { access: "administrator", userId: "user-sam" }), person("lee")],
  units: [
    { id: "u1", hoaId: "hoa", label: "12 Lakeview Drive", address: null, lot: "Lot 12" },
    { id: "u2", hoaId: "hoa", label: "14 Lakeview Drive", address: null, lot: null }
  ],
  links: [
    { id: "l1", unitId: "u1", personId: "lee", relation: "tenant", startedOn: "2024-01-01", endedOn: null },
    { id: "l2", unitId: "u1", personId: "pat", relation: "owner", startedOn: "2019-06-01", endedOn: null },
    // Sold: the old owner's ended the day the new owner's started.
    { id: "l3", unitId: "u2", personId: "pat", relation: "owner", startedOn: "2010-01-01", endedOn: "2026-05-01" },
    { id: "l4", unitId: "u2", personId: "sam", relation: "owner", startedOn: "2026-05-01", endedOn: null }
  ],
  committees: [
    { id: "acc", hoaId: "hoa", name: "Architectural Control Committee", kind: "architectural" },
    { id: "board", hoaId: "hoa", name: "Board of Directors", kind: "board" }
  ],
  members: [
    {
      id: "m1",
      committeeId: "acc",
      personId: "pat",
      role: "member",
      office: null,
      startedOn: null,
      endedOn: null
    },
    {
      id: "m2",
      committeeId: "acc",
      personId: "lee",
      role: "chair",
      office: null,
      startedOn: null,
      endedOn: null
    },
    {
      id: "m3",
      committeeId: "board",
      personId: "sam",
      role: "chair",
      office: "President",
      startedOn: "2025-01-01",
      endedOn: "2026-01-01"
    }
  ]
}

describe("the roll", () => {
  it("lists what each person owns, rents and sits on today, owners first", () => {
    const rows = personRows(roll, "2026-10-13")
    const pat = rows.find((row) => row.person.id === "pat")
    expect(pat?.units.map(({ unit, link }) => [unit.label, link.relation])).toEqual([["12 Lakeview Drive", "owner"]])
    expect(pat?.committees.map(({ committee }) => committee.name)).toEqual(["Architectural Control Committee"])
    // Sam's board term ended.
    expect(rows.find((row) => row.person.id === "sam")?.committees).toEqual([])
  })

  it("lists each unit's people on a day, so a sale moves its owner", () => {
    const owners = (day: string) =>
      unitRows(roll, day)
        .find((row) => row.unit.id === "u2")
        ?.people.map(({ person }) => person.id)
    expect(owners("2026-04-30")).toEqual(["pat"])
    expect(owners("2026-05-01")).toEqual(["sam"])
    expect(
      unitRows(roll, "2026-10-13")
        .find((row) => row.unit.id === "u1")
        ?.people.map(({ person, link }) => [person.id, link.relation])
    ).toEqual([
      ["pat", "owner"],
      ["lee", "tenant"]
    ])
  })

  it("puts the board first, and each committee's chair first", () => {
    const views = committeeViews(roll, "2026-10-13")
    expect(views.map((view) => view.committee.id)).toEqual(["board", "acc"])
    expect(views[1]?.members.map(({ person }) => person.id)).toEqual(["lee", "pat"])
  })

  it("says whether someone can sign in yet", () => {
    expect(accountStatusOf(person("a", { userId: "user-a" }))).toBe("joined")
    expect(accountStatusOf(person("a", { invitedAt: "2026-10-13T00:00:00.000Z" }))).toBe("invited")
    expect(accountStatusOf(person("a"))).toBe("not-invited")
    expect(accountStatusOf(person("a", { email: null }))).toBe("no-email")
  })

  it("keeps at least one administrator", () => {
    expect(isLastAdministrator(roll.people, "sam")).toBe(true)
    expect(isLastAdministrator(roll.people, "pat")).toBe(false)
    expect(isLastAdministrator([...roll.people, person("kim", { access: "administrator" })], "sam")).toBe(false)
  })
})

describe("accounts and people", () => {
  const account = { id: "user-1", email: "Pat@Example.com ", emailVerified: true }

  it("finds the people an account is by its proven email, and never takes over someone else's", () => {
    const people = [
      { id: "a", email: "pat@example.com", userId: null },
      { id: "b", email: "pat@example.com", userId: "user-2" },
      { id: "c", email: "other@example.com", userId: "user-1" },
      { id: "d", email: null, userId: null }
    ]
    expect(peopleOfAccount(people, account).map((row) => row.id)).toEqual(["a", "c"])
    expect(peopleOfAccount(people, { ...account, emailVerified: false }).map((row) => row.id)).toEqual(["c"])
  })

  it("gives administrators the administrator workspace and everyone else the homeowner's", () => {
    expect(roleOf({ access: "administrator" })).toBe("administrator")
    expect(roleOf({ access: "member" })).toBe("homeowner")
  })

  it("keeps emails trimmed and lowercased, and blank as none", () => {
    expect(emailKey(" Pat@Example.COM ")).toBe("pat@example.com")
    expect(emailKey("  ")).toBeNull()
    expect(
      personInputSchema.parse({ name: " Pat ", email: "", phone: " ", mailingAddress: "", access: "member" })
    ).toEqual({ name: "Pat", email: null, phone: null, mailingAddress: null, access: "member" })
  })

  it("counts a link from its first day to the day before it ends", () => {
    const link = { startedOn: "2026-05-01", endedOn: "2026-06-01" }
    expect([isCurrent(link, "2026-04-30"), isCurrent(link, "2026-05-01"), isCurrent(link, "2026-06-01")]).toEqual([
      false,
      true,
      false
    ])
  })
})
