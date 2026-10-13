import { describe, expect, it } from "vitest"
import { approvedReview, sampleRecords } from "@/tests/rulebookWorkspace"
import { approvableRefs, draftProgress, skippedParts } from "./DraftReview.utils"

/** The sample with every decision made: rules, terms, the settings, reasons for having no rule and answers. */
function decided() {
  const records = sampleRecords()
  return {
    ...records,
    terms: records.terms.map((term) => ({ ...term, review: approvedReview })),
    rules: records.rules.map((rule) => ({ ...rule, review: approvedReview })),
    settings: { ...records.settings, review: approvedReview },
    questions: records.questions.map((question) => ({
      ...question,
      answer: { option: 0, text: null, by: "admin", at: "2026-10-09T00:00:00Z" }
    })),
    provisions: records.provisions.map((provision) =>
      provision.noRule ? { ...provision, noRule: { ...provision.noRule, review: approvedReview } } : provision
    )
  }
}

describe("draftProgress", () => {
  it("counts every decision: rules, terms, reasons, answers and the settings", () => {
    const records = sampleRecords()
    const reasons = records.provisions.filter((provision) => provision.noRule !== null).length
    const total = records.rules.length + records.terms.length + reasons + records.questions.length + 1
    expect(draftProgress(records)).toEqual({ decided: 0, total })
    expect(draftProgress(decided())).toEqual({ decided: total, total })
  })
})

describe("approvableRefs", () => {
  it("lists what approving can decide, terms first, and leaves questions to their answers", () => {
    const records = sampleRecords()
    const left = approvableRefs(records)
    expect(left.terms).toHaveLength(records.terms.length)
    expect(left.rules).toHaveLength(records.rules.length)
    expect(left.settings).toEqual([{ type: "settings" }])
    expect(left.all[0]).toEqual({ type: "term", key: records.terms[0]?.key })
    expect(approvableRefs(decided()).all).toEqual([])
  })
})

describe("skippedParts", () => {
  it("says in a few words where the build skipped something, one line per place, linked to it", () => {
    const records = sampleRecords()
    const [provision] = records.provisions
    const [document] = records.documents
    const key = provision!.key
    const failures = [
      { stage: "structure-rules", itemId: `${key}#height`, message: "zod: imposedBy" },
      { stage: "structure-rules", itemId: `${key}#fine`, message: "zod: against" },
      { stage: "structure-rules", itemId: `${key}#height:retry-1`, message: "timed out" },
      { stage: "find-rules", itemId: key, message: "no answer" },
      { stage: "defined-terms", itemId: document!.key, message: "no answer" },
      { stage: "consolidate", itemId: "rulebook", message: "no answer" }
    ]
    const parts = skippedParts(failures, records)
    expect(parts.map((part) => [part.place?.label ?? null, part.text])).toEqual([
      [expect.any(String), "2 rules not drafted"],
      [expect.any(String), "some rules not drafted"],
      [expect.any(String), "not read for rules"],
      [document!.title, "defined terms not read"],
      [null, "Rules not checked for conflicts"]
    ])
    // Each place opens in the documents: a section at itself, a document at its start.
    expect(parts[0]?.place?.href).toMatch(new RegExp(`\\?provision=${encodeURIComponent(key)}$`))
    expect(parts[3]?.place?.href).toBe(`/documents/${encodeURIComponent(document!.key)}`)
  })
})
