import { createFileRoute } from "@tanstack/react-router"
import { CommitteeDashboard } from "@/features/dashboard/CommitteeDashboard/CommitteeDashboard"
import { getNextRulebook } from "@/features/dashboard/dashboard.functions"
import { loadDemoDashboards } from "@/features/dashboard/demoData"
import { HomeownerDashboard } from "@/features/dashboard/HomeownerDashboard/HomeownerDashboard"
import { useRole } from "@/features/role/RoleProvider"
import { getDashboardSummary } from "@/features/rulebook/rulebook.functions"

export const Route = createFileRoute("/")({
  staticData: { title: "Dashboard" },
  loader: async () => {
    const asOf = new Date()
    // The rulebook's state is real; applications, meetings and activity are demo data until their queries exist.
    const [summary, nextRulebook] = await Promise.all([getDashboardSummary(), getNextRulebook()])
    return { summary, nextRulebook, asOf: asOf.toISOString(), ...loadDemoDashboards(asOf) }
  },
  component: DashboardRoute
})

function DashboardRoute() {
  const { summary, nextRulebook, asOf, homeowner, committee } = Route.useLoaderData()
  const { role } = useRole()
  return role.id === "administrator" ? (
    <CommitteeDashboard summary={summary} nextRulebook={nextRulebook} data={committee} asOf={asOf} />
  ) : (
    <HomeownerDashboard summary={summary} data={homeowner} asOf={asOf} />
  )
}
