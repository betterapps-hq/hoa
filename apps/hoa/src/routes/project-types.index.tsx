import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router"
import { toast } from "sonner"
import {
  createProjectType,
  deleteProjectType,
  getProjectTypesOverview,
  setProjectTypeStatus,
  suggestProjectTypes
} from "@/features/projectTypes/projectTypes.functions"
import { ProjectTypesPage } from "@/features/projectTypes/ProjectTypesPage/ProjectTypesPage"

export const Route = createFileRoute("/project-types/")({
  staticData: { title: "Project types" },
  loader: () => getProjectTypesOverview(),
  component: ProjectTypesRoute
})

function ProjectTypesRoute() {
  const overview = Route.useLoaderData()
  const router = useRouter()
  const navigate = useNavigate()
  return (
    <ProjectTypesPage
      overview={overview}
      onCreate={async (input) => {
        await createProjectType({ data: input })
        await router.invalidate()
      }}
      onSuggest={() => suggestProjectTypes()}
      onOpen={(projectTypeId) => void navigate({ to: "/project-types/$projectTypeId", params: { projectTypeId } })}
      onSetStatus={async (id, status) => {
        await setProjectTypeStatus({ data: { id, status } })
        await router.invalidate()
      }}
      onDelete={async (id) => {
        const label = overview.projectTypes.find((type) => type.id === id)?.label ?? "the project type"
        await deleteProjectType({ data: { id } })
        toast(`Deleted ${label}`)
        await router.invalidate()
      }}
    />
  )
}
