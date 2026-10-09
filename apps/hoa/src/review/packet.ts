import type { Page } from "@/ocr/page"
import type { PageTexts } from "./verifyEvidence"

// The application packet as the review reads it after OCR: each file's page records, its images' descriptions and the
// text near a picture taken from a Word file; and the images themselves, loaded only inside the steps that send them.

export type PacketVisual = {
  figureId: string
  pageIndex: number
  description: string
  measurements: { label: string; value: string }[]
}

export type PacketFile = {
  id: string
  fileName: string
  mediaType: string
  /** The paragraph next to a picture in its Word file. */
  contextText: string | null
  /** False when OCR couldn't read it; the models are told so. */
  isReadable: boolean
  pages: readonly Page[]
  visuals: readonly PacketVisual[]
}

export type PacketImage = {
  fileId: string
  pageIndex: number
  filename: string
  mediaType: string
  load: () => Promise<Uint8Array>
}

export type Packet = { files: readonly PacketFile[]; images: readonly PacketImage[] }

/** Each file's page types from classification, by page index from 1. */
export type PageTypes = ReadonlyMap<string, readonly string[]>

/** A page in the models' input: its file, page index and type, which they cite as evidence. */
export type PageRef = { fileId: string; pageIndex: number }

export const pageTypeOf = (pageTypes: PageTypes, fileId: string, pageIndex: number) =>
  pageTypes.get(fileId)?.[pageIndex - 1] ?? null

export function fileMarker(file: Pick<PacketFile, "id" | "fileName">, pageIndex: number, type: string | null) {
  return `<<file ${file.id} "${file.fileName}" | page ${pageIndex}${type ? ` | ${type}` : ""}>>`
}

function visualNotes(file: PacketFile, pageIndex: number) {
  return file.visuals
    .filter((visual) => visual.pageIndex === pageIndex)
    .map((visual) => {
      const measurements = visual.measurements.map((item) => `${item.label}: ${item.value}`).join("; ")
      return `[image ${visual.figureId}] ${visual.description}${measurements ? ` Measurements: ${measurements}.` : ""}`
    })
}

/** What the models read for one page: its text, the text near its picture and its images' descriptions. */
function pageBody(file: PacketFile, page: Page) {
  return [
    ...(file.contextText ? [`Text near this picture in its Word file: ${file.contextText}`] : []),
    page.text.trim() || "[no text]",
    ...visualNotes(file, page.pageIndex)
  ].join("\n")
}

/**
 * Every readable page (or those `includes` keeps) with the marker the models cite as evidence. A file OCR couldn't
 * read is listed so the models know it's there.
 */
export function pagesForPrompt(
  packet: Packet,
  pageTypes: PageTypes,
  includes: (page: PageRef) => boolean = () => true,
  maxCharacters = 200_000
) {
  const text = packet.files
    .flatMap((file) => {
      if (!file.isReadable) {
        return includes({ fileId: file.id, pageIndex: 1 })
          ? [`${fileMarker(file, 1, null)}\n[This file couldn't be read.]`]
          : []
      }
      return file.pages
        .filter((page) => includes({ fileId: file.id, pageIndex: page.pageIndex }))
        .map(
          (page) =>
            `${fileMarker(file, page.pageIndex, pageTypeOf(pageTypes, file.id, page.pageIndex))}\n${pageBody(file, page)}`
        )
    })
    .join("\n\n")
  return text.length > maxCharacters ? `${text.slice(0, maxCharacters)}\n[Truncated.]` : text
}

/** The file a citation names: by its id, or by its name with or without its extension (models sometimes use it). */
export function citedFile(packet: Packet, cited: string) {
  const named = (file: PacketFile) => file.fileName === cited || file.fileName.replace(/\.[^.]+$/, "") === cited
  return packet.files.find((file) => file.id === cited) ?? packet.files.find(named)
}

/**
 * The text evidence is checked against: a page as the models read it, or the whole file for a null page. A file is
 * found by its id, or by its name with or without its extension.
 */
export function packetPageTexts(packet: Packet): PageTexts {
  return (fileId, pageIndex) => {
    const file = citedFile(packet, fileId)
    if (!file) {
      return null
    }
    const pages = file.pages.filter((page) => pageIndex === null || page.pageIndex === pageIndex)
    return pages.length > 0 ? pages.map((page) => pageBody(file, page)).join("\n") : null
  }
}

/** The images on the pages `includes` keeps, at most `limit`, in packet order. */
export function imagesFor(packet: Packet, includes: (page: PageRef) => boolean = () => true, limit = 20) {
  return packet.images.filter((image) => includes(image)).slice(0, limit)
}
