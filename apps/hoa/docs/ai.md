# AI features

Every AI feature in hoa follows the same path: a Langfuse-managed prompt, a model call through OpenRouter, a Langfuse
trace with cost and latency, and a dataset with scores that every prompt or model change is measured against.

## Model calls

- Call models only through [`runTextPrompt` and `runObjectPrompt`](../src/ai/runPrompt.ts), from a server function or
  a Workflow step. They load the prompt, open the Langfuse span, link OpenRouter's generation to it and return usage,
  cost and latency. Use `runObjectPrompt` with a Zod schema whenever the UI or code reads the result.
- Create models with [`createChatModel`](../src/ai/openrouter.server.ts). OpenRouter is the only provider. Every model
  denies data collection (`provider.data_collection: "deny"`), so requests never reach providers that may store or train
  on prompts. The model id comes from `OPENROUTER_MODEL` unless a feature needs a specific model.
- `runObjectPrompt` has the model answer by calling a `respond` tool, not through structured output: providers compile a
  structured-output schema into a grammar, and the rule schemas are larger than they accept. Zod's `oneOf` unions are
  sent as `anyOf` (Anthropic models on Vertex and Bedrock refuse `oneOf`), and the answer is validated with Zod. An
  invalid answer throws, so the Workflow step retries.
- `runCheckedObjectPrompt` is the same call for stages that repair answers (the rulebook build's encode and repair):
  an answer that fails Zod comes back with its issues instead of throwing, and is cached like a valid one.
- `codeFields` lists fields code owns (a rule's `effectiveFrom`, a term's `organizationId`): they're left out of the
  schema the model sees, and filled in on the answer before Zod checks it.
- Text the model must read about the output, such as the statement link syntax, goes in the Zod schema's
  `.describe()`, since Langfuse reads double braces in prompt text as variables.
- `recordScores` ([scores.ts](../src/ai/scores.ts)) adds one span under a job's trace name and session with the scores
  code computed, such as a rulebook build's (encoding.md, Quality).
- Unit tests inject `MockLanguageModelV4` from `ai/test`. Tests never call a paid model.

## Prompts

- **Prompts exist only in Langfuse prompt management.** Their text, versions, labels and `config.model` are created and
  edited there, never in code. Code names each prompt in [`prompts.ts`](../src/ai/prompts.ts) or
  [`pipelinePrompts.ts`](../src/ai/pipelinePrompts.ts) and documents the variables it fills in. The app fetches the
  version with the `LANGFUSE_PROMPT_LABEL` label (`production` by default).
- **Prompt environments are Langfuse labels.** Local development serves `development`, pull request previews serve
  `preview`, and the demo serves `production` (`LANGFUSE_PROMPT_LABEL` in `wrangler.jsonc` and `.env`). Change a prompt
  by saving a new version with the `development` label, try it locally, then move the `preview` and `production` labels
  to it. Rolling back is moving a label back.
- **The code's variables are a contract.** Each registry entry lists the `{{variables}}` the code fills in, and the
  loader refuses a version that uses a variable the code doesn't fill in or leaves one out. A Workflow fails at
  `resolve-prompts`, before any model call, with the prompt, version and mismatch.
- Langfuse is required: without its keys the AI context reports them missing, and a prompt Langfuse can't serve fails
  the call with the prompt's name and label. There's no local copy to fall back to.
- To add a prompt, create it in Langfuse as a **text** prompt using `{{variable}}` placeholders, label the version to
  serve, then add its name to the registry. The Langfuse MCP server or the Langfuse UI can create and edit prompts.
- Rule extraction and consolidation run on `anthropic/claude-opus-5.5` through their prompts' `config.model`; every
  other stage uses `OPENROUTER_MODEL` or `OPENROUTER_SMALL_MODEL`.- A prompt whose contract changes (new variables or output) gets a new name, so two contracts never share a label.

## Tracing and cost

- [`telemetry.server.ts`](../src/ai/telemetry.server.ts) registers OpenTelemetry with Langfuse's span processor: a
  `BasicTracerProvider` plus an `AsyncLocalStorage` context manager, because the server runs in Cloudflare's workerd.
  The app traces its own spans; it doesn't trace model generations.
- **OpenRouter Broadcast delivers the generations**, with token usage and OpenRouter's billed cost. `runPrompt.ts`
  sends the span's `trace_id` and `parent_span_id` (plus trace name, generation name and environment) in OpenRouter's
  `trace` field, so the generation nests under the feature's span in one Langfuse trace. Don't also enable the AI SDK's
  Langfuse integration: every generation would appear twice.
- Langfuse v4 is observation-centric. The feature's span is the root observation: it holds the overall input and
  output. `runPrompt.ts` wraps it in `propagateAttributes`, so the trace name and session ID land on every observation
  the app creates. OpenRouter's generation can't inherit those, so the same values (plus `prompt_name` and
  `prompt_version`) go in its `trace` field instead.
- Each span records the prompt name and version as metadata, and its output records latency and cost.
- Read traces through the v2 observations API (`/api/public/v2/observations?traceId=...`). The legacy trace endpoints
  return `410 Gone`.
- **Trace names.** Name each trace after its feature or pipeline stage: `model-check`, and the pipeline's
  stage trace names listed in each design page's "Prompts and models" table.
  A Workflow's calls use the job id as the session ID, so one build or review reads as one Langfuse session.
  Evaluators and dashboards filter on these names.

## Evaluation

Every model stage has a Langfuse dataset and runs an experiment when its prompt or model changes; the datasets, scores
and production evaluators are listed in [design/evaluation.md](design/evaluation.md).

When a feature needs a production evaluator:

1. In Langfuse, create an **LLM-as-a-judge** evaluator (or compute the score in code and send it through the SDK).
2. Run it on **observations**, filtered to root observations (`Is Root Observation = true`) with the feature's trace
   name, on new observations. Don't create trace-level evaluators: Langfuse v4 stops running them on November 16, 2026.
3. Map the evaluator's variables to the root observation's input and output, which is the feature's span.

## Versions, models and caching

- **Prompts by version.** The [prompt loader](../src/ai/promptLoader.ts) loads by label (`LANGFUSE_PROMPT_LABEL`) or
  by a pinned version, and returns the version's `config`. Workflow jobs pin every prompt they use once, with
  `resolvePromptVersions`, and pass `promptVersion` to each call.
- **Model per prompt.** `runTextPrompt` and `runObjectPrompt` take a model factory and a default model id, and build
  the model after loading the prompt: the version's `config.model` when it names one, else the default
  (`OPENROUTER_MODEL`, or `OPENROUTER_SMALL_MODEL` for routing, structure and classification). Results report the
  `modelId` used.
- **Content cache.** Pass a `cache` to reuse results: the key covers the trace name, model, compiled prompt and
  attachments, so only a real change triggers a new model call. Cached results report `isCached` and cost 0.

Not planned for the demo: recording summaries instead of content for application stages, and Broadcast's privacy
mode. Both are needed before real HOAs onboard ([design/documents.md](design/documents.md#privacy-and-retention)).
## New AI feature checklist

- [ ] Prompt created in Langfuse with the serving label, and its name and variables added to `prompts.ts` or `pipelinePrompts.ts`.
- [ ] The model is called through `runTextPrompt` or `runObjectPrompt`, with a trace name for the feature or stage.
- [ ] A Langfuse dataset covers the stage (or the stage that consumes it), listed in design/evaluation.md.
- [ ] Any production evaluator targets root observations with that trace name.
- [ ] Unit tests use a mock model; the feature is checked once against the real model in the browser.
