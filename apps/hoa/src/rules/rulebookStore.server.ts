import { env } from "cloudflare:workers"
import { rulebookSchema, type Rulebook } from "./rules"

/** The part of an R2 bucket the store uses, so tests can pass an in-memory bucket. */
export type JsonBucket = {
  get(key: string): Promise<{ json(): Promise<unknown> } | null>
  put(key: string, value: string, options?: R2PutOptions): Promise<unknown>
}

const rulebookKey = "prototype/rulebook.json"

/**
 * Stores the published rulebook as one JSON object in R2. The demo serves one HOA; the D1 repositories in
 * docs/design/documents.md replace this module.
 */
export function createRulebookStore(bucket: JsonBucket = env.FILES) {
  return {
    async load(): Promise<Rulebook | null> {
      const object = await bucket.get(rulebookKey)
      return object ? rulebookSchema.parse(await object.json()) : null
    },
    async save(rulebook: Rulebook) {
      await bucket.put(rulebookKey, JSON.stringify(rulebookSchema.parse(rulebook)), {
        httpMetadata: { contentType: "application/json" }
      })
    }
  }
}
