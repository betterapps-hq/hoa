import { createFileRoute } from "@tanstack/react-router"
import { reviewProject } from "@/features/review/review.functions"
import { SubmitProjectPage } from "@/features/review/SubmitProjectPage/SubmitProjectPage"
import { getDashboardSummary } from "@/features/rulebook/rulebook.functions"

export const Route = createFileRoute("/submit")({
  staticData: { title: "Submit a project" },
  head: () => ({ meta: [{ title: "Submit a project | HOA design review" }] }),
  loader: () => getDashboardSummary(),
  component: SubmitRoute
})

function SubmitRoute() {
  const summary = Route.useLoaderData()
  return (
    <div className="px-4 lg:px-6">
      <SubmitProjectPage hoaName={summary.hoaName} onSubmit={(formData) => reviewProject({ data: formData })} />
    </div>
  )
}
