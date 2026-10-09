import { readdirSync, statSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { parseArgs } from "node:util"
import { LangfuseClient } from "@langfuse/client"
import { z } from "zod"
import { correctionItems, correctionSchema, type CorrectionSource } from "../src/review/corrections.ts"
import { reviewSchema } from "../src/review/reviewModel.ts"
import { evaluationRequest } from "../src/schema/zod.ts"
import { readJson } from "./evalFiles.ts"

// Corrections become data (application-review.md, Recognition): exports the corrections reviews recorded (values code
// rejected, fast checks that disagreed, disputed second readings and escalations, people's corrections) as items of the
// Langfuse dataset `entity-facts`. An item's id names its source, entity, property and kind, so exporting again
// updates it rather than adding another. Usage, from apps/hoa:
//   pnpm review:corrections [--dry-run] <path>...
// A path is an evaluation run's folder (.fixtures/eval/review/<run id>, every case's review.json) or a saved review
// record (reviews/{jobId}.json, downloaded from R2).
const { values, positionals } = parseArgs({ options: { "dry-run": { type: "boolean" } }, allowPositionals: true })
if (positionals.length === 0) {
  throw new Error("Usage: pnpm review:corrections [--dry-run] <evaluation run folder | review record>...")
}

const evaluationReview = z.object({ request: evaluationRequest, corrections: z.array(correctionSchema) })
type Loaded = { source: CorrectionSource; review: z.infer<typeof evaluationReview> }

/** Every case review under an evaluation run's folder, by its case and run. */
function evaluationReviews(folder: string): Loaded[] {
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(folder, entry.name, "review.json"))
    .filter((path) => statSync(path, { throwIfNoEntry: false })?.isFile() === true)
    .map((path) => {
      const review = evaluationReview.parse(readJson(path))
      const source: CorrectionSource = {
        kind: "evaluation",
        run: basename(folder),
        case: basename(dirname(path))
      }
      return { source, review }
    })
}

const reviews = positionals.flatMap((path): Loaded[] => {
  if (statSync(path).isDirectory()) {
    return evaluationReviews(path)
  }
  const review = reviewSchema.parse(readJson(path))
  const source: CorrectionSource = { kind: "review", applicationId: review.applicationId, jobId: review.jobId }
  return [{ source, review }]
})
const items = reviews.flatMap(({ source, review }) =>
  correctionItems(source, review.corrections, review.request.entities)
)
const byKind = Map.groupBy(items, (item) => item.metadata.kind)
console.warn(
  `${items.length} corrections from ${reviews.length} reviews: ${[...byKind].map(([kind, found]) => `${kind} ${found.length}`).join(", ") || "none"}`
)
if (values["dry-run"]) {
  console.warn(JSON.stringify(items, null, 1))
} else if (items.length > 0) {
  const langfuse = new LangfuseClient()
  const datasetName = "entity-facts"
  const existing = await langfuse.api.datasets.list({ limit: 100 })
  if (!existing.data.some((dataset) => dataset.name === datasetName)) {
    await langfuse.api.datasets.create({
      name: datasetName,
      description:
        "Facts per entity and property read from application packets; includes the corrections reviews recorded (application-review.md, Recognition)."
    })
  }
  for (const item of items) {
    await langfuse.api.datasetItems.create({ datasetName, ...item })
  }
  console.warn(`Exported to the Langfuse dataset ${datasetName}.`)
}
