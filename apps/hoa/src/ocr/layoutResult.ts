import { z } from "zod"

// The parts of Azure Document Intelligence's Layout response (API 2024-11-30, Markdown output) the app reads.
// Unknown fields are ignored, so the raw response can be stored as-is and parsed again later.

const spanSchema = z.object({ offset: z.number().int(), length: z.number().int() })

const boundingRegionSchema = z.object({ pageNumber: z.number().int() })

export const layoutResultSchema = z.object({
  content: z.string(),
  pages: z.array(
    z.object({
      pageNumber: z.number().int(),
      spans: z.array(spanSchema),
      words: z.array(z.object({ content: z.string(), confidence: z.number(), span: spanSchema })).default([]),
      selectionMarks: z.array(z.object({ state: z.enum(["selected", "unselected"]), span: spanSchema })).default([])
    })
  ),
  paragraphs: z
    .array(
      z.object({
        role: z.string().optional(),
        content: z.string(),
        spans: z.array(spanSchema),
        boundingRegions: z.array(boundingRegionSchema).default([])
      })
    )
    .default([]),
  figures: z
    .array(
      z.object({
        id: z.string(),
        boundingRegions: z.array(boundingRegionSchema).default([]),
        caption: z.object({ content: z.string() }).optional()
      })
    )
    .default([])
})

export type LayoutResult = z.infer<typeof layoutResultSchema>
