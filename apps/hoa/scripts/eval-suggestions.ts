import { readFileSync } from "node:fs"
import { basename, join } from "node:path"
import { parseArgs } from "node:util"
import { createAiContext } from "../src/ai/aiContext.server.ts"
import { pipelinePrompts } from "../src/ai/pipelinePrompts.ts"
import { promptEffort } from "../src/ai/promptLoader.ts"
import { runObjectPrompt } from "../src/ai/runPrompt.ts"
import { applicationRequestType } from "../src/applications/application.ts"
import {
  checkSuggestions,
  projectTypesForPrompt,
  rulebookForPrompt,
  suggestionAnswerSchema,
  type SuggestionAnswer
} from "../src/projectTypes/suggest.ts"
import { rulesFile as rulesFileSchema } from "../src/schema/zod.ts"
import { fixtures, writeJson } from "./evalFiles.ts"

// Benchmarks the project type suggestion prompt (application-review.md, Project types) on other models, with the
// prompt's own text, over saved rules files. There's no answer key: each run reports what code can check (keys the
// model made up, which the app drops, and the subjects with rules no suggestion covers), latency and cost, and saves
// the raw and checked suggestions to .fixtures/eval/suggestions/<run id>/ for a person to read beside the baseline.
//
// Model calls cost money: without --yes this prints what it would run and stops. Usage, from apps/hoa:
//   pnpm eval:suggestions --rulebooks <rules.json>,... [--model <OpenRouter id>] [--effort <effort>] [--yes]
const { values } = parseArgs({
  options: {
    rulebooks: { type: "string" },
    model: { type: "string" },
    effort: { type: "string" },
    yes: { type: "boolean", default: false }
  }
})

const rulebooks = (values.rulebooks ?? "").split(",").filter(Boolean)
if (rulebooks.length === 0) {
  throw new Error("Give --rulebooks <rules.json>,...")
}
const override = {
  ...(values.model ? { model: values.model } : {}),
  ...(values.effort ? { effort: promptEffort.parse(values.effort) } : {})
}
const on = new Date().toISOString().slice(0, 10)
const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${values.model?.replace(/\W+/g, "-") ?? "prompt-model"}`

console.warn(
  `Suggestions on ${rulebooks.length} rulebook(s), ${rulebooks.length} model call(s), with ${JSON.stringify(override)}.`
)
if (!values.yes) {
  console.warn("Add --yes to run them.")
  process.exit(0)
}

const ai = createAiContext()
if (!ai.isConfigured) {
  throw new Error(`Missing settings: ${ai.missing.join(", ")}`)
}

type Offered = {
  subjects: { key: string; rules?: { key: string }[]; details: { property: string }[] }[]
  documents: { key: string }[]
}

/** What the answer names that the rulebook didn't offer, which the app drops. */
function madeUp(answer: SuggestionAnswer, offered: Offered, ruleKeys: ReadonlySet<string>) {
  const subjects = new Map(offered.subjects.map((subject) => [subject.key, subject]))
  const documents = new Set(offered.documents.map((document) => document.key))
  return answer.suggestions.flatMap((suggestion) => [
    ...suggestion.subjects.filter((key) => !subjects.has(key)).map((key) => `${suggestion.label}: subject ${key}`),
    ...suggestion.fields
      .filter(
        (field) =>
          !subjects
            .get(field.subject)
            ?.details.some(
              (detail) => detail.property === field.property || detail.property === `${field.subject}.${field.property}`
            )
      )
      .map((field) => `${suggestion.label}: field ${field.subject} ${field.property}`),
    ...suggestion.documents
      .filter((document) => !documents.has(document.documentType))
      .map((document) => `${suggestion.label}: document ${document.documentType}`),
    ...suggestion.basis.filter((key) => !ruleKeys.has(key)).map((key) => `${suggestion.label}: rule ${key}`)
  ])
}

const summary = []
for (const path of rulebooks) {
  const rulesFile = rulesFileSchema.parse(JSON.parse(readFileSync(path, "utf8")))
  const rulebook = rulebookForPrompt(rulesFile, applicationRequestType, on)
  const offered = JSON.parse(rulebook) as Offered
  const result = await runObjectPrompt({
    loadPrompt: async (prompt, selector) => {
      const template = await ai.loadPrompt(prompt, selector)
      return { ...template, config: { ...template.config, ...override } }
    },
    createModel: ai.createModel,
    defaultModelId: ai.modelId,
    prompt: pipelinePrompts.projectTypeSuggestion,
    schema: suggestionAnswerSchema,
    variables: { rulebook, projectTypes: projectTypesForPrompt([]) },
    traceName: "project-type-suggestion-eval",
    environment: ai.environment,
    sessionId: runId
  })
  const checked = checkSuggestions(result.object, { rulesFile, requestType: applicationRequestType, on, existing: [] })
  const ruleKeys = new Set(rulesFile.rules.map((rule) => rule.key))
  const covered = new Set(checked.flatMap((suggestion) => suggestion.definition.subjects))
  const withRules = offered.subjects.filter((subject) => (subject.rules ?? []).length > 0).map((subject) => subject.key)
  const name = basename(path, ".json")
  const row = {
    rulebook: name,
    model: result.modelId,
    effort: override.effort ?? "the prompt's own",
    latencySeconds: Math.round(result.latencyMs / 100) / 10,
    costUsd: result.costUsd,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    suggested: result.object.suggestions.length,
    kept: checked.length,
    labels: checked.map((suggestion) => suggestion.label),
    fieldsAsked: checked.reduce(
      (sum, suggestion) => sum + suggestion.definition.groups.reduce((n, group) => n + group.fields.length, 0),
      0
    ),
    madeUp: madeUp(result.object, offered, ruleKeys),
    subjectsWithRulesUncovered: withRules.filter((key) => !covered.has(key)),
    traceId: result.traceId
  }
  summary.push(row)
  await writeJson(join(fixtures, "eval/suggestions", runId, `${name}.json`), {
    ...row,
    answer: result.object,
    checked
  })
}
await writeJson(join(fixtures, "eval/suggestions", runId, "summary.json"), summary)
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
await ai.flush()
