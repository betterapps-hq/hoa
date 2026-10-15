import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { listViolations } from "@/features/violations/violations.functions"
import { ViolationsPage } from "@/features/violations/ViolationsPage/ViolationsPage"

export const Route = createFileRoute("/violations/")({
  staticData: { title: "Violations" },
  loader: () => listViolations(),
  component: ViolationsRoute
})

function ViolationsRoute() {
  const { items, canReport, hasRulebook } = Route.useLoaderData()
  const navigate = useNavigate()
  return (
    <ViolationsPage
      violations={items}
      canReport={canReport}
      hasRulebook={hasRulebook}
      onOpen={(violationId) => void navigate({ to: "/violations/$violationId", params: { violationId } })}
    />
  )
}
