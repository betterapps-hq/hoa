import { createFileRoute } from "@tanstack/react-router"
import { canSee } from "@/applications/application"
import { getApplication, getApplicationFile } from "@/db/applicationRepository"
import { getDb } from "@/db/client.server"
import { opensInBrowser } from "@/features/applications/applicationFile"
import { contentDisposition } from "@/features/documents/documentFile"
import { getRequestContext } from "@/session/requestContext.server"
import { applicationKeys } from "@/storage/keys"
import { getBucket } from "@/storage/storage.server"

/**
 * A packet file as the homeowner uploaded it (application-review.md, UX): the homeowner who made the application may
 * read it, and the committee once it's submitted; it's looked up in the requester's organization only. `?download` saves it under its
 * original name; without it, a PDF or photo opens in the browser, and anything else is saved.
 */
export const Route = createFileRoute("/files/applications/$applicationId/$fileId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const context = await getRequestContext()
        const db = getDb()
        const application = await getApplication(db, context.hoa.id, params.applicationId)
        const canRead =
          application !== null &&
          canSee(application, { userId: context.user.id, isCommittee: context.role === "administrator" })
        const file = application && canRead ? await getApplicationFile(db, context.hoa.id, params.fileId) : null
        if (!application || file?.applicationId !== application.id || file.status === "uploading") {
          return new Response("Not found", { status: 404 })
        }
        const object = await getBucket().get(
          applicationKeys(context.hoa.id, application.id).source(file.id, file.fileName)
        )
        if (!object) {
          return new Response("Not found", { status: 404 })
        }
        const isInline = !new URL(request.url).searchParams.has("download") && opensInBrowser(file.mediaType)
        return new Response(object.body, {
          headers: {
            "Content-Type": file.mediaType,
            "Content-Disposition": contentDisposition(isInline ? "inline" : "attachment", file.fileName),
            "Content-Length": String(object.size),
            "Cache-Control": "private, max-age=300",
            "X-Content-Type-Options": "nosniff"
          }
        })
      }
    }
  }
})
