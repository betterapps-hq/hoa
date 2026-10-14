import { createFileRoute, useRouter } from "@tanstack/react-router"
import {
  addCharge,
  getUnitLedgerView,
  giveCredit,
  recordPayment,
  reverseLedgerEntry
} from "@/features/ledger/ledger.functions"
import { UnitLedgerPage } from "@/features/ledger/UnitLedgerPage/UnitLedgerPage"

export const Route = createFileRoute("/ledger/$unitId")({
  staticData: { title: "Ledger" },
  loader: ({ params }) => getUnitLedgerView({ data: { unitId: params.unitId } }),
  component: UnitLedgerRoute
})

function UnitLedgerRoute() {
  const view = Route.useLoaderData()
  const router = useRouter()
  const unitId = view.unit.id
  return (
    <UnitLedgerPage
      key={unitId}
      view={view}
      onChanged={() => void router.invalidate()}
      onBack={() => void router.navigate({ to: "/ledger" })}
      actions={{
        recordPayment: (payment) => recordPayment({ data: { unitId, ...payment } }),
        addCharge: (charge) => addCharge({ data: { unitId, ...charge } }),
        giveCredit: (credit) => giveCredit({ data: { unitId, ...credit } }),
        reverse: (entryId, reason) => reverseLedgerEntry({ data: { unitId, entryId, reason } })
      }}
    />
  )
}
