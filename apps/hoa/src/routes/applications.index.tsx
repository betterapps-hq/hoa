import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { listApplications } from "@/features/applications/applications.functions"
import { ApplicationsPage } from "@/features/applications/ApplicationsPage/ApplicationsPage"
import { useRole } from "@/features/role/RoleProvider"

export const Route = createFileRoute("/applications/")({
  staticData: { title: "Applications" },
  loader: () => listApplications(),
  component: ApplicationsRoute
})

function ApplicationsRoute() {
  const applications = Route.useLoaderData()
  const navigate = useNavigate()
  const { doesWorkOf } = useRole()
  return (
    <ApplicationsPage
      applications={applications}
      isCommittee={doesWorkOf("architectural")}
      onOpen={(applicationId) => void navigate({ to: "/applications/$applicationId", params: { applicationId } })}
    />
  )
}
