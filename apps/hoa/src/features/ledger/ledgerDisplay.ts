import { money } from "@/lib/money"

// How the ledger reads on screen.

/** A balance as people read it: what's owed, or a credit. */
export const balanceText = (cents: number) => (cents < 0 ? `${money(-cents)} credit` : money(cents))
