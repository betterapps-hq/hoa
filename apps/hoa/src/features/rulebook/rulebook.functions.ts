import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { createAiContext, errorMessage } from "@/ai/aiContext.server"
import { prompts } from "@/ai/prompts"
import { runObjectPrompt } from "@/ai/runPrompt"
import { filesFromFormData, toAttachments, UploadError } from "@/documents/toAttachments.server"
import { describeFiles } from "@/documents/uploads"
import { createRulebookStore } from "@/rules/rulebookStore.server"
import { extractionOutputSchema, projectTypes, ruleSchema, type Rule, type Rulebook } from "@/rules/rules"

export type ExtractRulesResult =
  | { status: "not-configured"; missing: string[] }
  | { status: "failed"; message: string }
  | {
      status: "succeeded"
      hoaName: string
      documents: string[]
      rules: Rule[]
      costUsd: number | undefined
      latencyMs: number
      traceId: string | undefined
    }

/** Reads the HOA's governing documents and extracts structured rules for the rep to approve. */
export const extractRules = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    if (!(data instanceof FormData)) {
      throw new Error("Expected form data.")
    }
    return data
  })
  .handler(async ({ data }): Promise<ExtractRulesResult> => {
    const hoaName = String(data.get("hoaName") ?? "").trim()
    const files = filesFromFormData(data, "documents")
    if (!hoaName || files.length === 0) {
      return { status: "failed", message: "Enter the HOA's name and add at least one document." }
    }
    const ai = createAiContext()
    if (!ai.isConfigured) {
      return { status: "not-configured", missing: ai.missing }
    }
    try {
      const result = await runObjectPrompt({
        loadPrompt: ai.loadPrompt,
        model: ai.model,
        prompt: prompts.ruleExtraction,
        schema: extractionOutputSchema,
        variables: {
          hoaName,
          projectTypes: projectTypes.map((type) => type.label).join(", "),
          documentList: describeFiles(files)
        },
        attachments: await toAttachments(files),
        traceName: "rule-extraction",
        environment: ai.environment
      })
      return {
        status: "succeeded",
        hoaName,
        documents: files.map((file) => file.name),
        rules: result.object.rules.map((rule, index) => ({ ...rule, id: `rule-${index + 1}` })),
        costUsd: result.costUsd,
        latencyMs: result.latencyMs,
        traceId: result.traceId
      }
    } catch (error) {
      if (!(error instanceof UploadError)) {
        console.error("Rule extraction failed", error)
      }
      return { status: "failed", message: errorMessage(error, "The rules couldn't be extracted.") }
    } finally {
      await ai.flush()
    }
  })

export const getRulebook = createServerFn({ method: "GET" }).handler(async (): Promise<Rulebook | null> =>
  createRulebookStore().load()
)

const publishInput = z.object({
  hoaName: z.string().min(1),
  documents: z.array(z.string()),
  rules: z.array(ruleSchema).min(1)
})

/** Publishes the approved rules as the HOA's rulebook, replacing any earlier version. */
export const publishRulebook = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => publishInput.parse(data))
  .handler(async ({ data }): Promise<Rulebook> => {
    const rulebook: Rulebook = { ...data, publishedAt: new Date().toISOString() }
    await createRulebookStore().save(rulebook)
    return rulebook
  })
