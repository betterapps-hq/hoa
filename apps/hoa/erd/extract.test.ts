import { describe, expect, it } from "vitest"
import { readSchemaSource, referenceOf, type SnapshotTable } from "./extract.ts"

const source = `
// A section: it belongs to no table.

export const things = sqliteTable("things", {
  id: text("id").primaryKey(),
  // What it holds.
  body: json<Record<string, number>>("body_json").notNull(),
  seenAt: authDate("seen_at"),
  isOn: integer("is_on", { mode: "boolean" })
})

// Parts of a thing.
export const parts = sqliteTable(
  "parts",
  {
    thingId: text("thing_id").notNull(),
    madeAt: timestamp("made_at")
  }
)
`

const table = (name: string, columns: string[], foreignKeys: SnapshotTable["foreignKeys"] = {}): SnapshotTable => ({
  name,
  columns: Object.fromEntries(
    columns.map((column) => [column, { name: column, type: "text", primaryKey: column === "id", notNull: true }])
  ),
  indexes: {},
  foreignKeys,
  compositePrimaryKeys: {}
})

describe("readSchemaSource", () => {
  const read = readSchemaSource(source)

  it("keeps a comment right above a table or a column, and not a section's", () => {
    expect(read.get("things")?.comment).toBeNull()
    expect(read.get("parts")?.comment).toBe("Parts of a thing.")
    expect(read.get("things")?.columns.get("body_json")?.comment).toBe("What it holds.")
    expect(read.get("things")?.columns.get("id")?.comment).toBeNull()
  })

  it("tells what a column holds from how schema.ts declares it", () => {
    const things = read.get("things")?.columns
    expect(things?.get("body_json")?.holds).toBe("json")
    expect(things?.get("seen_at")?.holds).toBe("epoch ms")
    expect(things?.get("is_on")?.holds).toBe("boolean")
    expect(read.get("parts")?.columns.get("made_at")?.holds).toBe("iso time")
  })
})

describe("referenceOf", () => {
  const users = table("users", ["id"])
  const people = table("people", ["id", "user_id", "created_by"], {
    people_user: { columnsFrom: ["user_id"], tableTo: "users", columnsTo: ["id"], onDelete: "set null" }
  })
  const sections = table("sections", ["id", "parent_id", "document_id", "person_id", "widget_id", "subject_id"])
  const documents = table("governing_documents", ["id"])
  const tables = new Map([users, people, sections, documents].map((t) => [t.name, t]))

  it("reads a foreign key as one D1 checks", () => {
    expect(referenceOf(people, "user_id", tables)).toEqual({
      table: "users",
      column: "id",
      enforced: true,
      onDelete: "set null"
    })
  })

  it("follows the naming convention, irregular plurals and the annotations", () => {
    const byName = (target: string) => ({ table: target, column: "id", enforced: false, onDelete: null })
    expect(referenceOf(people, "created_by", tables)).toEqual(byName("users"))
    expect(referenceOf(sections, "person_id", tables)).toEqual(byName("people"))
    expect(referenceOf(sections, "document_id", tables)).toEqual(byName("governing_documents"))
    expect(referenceOf(sections, "parent_id", tables)).toEqual(byName("sections"))
    expect(referenceOf(sections, "subject_id", tables)).toBeNull()
  })

  it("flags an id column it can't place", () => {
    expect(referenceOf(sections, "widget_id", tables)).toBe("unresolved")
    expect(referenceOf(sections, "id", tables)).toBeNull()
  })
})
