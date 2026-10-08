import type { WorkflowStep } from "cloudflare:workers"
import { NonRetryableError } from "cloudflare:workflows"
import { z } from "zod"
import { pipelinePrompts } from "@/ai/pipelinePrompts"
import type { PromptLoader } from "@/ai/promptLoader"
import { runObjectPrompt, type ModelFactory } from "@/ai/runPrompt"
import { buildPages, computeDocumentLayout } from "@/ocr/buildPages"
import { analyzeResultOf, layoutEngine, LayoutError, type LayoutClient } from "@/ocr/layoutClient"
import { layoutResultSchema } from "@/ocr/layoutResult"
import { pageSchema, type Page } from "@/ocr/page"
import { createObjectPromptCache, getJson, putJson, toHex } from "@/storage/objects"
import type { Presigner } from "@/storage/presign"

// The OCR steps shared by DocumentIngest and ApplicationReview (docs/design/ocr.md, "Flow"). Step names start with the
// stage id; inside ApplicationReview they also carry the file id.

export const rangeSize = 50
const maxPages = 300

export const modelStep = {
  retries: { limit: 3, delay: "10 seconds", backoff: "exponential" },
  timeout: "5 minutes"
} as const
const submitStep = { retries: { limit: 3, delay: "5 seconds", backoff: "exponential" }, timeout: "1 minute" } as const
const pollStep = { retries: { limit: 180, delay: "5 seconds", backoff: "constant" }, timeout: "30 seconds" } as const
export const storageStep = {
  retries: { limit: 2, delay: "1 second", backoff: "constant" },
  timeout: "1 minute"
} as const

export const visualDescriptionSchema = z.object({
  description: z.string(),
  measurements: z.array(z.object({ label: z.string(), value: z.string() }))
})

export const storedVisualSchema = visualDescriptionSchema.extend({
  figureId: z.string(),
  pageIndex: z.number().int(),
  promptVersion: z.union([z.number().int(), z.literal("fallback")])
})
export type StoredVisual = z.infer<typeof storedVisualSchema>

export type OcrKeys = {
  source: string
  ocr: (range: string) => string
  page: (pageIndex: number) => string
  layout: string
  figureImage: (figureId: string) => string
  figureDescription: (figureId: string) => string
  cache: (hash: string) => string
}

export type OcrFile = {
  /** Distinguishes step names when a workflow OCRs several files; empty for DocumentIngest. */
  stepSuffix: string
  documentId: string
  mediaType: string
  documentKind: string | null
  contextText: string | null
  keys: OcrKeys
}

export type OcrDependencies = {
  bucket: R2Bucket
  layout: LayoutClient
  presigner: Presigner | null
  ai: {
    loadPrompt: PromptLoader
    createModel: ModelFactory
    modelId: string
    environment: string
    flush: () => Promise<void>
  }
  promptVersions: Record<string, number | "fallback">
  sessionId: string
  /** Records the current stage on the job, as a step. */
  progress: (stage: string, done: number, total: number) => Promise<void>
}

export type OcrOutcome = { sha256: string; pageCount: number; figureFailures: { itemId: string; message: string }[] }

const name = (stage: string, file: OcrFile, ...parts: string[]) => [stage, ...parts].join(":") + file.stepSuffix

/** Workers' `crypto` has `DigestStream`; the DOM's `Crypto` type, which the app also loads, doesn't. */
function hasDigestStream(value: Crypto): value is Crypto & { DigestStream: typeof DigestStream } {
  return "DigestStream" in value
}

/** Hashes an object by streaming it, so a large PDF is never held in memory. */
export async function hashObject(bucket: R2Bucket, key: string) {
  const object = await bucket.get(key)
  if (!object) {
    throw new NonRetryableError(`The uploaded file is missing from storage (${key}).`)
  }
  if (!hasDigestStream(crypto)) {
    throw new Error("crypto.DigestStream is only available in Cloudflare's runtime.")
  }
  const digest = new crypto.DigestStream("SHA-256")
  await object.body.pipeTo(digest)
  return toHex(await digest.digest)
}

async function layoutSource(dependencies: OcrDependencies, key: string) {
  if (dependencies.presigner) {
    return { urlSource: await dependencies.presigner.download(key, 30 * 60) }
  }
  // Without an R2 token, Layout gets the file inline. Fine at demo sizes; see docs/design/documents.md, "Uploads".
  const object = await dependencies.bucket.get(key)
  if (!object) {
    throw new NonRetryableError(`The uploaded file is missing from storage (${key}).`)
  }
  const bytes = new Uint8Array(await object.arrayBuffer())
  let binary = ""
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return { base64Source: btoa(binary) }
}

function rethrowLayout(error: unknown): never {
  if (error instanceof LayoutError && !error.isRetryable) {
    throw new NonRetryableError(error.message)
  }
  throw error
}

/**
 * OCRs one file into page records, a document layout and figure descriptions. PDFs are read in 50-page ranges, one
 * after another, until a range comes back short. Figures that fail to describe are reported, not thrown.
 */
export async function runOcr(step: WorkflowStep, dependencies: OcrDependencies, file: OcrFile): Promise<OcrOutcome> {
  const { bucket, layout } = dependencies
  const sha256 = await step.do(name("ocr", file, "hash"), storageStep, () => hashObject(bucket, file.keys.source))
  const isPdf = file.mediaType === "application/pdf"

  const figures: { figureId: string; pageIndex: number; operationUrl: string }[] = []
  let sectionAtStart: string | null = null
  let pageCount = 0
  for (let start = 1; ; start += rangeSize) {
    const range = isPdf ? `${start}-${start + rangeSize - 1}` : "all"
    const operationUrl = await step.do(name("ocr", file, "submit", range), submitStep, async () =>
      layout.submit(await layoutSource(dependencies, file.keys.source), isPdf ? range : undefined).catch(rethrowLayout)
    )
    const rawKey = await step.do(name("ocr", file, "poll", range), pollStep, async () => {
      const text = await layout.poll(operationUrl).catch(rethrowLayout)
      await bucket.put(file.keys.ocr(range), text, { httpMetadata: { contentType: "application/json" } })
      return file.keys.ocr(range)
    })
    const written = await step.do(name("ocr", file, "pages", range), storageStep, async () => {
      const object = await bucket.get(rawKey)
      if (!object) {
        throw new Error(`The Layout response is missing (${rawKey}).`)
      }
      const result = layoutResultSchema.parse(analyzeResultOf(await object.text()))
      const pages = buildPages(result, {
        documentId: file.documentId,
        engine: layoutEngine,
        optionsHash: "markdown+figures",
        figureKey: file.keys.figureImage,
        sectionAtStart
      })
      // A Word file has no real pages: its text is stored as one page.
      const records = isPdf || pages.length <= 1 ? pages : [mergeWordPages(pages)]
      await Promise.all(records.map((page) => putJson(bucket, file.keys.page(page.pageIndex), page)))
      return {
        count: records.length,
        sectionAtEnd: records.at(-1)?.sectionAtTop ?? sectionAtStart,
        figures: records.flatMap((page) =>
          page.figures.map((figure) => ({ figureId: figure.id, pageIndex: page.pageIndex }))
        )
      }
    })
    pageCount += written.count
    sectionAtStart = written.sectionAtEnd
    figures.push(...written.figures.map((figure) => ({ ...figure, operationUrl })))
    if (!isPdf || written.count < rangeSize) {
      break
    }
    if (pageCount >= maxPages) {
      throw new NonRetryableError(`Only documents up to ${maxPages} pages are supported.`)
    }
  }

  await step.do(name("ocr", file, "labels"), storageStep, async () => {
    const pages = await loadPages(bucket, file.keys, pageCount)
    await putJson(bucket, file.keys.layout, computeDocumentLayout(pages))
  })

  await dependencies.progress("visuals", 0, file.mediaType.startsWith("image/") ? 1 : figures.length)
  const figureFailures = await describeVisuals(step, dependencies, file, figures)
  return { sha256, pageCount, figureFailures }
}

function mergeWordPages(pages: readonly Page[]): Page {
  const [first] = pages
  if (!first) {
    throw new Error("A Word file produced no text.")
  }
  const text = pages.map((page) => page.text).join("\n\n")
  return {
    ...first,
    pageIndex: 1,
    pageLabel: null,
    labelSource: null,
    text,
    normalizedText: pages.map((page) => page.normalizedText).join(" "),
    headings: [],
    checkboxes: pages.flatMap((page) => page.checkboxes),
    figures: [],
    lowConfidenceSpans: []
  }
}

export async function loadPages(bucket: R2Bucket, keys: Pick<OcrKeys, "page">, pageCount: number): Promise<Page[]> {
  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, index) => getJson(bucket, keys.page(index + 1), pageSchema))
  )
  return pages.filter((page): page is Page => page !== null)
}

async function describeImage(
  dependencies: OcrDependencies,
  file: OcrFile,
  image: { data: Uint8Array; mediaType: string; figureId: string; pageIndex: number; ocrText: string }
): Promise<StoredVisual> {
  const prompt = pipelinePrompts.visualDescription
  const result = await runObjectPrompt({
    loadPrompt: dependencies.ai.loadPrompt,
    createModel: dependencies.ai.createModel,
    defaultModelId: dependencies.ai.modelId,
    prompt,
    promptVersion: dependencies.promptVersions[prompt.name],
    schema: visualDescriptionSchema,
    variables: {
      documentKind: file.documentKind ?? "application file",
      contextText: file.contextText ?? "none",
      ocrText: image.ocrText || "none"
    },
    attachments: [{ type: "file", filename: `${image.figureId}.png`, mediaType: image.mediaType, data: image.data }],
    traceName: "visual-description",
    environment: dependencies.ai.environment,
    sessionId: dependencies.sessionId,
    cache: createObjectPromptCache(dependencies.bucket, file.keys.cache)
  })
  return { ...result.object, figureId: image.figureId, pageIndex: image.pageIndex, promptVersion: result.promptVersion }
}

async function describeVisuals(
  step: WorkflowStep,
  dependencies: OcrDependencies,
  file: OcrFile,
  figures: readonly { figureId: string; pageIndex: number; operationUrl: string }[]
) {
  const { bucket } = dependencies
  const items = file.mediaType.startsWith("image/")
    ? [{ figureId: "image", pageIndex: 1, operationUrl: null }]
    : figures
  const results = await Promise.allSettled(
    items.map((item) =>
      step.do(name("visuals", file, item.figureId), modelStep, async () => {
        let data: Uint8Array
        if (item.operationUrl) {
          data = new Uint8Array(await dependencies.layout.figure(item.operationUrl, item.figureId).catch(rethrowLayout))
          await bucket.put(file.keys.figureImage(item.figureId), data, { httpMetadata: { contentType: "image/png" } })
        } else {
          const object = await bucket.get(file.keys.source)
          if (!object) {
            throw new NonRetryableError("The uploaded image is missing from storage.")
          }
          data = new Uint8Array(await object.arrayBuffer())
        }
        const page = await getJson(bucket, file.keys.page(item.pageIndex), pageSchema)
        const visual = await describeImage(dependencies, file, {
          data,
          mediaType: item.operationUrl ? "image/png" : file.mediaType,
          figureId: item.figureId,
          pageIndex: item.pageIndex,
          ocrText: page?.text.slice(0, 4000) ?? ""
        })
        await putJson(bucket, file.keys.figureDescription(item.figureId), visual)
        await dependencies.ai.flush()
      })
    )
  )
  return results.flatMap((result, index) =>
    result.status === "rejected"
      ? [
          {
            itemId: items[index]?.figureId ?? "",
            message: result.reason instanceof Error ? result.reason.message : String(result.reason)
          }
        ]
      : []
  )
}
