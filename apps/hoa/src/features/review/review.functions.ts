import { createServerFn } from "@tanstack/react-start"
import { createAiContext, errorMessage } from "@/ai/aiContext.server"
import { prompts } from "@/ai/prompts"
import { runObjectPrompt } from "@/ai/runPrompt"
import { filesFromFormData, toAttachments, UploadError } from "@/documents/toAttachments.server"
import { describeFiles } from "@/documents/uploads"
import { reviewSchema, type Review } from "@/review/review"
import { createRulebookStore } from "@/rules/rulebookStore.server"
import { projectTypeIds, projectTypes, rulesForProject, type ProjectTypeId, type Rule } from "@/rules/rules"

export type ReviewProjectResult =
  | { status: "not-configured"; missing: string[] }
  | { status: "no-rulebook" }
  | { status: "failed"; message: string }
  | {
      status: "succeeded"
      hoaName: string
      review: Review
      rules: Rule[]
      costUsd: number | undefined
      latencyMs: number
      traceId: string | undefined
    }

function isProjectType(value: string): value is ProjectTypeId {
  return projectTypeIds.some((id) => id === value)
}

/** Reviews a homeowner's application against the HOA's published rules for the project type. */
export const reviewProject = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    if (!(data instanceof FormData)) {
      throw new Error("Expected form data.")
    }
    return data
  })
  .handler(async ({ data }): Promise<ReviewProjectResult> => {
    const projectType = String(data.get("projectType") ?? "")
    const description = String(data.get("description") ?? "").trim()
    const files = filesFromFormData(data, "files")
    if (!isProjectType(projectType) || files.length === 0) {
      return { status: "failed", message: "Select a project type and add at least one file." }
    }
    const rulebook = await createRulebookStore().load()
    const rules = rulebook ? rulesForProject(rulebook, projectType) : []
    if (!rulebook || rules.length === 0) {
      return { status: "no-rulebook" }
    }
    const ai = createAiContext()
    if (!ai.isConfigured) {
      return { status: "not-configured", missing: ai.missing }
    }
    try {
      const result = await runObjectPrompt({
        loadPrompt: ai.loadPrompt,
        model: ai.model,
        prompt: prompts.applicationReview,
        schema: reviewSchema,
        variables: {
          hoaName: rulebook.hoaName,
          projectType: projectTypes.find((type) => type.id === projectType)?.label ?? projectType,
          description: description || "None provided.",
          documentList: describeFiles(files),
          rules: JSON.stringify(rules.map(({ id, requirement, source }) => ({ id, requirement, source })))
        },
        attachments: await toAttachments(files),
        traceName: "application-review",
        environment: ai.environment
      })
      return {
        status: "succeeded",
        hoaName: rulebook.hoaName,
        review: result.object,
        rules,
        costUsd: result.costUsd,
        latencyMs: result.latencyMs,
        traceId: result.traceId
      }
    } catch (error) {
      if (!(error instanceof UploadError)) {
        console.error("Application review failed", error)
      }
      return { status: "failed", message: errorMessage(error, "The application couldn't be reviewed.") }
    } finally {
      await ai.flush()
    }
  })
