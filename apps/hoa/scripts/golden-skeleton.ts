import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { parseArgs } from "node:util"
import { z } from "zod"
import { defaultDocumentStructure } from "../src/documents/documentStructure.ts"
import { governingDocumentKinds } from "../src/documents/governingDocument.ts"
import { cleanPages } from "../src/encoding/clean.ts"
import { structureDocument } from "../src/encoding/provisions.ts"
import { analyzeResultOf } from "../src/ocr/layoutClient.ts"
import { layoutResultSchema } from "../src/ocr/layoutResult.ts"
import { pageSchema } from "../src/ocr/page.ts"
import { rulesFile } from "../src/schema/zod.ts"

// Starts a golden encoding for another organization's governing document: structures its cached page records
// (git-ignored .fixtures/ocr/<fixture>, see ocr-fixture.ts) as the build's structure step does, and writes a rules file
// with those provisions and nothing encoded yet to the git-ignored .fixtures/goldens/<name>/rules.json, for the terms
// and rules to be filled in by hand. Other organizations' documents stay out of the repository. Usage, from apps/hoa:
//   pnpm golden:skeleton <name> <fixture> <kind> "<title>"
// Prints counts only.
const { positionals } = parseArgs({ allowPositionals: true })
const [name, fixture, kindOption, title] = positionals
const kind = z.enum(governingDocumentKinds).parse(kindOption)
if (!name || !fixture || !title) {
  throw new Error('Usage: pnpm golden:skeleton <name> <fixture> <kind> "<title>"')
}

const root = join(import.meta.dirname, "../../../.fixtures")
const folder = join(root, "ocr", fixture)
const pages = z.array(pageSchema).parse(JSON.parse(readFileSync(join(folder, "pages.json"), "utf8")))
const layouts = readdirSync(folder)
  .filter((file) => /^layout-.*\.json$/.test(file))
  .map((file) => layoutResultSchema.parse(analyzeResultOf(readFileSync(join(folder, file), "utf8"))))
const structure = defaultDocumentStructure(kind)
const documents = structureDocument(cleanPages(pages, layouts), { documentKey: structure.key, fileId: fixture })

// The sample's settings with everything that cites its documents emptied: a golden of terms and rules needs none.
const sample = rulesFile.parse(
  JSON.parse(readFileSync(join(import.meta.dirname, "../samples/declaration/rules.json"), "utf8"))
)
const { clauses } = sample.settings
const settings = {
  ...sample.settings,
  clauses: {
    ...clauses,
    precedence: { ...clauses.precedence, citations: [] },
    time: { ...clauses.time, citations: [] },
    liability: [],
    cure: null,
    deciders: [],
    sanctionPreconditions: []
  },
  issues: []
}

const golden = rulesFile.parse({
  organization: { id: `org-${name}`, name },
  documents: documents.map((document) => ({
    key: document.key,
    kind: structure.kind,
    title,
    issuedBy: null,
    governs: null,
    edition: null
  })),
  provisions: documents.flatMap((document) => document.provisions),
  terms: [],
  proposedCore: [],
  rules: [],
  settings,
  questions: []
})
const out = join(root, "goldens", name)
mkdirSync(out, { recursive: true })
writeFileSync(join(out, "rules.json"), `${JSON.stringify(golden, null, 1)}\n`)
console.warn(
  `${name}: ${documents.map((document) => `${document.key} (${document.provisions.length} provisions)`).join(", ")}`
)
