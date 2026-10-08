import { z } from "zod"

// The page record (docs/design/documents.md, "Pages"): written once per page, never rewritten.

export const pageSchema = z.object({
  documentId: z.string(),
  pageIndex: z.number().int().positive(),
  pageLabel: z.string().nullable(),
  labelSource: z.enum(["page-number", "offset"]).nullable(),
  engine: z.string(),
  optionsHash: z.string(),
  text: z.string(),
  normalizedText: z.string(),
  header: z.string().nullable(),
  footer: z.string().nullable(),
  headings: z.array(z.object({ level: z.number().int(), text: z.string(), offset: z.number().int() })),
  sectionAtTop: z.string().nullable(),
  checkboxes: z.array(z.object({ label: z.string(), state: z.enum(["selected", "unselected"]) })),
  figures: z.array(z.object({ id: z.string(), caption: z.string().nullable(), imageKey: z.string() })),
  minConfidence: z.number().nullable(),
  lowConfidenceSpans: z.array(z.object({ start: z.number().int(), end: z.number().int() }))
})
export type Page = z.infer<typeof pageSchema>

/** What `ocr:labels` computes once every page is written; readers apply it to page records. */
export const documentLayoutSchema = z.object({
  labels: z.record(z.string(), z.string()),
  repeatedLines: z.array(z.string())
})
export type DocumentLayout = z.infer<typeof documentLayoutSchema>

/**
 * Normalizes text for citation matching: lowercase, joined hyphenation, plain quotes, no Markdown or punctuation, and
 * single spaces. Scans drop periods and hyphens unpredictably, so matching compares words only.
 */
export function normalizeForMatching(text: string) {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/-\s*\n\s*/g, "")
    .replace(/[‘’“”]/g, "'")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** The page marker that precedes each page's text in section text and model input. */
export function pageMarker(page: Pick<Page, "pageIndex" | "pageLabel">) {
  return page.pageLabel ? `<<page ${page.pageIndex} | label ${page.pageLabel}>>` : `<<page ${page.pageIndex}>>`
}
