import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers"
import { NonRetryableError } from "cloudflare:workflows"
import { createAiContext } from "@/ai/aiContext.server"
import { rulebookBuildPrompts } from "@/ai/pipelinePrompts"
import { resolvePromptVersions } from "@/ai/promptLoader"
import { recordScores } from "@/ai/scores"
import { createDatabase } from "@/db/database"
import { getDocumentStructures, getGoverningDocument } from "@/db/documentRepository"
import { getJob, updateJob } from "@/db/jobRepository"
import { getRulebookContent } from "@/db/rulebookContentRepository"
import { failRulebook, getRulebook, getRulebookByStatus } from "@/db/rulebookRepository"
import { defaultDocumentStructure, uploadEdition } from "@/documents/documentStructure"
import { buildRulebook } from "@/encoding/build"
import { buildScores } from "@/encoding/buildScores"
import type { StepRunner } from "@/jobs/steps"
import { saveBuiltDraft } from "@/rulebook/saveDraft"
import { governingKeys, hoaCacheKey, rulebookBuildKeys } from "@/storage/keys"
import { createObjectPromptCache, getJson, putJson } from "@/storage/objects"
import { loadPages, modelStep, storageStep } from "./ocrSteps.server"

export type RulebookBuildParams = { hoaId: string; rulebookId: string; jobId: string }

// An encoding call writes up to about 40,000 tokens and took five minutes on the sample (implementation-log.md).
const buildModelStep = { ...modelStep, timeout: "15 minutes" } as const

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Builds a draft rulebook from ready governing documents (encoding.md, Stages): resolve-prompts, then the stages in
 * `buildRulebook`, each a step whose output goes to R2, then save-draft. Review and publishing are server functions.
 */
export class RulebookBuild extends WorkflowEntrypoint<Env, RulebookBuildParams> {
  async run(event: WorkflowEvent<RulebookBuildParams>, step: WorkflowStep) {
    const { hoaId, rulebookId, jobId } = event.payload
    const db = createDatabase(this.env.DB)
    const bucket = this.env.FILES
    const now = () => new Date().toISOString()
    // Step names must be unique: the second repair round reports the same stage and counts as the first can.
    const reported = new Map<string, number>()
    const progress = (stage: string, done: number, total: number) => {
      const name = `progress:${stage}:${done}:${total}`
      const count = (reported.get(name) ?? 0) + 1
      reported.set(name, count)
      return step.do(`${name}:${count}`, storageStep, () =>
        updateJob(db, hoaId, jobId, { stage, done, total, now: now() })
      )
    }

    try {
      const ai = createAiContext()
      if (!ai.isConfigured) {
        throw new NonRetryableError(`Missing settings: ${ai.missing.join(", ")}.`)
      }
      const loaded = await step.do("load", storageStep, async () => {
        const rulebook = await getRulebook(db, hoaId, rulebookId)
        if (rulebook?.status !== "building") {
          throw new NonRetryableError("The rulebook isn't being built.")
        }
        const documents = await Promise.all(rulebook.sourceDocumentIds.map((id) => getGoverningDocument(db, hoaId, id)))
        const structures = await getDocumentStructures(db, hoaId, rulebook.sourceDocumentIds)
        const sources = documents.flatMap((document) =>
          document?.status === "ready" && document.sha256 && document.pageCount
            ? [
                {
                  documentId: document.id,
                  title: document.title,
                  uploadedBy: document.uploadedBy,
                  structure: structures.get(document.id) ?? defaultDocumentStructure(document.kind),
                  edition: uploadEdition({ ...document, sha256: document.sha256, pageCount: document.pageCount })
                }
              ]
            : []
        )
        if (sources.length === 0) {
          throw new NonRetryableError("None of the documents are ready.")
        }
        return { sources, startedAt: now() }
      })

      await progress("resolve-prompts", 0, 0)
      const promptVersions = await step.do("resolve-prompts", storageStep, async () => {
        const versions = await resolvePromptVersions(ai.loadPrompt, rulebookBuildPrompts)
        await updateJob(db, hoaId, jobId, { promptVersions: versions, now: now() })
        return versions
      })

      const outputs = rulebookBuildKeys(hoaId, jobId)
      // Step outputs can pass Workflows' 1 MiB limit, so each goes to R2 and is read back, on replay too.
      const runStep: StepRunner = async (name, schema, run, kind = "code") => {
        await step.do(name, kind === "model" ? buildModelStep : storageStep, async () => {
          await putJson(bucket, outputs.step(name), await run())
          await ai.flush()
        })
        const output = await getJson(bucket, outputs.step(name), schema)
        if (output === null) {
          throw new Error(`The output of step ${name} is missing from storage.`)
        }
        return output
      }
      const published = await getRulebookByStatus(db, hoaId, "published")
      const result = await buildRulebook({
        organizationId: hoaId,
        sources: loaded.sources.map((source) => ({
          ...source,
          loadPages: () =>
            loadPages(bucket, governingKeys(hoaId, source.documentId), source.edition.files[0]?.pages ?? 0)
        })),
        step: runStep,
        ai: {
          loadPrompt: ai.loadPrompt,
          createModel: ai.createModel,
          modelId: ai.modelId,
          environment: ai.environment,
          sessionId: jobId,
          promptVersions,
          cache: (stage) => createObjectPromptCache(bucket, (hash) => hoaCacheKey(hoaId, stage, hash))
        },
        previous: published ? await getRulebookContent(db, hoaId, published.id) : null,
        now: loaded.startedAt,
        progress
      })

      await progress("save-draft", 0, 1)
      await step.do("save-draft", storageStep, async () => {
        await saveBuiltDraft(db, hoaId, {
          rulebookId,
          documents: { uploads: result.documents, referenced: result.referencedDocuments },
          content: result.content,
          recordedBy: loaded.sources[0]?.uploadedBy ?? "rulebook-build",
          now: loaded.startedAt
        })
      })
      await step.do("save-draft:scores", storageStep, async () => {
        await recordScores({
          traceName: "rulebook-build",
          sessionId: jobId,
          input: { rulebookId, documents: loaded.sources.map((source) => source.structure.key) },
          output: { units: result.report.units.length, failures: result.failures },
          scores: buildScores(result),
          recorder: ai.scores
        })
        await ai.flush()
      })
      await step.do("save-draft:finish", storageStep, async () => {
        const { rules } = result.content
        await updateJob(db, hoaId, jobId, {
          status: result.failures.length > 0 ? "completed-with-errors" : "completed",
          stage: null,
          done: rules.length,
          total: rules.length,
          failures: result.failures,
          now: now()
        })
      })
    } catch (error) {
      await step.do("fail", storageStep, async () => {
        const failed = {
          stage: (await getJob(db, hoaId, jobId))?.stage ?? "build",
          message: errorText(error),
          isRetryable: !(error instanceof NonRetryableError)
        }
        await failRulebook(db, hoaId, rulebookId, failed)
        await updateJob(db, hoaId, jobId, { status: "failed", error: failed, now: now() })
      })
    }
  }
}
