# AI features

Every AI feature in hoa follows the same path: a Langfuse-managed prompt, a model call through OpenRouter, a Langfuse
trace with cost and latency, and an evaluation that every prompt or model change is measured against: local datasets
scored in code and judged by the coding agent, and Langfuse datasets only where they exist
([design/evaluation.md](design/evaluation.md)).

## Model calls

- Call models only through [`runTextPrompt` and `runObjectPrompt`](../src/ai/runPrompt.ts), from a server function or
  a Workflow step. They load the prompt, open the Langfuse span, link OpenRouter's generation to it and return usage,
  cost and latency. Use `runObjectPrompt` with a Zod schema whenever the UI or code reads the result.
- Create models with [`createChatModel`](../src/ai/openrouter.server.ts). OpenRouter is the only provider. Every model
  denies data collection (`provider.data_collection: "deny"`), so requests never reach providers that may store or train
  on prompts. The model id comes from `OPENROUTER_MODEL` unless a feature needs a specific model.
- Not planned for the demo: recording summaries instead of content for application stages, and Broadcast's privacy
  mode. Both are needed before real HOAs onboard ([design/documents.md](design/documents.md#privacy-and-retention)).
- `runObjectPrompt` has the model answer by calling a `respond` tool, not through structured output: providers compile a
  structured-output schema into a grammar, and the rule schemas are larger than they accept. Zod's `oneOf` unions are
  sent as `anyOf` (Anthropic models on Vertex and Bedrock refuse `oneOf`), and the answer is validated with Zod. An
  invalid answer throws, so the Workflow step retries.
- `runCheckedObjectPrompt` is the same call for stages that rerun a failing answer with its problems (the rulebook
  build's steps): an answer that fails Zod comes back with its issues instead of throwing, and is cached like a valid
  one.
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
- **Prompts are generic.** No prompt names an organization's terms, a project type, a product, a material, a place or
  an example from a sample case. A prompt takes inputs (the request, the project type's label and description, the
  relevant rules, the rulebook's vocabulary); what's known about one organization lives in its rulebook's terms (definitions,
  scope notes, value meanings) and its project types. Before adding any mechanism, ask what it costs with 5, 10 and 100
  customers.
- The rulebook build's steps run on the models that matched Opus 5.5 on their step tests: defined terms and
  vocabulary merge on `anthropic/claude-haiku-5.5` (medium effort), rule finding on `openai/gpt-6-luna` (high effort,
  `openai/fast` tier), shared vocabulary on `deepseek/deepseek-v4.1-flash` (medium), rule structuring on
  `openai/gpt-6.1-sol` (medium); repair and consolidation stay on `anthropic/claude-opus-5.5` at high effort. The
  review's document review and the project type suggestions on `anthropic/claude-sonnet-5.5` and
  the review's other stages on `anthropic/claude-haiku-5.5`, through their prompts' `config.model`; a stage whose
  prompt names no model uses `OPENROUTER_MODEL` or `OPENROUTER_SMALL_MODEL`.
- A prompt whose contract changes (new variables or output) gets a new name, so two contracts never share a label.

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
- Each span records the prompt name and version as metadata, and its output records latency, cost and usage: `input`
  (every input token), `input_cached` (read from the prompt cache), `input_cache_write` (written to it) and `output`.
  The same counts are on every result (`inputTokens`, `cachedInputTokens`, `cacheWriteTokens`, `outputTokens`) and on a
  job's model calls (`ModelCall`), and the evaluation reports print them. Cost is OpenRouter's billed cost, which
  already prices cache reads and writes.
- Read traces through the v2 observations API (`/api/public/v2/observations?traceId=...`). The legacy trace endpoints
  return `410 Gone`.
- **Trace names.** Name each trace after its feature or pipeline stage, as listed in each design page's "Prompts
  and models" table.
  A Workflow's calls use the job id as the session ID, so one build or review reads as one Langfuse session.
  Dashboards filter on these names.

## Evaluation

The datasets, scores, step runs and tuning loop are in [design/evaluation.md](design/evaluation.md). Scores are code
wherever code can compute them, and the rest is judged by the coding agent
([design/evaluation.md, Judging by the coding agent](design/evaluation.md#judging-by-the-coding-agent)). Production
evaluators are deferred.

## Versions, models and caching

- **Prompts by version.** The [prompt loader](../src/ai/promptLoader.ts) loads by label (`LANGFUSE_PROMPT_LABEL`) or
  by a pinned version, and returns the version's `config`. Workflow jobs pin every prompt they use once, with
  `resolvePromptVersions`, and pass `promptVersion` to each call.
- **Model per prompt.** `runTextPrompt` and `runObjectPrompt` take a model factory and a default model id, and build
  the model after loading the prompt: the version's `config.model` when it names one, else the default
  (`OPENROUTER_MODEL`, or `OPENROUTER_SMALL_MODEL` for the review's page classification). A version's
  `config.provider` keeps its calls on one OpenRouter provider or tier, such as `openai/fast`, with no fallback. Results
  report the `modelId` used. A stage that escalates a disputed answer runs the same version on its `config.escalationModel` (the
  review's facts: design/application-review.md, Recognition).
- **Content cache.** Pass a `cache` to reuse results: the key covers the trace name, model, compiled prompt and
  attachments, so only a real change triggers a new model call. Cached results report `isCached` and cost 0.

### Prompt caching

The provider's prompt cache is separate from the content cache: it makes a repeated prefix of a request cheaper, not
the answer free. A prompt opts in by naming its `sharedVariables` in its registry entry (the rulebook build's step
prompts name theirs, such as `coreTerms` and `requestTypes`); their templates put those variables before the call's
own. `runPrompt.ts` (`sharedPrefix`) sends the compiled prompt as two text parts: the text up to where the first other
variable begins, marked with `cacheControl: { type: "ephemeral" }` (OpenRouter passes it to Anthropic as
`cache_control`), then the rest. Anthropic caches the request up to that mark, the tools first, so the
`respond` tool's schema is cached with it. The cache lives five minutes and each read renews it; a write costs 1.25
times the input price and a read a tenth. A template that puts a call's own variable first still works: its prefix is
shorter. Prompts without `sharedVariables` send one text part, unmarked. A chat prompt (its definition says `chat: true`; the redesigned
encoding steps' prompts are) is loaded with its messages: the system message goes as the request's instructions with
its own breakpoint, and the user message's text up to its first unshared variable gets the second. An object prompt can
also send its schema's repeated parts (conditions, operands) once as definitions (`sharedDefinitions`), which keeps the
tool schema, and with it the cached prefix, small.

### Streaming and retries

Calls stream (`streamText`), and are read to the end before the answer is used: a Worker can hold only six connections
waiting for response headers, and a streamed call gets its headers at once, so a build's parallel calls don't queue
behind each other. A call refused for now (429, an overloaded or failing provider, a timeout) is retried by
`withRetries` with the policy's backoff, honoring `retry-after`; the SDK's own retries are off. Any other error throws,
and a Workflow step retries.

## New AI feature checklist

- [ ] Prompt created in Langfuse with the serving label, and its name and variables added to `prompts.ts` or `pipelinePrompts.ts`.
- [ ] The model is called through `runTextPrompt` or `runObjectPrompt`, with a trace name for the feature or stage.
- [ ] An evaluation covers the stage (or the stage that consumes it), listed in design/evaluation.md.
- [ ] Unit tests use a mock model; the feature is checked once against the real model in the browser.
