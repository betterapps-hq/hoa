// Creates every prompt the app uses in Langfuse prompt management, labeled for serving. Langfuse is the source of
// truth: a prompt that already has a version with the label is left alone, so edits made in Langfuse are never
// overwritten. Pass --update to publish the code's text as a new version where it differs from the labeled one.
// Usage: pnpm prompts:push [--update]
import { pipelinePrompts } from "../src/ai/pipelinePrompts"
import { prompts, type PromptDefinition } from "../src/ai/prompts"

const { LANGFUSE_PUBLIC_KEY: publicKey, LANGFUSE_SECRET_KEY: secretKey } = process.env
const baseUrl = process.env.LANGFUSE_BASE_URL ?? "https://us.cloud.langfuse.com"
const label = process.env.LANGFUSE_PROMPT_LABEL ?? "production"
const shouldUpdate = process.argv.includes("--update")
const report = (line: string) => process.stdout.write(`${line}\n`)

if (!publicKey || !secretKey) {
  throw new Error("LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are required.")
}
const authorization = `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString("base64")}`

type LabeledVersion = { version: number; prompt: string; config: unknown }

async function labeledVersion(name: string): Promise<LabeledVersion | null> {
  const response = await fetch(`${baseUrl}/api/public/v2/prompts/${encodeURIComponent(name)}?label=${label}`, {
    headers: { authorization }
  })
  if (response.status === 404) {
    return null
  }
  if (!response.ok) {
    throw new Error(`Reading ${name} failed: ${response.status} ${await response.text()}`)
  }
  return (await response.json()) as LabeledVersion
}

/** A new labeled version. An update keeps the config the labeled version has in Langfuse, such as its model. */
async function createVersion(definition: PromptDefinition, config: unknown = definition.config ?? {}) {
  const response = await fetch(`${baseUrl}/api/public/v2/prompts`, {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify({
      name: definition.name,
      type: "text",
      prompt: definition.fallback,
      labels: [label],
      config
    })
  })
  if (!response.ok) {
    throw new Error(`Creating ${definition.name} failed: ${response.status} ${await response.text()}`)
  }
  return ((await response.json()) as { version: number }).version
}

for (const definition of [...Object.values(prompts), ...Object.values(pipelinePrompts)]) {
  const current = await labeledVersion(definition.name)
  if (!current) {
    report(`${definition.name}: created version ${await createVersion(definition)}`)
  } else if (current.prompt === definition.fallback) {
    report(`${definition.name}: version ${current.version} is current`)
  } else if (shouldUpdate) {
    report(
      `${definition.name}: version ${current.version} replaced by ${await createVersion(definition, current.config)}`
    )
  } else {
    report(`${definition.name}: version ${current.version} differs from the code; kept (pass --update to replace)`)
  }
}
