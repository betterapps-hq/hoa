import { describe, expect, it } from "vitest"
import { fenceRules, rulebook } from "@/tests/fixtures"
import { createRulebookStore, type JsonBucket } from "./rulebookStore.server"
import { formatCitation, rulesForProject } from "./rules"

describe("rules", () => {
  it("selects the rules for a project type", () => {
    expect(rulesForProject({ ...rulebook, rules: [...fenceRules] }, "fence")).toHaveLength(3)
  })

  it("formats citations, leaving out an unknown page", () => {
    expect(formatCitation(fenceRules[0]!.source)).toBe("Design Guidelines.pdf, 5.4.2, page 17")
    expect(formatCitation(fenceRules[2]!.source)).toBe("Design Guidelines.pdf, 5.3.2")
  })
})

function createBucket() {
  const objects = new Map<string, string>()
  const bucket: JsonBucket = {
    get: async (key) => {
      const text = objects.get(key)
      return text === undefined ? null : { json: async () => JSON.parse(text) }
    },
    put: async (key, value) => {
      objects.set(key, value)
    }
  }
  return { bucket, objects }
}

describe("createRulebookStore", () => {
  it("returns null before a rulebook is published, then round-trips the published rulebook", async () => {
    const { bucket, objects } = createBucket()
    const store = createRulebookStore(bucket)

    expect(await store.load()).toBeNull()
    await store.save(rulebook)
    expect(await store.load()).toEqual(rulebook)
    expect(JSON.parse(objects.get("prototype/rulebook.json") ?? "null")).toEqual(rulebook)
  })

  it("refuses to save an invalid rulebook", async () => {
    await expect(createRulebookStore(createBucket().bucket).save({ ...rulebook, hoaName: "" })).rejects.toThrow(
      "Too small: expected string to have >=1 characters"
    )
  })
})
