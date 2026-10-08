import { createFileRoute } from "@tanstack/react-router"
import { reviewProject } from "@/features/review/review.functions"
import { SubmitProjectPage } from "@/features/review/SubmitProjectPage/SubmitProjectPage"
import { getRulebook } from "@/features/rulebook/rulebook.functions"

export const Route = createFileRoute("/submit")({
  staticData: { title: "Submit a project" },
  head: () => ({ meta: [{ title: "Submit a project | HOA design review" }] }),
  loader: () => getRulebook(),
  component: SubmitRoute
})

function SubmitRoute() {
  const rulebook = Route.useLoaderData()
  return (
    <div className="px-4 lg:px-6">
      <SubmitProjectPage hoaName={rulebook?.hoaName} onSubmit={(formData) => reviewProject({ data: formData })} />
    </div>
  )
}
