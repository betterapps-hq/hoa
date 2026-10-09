import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers"
import { NonRetryableError } from "cloudflare:workflows"
import type { z } from "zod"
import { createAiContext } from "@/ai/aiContext.server"
import { pipelinePrompts } from "@/ai/pipelinePrompts"
import { resolvePromptVersions } from "@/ai/promptLoader"
import type { PromptDefinition, PromptVariables } from "@/ai/prompts"
import { runObjectPrompt, type PromptAttachment } from "@/ai/runPrompt"
import { deleteAfterFor, type ApplicationFile, type ApplicationStatus } from "@/applications/application"
import {
  createApplicationFile,
  getApplication,
  listApplicationFiles,
  saveReviewSummary,
  setPageKinds,
  transitionApplication,
  updateApplicationFile
} from "@/db/applicationRepository"
import { createDatabase, type Database } from "@/db/database"
import { getHoa } from "@/db/hoaRepository"
import { getJob, updateJob } from "@/db/jobRepository"
import { getRulebookByStatus, listRules } from "@/db/rulebookRepository"
import { env } from "@/env.server"
import { createLayoutClient } from "@/ocr/layoutClient"
import { extractWordPictures } from "@/ocr/wordMedia"
import { catalogForPrompt, truncate } from "@/pipeline/catalogPrompt"
import { decide } from "@/pipeline/decide"
import { evaluateRules, planQualitativeChecks, qualitativeKey, type QualitativeResult } from "@/pipeline/evaluate"
import {
  actionItemsForPrompt,
  allowedValuesForPrompt,
  checkboxesForPrompt,
  classificationSchema,
  documentsOutputSchema,
  factsOutputSchema,
  fileKindOf,
  findingsForWriter,
  informationalRulesForPrompt,
  ownersOfRecord,
  pagesForPrompt,
  phraseItems,
  qualitativeOutputSchema,
  requirementsForPrompt,
  textConditionsForPrompt,
  writerOutputSchema,
  type FilePages
} from "@/pipeline/reviewInputs"
import type { Review } from "@/review/reviewModel"
import { applicationFileKinds, projectTypes } from "@/rules/catalog"
import { applicationKeys } from "@/storage/keys"
import { createObjectPromptCache, getJson, putJson } from "@/storage/objects"
import { getPresigner } from "@/storage/storage.server"
import { loadPages, modelStep, runOcr, storageStep, storedVisualSchema } from "./ocrSteps.server"

export type ApplicationReviewParams = {
  hoaId: string
  applicationId: string
  jobId: string
  /** The status to return to when the review fails. */
  previousStatus: ApplicationStatus
}

const wordMediaType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
const maxImages = 20
const maxPagesCharacters = 200_000

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

/** Every readable file's pages, figure descriptions and page kinds, in packet order. */
async function loadPacket(
  db: Database,
  bucket: R2Bucket,
  hoaId: string,
  applicationId: string,
  kinds: ReadonlyMap<string, readonly string[]> = new Map()
): Promise<FilePages[]> {
  const files = (await listApplicationFiles(db, hoaId, applicationId)).filter(
    (file) => file.status === "ready" || file.status === "unreadable"
  )
  return Promise.all(
    files.map(async (file) => {
      const keys = fileOcrKeys(hoaId, applicationId, file)
      const pages = file.status === "ready" ? await loadPages(bucket, keys, file.pageCount ?? 0) : []
      const figureIds = file.mediaType.startsWith("image/")
        ? ["image"]
        : pages.flatMap((page) => page.figures.map((figure) => figure.id))
      const visuals = (
        await Promise.all(
          figureIds.map((figureId) => getJson(bucket, keys.figureDescription(figureId), storedVisualSchema))
        )
      ).filter((visual) => visual !== null)
      const fileKinds = kinds.get(file.id) ?? []
      return {
        file,
        pages,
        visuals,
        kinds: new Map(
          fileKinds.flatMap((kind, index) => {
            const match = applicationFileKinds.find((item) => item === kind)
            return match ? [[index + 1, match] as const] : []
          })
        )
      }
    })
  )
}

/** The packet's images for the facts call, in order: uploaded pictures and figures cropped from pages. */
async function loadImages(bucket: R2Bucket, hoaId: string, applicationId: string, packet: readonly FilePages[]) {
  const sources = packet.flatMap(({ file, pages }) => {
    const keys = fileOcrKeys(hoaId, applicationId, file)
    if (file.status !== "ready") {
      return []
    }
    if (file.mediaType.startsWith("image/")) {
      return [{ key: keys.source, name: file.fileName, mediaType: file.mediaType }]
    }
    return pages.flatMap((page) =>
      page.figures.map((figure) => ({
        key: keys.figureImage(figure.id),
        name: `${file.id}-${figure.id}.png`,
        mediaType: "image/png"
      }))
    )
  })
  const images = await Promise.all(
    sources.slice(0, maxImages).map(async (source): Promise<PromptAttachment | null> => {
      const object = await bucket.get(source.key)
      return object
        ? {
            type: "file",
            filename: source.name,
            mediaType: source.mediaType,
            data: new Uint8Array(await object.arrayBuffer())
          }
        : null
    })
  )
  return images.filter((image) => image !== null)
}

/**
 * Reviews an application packet against the published rulebook (docs/design/review.md, "Stages"): OCR and images,
 * classification, facts, documents, then code evaluates and decides, and the writer explains. Model results are cached
 * per application, so a re-run after adding one file only pays for what changed.
 */
export class ApplicationReview extends WorkflowEntrypoint<Env, ApplicationReviewParams> {
  async run(event: WorkflowEvent<ApplicationReviewParams>, step: WorkflowStep) {
    const { hoaId, applicationId, jobId, previousStatus } = event.payload
    const db = createDatabase(this.env.DB)
    const bucket = this.env.FILES
    const keys = applicationKeys(hoaId, applicationId)
    const now = () => new Date().toISOString()
    const progress = (stage: string, done = 0, total = 0) =>
      step.do(`progress:${stage}:${done}`, storageStep, () =>
        updateJob(db, hoaId, jobId, { stage, done, total, now: now() })
      )
    const failures: { stage: string; itemId: string; message: string }[] = []
    let costUsd = 0

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
      const loaded = await step.do("load", storageStep, async () => {
        const application = await getApplication(db, hoaId, applicationId)
        if (!application) {
          throw new NonRetryableError("The application no longer exists.")
        }
        const rulebook = await getRulebookByStatus(db, hoaId, "published")
        if (!rulebook?.version) {
          throw new NonRetryableError("The HOA hasn't published a rulebook yet.")
        }
        const rules = (await listRules(db, hoaId, rulebook.id)).filter(
          (rule) => rule.review.status === "approved" && rule.projectTypes.includes(application.projectType)
        )
        const hoa = await getHoa(db, hoaId)
        if (!hoa) {
          throw new NonRetryableError("The HOA no longer exists.")
        }
        return { application, rulebook: { id: rulebook.id, version: rulebook.version }, rules, settings: hoa.settings }
      })
      const { application, rules } = loaded

      await progress("resolve-prompts")
      const prompts = [
        pipelinePrompts.visualDescription,
        pipelinePrompts.fileClassification,
        pipelinePrompts.factExtraction,
        pipelinePrompts.documentCheck,
        pipelinePrompts.qualitativeCheck,
        pipelinePrompts.reviewWriter
      ]
      const promptVersions = await step.do("resolve-prompts", storageStep, async () => {
        const versions = await resolvePromptVersions(ai.loadPrompt, prompts)
        await updateJob(db, hoaId, jobId, { promptVersions: versions, now: now() })
        return versions
      })
      const run = async <T, Prompt extends PromptDefinition>(
        prompt: Prompt,
        options: {
          schema: z.ZodType<T>
          variables: PromptVariables<Prompt>
          attachments?: PromptAttachment[]
          small?: boolean
          traceName: string
        }
      ) => {
        const result = await runObjectPrompt({
          loadPrompt: ai.loadPrompt,
          createModel: ai.createModel,
          defaultModelId: options.small ? ai.smallModelId : ai.modelId,
          prompt,
          promptVersion: promptVersions[prompt.name],
          schema: options.schema,
          variables: options.variables,
          attachments: options.attachments,
          traceName: options.traceName,
          environment: ai.environment,
          sessionId: jobId,
          cache: createObjectPromptCache(bucket, (hash) => keys.cache(options.traceName, hash))
        })
        await ai.flush()
        return { object: result.object, costUsd: result.costUsd ?? 0 }
      }

      // OCR: pictures come out of Word files first, then every new file is read in parallel. Files read by an earlier
      // review are already ready and aren't read again.
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
              await bucket.put(applicationKeys(hoaId, applicationId).source(childId, fileName), picture.data, {
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

      // Classify each page with the small model.
      const readable = (await loadPacket(db, bucket, hoaId, applicationId)).filter(
        ({ file }) => file.status === "ready"
      )
      await progress("classify", 0, readable.length)
      const kinds = new Map<string, string[]>()
      for (const { file, pages, visuals } of readable) {
        const fileKinds = await step.do(`classify:${file.id}`, modelStep, async () => {
          const results = await Promise.all(
            pages.map(async (page) => {
              try {
                const result = await run(pipelinePrompts.fileClassification, {
                  schema: classificationSchema,
                  small: true,
                  traceName: "file-classification",
                  variables: {
                    fileKinds: applicationFileKinds.join(", "),
                    contextText: file.contextText ?? "none",
                    visualDescriptions:
                      visuals
                        .filter((visual) => visual.pageIndex === page.pageIndex)
                        .map((visual) => visual.description)
                        .join("\n") || "none",
                    checkboxCount: String(page.checkboxes.length),
                    pageText: truncate(page.text, 12_000) || "[no text]"
                  }
                })
                return { kind: result.object.kind, costUsd: result.costUsd }
              } catch {
                return { kind: "other" as const, costUsd: 0 }
              }
            })
          )
          const pageKinds = results.map((result) => result.kind)
          await setPageKinds(db, hoaId, file.id, pageKinds)
          await updateApplicationFile(db, hoaId, file.id, { kind: fileKindOf(pageKinds) })
          return { kinds: pageKinds, costUsd: results.reduce((sum, result) => sum + result.costUsd, 0) }
        })
        kinds.set(file.id, fileKinds.kinds)
        costUsd += fileKinds.costUsd
      }
      const packet = await loadPacket(db, bucket, hoaId, applicationId, kinds)
      const pages = truncate(pagesForPrompt(packet), maxPagesCharacters)

      await progress("facts")
      const facts = await step.do("facts", modelStep, async () => {
        const result = await run(pipelinePrompts.factExtraction, {
          schema: factsOutputSchema,
          traceName: "fact-extraction",
          variables: {
            projectType: projectTypes[application.projectType].label,
            catalog: catalogForPrompt(application.projectType),
            allowedValues: allowedValuesForPrompt(rules),
            textConditions: textConditionsForPrompt(rules),
            description: application.description ?? "none",
            pages
          },
          attachments: await loadImages(bucket, hoaId, applicationId, packet)
        })
        return { ...result.object, costUsd: result.costUsd }
      })
      costUsd += facts.costUsd

      await progress("documents")
      const documents = await step.do("documents", modelStep, async () => {
        const result = await run(pipelinePrompts.documentCheck, {
          schema: documentsOutputSchema,
          traceName: "document-check",
          variables: {
            requirements: requirementsForPrompt(application.projectType, rules, facts.components),
            ownersOfRecord: ownersOfRecord(facts.facts),
            checkboxes: checkboxesForPrompt(packet),
            pages
          }
        })
        return { documents: result.object.documents, costUsd: result.costUsd }
      })
      costUsd += documents.costUsd

      // Evaluate: one model call per applicable qualitative check, then code decides every finding.
      const input = {
        projectType: application.projectType,
        rules,
        components: facts.components,
        facts: facts.facts,
        conditionAnswers: facts.conditions,
        documents: documents.documents
      }
      const planned = planQualitativeChecks(input)
      await progress("evaluate", 0, planned.length)
      const qualitative = new Map<string, QualitativeResult>()
      for (const [index, { rule, componentId }] of planned.entries()) {
        try {
          const result = await step.do(`evaluate:${rule.id}:${componentId ?? "project"}`, modelStep, async () => {
            const component = facts.components.find((item) => item.id === componentId)
            const relevant = facts.facts.filter((fact) => fact.componentId === componentId || fact.componentId === null)
            const answer = await run(pipelinePrompts.qualitativeCheck, {
              schema: qualitativeOutputSchema,
              traceName: "qualitative-check",
              variables: {
                ruleStatement: rule.statement,
                criterion: rule.check.type === "qualitative" ? rule.check.criterion : rule.statement,
                component: component ? `${component.id}: ${component.label}` : "the whole project",
                facts: JSON.stringify(relevant),
                evidencePages: pages
              }
            })
            return answer
          })
          qualitative.set(qualitativeKey(rule.id, componentId), result.object)
          costUsd += result.costUsd
        } catch (error) {
          // A failed qualitative call leaves the finding to the committee ("automatic check failed").
          failures.push({
            stage: "evaluate",
            itemId: `${rule.id}:${componentId ?? "project"}`,
            message: errorText(error)
          })
        }
        await progress("evaluate", index + 1, planned.length)
      }
      const findings = await step.do("evaluate", storageStep, async () => evaluateRules({ ...input, qualitative }))

      await progress("decide")
      const decision = decide(findings, rules, loaded.settings)

      await progress("write")
      const written = await step.do("write", modelStep, async () => {
        const result = await run(pipelinePrompts.reviewWriter, {
          schema: writerOutputSchema,
          traceName: "review-writer",
          variables: {
            recommendation: decision.recommendation,
            findings: findingsForWriter(findings, rules),
            facts: JSON.stringify(facts.facts),
            actionItems: actionItemsForPrompt(decision),
            informationalRules: informationalRulesForPrompt(rules)
          }
        })
        return { ...result.object, costUsd: result.costUsd }
      })
      costUsd += written.costUsd

      await progress("save-review")
      await step.do("save-review", storageStep, async () => {
        const job = await getJob(db, hoaId, jobId)
        const createdAt = now()
        const review: Review = {
          id: jobId,
          applicationId,
          jobId,
          rulebookId: loaded.rulebook.id,
          rulebookVersion: loaded.rulebook.version,
          components: facts.components,
          facts: facts.facts,
          conditionAnswers: facts.conditions,
          documents: documents.documents,
          findings,
          recommendation: decision.recommendation,
          changes: phraseItems(decision.changes, written.items),
          missingInformation: phraseItems(decision.missingInformation, written.items),
          committeeDecisions: phraseItems(decision.committeeDecisions, written.items),
          assessment: written.assessment,
          feedback: written.feedback,
          promptVersions,
          costUsd,
          durationMs: job ? Date.parse(createdAt) - Date.parse(job.createdAt) : 0,
          sessionId: jobId,
          createdAt
        }
        await putJson(bucket, keys.review(review.id), review)
        await saveReviewSummary(db, {
          id: review.id,
          hoaId,
          applicationId,
          jobId,
          rulebookId: review.rulebookId,
          // The first build's reviews read rules from D1, not a rules file.
          rulesFileSha256: null,
          recommendation: review.recommendation,
          costUsd,
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
