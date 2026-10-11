import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers"
import { NonRetryableError } from "cloudflare:workflows"
import { createAiContext } from "@/ai/aiContext.server"
import { rulebookBuildPrompts } from "@/ai/pipelinePrompts"
import { resolvePromptVersions } from "@/ai/promptLoader"
import { recordScores } from "@/ai/scores"
import { createDatabase, type Database } from "@/db/database"
import { listDocumentRecords, listProvisions } from "@/db/documentRepository"
import { getJob, reportJobProgress, updateJob } from "@/db/jobRepository"
import { getRulebookContent } from "@/db/rulebookContentRepository"
import { failRulebook, getRulebook, getRulebookByStatus } from "@/db/rulebookRepository"
import { buildRulebook, buildStages, optionalBuildStages } from "@/encoding/build"
import { buildScores } from "@/encoding/buildScores"
import { SourcesRejectedError } from "@/encoding/sourceCheck"
import { finishProgress, startProgress } from "@/jobs/progress"
import type { StepRunner } from "@/jobs/steps"
import { loadBuildSources } from "@/rulebook/buildSources"
import type { PreviousReview } from "@/rulebook/carryForward"
import { saveBuiltDraft } from "@/rulebook/saveDraft"
import { governingKeys, hoaCacheKey, rulebookBuildKeys } from "@/storage/keys"
import { createObjectPromptCache, getJson, putJson } from "@/storage/objects"
import { loadPages } from "@/storage/pages"
import { modelStep, storageStep } from "./ocrSteps.server"
import {
  abandonRulebookBuild,
  newBuildIds,
  requestRulebookBuild,
  type BuildRequest,
  type RulebookBuildBinding
} from "./rulebookTrigger.server"

export type RulebookBuildParams = { hoaId: string; rulebookId: string; jobId: string }

// A model step may make a call and its rerun, and a long answer takes minutes to write.
const buildModelStep = { ...modelStep, timeout: "15 minutes" } as const

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Requests a rulebook build from inside a Workflow, in steps named `{name}`, `{name}:ids` and `{name}:fail`: the ids
 * come from a step of their own, so a retried request reuses them, and a request whose workflow can't be started fails
 * the rulebook it inserted rather than leave it building with nothing running.
 */
export async function requestRulebookBuildStep(
  step: WorkflowStep,
  name: string,
  context: { db: Database; binding: RulebookBuildBinding; hoaId: string; unlessCurrentIs?: readonly string[] }
): Promise<BuildRequest | null> {
  const { db, binding, hoaId, unlessCurrentIs } = context
  const ids = await step.do(`${name}:ids`, storageStep, async () => newBuildIds())
  try {
    return await step.do(name, storageStep, () =>
      requestRulebookBuild(db, binding, hoaId, { now: new Date().toISOString(), ids, unlessCurrentIs })
    )
  } catch (error) {
    await step.do(`${name}:fail`, storageStep, () =>
      abandonRulebookBuild(db, hoaId, ids, errorText(error), new Date().toISOString())
    )
    return null
  }
}

/** The review a build carries forward: the current draft's, then the published rulebook's, and the stored provisions. */
async function loadPreviousReview(db: Database, hoaId: string): Promise<PreviousReview> {
  const [draft, published, records] = await Promise.all([
    getRulebookByStatus(db, hoaId, "draft"),
    getRulebookByStatus(db, hoaId, "published"),
    listDocumentRecords(db, hoaId)
  ])
  const [contents, provisions] = await Promise.all([
    Promise.all([draft, published].map((rulebook) => (rulebook ? getRulebookContent(db, hoaId, rulebook.id) : null))),
    listProvisions(
      db,
      hoaId,
      records.map((record) => record.id)
    )
  ])
  return { rulebooks: contents.flatMap((content) => (content ? [content] : [])), provisions }
}

/**
 * Builds a draft rulebook from ready governing documents (encoding.md, Stages): resolve-prompts, then the stages in
 * `buildRulebook`, each a step whose output goes to R2, then save-draft. Review and publishing are server functions.
 * Whether it finishes or fails, a document that became ready while it ran gets a build of its own (follow-up).
 */
export class RulebookBuild extends WorkflowEntrypoint<Env, RulebookBuildParams> {
  async run(event: WorkflowEvent<RulebookBuildParams>, step: WorkflowStep) {
    const { hoaId, rulebookId, jobId } = event.payload
    const db = createDatabase(this.env.DB)
    const bucket = this.env.FILES
    const now = () => new Date().toISOString()
    // Step names must be unique: a stage's reruns report the same stage and counts as its first pass can.
    const reported = new Map<string, number>()
    const progress = (stage: string, done: number, total: number) => {
      const name = `progress:${stage}:${done}:${total}`
      const count = (reported.get(name) ?? 0) + 1
      reported.set(name, count)
      return step.do(`${name}:${count}`, storageStep, () =>
        reportJobProgress(db, hoaId, jobId, { stage, done, total, now: now() })
      )
    }

    const sourceDocumentIds = await step.do(
      "load:sources",
      storageStep,
      async () => (await getRulebook(db, hoaId, rulebookId))?.sourceDocumentIds ?? []
    )
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
        const sources = await loadBuildSources(db, hoaId, rulebook.sourceDocumentIds)
        if (sources.length === 0) {
          throw new NonRetryableError("None of the documents are ready.")
        }
        return { sources, startedAt: now() }
      })

      // Every step the build works through, up front, so the page shows the whole build and where it is.
      await step.do("progress:start", storageStep, async () => {
        const stages = ["resolve-prompts", ...buildStages, "save-draft"].map((stage) => ({
          stage,
          isOptional: optionalBuildStages.some((optional) => optional === stage)
        }))
        const workload = { concurrency: ai.encodingConcurrency, documents: loaded.sources.length }
        await updateJob(db, hoaId, jobId, { progress: startProgress(stages, workload), now: now() })
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
        previous: () => loadPreviousReview(db, hoaId),
        now: loaded.startedAt,
        progress,
        concurrency: ai.encodingConcurrency
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
          output: { rules: result.content.rules.length, failures: result.failures },
          scores: buildScores(result),
          recorder: ai.scores
        })
        await ai.flush()
      })
      await step.do("save-draft:finish", storageStep, async () => {
        const { rules } = result.content
        const finishedAt = now()
        const job = await getJob(db, hoaId, jobId)
        await updateJob(db, hoaId, jobId, {
          ...(job?.progress ? { progress: finishProgress(job.progress, finishedAt) } : {}),
          status: result.failures.length > 0 ? "completed-with-errors" : "completed",
          stage: null,
          done: rules.length,
          total: rules.length,
          failures: result.failures,
          now: finishedAt
        })
      })
    } catch (error) {
      await step.do("fail", storageStep, async () => {
        const job = await getJob(db, hoaId, jobId)
        if (job?.status === "cancelled") {
          return // Stopped by an administrator: it stays stopped, not failed.
        }
        if (error instanceof SourcesRejectedError) {
          console.warn(`Rulebook build ${jobId} refused: ${error.message}`)
        }
        const failed = {
          stage: job?.stage ?? "build",
          message: errorText(error),
          isRetryable: !(error instanceof NonRetryableError || error instanceof SourcesRejectedError)
        }
        await failRulebook(db, hoaId, rulebookId, failed)
        await updateJob(db, hoaId, jobId, { status: "failed", error: failed, now: now() })
      })
    }

    // The rulebook is a draft or failed now, so a build can start. Compared with the documents this build read, an
    // unchanged set starts nothing, so a failed build isn't retried in a loop.
    // A stopped build asks for nothing: the next upload, or the administrator, starts one.
    const isStopped = await step.do(
      "follow-up:check",
      storageStep,
      async () => (await getJob(db, hoaId, jobId))?.status === "cancelled"
    )
    if (sourceDocumentIds.length > 0 && !isStopped) {
      await requestRulebookBuildStep(step, "follow-up", {
        db,
        binding: this.env.RULEBOOK_BUILD,
        hoaId,
        unlessCurrentIs: sourceDocumentIds
      })
    }
  }
}
