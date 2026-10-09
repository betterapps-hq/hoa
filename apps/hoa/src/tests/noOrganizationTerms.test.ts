import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { z } from "zod"
import { coreTerms } from "@/schema/coreTerms"
import { organizationTerms } from "@/schema/examples.test-data"

// Fence or garage knowledge lives only in rulebook data: no string literal in the engine, review, pipeline, rulebook,
// encoding or text code may be an organization term's key (a term with an organizationId in samples/ or the schema's
// examples). Core keys are allowed, because portal code reads and writes core terms; a refinement keeps its core key.

const src = join(import.meta.dirname, "..")
const guardedFolders = ["engine", "review", "pipeline", "rulebook", "encoding", "text"]

// The first build's review files that phase 9 deletes (implementation-plan.md, 9.1). Every other file is guarded,
// including each new one; tests aren't, since fixtures name the sample's terms.
const firstBuild = new Set([
  "pipeline/catalogPrompt.ts",
  "pipeline/decide.ts",
  "pipeline/evaluate.ts",
  "pipeline/reviewInputs.ts"
])

const sampleTerms = z.object({ terms: z.array(z.object({ key: z.string(), organizationId: z.string().nullable() })) })

function organizationTermKeys() {
  const samples = join(src, "../samples")
  const files = readdirSync(samples, { recursive: true, encoding: "utf8" }).filter((file) =>
    file.endsWith("rules.json")
  )
  const terms = [
    ...organizationTerms,
    ...files.flatMap((file) => sampleTerms.parse(JSON.parse(readFileSync(join(samples, file), "utf8"))).terms)
  ]
  const core = new Set(coreTerms.map((term) => term.key))
  return new Set(terms.filter((term) => term.organizationId && !core.has(term.key)).map((term) => term.key))
}

// Comments are matched so that quotes inside them are skipped; only string and template literals are returned.
const tokens = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g

function stringLiterals(source: string) {
  return [...source.matchAll(tokens)]
    .map(([token]) => token)
    .filter((token) => !token.startsWith("/"))
    .map((token) => token.slice(1, -1))
}

function guardedFiles() {
  return guardedFolders
    .filter((folder) => existsSync(join(src, folder)))
    .flatMap((folder) =>
      readdirSync(join(src, folder), { recursive: true, encoding: "utf8" })
        .map((file) => `${folder}/${file.replaceAll("\\", "/")}`)
        .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file) && !firstBuild.has(file))
    )
}

describe("organization terms in code", () => {
  const keys = organizationTermKeys()

  it("reads the organization terms from the samples and the examples", () => {
    expect(keys).toContain("fence-run")
    expect(keys).toContain("residence")
    expect(keys).not.toContain("lot")
  })

  it("finds none in the engine, review, pipeline, rulebook, encoding or text code", () => {
    const found = guardedFiles().flatMap((file) =>
      stringLiterals(readFileSync(join(src, file), "utf8"))
        .filter((literal) => keys.has(literal))
        .map((literal) => `${file}: "${literal}"`)
    )
    expect(found).toEqual([])
  })

  it("would catch one", () => {
    const source = `// "gate" in a comment is fine\nconst kind = "fence-run"\nconst label = 'composite-color.teak'`
    expect(stringLiterals(source).filter((literal) => keys.has(literal))).toEqual(["fence-run", "composite-color.teak"])
  })
})
