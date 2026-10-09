import type { ApplicationFile } from "@/applications/application"
import type { Page } from "@/ocr/page"
import { storedVisualSchema } from "@/ocr/visualDescription"
import { getJson } from "@/storage/objects"
import type { Packet, PacketFile, PacketImage } from "./packet"

// The packet the review reads, from what the ApplicationReview Workflow's OCR stored (application-review.md, Stages 2
// and 3): each ready or unreadable file's pages, image descriptions and images, in packet order. Evaluation builds its
// packets from fixtures with `toPacket`; both name images with `packetImageName`, so the models read the same packet
// either way.

/** The part of an R2 bucket the packet is read from. */
export type PacketBucket = {
  get(key: string): Promise<{ text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer> } | null>
}

/** Where one file's OCR output is stored. */
export type StoredFileKeys = {
  source: string
  figureImage: (figureId: string) => string
  figureDescription: (figureId: string) => string
}

export type StoredFile = Pick<ApplicationFile, "id" | "fileName" | "mediaType" | "contextText" | "status" | "pageCount">

/** An image's file name as the models see it: an uploaded image by its own name, a figure by its file and id. */
export function packetImageName(file: Pick<StoredFile, "id" | "fileName" | "mediaType">, figureId: string) {
  return file.mediaType.startsWith("image/") ? file.fileName : `${file.id}-${figureId}.png`
}

export async function loadPacket(
  bucket: PacketBucket,
  files: readonly StoredFile[],
  keysOf: (file: StoredFile) => StoredFileKeys,
  pagesOf: (file: StoredFile) => Promise<readonly Page[]>
): Promise<Packet> {
  const loaded = await Promise.all(
    files
      .filter((file) => file.status === "ready" || file.status === "unreadable")
      .map(async (file) => {
        const keys = keysOf(file)
        const isReadable = file.status === "ready"
        const pages = isReadable ? await pagesOf(file) : []
        const isImage = file.mediaType.startsWith("image/")
        const figures = isImage
          ? [{ figureId: "image", pageIndex: 1 }]
          : pages.flatMap((page) => page.figures.map((figure) => ({ figureId: figure.id, pageIndex: page.pageIndex })))
        const visuals = (
          await Promise.all(
            figures.map((figure) => getJson(bucket, keys.figureDescription(figure.figureId), storedVisualSchema))
          )
        ).filter((visual) => visual !== null)
        const load = (key: string) => async () => {
          const object = await bucket.get(key)
          if (!object) {
            throw new Error(`The image ${key} is missing from storage.`)
          }
          return new Uint8Array(await object.arrayBuffer())
        }
        const images = figures.map((figure): PacketImage => ({
          fileId: file.id,
          pageIndex: figure.pageIndex,
          filename: packetImageName(file, figure.figureId),
          mediaType: isImage ? file.mediaType : "image/png",
          load: load(isImage ? keys.source : keys.figureImage(figure.figureId))
        }))
        const packetFile: PacketFile = {
          id: file.id,
          fileName: file.fileName,
          mediaType: file.mediaType,
          contextText: file.contextText,
          isReadable,
          pages,
          visuals
        }
        return { file: packetFile, images: isReadable ? images : [] }
      })
  )
  return { files: loaded.map((item) => item.file), images: loaded.flatMap((item) => item.images) }
}
