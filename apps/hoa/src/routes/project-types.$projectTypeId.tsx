import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router"
import { toast } from "sonner"
import { ProjectTypePage } from "@/features/projectTypes/ProjectTypePage/ProjectTypePage"
import {
  deleteProjectType,
  getProjectTypeView,
  listCitableProvisions,
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
        // The editor keeps the questions as edited; only a new name or description needs the page reloaded.
        if (changes.label !== view.projectType.label || changes.description !== (view.projectType.description ?? "")) {
          await router.invalidate()
        }
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
        toast(`Deleted ${view.projectType.label}`)
        await navigate({ to: "/project-types" })
      }}
      loadProvisions={() => listCitableProvisions()}
    />
  )
}
