import { createFileRoute } from "@tanstack/react-router"
import { loadRulebookRoute, RulebookRoute } from "@/features/rulebook/RulebookRoute/RulebookRoute"

/** The rulebook and the governing documents it's built from, for everyone; administrators build and publish here. */
export const Route = createFileRoute("/rules")({
  staticData: { title: "Rulebook" },
  loader: () => loadRulebookRoute(),
  component: RulesRoute
})

function RulesRoute() {
  return <RulebookRoute data={Route.useLoaderData()} isReviewing={false} />
}
