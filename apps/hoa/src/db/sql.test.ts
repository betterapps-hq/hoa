import { describe, expect, it } from "vitest"
import { provisions, rulebookQuestions } from "./schema"
import { insertSql, sqlLiteral } from "./sql"

describe("sqlLiteral", () => {
  it("writes values as SQL, doubling quotes in text", () => {
    expect(sqlLiteral(null)).toBe("NULL")
    expect(sqlLiteral(undefined)).toBe("NULL")
    expect(sqlLiteral(1.5)).toBe("1.5")
    expect(sqlLiteral(true)).toBe("1")
    expect(sqlLiteral(false)).toBe("0")
    expect(sqlLiteral("owner's lot; then")).toBe("'owner''s lot; then'")
  })

  it("refuses values SQL can't hold", () => {
    expect(() => sqlLiteral(Number.NaN)).toThrow("NaN can't be written as an SQL value")
    expect(() => sqlLiteral({})).toThrow("can't be written")
  })
})

describe("insertSql", () => {
  it("writes a row with JSON columns as JSON text, leaving out unset columns", () => {
    expect(
      insertSql(rulebookQuestions, {
        organizationId: "h",
        rulebookId: "r",
        id: "q1",
        question: { question: "Which reading?" }
      })
    ).toBe(
      `INSERT INTO "rulebook_questions" ("organization_id", "rulebook_id", "id", "question_json") VALUES ('h', 'r', 'q1', '{"question":"Which reading?"}');`
    )
  })

  it("replaces a conflicting row when asked, and writes nulls", () => {
    expect(
      insertSql(
        provisions,
        {
          organizationId: "h",
          documentId: "d",
          key: "d:1",
          label: "1",
          parentKey: null,
          kind: "section",
          ordinal: 0,
          provision: {}
        },
        "replace"
      )
    ).toBe(
      `INSERT OR REPLACE INTO "provisions" ("organization_id", "document_id", "key", "label", "parent_key", "kind", "ordinal", "provision_json") VALUES ('h', 'd', 'd:1', '1', NULL, 'section', 0, '{}');`
    )
  })
})
