import { createFileRoute } from "@tanstack/react-router"
import { organizationLogoKey } from "@/storage/keys"
import { getBucket } from "@/storage/storage.server"

/**
 * An association's logo. It's public, as a logo is, and its address changes with each image (`?v=`), so browsers keep
 * it as long as they like. Only images an administrator uploaded are here (settings.functions.ts, `uploadLogo`).
 */
export const Route = createFileRoute("/files/organizations/$organizationId/logo")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const object = await getBucket().get(organizationLogoKey(params.organizationId))
        if (!object) {
          return new Response("Not found", { status: 404 })
        }
        return new Response(object.body, {
          headers: {
            "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
            "Content-Length": String(object.size),
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff"
          }
        })
      }
    }
  }
})
