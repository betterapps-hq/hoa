import { createFileRoute } from "@tanstack/react-router"
import { getDb } from "@/db/client.server"
import { getViolationPhoto } from "@/db/violationRepository"
import { loadViolation } from "@/features/violations/violations.server"
import { getRequestContext } from "@/session/requestContext.server"
import { violationKeys } from "@/storage/keys"
import { getBucket } from "@/storage/storage.server"

/**
 * A violation's photo (docs/design/violations.md, Who sees what): for the board, and for whoever answers for the
 * violation once its notice is sent; looked up in the requester's organization only.
 */
export const Route = createFileRoute("/files/violations/$violationId/$photoId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const context = await getRequestContext()
        const loaded = await loadViolation(context, params.violationId)
        const photo = loaded
          ? await getViolationPhoto(getDb(), context.organization.id, params.violationId, params.photoId)
          : null
        const object = photo
          ? await getBucket().get(violationKeys(context.organization.id, params.violationId).photo(photo.id))
          : null
        if (!photo || !object) {
          return new Response("Not found", { status: 404 })
        }
        return new Response(object.body, {
          headers: {
            "Content-Type": photo.mediaType,
            "Content-Length": String(object.size),
            "Cache-Control": "private, max-age=3600",
            "X-Content-Type-Options": "nosniff"
          }
        })
      }
    }
  }
})
