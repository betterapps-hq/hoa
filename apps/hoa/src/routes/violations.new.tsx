import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { ReportViolationPage } from "@/features/violations/ReportViolationPage/ReportViolationPage"
import { getReportOptions, reportViolation, uploadViolationPhoto } from "@/features/violations/violations.functions"
import { attempt } from "@/lib/attempt"

export const Route = createFileRoute("/violations/new")({
  staticData: { title: "Report a violation" },
  loader: () => getReportOptions(),
  component: ReportViolationRoute
})

function ReportViolationRoute() {
  const { today, units, rules } = Route.useLoaderData()
  const navigate = useNavigate()
  return (
    <ReportViolationPage
      today={today}
      units={units}
      rules={rules}
      onReport={async (report, photos) => {
        const { id } = await reportViolation({ data: report })
        // It's reported; a photo that fails says so, and can be added again from the violation's page.
        for (const photo of photos) {
          const form = new FormData()
          form.set("violationId", id)
          form.set("file", photo)
          await attempt(() => uploadViolationPhoto({ data: form })).catch(() => undefined)
        }
        // The violation takes this page's place, so going back doesn't report it again.
        await navigate({ to: "/violations/$violationId", params: { violationId: id }, replace: true })
      }}
      onBack={() => void navigate({ to: "/violations" })}
    />
  )
}
