import { createFileRoute, useRouter } from "@tanstack/react-router"
import {
  completeDocumentUpload,
  createDocumentUpload,
  getActiveJob,
  getJobStatus,
  listDocuments,
  uploadDocumentFile
} from "@/features/documents/documents.functions"
import { DocumentsPage } from "@/features/documents/DocumentsPage/DocumentsPage"
import { uploadDocument } from "@/features/documents/uploadDocument"

export const Route = createFileRoute("/documents")({
  staticData: { title: "Documents" },
  loader: async () => {
    const documents = await listDocuments()
    const processing = documents.filter((document) => document.status === "processing")
    const jobs = await Promise.all(
      processing.map(
        async (document) => [document.id, (await getActiveJob({ data: { subjectId: document.id } }))?.id] as const
      )
    )
    return {
      documents,
      jobs: Object.fromEntries(jobs.flatMap(([documentId, jobId]) => (jobId ? [[documentId, jobId]] : [])))
    }
  },
  component: DocumentsRoute
})

function DocumentsRoute() {
  const { documents, jobs } = Route.useLoaderData()
  const router = useRouter()
  return (
    <DocumentsPage
      documents={documents}
      jobs={jobs}
      onUpload={(file, details) =>
        uploadDocument(
          {
            createUpload: (input) => createDocumentUpload({ data: input }),
            uploadThroughServer: (form) => uploadDocumentFile({ data: form }),
            completeUpload: (documentId) => completeDocumentUpload({ data: { documentId } })
          },
          file,
          details
        )
      }
      loadJob={(jobId) => getJobStatus({ data: { jobId } })}
      onChanged={() => void router.invalidate()}
    />
  )
}
