import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, extname, join } from "node:path"
import { parseArgs } from "node:util"
import { createAiContext } from "../src/ai/aiContext.server.ts"
import { pipelinePrompts } from "../src/ai/pipelinePrompts.ts"
import { runObjectPrompt } from "../src/ai/runPrompt.ts"
import type { PacketFixture } from "../src/evaluation/review/packetFixture.ts"
import { buildPages, mergeWordPages } from "../src/ocr/buildPages.ts"
import { analyzeResultOf, createLayoutClient, LayoutNotReadyError, layoutEngine } from "../src/ocr/layoutClient.ts"
import { layoutResultSchema } from "../src/ocr/layoutResult.ts"
import type { Page } from "../src/ocr/page.ts"
import { visualDescriptionSchema } from "../src/ocr/visualDescription.ts"
import { extractWordPictures } from "../src/ocr/wordMedia.ts"

// OCRs local files with Azure Layout into page records under the git-ignored .fixtures/ocr/{name}/, for evaluation
// scripts that run pipeline stages in process. Usage, from apps/hoa:
//   pnpm ocr:fixture "../../.fixtures/drc-fence-application/Declarations of CCRs 12-04-2001.pdf" declaration
// writes pages.json for one governing document;
//   pnpm ocr:fixture --packet fence-application <pdf, docx, jpg or png>...
// reads an application packet as the review's OCR stage does: PDFs in 50-page ranges with their figures cropped,
// Word files whole with their embedded pictures taken out and read as images, and every image described by
// hoa-visual-description. It writes packet.json (the evaluation's packet fixture) and the images beside it. The
// packet names homeowners: nothing here prints its text.
const { values, positionals } = parseArgs({
  options: { packet: { type: "string" } },
  allowPositionals: true
})
const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT
const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY
if (!endpoint || !key) {
  throw new Error("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_KEY are required")
}

const rangeSize = 50
const client = createLayoutClient({ endpoint, key })
const ocrRoot = join(import.meta.dirname, "../../../.fixtures/ocr")
const mediaTypes: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png"
}

async function analyze(base64Source: string, range?: string) {
  const operationUrl = await client.submit({ base64Source }, range)
  for (;;) {
    try {
      return { text: await client.poll(operationUrl), operationUrl }
    } catch (error) {
      if (!(error instanceof LayoutNotReadyError)) {
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }
  }
}

/** Page records for one file: PDFs range by range, anything else at once. */
async function readPages(data: Uint8Array, documentId: string, isPdf: boolean, out: string) {
  const base64Source = Buffer.from(data).toString("base64")
  const pages: Page[] = []
  const figures: { figureId: string; pageIndex: number; operationUrl: string }[] = []
  for (let start = 1; ; start += rangeSize) {
    const range = isPdf ? `${start}-${start + rangeSize - 1}` : undefined
    const { text, operationUrl } = await analyze(base64Source, range)
    writeFileSync(join(out, `layout-${documentId}-${range ?? "all"}.json`), text)
    const built = buildPages(layoutResultSchema.parse(analyzeResultOf(text)), {
      documentId,
      engine: layoutEngine,
      optionsHash: "fixture",
      figureKey: (figureId) => `figures/${figureId}.png`,
      sectionAtStart: pages.at(-1)?.sectionAtTop ?? null
    })
    pages.push(...built)
    figures.push(
      ...built.flatMap((page) =>
        page.figures.map((figure) => ({ figureId: figure.id, pageIndex: page.pageIndex, operationUrl }))
      )
    )
    if (!isPdf || built.length < rangeSize) {
      break
    }
  }
  return { pages, figures }
}

if (values.packet) {
  const name = values.packet
  const out = join(ocrRoot, name)
  mkdirSync(join(out, "images"), { recursive: true })
  const ai = createAiContext()
  if (!ai.isConfigured) {
    throw new Error(`Missing settings: ${ai.missing.join(", ")}`)
  }
  const describe = async (data: Uint8Array, mediaType: string, contextText: string | null, ocrText: string) => {
    const result = await runObjectPrompt({
      loadPrompt: ai.loadPrompt,
      createModel: ai.createModel,
      defaultModelId: ai.modelId,
      prompt: pipelinePrompts.visualDescription,
      schema: visualDescriptionSchema,
      variables: { documentKind: "application file", contextText: contextText ?? "none", ocrText: ocrText || "none" },
      attachments: [{ type: "file", filename: "image", mediaType, data }],
      traceName: "visual-description",
      environment: ai.environment,
      sessionId: `ocr-fixture-${name}`
    })
    return { object: result.object, costUsd: result.costUsd ?? 0 }
  }

  const fixture: PacketFixture = { files: [] }
  let costUsd = 0
  const addImageFile = async (
    id: string,
    fileName: string,
    mediaType: string,
    data: Uint8Array,
    contextText: string | null
  ) => {
    const path = `images/${id}${extname(fileName)}`
    writeFileSync(join(out, path), data)
    const { pages } = await readPages(data, id, false, out)
    const text = pages.map((page) => page.text).join("\n")
    const described = await describe(data, mediaType, contextText, text)
    costUsd += described.costUsd
    fixture.files.push({
      id,
      fileName,
      mediaType,
      contextText,
      isReadable: true,
      pages: [{ text }],
      visuals: [{ figureId: "image", pageIndex: 1, ...described.object }],
      images: [{ pageIndex: 1, path, mediaType }]
    })
  }

  for (const [index, source] of positionals.entries()) {
    const id = `f${index + 1}`
    const fileName = basename(source)
    const mediaType = mediaTypes[extname(source).toLowerCase()]
    if (!mediaType) {
      throw new Error(`Unsupported file: ${fileName}`)
    }
    const data = new Uint8Array(readFileSync(source))
    if (mediaType.startsWith("image/")) {
      await addImageFile(id, fileName, mediaType, data, null)
      continue
    }
    const isPdf = mediaType === "application/pdf"
    const read = await readPages(data, id, isPdf, out)
    const pages = isPdf || read.pages.length <= 1 ? read.pages : [mergeWordPages(read.pages)]
    const visuals = []
    const images = []
    for (const figure of isPdf ? read.figures : []) {
      const image = new Uint8Array(await client.figure(figure.operationUrl, figure.figureId))
      const path = `images/${id}-${figure.figureId}.png`
      writeFileSync(join(out, path), image)
      const page = pages.find((item) => item.pageIndex === figure.pageIndex)
      const described = await describe(image, "image/png", null, page?.text.slice(0, 4000) ?? "")
      costUsd += described.costUsd
      visuals.push({ figureId: figure.figureId, pageIndex: figure.pageIndex, ...described.object })
      images.push({ pageIndex: figure.pageIndex, path, mediaType: "image/png" })
    }
    fixture.files.push({
      id,
      fileName,
      mediaType,
      contextText: null,
      isReadable: true,
      pages: pages.map((page) => ({ text: page.text })),
      visuals,
      images
    })
    // A Word file's pictures are files of their own, as the review's OCR stage makes them.
    if (!isPdf) {
      for (const picture of extractWordPictures(data)) {
        if (picture.mediaType) {
          const extension = picture.mediaType === "image/png" ? ".png" : ".jpg"
          await addImageFile(
            `${id}-p${picture.ordinal}`,
            `picture-${picture.ordinal}${extension}`,
            picture.mediaType,
            picture.data,
            picture.contextText
          )
        }
      }
    }
    console.warn(`${id}: ${pages.length} pages, ${visuals.length} figures`)
  }
  await ai.flush()
  writeFileSync(join(out, "packet.json"), `${JSON.stringify(fixture, null, 1)}\n`)
  console.warn(`${fixture.files.length} files written to ${out}; visual descriptions cost $${costUsd.toFixed(4)}`)
} else {
  const [source, name] = positionals
  if (!source || !name) {
    throw new Error("Usage: pnpm ocr:fixture <pdf> <name>, or pnpm ocr:fixture --packet <name> <file>...")
  }
  const out = join(ocrRoot, name)
  mkdirSync(out, { recursive: true })
  const { pages } = await readPages(new Uint8Array(readFileSync(source)), name, true, out)
  writeFileSync(join(out, "pages.json"), `${JSON.stringify(pages, null, 2)}\n`)
  console.warn(`${pages.length} pages written to ${out}`)
}
