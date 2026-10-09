import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import {
  completeApplicationUpload,
  createApplication,
  createApplicationUpload,
  listApplications,
  runReview,
  uploadApplicationFile
} from "@/features/applications/applications.functions"
import { ApplicationsPage } from "@/features/applications/ApplicationsPage/ApplicationsPage"
import { uploadApplicationFiles } from "@/features/applications/uploadApplicationFiles"
import { listActiveProjectTypes } from "@/features/projectTypes/projectTypes.functions"
import { useRole } from "@/features/role/RoleProvider"

export const Route = createFileRoute("/applications/")({
  staticData: { title: "Applications" },
  head: () => ({ meta: [{ title: "Applications | HOA design review" }] }),
  loader: async () => {
    const [applications, projectTypes] = await Promise.all([listApplications(), listActiveProjectTypes()])
    return { applications, projectTypes }
  },
  component: ApplicationsRoute
})

function ApplicationsRoute() {
  const { applications, projectTypes } = Route.useLoaderData()
  const navigate = useNavigate()
  const { role } = useRole()
  const open = (applicationId: string) =>
    void navigate({ to: "/applications/$applicationId", params: { applicationId } })
  return (
    <ApplicationsPage
      applications={applications}
      projectTypes={projectTypes}
      isCommittee={role.id === "administrator"}
      onCreate={async ({ files, purposes, ...input }) => {
        const application = await createApplication({ data: input })
        // Once the application exists, its page is where the homeowner retries a failed upload or review.
        try {
          await uploadApplicationFiles(
            {
              createUpload: (upload) => createApplicationUpload({ data: upload }),
              uploadThroughServer: (form) => uploadApplicationFile({ data: form }),
              completeUpload: (fileId) => completeApplicationUpload({ data: { fileId } })
            },
            application.id,
            files,
            purposes
          )
          await runReview({ data: { applicationId: application.id } })
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "The packet didn't upload. Try again here.")
        }
        open(application.id)
      }}
      onOpen={open}
    />
  )
}
