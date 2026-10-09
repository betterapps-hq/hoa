import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { RulesFile } from "@/schema/types"
import { rulesFile } from "@/schema/zod"

// The committed encoding of the sample Declaration (samples/declaration/rules.json), parsed once per test file. Every
// record in it is proposed.
let parsed: RulesFile | undefined

/** A fresh copy of the sample rules file, safe to change. */
export function sampleRulesFile(): RulesFile {
  parsed ??= rulesFile.parse(
    JSON.parse(readFileSync(join(import.meta.dirname, "../../samples/declaration/rules.json"), "utf8"))
  )
  return structuredClone(parsed)
}
