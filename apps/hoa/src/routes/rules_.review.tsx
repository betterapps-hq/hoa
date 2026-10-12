import { createFileRoute, redirect } from "@tanstack/react-router"
import { loadRulebookRoute, RulebookRoute } from "@/features/rulebook/RulebookRoute/RulebookRoute"

/** Reviewing the draft rulebook, for administrators; with no draft to review, the rulebook page instead. */
export const Route = createFileRoute("/rules_/review")({
  staticData: { title: "Review the rulebook" },
  loader: async () => {
    const data = await loadRulebookRoute()
    if (!data.isAdministrator || data.draft.content === null) {
      throw redirect({ to: "/rules", replace: true })
    }
    return data
  },
  component: ReviewRoute
})

function ReviewRoute() {
  return <RulebookRoute data={Route.useLoaderData()} isReviewing />
}
