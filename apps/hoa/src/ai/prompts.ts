/**
 * Prompts live only in Langfuse prompt management: their text, versions, labels and `config.model` are created and
 * maintained there. Code refers to a prompt by its Langfuse name and supplies its variables.
 */
export type PromptDefinition<Variable extends string = string> = {
  /** Prompt name in Langfuse prompt management. */
  name: string
  /** The `{{variables}}` the code fills in. The Langfuse prompt must use exactly these (`promptLoader.ts`). */
  variables: readonly Variable[]
}

/** What a call to a prompt must fill in: exactly the variables it declares, checked by the compiler. */
export type PromptVariables<Prompt extends PromptDefinition> = Record<Prompt["variables"][number], string>

export const prompts = {
  modelCheck: { name: "hoa-model-check", variables: [] }
} as const satisfies Record<string, PromptDefinition>
