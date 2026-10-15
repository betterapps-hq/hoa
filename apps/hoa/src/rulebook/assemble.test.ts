// @vitest-environment node
import { describe, expect, it } from "vitest"
import type { Term } from "@/schema/types"
import { createMemoryBucket } from "@/tests/memoryBucket"
import { approvedRecords, sampleRulesFile } from "@/tests/sampleRulesFile"
import { assembleRulesFile, InvalidRulesFileError, readRulesFile, writeRulesFile } from "./assemble"
import { sha256Hex } from "./canonical"

const organization = { id: "demo-hoa", name: "Sample community" }
const records = approvedRecords({
  file: sampleRulesFile(),
  organization,
  approvedBy: "admin",
  now: "2026-10-09T00:00:00Z"
})

describe("assembleRulesFile", () => {
  it("assembles a valid file, its canonical JSON and that JSON's hash", async () => {
    const assembled = await assembleRulesFile(records)

    expect(assembled.file.organization).toEqual(organization)
    expect(assembled.file.rules).toHaveLength(records.rules.length)
    expect(assembled.file.proposedCore.every((term) => term.organizationId === null)).toBe(true)
    expect(assembled.file.terms.every((term) => term.organizationId === organization.id)).toBe(true)
    expect(assembled.json.startsWith('{"documents":[')).toBe(true)
    expect(assembled.sha256).toBe(await sha256Hex(assembled.json))
  })

  it("gives the same hash for the same records in any order", async () => {
    const reversed = {
      ...records,
      documents: records.documents.toReversed(),
      terms: records.terms.toReversed(),
      rules: records.rules.toReversed(),
      questions: records.questions.toReversed()
    }
    expect((await assembleRulesFile(reversed)).sha256).toBe((await assembleRulesFile(records)).sha256)
  })

  it("leaves out records that aren't approved", async () => {
    const proposed: Term[] = records.terms
      .slice(0, 1)
      .map((term) => ({ ...term, key: "unused-term", review: { ...term.review, status: "proposed" } }))
    const assembled = await assembleRulesFile({ ...records, terms: [...records.terms, ...proposed] })
    expect(assembled.file.terms.map((term) => term.key)).not.toContain("unused-term")
  })

  it("refuses records that don't make a valid rulebook", async () => {
    const [first, ...rest] = records.rules
    const broken = { ...records, rules: first ? [{ ...first, appliesTo: ["residense"] }, ...rest] : rest }
    const error = await assembleRulesFile(broken).catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(InvalidRulesFileError)
    expect(error instanceof InvalidRulesFileError && error.issues).toEqual([
      { code: "undefined-term", message: "residense isn't a term", recordKey: first?.key, path: ["appliesTo", 0] }
    ])
  })
})

describe("the rules file in R2", () => {
  it("is written to the rulebook's key and read back with its hash checked", async () => {
    const { bucket, stored } = createMemoryBucket()
    const assembled = await assembleRulesFile(records)
    const ref = await writeRulesFile(bucket, "demo-hoa", "rb-1", assembled)

    expect(ref).toEqual({ fileKey: "hoas/demo-hoa/rulebooks/rb-1/rules.json", fileSha256: assembled.sha256 })
    expect(await readRulesFile(bucket, ref)).toEqual(assembled.file)

    stored.set(ref.fileKey, assembled.json.replace("Sample community", "Another community"))
    await expect(readRulesFile(bucket, ref)).rejects.toThrow("doesn't match its recorded SHA-256")
    await expect(readRulesFile(bucket, { ...ref, fileKey: "missing.json" })).rejects.toThrow("is missing")
  })
})
