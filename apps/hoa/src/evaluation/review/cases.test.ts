import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { fenceRulesFile } from "@/tests/fenceSchemaFixture"
import { sampleRulesFile } from "@/tests/sampleRulesFile"
import { reviewCase } from "./cases"
import { toPacket } from "./packetFixture"
import { mergeRulesFiles } from "./rulesFile"

// The committed garage enclosure cases (samples/garage-enclosure/) load, and name only rules and terms the evaluation's
// rules file has.

const root = join(import.meta.dirname, "../../../samples/garage-enclosure")
const cases = readdirSync(root).map((name) =>
  reviewCase.parse(JSON.parse(readFileSync(join(root, name, "case.json"), "utf8")))
)
const rulesFile = mergeRulesFiles(sampleRulesFile(), fenceRulesFile())
const ruleKeys = new Set(rulesFile.rules.map((rule) => rule.key))
const termKeys = new Set([...rulesFile.terms, ...rulesFile.proposedCore].map((term) => term.key))

describe("the garage enclosure cases", () => {
  it("are the baseline and its three variants", () => {
    expect(cases.map((item) => item.id).toSorted()).toEqual([
      "garage-attic",
      "garage-baseline",
      "garage-fee-not-paid",
      "garage-replacement-plans"
    ])
  })

  it.each(cases)("$id names rules and properties the rules file has, and reads as a packet", (item) => {
    const findingRules = Object.keys(item.expected.findings).map((key) => key.split(" ")[0] ?? "")
    const itemRules = Object.values(item.expected.actionItems).flatMap((groups) => groups.map((group) => group.ruleKey))
    expect([...findingRules, ...itemRules].filter((key) => !ruleKeys.has(key))).toEqual([])
    expect(item.expected.facts.map((fact) => fact.property).filter((key) => !termKeys.has(key))).toEqual([])
    expect("files" in item.packet && toPacket(item.packet, async () => new Uint8Array()).files.length).toBeGreaterThan(
      5
    )
  })
})
