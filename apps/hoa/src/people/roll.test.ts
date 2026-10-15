import { describe, expect, it } from "vitest"
import { addressValues } from "@/places/address"
import { accessOf, emailKey, isCurrent, peopleOfAccount, personInputSchema, roleOf, type Person } from "./people"
import {
  accountOf,
  committeeViews,
  isLastAdministrator,
  personRows,
  resignationProblem,
  unitRows,
  type RollData
} from "./roll"

const person = (id: string, fields: Partial<Person> = {}): Person => ({
  id,
  organizationId: "hoa",
  name: id,
  email: `${id}@example.com`,
  phone: null,
  mailingAddress: null,
  userId: null,
  ...fields
})

const noAddress = { street: null, unitNumber: null, city: null, state: null, postalCode: null, place: null }

const roll: RollData = {
  people: [person("pat"), person("sam", { userId: "user-sam" }), person("lee")],
  units: [
    { id: "u1", organizationId: "hoa", label: "12 Lakeview Drive", ...noAddress },
    { id: "u2", organizationId: "hoa", label: "14 Lakeview Drive", ...noAddress }
  ],
  links: [
    { id: "l1", unitId: "u1", personId: "lee", relation: "tenant", startedOn: "2024-01-01", endedOn: null },
    { id: "l2", unitId: "u1", personId: "pat", relation: "owner", startedOn: "2019-06-01", endedOn: null },
    // Sold: the old owner's ended the day the new owner's started.
    { id: "l3", unitId: "u2", personId: "pat", relation: "owner", startedOn: "2010-01-01", endedOn: "2026-05-01" },
    { id: "l4", unitId: "u2", personId: "sam", relation: "owner", startedOn: "2026-05-01", endedOn: null }
  ],
  committees: [
    { id: "acc", organizationId: "hoa", name: "Architectural Control Committee", kind: "architectural" },
    { id: "board", organizationId: "hoa", name: "Board of Directors", kind: "board" }
  ],
  members: [
    {
      id: "m1",
      committeeId: "acc",
      personId: "pat",
      role: "member",
      office: null,
      startedOn: null,
      termEndsOn: null,
      endedOn: null
    },
    {
      id: "m2",
      committeeId: "acc",
      personId: "lee",
      role: "chair",
      office: null,
      startedOn: null,
      termEndsOn: null,
      endedOn: null
    },
    {
      id: "m3",
      committeeId: "board",
      personId: "sam",
      role: "chair",
      office: "President",
      startedOn: "2025-01-01",
      termEndsOn: null,
      endedOn: "2026-01-01"
    }
  ],
  memberships: [{ userId: "user-sam", access: "administrator" }],
  invitations: []
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

  it("keeps a committee's past terms, the latest first, and its terms that start later", () => {
    const term = (id: string, personId: string, startedOn: string, endedOn: string | null) => ({
      id,
      committeeId: "board",
      personId,
      role: "member" as const,
      office: null,
      startedOn,
      termEndsOn: null,
      endedOn
    })
    const history: RollData = {
      ...roll,
      members: [
        term("first", "pat", "2020-01-01", "2022-01-01"),
        term("second", "pat", "2022-01-01", "2024-01-01"),
        term("now", "sam", "2024-01-01", "2027-01-01"),
        term("next", "sam", "2027-01-01", null),
        term("new", "lee", "2026-11-01", null)
      ]
    }
    const [board] = committeeViews(history, "2026-10-13")
    expect(board?.pastTerms.map(({ member }) => member.id)).toEqual(["second", "first"])
    expect(board?.members.map(({ member, nextTerm }) => [member.id, nextTerm?.id ?? null])).toEqual([
      ["now", "next"],
      ["new", null]
    ])
  })

  it("says whether someone has joined, with their membership's access or the one they're invited with", () => {
    const accounts = {
      memberships: [{ userId: "user-a", access: "administrator" as const }],
      invitations: [{ email: "b@example.com", access: "administrator" as const }]
    }
    expect(accountOf(accounts, person("a", { userId: "user-a" }))).toEqual({
      status: "joined",
      access: "administrator"
    })
    expect(accountOf(accounts, person("b"))).toEqual({ status: "invited", access: "administrator" })
    expect(accountOf(accounts, person("c"))).toEqual({ status: "not-invited", access: "member" })
    expect(accountOf(accounts, person("d", { email: null }))).toEqual({ status: "no-email", access: "member" })
  })

  it("keeps at least one administrator", () => {
    expect(isLastAdministrator(roll, "sam")).toBe(true)
    expect(isLastAdministrator(roll, "pat")).toBe(false)
    const another = { userId: "user-kim", access: "administrator" as const }
    expect(isLastAdministrator({ ...roll, memberships: [...roll.memberships, another] }, "sam")).toBe(false)
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
    expect(roleOf("administrator")).toBe("administrator")
    expect(roleOf("member")).toBe("homeowner")
  })

  it("reads the organization plugin's owner and admin roles as administrators", () => {
    expect([accessOf("owner"), accessOf("admin"), accessOf("member"), accessOf(null)]).toEqual([
      "administrator",
      "administrator",
      "member",
      "member"
    ])
  })

  it("keeps emails trimmed and lowercased, and blank as none", () => {
    expect(emailKey(" Pat@Example.COM ")).toBe("pat@example.com")
    expect(emailKey("  ")).toBeNull()
    expect(
      personInputSchema.parse({
        name: " Pat ",
        email: "",
        phone: " ",
        mailingAddress: addressValues(null),
        access: "member"
      })
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

describe("resignationProblem", () => {
  const seat = (id: string, committeeId: string, endedOn: string | null = null) => ({
    id,
    committeeId,
    personId: id,
    role: "member" as const,
    office: null,
    startedOn: null,
    termEndsOn: null,
    endedOn
  })
  const committees = roll.committees

  it("keeps the board from being left with nobody on it", () => {
    const president = seat("sam", "board")
    expect(resignationProblem({ committees, members: [president] }, president, "2026-10-14")).toMatch(/last member/)
  })

  it("lets a board member go while someone else stays on that day", () => {
    const [sam, lee] = [seat("sam", "board"), seat("lee", "board", "2026-12-01")]
    expect(resignationProblem({ committees, members: [sam, lee] }, sam, "2026-10-14")).toBeNull()
    expect(resignationProblem({ committees, members: [sam, lee] }, sam, "2026-12-01")).toMatch(/last member/)
  })

  it("lets any other committee empty", () => {
    const pat = seat("pat", "acc")
    expect(resignationProblem({ committees, members: [pat] }, pat, "2026-10-14")).toBeNull()
  })
})
