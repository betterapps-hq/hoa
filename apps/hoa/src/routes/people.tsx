import { createFileRoute, useRouter } from "@tanstack/react-router"
import {
  addToCommittee,
  addToUnit,
  dissolveCommittee,
  getPeopleRoll,
  invitePerson,
  leaveCommittee,
  leaveUnit,
  recordSale,
  removeFromRoll,
  removeUnitFromRoll,
  saveCommittee,
  savePerson,
  saveUnit
} from "@/features/people/people.functions"
import { PeoplePage } from "@/features/people/PeoplePage/PeoplePage"

export const Route = createFileRoute("/people")({
  staticData: { title: "People" },
  head: () => ({ meta: [{ title: "People" }] }),
  loader: () => getPeopleRoll(),
  component: PeopleRoute
})

function PeopleRoute() {
  const roll = Route.useLoaderData()
  const router = useRouter()
  /** Runs a change, then reloads the roll. */
  const change =
    <A extends unknown[], R>(run: (...args: A) => Promise<R>) =>
    async (...args: A) => {
      const result = await run(...args)
      await router.invalidate()
      return result
    }
  return (
    <PeoplePage
      roll={roll}
      actions={{
        savePerson: change((id, person) => savePerson({ data: { id, person } })),
        removePerson: change((id) => removeFromRoll({ data: { id } })),
        invite: change((id) => invitePerson({ data: { id } })),
        saveUnit: change(async (id, unit) => {
          await saveUnit({ data: { id, unit } })
        }),
        removeUnit: change((id) => removeUnitFromRoll({ data: { id } })),
        addToUnit: change((link) => addToUnit({ data: link })),
        leaveUnit: change((id, endedOn) => leaveUnit({ data: { id, endedOn } })),
        recordSale: change((unitId, buyerId, soldOn) => recordSale({ data: { unitId, buyerId, soldOn } })),
        saveCommittee: change(async (id, committee) => {
          await saveCommittee({ data: { id, committee } })
        }),
        dissolveCommittee: change((id) => dissolveCommittee({ data: { id } })),
        addToCommittee: change((member) => addToCommittee({ data: member })),
        leaveCommittee: change((id, endedOn) => leaveCommittee({ data: { id, endedOn } }))
      }}
    />
  )
}
