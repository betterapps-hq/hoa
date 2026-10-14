import { createFileRoute, useRouter } from "@tanstack/react-router"
import { createSchedule, endDuesSchedule, getDues } from "@/features/dues/dues.functions"
import { DuesPage } from "@/features/dues/DuesPage/DuesPage"

export const Route = createFileRoute("/dues")({
  staticData: { title: "Dues" },
  loader: () => getDues(),
  component: DuesRoute
})

function DuesRoute() {
  const { today, schedules, units } = Route.useLoaderData()
  const router = useRouter()
  return (
    <DuesPage
      today={today}
      schedules={schedules}
      units={units}
      onChanged={() => void router.invalidate()}
      actions={{
        create: (schedule) => createSchedule({ data: schedule }),
        end: (scheduleId) => endDuesSchedule({ data: { scheduleId } })
      }}
    />
  )
}
