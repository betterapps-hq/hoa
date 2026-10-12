import { createFileRoute } from "@tanstack/react-router"
import { CommitteeDashboard } from "@/features/dashboard/CommitteeDashboard/CommitteeDashboard"
import { getNextRulebook, listDashboardApplications } from "@/features/dashboard/dashboard.functions"
import { HomeownerDashboard } from "@/features/dashboard/HomeownerDashboard/HomeownerDashboard"
import { countOutdatedProjectTypes } from "@/features/projectTypes/projectTypes.functions"
import { useRole } from "@/features/role/RoleProvider"
import { getDashboardSummary } from "@/features/rulebook/rulebook.functions"

export const Route = createFileRoute("/")({
  staticData: { title: "Dashboard" },
  loader: async () => {
    const asOf = new Date().toISOString()
    const [summary, nextRulebook, applications, projectTypesToUpdate] = await Promise.all([
      getDashboardSummary(),
      getNextRulebook(),
      listDashboardApplications(),
      countOutdatedProjectTypes()
    ])
    return { summary, nextRulebook, applications, projectTypesToUpdate, asOf }
  },
  component: DashboardRoute
})

function DashboardRoute() {
  const { summary, nextRulebook, applications, projectTypesToUpdate, asOf } = Route.useLoaderData()
  const { role } = useRole()
  return role.id === "administrator" ? (
    <CommitteeDashboard
      summary={summary}
      nextRulebook={nextRulebook}
      applications={applications}
      projectTypesToUpdate={projectTypesToUpdate}
      asOf={asOf}
    />
  ) : (
    <HomeownerDashboard summary={summary} applications={applications} asOf={asOf} />
  )
}
