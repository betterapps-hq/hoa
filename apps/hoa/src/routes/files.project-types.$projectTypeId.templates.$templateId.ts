import { createFileRoute } from "@tanstack/react-router"
import { getDb } from "@/db/client.server"
import { getProjectType } from "@/db/projectTypeRepository"
import { contentDisposition } from "@/features/documents/documentFile"
import { getRequestContext } from "@/session/requestContext.server"
import { projectTypeKeys } from "@/storage/keys"
import { getBucket } from "@/storage/storage.server"

/**
 * A template one of a project type's documents gives homeowners to fill in (application-review.md, Project types),
 * saved under its original name. Anyone in the organization may read it; it's looked up in the requester's
 * organization only, and only while the type's form still gives it.
 */
export const Route = createFileRoute("/files/project-types/$projectTypeId/templates/$templateId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const context = await getRequestContext()
        const type = await getProjectType(getDb(), context.hoa.id, params.projectTypeId)
        const template = type?.definition.documents.find(
          (document) => document.template?.id === params.templateId
        )?.template
        const object =
          type && template
            ? await getBucket().get(projectTypeKeys(context.hoa.id, type.id).template(template.id, template.fileName))
            : null
        if (!template || !object) {
          return new Response("Not found", { status: 404 })
        }
        return new Response(object.body, {
          headers: {
            "Content-Type": template.mediaType,
            "Content-Disposition": contentDisposition("attachment", template.fileName),
            "Content-Length": String(object.size),
            "Cache-Control": "private, max-age=300",
            "X-Content-Type-Options": "nosniff"
          }
        })
      }
    }
  }
})
