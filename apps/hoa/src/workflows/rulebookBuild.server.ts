import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers"
import { NonRetryableError } from "cloudflare:workflows"
import { z } from "zod"
import { createAiContext } from "@/ai/aiContext.server"
import { pipelinePrompts } from "@/ai/pipelinePrompts"
import { resolvePromptVersions } from "@/ai/promptLoader"
import type { PromptVariables } from "@/ai/prompts"
import { runObjectPrompt } from "@/ai/runPrompt"
import { createDatabase } from "@/db/database"
import { getGoverningDocument, listSections, saveSections, setSectionRouting } from "@/db/documentRepository"
import { getJob, updateJob } from "@/db/jobRepository"
import { failRulebook, getRulebook, getRulebookByStatus, listRules, saveDraft } from "@/db/rulebookRepository"
import { sectionRoutingSchema, type GoverningDocument, type Section } from "@/documents/governingDocument"
import { documentLayoutSchema, type Page } from "@/ocr/page"
import { carryForward } from "@/pipeline/carryForward"
import { catalogForPrompt, routingOptions, truncate } from "@/pipeline/catalogPrompt"
import { applyConsolidation, consolidationResultSchema, type VerifiedCandidate } from "@/pipeline/consolidate"
import { buildSections } from "@/pipeline/structure"
import { checkRuleAgainstCatalog, citationIssues, matchQuote } from "@/pipeline/verify"
import { candidateRuleSchema, ruleSchema } from "@/rules/rule"
import { governingKeys, hoaCacheKey, jobOutputKey } from "@/storage/keys"
import { createObjectPromptCache, getJson, putJson } from "@/storage/objects"
import { loadPages, modelStep, storageStep } from "./ocrSteps.server"

export type RulebookBuildParams = { hoaId: string; rulebookId: string; jobId: string }

const extractionOutputSchema = z.object({ rules: z.array(candidateRuleSchema) })
const verifiedCandidatesSchema = z.array(
  z.object({
    candidateId: z.string(),
    sectionId: z.string(),
    documentKind: z.string(),
    candidate: candidateRuleSchema,
    citations: ruleSchema.shape.citations,
    issues: ruleSchema.shape.issues,
    provenance: z.unknown()
  })
)

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Builds a draft rulebook from ready governing documents (docs/design/extraction.md, "Stages"): structure, route,
 * extract, verify, consolidate and save-draft. Review and publishing are server functions.
 */
export class RulebookBuild extends WorkflowEntrypoint<Env, RulebookBuildParams> {
  async run(event: WorkflowEvent<RulebookBuildParams>, step: WorkflowStep) {
    const { hoaId, rulebookId, jobId } = event.payload
    const db = createDatabase(this.env.DB)
    const bucket = this.env.FILES
    const now = () => new Date().toISOString()
    const progress = (stage: string, done: number, total: number) =>
      step.do(`progress:${stage}:${done}`, storageStep, () =>
        updateJob(db, hoaId, jobId, { stage, done, total, now: now() })
      )
    const failures: { stage: string; itemId: string; message: string }[] = []

    try {
      const ai = createAiContext()
      if (!ai.isConfigured) {
        throw new NonRetryableError(`Missing settings: ${ai.missing.join(", ")}.`)
      }
      const documents = await step.do("load", storageStep, async () => {
        const rulebook = await getRulebook(db, hoaId, rulebookId)
        if (rulebook?.status !== "building") {
          throw new NonRetryableError("The rulebook isn't being built.")
        }
        const loaded = await Promise.all(rulebook.sourceDocumentIds.map((id) => getGoverningDocument(db, hoaId, id)))
        const ready = loaded.filter((document): document is GoverningDocument => document?.status === "ready")
        if (ready.length === 0) {
          throw new NonRetryableError("None of the documents are ready.")
        }
        return ready
      })

      await progress("resolve-prompts", 0, 0)
      const prompts = [
        pipelinePrompts.sectionRouting,
        pipelinePrompts.sectionRuleExtraction,
        pipelinePrompts.ruleConsolidation
      ]
      const promptVersions = await step.do("resolve-prompts", storageStep, async () => {
        const versions = await resolvePromptVersions(ai.loadPrompt, prompts)
        await updateJob(db, hoaId, jobId, { promptVersions: versions, now: now() })
        return versions
      })
      const run = <T, Prompt extends (typeof prompts)[number]>(
        prompt: Prompt,
        options: {
          schema: z.ZodType<T>
          variables: PromptVariables<Prompt>
          small?: boolean
          traceName: string
          cacheStage: string
        }
      ) =>
        runObjectPrompt({
          loadPrompt: ai.loadPrompt,
          createModel: ai.createModel,
          defaultModelId: options.small ? ai.smallModelId : ai.modelId,
          prompt,
          promptVersion: promptVersions[prompt.name],
          schema: options.schema,
          variables: options.variables,
          traceName: options.traceName,
          environment: ai.environment,
          sessionId: jobId,
          cache: createObjectPromptCache(bucket, (hash) => hoaCacheKey(hoaId, options.cacheStage, hash))
        })

      // Structure: sections are written once per document version.
      await progress("structure", 0, documents.length)
      for (const document of documents) {
        await step.do(`structure:${document.id}`, storageStep, async () => {
          if ((await listSections(db, hoaId, document.id)).length > 0) {
            return
          }
          const keys = governingKeys(hoaId, document.id)
          const pages = await loadPages(bucket, keys, document.pageCount ?? 0)
          const layout = (await getJson(bucket, keys.layout(), documentLayoutSchema)) ?? {
            labels: {},
            repeatedLines: []
          }
          const sections = buildSections(document.id, pages, layout)
          await Promise.all(sections.map((section) => bucket.put(keys.sectionText(section.id), section.text)))
          await saveSections(
            db,
            hoaId,
            sections.map(({ text: _text, ...section }) => section)
          )
        })
      }

      const sections = await step.do("list-sections", storageStep, async () =>
        (await Promise.all(documents.map((document) => listSections(db, hoaId, document.id)))).flat()
      )
      const sectionText = async (section: Pick<Section, "id" | "documentId">) =>
        (await bucket.get(governingKeys(hoaId, section.documentId).sectionText(section.id)))?.text() ?? ""

      // Route: tag each section; only fence-relevant ones go on.
      await progress("route", 0, sections.length)
      const routed = await Promise.allSettled(
        sections.map((section) =>
          step.do(`route:${section.id}`, modelStep, async () => {
            const options = routingOptions()
            const result = await run(pipelinePrompts.sectionRouting, {
              schema: sectionRoutingSchema,
              small: true,
              traceName: "section-routing",
              cacheStage: "route",
              variables: {
                heading: section.heading,
                sectionText: truncate(await sectionText(section), 12_000),
                projectTypes: options.projectTypes,
                topics: options.topics
              }
            })
            await setSectionRouting(db, hoaId, section.id, result.object)
            await ai.flush()
            return result.object.isRelevant && result.object.projectTypes.includes("fence")
          })
        )
      )
      const relevant = sections.filter((section, index) => {
        const result = routed[index]
        if (result?.status === "rejected") {
          failures.push({ stage: "route", itemId: section.id, message: errorText(result.reason) })
          return false
        }
        return result?.value === true
      })

      // Extract: one call per relevant section.
      await progress("extract", 0, relevant.length)
      const catalog = catalogForPrompt("fence")
      const extracted = await Promise.allSettled(
        relevant.map((section) =>
          step.do(`extract:${section.id}`, modelStep, async () => {
            const document = documents.find((item) => item.id === section.documentId)
            const siblings = sections.filter((item) => item.documentId === section.documentId)
            const definitions = siblings.filter((item) => item.kind === "definitions" && item.id !== section.id)
            const references = siblings.filter((item) => section.references.includes(item.id))
            const result = await run(pipelinePrompts.sectionRuleExtraction, {
              schema: extractionOutputSchema,
              traceName: "section-rule-extraction",
              cacheStage: "extract",
              variables: {
                documentKind: document?.kind ?? "design-guidelines",
                heading: section.heading,
                sectionText: truncate(await sectionText(section), 30_000),
                definitions: truncate((await Promise.all(definitions.map(sectionText))).join("\n\n") || "none", 8_000),
                references: truncate((await Promise.all(references.map(sectionText))).join("\n\n") || "none", 8_000),
                catalog
              }
            })
            await putJson(bucket, jobOutputKey(hoaId, jobId, "extract", section.id), {
              rules: result.object.rules,
              model: result.modelId,
              promptVersion: result.promptVersion
            })
            await ai.flush()
            return result.object.rules.length
          })
        )
      )
      extracted.forEach((result, index) => {
        if (result.status === "rejected") {
          failures.push({ stage: "extract", itemId: relevant[index]?.id ?? "", message: errorText(result.reason) })
        }
      })
      // A draft missing a section would silently drop that section's rules and report them as removed, so a section
      // that can't be extracted after retries fails the build and leaves the current draft as it is.
      const extractFailures = failures.filter((failure) => failure.stage === "extract")
      const [firstFailure] = extractFailures
      if (firstFailure) {
        throw new NonRetryableError(
          `${extractFailures.length} of ${relevant.length} sections couldn't be extracted, so the draft wasn't replaced. ${firstFailure.message}`
        )
      }
      const extractedSections = relevant.filter((_, index) => extracted[index]?.status === "fulfilled")

      // Verify: match every citation against its page, and check every rule against the catalog.
      await progress("verify", 0, extractedSections.length)
      await step.do("verify", storageStep, async () => {
        const pagesByDocument = new Map<string, Page[]>()
        const pagesFor = async (document: GoverningDocument) => {
          const cached = pagesByDocument.get(document.id)
          if (cached) {
            return cached
          }
          const pages = await loadPages(bucket, governingKeys(hoaId, document.id), document.pageCount ?? 0)
          pagesByDocument.set(document.id, pages)
          return pages
        }
        const outputSchema = z.object({
          rules: z.array(candidateRuleSchema),
          model: z.string(),
          promptVersion: z.number().int()
        })
        const verified: VerifiedCandidate[] = []
        for (const section of extractedSections) {
          const output = await getJson(bucket, jobOutputKey(hoaId, jobId, "extract", section.id), outputSchema)
          const document = documents.find((item) => item.id === section.documentId)
          if (!output || !document) {
            continue
          }
          const pages = await pagesFor(document)
          output.rules.forEach((candidate, index) => {
            const citations = candidate.citations.map((citation) => {
              const page = pages.find((item) => item.pageIndex === citation.pageIndex)
              return {
                documentId: document.id,
                section: citation.section,
                pageIndex: citation.pageIndex,
                pageLabel: page?.pageLabel ?? null,
                quote: citation.quote,
                match: page
                  ? matchQuote(citation.quote, page)
                  : { status: "not-found" as const, score: 0, touchesLowConfidence: false }
              }
            })
            const issues: VerifiedCandidate["issues"] = [
              ...citationIssues(citations),
              ...checkRuleAgainstCatalog(candidate).map((issue) => ({ ...issue, resolution: null }))
            ]
            verified.push({
              candidateId: `${section.id}:${index}`,
              sectionId: section.id,
              documentKind: document.kind,
              candidate,
              citations,
              issues,
              provenance: {
                source: "extraction",
                jobId,
                sectionId: section.id,
                model: output.model,
                promptName: pipelinePrompts.sectionRuleExtraction.name,
                promptVersion: output.promptVersion
              }
            })
          })
        }
        await putJson(bucket, jobOutputKey(hoaId, jobId, "verify", "candidates"), verified)
        return verified.length
      })

      // Consolidate: the model proposes merges, conflicts and exception links; code applies them.
      await progress("consolidate", 0, 1)
      await step.do("consolidate:fence", modelStep, async () => {
        const raw = await getJson(bucket, jobOutputKey(hoaId, jobId, "verify", "candidates"), verifiedCandidatesSchema)
        const candidates: VerifiedCandidate[] = (raw ?? []).map((item) => ({
          ...item,
          documentKind: documents.find((document) => document.kind === item.documentKind)?.kind ?? "design-guidelines",
          provenance: {
            source: "extraction",
            jobId,
            sectionId: item.sectionId,
            model: z.object({ model: z.string() }).catch({ model: "" }).parse(item.provenance).model,
            promptName: pipelinePrompts.sectionRuleExtraction.name,
            promptVersion: z.object({ promptVersion: z.number().int() }).parse(item.provenance).promptVersion
          }
        }))
        const proposal =
          candidates.length < 2
            ? { duplicates: [], conflicts: [], exceptions: [] }
            : (
                await run(pipelinePrompts.ruleConsolidation, {
                  schema: consolidationResultSchema,
                  traceName: "rule-consolidation",
                  cacheStage: "consolidate",
                  variables: {
                    projectType: "fence",
                    candidates: JSON.stringify(
                      candidates.map(({ candidateId, documentKind, candidate }) => ({
                        id: candidateId,
                        documentKind,
                        ...candidate
                      })),
                      null,
                      1
                    )
                  }
                })
              ).object
        const rules = await applyConsolidation(candidates, proposal, { rulebookId })
        await putJson(bucket, jobOutputKey(hoaId, jobId, "consolidate", "rules"), rules)
        await ai.flush()
        return rules.length
      })

      // Save draft: carry the administrator's work forward and replace the old draft in one batch.
      await progress("save-draft", 0, 1)
      await step.do("save-draft", storageStep, async () => {
        const rules =
          (await getJson(bucket, jobOutputKey(hoaId, jobId, "consolidate", "rules"), z.array(ruleSchema))) ?? []
        const previousDraft = await getRulebookByStatus(db, hoaId, "draft")
        const published = await getRulebookByStatus(db, hoaId, "published")
        const publishedRules = published ? await listRules(db, hoaId, published.id) : []
        // Approvals and edits carry forward from the draft being replaced, or from the published rules when there's none.
        const previousRules = previousDraft ? await listRules(db, hoaId, previousDraft.id) : publishedRules
        const carried = carryForward(rules, previousRules, {
          rulebookId,
          sourceDocumentIds: documents.map((document) => document.id),
          published: publishedRules
        })
        await putJson(bucket, jobOutputKey(hoaId, jobId, "save-draft", "removed"), carried.removed)
        await saveDraft(db, hoaId, { rulebookId, previousDraftId: previousDraft?.id ?? null, rules: carried.rules })
        await updateJob(db, hoaId, jobId, {
          status: failures.length > 0 ? "completed-with-errors" : "completed",
          stage: null,
          done: carried.rules.length,
          total: carried.rules.length,
          failures,
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
        await updateJob(db, hoaId, jobId, { status: "failed", error: failed, failures, now: now() })
      })
    }
  }
}
