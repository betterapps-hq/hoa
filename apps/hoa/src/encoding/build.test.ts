import { describe, expect, it, vi } from "vitest"
import { pipelinePrompts } from "@/ai/pipelinePrompts"
import { uploadEdition } from "@/documents/documentStructure"
import type { StepRunner } from "@/jobs/steps"
import { promptText, replyingModel, scriptedModel, variableOf, variablesPromptLoader } from "@/tests/scriptedModel"
import { syntheticPages } from "@/tests/syntheticDeclaration"
import { buildRulebook, type BuildInput } from "./build"
import { buildScores } from "./buildScores"
import { SourcesRejectedError } from "./sourceCheck"
import { stepPrompts } from "./steps/prompts"

// The build over a small made-up declaration with an exhibit, with a mock model that answers each step's prompt in the
// step's format: two sections (the declaration, and the exhibit's rules of conduct), one document with definitions,
// and three rules. No paid model is called.

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

const declaration = "declaration:preamble"
const conduct = "conduct-rules:exhibit-a"
const leash = "declaration:3.1(a)(ii)#no-unleashed-pets"
const livestock = "declaration:3.1(b)#no-livestock"
const noise = "conduct-rules:a#no-noise"
const allowed = "conduct-rules:a#livestock-allowed"

/** Which prompt a call's text is. */
const isPrompt = (text: string, prompt: { name: string }) => text.startsWith(`# ${prompt.name}`)

/** The provision keys a prompt's variable lists, one `[key]` per provision. */
const listedKeys = (text: string, variable: string) =>
  [...variableOf(text, variable).matchAll(/^\[([^\]]+)\]/gm)].map((match) => match[1] ?? "")

/** The lines of a variable, one per outline, term or cluster line. */
const linesOf = (text: string, variable: string) =>
  variableOf(text, variable)
    .split("\n")
    .filter((line) => line.includes(" | "))

const prohibitionOutline = (aspect: string, citations: string[] = []) => ({
  aspect,
  kind: "prohibition",
  summary: `No ${aspect}`,
  domain: "use",
  citations,
  reads: [],
  interpretation: false,
  bearer: ["owner"],
  appliesTo: ["lot"],
  requestTypes: ["violation"]
})

/**
 * Options for how the mock answers E for the conduct rules: a permission across sections, a first answer short, or a
 * subject no term of the vocabulary is.
 */
type Finding = { permits?: boolean; leavesOut?: string; unknownSubject?: string }

/** Answers E: a rule for 3.1(a)(ii) (citing a definition), 3.1(b) and the conduct rules' (a); a reason for the rest. */
function findRules(text: string, options: Finding = {}) {
  const outlines: Record<string, unknown[]> = {
    "declaration:3.1(a)(ii)": [prohibitionOutline("no-unleashed-pets", ["declaration:article-2/common-grounds"])],
    "declaration:3.1(b)": [prohibitionOutline("no-livestock")],
    "conduct-rules:a": options.permits
      ? [
          {
            ...prohibitionOutline("livestock-allowed"),
            kind: "permission",
            overrides: { rules: [], provisions: ["declaration:3.1(b)"], documents: [] }
          }
        ]
      : [
          {
            ...prohibitionOutline("no-noise"),
            ...(options.unknownSubject ? { appliesTo: [{ label: options.unknownSubject }] } : {})
          }
        ]
  }
  const isFirstTry = variableOf(text, "problems") === "none"
  const keys = listedKeys(text, "provisions").filter((key) => !(isFirstTry && key === options.leavesOut))
  return {
    provisions: keys.map((key) => {
      const found = outlines[key] ?? []
      return {
        key,
        outlines: found,
        settings: [],
        noRule: found.length > 0 ? null : { reason: "explanatory", note: "States no requirement." }
      }
    }),
    questions: [],
    referencedDocuments: [],
    notes: keys.includes("declaration:3.1(b)") ? ["SCHEMA GAP: livestock isn't a term yet."] : []
  }
}

/** Answers B: the declaration defines Common Grounds. */
const definedTerms = () => ({
  things: [
    {
      nature: "object",
      preferred: { text: "Common Grounds", plural: null },
      alternatives: [],
      definition: "Land the Association owns for the shared use of owners.",
      citations: ["declaration:article-2/common-grounds"]
    }
  ],
  categories: [],
  criteriaTerms: { properties: [], valueSets: [], units: [] },
  refinements: [],
  notes: []
})

/** Answers C: the declaration's group adds a near-duplicate of Common Grounds, which C-merge folds back. */
function sharedVocabulary(text: string) {
  const outlines = linesOf(text, "outlines").map((line) => line.split(" | ")[0] ?? "")
  return {
    reused: [],
    things: outlines.includes(leash)
      ? [
          {
            nature: "object",
            preferred: { text: "Commons Grounds", plural: null },
            alternatives: [],
            definition: null,
            servesOutlines: [leash]
          }
        ]
      : [],
    categories: [],
    properties: [],
    valueSets: [],
    addValues: [],
    units: [],
    notes: []
  }
}

/** Answers C-merge: the group's term merges into the defined one. */
function vocabularyMerge(text: string) {
  const lines = linesOf(text, "clusters").map((line) => line.split(" | "))
  const idOf = (origin: string) => lines.find((line) => line.at(-1) === origin)?.[0] ?? ""
  return {
    merges: [{ keep: idOf("defined"), merge: [idOf("group 1")], why: "the same land, misread" }],
    renames: [],
    distinct: [],
    notes: []
  }
}

/** Options for how the mock answers F: a first answer that fails Zod, or a rule with a problem until it's retried. */
type Structuring = { failsFirst?: boolean; faultsNoise?: boolean }

/** Answers F: each outline's structure; a permission overrides what its outline's targets resolved to. */
function structureRules(text: string, options: Structuring = {}) {
  const problems = variableOf(text, "problems")
  if (options.failsFirst && problems === "none") {
    return { rules: null }
  }
  const rules = linesOf(text, "outlines").map((line) => {
    const [key = "", kind = "", , , , , targets = "-"] = line.split(" | ")
    const base = { key, title: `Rule ${key}`, appliesWhen: null, beneficiary: null, noExceptions: null }
    if (kind === "permission") {
      return {
        ...base,
        kind,
        statement: "An {{owner}} may keep livestock on a {{lot}}.",
        overrides: targets === "-" ? null : targets.split(", ")
      }
    }
    const isFaulted = options.faultsNoise && key === noise && !problems.includes(noise)
    return {
      ...base,
      kind: "prohibition",
      statement: "No {{owner}} may do this on a {{lot}}.",
      beneficiary: isFaulted ? "neighbour" : null,
      overrides: null,
      remedy: null,
      cure: null
    }
  })
  return { rules, clauses: {}, proposedTerms: [], outlineIssues: [], unfixable: [], notes: [] }
}

/** Answers consolidation: the two declaration rules conflict. */
const consolidation = () => ({
  duplicates: [],
  overrides: [],
  conflicts: [{ rules: [leash, livestock], description: "Whether pets count as livestock." }]
})

type Answers = Finding & Structuring

/** Answers each step's prompt the way the model would. */
function answer(text: string, options: Answers = {}) {
  if (isPrompt(text, stepPrompts.definedTerms)) {
    return definedTerms()
  }
  if (isPrompt(text, stepPrompts.ruleFinding)) {
    return findRules(text, options)
  }
  if (isPrompt(text, stepPrompts.sharedVocabulary)) {
    return sharedVocabulary(text)
  }
  if (isPrompt(text, stepPrompts.vocabularyMerge)) {
    return vocabularyMerge(text)
  }
  if (isPrompt(text, stepPrompts.ruleStructuring)) {
    return structureRules(text, options)
  }
  if (isPrompt(text, stepPrompts.consolidation)) {
    return consolidation()
  }
  throw new Error(`Unexpected prompt: ${text.slice(0, 40)}`)
}

const model = (options: Answers = {}) => scriptedModel((text) => answer(text, options))

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
    concurrency: 8,
    ...overrides
  }
}

const withModel = (createModel: BuildInput["ai"]["createModel"], overrides: Partial<BuildInput> = {}) =>
  input({ ...overrides, ai: { ...input().ai, createModel } })

describe("buildRulebook", () => {
  it("runs every step in order and builds a draft with code-set dates and owners", async () => {
    const { step, names } = stepRunner()
    const progress = vi.fn<NonNullable<BuildInput["progress"]>>(async () => undefined)
    const result = await buildRulebook(input({ step, progress }))

    const batch = `structure-rules:${leash}`
    expect(names).toEqual([
      "check",
      "structure:upload-1",
      "analyze:upload-1",
      "defined-terms:declaration",
      "plan",
      `find-rules:${declaration}`,
      `find-rules:${conduct}`,
      "find-rules:check",
      "find-rules:resolve",
      `vocabulary:${declaration}`,
      `vocabulary:${conduct}`,
      "vocabulary:check",
      "vocabulary-merge",
      batch,
      "structure-rules:check:1",
      "merge",
      "consolidate"
    ])
    expect(progress).toHaveBeenCalledWith("find-rules", 0, 2)
    expect(progress).toHaveBeenCalledWith("find-rules", 2, 2)
    expect(progress).toHaveBeenCalledWith("vocabulary-merge", 1, 1)
    expect(progress).toHaveBeenCalledWith("structure-rules", 1, 1)

    const rules = result.content.rules
    expect(rules.map((rule) => rule.key).toSorted()).toEqual([noise, leash, livestock])
    expect(rules.every((rule) => rule.effectiveFrom === "2024-03-01" && rule.review.status === "proposed")).toBe(true)
    expect(rules[0]?.provenance).toEqual({ by: "extraction", at: "2026-10-09T12:00:00.000Z" })
    // C-merge folded the group's near-duplicate into the defined term, which keeps the misread wording.
    const terms = result.content.terms.filter((term) => term.labels.some((label) => label.text === "Common Grounds"))
    expect(terms).toHaveLength(1)
    expect(terms[0]).toMatchObject({ organizationId: "org-1" })
    expect(terms[0]?.labels.map((label) => label.text)).toContain("Commons Grounds")
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
    expect(result.report.stages.map((stage) => [stage.stage, stage.items, stage.calls, stage.reruns])).toEqual([
      ["defined-terms", 1, 1, 0],
      ["find-rules", 2, 2, 0],
      ["vocabulary", 2, 2, 0],
      ["vocabulary-merge", 1, 1, 0],
      ["structure-rules", 1, 1, 0],
      ["consolidate", 1, 1, 0]
    ])
    expect(result.report.rules).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: noise, isValid: true, retries: 0, problems: 0 })])
    )
    expect(result.report.calls.map((call) => call.stage)).toEqual(
      expect.arrayContaining(["rule-finding", "vocabulary-merge", "rule-structuring", "rulebook-consolidation"])
    )
  })

  it("applies consolidation: a conflict becomes a question for the review", async () => {
    const result = await buildRulebook(input())
    expect(result.content.questions).toEqual([
      expect.objectContaining({
        kind: "conflict",
        question: "Whether pets count as livestock.",
        about: { rules: [leash, livestock], terms: [] }
      })
    ])
  })

  it("resolves a target E names by provision to the rule another section outlines there", async () => {
    const { step, names } = stepRunner()
    const result = await buildRulebook(withModel(() => model({ permits: true }), { step }))
    expect(result.content.rules.find((rule) => rule.key === allowed)).toMatchObject({
      kind: "norm",
      modality: "permission",
      overrides: [livestock],
      issues: []
    })
    expect(names.filter((name) => name.includes(":rerun") || name.includes(":retry-"))).toEqual([])
  })

  it("refuses to start, before any model call, when an upload's record would fail later", async () => {
    const createModel = vi.fn<() => ReturnType<typeof model>>(() => model())
    const { step, names } = stepRunner()
    const bad = withModel(createModel, {
      step,
      sources: input().sources.map((source) => ({
        ...source,
        edition: {
          ...source.edition,
          files: source.edition.files.map((file) => ({ ...file, sha256: "sample-declaration-pages" }))
        }
      }))
    })
    const refused = buildRulebook(bad)
    await expect(refused).rejects.toBeInstanceOf(SourcesRejectedError)
    await expect(refused).rejects.toMatchObject({
      problems: expect.arrayContaining([
        expect.objectContaining({ title: "Declaration for Maple Hollow", kind: "file-invalid" })
      ])
    })
    await expect(refused).rejects.toThrow(/edition\.files\[0\]\.sha256/)
    expect(createModel).not.toHaveBeenCalled()
    expect(names).toEqual(["check"])
  })

  it("records a section whose call fails and builds the rest", async () => {
    const failing = scriptedModel((text) => {
      if (isPrompt(text, stepPrompts.ruleFinding) && listedKeys(text, "provisions").includes("conduct-rules:a")) {
        throw new Error("The provider is down.")
      }
      return answer(text)
    })
    const result = await buildRulebook(withModel(() => failing))
    expect(result.failures).toEqual([
      expect.objectContaining({ stage: "find-rules", itemId: conduct, message: expect.stringContaining("down") })
    ])
    expect(result.content.rules.map((rule) => rule.key).toSorted()).toEqual([leash, livestock])
    expect(result.content.coverage.uncovered).toEqual(expect.arrayContaining(["conduct-rules:a"]))
  })

  it("reruns a section the check across sections faults, with its problems", async () => {
    const { step, names } = stepRunner()
    const result = await buildRulebook(withModel(() => model({ leavesOut: "conduct-rules:b" }), { step }))
    expect(names.indexOf(`find-rules:${conduct}:rerun`)).toBeGreaterThan(names.indexOf("find-rules:check"))
    expect(names).not.toContain(`find-rules:${declaration}:rerun`)
    expect(result.report.stages.find((stage) => stage.stage === "find-rules")).toMatchObject({
      calls: 3,
      reruns: 1,
      problemsLeft: 0
    })
    expect(result.content.coverage.uncovered).toEqual([])
  })

  it("reruns a batch whose whole answer fails Zod, with its problems, in the same step", async () => {
    const { step, names } = stepRunner()
    const result = await buildRulebook(withModel(() => model({ failsFirst: true }), { step }))
    expect(names.filter((name) => name.startsWith("structure-rules:") && !name.includes(":check:"))).toEqual([
      `structure-rules:${leash}`
    ])
    expect(result.report.stages.find((stage) => stage.stage === "structure-rules")).toMatchObject({
      calls: 2,
      reruns: 1
    })
    expect(result.content.rules).toHaveLength(3)
    expect(result.failures).toEqual([])
  })

  it("reruns consolidation once when the model ends without an answer", async () => {
    let consolidations = 0
    const once = scriptedModel((text) => {
      if (isPrompt(text, stepPrompts.consolidation) && consolidations++ === 0) {
        return {}
      }
      return answer(text)
    })
    const result = await buildRulebook(withModel(() => once))
    expect(consolidations).toBe(2)
    expect(result.report.stages.find((stage) => stage.stage === "consolidate")).toMatchObject({ calls: 2, reruns: 1 })
    expect(result.content.questions).toEqual([expect.objectContaining({ kind: "conflict" })])
    expect(result.failures).toEqual([])
  })

  it("retries a rule the validator faults, with its problems, once every batch is structured", async () => {
    const { step, names } = stepRunner()
    const result = await buildRulebook(withModel(() => model({ faultsNoise: true }), { step }))
    expect(names.slice(names.indexOf("structure-rules:check:1"), names.indexOf("merge"))).toEqual([
      "structure-rules:check:1",
      `structure-rules:${leash}:retry-1`,
      "structure-rules:check:2"
    ])
    expect(result.report.rules.find((rule) => rule.key === noise)).toMatchObject({ isValid: true, retries: 1 })
    expect(result.content.rules.find((rule) => rule.key === noise)).toMatchObject({ beneficiary: null, issues: [] })
    const scores = buildScores(result)
    expect(scores.find((score) => score.name === "rules-retried")?.value).toBe(1)
    expect(scores.find((score) => score.name === "problems-before-retry")?.value).toBeGreaterThan(0)
  })

  it("doesn't retry a rule faulted only in a field its outline gives it, and names the label", async () => {
    const { step, names } = stepRunner()
    const subject = "Owner or another resident of the Unit"
    const result = await buildRulebook(withModel(() => model({ unknownSubject: subject }), { step }))
    expect(names.filter((name) => name.includes(":retry-"))).toEqual([])
    expect(result.failures).toEqual([
      expect.objectContaining({
        stage: "structure-rules",
        itemId: noise,
        message: `The rule's appliesTo names "${subject}", which no term of the vocabulary is.`
      })
    ])
  })

  it("keeps at most `concurrency` model calls in flight", async () => {
    let inFlight = 0
    let most = 0
    const slow = replyingModel(async (options) => {
      inFlight += 1
      most = Math.max(most, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight -= 1
      return { toolInput: answer(promptText(options)), usage: { input: 100, output: 10 } }
    })
    const result = await buildRulebook(withModel(() => slow, { concurrency: 1 }))
    expect(result.report.calls.length).toBeGreaterThan(2)
    expect(most).toBe(1)
  })

  it("scores the build", async () => {
    const scores = buildScores(await buildRulebook(input()))
    const score = (name: string) => scores.find((item) => item.name === name)?.value
    expect(score("sections")).toBe(2)
    expect(score("outlines")).toBe(3)
    expect(score("rules-valid")).toBe(3)
    expect(score("rules-retried")).toBe(0)
    expect(score("reruns")).toBe(0)
    expect(score("rules-norm")).toBe(3)
    expect(score("coverage")).toBe(1)
    expect(score("schema-gap-notes")).toBe(1)
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
      isPrompt(prompt, pipelinePrompts.structureRepair)
        ? { markers: [{ offset: variableOf(prompt, "pageText").indexOf("1.2 Second"), marker: "1.2", level: 2 }] }
        : answer(prompt)
    )
    const result = await buildRulebook(
      withModel(() => outlined, {
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
