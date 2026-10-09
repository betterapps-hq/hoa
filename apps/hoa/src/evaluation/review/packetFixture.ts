import invariant from "tiny-invariant"
import { z } from "zod"
import type { Page } from "@/ocr/page"
import type { Packet } from "@/review/packet"
import { packetImageName } from "@/review/storedPacket"

// An application packet as evaluation reads it: what OCR left for each file (its pages' text, its images'
// descriptions and the images themselves), without a Workflow or storage. The fence packet's comes from
// `pnpm ocr:fixture --packet`; the synthetic garage packets are written by hand with made-up text and descriptions.

const visual = z.object({
  figureId: z.string(),
  pageIndex: z.number().int().positive(),
  description: z.string(),
  measurements: z.array(z.object({ label: z.string(), value: z.string() })).default([])
})

export const packetFixture = z.object({
  files: z.array(
    z.object({
      id: z.string(),
      fileName: z.string(),
      mediaType: z.string(),
      contextText: z.string().nullable().default(null),
      isReadable: z.boolean().default(true),
      pages: z.array(z.object({ text: z.string() })),
      visuals: z.array(visual).default([]),
      /** Image files beside the fixture, by path relative to it. */
      images: z
        .array(z.object({ pageIndex: z.number().int().positive(), path: z.string(), mediaType: z.string() }))
        .default([])
    })
  )
})
export type PacketFixture = z.infer<typeof packetFixture>

/** A page record holding only what the review reads: its index and text. */
export function pageOf(documentId: string, pageIndex: number, text: string): Page {
  return {
    documentId,
    pageIndex,
    pageLabel: null,
    labelSource: null,
    engine: "fixture",
    optionsHash: "fixture",
    text,
    normalizedText: text.toLowerCase(),
    header: null,
    footer: null,
    headings: [],
    sectionAtTop: null,
    checkboxes: [],
    figures: [],
    minConfidence: null,
    lowConfidenceSpans: []
  }
}

/** The packet the review reads, its images loaded through `readImage` when a step sends them. */
export function toPacket(fixture: PacketFixture, readImage: (path: string) => Promise<Uint8Array>): Packet {
  return {
    files: fixture.files.map((file) => ({
      id: file.id,
      fileName: file.fileName,
      mediaType: file.mediaType,
      contextText: file.contextText,
      isReadable: file.isReadable,
      pages: file.pages.map((page, index) => pageOf(file.id, index + 1, page.text)),
      visuals: file.visuals
    })),
    // `pnpm ocr:fixture` writes each image beside the description of it, so they pair up in order.
    images: fixture.files.flatMap((file) =>
      file.images.map((image, index) => {
        const visual = file.visuals[index]
        invariant(visual, `${file.id}'s image ${image.path} has no description beside it.`)
        return {
          fileId: file.id,
          pageIndex: image.pageIndex,
          filename: packetImageName(file, visual.figureId),
          mediaType: image.mediaType,
          load: () => readImage(image.path)
        }
      })
    )
  }
}
