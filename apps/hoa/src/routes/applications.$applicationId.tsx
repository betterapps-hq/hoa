import { createFileRoute, useRouter } from "@tanstack/react-router"
import { ApplicationPage } from "@/features/applications/ApplicationPage/ApplicationPage"
import {
  completeApplicationUpload,
  createApplicationUpload,
  deleteApplicationDraft,
  getApplicationView,
  getPacketImage,
  recordDecision,
  removeApplicationFile,
  runReview,
  saveApplication,
  setApplicationFileUploadedAs,
  submitApplication,
  uploadApplicationFile
} from "@/features/applications/applications.functions"
import { getDocumentPage, getJobStatus } from "@/features/documents/documents.functions"
import { useRole } from "@/features/role/RoleProvider"

export const Route = createFileRoute("/applications/$applicationId")({
  staticData: { title: "Application" },
  head: () => ({ meta: [{ title: "Application | HOA design review" }] }),
  loader: ({ params }) => getApplicationView({ data: { applicationId: params.applicationId } }),
  component: ApplicationRoute
})

function ApplicationRoute() {
  const view = Route.useLoaderData()
  const router = useRouter()
  const { role } = useRole()
  const applicationId = view.application.id
  return (
    <ApplicationPage
      // Another application is another draft: nothing typed into one carries to the next.
      key={applicationId}
      view={view}
      // An administrator reads someone else's application as the committee; their own, as its applicant.
      audience={role.id === "administrator" && !view.isOwner ? "committee" : "homeowner"}
      loadJob={(jobId) => getJobStatus({ data: { jobId } })}
      onChanged={() => void router.invalidate()}
      onBack={() => void router.navigate({ to: "/applications" })}
      source={{
        documents: view.sourceFiles,
        loadPage: (documentId, pageIndex) => getDocumentPage({ data: { documentId, pageIndex } })
      }}
      loadImage={async (fileId) => (await getPacketImage({ data: { applicationId, fileId } })).url}
      actions={{
        save: (content) => saveApplication({ data: { applicationId, ...content } }),
        uploads: {
          createUpload: (input) => createApplicationUpload({ data: input }),
          uploadThroughServer: (form) => uploadApplicationFile({ data: form }),
          completeUpload: (fileId) => completeApplicationUpload({ data: { fileId } })
        },
        setUploadedAs: (fileId, uploadedAs) => setApplicationFileUploadedAs({ data: { fileId, uploadedAs } }),
        removeFile: (fileId) => removeApplicationFile({ data: { fileId } }),
        runReview: async () => {
          await runReview({ data: { applicationId } })
        },
        submit: (confirmOpenRequests) => submitApplication({ data: { applicationId, confirmOpenRequests } }),
        deleteDraft: () => deleteApplicationDraft({ data: { applicationId } }),
        decide: (outcome, note) => recordDecision({ data: { applicationId, outcome, note } })
      }}
    />
  )
}
