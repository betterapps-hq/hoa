import { createFileRoute } from "@tanstack/react-router"
import {
  getDashboardOverview,
  getNextRulebook,
  listDashboardApplications,
  listRecentActivity
} from "@/features/dashboard/dashboard.functions"
import { HomeownerDashboard } from "@/features/dashboard/HomeownerDashboard/HomeownerDashboard"
import { ManagementDashboard } from "@/features/dashboard/ManagementDashboard/ManagementDashboard"
import { countOutdatedProjectTypes } from "@/features/projectTypes/projectTypes.functions"
import { useRole } from "@/features/role/RoleProvider"
import { getDashboardSummary } from "@/features/rulebook/rulebook.functions"

export const Route = createFileRoute("/")({
  staticData: { title: "Dashboard" },
  loader: async () => {
    const asOf = new Date().toISOString()
    const [summary, nextRulebook, applications, projectTypesToUpdate, activity, overview] = await Promise.all([
      getDashboardSummary(),
      getNextRulebook(),
      listDashboardApplications(),
      countOutdatedProjectTypes(),
      listRecentActivity(),
      getDashboardOverview()
    ])
    return { summary, nextRulebook, applications, projectTypesToUpdate, activity, overview, asOf }
  },
  component: DashboardRoute
})

function DashboardRoute() {
  const { summary, nextRulebook, applications, projectTypesToUpdate, activity, overview, asOf } = Route.useLoaderData()
  const { user } = useRole()
  // The board, and an administrator, run the association; everyone else sees their own home.
  return overview.isBoard ? (
    <ManagementDashboard
      userName={user.name}
      summary={summary}
      nextRulebook={nextRulebook}
      applications={applications}
      projectTypesToUpdate={projectTypesToUpdate}
      overview={overview}
      activity={activity}
      asOf={asOf}
    />
  ) : (
    <HomeownerDashboard
      userName={user.name}
      summary={summary}
      applications={applications}
      overview={overview}
      activity={activity}
      asOf={asOf}
    />
  )
}
