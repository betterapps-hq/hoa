import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers"
import { NonRetryableError } from "cloudflare:workflows"
import { createAiContext } from "@/ai/aiContext.server"
import { applicationReviewPrompts } from "@/ai/pipelinePrompts"
import { resolvePromptVersions } from "@/ai/promptLoader"
import {
  applicationRequestType,
  deleteAfterFor,
  type ApplicationFile,
  type ApplicationStatus
} from "@/applications/application"
import {
  createApplicationFile,
  getApplication,
  listApplicationFiles,
  saveReviewSummary,
  setPageKinds,
  transitionApplication,
  updateApplicationFile
} from "@/db/applicationRepository"
import { createDatabase } from "@/db/database"
import { getHoa } from "@/db/hoaRepository"
import { getJob, updateJob } from "@/db/jobRepository"
import { getPublishedRulesFile } from "@/db/rulebookContentRepository"
import { env } from "@/env.server"
import type { StepRunner } from "@/jobs/steps"
import { createLayoutClient } from "@/ocr/layoutClient"
import { extractWordPictures } from "@/ocr/wordMedia"
import { localDate } from "@/review/load"
import type { Review } from "@/review/reviewModel"
import { reviewApplication } from "@/review/run"
import { loadPacket } from "@/review/storedPacket"
import { readRulesFile } from "@/rulebook/assemble"
import { applicationKeys, jobStepKey } from "@/storage/keys"
import { createObjectPromptCache, getJson, putJson } from "@/storage/objects"
import { getPresigner } from "@/storage/storage.server"
import { loadPages, modelStep, runOcr, storageStep } from "./ocrSteps.server"

export type ApplicationReviewParams = {
  hoaId: string
  applicationId: string
  jobId: string
  /** The status to return to when the review fails. */
  previousStatus: ApplicationStatus
}

const wordMediaType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function optionalPresigner() {
  try {
    return getPresigner()
  } catch {
    return null
  }
}

/** The OCR keys for one application file. */
function fileOcrKeys(hoaId: string, applicationId: string, file: Pick<ApplicationFile, "id" | "fileName">) {
  const keys = applicationKeys(hoaId, applicationId)
  return {
    source: keys.source(file.id, file.fileName),
    ocr: (range: string) => keys.ocr(file.id, "azure-layout", range),
    page: (pageIndex: number) => keys.page(file.id, pageIndex),
    layout: `${keys.root}files/${file.id}/layout.json`,
    figureImage: (figureId: string) => keys.figureImage(file.id, figureId),
    figureDescription: (figureId: string) => keys.figureDescription(file.id, figureId),
    cache: (hash: string) => keys.cache("visual-description", hash)
  }
}

/**
 * Reviews an application packet against the published rulebook (application-review.md, Stages): resolve-prompts,
 * load and OCR here, then the stages in `reviewApplication`, each a step whose output goes to R2, then save-review.
 */
export class ApplicationReview extends WorkflowEntrypoint<Env, ApplicationReviewParams> {
  async run(event: WorkflowEvent<ApplicationReviewParams>, step: WorkflowStep) {
    const { hoaId, applicationId, jobId, previousStatus } = event.payload
    const db = createDatabase(this.env.DB)
    const bucket = this.env.FILES
    const keys = applicationKeys(hoaId, applicationId)
    const now = () => new Date().toISOString()
    // Step names must be unique: a stage can report the same count twice.
    const reported = new Map<string, number>()
    const progress = (stage: string, done = 0, total = 0) => {
      const name = `progress:${stage}:${done}:${total}`
      const count = (reported.get(name) ?? 0) + 1
      reported.set(name, count)
      return step.do(`${name}:${count}`, storageStep, () =>
        updateJob(db, hoaId, jobId, { stage, done, total, now: now() })
      )
    }
    const failures: { stage: string; itemId: string; message: string }[] = []

    try {
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
        const versions = await resolvePromptVersions(ai.loadPrompt, applicationReviewPrompts)
        await updateJob(db, hoaId, jobId, { promptVersions: versions, now: now() })
        return versions
      })

      // 2. Load: the application, the published rules file and the settings.
      await progress("load")
      const loaded = await step.do("load", storageStep, async () => {
        const application = await getApplication(db, hoaId, applicationId)
        if (!application) {
          throw new NonRetryableError("The application no longer exists.")
        }
        const rulesFile = await getPublishedRulesFile(db, hoaId)
        if (!rulesFile) {
          throw new NonRetryableError("The HOA hasn't published a rulebook yet.")
        }
        const hoa = await getHoa(db, hoaId)
        if (!hoa) {
          throw new NonRetryableError("The HOA no longer exists.")
        }
        return { application, rulesFile, settings: hoa.settings, startedAt: now() }
      })
      const { application } = loaded
      // The file is read on every replay, never stored in a step: it's checked against its hash each time.
      const rulesFile = await readRulesFile(bucket, loaded.rulesFile)

      // 3. OCR: pictures come out of Word files first, then every new file is read in parallel. Files read by an
      // earlier review are already ready and aren't read again.
      await progress("ocr")
      const topLevel = await step.do("ocr:list", storageStep, async () =>
        (await listApplicationFiles(db, hoaId, applicationId)).filter((file) => file.parentFileId === null)
      )
      for (const file of topLevel.filter((item) => item.status === "processing" && item.mediaType === wordMediaType)) {
        await step.do(`ocr:media:${file.id}`, storageStep, async () => {
          const source = await bucket.get(fileOcrKeys(hoaId, applicationId, file).source)
          if (!source) {
            throw new NonRetryableError(`${file.fileName} is missing from storage.`)
          }
          for (const picture of extractWordPictures(new Uint8Array(await source.arrayBuffer()))) {
            const childId = `${file.id}-p${picture.ordinal}`
            const fileName = picture.mediaType
              ? `picture-${picture.ordinal}.${picture.mediaType === "image/png" ? "png" : "jpg"}`
              : picture.fileName
            if (picture.mediaType) {
              await bucket.put(keys.source(childId, fileName), picture.data, {
                httpMetadata: { contentType: picture.mediaType }
              })
            }
            await createApplicationFile(db, {
              id: childId,
              hoaId,
              applicationId,
              parentFileId: file.id,
              ordinal: picture.ordinal,
              contextText: picture.contextText,
              fileName,
              mediaType: picture.mediaType ?? "application/octet-stream",
              sizeBytes: picture.data.byteLength,
              status: picture.mediaType ? "processing" : "unreadable",
              now: now()
            })
            if (!picture.mediaType) {
              await updateApplicationFile(db, hoaId, childId, {
                error: { stage: "ocr", message: "Unsupported image format.", isRetryable: false }
              })
            }
          }
        })
      }
      const toRead = await step.do("ocr:pending", storageStep, async () =>
        (await listApplicationFiles(db, hoaId, applicationId)).filter((file) => file.status === "processing")
      )
      await progress("ocr", 0, toRead.length)
      const layout = createLayoutClient({
        endpoint: env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT,
        key: env.AZURE_DOCUMENT_INTELLIGENCE_KEY
      })
      await Promise.all(
        toRead.map(async (file) => {
          try {
            const outcome = await runOcr(
              step,
              {
                bucket,
                layout,
                presigner: optionalPresigner(),
                ai,
                promptVersions,
                sessionId: jobId,
                progress: async () => undefined
              },
              {
                stepSuffix: `:${file.id}`,
                documentId: file.id,
                mediaType: file.mediaType,
                documentKind: null,
                contextText: file.contextText,
                keys: fileOcrKeys(hoaId, applicationId, file)
              }
            )
            failures.push(...outcome.figureFailures.map((failure) => ({ stage: "visuals", ...failure })))
            await step.do(`ocr:done:${file.id}`, storageStep, () =>
              updateApplicationFile(db, hoaId, file.id, {
                status: "ready",
                sha256: outcome.sha256,
                pageCount: outcome.pageCount
              })
            )
          } catch (error) {
            // A file Layout can't read is unreadable; the review goes on without it.
            failures.push({ stage: "ocr", itemId: file.id, message: errorText(error) })
            await step.do(`ocr:unreadable:${file.id}`, storageStep, () =>
              updateApplicationFile(db, hoaId, file.id, {
                status: "unreadable",
                error: { stage: "ocr", message: errorText(error), isRetryable: false }
              })
            )
          }
        })
      )
      const files = await step.do("ocr:files", storageStep, () => listApplicationFiles(db, hoaId, applicationId))
      const packet = await loadPacket(
        bucket,
        files,
        (file) => fileOcrKeys(hoaId, applicationId, file),
        (file) => loadPages(bucket, fileOcrKeys(hoaId, applicationId, file), file.pageCount ?? 0)
      )

      // 4 to 14. Each stage's steps keep their output in R2 (Workflows caps a step's output at 1 MiB) and read it back
      // through its schema, on replay too.
      const runStep: StepRunner = async (name, schema, run, kind = "code") => {
        await step.do(name, kind === "model" ? modelStep : storageStep, async () => {
          await putJson(bucket, jobStepKey(hoaId, jobId, name), await run())
          await ai.flush()
        })
        const output = await getJson(bucket, jobStepKey(hoaId, jobId, name), schema)
        if (output === null) {
          throw new Error(`The output of step ${name} is missing from storage.`)
        }
        return output
      }
      const result = await reviewApplication({
        organizationId: hoaId,
        rulesFile,
        application: {
          requestType: applicationRequestType,
          projectKind: application.projectKind,
          description: application.description,
          // A review before submission is provisional; one after the committee asked for more is judged as of
          // the original submission.
          submittedOn: application.submittedAt
            ? localDate(application.submittedAt, rulesFile.settings.clauses.time.zone)
            : null
        },
        packet,
        step: runStep,
        ai: {
          loadPrompt: ai.loadPrompt,
          createModel: ai.createModel,
          modelId: ai.modelId,
          smallModelId: ai.smallModelId,
          environment: ai.environment,
          sessionId: jobId,
          promptVersions,
          cache: (traceName) => createObjectPromptCache(bucket, (hash) => keys.cache(traceName, hash))
        },
        now: loaded.startedAt,
        progress
      })
      failures.push(...result.failures)

      // 15. Save: the review in R2, its summary in D1, the page types on the files, and the application reviewed.
      await progress("save-review")
      await step.do("save-review", storageStep, async () => {
        const createdAt = now()
        const review: Review = {
          id: jobId,
          applicationId,
          jobId,
          rulebookId: loaded.rulesFile.rulebookId,
          rulesFileSha256: loaded.rulesFile.fileSha256,
          request: result.request,
          provisional: result.provisional,
          selected: result.selected,
          documents: result.documents,
          normalizations: result.normalizations,
          judgments: result.judgments,
          conditionAnswers: result.conditionAnswers,
          findings: result.findings,
          recommendation: result.recommendation,
          changes: result.changes,
          missingInformation: result.missingInformation,
          committeeDecisions: result.committeeDecisions,
          suggestions: result.suggestions,
          assessment: result.assessment,
          feedback: result.feedback,
          promptVersions,
          costUsd: result.costUsd,
          durationMs: Date.parse(createdAt) - Date.parse(loaded.startedAt),
          sessionId: jobId,
          createdAt
        }
        await putJson(bucket, keys.review(review.id), review)
        for (const [fileId, types] of Object.entries(result.pageTypes)) {
          await setPageKinds(db, hoaId, fileId, types)
          const [first] = types
          await updateApplicationFile(db, hoaId, fileId, {
            kind: first && types.every((type) => type === first) ? first : null
          })
        }
        await saveReviewSummary(db, {
          id: review.id,
          hoaId,
          applicationId,
          jobId,
          rulebookId: review.rulebookId,
          rulesFileSha256: review.rulesFileSha256,
          recommendation: review.recommendation,
          costUsd: review.costUsd,
          sessionId: jobId,
          createdAt
        })
        await transitionApplication(db, hoaId, applicationId, ["reviewing"], {
          status: "reviewed",
          reviewId: review.id,
          updatedAt: createdAt,
          deleteAfter: deleteAfterFor(
            { status: "reviewed", updatedAt: createdAt, decision: application.decision, submittedAt: null },
            loaded.settings
          )
        })
        await updateJob(db, hoaId, jobId, {
          status: failures.length > 0 ? "completed-with-errors" : "completed",
          stage: null,
          failures,
          now: createdAt
        })
      })
    } catch (error) {
      await step.do("fail", storageStep, async () => {
        const failed = {
          stage: (await getJob(db, hoaId, jobId))?.stage ?? "load",
          message: errorText(error),
          isRetryable: !(error instanceof NonRetryableError)
        }
        // A failed review doesn't change the application's status (docs/design/documents.md, "Applications").
        await transitionApplication(db, hoaId, applicationId, ["reviewing"], {
          status: previousStatus,
          updatedAt: now()
        })
        await updateJob(db, hoaId, jobId, { status: "failed", error: failed, failures, now: now() })
      })
    }
  }
}
