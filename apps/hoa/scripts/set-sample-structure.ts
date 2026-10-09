import { join } from "node:path"
import { getPlatformProxy } from "wrangler"
import { createDatabase } from "../src/db/database.ts"
import { listGoverningDocuments, setDocumentStructure } from "../src/db/documentRepository.ts"
import { sampleDocuments } from "./sampleDocuments.ts"

// Sets how builds structure the sample documents uploaded to the local database (encoding.md, Structure 4): the
// Declaration with Exhibit C as the use restrictions, and the Design Guidelines keyed `guidelines`. Each upload of a
// sample document's kind gets its structure. The rules UX will set structures per upload (phase 5). Usage, from
// apps/hoa:
//   pnpm db:structure:sample
const proxy = await getPlatformProxy<{ DB: D1Database }>({
  configPath: join(import.meta.dirname, "../wrangler.jsonc"),
  environment: "dev",
  persist: true,
  remoteBindings: false
})
try {
  const db = createDatabase(proxy.env.DB)
  const hoas = await proxy.env.DB.prepare("SELECT id FROM hoas").all<{ id: string }>()
  for (const { id: hoaId } of hoas.results) {
    for (const upload of await listGoverningDocuments(db, hoaId)) {
      const sample = sampleDocuments.find((document) => document.kind === upload.kind)
      if (sample) {
        await setDocumentStructure(db, hoaId, upload.id, sample.structure)
        console.warn(`${upload.title}: structured as ${sample.structure.key}`)
      }
    }
  }
} finally {
  await proxy.dispose()
}
