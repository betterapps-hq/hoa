import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { listLedgers } from "@/features/ledger/ledger.functions"
import { LedgerPage } from "@/features/ledger/LedgerPage/LedgerPage"

export const Route = createFileRoute("/ledger/")({
  staticData: { title: "Ledger" },
  loader: () => listLedgers(),
  component: LedgerRoute
})

function LedgerRoute() {
  const { units, canManage } = Route.useLoaderData()
  const navigate = useNavigate()
  return (
    <LedgerPage
      units={units}
      canManage={canManage}
      onOpen={(unitId) => void navigate({ to: "/ledger/$unitId", params: { unitId } })}
    />
  )
}
