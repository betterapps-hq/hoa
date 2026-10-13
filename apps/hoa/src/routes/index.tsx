import { createFileRoute } from "@tanstack/react-router"
import { CommitteeDashboard } from "@/features/dashboard/CommitteeDashboard/CommitteeDashboard"
import {
  getNextRulebook,
  listDashboardApplications,
  listRecentActivity
} from "@/features/dashboard/dashboard.functions"
import { HomeownerDashboard } from "@/features/dashboard/HomeownerDashboard/HomeownerDashboard"
import { countOutdatedProjectTypes } from "@/features/projectTypes/projectTypes.functions"
import { useRole } from "@/features/role/RoleProvider"
import { getDashboardSummary } from "@/features/rulebook/rulebook.functions"

export const Route = createFileRoute("/")({
  staticData: { title: "Dashboard" },
  loader: async () => {
    const asOf = new Date().toISOString()
    const [summary, nextRulebook, applications, projectTypesToUpdate, activity] = await Promise.all([
      getDashboardSummary(),
      getNextRulebook(),
      listDashboardApplications(),
      countOutdatedProjectTypes(),
      listRecentActivity()
    ])
    return { summary, nextRulebook, applications, projectTypesToUpdate, activity, asOf }
  },
  component: DashboardRoute
})

function DashboardRoute() {
  const { summary, nextRulebook, applications, projectTypesToUpdate, activity, asOf } = Route.useLoaderData()
  const { role } = useRole()
  return role.id === "administrator" ? (
    <CommitteeDashboard
      summary={summary}
      nextRulebook={nextRulebook}
      applications={applications}
      projectTypesToUpdate={projectTypesToUpdate}
      activity={activity}
      asOf={asOf}
    />
  ) : (
    <HomeownerDashboard summary={summary} applications={applications} activity={activity} asOf={asOf} />
  )
}
