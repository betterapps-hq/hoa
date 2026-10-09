import { execSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { z } from "zod"
import { seedRulebook } from "../src/rulebook/seedRulebook.ts"
import { rulesFile } from "../src/schema/zod.ts"

// Publishes the committed sample rules file as the seeded organization's rulebook in the local database
// (implementation-plan.md, 3.11). Run db:migrate:local and db:seed:local first. The rules file goes to Wrangler's local
// R2; with --dev-bucket it goes to the hoa-dev bucket instead, which `pnpm dev` binds. Usage, from apps/hoa:
//   pnpm db:seed:sample [--dev-bucket]
const appDirectory = join(import.meta.dirname, "..")
const r2Target = process.argv.includes("--dev-bucket") ? "--remote" : "--local"

function wrangler(args: string, output: "return" | "show" = "show") {
  return execSync(`wrangler ${args} --env dev`, {
    cwd: appDirectory,
    encoding: "utf8",
    stdio: ["ignore", output === "return" ? "pipe" : "inherit", "inherit"]
  })
}

const queryResult = z.array(z.object({ results: z.array(z.object({ id: z.string(), name: z.string() })) }))
const [organization] =
  queryResult.parse(
    JSON.parse(
      wrangler(
        `d1 execute hoa-dev --local --json --command "SELECT id, name FROM hoas ORDER BY created_at LIMIT 1"`,
        "return"
      )
    )
  )[0]?.results ?? []
if (!organization) {
  throw new Error("No organization exists yet: run pnpm db:seed:local first.")
}

const seed = await seedRulebook({
  file: rulesFile.parse(JSON.parse(readFileSync(join(appDirectory, "samples/declaration/rules.json"), "utf8"))),
  organization,
  rulebookId: "sample-declaration",
  approvedBy: "demo-administrator",
  now: new Date().toISOString()
})

const directory = mkdtempSync(join(tmpdir(), "hoa-seed-"))
try {
  const sqlFile = join(directory, "seed.sql")
  const jsonFile = join(directory, "rules.json")
  writeFileSync(sqlFile, `${seed.statements.join("\n")}\n`)
  writeFileSync(jsonFile, seed.json)
  wrangler(`d1 execute hoa-dev --local --file "${sqlFile}"`, "return")
  wrangler(`r2 object put "hoa-dev/${seed.fileKey}" --file "${jsonFile}" --content-type application/json ${r2Target}`)
} finally {
  rmSync(directory, { recursive: true, force: true })
}
console.warn(`Published ${seed.fileKey} (SHA-256 ${seed.sha256}) for ${organization.name}.`)
