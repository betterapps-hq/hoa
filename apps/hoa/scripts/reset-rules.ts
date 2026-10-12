import { join } from "node:path"
import { getPlatformProxy } from "wrangler"
import { createDatabase } from "../src/db/database.ts"
import { resetRulesData } from "../src/db/resetRules.ts"

// Empties rulebooks, rules, sections, provisions, the rulebook records, reviews and their R2 objects in the local
// environment (implementation-plan.md, 0.4): the local D1 database and Wrangler's local R2. With --dev-bucket, objects
// are deleted from the hoa-dev bucket that `pnpm dev` binds instead. It never reaches the preview or demo environments.
// Usage, from apps/hoa:
//   pnpm db:reset:rules [--dev-bucket]
const proxy = await getPlatformProxy<{ DB: D1Database; FILES: R2Bucket }>({
  configPath: join(import.meta.dirname, "../wrangler.jsonc"),
  environment: "dev",
  persist: true,
  remoteBindings: process.argv.includes("--dev-bucket")
})
try {
  const summary = await resetRulesData(createDatabase(proxy.env.DB), proxy.env.FILES)
  console.warn(
    `Removed ${summary.rulebooks} rulebook(s), ${summary.reviews} review(s) and ${summary.objects} stored object(s).`
  )
} finally {
  await proxy.dispose()
}
