import { createFileRoute } from "@tanstack/react-router"
import { ShieldCheckIcon } from "lucide-react"
import { Notice } from "@/components/Notice"
import { Button } from "@/components/ui/button"
import { useRole } from "@/features/role/RoleProvider"
import { extractRules, getRulebook, publishRulebook } from "@/features/rulebook/rulebook.functions"
import { RulebookPage } from "@/features/rulebook/RulebookPage/RulebookPage"

export const Route = createFileRoute("/rules")({
  staticData: { title: "Rulebook" },
  head: () => ({ meta: [{ title: "Rulebook | HOA design review" }] }),
  loader: () => getRulebook(),
  component: RulesRoute
})

function RulesRoute() {
  const rulebook = Route.useLoaderData()
  const { role, setRole } = useRole()
  return (
    <div className="px-4 lg:px-6">
      {role.id === "administrator" ? (
        <RulebookPage
          rulebook={rulebook}
          onExtract={(formData) => extractRules({ data: formData })}
          onPublish={(input) => publishRulebook({ data: input })}
        />
      ) : (
        <div className="max-w-2xl space-y-4">
          <Notice tone="info">Only HOA administrators can manage the rulebook.</Notice>
          <Button variant="outline" onClick={() => setRole("administrator")}>
            <ShieldCheckIcon />
            Switch to administrator
          </Button>
        </div>
      )}
    </div>
  )
}
