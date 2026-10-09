import { describe, expect, it, vi } from "vitest"
import { pipelinePrompts } from "@/ai/pipelinePrompts"
import type { PromptCache } from "@/ai/runPrompt"
import { uploadEdition } from "@/documents/documentStructure"
import type { StepRunner } from "@/jobs/steps"
import type { RuleDraft } from "@/schema/zod"
import { cite } from "@/tests/encodingDrafts"
import { scriptedModel, variableOf, variablesPromptLoader } from "@/tests/scriptedModel"
import { syntheticPages } from "@/tests/syntheticDeclaration"
import { buildRulebook, type BuildInput } from "./build"
import { buildScores } from "./buildScores"

const structure = {
  key: "declaration",
  kind: "declaration" as const,
  names: ["Declaration"],
  exhibits: [
    {
      exhibit: "A",
      key: "conduct-rules",
      kind: "rules" as const,
      title: "Rules of Conduct",
      names: ["Rules of Conduct"]
    }
  ]
}

const prohibition = (key: string, citation: string): Omit<Extract<RuleDraft, { kind: "norm" }>, "effectiveFrom"> => ({
  key,
  domain: "use",
  title: "Prohibited use",
  statement: "No {{owner}} may do this on a {{lot}}.",
  citations: [cite(citation)],
  requestTypes: ["violation"],
  appliesTo: "lot",
  kind: "norm",
  modality: "prohibition",
  bearer: "owner"
})

/** The provision keys a unit's prompt lists. */
const unitKeys = (text: string) =>
  [...variableOf(text, "provisions").matchAll(/^\[([^\]]+)\]/gm)].map((match) => match[1] ?? "")

/** Answers like an encoder: a rule for 3.1(b) and the conduct rules' (a), a reason for each provision nothing cites. */
function encode(text: string, isFirstTry: boolean) {
  const keys = unitKeys(text)
  const rules = [
    ...(keys.includes("declaration:3.1(b)")
      ? [prohibition("declaration:3.1(b)#no-livestock", "declaration:3.1(b)")]
      : []),
    ...(keys.includes("conduct-rules:a") ? [prohibition("conduct-rules:a#no-noise", "conduct-rules:a")] : [])
  ]
  // The vocabulary's term cites its definition.
  const cited = new Set([
    ...rules.map((rule) => rule.citations[0]?.provisionKey),
    "declaration:article-2/common-grounds"
  ])
  return {
    provisions: keys.map((key) => ({
      key,
      noRule: cited.has(key) ? null : { reason: "explanatory", note: null }
    })),
    // The conduct rules' first answer leaves out a title, which Zod rejects and repair restores.
    rules: rules.map(({ title, ...rule }) =>
      isFirstTry && rule.key.startsWith("conduct-rules:") ? rule : { title, ...rule }
    ),
    notes: keys.includes("declaration:3.1(b)") ? ["SCHEMA GAP: livestock isn't a term yet."] : []
  }
}

/** Answers each build prompt the way the model would. */
function answer(text: string) {
  if (text.startsWith(`# ${pipelinePrompts.termExtraction.name}`)) {
    return {
      terms: [
        {
          key: "common-grounds",
          kind: "thing",
          nature: "object",
          labels: [{ text: "Common Grounds", role: "preferred" }],
          citations: [cite("declaration:article-2/common-grounds")]
        }
      ],
      notes: []
    }
  }
  if (text.startsWith(`# ${pipelinePrompts.provisionEncoding.name}`)) {
    return encode(text, true)
  }
  if (text.startsWith(`# ${pipelinePrompts.encodingRepair.name}`)) {
    const keys = [...variableOf(text, "draft").matchAll(/"key":"([^"#]+)"/g)].map((match) => `[${match[1] ?? ""}]`)
    return encode(`## provisions\n${keys.join("\n")}`, false)
  }
  if (text.startsWith(`# ${pipelinePrompts.rulebookConsolidation.name}`)) {
    return { duplicates: [], overrides: [], conflicts: [], termMerges: [] }
  }
  throw new Error(`Unexpected prompt: ${text.slice(0, 40)}`)
}

const model = () => scriptedModel(answer)

/** Runs steps in process, through JSON as a Workflow stores them, recording their names. */
function stepRunner() {
  const names: string[] = []
  const step: StepRunner = async (name, schema, run) => {
    names.push(name)
    const stored = JSON.stringify(await run())
    return schema.parse(JSON.parse(stored))
  }
  return { step, names }
}

function input(overrides: Partial<BuildInput> = {}): BuildInput {
  const { step } = stepRunner()
  const pages = syntheticPages()
  return {
    organizationId: "org-1",
    sources: [
      {
        documentId: "upload-1",
        title: "Declaration for Maple Hollow",
        structure,
        edition: uploadEdition({
          id: "upload-1",
          sha256: "a".repeat(64),
          pageCount: pages.length,
          effectiveDate: "2024-03-01",
          uploadedAt: "2026-10-09T00:00:00Z"
        }),
        loadPages: async () => pages
      }
    ],
    step,
    ai: {
      loadPrompt: variablesPromptLoader,
      createModel: () => model(),
      modelId: "test-model",
      environment: "test",
      sessionId: "job-1",
      promptVersions: {}
    },
    previous: null,
    now: "2026-10-09T12:00:00.000Z",
    ...overrides
  }
}

describe("buildRulebook", () => {
  it("runs every stage as a named step and builds a draft with code-set dates and owners", async () => {
    const { step, names } = stepRunner()
    const progress = vi.fn<NonNullable<BuildInput["progress"]>>(async () => undefined)
    const result = await buildRulebook(input({ step, progress }))

    expect(names).toEqual(
      expect.arrayContaining([
        "structure:upload-1",
        "analyze:upload-1",
        "vocabulary:upload-1",
        "plan",
        "encode:declaration:article-3",
        "encode:conduct-rules:exhibit-a",
        "verify",
        "repair:conduct-rules:exhibit-a:1",
        "verify:merged",
        "merge",
        "consolidate"
      ])
    )
    expect(names.indexOf("merge")).toBeLessThan(names.indexOf("consolidate"))
    expect(progress).toHaveBeenCalledWith("encode", 0, result.report.units.length)

    const rules = result.content.rules
    expect(rules.map((rule) => rule.key).toSorted()).toEqual([
      "conduct-rules:a#no-noise",
      "declaration:3.1(b)#no-livestock"
    ])
    expect(rules.every((rule) => rule.effectiveFrom === "2024-03-01" && rule.review.status === "proposed")).toBe(true)
    expect(rules[0]?.provenance).toEqual({ by: "extraction", at: "2026-10-09T12:00:00.000Z" })
    expect(result.content.terms.find((term) => term.key === "common-grounds")).toMatchObject({
      organizationId: "org-1"
    })
    expect(result.content.coverage.uncovered).toEqual([])
    expect(result.failures).toEqual([])

    expect(result.documents).toEqual([
      expect.objectContaining({
        documentId: "upload-1",
        documents: [
          expect.objectContaining({
            document: expect.objectContaining({ key: "declaration", title: "Declaration for Maple Hollow" })
          }),
          expect.objectContaining({ document: expect.objectContaining({ key: "conduct-rules", kind: "rules" }) })
        ]
      })
    ])
    const conduct = result.report.units.find((unit) => unit.id === "conduct-rules:exhibit-a")
    expect(conduct).toMatchObject({ isValid: true, repairRounds: 1, problems: 0 })
    expect(result.report.validAfterEncode).toBe(result.report.units.length - 1)
    expect(result.report.calls.map((call) => call.stage)).toContain("encoding-repair")
  })

  it("scores the build", async () => {
    const scores = buildScores(await buildRulebook(input()))
    const score = (name: string) => scores.find((item) => item.name === name)?.value
    expect(score("units-valid")).toBe(score("units"))
    expect(score("units-repaired")).toBe(1)
    expect(score("rules-norm")).toBe(2)
    expect(score("coverage")).toBe(1)
    expect(score("schema-gap-notes")).toBe(1)
    expect(score("problems-before-repair")).toBeGreaterThan(0)
  })

  it("encodes only the units a slice keeps, and records a unit that fails", async () => {
    const failing = scriptedModel((text) => {
      if (unitKeys(text).includes("conduct-rules:a")) {
        throw new Error("The provider is down.")
      }
      return answer(text)
    })
    const result = await buildRulebook(
      input({
        ai: { ...input().ai, createModel: () => failing },
        selectUnits: (unit) => unit.id === "conduct-rules:exhibit-a" || unit.id === "declaration:article-1"
      })
    )
    expect(result.report.units.map((unit) => unit.id)).toEqual(["declaration:article-1", "conduct-rules:exhibit-a"])
    expect(result.failures).toEqual([
      expect.objectContaining({
        stage: "encode",
        itemId: "conduct-rules:exhibit-a",
        message: expect.stringContaining("down")
      })
    ])
    expect(result.content.coverage.uncovered).toEqual(expect.arrayContaining(["conduct-rules:a"]))
  })

  it("reuses cached model results", async () => {
    const stored = new Map<string, unknown>()
    const cache: PromptCache = {
      get: async (key) => stored.get(key),
      put: async (key, value) => {
        stored.set(key, value)
      }
    }
    const createModel = vi.fn<() => ReturnType<typeof model>>(() => model())
    const ai = { ...input().ai, createModel, cache: () => cache }
    await buildRulebook(input({ ai }))
    const calls = createModel.mock.calls.length
    const again = await buildRulebook(input({ ai }))
    expect(createModel.mock.calls.length).toBe(calls)
    expect(again.report.calls.every((call) => call.isCached)).toBe(true)
  })

  it("waits for the merge when a unit's only problem is a rule another unit defines", async () => {
    const permits = scriptedModel((text) => {
      const answered = answer(text)
      if (
        !text.startsWith(`# ${pipelinePrompts.provisionEncoding.name}`) ||
        !unitKeys(text).includes("conduct-rules:a")
      ) {
        return answered
      }
      const permission = {
        ...prohibition("conduct-rules:a#livestock-allowed", "conduct-rules:a"),
        modality: "permission",
        overrides: ["declaration:3.1(b)#no-livestock"]
      }
      return { ...encode(text, false), rules: [permission] }
    })
    const { step, names } = stepRunner()
    const result = await buildRulebook(input({ step, ai: { ...input().ai, createModel: () => permits } }))
    expect(names.filter((name) => name.startsWith("repair:"))).toEqual([])
    expect(result.content.rules.find((rule) => rule.key === "conduct-rules:a#livestock-allowed")).toMatchObject({
      overrides: ["declaration:3.1(b)#no-livestock"],
      issues: []
    })
  })

  it("gives up on a unit whose draft still fails Zod after two repairs", async () => {
    // Only the conduct rules' unit goes to repair, and every answer for it lacks its provisions.
    const stubborn = scriptedModel((text) => {
      const isConduct =
        text.startsWith(`# ${pipelinePrompts.encodingRepair.name}`) ||
        (text.startsWith(`# ${pipelinePrompts.provisionEncoding.name}`) && unitKeys(text).includes("conduct-rules:a"))
      return isConduct ? { provisions: null } : answer(text)
    })
    const { step, names } = stepRunner()
    const result = await buildRulebook(input({ step, ai: { ...input().ai, createModel: () => stubborn } }))
    expect(names).toEqual(
      expect.arrayContaining(["repair:conduct-rules:exhibit-a:1", "repair:conduct-rules:exhibit-a:2"])
    )
    expect(result.report.units.find((unit) => unit.id === "conduct-rules:exhibit-a")).toMatchObject({
      isValid: false,
      repairRounds: 2
    })
    expect(result.failures).toEqual([
      expect.objectContaining({
        stage: "repair",
        itemId: "conduct-rules:exhibit-a",
        message: expect.stringContaining("Zod")
      })
    ])
  })

  it("asks the model for the outline when the parser can't number a document", async () => {
    const [first] = syntheticPages()
    const text = [
      "## Article 1 General",
      "",
      "### 1.1 First",
      "",
      "Owners keep their lots tidy. 1.2 Second. Owners mow their lawns weekly.",
      "",
      "### 1.3 Third",
      "",
      "Owners trim their hedges."
    ].join("\n")
    const page = first && { ...first, text, normalizedText: text.toLowerCase(), header: null }
    const outlined = scriptedModel((prompt) =>
      prompt.startsWith(`# ${pipelinePrompts.structureRepair.name}`)
        ? { markers: [{ offset: variableOf(prompt, "pageText").indexOf("1.2 Second"), marker: "1.2", level: 2 }] }
        : answer(prompt)
    )
    const result = await buildRulebook(
      input({
        ai: { ...input().ai, createModel: () => outlined },
        sources: input().sources.map((source) => ({
          ...source,
          structure: { ...structure, exhibits: [] },
          loadPages: async () => (page ? [page] : [])
        }))
      })
    )
    expect(result.report.calls.map((call) => call.stage)).toContain("structure-repair")
    expect(result.documents[0]?.documents[0]?.provisions.map((provision) => provision.label)).toEqual([
      "article-1",
      "1.1",
      "1.2",
      "1.3"
    ])
  })
})
