import { createFileRoute, useRouter } from "@tanstack/react-router"
import { ApplicationPage } from "@/features/applications/ApplicationPage/ApplicationPage"
import {
  completeApplicationUpload,
  createApplicationUpload,
  getApplicationView,
  getPacketImage,
  recordDecision,
  removeApplicationFile,
  runReview,
  submitApplication,
  uploadApplicationFile
} from "@/features/applications/applications.functions"
import { uploadApplicationFiles } from "@/features/applications/uploadApplicationFiles"
import { getDocumentPage, getJobStatus } from "@/features/documents/documents.functions"

export const Route = createFileRoute("/applications/$applicationId")({
  staticData: { title: "Application" },
  head: () => ({ meta: [{ title: "Application | HOA design review" }] }),
  loader: ({ params }) => getApplicationView({ data: { applicationId: params.applicationId } }),
  component: ApplicationRoute
})

function ApplicationRoute() {
  const view = Route.useLoaderData()
  const router = useRouter()
  const applicationId = view.application.id
  return (
    <ApplicationPage
      view={view}
      loadJob={(jobId) => getJobStatus({ data: { jobId } })}
      onChanged={() => void router.invalidate()}
      source={{
        documents: view.sourceFiles,
        loadPage: (documentId, pageIndex) => getDocumentPage({ data: { documentId, pageIndex } })
      }}
      loadImage={async (fileId) => (await getPacketImage({ data: { applicationId, fileId } })).url}
      actions={{
        upload: (files) =>
          uploadApplicationFiles(
            {
              createUpload: (input) => createApplicationUpload({ data: input }),
              uploadThroughServer: (form) => uploadApplicationFile({ data: form }),
              completeUpload: (fileId) => completeApplicationUpload({ data: { fileId } })
            },
            applicationId,
            files
          ),
        removeFile: (fileId) => removeApplicationFile({ data: { fileId } }),
        runReview: async () => {
          await runReview({ data: { applicationId } })
        },
        submit: (confirmOpenRequests) => submitApplication({ data: { applicationId, confirmOpenRequests } }),
        decide: (outcome, note) => recordDecision({ data: { applicationId, outcome, note } })
      }}
    />
  )
}
