import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router"
import {
  createProjectType,
  getProjectTypesOverview,
  suggestProjectTypes
} from "@/features/projectTypes/projectTypes.functions"
import { ProjectTypesPage } from "@/features/projectTypes/ProjectTypesPage/ProjectTypesPage"

export const Route = createFileRoute("/project-types/")({
  staticData: { title: "Project types" },
  head: () => ({ meta: [{ title: "Project types | HOA design review" }] }),
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
    />
  )
}
