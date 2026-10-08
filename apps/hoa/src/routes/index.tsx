import { createFileRoute } from "@tanstack/react-router"
import { Dashboard } from "@/features/dashboard/Dashboard/Dashboard"
import { runModelCheck } from "@/features/modelCheck/runModelCheck"
import { useRole } from "@/features/role/RoleProvider"
import { getDashboardSummary } from "@/features/rulebook/rulebook.functions"

export const Route = createFileRoute("/")({
  staticData: { title: "Dashboard" },
  loader: () => getDashboardSummary(),
  component: DashboardRoute
})

function DashboardRoute() {
  const summary = Route.useLoaderData()
  const { role } = useRole()
  return <Dashboard roleId={role.id} summary={summary} onModelCheck={() => runModelCheck()} />
}
