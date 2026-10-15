import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers"
import { NonRetryableError } from "cloudflare:workflows"
import { createAiContext } from "@/ai/aiContext.server"
import { pipelinePrompts } from "@/ai/pipelinePrompts"
import { resolvePromptVersions } from "@/ai/promptLoader"
import { createDatabase } from "@/db/database"
import { findDocumentByHash, getGoverningDocument, updateGoverningDocument } from "@/db/documentRepository"
import { getJob, updateJob } from "@/db/jobRepository"
import { env } from "@/env.server"
import { createLayoutClient } from "@/ocr/layoutClient"
import { governingKeys, organizationCacheKey } from "@/storage/keys"
import { getPresigner } from "@/storage/storage.server"
import { runOcr, storageStep } from "./ocrSteps.server"
import { requestRulebookBuildStep } from "./rulebookBuild.server"

export type DocumentIngestParams = { organizationId: string; documentId: string; jobId: string }

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

/** Optional R2 presigning: without a token, Layout gets files inline. */
function optionalPresigner() {
  try {
    return getPresigner()
  } catch {
    return null
  }
}

/**
 * OCRs a governing document when it's uploaded (docs/design/ocr.md, "Where it runs"): resolve prompts, OCR in ranges,
 * labels, figure descriptions; the document becomes ready, or failed with its error. A ready document requests a
 * rulebook build (encoding.md, Save draft), which starts once no other upload is still being read.
 */
export class DocumentIngest extends WorkflowEntrypoint<Env, DocumentIngestParams> {
  async run(event: WorkflowEvent<DocumentIngestParams>, step: WorkflowStep) {
    const { organizationId, documentId, jobId } = event.payload
    const db = createDatabase(this.env.DB)
    const progress = (stage: string, done = 0, total = 0) =>
      step.do(`progress:${stage}:${done}`, storageStep, () =>
        updateJob(db, organizationId, jobId, { stage, done, total, now: new Date().toISOString() })
      )
    let isReady = false
    try {
      const document = await step.do("load", storageStep, async () => {
        const found = await getGoverningDocument(db, organizationId, documentId)
        if (!found) {
          throw new NonRetryableError("The document no longer exists.")
        }
        return found
      })
      const ai = createAiContext()
      if (!ai.isConfigured) {
        throw new NonRetryableError(`Missing settings: ${ai.missing.join(", ")}.`)
      }
      if (!env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT || !env.AZURE_DOCUMENT_INTELLIGENCE_KEY) {
        throw new NonRetryableError(
          "Missing settings: AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_KEY."
        )
      }

      await progress("resolve-prompts")
      const promptVersions = await step.do("resolve-prompts", storageStep, async () => {
        const versions = await resolvePromptVersions(ai.loadPrompt, [pipelinePrompts.visualDescription])
        await updateJob(db, organizationId, jobId, { promptVersions: versions, now: new Date().toISOString() })
        return versions
      })

      await progress("ocr")
      const keys = governingKeys(organizationId, documentId)
      const outcome = await runOcr(
        step,
        {
          bucket: this.env.FILES,
          layout: createLayoutClient({
            endpoint: env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT,
            key: env.AZURE_DOCUMENT_INTELLIGENCE_KEY
          }),
          presigner: optionalPresigner(),
          ai,
          promptVersions,
          sessionId: jobId,
          progress: async (stage, done, total) => {
            await progress(stage, done, total)
          }
        },
        {
          stepSuffix: "",
          documentId,
          mediaType: document.mediaType,
          documentKind: document.kind,
          contextText: null,
          keys: {
            source: keys.source(document.fileName),
            ocr: (range) => keys.ocr("azure-layout", range),
            page: keys.page,
            layout: keys.layout(),
            figureImage: keys.figureImage,
            figureDescription: keys.figureDescription,
            cache: (hash) => organizationCacheKey(organizationId, "visual-description", hash)
          }
        }
      )

      isReady = await step.do("finish", storageStep, async () => {
        const duplicate = await findDocumentByHash(db, organizationId, outcome.sha256, documentId)
        const now = new Date().toISOString()
        if (duplicate) {
          const message = `Already uploaded as ${duplicate.title}, version ${duplicate.version}.`
          await updateGoverningDocument(db, organizationId, documentId, {
            status: "failed",
            sha256: outcome.sha256,
            error: { stage: "ocr", message, isRetryable: false }
          })
          await updateJob(db, organizationId, jobId, {
            status: "failed",
            error: { stage: "ocr", message, isRetryable: false },
            now
          })
          return false
        }
        await updateGoverningDocument(db, organizationId, documentId, {
          status: "ready",
          sha256: outcome.sha256,
          pageCount: outcome.pageCount
        })
        const failures = outcome.figureFailures.map((failure) => ({ stage: "visuals", ...failure }))
        await updateJob(db, organizationId, jobId, {
          status: failures.length > 0 ? "completed-with-errors" : "completed",
          stage: null,
          done: outcome.pageCount,
          total: outcome.pageCount,
          failures,
          now
        })
        return true
      })
    } catch (error) {
      await step.do("fail", storageStep, async () => {
        const failed = {
          stage: (await getJob(db, organizationId, jobId))?.stage ?? "ocr",
          message: errorText(error),
          isRetryable: !(error instanceof NonRetryableError)
        }
        await updateGoverningDocument(db, organizationId, documentId, { status: "failed", error: failed })
        await updateJob(db, organizationId, jobId, { status: "failed", error: failed, now: new Date().toISOString() })
      })
    }
    if (isReady) {
      await requestRulebookBuildStep(step, "build-rulebook", { db, binding: this.env.RULEBOOK_BUILD, organizationId })
    }
  }
}
