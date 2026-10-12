/**
 * Prompts live only in Langfuse prompt management: their text, versions, labels and `config.model` are created and
 * maintained there. Code refers to a prompt by its Langfuse name and supplies its variables.
 */
export type PromptDefinition<Variable extends string = string> = {
  /** Prompt name in Langfuse prompt management. */
  name: string
  /** The `{{variables}}` the code fills in. The Langfuse prompt must use exactly these (`promptLoader.ts`). */
  variables: readonly Variable[]
  /**
   * The variables whose values are the same on every call of a stage (core terms, request types). The template puts
   * them before the others, so the text up to the first other variable is sent as a cached prefix (runPrompt.ts).
   */
  sharedVariables?: readonly Variable[]
  /**
   * A chat prompt: a system message the build never varies, then a user message holding the variables in XML tags.
   * The system message and the user message's shared part each get a prompt-cache breakpoint (runPrompt.ts).
   */
  chat?: true
}

/** What a call to a prompt must fill in: exactly the variables it declares, checked by the compiler. */
export type PromptVariables<Prompt extends PromptDefinition> = Record<Prompt["variables"][number], string>
