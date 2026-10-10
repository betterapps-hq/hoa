import { describe, expect, it } from "vitest"
import type { Provision } from "@/schema/types"
import { termDraft } from "@/schema/zod"
import { provision as makeProvision } from "@/tests/encodingDrafts"
import { sampleRulesFile } from "@/tests/sampleRulesFile"
import { estimateTokens, planUnits, unitTokenBudget } from "./plan"
import { analyzeReferences, citedProvisions } from "./references"

// The sample Declaration's golden provisions, planned with its references and vocabulary.
const file = sampleRulesFile()
const documentKeys = [...new Set(file.provisions.map((provision) => provision.key.split(":")[0] ?? ""))]
const documents = documentKeys.map((key) => ({
  key,
  provisions: file.provisions.filter((provision) => provision.key.startsWith(`${key}:`))
}))
const { references } = analyzeReferences(documents, [
  { key: "declaration", names: ["Declaration"] },
  { key: "use-restrictions", names: ["Use Restrictions"] }
])
const cited = new Map([...references].map(([key, found]) => [key, citedProvisions(found, key)]))
const units = planUnits({ documents, references: cited, vocabulary: file.terms })

const tokensOf = (provisions: readonly Provision[]) =>
  provisions.reduce(
    (sum, provision) =>
      sum +
      estimateTokens([provision.heading, provision.text, provision.intro, provision.wrapUp].filter(Boolean).join("\n")),
    0
  )
const unitOf = (key: string) => units.find((unit) => unit.provisions.some((provision) => provision.key === key))

describe("planUnits on the sample Declaration", () => {
  it("puts every provision in exactly one unit, in document order", () => {
    expect(units.flatMap((unit) => unit.provisions.map((provision) => provision.key))).toEqual(
      documents.flatMap((document) => document.provisions.map((provision) => provision.key))
    )
  })

  it("keeps an article that fits whole, and splits a larger one by section", () => {
    const declaration = documents.find((document) => document.key === "declaration")?.provisions ?? []
    const subtree = (article: Provision) => {
      const number = article.label.replace("article-", "")
      return declaration.filter(
        (provision) => provision === article || provision.key.startsWith(`declaration:${number}.`)
      )
    }
    const articles = declaration.filter(
      (provision) => provision.parentLabel === null && provision.label.startsWith("article-")
    )
    const fitting = articles.filter((article) => tokensOf(subtree(article)) <= unitTokenBudget)
    expect(fitting.length).toBeGreaterThan(1)
    for (const article of fitting) {
      const unit = unitOf(article.key)
      expect(subtree(article).every((provision) => unitOf(provision.key) === unit)).toBe(true)
    }
    const article7 = units.filter((unit) => /^declaration:(article-7|7\.)/.test(unit.id))
    expect(article7.length).toBeGreaterThan(1)
    expect(unitOf("declaration:7.4(a)(viii)")).toBe(unitOf("declaration:7.4"))
  })

  it("stays within the token budget", () => {
    for (const unit of units) {
      expect(tokensOf(unit.provisions)).toBeLessThanOrEqual(unitTokenBudget)
    }
  })

  it("gives a split unit its ancestors' headings, intros and wrap-ups", () => {
    const split = units.find((unit) => unit.id.startsWith("declaration:7.") && unit.id !== "declaration:article-7")
    expect(split?.context.map((ancestor) => ancestor.key)).toEqual(["declaration:article-7"])
    expect(split?.context[0]).toMatchObject({ heading: "Association Powers and Responsibilities", intro: null })
  })

  it("brings in the provisions a unit cites, truncated", () => {
    const article1 = unitOf("declaration:article-1")
    expect(article1?.references.map((reference) => reference.key)).toContain("declaration:article-21")
    const small = planUnits({ documents, references: cited, vocabulary: [] }, { referenceTokens: 10 })
    const reference = small
      .find((unit) => unit.provisions.some((provision) => provision.key === "declaration:article-1"))
      ?.references.find((item) => item.key === "declaration:article-21")
    expect(reference).toMatchObject({ isTruncated: true })
    expect(reference?.text.length).toBe(41)
  })

  it("slices the vocabulary to the terms the unit mentions and their related terms", () => {
    const unit = unitOf("declaration:3.1(c)")
    const keys = unit?.terms.map((term) => term.key) ?? []
    expect(keys).toContain("lot")
    expect(keys).toContain("lease")
    expect(keys).not.toContain("antenna-service")
    expect(unit?.matches.find((match) => match.key === "lot")).toMatchObject({ kind: "exact", score: 1 })
  })

  it("brings in the value sets the slice's choice properties choose from, with their values", () => {
    const [first] = file.provisions
    if (!first) {
      throw new Error("No provision")
    }
    const provision = { ...first, key: "rules:1", label: "1", parentLabel: null, heading: null, intro: null }
    const draft = (term: Record<string, unknown>) =>
      termDraft.parse({ labels: [{ text: String(term.key), role: "preferred" }], citations: [], ...term })
    const vocabulary = [
      draft({ key: "widget", kind: "thing", nature: "object", labels: [{ text: "Widget", role: "preferred" }] }),
      draft({
        key: "widget.style",
        kind: "property",
        of: "widget",
        valueType: { type: "choice", set: "style" },
        ifUnstated: "unknown"
      }),
      draft({ key: "style", kind: "value-set" }),
      draft({ key: "style.plain", kind: "value", set: "style" }),
      draft({ key: "shade", kind: "value-set" }),
      draft({ key: "shade.dark", kind: "value", set: "shade" })
    ]
    const [unit] = planUnits({
      documents: [{ key: "rules", provisions: [{ ...provision, text: "Every Widget must be kept in good repair." }] }],
      references: new Map(),
      vocabulary
    })
    expect(unit?.terms.map((term) => term.key)).toEqual(["style", "style.plain", "widget", "widget.style"])
  })

  it("lists the core request types with their data", () => {
    const keys = units[0]?.requestTypes.map((term) => term.key)
    expect(keys).toContain("architectural-application")
    expect(keys).toContain("architectural-application.submitted-on")
    expect(keys).not.toContain("owner")
  })

  it("splits a section larger than the budget into its items, packing neighbours", () => {
    const tight = planUnits({ documents, references: cited, vocabulary: [] }, { maxTokens: 400 })
    expect(tight.length).toBeGreaterThan(units.length)
    for (const unit of tight.filter((item) => item.provisions.length > 1)) {
      expect(tokensOf(unit.provisions)).toBeLessThanOrEqual(400)
    }
  })
})

describe("packing", () => {
  /** A provision of about `tokens` tokens of text. */
  const sized = (key: string, parentLabel: string | null, tokens: number, text = "") =>
    makeProvision(key, parentLabel, `${text} ${"word ".repeat(Math.max(0, Math.round((tokens * 4) / 5) - 1))}`.trim())
  const keysOf = (planned: ReturnType<typeof planUnits>) =>
    planned.map((unit) => unit.provisions.map((provision) => provision.key))

  it("packs neighbouring top-level sections in document order up to the budget", () => {
    const provisions = ["1", "2", "3", "4", "5"].map((label) => sized(`rules:${label}`, null, 100))
    const planned = planUnits(
      { documents: [{ key: "rules", provisions }], references: new Map(), vocabulary: [] },
      { maxTokens: 250 }
    )
    expect(keysOf(planned)).toEqual([["rules:1", "rules:2"], ["rules:3", "rules:4"], ["rules:5"]])
    expect(planned.map((unit) => unit.id)).toEqual(["rules:1", "rules:3", "rules:5"])
  })

  it("never divides a subtree that fits, and never packs across documents", () => {
    const rules = [
      sized("rules:1", null, 100),
      sized("rules:2", null, 50),
      sized("rules:2(a)", "2", 50),
      sized("rules:2(b)", "2", 50)
    ]
    const guidelines = [sized("guidelines:1", null, 10)]
    const planned = planUnits(
      {
        documents: [
          { key: "rules", provisions: rules },
          { key: "guidelines", provisions: guidelines }
        ],
        references: new Map(),
        vocabulary: []
      },
      { maxTokens: 200 }
    )
    // Section 2 with its items is 150 tokens: it can't join section 1, and stays whole.
    expect(keysOf(planned)).toEqual([["rules:1"], ["rules:2", "rules:2(a)", "rules:2(b)"], ["guidelines:1"]])
    for (const unit of planned) {
      expect(tokensOf(unit.provisions)).toBeLessThanOrEqual(200)
    }
  })

  it("gives a packed unit every member's references and vocabulary", () => {
    const provisions = [
      sized("rules:1", null, 20, "Every Widget is kept clean."),
      sized("rules:2", null, 20, "Every Gadget is kept dry."),
      sized("rules:3", null, 70, "Fees are listed here."),
      sized("rules:4", null, 70, "A Sprocket needs approval.")
    ]
    const draft = (key: string, label: string) =>
      termDraft.parse({
        key,
        kind: "thing",
        nature: "object",
        labels: [{ text: label, role: "preferred" }],
        citations: []
      })
    const [unit] = planUnits(
      {
        documents: [{ key: "rules", provisions }],
        references: new Map([
          ["rules:1", ["rules:3"]],
          ["rules:2", ["rules:4"]]
        ]),
        vocabulary: [
          draft("widget", "Widget"),
          draft("gadget", "Gadget"),
          draft("sprocket", "Sprocket"),
          draft("fee", "Toll")
        ]
      },
      { maxTokens: 100 }
    )
    expect(unit?.provisions.map((provision) => provision.key)).toEqual(["rules:1", "rules:2"])
    expect(unit?.references.map((reference) => reference.key)).toEqual(["rules:3", "rules:4"])
    expect(unit?.terms.map((term) => term.key)).toEqual(["gadget", "sprocket", "widget"])
  })
})
