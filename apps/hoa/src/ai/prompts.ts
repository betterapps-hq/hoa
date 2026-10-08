/**
 * Prompts live only in Langfuse prompt management: their text, versions, labels and `config.model` are created and
 * maintained there. Code refers to a prompt by its Langfuse name and supplies its variables.
 */
export type PromptDefinition = {
  /** Prompt name in Langfuse prompt management. */
  name: string
}

export const prompts = {
  /** Variables: none. */
  modelCheck: { name: "hoa-model-check" }
} satisfies Record<string, PromptDefinition>
