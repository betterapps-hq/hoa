import { createFileRoute, useRouter } from "@tanstack/react-router"
import { ViolationPage } from "@/features/violations/ViolationPage/ViolationPage"
import {
  getViolationView,
  imposeSanction,
  recordViolationStep,
  respondToViolation,
  sendViolationNotice,
  stateViolationFact,
  uploadViolationPhoto
} from "@/features/violations/violations.functions"

export const Route = createFileRoute("/violations/$violationId")({
  staticData: { title: "Violation" },
  loader: ({ params }) => getViolationView({ data: { violationId: params.violationId } }),
  component: ViolationRoute
})

function ViolationRoute() {
  const view = Route.useLoaderData()
  const router = useRouter()
  const violationId = view.violation.id
  return (
    <ViolationPage
      key={violationId}
      view={view}
      onChanged={() => void router.invalidate()}
      onBack={() => void router.navigate({ to: "/violations" })}
      actions={{
        sendNotice: () => sendViolationNotice({ data: { violationId } }),
        recordStep: (step) => recordViolationStep({ data: { violationId, step } }),
        impose: (imposed) => imposeSanction({ data: { violationId, ...imposed } }),
        respond: (kind, note) => respondToViolation({ data: { violationId, kind, note } }),
        stateFact: (property, value) => stateViolationFact({ data: { violationId, property, value } }),
        addPhotos: async (files) => {
          for (const file of files) {
            const form = new FormData()
            form.set("violationId", violationId)
            form.set("file", file)
            await uploadViolationPhoto({ data: form })
          }
        }
      }}
    />
  )
}
