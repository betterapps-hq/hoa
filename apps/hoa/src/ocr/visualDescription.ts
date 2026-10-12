import { z } from "zod"

// What hoa-visual-description returns for an image (docs/design/ocr.md), and how OCR stores it beside the figure.

export const visualDescriptionSchema = z.object({
  description: z.string(),
  measurements: z.array(z.object({ label: z.string(), value: z.string() }))
})

export const storedVisualSchema = visualDescriptionSchema.extend({
  figureId: z.string(),
  pageIndex: z.number().int(),
  promptVersion: z.number().int()
})
export type StoredVisual = z.infer<typeof storedVisualSchema>
