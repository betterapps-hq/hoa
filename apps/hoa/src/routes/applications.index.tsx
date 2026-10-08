import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { createApplication, listApplications } from "@/features/applications/applications.functions"
import { ApplicationsPage } from "@/features/applications/ApplicationsPage/ApplicationsPage"
import { useRole } from "@/features/role/RoleProvider"

export const Route = createFileRoute("/applications/")({
  staticData: { title: "Applications" },
  head: () => ({ meta: [{ title: "Applications | HOA design review" }] }),
  loader: () => listApplications(),
  component: ApplicationsRoute
})

function ApplicationsRoute() {
  const applications = Route.useLoaderData()
  const navigate = useNavigate()
  const { role } = useRole()
  const open = (applicationId: string) =>
    void navigate({ to: "/applications/$applicationId", params: { applicationId } })
  return (
    <ApplicationsPage
      applications={applications}
      isCommittee={role.id === "administrator"}
      onCreate={async (input) => {
        const application = await createApplication({ data: input })
        open(application.id)
      }}
      onOpen={open}
    />
  )
}
