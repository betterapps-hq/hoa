import { createFileRoute } from "@tanstack/react-router"
import { getDb } from "@/db/client.server"
import { getGoverningDocument } from "@/db/documentRepository"
import { contentDisposition } from "@/features/documents/documentFile"
import { getRequestContext } from "@/session/requestContext.server"
import { governingKeys } from "@/storage/keys"
import { getBucket } from "@/storage/storage.server"

/** A single byte range from a Range header, as R2 reads it; null for none, or for several ranges (served whole). */
function byteRange(header: string | null): R2Range | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? "")
  if (!match) {
    return null
  }
  const [, from = "", to = ""] = match
  if (from === "" && to !== "") {
    return { suffix: Number(to) }
  }
  if (from === "") {
    return null
  }
  return to === "" ? { offset: Number(from) } : { offset: Number(from), length: Number(to) - Number(from) + 1 }
}

/** The bytes R2 served for a range, resolved against the object's size. */
function servedRange(range: R2Range | undefined, size: number) {
  if (!range) {
    return null
  }
  if ("suffix" in range && range.suffix !== undefined) {
    const length = Math.min(range.suffix, size)
    return { offset: size - length, length }
  }
  const offset = "offset" in range ? (range.offset ?? 0) : 0
  const length = "length" in range && range.length !== undefined ? range.length : size - offset
  return { offset, length: Math.min(length, size - offset) }
}

/**
 * A governing document's original file, as uploaded (encoding.md, UX, Documents). Every member of the organization may
 * read its governing documents; the document is looked up in the requester's organization only, so another
 * organization's file is never found. `?download` saves it under its original name; without it, it opens in the
 * browser. A single byte range is served as a range, so a PDF viewer can start with the pages it shows.
 */
export const Route = createFileRoute("/files/governing/$documentId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const context = await getRequestContext()
        const document = await getGoverningDocument(getDb(), context.hoa.id, params.documentId)
        if (!document || document.status === "uploading") {
          return new Response("Not found", { status: 404 })
        }
        const key = governingKeys(context.hoa.id, document.id).source(document.fileName)
        const range = byteRange(request.headers.get("Range"))
        const object = await getBucket().get(key, range ? { range } : {})
        if (!object) {
          return new Response("Not found", { status: 404 })
        }
        const isDownload = new URL(request.url).searchParams.has("download")
        const headers = {
          "Content-Type": document.mediaType,
          "Content-Disposition": contentDisposition(isDownload ? "attachment" : "inline", document.fileName),
          "Cache-Control": "private, max-age=300",
          "X-Content-Type-Options": "nosniff",
          // The reader's PDF view fetches the pages it shows first, in ranges.
          "Accept-Ranges": "bytes"
        }
        const served = range ? servedRange(object.range, object.size) : null
        if (served) {
          return new Response(object.body, {
            status: 206,
            headers: {
              ...headers,
              "Content-Length": String(served.length),
              "Content-Range": `bytes ${served.offset}-${served.offset + served.length - 1}/${object.size}`
            }
          })
        }
        return new Response(object.body, { headers: { ...headers, "Content-Length": String(object.size) } })
      }
    }
  }
})
