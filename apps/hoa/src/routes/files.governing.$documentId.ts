import { createFileRoute } from "@tanstack/react-router"
import { getDb } from "@/db/client.server"
import { getGoverningDocument } from "@/db/documentRepository"
import { contentDisposition } from "@/features/documents/documentFile"
import { getRequestContext } from "@/session/requestContext.server"
import { governingKeys } from "@/storage/keys"
import { getBucket } from "@/storage/storage.server"

/**
 * A governing document's original file, as uploaded (encoding.md, UX, Documents). Every member of the organization may
 * read its governing documents; the document is looked up in the requester's organization only, so another
 * organization's file is never found. `?download` saves it under its original name; without it, it opens in the
 * browser.
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
        const object = await getBucket().get(governingKeys(context.hoa.id, document.id).source(document.fileName))
        if (!object) {
          return new Response("Not found", { status: 404 })
        }
        const isDownload = new URL(request.url).searchParams.has("download")
        return new Response(object.body, {
          headers: {
            "Content-Type": document.mediaType,
            "Content-Length": String(object.size),
            "Content-Disposition": contentDisposition(isDownload ? "attachment" : "inline", document.fileName),
            "Cache-Control": "private, max-age=300",
            "X-Content-Type-Options": "nosniff"
          }
        })
      }
    }
  }
})
