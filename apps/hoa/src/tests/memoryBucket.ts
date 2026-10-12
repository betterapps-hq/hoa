import type { ListableBucket } from "@/db/resetRules"
import type { ObjectBucket } from "@/storage/objects"

/** An R2 bucket in memory, listing `pageSize` keys at a time so tests can exercise cursors. */
export function createMemoryBucket(pageSize = 1000) {
  const stored = new Map<string, string>()
  const bucket: ObjectBucket & ListableBucket = {
    get: async (key) => {
      const text = stored.get(key)
      return text === undefined ? null : { text: async () => text }
    },
    put: async (key, value) => {
      stored.set(key, typeof value === "string" ? value : new TextDecoder().decode(value))
    },
    list: async ({ prefix, cursor }) => {
      const keys = [...stored.keys()].filter((key) => key.startsWith(prefix)).toSorted()
      const start = cursor === undefined ? 0 : Number(cursor)
      const objects = keys.slice(start, start + pageSize).map((key) => ({ key }))
      const next = start + pageSize
      return next < keys.length ? { objects, truncated: true, cursor: String(next) } : { objects, truncated: false }
    },
    delete: async (keys) => {
      for (const key of keys) {
        stored.delete(key)
      }
    }
  }
  return { bucket, stored }
}
