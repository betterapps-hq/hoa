import { describe, expect, it } from "vitest"
import { parseStatement, renderStatement } from "./statement"
import { createVocabulary } from "./vocabulary"
import { termDraft } from "./zod"

describe("parseStatement", () => {
  it("splits text and term links, singular and plural", () => {
    expect(parseStatement("Each {{fence-run}} on a {{lot}} boundary, or {{lot:plural}}.")).toEqual([
      { type: "text", text: "Each " },
      { type: "term", key: "fence-run", plural: false },
      { type: "text", text: " on a " },
      { type: "term", key: "lot", plural: false },
      { type: "text", text: " boundary, or " },
      { type: "term", key: "lot", plural: true },
      { type: "text", text: "." }
    ])
  })

  it("reads property keys and links at the edges", () => {
    expect(parseStatement("{{fence-run.height}}")).toEqual([{ type: "term", key: "fence-run.height", plural: false }])
  })

  it("leaves anything that isn't a term link as text", () => {
    const text = "Braces {{Not A Key}}, {{lot:other}} and {single} stay."
    expect(parseStatement(text)).toEqual([{ type: "text", text }])
    expect(parseStatement("")).toEqual([])
  })
})

describe("renderStatement", () => {
  const vocabulary = createVocabulary([
    termDraft.parse({
      key: "lot",
      organizationId: "org-sample",
      kind: "thing",
      nature: "object",
      labels: [{ text: "Unit", role: "preferred" }]
    }),
    termDraft.parse({
      key: "fence-run",
      organizationId: "org-sample",
      kind: "thing",
      nature: "object",
      labels: [
        { text: "run of fence", role: "alternative" },
        { text: "fence run", role: "preferred", plural: "fence runs" }
      ]
    }),
    termDraft.parse({
      key: "fence-run.property",
      organizationId: "org-sample",
      kind: "property",
      of: "fence-run",
      valueType: { type: "text" },
      ifUnstated: "unknown",
      labels: [{ text: "property", role: "preferred" }]
    })
  ])

  it("shows the organization's preferred labels, and plurals", () => {
    expect(
      renderStatement("Each {{fence-run}} on a {{lot}}; {{fence-run:plural}} on {{lot:plural}}", vocabulary.label)
    ).toBe("Each fence run on a Unit; fence runs on Units")
  })

  it("forms plurals the label doesn't give, and shows an unknown key as itself", () => {
    expect(
      renderStatement("{{fence-run.property:plural}}, {{owner:plural}}, {{fence-run.missing}}", vocabulary.label)
    ).toBe("properties, owners, fence-run.missing")
    expect(renderStatement("{{approval-status:plural}}, {{guest:plural}}", vocabulary.label)).toBe(
      "approval statuses, guests"
    )
  })
})
