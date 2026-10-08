import { createFileRoute } from "@tanstack/react-router"
import { Dashboard } from "@/features/dashboard/Dashboard/Dashboard"
import { runModelCheck } from "@/features/modelCheck/runModelCheck"
import { useRole } from "@/features/role/RoleProvider"
import { getRulebook } from "@/features/rulebook/rulebook.functions"

export const Route = createFileRoute("/")({
  staticData: { title: "Dashboard" },
  loader: () => getRulebook(),
  component: DashboardRoute
})

function DashboardRoute() {
  const rulebook = Route.useLoaderData()
  const { role } = useRole()
  return <Dashboard roleId={role.id} rulebook={rulebook} onModelCheck={() => runModelCheck()} />
}
