import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, join } from "node:path"
import { buildPages } from "../src/ocr/buildPages.ts"
import { analyzeResultOf, createLayoutClient, LayoutNotReadyError, layoutEngine } from "../src/ocr/layoutClient.ts"
import { layoutResultSchema } from "../src/ocr/layoutResult.ts"
import type { Page } from "../src/ocr/page.ts"

// OCRs a local PDF with Azure Layout into page records under the git-ignored .fixtures/ocr/{name}/, for evaluation
// scripts that run pipeline stages in process. Usage, from apps/hoa:
//   pnpm ocr:fixture "../../.fixtures/drc-fence-application/Declarations of CCRs 12-04-2001.pdf" declaration
const [source, name] = process.argv.slice(2)
if (!source || !name) {
  throw new Error("Usage: pnpm ocr:fixture <pdf> <name>")
}
const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT
const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY
if (!endpoint || !key) {
  throw new Error("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_KEY are required")
}

const rangeSize = 50
const out = join(import.meta.dirname, "../../../.fixtures/ocr", name)
mkdirSync(out, { recursive: true })
const client = createLayoutClient({ endpoint, key })
const base64Source = readFileSync(source).toString("base64")

async function analyze(range: string) {
  const operationUrl = await client.submit({ base64Source }, range)
  for (;;) {
    try {
      return await client.poll(operationUrl)
    } catch (error) {
      if (!(error instanceof LayoutNotReadyError)) {
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }
  }
}

const pages: Page[] = []
for (let start = 1; ; start += rangeSize) {
  const range = `${start}-${start + rangeSize - 1}`
  const text = await analyze(range)
  writeFileSync(join(out, `layout-${range}.json`), text)
  const result = layoutResultSchema.parse(analyzeResultOf(text))
  const built = buildPages(result, {
    documentId: name,
    engine: layoutEngine,
    optionsHash: "fixture",
    figureKey: (figureId) => `figures/${figureId}.png`,
    sectionAtStart: pages.at(-1)?.sectionAtTop ?? null
  })
  pages.push(...built)
  console.warn(`${basename(source)} ${range}: ${built.length} pages`)
  if (built.length < rangeSize) {
    break
  }
}
writeFileSync(join(out, "pages.json"), JSON.stringify(pages, null, 2) + "\n")
console.warn(`${pages.length} pages written to ${out}`)
