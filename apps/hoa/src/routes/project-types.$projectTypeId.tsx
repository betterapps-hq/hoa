import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router"
import { ProjectTypePage } from "@/features/projectTypes/ProjectTypePage/ProjectTypePage"
import {
  deleteProjectType,
  getProjectTypeView,
  refreshProjectType,
  setProjectTypeStatus,
  updateProjectType
} from "@/features/projectTypes/projectTypes.functions"

export const Route = createFileRoute("/project-types/$projectTypeId")({
  staticData: { title: "Project type" },
  head: () => ({ meta: [{ title: "Project type | HOA design review" }] }),
  loader: ({ params }) => getProjectTypeView({ data: { projectTypeId: params.projectTypeId } }),
  component: ProjectTypeRoute
})

function ProjectTypeRoute() {
  const view = Route.useLoaderData()
  const router = useRouter()
  const navigate = useNavigate()
  const id = view.projectType.id
  return (
    <ProjectTypePage
      view={view}
      onSave={async (changes) => {
        await updateProjectType({ data: { id, ...changes } })
        await router.invalidate()
      }}
      onRefresh={async () => {
        await refreshProjectType({ data: { id } })
        await router.invalidate()
      }}
      onSetStatus={async (status) => {
        await setProjectTypeStatus({ data: { id, status } })
        await router.invalidate()
      }}
      onDelete={async () => {
        await deleteProjectType({ data: { id } })
        await navigate({ to: "/project-types" })
      }}
    />
  )
}
