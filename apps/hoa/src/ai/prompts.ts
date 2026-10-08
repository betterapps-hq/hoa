/**
 * Prompts the app uses. Langfuse prompt management is the source of truth: each prompt is fetched by name and label
 * at run time. The fallback text is used only when Langfuse is unreachable or the prompt hasn't been created yet, and
 * generations that use it aren't linked to a prompt version.
 */
export type PromptDefinition = {
  /** Prompt name in Langfuse prompt management. */
  name: string
  /** Text prompt using Langfuse `{{variable}}` syntax. */
  fallback: string
  /** The config a prompt is first created with in Langfuse (`pnpm prompts:push`); Langfuse owns it after that. */
  config?: { model?: string }
}

export const prompts = {
  modelCheck: {
    name: "hoa-model-check",
    fallback:
      "You are the assistant for a homeowners association's Design Review Committee. Reply with one short sentence confirming you're ready to review architectural applications."
  }
} satisfies Record<string, PromptDefinition>
