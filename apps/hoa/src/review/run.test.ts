import { describe, expect, it } from "vitest"
import { pipelinePrompts } from "@/ai/pipelinePrompts"
import { evaluate } from "@/engine/evaluate"
import type { StepRunner } from "@/jobs/steps"
import type { Page } from "@/ocr/page"
import type * as T from "@/schema/types"
import { fenceAnswers, fenceRequest, fenceRulesFile } from "@/tests/fenceSchemaFixture"
import { scriptedModel, variableOf, variablesPromptLoader } from "@/tests/scriptedModel"
import { rulebookVocabulary } from "./documentTypes"
import type { Packet } from "./packet"
import { reviewApplication } from "./run"

// The whole review on the fence fixture with a scripted model that reads the fixture's facts and documents the way
// the real models would answer: the pipeline must reach the same findings as the engine does on the fixture itself.

const rulesFile = fenceRulesFile()
const fixture = fenceRequest()
const vocabulary = rulebookVocabulary(rulesFile)

const page = (pageIndex: number, text: string): Page => ({
  documentId: "packet",
  pageIndex,
  pageLabel: null,
  labelSource: null,
  engine: "test",
  optionsHash: "test",
  text,
  normalizedText: text.toLowerCase(),
  header: null,
  footer: null,
  headings: [],
  sectionAtTop: null,
  checkboxes: [],
  figures: [],
  minConfidence: null,
  lowConfidenceSpans: []
})

// Made-up packet text that names every stated value, so each quote verifies.
const packetText = [
  "Application form. Replace the existing fence. Owner signature: signed. Review fee $50.",
  "Appendix. Material composite. Manufacturer Trex. Color River Birch. Boards horizontal. Gate boards vertical.",
  "Plot plan showing the left side, right side, rear and return runs and the gate."
]
const packet: Packet = {
  files: [
    {
      id: "file-1",
      fileName: "packet.pdf",
      mediaType: "application/pdf",
      contextText: null,
      isReadable: true,
      pages: packetText.map((text, index) => page(index + 1, text)),
      visuals: []
    }
  ],
  images: []
}

const evidence = (quote: string) => [{ fileId: "file-1", page: 2, quote }]

/** The text a fact's value is stated with, and the model's reading of it. */
function answerOf(fact: T.Fact) {
  const value = fact.value
  if (fact.state === "absent" || !value) {
    return { stated: null, reading: null }
  }
  switch (value.type) {
    case "value":
      return { stated: value.term ? vocabulary.label(value.term) : value.text, reading: value.term }
    case "entity":
      return { stated: null, reading: value.entity }
    case "boolean":
      return { stated: null, reading: value.value }
    case "quantity":
      return { stated: `$${value.value}`, reading: { value: value.value, unit: value.unit } }
    default:
      return { stated: null, reading: null }
  }
}

const quoteFor = (stated: string | null) => (stated && packetText[1]?.includes(stated) ? stated : "Appendix")

function facts(text: string) {
  const ids = new Set([...variableOf(text, "entities").matchAll(/"id":"([^"]+)"/g)].map((match) => match[1]))
  const properties = new Set(
    [...variableOf(text, "properties").matchAll(/"property":"([^"]+)"/g)].map((match) => match[1])
  )
  return {
    facts: fixture.facts
      // The submission date comes from the portal; the packet states the rest, the review fee included.
      .filter((fact) => ids.has(fact.entity) && properties.has(fact.property))
      .map((fact) => {
        const { stated, reading } = answerOf(fact)
        return {
          entity: fact.entity,
          property: fact.property,
          state: fact.state,
          stated,
          reading,
          evidence: evidence(quoteFor(stated)),
          confidence: 0.95
        }
      }),
    conditions: []
  }
}

type Requirement = { id: string; document: { type: string }; for: string; mustState: string[] }

function documents(text: string) {
  const requirements: Requirement[] = JSON.parse(variableOf(text, "requirements"))
  return {
    documents: requirements.map((requirement) => {
      const entity = requirement.for === "the application" ? null : requirement.for.split(":")[0]
      const found = fixture.documents.filter(
        (document) =>
          vocabulary.isKindOf(document.type, requirement.document.type) &&
          (entity === null || entity === undefined || document.subjects.includes(entity))
      )
      return {
        requirement: requirement.id,
        present: found.length > 0,
        statements: requirement.mustState.map((statement) => ({ statement, status: "confirmed", quote: null })),
        signers: found.flatMap((document) => document.signedBy),
        evidence: [{ fileId: "file-1", page: 1, quote: null }]
      }
    })
  }
}

function answer(text: string): unknown {
  const prompt = text.slice(2, text.indexOf("\n"))
  if (prompt === pipelinePrompts.pageClassification.name) {
    return { type: text.includes("Plot plan") ? "plot-plan" : "other" }
  }
  if (prompt === pipelinePrompts.subjectIdentification.name) {
    return {
      entities: fixture.entities
        .filter((entity) => !["request", "lot", "community"].includes(entity.id))
        .map((entity) => ({ id: entity.id, type: entity.type, label: entity.label, evidence: evidence("Appendix") }))
    }
  }
  if (prompt === pipelinePrompts.entityFacts.name) {
    return facts(text)
  }
  if (prompt === pipelinePrompts.documentReview.name) {
    return documents(text)
  }
  if (prompt === pipelinePrompts.judgmentCheck.name) {
    const [judgment] = fenceAnswers().judgments
    return { ...judgment, evidence: [] }
  }
  if (prompt === pipelinePrompts.reviewSummary.name) {
    const items: { id: string; rule: string }[] = JSON.parse(variableOf(text, "actionItems"))
    return {
      assessment: "Request information.",
      feedback: "Provide what's listed, then run the review again.",
      items: items.map((item) => ({ id: item.id, text: `Fix {{rule:${item.rule}}}.` }))
    }
  }
  throw new Error(`Unexpected prompt: ${prompt}`)
}

const names: string[] = []
const step: StepRunner = async (name, schema, run) => {
  names.push(name)
  const stored = JSON.stringify(await run())
  return schema.parse(JSON.parse(stored))
}

const result = await reviewApplication({
  organizationId: "org-sample",
  rulesFile,
  application: {
    requestType: "architectural-application",
    projectKind: null,
    description: "Replace the fence.",
    submittedOn: "2026-09-04"
  },
  packet,
  step,
  ai: {
    loadPrompt: variablesPromptLoader,
    createModel: () => scriptedModel(answer),
    modelId: "test-model",
    smallModelId: "test-small-model",
    environment: "test",
    sessionId: "job-1",
    promptVersions: {}
  },
  now: "2026-09-10T12:00:00Z"
})

const outcomes = (findings: readonly T.Finding[]) =>
  Object.fromEntries(findings.map((found) => [`${found.ruleKey} ${found.entity}`, found.outcome]))

describe("reviewApplication on the fence fixture", () => {
  it("runs every stage as a named step", () => {
    expect(names).toEqual([
      "classify:file-1",
      "subjects",
      "select",
      "plan",
      "facts:application",
      "facts:fence-run",
      "facts:gate",
      "normalize",
      "documents",
      "judgment:declaration:4.3(b)/p2#harmony:work-1",
      "evaluate",
      "decide",
      "write"
    ])
  })

  it("reaches the engine's findings on the fixture itself", () => {
    const expected = evaluate({
      rulesFile,
      request: fixture,
      answers: fenceAnswers(),
      evaluatedAt: "2026-09-10T12:00:00Z"
    })
    expect(outcomes(result.findings)).toEqual(outcomes(expected))
  })

  it("recommends requesting information, with the action items phrased by the writer", () => {
    expect(result.recommendation).toBe("request-information")
    expect(result.changes.map((item) => item.ruleKey).toSorted()).toEqual([
      "guidelines:5.2.5#no-horizontal",
      "guidelines:5.4.2(i)#colors",
      "guidelines:5.9.1#gate-boards"
    ])
    expect(result.changes[0]?.text).toBe("Fix {{rule:guidelines:5.2.5#no-horizontal}}.")
    expect(result.committeeDecisions.map((item) => item.ruleKey)).toEqual(["declaration:4.3(b)/p2#harmony"])
  })

  it("records what it matched and the calls it made", () => {
    expect(result.normalizations).toContainEqual({
      entity: "run-1",
      property: "fence-run.color",
      stated: "River Birch",
      matchedLabel: "River Birch",
      kind: "exact",
      score: 1
    })
    expect(result.provisional).toBe(false)
    expect(result.failures).toEqual([])
    expect(result.costUsd).toBeCloseTo(result.calls.length * 0.01)
  })
})
