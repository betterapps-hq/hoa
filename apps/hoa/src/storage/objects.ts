import type { z } from "zod"
import type { PromptCache } from "@/ai/runPrompt"

/** The part of an R2 bucket these helpers use, so tests can pass an in-memory bucket. */
export type ObjectBucket = {
  get(key: string): Promise<{ text(): Promise<string> } | null>
  put(key: string, value: string | ArrayBuffer | Uint8Array, options?: R2PutOptions): Promise<unknown>
}

export async function putJson(bucket: ObjectBucket, key: string, value: unknown) {
  await bucket.put(key, JSON.stringify(value), { httpMetadata: { contentType: "application/json" } })
}

export async function getJson<T>(bucket: ObjectBucket, key: string, schema: z.ZodType<T>): Promise<T | null> {
  const object = await bucket.get(key)
  return object ? schema.parse(JSON.parse(await object.text())) : null
}

/** A content cache for model results, stored as JSON under `keyFor(hash)`. */
export function createObjectPromptCache(bucket: ObjectBucket, keyFor: (hash: string) => string): PromptCache {
  return {
    get: async (hash) => {
      const object = await bucket.get(keyFor(hash))
      if (!object) {
        return undefined
      }
      const value: unknown = JSON.parse(await object.text())
      return value
    },
    put: async (hash, value) => {
      await putJson(bucket, keyFor(hash), value)
    }
  }
}

export function toHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}
