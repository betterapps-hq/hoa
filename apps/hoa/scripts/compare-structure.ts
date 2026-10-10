import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"
import { checkStructure } from "../src/encoding/check.ts"
import { cleanPages } from "../src/encoding/clean.ts"
import { structureDocument } from "../src/encoding/provisions.ts"
import { compareProvisions, splitMembership } from "../src/evaluation/encoding/provisions.ts"
import { analyzeResultOf } from "../src/ocr/layoutClient.ts"
import { layoutResultSchema } from "../src/ocr/layoutResult.ts"
import { pageSchema } from "../src/ocr/page.ts"
import { rulesFile } from "../src/schema/zod.ts"
import { splitSelectors } from "./encodingSplits.ts"

// Runs structure on the sample Declaration's cached page records (git-ignored .fixtures/ocr/declaration, see
// ocr-fixture.ts) with Exhibit C as its own document, and compares the provisions with the committed golden encoding
// (samples/declaration/rules.json): keys, then text similarity of each matched provision. Prints keys and scores
// only. Usage, from apps/hoa: pnpm structure:compare [--show <key>]...
const fixtures = join(import.meta.dirname, "../../../.fixtures/ocr/declaration")
const pages = z.array(pageSchema).parse(JSON.parse(readFileSync(join(fixtures, "pages.json"), "utf8")))
const layouts = readdirSync(fixtures)
  .filter((file) => /^layout-.*\.json$/.test(file))
  .map((file) => layoutResultSchema.parse(analyzeResultOf(readFileSync(join(fixtures, file), "utf8"))))
const clean = cleanPages(pages, layouts)
const documents = structureDocument(clean, {
  documentKey: "declaration",
  fileId: "declaration",
  exhibitDocuments: { C: "use-restrictions" }
})
// The golden provisions of the documents structured here (the golden also encodes part of the Design Guidelines).
const structured = new Set(documents.map((document) => document.key))
const golden = rulesFile
  .parse(JSON.parse(readFileSync(join(import.meta.dirname, "../samples/declaration/rules.json"), "utf8")))
  .provisions.filter((provision) => structured.has(provision.key.slice(0, provision.key.indexOf(":"))))
const check = checkStructure(clean, documents)
const ours = documents.flatMap((document) => document.provisions)

const byKey = new Map(ours.map((provision) => [provision.key, provision]))
const { matched, missing, extra, similarity: average } = compareProvisions(golden, ours)
const sameHeading = matched.filter(({ golden: g, ours: o }) => (g.heading ?? "") === (o.heading ?? "")).length
const sameIntro = matched.filter(({ golden: g, ours: o }) => (g.intro === null) === (o.intro === null)).length
const percent = (count: number, of: number) => `${((100 * count) / Math.max(of, 1)).toFixed(1)}%`

console.warn(`documents: ${documents.map((document) => `${document.key} (${document.provisions.length})`).join(", ")}`)
console.warn(`check: ${(check.outside * 100).toFixed(2)}% outside provisions; repair needed: ${check.needsRepair}`)
for (const problem of check.problems) {
  console.warn(`  ${problem.code}: ${problem.message}`)
}
console.warn(`golden keys matched: ${matched.length}/${golden.length} (${percent(matched.length, golden.length)})`)
console.warn(`average text similarity of matched provisions: ${average.toFixed(4)}`)
for (const name of ["dev", "test"]) {
  const inSplit = splitMembership([...golden, ...ours], splitSelectors(name) ?? [])
  const keys = golden.filter((provision) => inSplit(provision.key))
  const { matched: found, similarity: score } = compareProvisions(keys, ours)
  console.warn(
    `  ${name}: ${found.length}/${keys.length} keys (${percent(found.length, keys.length)}), similarity ${score.toFixed(4)}`
  )
}
console.warn(
  `same heading: ${percent(sameHeading, matched.length)}; intro present in both or neither: ${percent(sameIntro, matched.length)}`
)
console.warn(`missing (${missing.length}): ${missing.join("  ")}`)
console.warn(`extra (${extra.length}): ${extra.join("  ")}`)
const low = matched.filter(({ score }) => score < 0.9).toSorted((a, b) => a.score - b.score)
console.warn(
  `below 0.9 (${low.length}): ${low.map(({ golden: g, score }) => `${g.key} ${score.toFixed(2)}`).join("  ")}`
)

const args = process.argv.slice(2)
for (const [index, arg] of args.entries()) {
  const key = args[index + 1]
  if (arg !== "--show" || !key) {
    continue
  }
  for (const [name, provision] of [
    ["golden", golden.find((p) => p.key === key)],
    ["ours", byKey.get(key)]
  ] as const) {
    console.warn(
      `\n── ${name} ${key}\n${provision ? JSON.stringify({ ...provision, anchors: undefined }, null, 1) : "none"}`
    )
  }
}
