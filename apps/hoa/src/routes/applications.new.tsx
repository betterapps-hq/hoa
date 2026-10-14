import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { createApplication } from "@/features/applications/applications.functions"
import { StartApplicationPage } from "@/features/applications/StartApplicationPage/StartApplicationPage"
import { listActiveProjectTypes } from "@/features/projectTypes/projectTypes.functions"

export const Route = createFileRoute("/applications/new")({
  staticData: { title: "Start an application" },
  loader: () => listActiveProjectTypes(),
  component: StartApplicationRoute
})

function StartApplicationRoute() {
  const projectTypes = Route.useLoaderData()
  const navigate = useNavigate()
  return (
    <StartApplicationPage
      projectTypes={projectTypes}
      onStart={async (projectTypeId) => {
        const application = await createApplication({ data: { projectTypeId } })
        // The draft takes this page's place, so going back doesn't start another.
        await navigate({ to: "/applications/$applicationId", params: { applicationId: application.id }, replace: true })
      }}
      onBack={() => void navigate({ to: "/applications" })}
    />
  )
}
