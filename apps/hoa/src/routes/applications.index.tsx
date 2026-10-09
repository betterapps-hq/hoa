import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import {
  completeApplicationUpload,
  createApplication,
  createApplicationUpload,
  listApplications,
  listProjectKinds,
  runReview,
  uploadApplicationFile
} from "@/features/applications/applications.functions"
import { ApplicationsPage } from "@/features/applications/ApplicationsPage/ApplicationsPage"
import { uploadApplicationFiles } from "@/features/applications/uploadApplicationFiles"
import { useRole } from "@/features/role/RoleProvider"

export const Route = createFileRoute("/applications/")({
  staticData: { title: "Applications" },
  head: () => ({ meta: [{ title: "Applications | HOA design review" }] }),
  loader: async () => {
    const [applications, projectKinds] = await Promise.all([listApplications(), listProjectKinds()])
    return { applications, projectKinds }
  },
  component: ApplicationsRoute
})

function ApplicationsRoute() {
  const { applications, projectKinds } = Route.useLoaderData()
  const navigate = useNavigate()
  const { role } = useRole()
  const open = (applicationId: string) =>
    void navigate({ to: "/applications/$applicationId", params: { applicationId } })
  return (
    <ApplicationsPage
      applications={applications}
      projectKinds={projectKinds}
      isCommittee={role.id === "administrator"}
      onCreate={async ({ files, ...input }) => {
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
            files
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
