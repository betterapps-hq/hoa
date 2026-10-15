import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { and, eq, max } from "drizzle-orm"
import { getPlatformProxy } from "wrangler"
import { createDatabase } from "../src/db/database.ts"
import { rulebooks } from "../src/db/schema.ts"
import { writeRulesFile } from "../src/rulebook/assemble.ts"
import { sha256Hex } from "../src/rulebook/canonical.ts"
import { rulesFile } from "../src/schema/zod.ts"

// Publishes the sample declaration's rules file (samples/declaration/rules.json) as the demo association's rulebook in
// the local environment, for the features that read the published rulebook, such as violations. It writes the rules
// file only, not the rulebook's records, so the rulebook page lists none for it. The file goes to the dev bucket, which
// local development reads remotely; it never reaches the preview or demo environments. Usage, from apps/hoa:
//   pnpm db:seed:rulebook
const organizationId = "demo-hoa"
const proxy = await getPlatformProxy<{ DB: D1Database; FILES: R2Bucket }>({
  configPath: join(import.meta.dirname, "../wrangler.jsonc"),
  environment: "dev",
  persist: true,
  remoteBindings: true
})
try {
  const db = createDatabase(proxy.env.DB)
  const sample = rulesFile.parse(
    JSON.parse(readFileSync(join(import.meta.dirname, "../samples/declaration/rules.json"), "utf8"))
  )
  const json = JSON.stringify({ ...sample, organization: { ...sample.organization, id: organizationId } })
  const rulebookId = randomUUID()
  const file = await writeRulesFile(proxy.env.FILES, organizationId, rulebookId, {
    json,
    sha256: await sha256Hex(json)
  })
  const latest = await db
    .select({ version: max(rulebooks.version) })
    .from(rulebooks)
    .where(eq(rulebooks.organizationId, organizationId))
    .get()
  const now = new Date().toISOString()
  await db.batch([
    db
      .update(rulebooks)
      .set({ status: "superseded" })
      .where(and(eq(rulebooks.organizationId, organizationId), eq(rulebooks.status, "published"))),
    db.insert(rulebooks).values({
      id: rulebookId,
      organizationId,
      version: (latest?.version ?? 0) + 1,
      status: "published",
      catalogVersion: 1,
      sourceDocumentIds: [],
      jobId: `sample-${rulebookId}`,
      createdAt: now,
      publishedBy: "demo-administrator",
      publishedAt: now,
      ...file
    })
  ])
  console.warn(`Published the sample declaration's ${sample.rules.length} rules as rulebook ${rulebookId}.`)
} finally {
  await proxy.dispose()
}
