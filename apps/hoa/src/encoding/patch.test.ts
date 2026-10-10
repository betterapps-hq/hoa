import { describe, expect, it } from "vitest"
import { encodingPatch } from "@/schema/zod"
import { cite, firstDraft, heightRule } from "@/tests/encodingDrafts"
import { applyPatch } from "./patch"

const patch = (value: unknown) => encodingPatch.parse(value)

const question = (text: string) => ({
  kind: "interpretation",
  question: text,
  citations: [cite("rules:1")],
  about: { rules: [], terms: [] },
  options: []
})

const draft = {
  ...firstDraft,
  questions: [question("First?"), question("Second?")],
  notes: ["Kept."]
}

const keys = (records: unknown) => (Array.isArray(records) ? records.map((record) => record.key) : [])

describe("applyPatch", () => {
  it("replaces records by key and appends new ones, leaving the rest as they were", () => {
    const taller = heightRule("rules:1#max-height", "rules:1", 12)
    const { answer, unmatched } = applyPatch(
      draft,
      patch({
        rules: [taller, heightRule("rules:1#fence-height", "rules:1", 6)],
        provisions: [{ key: "rules:1", noRule: { reason: "explanatory", note: "Says what sheds are." } }],
        notes: ["SCHEMA GAP: added."]
      })
    )
    expect(keys(answer.rules)).toEqual(["declaration:4.1#sheds-allowed", "rules:1#max-height", "rules:1#fence-height"])
    expect(answer.rules).toContainEqual(expect.objectContaining({ key: "rules:1#max-height", title: taller.title }))
    expect(JSON.stringify(answer.rules)).toContain('"value":12')
    expect(answer.provisions).toEqual([
      { key: "declaration:4.1" },
      { key: "rules:1", noRule: { reason: "explanatory", note: "Says what sheds are." } }
    ])
    expect(answer.terms).toEqual(draft.terms)
    expect(answer.clauses).toEqual(draft.clauses)
    expect(answer.notes).toEqual(["Kept.", "SCHEMA GAP: added."])
    expect(unmatched).toEqual([])
  })

  it("removes records by key, clauses by name and questions by id", () => {
    const { answer, unmatched } = applyPatch(
      draft,
      patch({
        remove: {
          rules: ["declaration:4.1#sheds-allowed"],
          terms: ["shed"],
          clauses: ["deciders"],
          questions: ["question-1"],
          referencedDocuments: ["by-laws"]
        }
      })
    )
    expect(keys(answer.rules)).toEqual(["rules:1#max-height"])
    expect(answer.terms).toEqual([])
    expect(answer.clauses).toEqual({ precedence: draft.clauses?.precedence })
    expect(answer.questions).toEqual([question("Second?")])
    expect(answer.referencedDocuments).toEqual([])
    expect(unmatched).toEqual([])
  })

  it("replaces a question by its id and adds one without", () => {
    const { answer } = applyPatch(
      draft,
      patch({ questions: [{ ...question("Second, reworded?"), replaces: "question-2" }, question("Third?")] })
    )
    expect(answer.questions).toMatchObject([
      { question: "First?" },
      { question: "Second, reworded?" },
      { question: "Third?" }
    ])
    expect(answer.questions).not.toContainEqual(expect.objectContaining({ replaces: expect.anything() }))
  })

  it("reports what a patch names that the draft doesn't have, and applies the rest", () => {
    const { answer, unmatched } = applyPatch(
      draft,
      patch({
        rules: [heightRule("rules:1#fence-height", "rules:1", 6)],
        remove: { rules: ["rules:9#nothing"], clauses: ["cure"], questions: ["question-7"] }
      })
    )
    expect(unmatched).toEqual(["questions question-7", "clauses cure", "rules rules:9#nothing"])
    expect(keys(answer.rules)).toHaveLength(3)
  })

  it("patches an answer that failed Zod, as it was given", () => {
    const broken = { provisions: [{ key: "rules:1" }], rules: [{ key: "rules:1#max-height" }], extra: true }
    const { answer } = applyPatch(broken, patch({ rules: [heightRule("rules:1#max-height", "rules:1")] }))
    expect(answer).toMatchObject({ extra: true, rules: [{ key: "rules:1#max-height", kind: "norm" }], terms: [] })
    expect(applyPatch("no answer", patch({})).answer).toMatchObject({ provisions: [], rules: [], notes: [] })
  })

  it("is a schema a bad patch fails", () => {
    expect(encodingPatch.safeParse({ provisions: null }).success).toBe(false)
    expect(encodingPatch.safeParse({ remove: { clauses: ["no-such-clause"] } }).success).toBe(false)
    expect(encodingPatch.safeParse({ rules: [{ key: "rules:1#max-height" }] }).success).toBe(false)
  })
})
