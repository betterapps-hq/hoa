import { createFileRoute, useRouter } from "@tanstack/react-router"
import { authClient } from "@/auth/authClient"
import { throwIfFailed } from "@/auth/authErrors"
import { resignSeat } from "@/features/account/account.functions"
import {
  addToCommittee,
  addToUnit,
  dissolveCommittee,
  editSeat,
  getPeopleRoll,
  cancelInvite,
  invitePerson,
  leaveCommittee,
  leaveUnit,
  recordSale,
  removeFromRoll,
  removeUnitFromRoll,
  saveCommittee,
  savePerson,
  saveUnit,
  startNewTerm
} from "@/features/people/people.functions"
import { PeoplePage } from "@/features/people/PeoplePage/PeoplePage"
import { useRole } from "@/features/role/RoleProvider"

export const Route = createFileRoute("/people")({
  staticData: { title: "People" },
  loader: () => getPeopleRoll(),
  component: PeopleRoute
})

function PeopleRoute() {
  const roll = Route.useLoaderData()
  const { role } = useRole()
  const { session } = Route.useRouteContext()
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
      isAdministrator={role.id === "administrator"}
      viewerId={session.status === "member" ? session.personId : null}
      actions={{
        savePerson: change((id, person) => savePerson({ data: { id, person } })),
        removePerson: change((id) => removeFromRoll({ data: { id } })),
        invite: change((id, access) => invitePerson({ data: { id, access } })),
        cancelInvite: change((id) => cancelInvite({ data: { id } })),
        saveUnit: change((id, unit) => saveUnit({ data: { id, unit } })),
        removeUnit: change((id) => removeUnitFromRoll({ data: { id } })),
        addToUnit: change((link) => addToUnit({ data: link })),
        leaveUnit: change((id, endedOn) => leaveUnit({ data: { id, endedOn } })),
        recordSale: change((unitId, buyerId, soldOn) => recordSale({ data: { unitId, buyerId, soldOn } })),
        saveCommittee: change(async (id, committee) => {
          await saveCommittee({ data: { id, committee } })
        }),
        dissolveCommittee: change((id) => dissolveCommittee({ data: { id } })),
        addToCommittee: change((member) => addToCommittee({ data: member })),
        editSeat: change((id, seat) => editSeat({ data: { id, seat } })),
        startNewTerm: change((id, seat) => startNewTerm({ data: { id, seat } })),
        leaveCommittee: change((id, endedOn) => leaveCommittee({ data: { id, endedOn } })),
        resign: async (id, endedOn, isLeavingPage) => {
          await resignSeat({ data: { id, endedOn } })
          // Off the page first, so reloading doesn't ask for a roll they can no longer read.
          if (isLeavingPage) {
            await router.navigate({ to: "/" })
          }
          await router.invalidate()
        },
        viewAs:
          session.status === "member" && session.isOperator
            ? async (userId) => {
                throwIfFailed(await authClient.admin.impersonateUser({ userId }))
                // A full load, so the whole app is theirs.
                window.location.assign("/")
              }
            : null
      }}
    />
  )
}
