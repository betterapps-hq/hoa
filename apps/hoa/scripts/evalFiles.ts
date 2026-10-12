import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import type { PromptCache } from "../src/ai/runPrompt.ts"

// Files the evaluation scripts share: the git-ignored .fixtures folder, JSON output and the model-result cache.

export const fixtures = join(import.meta.dirname, "../../../.fixtures")
export const encodingRuns = join(fixtures, "eval/encoding")

/** Writes a value as JSON and returns the text written. */
export function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true })
  const text = `${JSON.stringify(value, null, 1)}\n`
  writeFileSync(path, text)
  return text
}

export const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"))

/** Model results by content, shared by runs, so a rerun pays only for what changed. */
export function fileCache(stage: string): PromptCache {
  const path = (key: string) => join(encodingRuns, "cache", stage, `${key}.json`)
  return {
    // An entry that isn't JSON (an empty answer stored as "undefined") is a miss: the call runs again.
    get: async (key) => {
      if (!existsSync(path(key))) {
        return undefined
      }
      try {
        return readJson(path(key))
      } catch {
        return undefined
      }
    },
    put: async (key, value) => {
      if (value !== undefined) {
        writeJson(path(key), value)
      }
    }
  }
}
